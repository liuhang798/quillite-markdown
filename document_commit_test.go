package main

import (
	"errors"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func assertDocumentBytes(t *testing.T, path, want string) {
	t.Helper()
	got, err := os.ReadFile(path)
	if err != nil || string(got) != want {
		t.Fatalf("%s: got %q, %v; want %q", path, got, err, want)
	}
}

func TestDocumentCommitConcurrentPublicationNeverOverwrites(t *testing.T) {
	dir := t.TempDir()
	target, staged := filepath.Join(dir, "document.md"), filepath.Join(dir, "stage.tmp")
	if err := os.WriteFile(target, []byte("original"), 0600); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(staged, []byte("editor"), 0600); err != nil {
		t.Fatal(err)
	}
	err := commitDocumentReplacementWithPublish(staged, target, documentRevision([]byte("original")), func(candidate, path string) error {
		// Reproduce a DIFFERENT editor's rename-save into the publication slot.
		f, err := os.OpenFile(path, os.O_CREATE|os.O_EXCL|os.O_WRONLY, 0600)
		if err != nil {
			t.Fatal(err)
		}
		if _, err = f.WriteString("external"); err != nil {
			t.Fatal(err)
		}
		f.Close()
		return publishDocumentFile(candidate, path)
	})
	if !errors.Is(err, errDocumentConflict) {
		t.Fatalf("expected conflict: %v", err)
	}
	assertDocumentBytes(t, target, "external")
	backups, _ := filepath.Glob(filepath.Join(dir, ".quillite-save-recovery-*"))
	if len(backups) != 1 {
		t.Fatalf("missing recovery directory: %v", backups)
	}
	assertDocumentBytes(t, filepath.Join(backups[0], "original"), "original")
	assertDocumentBytes(t, filepath.Join(backups[0], "candidate"), "editor")
}

func TestDocumentCommitRejectsStaleRevisionAndKeepsOriginal(t *testing.T) {
	dir := t.TempDir()
	target := filepath.Join(dir, "document.md")
	staged := filepath.Join(dir, "stage")
	os.WriteFile(target, []byte("external"), 0600)
	os.WriteFile(staged, []byte("editor"), 0600)
	if err := commitDocumentReplacement(staged, target, documentRevision([]byte("old"))); !errors.Is(err, errDocumentConflict) {
		t.Fatalf("got %v", err)
	}
	assertDocumentBytes(t, target, "external")
	assertDocumentBytes(t, staged, "editor")
}

func TestDocumentCommitMissingStageFailsBeforeMovingOriginal(t *testing.T) {
	dir := t.TempDir()
	target := filepath.Join(dir, "document.md")
	os.WriteFile(target, []byte("original"), 0600)
	err := commitDocumentReplacement(filepath.Join(dir, "missing"), target, documentRevision([]byte("original")))
	if err == nil || !strings.Contains(err.Error(), "DOCUMENT_SAFE_SAVE_ACCESS") {
		t.Fatalf("got %v", err)
	}
	assertDocumentBytes(t, target, "original")
	if err := writeDocumentWithRevision(target, []byte("retry"), documentRevision([]byte("original"))); err != nil {
		t.Fatal(err)
	}
	assertDocumentBytes(t, target, "retry")
}

func TestDocumentCommitRollbackAllowsNextSaveAndKeepsPreparedContent(t *testing.T) {
	dir := t.TempDir()
	target, staged := filepath.Join(dir, "document.md"), filepath.Join(dir, "stage")
	os.WriteFile(target, []byte("original"), 0600)
	os.WriteFile(staged, []byte("editor"), 0600)
	err := commitDocumentReplacementWithPublish(staged, target, documentRevision([]byte("original")), func(_, _ string) error { return os.ErrPermission })
	if err == nil || !strings.Contains(err.Error(), "original restored") {
		t.Fatalf("got %v", err)
	}
	assertDocumentBytes(t, target, "original")
	copies, _ := filepath.Glob(filepath.Join(dir, ".quillite-save-recovery-*", "candidate"))
	if len(copies) != 1 {
		t.Fatal("prepared content lost")
	}
	assertDocumentBytes(t, copies[0], "editor")
	if err = writeDocumentWithRevision(target, []byte("retry"), documentRevision([]byte("original"))); err != nil {
		t.Fatal(err)
	}
	assertDocumentBytes(t, target, "retry")
	assertDocumentBytes(t, copies[0], "editor")
}

func TestDocumentCommitConcurrentDirectoryIsNeverRemoved(t *testing.T) {
	dir := t.TempDir()
	target, staged := filepath.Join(dir, "document.md"), filepath.Join(dir, "stage")
	os.WriteFile(target, []byte("original"), 0600)
	os.WriteFile(staged, []byte("editor"), 0600)
	err := commitDocumentReplacementWithPublish(staged, target, documentRevision([]byte("original")), func(candidate, path string) error {
		if err := os.Mkdir(path, 0700); err != nil {
			t.Fatal(err)
		}
		if err := os.WriteFile(filepath.Join(path, "user.md"), []byte("unrelated"), 0600); err != nil {
			t.Fatal(err)
		}
		return publishDocumentFile(candidate, path)
	})
	if !errors.Is(err, errDocumentConflict) {
		t.Fatalf("got %v", err)
	}
	assertDocumentBytes(t, filepath.Join(target, "user.md"), "unrelated")
	backups, _ := filepath.Glob(filepath.Join(dir, ".quillite-save-recovery-*", "original"))
	if len(backups) != 1 {
		t.Fatal("original lost")
	}
	assertDocumentBytes(t, backups[0], "original")
}

func TestDocumentCommitNewFileRaceIsCreateOnly(t *testing.T) {
	dir := t.TempDir()
	target, staged := filepath.Join(dir, "new.md"), filepath.Join(dir, "stage")
	os.WriteFile(staged, []byte("editor"), 0600)
	err := commitDocumentReplacementWithPublish(staged, target, "", func(candidate, path string) error {
		if err := os.WriteFile(path, []byte("external"), 0600); err != nil {
			t.Fatal(err)
		}
		return publishDocumentFile(candidate, path)
	})
	if err == nil {
		t.Fatal("new file collision accepted")
	}
	assertDocumentBytes(t, target, "external")
	assertDocumentBytes(t, staged, "editor")
}

func TestInstallerLifecycleKeepsProductionOwnershipChecks(t *testing.T) {
	script, err := os.ReadFile("scripts/test-windows-install-lifecycle.ps1")
	if err != nil {
		t.Fatal(err)
	}
	source := string(script)
	for _, required := range []string{"$uninstall = Join-Path $destination 'uninstall.exe'", "/S _?=$destination", "github-hosted", "Assert-Documents"} {
		if !strings.Contains(source, required) {
			t.Fatalf("missing %s", required)
		}
	}
	if strings.Contains(source, "Copy-Item") {
		t.Fatal("lifecycle test must execute the installed uninstaller itself")
	}
	nsis, err := os.ReadFile("build/windows/installer/project.nsi")
	if err != nil {
		t.Fatal(err)
	}
	if !strings.Contains(string(nsis), `StrCmp $EXEPATH "$INSTDIR\uninstall.exe"`) {
		t.Fatal("uninstaller identity guard missing")
	}
}
