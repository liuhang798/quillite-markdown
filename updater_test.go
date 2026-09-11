package main

import (
	"crypto/sha256"
	"encoding/hex"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestPickUpdateAsset(t *testing.T) {
	assets := []updateReleaseAsset{
		{Name: "quillite-markdown-2.3.11-linux-amd64.deb"},
		{Name: "quillite-markdown-2.3.11-macos-universal.dmg"},
		{Name: "quillite-markdown-2.3.11-macos-universal.bin"},
		{Name: "quillite-markdown-2.3.11-macos-universal.zip"},
		{Name: "quillite-markdown-2.3.11-windows-amd64.exe"},
		{Name: "quillite-markdown-2.3.11-windows-amd64.bin"},
	}

	darwin, err := pickUpdateAsset(assets, "darwin")
	if err != nil {
		t.Fatalf("darwin: %v", err)
	}
	if darwin.Name != "quillite-markdown-2.3.11-macos-universal.zip" {
		t.Fatalf("darwin picked %q, want the complete .app archive", darwin.Name)
	}

	windows, err := pickUpdateAsset(assets, "windows")
	if err != nil {
		t.Fatalf("windows: %v", err)
	}
	if windows.Name != "quillite-markdown-2.3.11-windows-amd64.bin" {
		t.Fatalf("windows picked %q, want the portable .bin executable", windows.Name)
	}

	if _, err := pickUpdateAsset(assets, "linux"); err == nil {
		t.Fatal("linux must not support in-app updates")
	}
	if _, err := pickUpdateAsset(nil, "darwin"); err == nil {
		t.Fatal("a release without the expected asset must fail")
	}
	if _, err := pickUpdateAsset([]updateReleaseAsset{{Name: "quillite-markdown-2.3.11-macos-universal.bin"}}, "darwin"); err == nil {
		t.Fatal("macOS must reject legacy raw-binary updates because they invalidate the application signature")
	}
}

func TestUnsafeWindowsUninstallerBlocksInAppUpdate(t *testing.T) {
	if err := validateInAppUpdateSafety("windows", false); err == nil {
		t.Fatal("an unsafe Windows uninstaller must block in-app updating")
	}
	for _, test := range []struct {
		goos string
		safe bool
	}{
		{"windows", true},
		{"darwin", false},
		{"linux", false},
	} {
		if err := validateInAppUpdateSafety(test.goos, test.safe); err != nil {
			t.Fatalf("unexpected in-app update block for %+v: %v", test, err)
		}
	}
}

func TestVerifyDigest(t *testing.T) {
	dir := t.TempDir()
	path := filepath.Join(dir, "update.bin")
	content := []byte("hello update")
	if err := os.WriteFile(path, content, 0o644); err != nil {
		t.Fatal(err)
	}
	sum := sha256.Sum256(content)
	good := "sha256:" + hex.EncodeToString(sum[:])
	if err := verifyDigest(path, good); err != nil {
		t.Fatalf("valid digest must pass: %v", err)
	}
	if err := verifyDigest(path, "sha256:"+strings.Repeat("0", 64)); err == nil {
		t.Fatal("mismatched digest must fail")
	}
	if err := verifyDigest(path, ""); err == nil {
		t.Fatal("missing digest must fail")
	}
}

func TestDownloadFileAndProgress(t *testing.T) {
	content := []byte(strings.Repeat("x", 256*1024))
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		_, _ = w.Write(content)
	}))
	defer server.Close()

	app := &App{} // nil ctx: progress events are skipped safely
	dir := t.TempDir()
	path := filepath.Join(dir, "downloaded.bin")
	if err := app.downloadFileFromURL(server.URL, path, server.Client()); err != nil {
		t.Fatalf("download failed: %v", err)
	}
	data, err := os.ReadFile(path)
	if err != nil {
		t.Fatal(err)
	}
	if string(data) != string(content) {
		t.Fatal("downloaded content does not match the source")
	}
}

func TestDownloadFileRejectsBadStatus(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		http.Error(w, "boom", http.StatusNotFound)
	}))
	defer server.Close()

	app := &App{}
	if err := app.downloadFileFromURL(server.URL, filepath.Join(t.TempDir(), "nope.bin"), server.Client()); err == nil {
		t.Fatal("non-200 response must fail the download")
	}
}

func TestDownloadFileRejectsNonOfficialHosts(t *testing.T) {
	app := &App{}
	if err := app.downloadFile("https://github.com/liuhang798/quillite-markdown/releases/latest", filepath.Join(t.TempDir(), "update.bin")); err == nil {
		t.Fatal("GitHub must not be accepted as an update download host")
	}
}
