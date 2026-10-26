package main

import (
	"archive/tar"
	"archive/zip"
	"compress/gzip"
	"context"
	"crypto/sha256"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"runtime"
	"strings"
	"testing"
	"time"
)

func TestPicGoPrepareOfficialSourcesAndLock(t *testing.T) {
	for _, raw := range []string{"https://nodejs.org/dist/x", "https://registry.npmjs.org/picgo/-/picgo-3.2.0.tgz"} {
		if !picGoOfficialURL(raw) {
			t.Fatal(raw)
		}
	}
	for _, raw := range []string{"http://nodejs.org/x", "https://nodejs.org.evil.test/x", "https://user@nodejs.org/x", "https://nodejs.org:443/x", "https://repo.huaweicloud.com/x"} {
		if picGoOfficialURL(raw) {
			t.Fatal(raw)
		}
	}
	if err := validatePicGoLock(picGoPackageLock); err != nil {
		t.Fatal(err)
	}
	for _, bad := range []string{
		strings.Replace(string(picGoPackageLock), "https://registry.npmjs.org/", "https://evil.test/", 1),
		strings.Replace(string(picGoPackageLock), "sha512-", "sha1-", 1),
		strings.Replace(string(picGoPackageLock), `"version": "3.0.0"`, `"hasInstallScript": true, "version": "3.0.0"`, 1),
	} {
		if validatePicGoLock([]byte(bad)) == nil {
			t.Fatal("accepted changed lock")
		}
	}
}

func TestPicGoPreparePlatformAndEnvironment(t *testing.T) {
	for _, platform := range []string{"windows/amd64", "darwin/arm64", "darwin/amd64", "linux/amd64"} {
		parts := strings.Split(platform, "/")
		spec, err := picGoNodeFor(parts[0], parts[1])
		if err != nil || len(spec.SHA256) != 64 {
			t.Fatal(spec, err)
		}
	}
	if _, err := picGoNodeFor("linux", "386"); err == nil {
		t.Fatal("unsupported platform")
	}
	t.Setenv("NODE_OPTIONS", "--require dangerous.js")
	t.Setenv("NPM_CONFIG_REGISTRY", "https://evil.test")
	t.Setenv("NPM_TOKEN", "test-secret")
	env := strings.Join(picGoPrepareEnv("private-node", "private-temp"), "\n")
	for _, bad := range []string{"dangerous", "evil.test", "test-secret"} {
		if strings.Contains(env, bad) {
			t.Fatal("leaked inherited configuration")
		}
	}
}

func picGoZipFixture(t *testing.T, names []string) string {
	t.Helper()
	file := filepath.Join(t.TempDir(), "node.zip")
	f, err := os.Create(file)
	if err != nil {
		t.Fatal(err)
	}
	z := zip.NewWriter(f)
	for _, name := range names {
		w, err := z.Create(name)
		if err != nil {
			t.Fatal(err)
		}
		w.Write([]byte("fixture"))
	}
	if err := z.Close(); err != nil {
		t.Fatal(err)
	}
	f.Close()
	return file
}

func TestPicGoPrepareArchivePathsAndDuplicates(t *testing.T) {
	for _, name := range []string{"root/../node.exe", "../node.exe", "/root/node.exe", "root/C:/node.exe", "root\\node.exe"} {
		t.Run(name, func(t *testing.T) {
			if extractPicGoNode(picGoZipFixture(t, []string{name}), t.TempDir()) == nil {
				t.Fatal("accepted unsafe path")
			}
		})
	}
	if extractPicGoNode(picGoZipFixture(t, []string{"root/node.exe", "root/node.exe"}), t.TempDir()) == nil {
		t.Fatal("overwrote duplicate")
	}
	dir := t.TempDir()
	archive := picGoZipFixture(t, []string{"root/node.exe", "root/node_modules/npm/bin/npm-cli.js", "root/LICENSE", "root/include/node.h"})
	if err := extractPicGoNode(archive, dir); err != nil {
		t.Fatal(err)
	}
	for _, name := range []string{"node.exe", "node_modules/npm/bin/npm-cli.js", "LICENSE"} {
		if _, err := os.Stat(filepath.Join(dir, name)); err != nil {
			t.Fatal(err)
		}
	}
	if _, err := os.Stat(filepath.Join(dir, "include/node.h")); !os.IsNotExist(err) {
		t.Fatal("unexpected headers")
	}
	if err := extractPicGoNode(archive, dir); err == nil {
		t.Fatal("overwrote existing files")
	}
}

