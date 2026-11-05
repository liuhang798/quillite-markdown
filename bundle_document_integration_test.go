package main

import (
	"archive/zip"
	"bytes"
	"encoding/base64"
	"errors"
	"os"
	"path/filepath"
	"reflect"
	"strings"
	"testing"
)

func bundleIntegrationApp(t *testing.T) *App {
	t.Helper()
	root := textPackTestDirectory(t)
	config := filepath.Join(root, "configuration")
	if err := os.Mkdir(config, 0o700); err != nil {
		t.Fatal(err)
	}
	app := NewApp()
	app.preferencesOverride = filepath.Join(config, "preferences.json")
	return app
}

func bundleIntegrationFixture(t *testing.T, kind string) (string, *editableBundleSnapshot) {
	t.Helper()
	root := textPackTestDirectory(t)
	name := filepath.Join(root, "Original."+kind)
	data := editableBundleTestArchive(t, "", true)
	if kind == "textpack" {
		textPackTestWrite(t, name, data)
	} else {
		if err := os.Mkdir(name, 0o700); err != nil {
			t.Fatal(err)
		}
		for _, entry := range editableBundleTestReader(t, data).File {
			name := filepath.Join(name, filepath.FromSlash(entry.Name))
			if entry.Mode().IsDir() {
				if err := os.MkdirAll(name, 0o700); err != nil {
					t.Fatal(err)
				}
			} else {
				textPackTestWrite(t, name, editableBundleTestReadEntry(t, entry, false))
			}
		}
	}
	snapshot, err := readEditableBundle(name)
	if err != nil {
		t.Fatal(err)
	}
	return name, snapshot
}

func bundleIntegrationRead(t *testing.T, app *App, name string) *Document {
	t.Helper()
	doc, err := app.ReadFile(name)
	if err != nil || doc == nil {
		t.Fatalf("direct open %s: %+v %v", name, doc, err)
	}
	if doc.Path != name || doc.BundleSessionID == "" || !validBundleRevision(doc.Revision) || doc.ResourcePath == "" {
		t.Fatalf("not an original-package document: %+v", doc)
	}
	return doc
}

func bundleIntegrationStage(t *testing.T, doc *Document, relative string, data []byte) {
	t.Helper()
	textPackTestWrite(t, filepath.Join(doc.Directory, filepath.FromSlash(relative)), data)
}

// Simulate a third-party editor, not any app overwrite API. All paths and
// contents here are fixtures created by this test under its resolved TempDir.
func bundleIntegrationExternalFile(t *testing.T, name, entryName string, data []byte) {
	t.Helper()
	if strings.EqualFold(filepath.Ext(name), ".textbundle") {
		textPackTestWrite(t, filepath.Join(name, filepath.FromSlash(entryName)), data)
		return
	}
	original, err := os.ReadFile(name)
	if err != nil {
		t.Fatal(err)
	}
	reader := editableBundleTestReader(t, original)
	var output bytes.Buffer
	w := zip.NewWriter(&output)
	if err := w.SetComment(reader.Comment); err != nil {
		t.Fatal(err)
	}
	found := false
	for _, entry := range reader.File {
		if entry.Name != entryName {
			if err := w.Copy(entry); err != nil {
				t.Fatal(err)
			}
			continue
		}
		found = true
		header := entry.FileHeader
		writer, err := w.CreateHeader(&header)
		if err != nil {
			t.Fatal(err)
		}
		if _, err := writer.Write(data); err != nil {
			t.Fatal(err)
		}
	}
	if !found {
		writer, err := w.CreateHeader(&zip.FileHeader{Name: entryName, Method: zip.Store})
		if err != nil {
			t.Fatal(err)
		}
		if _, err := writer.Write(data); err != nil {
			t.Fatal(err)
		}
	}
	if err := w.Close(); err != nil {
		t.Fatal(err)
	}
	textPackTestWrite(t, name, output.Bytes())
}

