package main

import (
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
