//go:build windows

package main

import (
	"errors"
	"os"
	"path/filepath"
	"testing"
)

func TestDocumentCommitActiveWriterIsNotOverwritten(t *testing.T) {
	dir := t.TempDir()
	target, staged := filepath.Join(dir, "document.md"), filepath.Join(dir, "stage")
	os.WriteFile(target, []byte("external"), 0600)
	os.WriteFile(staged, []byte("editor"), 0600)
	f, err := os.OpenFile(target, os.O_WRONLY, 0600)
	if err != nil {
		t.Fatal(err)
	}
	defer f.Close()
	if err = commitDocumentReplacement(staged, target, documentRevision([]byte("external"))); !errors.Is(err, errDocumentConflict) {
		t.Fatalf("writer not excluded: %v", err)
	}
	assertDocumentBytes(t, target, "external")
}

func TestDocumentReplacementPreservesAlternateStream(t *testing.T) {
	p := filepath.Join(t.TempDir(), "document.md")
	if err := os.WriteFile(p, []byte("old"), 0600); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(p+":user-metadata", []byte("keep me"), 0600); err != nil {
		t.Skipf("ADS unavailable: %v", err)
	}
	if err := writeDocumentAtomically(p, []byte("new")); err != nil {
		t.Fatal(err)
	}
	data, err := os.ReadFile(p + ":user-metadata")
	if err != nil || string(data) != "keep me" {
		t.Fatalf("metadata lost: %q %v", data, err)
	}
}

func TestDocumentReplacementRejectsHardlinks(t *testing.T) {
	p := filepath.Join(t.TempDir(), "document.md")
	if err := os.WriteFile(p, []byte("old"), 0600); err != nil {
		t.Fatal(err)
	}
	if err := os.Link(p, p+".link"); err != nil {
		t.Skip(err)
	}
	if err := writeDocumentAtomically(p, []byte("new")); err == nil {
		t.Fatal("hard-linked file replaced")
	}
	data, _ := os.ReadFile(p)
	if string(data) != "old" {
		t.Fatal("original modified")
	}
}

func TestFailedDocumentReplacementKeepsOriginal(t *testing.T) {
	dir := t.TempDir()
	p := filepath.Join(dir, "document.md")
	if err := os.WriteFile(p, []byte("original"), 0600); err != nil {
		t.Fatal(err)
	}
	if err := replaceDocumentFile(filepath.Join(dir, "missing.tmp"), p); err == nil {
		t.Fatal("missing replacement accepted")
	}
	data, err := os.ReadFile(p)
	if err != nil || string(data) != "original" {
		t.Fatalf("original lost: %q %v", data, err)
	}
}