func bundleIntegrationAssertMetadata(t *testing.T, baseline, saved *editableBundleSnapshot) {
	t.Helper()
	for name, original := range baseline.Files {
		if name != baseline.TextEntry && !bytes.Equal(saved.Files[name], original) {
			t.Fatalf("original metadata/resource lost: %s", name)
		}
	}
	if baseline.archive != nil && saved.archive != nil {
		if baseline.archive.Comment != saved.archive.Comment {
			t.Fatal("archive comment was lost")
		}
		for i, entry := range baseline.archive.File {
			if entry.Name == baseline.TextEntry {
				continue
			}
			if !reflect.DeepEqual(entry.FileHeader, saved.archive.File[i].FileHeader) ||
				!bytes.Equal(editableBundleTestReadEntry(t, entry, true), editableBundleTestReadEntry(t, saved.archive.File[i], true)) {
				t.Fatalf("third-party ZIP metadata/compressed resource changed: %s", entry.Name)
			}
		}
	}
}

func TestBundleIntegrationDirectOpenRetainsOriginalAndResourceContext(t *testing.T) {
	for _, kind := range []string{"textpack", "textbundle"} {
		t.Run(kind, func(t *testing.T) {
			app := bundleIntegrationApp(t)
			name, original := bundleIntegrationFixture(t, kind)
			doc := bundleIntegrationRead(t, app, name)
			if doc.BundleKind != kind || doc.BundleTextPath != original.TextEntry || doc.Content != original.Content || doc.Revision != original.Revision {
				t.Fatalf("wrong package identity/content: %+v", doc)
			}
			if !strings.HasPrefix(doc.ResourcePath, app.bundleWorkspaceRoot()+string(filepath.Separator)) || filepath.Dir(doc.ResourcePath) != doc.Directory {
				t.Fatal("resource context is not the validated durable workspace")
			}
			if doc.PackageDirectory != filepath.Dir(name) || doc.ResourcePath == name {
				t.Fatal("public package path confused with internal Markdown")
			}
			image, err := app.ReadImageData("assets/a.png", doc.Directory)
			if err != nil || !strings.HasPrefix(image, "data:image/png;base64,") {
				t.Fatalf("package image did not use workspace context: %v", err)
			}
			after, err := readEditableBundle(name)
			if err != nil || after.Revision != original.Revision {
				t.Fatal("direct open modified original")
			}
			bundleIntegrationAssertMetadata(t, original, after)
		})
	}
}

func TestBundleIntegrationRepeatedAutosavesPreserveMetadataAndAdvanceRevision(t *testing.T) {
	for _, kind := range []string{"textpack", "textbundle"} {
		t.Run(kind, func(t *testing.T) {
			app := bundleIntegrationApp(t)
			name, original := bundleIntegrationFixture(t, kind)
			doc := bundleIntegrationRead(t, app, name)
			for _, content := range []string{"# Autosave generation one\n", "# Autosave generation two\n"} {
				previousRevision := doc.Revision
				next, err := app.SaveBundleDocument(name, content, doc.Revision, doc.BundleSessionID)
				if err != nil || next == nil {
					t.Fatalf("autosave: %+v %v", next, err)
				}
				if next.Content != content || next.Revision == previousRevision || next.BundleSessionID != doc.BundleSessionID || next.Path != name {
					t.Fatalf("save receipt did not describe submitted generation: %+v", next)
				}
				disk, err := readEditableBundle(name)
				if err != nil || disk.Content != content || disk.Revision != next.Revision {
					t.Fatalf("saved package differs from receipt: %v", err)
				}
				bundleIntegrationAssertMetadata(t, original, disk)
				doc = next
			}
		})
	}
}

func TestBundleIntegrationNewAssetsPersistToOriginalPackage(t *testing.T) {
	for _, kind := range []string{"textpack", "textbundle"} {
		t.Run(kind, func(t *testing.T) {
			app := bundleIntegrationApp(t)
			name, original := bundleIntegrationFixture(t, kind)
			doc := bundleIntegrationRead(t, app, name)
			png := textPackTestPNG(t)
			bundleIntegrationStage(t, doc, "assets/added.png", png)
			content := doc.Content + "\n![New](assets/added.png)\n"
			next, err := app.SaveBundleDocument(name, content, doc.Revision, doc.BundleSessionID)
			if err != nil {
				t.Fatalf("new package asset could not save: %v", err)
			}
			disk, err := readEditableBundle(name)
			if err != nil || !bytes.Equal(disk.Files["assets/added.png"], png) || disk.Content != content {
				t.Fatalf("new asset missing from original package: %v", err)
			}
			bundleIntegrationAssertMetadata(t, original, disk)
			// An asset retained in the workspace must not cause duplicate-entry or
			// overwrite errors on the following automatic save.
			if _, err := app.SaveBundleDocument(name, content+"\nNext edit\n", next.Revision, next.BundleSessionID); err != nil {
				t.Fatalf("second autosave after adding asset failed: %v", err)
			}
		})
	}
}

