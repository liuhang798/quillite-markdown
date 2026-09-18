package main

import (
	"errors"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestConflictCopyNeverOverwrites(t *testing.T) {
	dir := t.TempDir()
	source := filepath.Join(dir, "original.md")
	target := filepath.Join(dir, "copy.md")
	for _, path := range []string{source, target} {
		if err := os.WriteFile(path, []byte("disk"), 0600); err != nil {
			t.Fatal(err)
		}
	}
	for _, path := range []string{source, target, dir} {
		if err := writeConflictCopy(source, path, []byte("editor")); err == nil {
			t.Fatalf("overwrote %s", path)
		}
	}
	for _, path := range []string{source, target} {
		data, err := os.ReadFile(path)
		if err != nil || string(data) != "disk" {
			t.Fatal("existing file changed", err)
		}
	}
	missing := filepath.Join(dir, "deleted.md")
	if err := writeConflictCopy(missing, missing, []byte("editor")); err == nil {
		t.Fatal("recreated deleted source")
	}
	if _, err := os.Stat(missing); !os.IsNotExist(err) {
		t.Fatal("deleted source reappeared")
	}
	fresh := filepath.Join(dir, "new.md")
	if err := writeConflictCopy(source, fresh, []byte("merged 中文")); err != nil {
		t.Fatal(err)
	}
	data, _ := os.ReadFile(fresh)
	if string(data) != "merged 中文" {
		t.Fatal("copy content changed")
	}
	if err := writeConflictCopy(source, fresh, []byte("second")); err == nil {
		t.Fatal("second save overwrote copy")
	}
}

func TestConflictCopyPreservesAliases(t *testing.T) {
	dir := t.TempDir()
	source := filepath.Join(dir, "original.md")
	if err := os.WriteFile(source, []byte("original"), 0600); err != nil {
		t.Fatal(err)
	}
	for _, link := range []struct {
		name   string
		create func(string, string) error
	}{{"hard.md", os.Link}, {"symbolic.md", os.Symlink}} {
		t.Run(link.name, func(t *testing.T) {
			path := filepath.Join(dir, link.name)
			if err := link.create(source, path); err != nil {
				t.Skip(err)
			}
			if err := writeConflictCopy(source, path, []byte("replacement")); err == nil {
				t.Fatal("alias overwritten")
			}
			data, _ := os.ReadFile(source)
			if string(data) != "original" {
				t.Fatal("source modified via alias")
			}
		})
	}
}

func TestConflictSnapshotAndStaleMerge(t *testing.T) {
	path := filepath.Join(t.TempDir(), "document.md")
	if err := os.WriteFile(path, []byte("disk one"), 0600); err != nil {
		t.Fatal(err)
	}
	a := NewApp()
	disk, err := a.ReadDocumentConflict(path)
	if err != nil {
		t.Fatal(err)
	}
	if disk.Content != "disk one" || disk.Revision != documentRevision([]byte("disk one")) {
		t.Fatal("invalid snapshot")
	}
	if err := os.WriteFile(path, []byte("disk two"), 0600); err != nil {
		t.Fatal(err)
	}
	if err := writeDocumentWithRevision(path, []byte("merged"), disk.Revision); !errors.Is(err, errDocumentConflict) {
		t.Fatal("stale merge accepted", err)
	}
	data, _ := os.ReadFile(path)
	if string(data) != "disk two" {
		t.Fatal("external edit overwritten")
	}
	if _, err := a.ReadDocumentConflict(filepath.Join(filepath.Dir(path), "missing.md")); err == nil {
		t.Fatal("missing file treated as empty")
	}
}

func TestConflictCopyRejectsOversizeWithoutCreatingFile(t *testing.T) {
	dir := t.TempDir()
	path := filepath.Join(dir, "large.md")
	err := writeConflictCopy(filepath.Join(dir, "source.md"), path, make([]byte, maxSupportedDocumentBytes+1))
	if err == nil || !strings.Contains(err.Error(), "DOCUMENT_TOO_LARGE") {
		t.Fatal(err)
	}
	if _, err := os.Stat(path); !os.IsNotExist(err) {
		t.Fatal("oversize copy created")
	}
}

func TestSaveReceiptCannotAdoptPostWriteExternalRevision(t *testing.T) {
	app := testApp(t)
	dir := t.TempDir()
	path := filepath.Join(dir, "copy.md")
	written := "my saved content 中文"
	if err := writeConflictCopy(filepath.Join(dir, "source.md"), path, []byte(written)); err != nil {
		t.Fatal(err)
	}
	// Deterministic interleaving: an external editor writes after our successful
	// write, before our return value is constructed. No timing-dependent race.
	if err := os.WriteFile(path, []byte("external version"), 0600); err != nil {
		t.Fatal(err)
	}
	saved, err := app.savedDocumentReceipt(path, written, true)
	if err != nil {
		t.Fatal(err)
	}
	if saved.Content != written || saved.Revision != documentRevision([]byte(written)) || saved.Size != int64(len(written)) {
		t.Fatalf("receipt adopted external bytes: %#v", saved)
	}
	if _, err := app.SaveFileWithRevision(path, "next local edit", saved.Revision); !errors.Is(err, errDocumentConflict) {
		t.Fatalf("next save did not detect external change: %v", err)
	}
	data, err := os.ReadFile(path)
	if err != nil || string(data) != "external version" {
		t.Fatal("external content overwritten", err)
	}
}

func TestSavePathsUseWrittenContentReceipts(t *testing.T) {
	app := testApp(t)
	dir := t.TempDir()
	path := filepath.Join(dir, "document.md")
	if err := os.WriteFile(path, []byte("original"), 0600); err != nil {
		t.Fatal(err)
	}
	saved, err := app.SaveFileWithRevision(path, "saved 中文", documentRevision([]byte("original")))
	if err != nil {
		t.Fatal(err)
	}
	if saved.Content != "saved 中文" || saved.Revision != documentRevision([]byte(saved.Content)) || saved.Size != int64(len(saved.Content)) {
		t.Fatal("incorrect save receipt")
	}
	copy, err := app.saveDocumentAs(path, filepath.Join(dir, "as.md"), "save as")
	if err != nil || copy.Content != "save as" || copy.Revision != documentRevision([]byte("save as")) {
		t.Fatalf("incorrect Save As receipt: %#v, %v", copy, err)
	}
	for _, file := range []string{"app.go", "document_conflict.go"} {
		source, err := os.ReadFile(file)
		if err != nil {
			t.Fatal(err)
		}
		if !strings.Contains(string(source), "savedDocumentReceipt(") {
			t.Fatalf("save route %s must use written bytes", file)
		}
	}
}
