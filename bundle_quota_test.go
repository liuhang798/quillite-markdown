package main

import (
	"encoding/base64"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"testing"
)

// A test-owned sparse file exercises the real 2 GiB policy without allocating
// 2 GiB of physical storage. No production quota or user configuration changes.
func bundleQuotaPadding(t *testing.T, app *App, remaining int64) string {
	t.Helper()
	used, _, err := app.bundleWorkspaceUsage()
	if err != nil {
		t.Fatal(err)
	}
	name := filepath.Join(app.bundleWorkspaceRoot(), "quota-test-padding")
	file, err := os.OpenFile(name, os.O_RDWR|os.O_CREATE|os.O_EXCL, 0o600)
	if err != nil {
		t.Fatal(err)
	}
	defer file.Close()
	bundleQuotaMakeSparse(t, file)
	if err := file.Truncate(bundleWorkspaceBudget - used - remaining); err != nil {
		t.Fatal(err)
	}
	return name
}

func TestBundleImageQuotaRejectsAllInsertionPathsWithoutDeletingRecovery(t *testing.T) {
	app := bundleIntegrationApp(t)
	source, _ := bundleIntegrationFixture(t, "textpack")
	doc := bundleIntegrationRead(t, app, source)
	base := filepath.Join(app.bundleWorkspaceRoot(), doc.BundleSessionID, "base.textpack")
	before, err := os.ReadFile(base)
	if err != nil {
		t.Fatal(err)
	}
	padding := bundleQuotaPadding(t, app, -1)
	png := textPackTestPNG(t)
	image := filepath.Join(textPackTestDirectory(t), "selected.png")
	textPackTestWrite(t, image, png)
	dataURL := "data:image/png;base64," + base64.StdEncoding.EncodeToString(png)
	paths := []func() (string, error){
		func() (string, error) { return app.SavePastedImage(doc.ResourcePath, dataURL) },
		func() (string, error) { return app.ImportImage(doc.ResourcePath, image) },
		// SelectImage delegates to this exact method after its native picker.
		func() (string, error) { return app.importImageToAssets(doc.ResourcePath, image) },
	}
	for _, insert := range paths {
		if _, err := insert(); err == nil || !strings.Contains(err.Error(), "BUNDLE_SESSION_LIMIT") {
			t.Fatalf("over-budget managed image accepted: %v", err)
		}
	}
	assertDocumentBytes(t, base, string(before))
	if _, err := os.Stat(padding); err != nil {
		t.Fatal("quota handling removed old recovery material")
	}
	ordinary := filepath.Join(textPackTestDirectory(t), "ordinary.md")
	textPackTestWrite(t, ordinary, []byte("ordinary"))
	if _, err := app.SavePastedImage(ordinary, dataURL); err != nil {
		t.Fatalf("managed quota changed ordinary image insertion: %v", err)
	}
}

func TestBundleImageQuotaConcurrentInsertsCannotSpendSameCapacity(t *testing.T) {
	app := bundleIntegrationApp(t)
	source, _ := bundleIntegrationFixture(t, "textpack")
	doc := bundleIntegrationRead(t, app, source)
	png := textPackTestPNG(t)
	padding := bundleQuotaPadding(t, app, int64(len(png)))
	dataURL := "data:image/png;base64," + base64.StdEncoding.EncodeToString(png)
	type result struct {
		path string
		err  error
	}
	start := make(chan struct{})
	results := make(chan result, 12)
	var wg sync.WaitGroup
	for i := 0; i < 12; i++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			<-start
			path, err := app.SavePastedImage(doc.ResourcePath, dataURL)
			results <- result{path, err}
		}()
	}
	close(start)
	wg.Wait()
	close(results)
	accepted := ""
	for result := range results {
		if result.err == nil {
			if accepted != "" {
				t.Fatal("two concurrent insertions spent the same free capacity")
			}
			accepted = result.path
		} else if !strings.Contains(result.err.Error(), "BUNDLE_SESSION_LIMIT") {
			t.Fatal(result.err)
		}
	}
	if accepted == "" {
		t.Fatal("exactly fitting image was rejected")
	}
	used, _, err := app.bundleWorkspaceUsage()
	if err != nil || used != bundleWorkspaceBudget {
		t.Fatalf("quota exceeded or capacity accounting wrong: %d %v", used, err)
	}
	// Saving may commit the original package, but must not silently grow the
	// manifest beyond the cap. Keep old manifest and return the existing exact
	// committed-save warning so recovery stays available without cleanup.
	saved, err := app.SaveBundleDocument(source, doc.Content+"\n![new]("+accepted+")", doc.Revision, doc.BundleSessionID)
	if err != nil || saved.Warning != "BUNDLE_SESSION_PERSIST_WARNING" {
		t.Fatalf("full storage did not preserve committed receipt: %+v %v", saved, err)
	}
	if used, _, err := app.bundleWorkspaceUsage(); err != nil || used != bundleWorkspaceBudget {
		t.Fatalf("manifest growth exceeded global quota: %d %v", used, err)
	}
	if _, err := os.Stat(padding); err != nil {
		t.Fatal("concurrent quota handling deleted old recovery material")
	}
}

func TestBundleCleanReopensStillReusePersistentSession(t *testing.T) {
	app := bundleIntegrationApp(t)
	source, _ := bundleIntegrationFixture(t, "textpack")
	doc := bundleIntegrationRead(t, app, source)
	for i := 0; i < 6; i++ {
		if again := bundleIntegrationRead(t, app, source); again.BundleSessionID != doc.BundleSessionID {
			t.Fatal("clean reopen allocated another workspace")
		}
	}
}