func TestBundleIntegrationExternalMetadataAndAssetChangesConflict(t *testing.T) {
	for _, kind := range []string{"textpack", "textbundle"} {
		for _, resource := range []string{"info.json", "assets/a.png"} {
			t.Run(kind+"/"+resource, func(t *testing.T) {
				app := bundleIntegrationApp(t)
				name, original := bundleIntegrationFixture(t, kind)
				doc := bundleIntegrationRead(t, app, name)
				changed := append(append([]byte{}, original.Files[resource]...), '\n')
				bundleIntegrationExternalFile(t, name, resource, changed)
				diskBefore, err := readEditableBundle(name)
				if err != nil {
					t.Fatal(err)
				}
				if _, err := app.SaveBundleDocument(name, "must not overwrite", doc.Revision, doc.BundleSessionID); !errors.Is(err, errDocumentConflict) {
					t.Fatalf("external %s change did not conflict: %v", resource, err)
				}
				diskAfter, err := readEditableBundle(name)
				if err != nil || diskAfter.Revision != diskBefore.Revision || !bytes.Equal(diskAfter.Files[resource], changed) {
					t.Fatal("conflict save changed the external version")
				}
			})
		}
	}
}

func TestBundleIntegrationRestartMissingSourceRecoversCompleteCopy(t *testing.T) {
	for _, kind := range []string{"textpack", "textbundle"} {
		t.Run(kind, func(t *testing.T) {
			app := bundleIntegrationApp(t)
			name, original := bundleIntegrationFixture(t, kind)
			doc := bundleIntegrationRead(t, app, name)
			png := textPackTestPNG(t)
			bundleIntegrationStage(t, doc, "assets/pending.png", png)
			draft := doc.Content + "\nUnsaved draft\n![Pending](assets/pending.png)\n"
			if err := app.SaveRecoverySnapshot(RecoverySnapshotInput{BundleKind: kind, BundleSessionID: doc.BundleSessionID,
				Path: name, Name: doc.Name, Directory: doc.Directory, BaseRevision: doc.Revision, Content: draft}); err != nil {
				t.Fatal(err)
			}
			// Simulate an externally moved/deleted source, preserving even this
			// test's original instead of recursively deleting any source tree.
			if err := os.Rename(name, name+"-externally-moved"); err != nil {
				t.Fatal(err)
			}
			restarted := NewApp()
			restarted.preferencesOverride = app.preferencesOverride
			recovery, err := restarted.GetRecoveryBackup()
			if err != nil || recovery == nil || recovery.Content != draft || recovery.BundleSessionID != doc.BundleSessionID || recovery.BundleKind != kind || recovery.BaseRevision != doc.Revision {
				t.Fatalf("recovery lost package identity/draft: %+v %v", recovery, err)
			}
			resumed, err := restarted.ResumeBundleDocument(name, recovery.BundleSessionID, recovery.BaseRevision)
			if err != nil || resumed == nil || !resumed.BundleConflict {
				t.Fatalf("missing source was not safely resumed as conflict: %+v %v", resumed, err)
			}
			if _, err := restarted.SaveBundleDocument(name, draft, resumed.Revision, resumed.BundleSessionID); err == nil {
				t.Fatal("missing original was silently recreated by autosave")
			}
			target := filepath.Join(filepath.Dir(name), "Recovered.textpack")
			copy, err := restarted.saveBundleCopyTo(name, target, recovery.Content, recovery.BundleSessionID)
			if err != nil || copy == nil || copy.Path != target {
				t.Fatalf("complete recovered copy failed: %+v %v", copy, err)
			}
			saved, err := readEditableBundle(target)
			if err != nil || saved.Content != draft || !bytes.Equal(saved.Files["assets/pending.png"], png) {
				t.Fatalf("recovered copy lost draft or pending resource: %v", err)
			}
			bundleIntegrationAssertMetadata(t, original, saved)
			if _, err := os.Stat(name); !os.IsNotExist(err) {
				t.Fatal("copy recovery recreated or overwrote missing original")
			}
		})
	}
}