func TestPicGoPrepareTarDoesNotCreateLinks(t *testing.T) {
	file := filepath.Join(t.TempDir(), "node.tar.gz")
	f, _ := os.Create(file)
	gz := gzip.NewWriter(f)
	tw := tar.NewWriter(gz)
	tw.WriteHeader(&tar.Header{Name: "root/bin/node", Size: 4, Mode: 0755})
	tw.Write([]byte("node"))
	tw.WriteHeader(&tar.Header{Name: "root/lib/node_modules/npm/link", Linkname: "../../../../outside", Typeflag: tar.TypeSymlink, Mode: 0777})
	tw.Close()
	gz.Close()
	f.Close()
	dir := t.TempDir()
	if err := extractPicGoNode(file, dir); err != nil {
		t.Fatal(err)
	}
	if data, err := os.ReadFile(filepath.Join(dir, "node")); err != nil || string(data) != "node" {
		t.Fatal(err)
	}
	if _, err := os.Lstat(filepath.Join(dir, "lib/node_modules/npm/link")); !os.IsNotExist(err) {
		t.Fatal("created archive symlink")
	}
}

func TestPicGoPrepareCleanupOwnsOnlyPrivateTrees(t *testing.T) {
	parent := t.TempDir()
	sentinel := filepath.Join(parent, "user-document.md")
	os.WriteFile(sentinel, []byte("keep"), 0600)
	for _, succeed := range []bool{false, true} {
		var bundle, work string
		entry, err := preparePicGoComponent(context.Background(), parent, func(_ context.Context, b, w string) error {
			bundle, work = b, w
			os.MkdirAll(filepath.Join(b, "runtime"), 0700)
			os.WriteFile(filepath.Join(b, "runtime", managedPicGoEntry), []byte("test"), 0600)
			os.WriteFile(filepath.Join(w, "download"), []byte("test"), 0600)
			if !succeed {
				return errors.New("synthetic failure")
			}
			return nil
		})
		if succeed {
			if err != nil || entry == "" {
				t.Fatal(err)
			}
			if _, err := os.Stat(entry); err != nil {
				t.Fatal("removed published component")
			}
		} else {
			if err == nil {
				t.Fatal("missing failure")
			}
			if _, err := os.Stat(bundle); !os.IsNotExist(err) {
				t.Fatal("private failed tree retained")
			}
		}
		if _, err := os.Stat(work); !os.IsNotExist(err) {
			t.Fatal("private work tree retained")
		}
		if data, err := os.ReadFile(sentinel); err != nil || string(data) != "keep" {
			t.Fatal("user data changed")
		}
	}
}

func TestPicGoPrepareRequiresConfirmation(t *testing.T) {
	if _, err := testApp(t).PreparePicGoCLI(false, "test"); err == nil {
		t.Fatal("missing consent")
	}
	if _, err := testApp(t).PreparePicGoCLI(true, ""); err == nil {
		t.Fatal("missing operation ownership")
	}
}

