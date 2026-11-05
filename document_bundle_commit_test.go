package main

import (
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"io"
	"os"
	"path/filepath"
	"runtime"
	"strings"
	"testing"
)

func TestBundleCommitExplicitLargeRevisionLimitDoesNotWidenOrdinaryReader(t *testing.T) {
	dir := t.TempDir()
	target, staged := filepath.Join(dir, "archive.textpack"), filepath.Join(dir, "stage")
	file, err := os.Create(target)
	if err != nil {
		t.Fatal(err)
	}
	if err = file.Truncate(maxSupportedDocumentBytes + 1); err != nil {
		t.Fatal(err)
	}
	if err = file.Close(); err != nil {
		t.Fatal(err)
	}
	file, err = os.Open(target)
	if err != nil {
		t.Fatal(err)
	}
	hash := sha256.New()
	if _, err = io.Copy(hash, file); err != nil {
		t.Fatal(err)
	}
	file.Close()
	revision := hex.EncodeToString(hash.Sum(nil))
	if _, err = readDocumentBytes(target); err == nil {
		t.Fatal("ordinary document reader accepted a body above 64 MiB")
	}
	if err = checkDocumentRevision(target, revision); !errors.Is(err, errDocumentConflict) {
		t.Fatalf("ordinary revision check was widened: %v", err)
	}
	if err = checkDocumentRevisionWithLimit(target, revision, maxDocumentRevisionBytes); err != nil {
		t.Fatal(err)
	}
	if err = os.WriteFile(staged, []byte("new archive bytes"), 0600); err != nil {
		t.Fatal(err)
	}
	if err = commitDocumentReplacementAt(staged, target, revision, maxDocumentRevisionBytes, dir, nil); err != nil {
		t.Fatalf("explicit archive limit not used while checking isolated original: %v", err)
	}
	assertDocumentBytes(t, target, "new archive bytes")
}

func TestBundleRevisionLimitIsExplicitBoundedAndNotInferredFromExtension(t *testing.T) {
	dir := t.TempDir()
	target, staged := filepath.Join(dir, "original"), filepath.Join(dir, "stage")
	os.WriteFile(target, []byte("old"), 0600)
	os.WriteFile(staged, []byte("new"), 0600)
	for _, limit := range []int64{-1, 0, maxDocumentRevisionBytes + 1} {
		if err := commitDocumentReplacementAt(staged, target, documentRevision([]byte("old")), limit, dir, nil); !errors.Is(err, errDocumentConflict) {
			t.Fatalf("invalid limit %d accepted: %v", limit, err)
		}
		assertDocumentBytes(t, target, "old")
		assertDocumentBytes(t, staged, "new")
	}
	if err := checkDocumentRevisionReaderWithLimit(strings.NewReader("original"), documentRevision([]byte("original")), 3); !errors.Is(err, errDocumentConflict) {
		t.Fatalf("reader bypassed explicit byte bound: %v", err)
	}
	if err := commitDocumentReplacementAt(staged, target, documentRevision([]byte("old")), 1024, dir, nil); err != nil {
		t.Fatal(err)
	}
	assertDocumentBytes(t, target, "new")
}

func TestBundleCommitCallbackRejectsAfterIsolationAndPreservesRecoveryOutsideBundle(t *testing.T) {
	parent := t.TempDir()
	bundle := filepath.Join(parent, "sample.textbundle")
	if err := os.Mkdir(bundle, 0700); err != nil {
		t.Fatal(err)
	}
	target, staged := filepath.Join(bundle, "text.md"), filepath.Join(parent, "stage")
	os.WriteFile(target, []byte("original"), 0600)
	os.WriteFile(staged, []byte("editor"), 0600)
	os.WriteFile(filepath.Join(bundle, "info.json"), []byte(`{"version":2,"custom":"keep"}`), 0600)
	calls := 0
	err := commitDocumentReplacementAt(staged, target, documentRevision([]byte("original")), maxSupportedDocumentBytes, parent, func() error {
		calls++
		if _, err := os.Lstat(target); !os.IsNotExist(err) {
			t.Fatalf("callback must run after original isolation: %v", err)
		}
		candidates, _ := filepath.Glob(filepath.Join(parent, ".quillite-save-recovery-*", "candidate"))
		if len(candidates) != 1 {
			t.Fatalf("missing prepared candidate: %v", candidates)
		}
		assertDocumentBytes(t, candidates[0], "editor")
		return errDocumentConflict
	})
	if !errors.Is(err, errDocumentConflict) || !strings.Contains(err.Error(), "original restored") || calls != 1 {
		t.Fatalf("callback rejection not retained: %v, calls %d", err, calls)
	}
	assertDocumentBytes(t, target, "original")
	assertDocumentBytes(t, filepath.Join(bundle, "info.json"), `{"version":2,"custom":"keep"}`)
	inside, _ := filepath.Glob(filepath.Join(bundle, ".quillite-save-recovery-*"))
	if len(inside) != 0 {
		t.Fatalf("recovery polluted bundle tree: %v", inside)
	}
	candidates, _ := filepath.Glob(filepath.Join(parent, ".quillite-save-recovery-*", "candidate"))
	if len(candidates) != 1 {
		t.Fatal("prepared editor bytes lost after rejection")
	}
	assertDocumentBytes(t, candidates[0], "editor")
}