func TestBundleIntegrationRebaseAdoptsDiskMetadataAndRetainsPendingAssets(t *testing.T) {
	for _, kind := range []string{"textpack", "textbundle"} {
		t.Run(kind, func(t *testing.T) {
			app := bundleIntegrationApp(t)
			name, original := bundleIntegrationFixture(t, kind)
			old := bundleIntegrationRead(t, app, name)
			png := textPackTestPNG(t)
			bundleIntegrationStage(t, old, "assets/pending.png", png)
			metadata := append(append([]byte{}, original.Files["info.json"]...), '\n')
			bundleIntegrationExternalFile(t, name, "info.json", metadata)
			disk := bundleIntegrationRead(t, app, name)
			if disk.BundleSessionID == old.BundleSessionID || disk.Revision == old.Revision {
				t.Fatal("external revision reused dirty editor baseline")
			}
			merged, err := app.RebaseBundleDocument(old.BundleSessionID, disk.BundleSessionID, disk.Revision)
			if err != nil {
				t.Fatal(err)
			}
			content := "# Explicit merge\n\n![Pending](assets/pending.png)\n"
			if _, err := app.SaveBundleDocument(name, content, merged.Revision, merged.BundleSessionID); err != nil {
				t.Fatalf("rebased package could not save: %v", err)
			}
			saved, err := readEditableBundle(name)
			if err != nil || saved.Content != content || !bytes.Equal(saved.Files["info.json"], metadata) || !bytes.Equal(saved.Files["assets/pending.png"], png) {
				t.Fatalf("explicit merge lost disk metadata or editor asset: %v", err)
			}
		})
	}
}

func TestBundleIntegrationRebaseRejectsSameNamedDifferentAsset(t *testing.T) {
	for _, kind := range []string{"textpack", "textbundle"} {
		t.Run(kind, func(t *testing.T) {
			app := bundleIntegrationApp(t)
			name, _ := bundleIntegrationFixture(t, kind)
			old := bundleIntegrationRead(t, app, name)
			png := textPackTestPNG(t)
			bundleIntegrationStage(t, old, "assets/collision.png", png)
			other := append(append([]byte{}, png...), '\n')
			bundleIntegrationExternalFile(t, name, "assets/collision.png", other)
			disk := bundleIntegrationRead(t, app, name)
			if _, err := app.RebaseBundleDocument(old.BundleSessionID, disk.BundleSessionID, disk.Revision); err == nil || !strings.Contains(err.Error(), "BUNDLE_ASSET_CONFLICT") {
				t.Fatalf("same-name attachment conflict not rejected: %v", err)
			}
			after, err := readEditableBundle(name)
			if err != nil || after.Revision != disk.Revision || !bytes.Equal(after.Files["assets/collision.png"], other) {
				t.Fatal("asset conflict modified external package")
			}
		})
	}
}

func TestBundleIntegrationOrdinaryDocumentWritersCannotCorruptPackages(t *testing.T) {
	for _, kind := range []string{"textpack", "textbundle"} {
		t.Run(kind, func(t *testing.T) {
			app := bundleIntegrationApp(t)
			name, original := bundleIntegrationFixture(t, kind)
			doc := bundleIntegrationRead(t, app, name)
			if _, err := app.SaveFile(name, "bare Markdown would destroy package"); err == nil {
				t.Fatal("ordinary save accepted package path")
			}
			if _, err := app.SaveFileWithRevision(name, "bare Markdown", doc.Revision); err == nil {
				t.Fatal("ordinary revision save accepted package path")
			}
			if _, err := app.SaveDocumentCopy(name, filepath.Join(filepath.Dir(name), "wrong.md"), "bare Markdown"); err == nil {
				t.Fatal("ordinary copy silently unpacked/lost package metadata")
			}
			if _, err := app.SaveDocumentCopy(filepath.Join(filepath.Dir(name), "ordinary.md"), filepath.Join(filepath.Dir(name), "wrong.textpack"), "bare Markdown"); err == nil {
				t.Fatal("ordinary copy accepted a package destination")
			}
			if _, err := app.RenameDocument(name, "wrong.md", doc.Revision); err == nil {
				t.Fatal("ordinary rename accepted package path")
			}
			after, err := readEditableBundle(name)
			if err != nil || after.Revision != original.Revision {
				t.Fatal("rejected ordinary operations changed original package")
			}
		})
	}
}