func TestPicGoPrepareDownloadIntegrityAndCreateOnly(t *testing.T) {
	dir := t.TempDir()
	expected := fmt.Sprintf("%x", sha256.Sum256([]byte("verified")))
	target := filepath.Join(dir, "download")
	if err := writePicGoNodeDownload(strings.NewReader("verified"), expected, target); err != nil {
		t.Fatal(err)
	}
	if err := writePicGoNodeDownload(strings.NewReader("different"), expected, target); err == nil {
		t.Fatal("overwrote existing file")
	}
	if data, _ := os.ReadFile(target); string(data) != "verified" {
		t.Fatal("existing data changed")
	}
	if err := writePicGoNodeDownload(strings.NewReader("corrupt"), expected, filepath.Join(dir, "bad")); err == nil || err.Error() != "PICGO_PREPARE_INTEGRITY" {
		t.Fatal("accepted corrupt archive", err)
	}
}

func TestPicGoOfficialForeignArchives(t *testing.T) {
	parent := os.Getenv("QUILLITE_PICGO_PREPARE_TEST_DIR")
	if parent == "" {
		t.Skip("official download integration is opt-in")
	}
	for _, target := range []string{"darwin/amd64", "darwin/arm64", "linux/amd64"} {
		t.Run(target, func(t *testing.T) {
			parts := strings.Split(target, "/")
			spec, _ := picGoNodeFor(parts[0], parts[1])
			ctx, cancel := context.WithTimeout(context.Background(), 3*time.Minute)
			defer cancel()
			// Test-owned directory; no paths from the network are cleanup targets.
			work := t.TempDir()
			archive := filepath.Join(work, spec.File)
			if err := downloadPicGoNode(ctx, spec, archive); err != nil {
				t.Fatal(err)
			}
			out := filepath.Join(work, "runtime")
			if err := extractPicGoNode(archive, out); err != nil {
				t.Fatal(err)
			}
			for _, name := range []string{"node", "lib/node_modules/npm/bin/npm-cli.js", "LICENSE"} {
				if _, err := os.Stat(filepath.Join(out, name)); err != nil {
					t.Fatal(err)
				}
			}
		})
	}
}

func TestPicGoManagedRuntimeNeverUsesSystemNode(t *testing.T) {
	dir := t.TempDir()
	entry := filepath.Join(dir, managedPicGoEntry)
	os.WriteFile(entry, []byte("// fixture"), 0600)
	if _, _, err := resolvePicGoCLI(entry); err == nil {
		t.Fatal("fell back to system Node")
	}
	name := "node"
	if runtime.GOOS == "windows" {
		name = "node.exe"
	}
	node := filepath.Join(dir, name)
	os.WriteFile(node, []byte("fixture"), 0700)
	program, args, err := resolvePicGoCLI(entry)
	if err != nil || program != node || len(args) != 1 || args[0] != entry {
		t.Fatal(program, args, err)
	}
}

// Opt-in network acceptance runs only in an explicitly supplied isolated directory.
func TestPicGoOfficialPrepareIntegration(t *testing.T) {
	parent := os.Getenv("QUILLITE_PICGO_PREPARE_TEST_DIR")
	if parent == "" {
		t.Skip("official download integration is opt-in")
	}
	if !filepath.IsAbs(parent) {
		t.Fatal("absolute isolated test directory required")
	}
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Minute)
	defer cancel()
	var phases []string
	var lastDownloaded int64
	entry, err := preparePicGoComponent(ctx, parent, func(ctx context.Context, component, work string) error {
		return installOfficialPicGoWithProgress(ctx, component, work, func(phase string, done, total int64) {
			if len(phases) == 0 || phases[len(phases)-1] != phase {
				phases = append(phases, phase)
			}
			if phase == "downloading" {
				if done < lastDownloaded {
					t.Error("download progress moved backwards")
				}
				lastDownloaded = done
				if total > 0 && done > total {
					t.Error("download exceeded declared length")
				}
			}
		})
	})
	if err != nil {
		t.Fatal(err)
	}
	t.Log("Verified official CLI component:", entry)
	if strings.Join(phases, ",") != "downloading,verifying,extracting,installing,checking" || lastDownloaded == 0 {
		t.Fatal("missing actual progress", phases, lastDownloaded)
	}
	t.Log("Verified preparation stages:", phases, "downloaded bytes:", lastDownloaded)
}
