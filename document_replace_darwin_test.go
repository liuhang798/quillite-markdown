//go:build darwin && cgo

package main

import (
	"golang.org/x/sys/unix"
	"os"
	"path/filepath"
	"testing"
	"time"
)

func TestMacDocumentMetadataSurvivesSave(t *testing.T) {
	p := filepath.Join(t.TempDir(), "document.md")
	if err := os.WriteFile(p, []byte("before"), 0600); err != nil {
		t.Fatal(err)
	}
	if err := unix.Setxattr(p, "com.quillite.test", []byte("keep"), 0); err != nil {
		t.Fatal(err)
	}
	old := time.Unix(100, 0)
	if err := os.Chtimes(p, old, old); err != nil {
		t.Fatal(err)
	}
	if err := writeDocumentAtomically(p, []byte("after")); err != nil {
		t.Fatal(err)
	}
	value := make([]byte, 16)
	n, err := unix.Getxattr(p, "com.quillite.test", value)
	if err != nil || string(value[:n]) != "keep" {
		t.Fatalf("xattr lost: %v", err)
	}
	info, err := os.Stat(p)
	if err != nil {
		t.Fatal(err)
	}
	if !info.ModTime().After(old) {
		t.Fatal("save kept stale modification time")
	}
}