func TestBundleIntegrationRebaseRemapsChangedWrapperPrefix(t *testing.T) {
	app := bundleIntegrationApp(t)
	name := filepath.Join(textPackTestDirectory(t), "Wrapped.textpack")
	textPackTestWrite(t, name, editableBundleTestArchive(t, "Before.textbundle/", true))
	old := bundleIntegrationRead(t, app, name)
	png := textPackTestPNG(t)
	bundleIntegrationStage(t, old, "assets/pending.png", png)
	textPackTestWrite(t, name, editableBundleTestArchive(t, "After.textbundle/", true))
	disk := bundleIntegrationRead(t, app, name)
	merged, err := app.RebaseBundleDocument(old.BundleSessionID, disk.BundleSessionID, disk.Revision)
	if err != nil {
		t.Fatal(err)
	}
	content := "# Explicit wrapper merge\n![Pending](assets/pending.png)\n"
	if _, err := app.SaveBundleDocument(name, content, merged.Revision, merged.BundleSessionID); err != nil {
		t.Fatalf("pending resource did not follow the selected disk wrapper: %v", err)
	}
	after, err := readEditableBundle(name)
	if err != nil || after.Prefix != "After.textbundle/" || !bytes.Equal(after.Files["After.textbundle/assets/pending.png"], png) {
		t.Fatalf("asset was left under the old wrapper: %v", err)
	}
	if _, exists := after.Files["Before.textbundle/assets/pending.png"]; exists {
		t.Fatal("merge silently created a second package root")
	}
}

func TestBundleIntegrationPackageImageReferencesDecodeOnceAndStayScoped(t *testing.T) {
	app := bundleIntegrationApp(t)
	name, _ := bundleIntegrationFixture(t, "textpack")
	png := textPackTestPNG(t)
	// These are literal, portable ZIP filenames. They do not contain actual
	// traversal components, so their percent sequences must not be decoded twice.
	bundleIntegrationExternalFile(t, name, "assets/literal%20name.png", png)
	bundleIntegrationExternalFile(t, name, "assets/%2e%2e%2f%2e%2e%2fsecret.png", png)
	doc := bundleIntegrationRead(t, app, name)
	outside := append(append([]byte{}, png...), '\n')
	// A second decode would escape work/assets and read this test-owned file
	// in the session directory instead of the validated packaged image.
	secret := filepath.Join(filepath.Dir(doc.Directory), "secret.png")
	textPackTestWrite(t, secret, outside)
	want := "data:image/png;base64," + base64.StdEncoding.EncodeToString(png)
	if data, kind, err := app.readTextPackImage(want, doc.Directory); err != nil || kind != "image/png" || !bytes.Equal(data, png) {
		t.Fatalf("safe embedded image could not be repackaged from a bundle document: %v", err)
	}
	for _, reference := range []string{"assets/literal%2520name.png", "assets/%252e%252e%252f%252e%252e%252fsecret.png"} {
		got, err := app.ReadImageData(reference, doc.Directory)
		if err != nil || got != want {
			t.Fatalf("package filename decoded more than once or escaped workspace for %q: %v", reference, err)
		}
		data, kind, err := app.readTextPackImage(reference, doc.Directory)
		if err != nil || kind != "image/png" || !bytes.Equal(data, png) {
			t.Fatalf("packaging image did not use the same safe scope: %q %v", reference, err)
		}
	}
	for _, reference := range []string{"../secret.png", secret, "file:///tmp/secret.png", "https://example.test/image.png"} {
		if _, err := app.ReadImageData(reference, doc.Directory); err == nil {
			t.Fatalf("package reference unexpectedly read host/network path %q", reference)
		}
	}
}