func TestBundleCommitCallbackCannotOverwriteAConcurrentPublicReplacement(t *testing.T) {
	dir := t.TempDir()
	target, staged := filepath.Join(dir, "text.md"), filepath.Join(dir, "stage")
	os.WriteFile(target, []byte("original"), 0600)
	os.WriteFile(staged, []byte("editor"), 0600)
	err := commitDocumentReplacementAt(staged, target, documentRevision([]byte("original")), maxSupportedDocumentBytes, dir, func() error {
		if err := os.WriteFile(target, []byte("external"), 0600); err != nil {
			t.Fatal(err)
		}
		return errDocumentConflict
	})
	if !errors.Is(err, errDocumentConflict) {
		t.Fatalf("got %v", err)
	}
	assertDocumentBytes(t, target, "external")
	backups, _ := filepath.Glob(filepath.Join(dir, ".quillite-save-recovery-*"))
	if len(backups) != 1 {
		t.Fatalf("missing retained recovery: %v", backups)
	}
	assertDocumentBytes(t, filepath.Join(backups[0], "original"), "original")
	assertDocumentBytes(t, filepath.Join(backups[0], "candidate"), "editor")
}

func TestBundleCommitSuccessUsesOutsideRecoveryRoot(t *testing.T) {
	parent := t.TempDir()
	bundle := filepath.Join(parent, "bundle.textbundle")
	os.Mkdir(bundle, 0700)
	target, staged := filepath.Join(bundle, "text.md"), filepath.Join(parent, "stage")
	os.WriteFile(target, []byte("original"), 0600)
	os.WriteFile(staged, []byte("editor"), 0600)
	called := false
	if err := commitDocumentReplacementAt(staged, target, documentRevision([]byte("original")), maxSupportedDocumentBytes, parent, func() error { called = true; return nil }); err != nil {
		t.Fatal(err)
	}
	if !called {
		t.Fatal("callback not called")
	}
	assertDocumentBytes(t, target, "editor")
	inside, _ := filepath.Glob(filepath.Join(bundle, ".quillite-save-recovery-*"))
	if len(inside) != 0 {
		t.Fatalf("recovery polluted bundle: %v", inside)
	}
	if runtime.GOOS != "windows" {
		originals, _ := filepath.Glob(filepath.Join(parent, ".quillite-save-recovery-*", "original"))
		if len(originals) != 1 {
			t.Fatal("POSIX original inode not retained")
		}
		assertDocumentBytes(t, originals[0], "original")
	}
}

func TestBundleCommitRejectsUnsafeRecoveryRootWithoutChangingUserFiles(t *testing.T) {
	dir := t.TempDir()
	target, staged := filepath.Join(dir, "text.md"), filepath.Join(dir, "stage")
	os.WriteFile(target, []byte("original"), 0600)
	os.WriteFile(staged, []byte("editor"), 0600)
	for _, root := range []string{"relative", filepath.Join(dir, "missing"), target} {
		if err := commitDocumentReplacementAt(staged, target, documentRevision([]byte("original")), maxSupportedDocumentBytes, root, nil); err == nil {
			t.Fatalf("unsafe recovery root accepted: %q", root)
		}
		assertDocumentBytes(t, target, "original")
		assertDocumentBytes(t, staged, "editor")
	}
	link := filepath.Join(dir, "linked")
	if err := os.Symlink(dir, link); err != nil {
		t.Skipf("symlink unavailable: %v", err)
	}
	if err := commitDocumentReplacementAt(staged, target, documentRevision([]byte("original")), maxSupportedDocumentBytes, link, nil); err == nil {
		t.Fatal("linked recovery parent accepted")
	}
	assertDocumentBytes(t, target, "original")
}

func TestBundleCommitMetadataGuardKeepsHardLinkedUserBytes(t *testing.T) {
	dir := t.TempDir()
	target, alias, staged := filepath.Join(dir, "archive.textpack"), filepath.Join(dir, "user-alias"), filepath.Join(dir, "stage")
	if err := os.WriteFile(target, []byte("original"), 0600); err != nil {
		t.Fatal(err)
	}
	if err := os.Link(target, alias); err != nil {
		t.Skipf("hard links unavailable: %v", err)
	}
	if err := os.WriteFile(staged, []byte("editor"), 0600); err != nil {
		t.Fatal(err)
	}
	err := commitDocumentReplacementAt(staged, target, documentRevision([]byte("original")), maxDocumentRevisionBytes, dir, nil)
	if err == nil || !strings.Contains(err.Error(), "DOCUMENT_METADATA_REQUIRES_COPY") {
		t.Fatalf("linked metadata accepted: %v", err)
	}
	assertDocumentBytes(t, target, "original")
	assertDocumentBytes(t, alias, "original")
	assertDocumentBytes(t, staged, "editor")
	recoveries, _ := filepath.Glob(filepath.Join(dir, ".quillite-save-recovery-*"))
	if len(recoveries) != 0 {
		t.Fatal("metadata rejection should precede isolation")
	}
}

func TestBundleCommitNewPathCallbackRejectionIsCreateOnly(t *testing.T) {
	dir := t.TempDir()
	target, staged := filepath.Join(dir, "new.textpack"), filepath.Join(dir, "stage")
	os.WriteFile(staged, []byte("editor"), 0600)
	err := commitDocumentReplacementAt(staged, target, "", maxDocumentRevisionBytes, dir, func() error { return errDocumentConflict })
	if !errors.Is(err, errDocumentConflict) {
		t.Fatalf("callback ignored: %v", err)
	}
	if _, err := os.Lstat(target); !os.IsNotExist(err) {
		t.Fatalf("new public path unexpectedly published: %v", err)
	}
	assertDocumentBytes(t, staged, "editor")
}
