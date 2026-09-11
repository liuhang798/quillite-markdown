package main

import (
	"encoding/json"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestRecoverySnapshotRoundTripAndClear(t *testing.T) {
	app := testApp(t)
	documentPath := filepath.Join(t.TempDir(), "draft.md")
	if err := os.WriteFile(documentPath, []byte("saved"), 0o644); err != nil {
		t.Fatal(err)
	}
	input := RecoverySnapshotInput{Path: documentPath, Name: "draft.md", Directory: filepath.Dir(documentPath), Content: "unsaved edit"}
	if err := app.SaveRecoverySnapshot(input); err != nil {
		t.Fatal(err)
	}
	snapshot, err := app.GetRecoverySnapshot()
	if err != nil {
		t.Fatal(err)
	}
	if snapshot == nil || snapshot.Path != documentPath || snapshot.Content != input.Content || snapshot.UpdatedAt == "" {
		t.Fatalf("unexpected recovery snapshot: %#v", snapshot)
	}
	if err := app.ClearRecoverySnapshot(); err != nil {
		t.Fatal(err)
	}
	if snapshot, err = app.GetRecoverySnapshot(); err != nil || snapshot != nil {
		t.Fatalf("cleared recovery snapshot = %#v, %v; want nil", snapshot, err)
	}
}

func TestRecoverySnapshotSupportsMaximumEscapedContent(t *testing.T) {
	app := testApp(t)
	documentPath := filepath.Join(t.TempDir(), "escaped.md")
	content := strings.Repeat("\n", maxRecoverySnapshotSize)
	if err := app.SaveRecoverySnapshot(RecoverySnapshotInput{Path: documentPath, Content: content}); err != nil {
		t.Fatal(err)
	}
	snapshot, err := app.GetRecoverySnapshot()
	if err != nil || snapshot == nil || snapshot.Content != content {
		t.Fatalf("escaped recovery did not round-trip: snapshot=%v err=%v", snapshot != nil, err)
	}
}

func TestRecoverySnapshotReadsLegacyEscapedJSON(t *testing.T) {
	app := testApp(t)
	want := RecoverySnapshot{Path: "legacy.md", Name: "legacy.md", Directory: ".", Content: strings.Repeat("\n", 1024), UpdatedAt: "2026-09-11T00:00:00Z"}
	data, err := json.Marshal(want)
	if err != nil {
		t.Fatal(err)
	}
	if err := os.MkdirAll(filepath.Dir(app.recoverySnapshotPath()), 0o700); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(app.recoverySnapshotPath(), data, 0o600); err != nil {
		t.Fatal(err)
	}
	got, err := app.GetRecoverySnapshot()
	if err != nil || got == nil || got.Content != want.Content {
		t.Fatalf("legacy recovery = %#v, %v", got, err)
	}
}

func TestRecoverySnapshotAlreadySavedIsRemoved(t *testing.T) {
	app := testApp(t)
	documentPath := filepath.Join(t.TempDir(), "saved.md")
	if err := os.WriteFile(documentPath, []byte("same content"), 0o644); err != nil {
		t.Fatal(err)
	}
	if err := app.SaveRecoverySnapshot(RecoverySnapshotInput{Path: documentPath, Content: "same content"}); err != nil {
		t.Fatal(err)
	}
	snapshot, err := app.GetRecoverySnapshot()
	if err != nil || snapshot != nil {
		t.Fatalf("saved recovery snapshot = %#v, %v; want nil", snapshot, err)
	}
	if _, err := os.Stat(app.recoverySnapshotPath()); !os.IsNotExist(err) {
		t.Fatalf("redundant recovery file still exists: %v", err)
	}
}

func TestRecoverySnapshotRejectsInvalidInput(t *testing.T) {
	app := testApp(t)
	if err := app.SaveRecoverySnapshot(RecoverySnapshotInput{}); err == nil {
		t.Fatal("empty recovery path should fail")
	}
	if err := app.SaveRecoverySnapshot(RecoverySnapshotInput{Path: "large.md", Content: strings.Repeat("x", maxRecoverySnapshotSize+1)}); err == nil {
		t.Fatal("oversized recovery content should fail")
	}
}
