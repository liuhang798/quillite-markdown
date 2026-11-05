package main

import (
	"errors"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func bundleWriterTestDirectory(t *testing.T) string {
	t.Helper()
	dir, err := filepath.EvalSymlinks(t.TempDir())
	if err != nil {
		t.Fatal(err)
	}
	return dir
}

func TestBundleWriterPreservesModeAndStagesOutsidePackage(t *testing.T) {
	dir := bundleWriterTestDirectory(t)
	bundle := filepath.Join(dir, "example.textbundle")
	if err := os.Mkdir(bundle, 0700); err != nil {
		t.Fatal(err)
	}
	target := filepath.Join(bundle, "text.md")
	if err := os.WriteFile(target, []byte("original"), 0640); err != nil {
		t.Fatal(err)
	}
	before, _ := os.Stat(target)
	if err := writeBundleDocumentWithRevision(target, []byte("editor"), documentRevision([]byte("original")), maxSupportedDocumentBytes, dir, nil); err != nil {
		t.Fatal(err)
	}
	assertDocumentBytes(t, target, "editor")
	after, _ := os.Stat(target)
	if before.Mode().Perm() != after.Mode().Perm() {
		t.Fatalf("permissions changed: %v -> %v", before.Mode(), after.Mode())
	}
	entries, err := os.ReadDir(bundle)
	if err != nil || len(entries) != 1 || entries[0].Name() != "text.md" {
		t.Fatalf("save material polluted package: %v %v", entries, err)
	}
	stages, _ := filepath.Glob(filepath.Join(dir, ".quillite-bundle-stage-*"))
	if len(stages) != 0 {
		t.Fatalf("empty successful stages were not removed: %v", stages)
	}
}

func TestBundleWriterFailureRetainsCompleteStageAndOtherUserFiles(t *testing.T) {
	dir := bundleWriterTestDirectory(t)
	target := filepath.Join(dir, "archive.textpack")
	os.WriteFile(target, []byte("original"), 0600)
	os.WriteFile(filepath.Join(dir, "notes.md"), []byte("user"), 0600)
	err := writeBundleDocumentWithRevision(target, []byte("editor"), documentRevision([]byte("original")), maxDocumentRevisionBytes, dir, func() error { return errDocumentConflict })
	if !errors.Is(err, errDocumentConflict) || !strings.Contains(err.Error(), "bundle save preparation retained at") {
		t.Fatalf("missing retained material guidance: %v", err)
	}
	assertDocumentBytes(t, target, "original")
	assertDocumentBytes(t, filepath.Join(dir, "notes.md"), "user")
	stages, _ := filepath.Glob(filepath.Join(dir, ".quillite-bundle-stage-*"))
	if len(stages) != 1 {
		t.Fatalf("failure stage removed: %v", stages)
	}
	if !strings.Contains(err.Error(), stages[0]) {
		t.Fatal("retained stage location omitted")
	}
	// replaceDocumentFile already moved the complete stage into the separately
	// retained candidate before policy rejected publication.
	candidates, _ := filepath.Glob(filepath.Join(dir, ".quillite-save-recovery-*", "candidate"))
	if len(candidates) != 1 {
		t.Fatal("complete editor bytes missing")
	}
	assertDocumentBytes(t, candidates[0], "editor")
}

func TestBundleWriterSuccessNeverDeletesAddedForeignStageContent(t *testing.T) {
	dir := bundleWriterTestDirectory(t)
	target := filepath.Join(dir, "archive.textpack")
	os.WriteFile(target, []byte("original"), 0600)
	var foreign string
	err := writeBundleDocumentWithRevision(target, []byte("editor"), documentRevision([]byte("original")), maxDocumentRevisionBytes, dir, func() error {
		stages, _ := filepath.Glob(filepath.Join(dir, ".quillite-bundle-stage-*"))
		if len(stages) != 1 {
			t.Fatalf("stage not present during callback: %v", stages)
		}
		foreign = filepath.Join(stages[0], "user-created.md")
		return os.WriteFile(foreign, []byte("unrelated"), 0600)
	})
	if err != nil {
		t.Fatal(err)
	}
	assertDocumentBytes(t, target, "editor")
	assertDocumentBytes(t, foreign, "unrelated")
}

func TestBundleWriterSuccessNeverDeletesReplacedStageDirectory(t *testing.T) {
	dir := bundleWriterTestDirectory(t)
	target := filepath.Join(dir, "archive.textpack")
	os.WriteFile(target, []byte("original"), 0600)
	var replaced, retained string
	err := writeBundleDocumentWithRevision(target, []byte("editor"), documentRevision([]byte("original")), maxDocumentRevisionBytes, dir, func() error {
		stages, _ := filepath.Glob(filepath.Join(dir, ".quillite-bundle-stage-*"))
		if len(stages) != 1 {
			t.Fatalf("stage missing: %v", stages)
		}
		replaced, retained = stages[0], stages[0]+"-moved"
		if err := os.Rename(replaced, retained); err != nil {
			return err
		}
		if err := os.Mkdir(replaced, 0700); err != nil {
			return err
		}
		return os.WriteFile(filepath.Join(replaced, "user.md"), []byte("foreign directory"), 0600)
	})
	if err != nil {
		t.Fatal(err)
	}
	assertDocumentBytes(t, target, "editor")
	assertDocumentBytes(t, filepath.Join(replaced, "user.md"), "foreign directory")
	if info, err := os.Stat(retained); err != nil || !info.IsDir() {
		t.Fatalf("owned moved stage removed: %v", err)
	}
}

func TestBundleWriterRejectsMissingStaleAndOversizedRequestsBeforeStaging(t *testing.T) {
	dir := bundleWriterTestDirectory(t)
	target := filepath.Join(dir, "archive.textpack")
	os.WriteFile(target, []byte("external"), 0600)
	for _, revision := range []string{"", "bad", documentRevision([]byte("old"))} {
		if err := writeBundleDocumentWithRevision(target, []byte("editor"), revision, maxDocumentRevisionBytes, dir, nil); err == nil {
			t.Fatalf("unsafe base revision accepted: %q", revision)
		}
	}
	if err := writeBundleDocumentWithRevision(target, []byte("too large"), documentRevision([]byte("external")), 1, dir, nil); err == nil {
		t.Fatal("explicit size cap bypassed")
	}
	if err := writeBundleDocumentWithRevision(filepath.Join(dir, "missing"), []byte("editor"), documentRevision([]byte("old")), maxDocumentRevisionBytes, dir, nil); !errors.Is(err, errDocumentConflict) {
		t.Fatalf("missing original accepted: %v", err)
	}
	assertDocumentBytes(t, target, "external")
	stages, _ := filepath.Glob(filepath.Join(dir, ".quillite-bundle-stage-*"))
	if len(stages) != 0 {
		t.Fatalf("rejected input created stages: %v", stages)
	}
}

func TestBundleWriterRejectsSymlinkAndHardlinkTargetsBeforeStaging(t *testing.T) {
	dir := bundleWriterTestDirectory(t)
	target, alias := filepath.Join(dir, "archive.textpack"), filepath.Join(dir, "alias")
	os.WriteFile(target, []byte("original"), 0600)
	if err := os.Link(target, alias); err != nil {
		t.Skipf("hard links unavailable: %v", err)
	}
	if err := writeBundleDocumentWithRevision(target, []byte("editor"), documentRevision([]byte("original")), maxDocumentRevisionBytes, dir, nil); err == nil {
		t.Fatal("hard-linked target accepted")
	}
	assertDocumentBytes(t, target, "original")
	assertDocumentBytes(t, alias, "original")
	link := filepath.Join(dir, "symbolic")
	if err := os.Symlink(target, link); err != nil {
		t.Skipf("symbolic links unavailable: %v", err)
	}
	if err := writeBundleDocumentWithRevision(link, []byte("editor"), documentRevision([]byte("original")), maxDocumentRevisionBytes, dir, nil); err == nil {
		t.Fatal("symlink target accepted")
	}
	stages, _ := filepath.Glob(filepath.Join(dir, ".quillite-bundle-stage-*"))
	if len(stages) != 0 {
		t.Fatalf("linked target created stages: %v", stages)
	}
}

func TestBundleWriterNeverRecreatesMissingOriginalEvenWithEmptyRevision(t *testing.T) {
	dir := bundleWriterTestDirectory(t)
	target := filepath.Join(dir, "new.textpack")
	for _, revision := range []string{"", documentRevision([]byte("missing old content"))} {
		if err := writeBundleDocumentWithRevision(target, []byte("editor"), revision, maxDocumentRevisionBytes, dir, nil); !errors.Is(err, errDocumentConflict) {
			t.Fatalf("missing original recreated: %v", err)
		}
	}
	if _, err := os.Lstat(target); !os.IsNotExist(err) {
		t.Fatalf("missing source unexpectedly recreated: %v", err)
	}
	stages, _ := filepath.Glob(filepath.Join(dir, ".quillite-bundle-stage-*"))
	if len(stages) != 0 {
		t.Fatal("missing original created staging material")
	}
}
