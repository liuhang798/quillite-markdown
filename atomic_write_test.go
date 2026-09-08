package main

import (
	"os"
	"path/filepath"
	"testing"
)

func TestAtomicWriteReplacesFileAndCleansTemporary(t *testing.T) {
	dir := t.TempDir()
	path := filepath.Join(dir, "report.pdf")
	if err := os.WriteFile(path, []byte("previous"), 0o600); err != nil {
		t.Fatal(err)
	}
	if err := writeFileAtomically(path, []byte("complete new export")); err != nil {
		t.Fatal(err)
	}
	data, err := os.ReadFile(path)
	if err != nil || string(data) != "complete new export" {
		t.Fatalf("data = %q, err = %v", data, err)
	}
	entries, err := os.ReadDir(dir)
	if err != nil || len(entries) != 1 {
		t.Fatalf("temporary file leaked: %v, %v", entries, err)
	}
}

func TestAtomicWriteNeverDeletesDestinationAfterFailedRename(t *testing.T) {
	dir := t.TempDir()
	target := filepath.Join(dir, "existing-directory.pdf")
	if err := os.Mkdir(target, 0o700); err != nil {
		t.Fatal(err)
	}
	if err := writeFileAtomically(target, []byte("new export")); err == nil {
		t.Fatal("expected replacement of a directory to fail")
	}
	info, err := os.Stat(target)
	if err != nil || !info.IsDir() {
		t.Fatalf("original destination was removed: %v", err)
	}
	entries, err := os.ReadDir(dir)
	if err != nil || len(entries) != 1 {
		t.Fatalf("temporary file leaked: %v, %v", entries, err)
	}
}
