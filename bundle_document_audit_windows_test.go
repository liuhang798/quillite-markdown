//go:build windows

package main

import (
	"bytes"
	"errors"
	"path/filepath"
	"testing"

	"golang.org/x/sys/windows"
)

func TestBundleAuditManifestFailureReturnsCommittedReceiptAndKeepsRecoveryCopyable(t *testing.T) {
	for _, kind := range []string{"textpack", "textbundle"} {
		t.Run(kind, func(t *testing.T) {
			app := bundleIntegrationApp(t)
			source, original := bundleIntegrationFixture(t, kind)
			doc := bundleIntegrationRead(t, app, source)
			png := textPackTestPNG(t)
			bundleIntegrationStage(t, doc, "assets/committed-before-warning.png", png)
			manifestPath := filepath.Join(app.bundleWorkspaceRoot(), doc.BundleSessionID, "manifest.json")
			wide, err := windows.UTF16PtrFromString(manifestPath)
			if err != nil {
				t.Fatal(err)
			}
			// Readers remain permitted, but atomic manifest replacement is denied.
			// The original package is a different file and can save successfully.
			handle, err := windows.CreateFile(wide, windows.GENERIC_READ, windows.FILE_SHARE_READ, nil, windows.OPEN_EXISTING, windows.FILE_FLAG_OPEN_REPARSE_POINT, 0)
			if err != nil {
				t.Fatal(err)
			}
			defer windows.CloseHandle(handle)
			content := doc.Content + "\nSaved body\n![Saved](assets/committed-before-warning.png)\n"
			receipt, err := app.SaveBundleDocument(source, content, doc.Revision, doc.BundleSessionID)
			if err != nil || receipt == nil || receipt.Warning != "BUNDLE_SESSION_PERSIST_WARNING" || receipt.Content != content || receipt.Revision == doc.Revision {
				t.Fatalf("committed write falsely failed or returned old receipt: %+v %v", receipt, err)
			}
			disk, err := readEditableBundle(source)
			if err != nil || disk.Content != content || disk.Revision != receipt.Revision || !bytes.Equal(disk.Files["assets/committed-before-warning.png"], png) {
				t.Fatalf("warning receipt not backed by durable package: %v", err)
			}
			bundleIntegrationAssertMetadata(t, original, disk)
			manifest, _, err := app.bundleManifest(doc.BundleSessionID)
			if err != nil || manifest.CurrentRevision != doc.Revision {
				t.Fatalf("fixture did not retain old manifest: %+v %v", manifest, err)
			}
			// Simulate more typing after the acknowledged save. The new revision
			// must remain in the recovery record even though manifest is older.
			bundleIntegrationStage(t, receipt, "assets/unsaved-after-warning.png", png)
			draft := content + "\nLater unsaved edits\n![Pending](assets/unsaved-after-warning.png)\n"
			input := RecoverySnapshotInput{BundleKind: receipt.BundleKind, BundleSessionID: receipt.BundleSessionID,
				Path: source, Name: receipt.Name, Directory: receipt.Directory, BaseRevision: receipt.Revision, Content: draft}
			if err := app.SaveRecoverySnapshot(input); err != nil {
				t.Fatalf("committed revision could not be backed up: %v", err)
			}
			restarted := NewApp()
			restarted.preferencesOverride = app.preferencesOverride
			snapshot, err := restarted.GetStartupRecoverySnapshot()
			if err != nil || snapshot == nil || snapshot.BaseRevision != receipt.Revision || snapshot.BundleSessionID != receipt.BundleSessionID || snapshot.Content != draft {
				t.Fatalf("restart lost acknowledged revision/draft: %+v %v", snapshot, err)
			}
			resumed, err := restarted.ResumeBundleDocument(source, snapshot.BundleSessionID, snapshot.BaseRevision)
			if err != nil || resumed == nil || !resumed.BundleConflict || resumed.Revision != receipt.Revision {
				t.Fatalf("old manifest silently authorized another save: %+v %v", resumed, err)
			}
			if _, err := restarted.SaveBundleDocument(source, draft, receipt.Revision, receipt.BundleSessionID); !errors.Is(err, errDocumentConflict) {
				t.Fatalf("stale manifest authorized automatic overwrite: %v", err)
			}
			copyPath := filepath.Join(filepath.Dir(source), "Recovered-after-warning.textpack")
			copyDoc, err := restarted.saveBundleCopyTo(source, copyPath, draft, snapshot.BundleSessionID)
			if err != nil || copyDoc == nil || copyDoc.Content != draft {
				t.Fatalf("complete copy could not recover from manifest failure: %+v %v", copyDoc, err)
			}
			copied, err := readEditableBundle(copyPath)
			if err != nil || copied.Content != draft || !bytes.Equal(copied.Files["assets/committed-before-warning.png"], png) || !bytes.Equal(copied.Files["assets/unsaved-after-warning.png"], png) {
				t.Fatalf("recovered copy lost draft/attachments: %v", err)
			}
			bundleIntegrationAssertMetadata(t, original, copied)
			afterCopy, err := readEditableBundle(source)
			if err != nil || afterCopy.Revision != receipt.Revision {
				t.Fatal("recovery copy changed the original")
			}
		})
	}
}
