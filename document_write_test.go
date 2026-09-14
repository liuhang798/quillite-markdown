package main

import (
	"os"
	"path/filepath"
	"runtime"
	"testing"
)

func TestAtomicDocumentWritePreservesModeAndContent(t *testing.T) {
	path := filepath.Join(t.TempDir(), "document.md")
	if err := os.WriteFile(path, []byte("before"), 0o600); err != nil {
		t.Fatal(err)
	}
	if err := writeDocumentAtomically(path, []byte("after")); err != nil {
		t.Fatal(err)
	}
	content, err := os.ReadFile(path)
	if err != nil || string(content) != "after" {
		t.Fatalf("document content = %q, %v", content, err)
	}
	if runtime.GOOS != "windows" {
		info, err := os.Stat(path)
		if err != nil {
			t.Fatal(err)
		}
		if info.Mode().Perm() != 0o600 {
			t.Fatalf("document mode = %v", info.Mode())
		}
	}
}

func TestAtomicDocumentWritePreservesSymlink(t *testing.T) {
	directory := t.TempDir()
	target := filepath.Join(directory, "target.md")
	link := filepath.Join(directory, "link.md")
	if err := os.WriteFile(target, []byte("before"), 0o644); err != nil {
		t.Fatal(err)
	}
	if err := os.Symlink(target, link); err != nil {
		t.Skipf("symlinks unavailable: %v", err)
	}
	if err := writeDocumentAtomically(link, []byte("after")); err != nil {
		t.Fatal(err)
	}
	info, err := os.Lstat(link)
	if err != nil || info.Mode()&os.ModeSymlink == 0 {
		t.Fatalf("document link was replaced: %v, %v", info, err)
	}
	content, err := os.ReadFile(target)
	if err != nil || string(content) != "after" {
		t.Fatalf("link target = %q, %v", content, err)
	}
}

func TestAtomicDocumentWriteRejectsReadOnlyOriginal(t *testing.T) {
	if runtime.GOOS != "windows" {
		t.Skip("Windows read-only attribute behavior")
	}
	path := filepath.Join(t.TempDir(), "read-only.md")
	if err := os.WriteFile(path, []byte("before"), 0o644); err != nil {
		t.Fatal(err)
	}
	if err := os.Chmod(path, 0o444); err != nil {
		t.Fatal(err)
	}
	defer os.Chmod(path, 0o644)
	if err := writeDocumentAtomically(path, []byte("after")); err == nil {
		t.Fatal("read-only document was replaced")
	}
	content, err := os.ReadFile(path)
	if err != nil || string(content) != "before" {
		t.Fatalf("read-only document changed: %q, %v", content, err)
	}
}
