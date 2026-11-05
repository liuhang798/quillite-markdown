package main

import (
	"errors"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestBundleAuditRecoveryIdentityCannotRetargetOrDiscardValidDraft(t *testing.T) {
	app := bundleIntegrationApp(t)
	source, original := bundleIntegrationFixture(t, "textpack")
	doc := bundleIntegrationRead(t, app, source)
	valid := RecoverySnapshotInput{BundleKind: doc.BundleKind, BundleSessionID: doc.BundleSessionID,
		Path: source, Name: doc.Name, Directory: doc.Directory, BaseRevision: doc.Revision, Content: "recoverable draft"}
	if err := app.SaveRecoverySnapshot(valid); err != nil {
		t.Fatal(err)
	}
	foreign := filepath.Join(filepath.Dir(source), "unrelated.md")
	if err := os.WriteFile(foreign, []byte("foreign document"), 0600); err != nil {
		t.Fatal(err)
	}
	for _, mutate := range []func(*RecoverySnapshotInput){
		func(input *RecoverySnapshotInput) { input.Path = foreign },
		func(input *RecoverySnapshotInput) { input.BundleKind = "textbundle" },
		func(input *RecoverySnapshotInput) { input.BundleSessionID = strings.Repeat("f", 32) },
		func(input *RecoverySnapshotInput) { input.BundleSessionID = "../escape" },
	} {
		forged := valid
		mutate(&forged)
		if err := app.SaveRecoverySnapshot(forged); err == nil {
			t.Fatalf("forged recovery accepted: %+v", forged)
		}
		backup, err := app.GetRecoveryBackup()
		if err != nil || backup == nil || backup.Path != source || backup.Content != valid.Content || backup.BundleSessionID != doc.BundleSessionID {
			t.Fatalf("rejected recovery discarded valid draft: %+v %v", backup, err)
		}
	}
	if _, err := app.ResumeBundleDocument(foreign, doc.BundleSessionID, doc.Revision); err == nil {
		t.Fatal("workspace identity could be retargeted")
	}
	resume, err := app.ResumeBundleDocument(source, doc.BundleSessionID, "")
	if err != nil || !resume.BundleConflict || resume.Revision != "" {
		t.Fatalf("unknown recovery revision silently adopted disk: %+v %v", resume, err)
	}
	if _, err := app.SaveBundleDocument(source, valid.Content, "", doc.BundleSessionID); !errors.Is(err, errDocumentConflict) {
		t.Fatalf("unknown recovery revision authorized overwrite: %v", err)
	}
	disk, err := readEditableBundle(source)
	if err != nil || disk.Revision != original.Revision {
		t.Fatal("recovery authorization checks modified original")
	}
	assertDocumentBytes(t, foreign, "foreign document")
}
