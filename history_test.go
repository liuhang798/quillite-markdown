package main

import (
	"compress/gzip"
	"encoding/json"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestDocumentHistoryCapturesPreviousSavedContent(t *testing.T) {
	app := testApp(t)
	documentPath := filepath.Join(t.TempDir(), "history.md")
	if err := os.WriteFile(documentPath, []byte("first version\n"), 0o644); err != nil {
		t.Fatal(err)
	}
	if _, err := app.SaveFile(documentPath, "second version\n"); err != nil {
		t.Fatal(err)
	}
	versions, err := app.ListDocumentVersions(documentPath)
	if err != nil {
		t.Fatal(err)
	}
	if len(versions) != 1 || versions[0].Size != int64(len("first version\n")) {
		t.Fatalf("versions = %#v; want one previous version", versions)
	}
	detail, err := app.GetDocumentVersion(documentPath, versions[0].ID)
	if err != nil {
		t.Fatal(err)
	}
	if detail.Content != "first version\n" || !sameHistoryPath(detail.Path, documentPath) {
		t.Fatalf("detail = %#v", detail)
	}
	if _, err := app.SaveFile(documentPath, "second version\n"); err != nil {
		t.Fatal(err)
	}
	versions, err = app.ListDocumentVersions(documentPath)
	if err != nil || len(versions) != 1 {
		t.Fatalf("unchanged save created another version: %#v, %v", versions, err)
	}
	if _, err := app.SaveFile(documentPath, "third version\n"); err != nil {
		t.Fatal(err)
	}
	versions, err = app.ListDocumentVersions(documentPath)
	if err != nil || len(versions) != 2 {
		t.Fatalf("a distinct save was not captured: %#v, %v", versions, err)
	}
}

func TestDocumentHistorySupportsEscapedLargeContentAndMetadataOnlyListing(t *testing.T) {
	app := testApp(t)
	documentPath := filepath.Join(t.TempDir(), "escaped.md")
	content := strings.Repeat("\n", maxDocumentVersionContent)
	createdAt := "2026-09-11T00:00:00Z"
	encoded, err := encodeDocumentVersion(storedDocumentVersion{Path: documentPath, CreatedAt: createdAt, Content: content})
	if err != nil {
		t.Fatal(err)
	}
	directory := app.documentHistoryDirectory(documentPath)
	if err := os.MkdirAll(directory, 0o700); err != nil {
		t.Fatal(err)
	}
	id := "20260911T000000.000000000Z-00000000.json.gz"
	versionPath := filepath.Join(directory, id)
	if err := os.WriteFile(versionPath, encoded, 0o600); err != nil {
		t.Fatal(err)
	}
	versions, err := app.ListDocumentVersions(documentPath)
	if err != nil || len(versions) != 1 || versions[0].Size != int64(len(content)) {
		t.Fatalf("metadata listing = %#v, %v", versions, err)
	}
	detail, err := app.GetDocumentVersion(documentPath, id)
	if err != nil || detail.Content != content {
		t.Fatalf("large escaped version did not round-trip: size=%d err=%v", len(detail.Content), err)
	}
}

func TestDocumentHistoryReadsLegacyEscapedJSON(t *testing.T) {
	path := filepath.Join(t.TempDir(), "legacy.json.gz")
	file, err := os.Create(path)
	if err != nil {
		t.Fatal(err)
	}
	writer := gzip.NewWriter(file)
	want := storedDocumentVersion{Path: "legacy.md", CreatedAt: "2026-09-11T00:00:00Z", Content: strings.Repeat("\n", 1024)}
	if err := json.NewEncoder(writer).Encode(want); err != nil {
		t.Fatal(err)
	}
	if err := writer.Close(); err != nil {
		t.Fatal(err)
	}
	if err := file.Close(); err != nil {
		t.Fatal(err)
	}
	got, err := decodeDocumentVersion(path)
	if err != nil || got != want {
		t.Fatalf("legacy version = %#v, %v", got, err)
	}
}

func TestDocumentHistoryRejectsForeignOrOversizedVersions(t *testing.T) {
	app := testApp(t)
	if _, err := app.GetDocumentVersion("document.md", "../foreign.json.gz"); err == nil {
		t.Fatal("path traversal version id should fail")
	}
	documentPath := filepath.Join(t.TempDir(), "large.md")
	if err := os.WriteFile(documentPath, []byte(strings.Repeat("x", maxDocumentVersionContent+1)), 0o644); err != nil {
		t.Fatal(err)
	}
	if err := app.captureDocumentVersion(documentPath, "replacement"); err != nil {
		t.Fatal(err)
	}
	versions, err := app.ListDocumentVersions(documentPath)
	if err != nil || len(versions) != 0 {
		t.Fatalf("oversized version should not be retained: %#v, %v", versions, err)
	}
}

func TestHistoryPruningPreservesUnverifiedFiles(t *testing.T) {
	app := testApp(t)
	documentPath := filepath.Join(t.TempDir(), "owned.md")
	directory := app.documentHistoryDirectory(documentPath)
	if err := os.MkdirAll(directory, 0o700); err != nil {
		t.Fatal(err)
	}
	owned, err := encodeDocumentVersion(storedDocumentVersion{
		Path: documentPath, CreatedAt: "2026-09-01T00:00:00Z", Content: "recover me",
	})
	if err != nil {
		t.Fatal(err)
	}
	ownedPath := filepath.Join(directory, "20260901T000000.000000000Z-00000000.json.gz")
	if err := os.WriteFile(ownedPath, owned, 0o600); err != nil {
		t.Fatal(err)
	}
	foreignPath := filepath.Join(directory, "20260902T000000.000000000Z-00000000.json.gz")
	foreign, err := os.Create(foreignPath)
	if err != nil {
		t.Fatal(err)
	}
	if err := foreign.Truncate(maxDocumentHistoryBytes + 1); err != nil {
		t.Fatal(err)
	}
	if err := foreign.Close(); err != nil {
		t.Fatal(err)
	}
	if err := app.pruneDocumentHistoryLocked(directory); err != nil {
		t.Fatal(err)
	}
	for _, path := range []string{ownedPath, foreignPath} {
		if _, err := os.Stat(path); err != nil {
			t.Fatalf("pruning removed %s: %v", path, err)
		}
	}
}
