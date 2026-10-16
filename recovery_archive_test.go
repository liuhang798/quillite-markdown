package main

import (
	"bytes"
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func seededStartupRecovery(t *testing.T) *App {
	t.Helper()
	a := testApp(t)
	if err := a.SaveRecoverySnapshot(RecoverySnapshotInput{Path: filepath.Join(t.TempDir(), "old.md"), Content: "old unsaved", BaseRevision: strings.Repeat("a", 64), Conflict: true}); err != nil {
		t.Fatal(err)
	}
	return &App{preferencesOverride: a.preferencePath()}
}

func TestStartupRecoveryPreservedBeforeNewBackupAndClear(t *testing.T) {
	for _, action := range []string{"save", "clear", "get"} {
		t.Run(action, func(t *testing.T) {
			a := seededStartupRecovery(t)
			switch action {
			case "save":
				if err := a.SaveRecoverySnapshot(RecoverySnapshotInput{Path: "new.md", Content: "new input"}); err != nil {
					t.Fatal(err)
				}
			case "clear":
				if err := a.ClearRecoverySnapshot(); err != nil {
					t.Fatal(err)
				}
			}
			old, err := a.GetStartupRecoverySnapshot()
			if err != nil || old == nil || old.Content != "old unsaved" || !old.Conflict || old.BaseRevision != strings.Repeat("a", 64) {
				t.Fatalf("lost startup: %#v %v", old, err)
			}
			archives, err := a.ListRecoveryArchives()
			if err != nil || len(archives) != 1 {
				t.Fatalf("archives: %#v %v", archives, err)
			}
			got, err := a.ReadRecoveryArchive(archives[0].ID)
			if err != nil || got.Content != old.Content {
				t.Fatalf("archive: %#v %v", got, err)
			}
			if action == "save" {
				current, err := a.GetRecoveryBackup()
				if err != nil || current.Content != "new input" {
					t.Fatalf("lost current: %#v %v", current, err)
				}
			}
			if err := a.ClearRecoverySnapshot(); err != nil {
				t.Fatal(err)
			}
			if _, err := a.ReadRecoveryArchive(archives[0].ID); err != nil {
				t.Fatal("clear removed preserved archive", err)
			}
			// The archive remains available in a fresh application instance.
			restarted := &App{preferencesOverride: a.preferencePath()}
			again, err := restarted.ListRecoveryArchives()
			if err != nil || len(again) != 1 {
				t.Fatalf("restart: %#v %v", again, err)
			}
		})
	}
}

func TestStartupRecoveryCapturesOnlyPreviousSession(t *testing.T) {
	a := testApp(t)
	if err := a.SaveRecoverySnapshot(RecoverySnapshotInput{Path: "new.md", Content: "first input"}); err != nil {
		t.Fatal(err)
	}
	if snapshot, err := a.GetStartupRecoverySnapshot(); err != nil || snapshot != nil {
		t.Fatalf("offered this session: %#v %v", snapshot, err)
	}
	for i := 0; i < 3; i++ {
		if err := a.SaveRecoverySnapshot(RecoverySnapshotInput{Path: "new.md", Content: fmt.Sprint(i)}); err != nil {
			t.Fatal(err)
		}
	}
	archives, err := a.ListRecoveryArchives()
	if err != nil || len(archives) != 0 {
		t.Fatalf("archived every keystroke: %#v %v", archives, err)
	}
}

func TestStartupRecoveryPreservesMultipleSessionsWithoutDuplicate(t *testing.T) {
	a := seededStartupRecovery(t)
	if _, err := a.GetStartupRecoverySnapshot(); err != nil {
		t.Fatal(err)
	}
	duplicate := &App{preferencesOverride: a.preferencePath()}
	if _, err := duplicate.GetStartupRecoverySnapshot(); err != nil {
		t.Fatal(err)
	}
	items, _ := duplicate.ListRecoveryArchives()
	if len(items) != 1 {
		t.Fatal("duplicate", len(items))
	}
	if err := a.SaveRecoverySnapshot(RecoverySnapshotInput{Path: "new.md", Content: "new unsaved"}); err != nil {
		t.Fatal(err)
	}
	restarted := &App{preferencesOverride: a.preferencePath()}
	if _, err := restarted.GetStartupRecoverySnapshot(); err != nil {
		t.Fatal(err)
	}
	items, err := restarted.ListRecoveryArchives()
	if err != nil || len(items) != 2 {
		t.Fatalf("history lost: %#v %v", items, err)
	}
}

func TestRecoveryArchiveFailurePreservesOriginal(t *testing.T) {
	for _, cause := range []string{"directory-file", "limit", "invalid-snapshot"} {
		for _, action := range []string{"save", "clear"} {
			t.Run(cause+"-"+action, func(t *testing.T) {
				a := seededStartupRecovery(t)
				switch cause {
				case "directory-file":
					if err := os.WriteFile(a.recoveryArchiveDirectory(), []byte("do not overwrite"), 0600); err != nil {
						t.Fatal(err)
					}
				case "limit":
					if err := os.MkdirAll(a.recoveryArchiveDirectory(), 0700); err != nil {
						t.Fatal(err)
					}
					for i := 0; i < maxRecoveryArchives; i++ {
						if err := os.WriteFile(filepath.Join(a.recoveryArchiveDirectory(), fmt.Sprint(i)), []byte("keep"), 0600); err != nil {
							t.Fatal(err)
						}
					}
				case "invalid-snapshot":
					if err := os.WriteFile(a.recoverySnapshotPath(), []byte("unreadable recovery material"), 0600); err != nil {
						t.Fatal(err)
					}
				}
				before, _ := os.ReadFile(a.recoverySnapshotPath())
				var err error
				if action == "save" {
					err = a.SaveRecoverySnapshot(RecoverySnapshotInput{Path: "new.md", Content: "new"})
				} else {
					err = a.ClearRecoverySnapshot()
				}
				if err == nil {
					t.Fatal("expected preservation failure")
				}
				after, _ := os.ReadFile(a.recoverySnapshotPath())
				if !bytes.Equal(before, after) {
					t.Fatal("original overwritten on failure")
				}
			})
		}
	}
}

func TestRecoveryArchiveRejectsUnownedPathsAndTampering(t *testing.T) {
	a := seededStartupRecovery(t)
	if _, err := a.GetStartupRecoverySnapshot(); err != nil {
		t.Fatal(err)
	}
	items, _ := a.ListRecoveryArchives()
	id := items[0].ID
	for _, bad := range []string{"../old.md", "", strings.ToUpper(id), strings.Repeat("z", 64), id + "/../"} {
		if _, err := a.ReadRecoveryArchive(bad); err == nil {
			t.Fatal("unsafe id accepted", bad)
		}
	}
	path := filepath.Join(a.recoveryArchiveDirectory(), id+".qmr")
	if err := os.WriteFile(path, []byte("foreign content"), 0600); err != nil {
		t.Fatal(err)
	}
	if _, err := a.ReadRecoveryArchive(id); err == nil {
		t.Fatal("tampered archive accepted")
	}
	fresh := &App{preferencesOverride: a.preferencePath()}
	before, _ := os.ReadFile(a.recoverySnapshotPath())
	if err := fresh.ClearRecoverySnapshot(); err == nil {
		t.Fatal("tampered archive allowed clear")
	}
	after, _ := os.ReadFile(a.recoverySnapshotPath())
	if !bytes.Equal(before, after) {
		t.Fatal("original changed")
	}
}

func TestStartupRecoveryDoesNotChangeSourceDocument(t *testing.T) {
	a := seededStartupRecovery(t)
	old, _ := a.GetRecoveryBackup()
	if err := os.WriteFile(old.Path, []byte("external disk content"), 0600); err != nil {
		t.Fatal(err)
	}
	if err := a.ClearRecoverySnapshot(); err != nil {
		t.Fatal(err)
	}
	data, _ := os.ReadFile(old.Path)
	if string(data) != "external disk content" {
		t.Fatal("source modified")
	}
}

func TestStartupRecoveryRejectsLinkedArchiveDirectory(t *testing.T) {
	a := seededStartupRecovery(t)
	outside := t.TempDir()
	if err := os.Symlink(outside, a.recoveryArchiveDirectory()); err != nil {
		t.Skip("symlinks unavailable", err)
	}
	before, _ := os.ReadFile(a.recoverySnapshotPath())
	if err := a.ClearRecoverySnapshot(); err == nil {
		t.Fatal("linked directory accepted")
	}
	after, _ := os.ReadFile(a.recoverySnapshotPath())
	if !bytes.Equal(before, after) {
		t.Fatal("original changed")
	}
	entries, _ := os.ReadDir(outside)
	if len(entries) != 0 {
		t.Fatal("wrote through link")
	}
}

func TestRecoveryArchiveByteBudgetPreservesOriginal(t *testing.T) {
	a := seededStartupRecovery(t)
	if err := os.MkdirAll(a.recoveryArchiveDirectory(), 0700); err != nil {
		t.Fatal(err)
	}
	f, err := os.Create(filepath.Join(a.recoveryArchiveDirectory(), "reserved-material"))
	if err != nil {
		t.Fatal(err)
	}
	err = f.Truncate(maxRecoveryArchiveBytes)
	closeErr := f.Close()
	if err != nil {
		t.Fatal(err)
	}
	if closeErr != nil {
		t.Fatal(closeErr)
	}
	before, _ := os.ReadFile(a.recoverySnapshotPath())
	if err := a.ClearRecoverySnapshot(); err == nil || !strings.Contains(err.Error(), "RECOVERY_ARCHIVE_LIMIT") {
		t.Fatalf("budget bypassed: %v", err)
	}
	after, _ := os.ReadFile(a.recoverySnapshotPath())
	if !bytes.Equal(before, after) {
		t.Fatal("original changed at budget limit")
	}
}

func TestStartupRecoveryAlreadySavedNeedsNoArchive(t *testing.T) {
	a := seededStartupRecovery(t)
	snapshot, _ := a.GetRecoveryBackup()
	snapshot.Conflict = false
	if err := os.WriteFile(snapshot.Path, []byte(snapshot.Content), 0600); err != nil {
		t.Fatal(err)
	}
	data, _ := encodeRecoverySnapshot(*snapshot)
	if err := os.WriteFile(a.recoverySnapshotPath(), data, 0600); err != nil {
		t.Fatal(err)
	}
	got, err := a.GetStartupRecoverySnapshot()
	if err != nil || got != nil {
		t.Fatalf("offered resolved recovery: %#v %v", got, err)
	}
	items, err := a.ListRecoveryArchives()
	if err != nil || len(items) != 0 {
		t.Fatalf("archived saved content: %#v %v", items, err)
	}
}
