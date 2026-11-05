package main

import (
	"encoding/base64"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestRenameDocumentPreservesContentsAndAttachments(t *testing.T) {
	a := testApp(t)
	dir := t.TempDir()
	path := filepath.Join(dir, "原名.md")
	content := "# 正文标题\n![图](assets/a.webp)\n"
	if err := os.WriteFile(path, []byte(content), 0600); err != nil {
		t.Fatal(err)
	}
	_ = os.Mkdir(filepath.Join(dir, "assets"), 0700)
	asset := filepath.Join(dir, "assets", "a.webp")
	_ = os.WriteFile(asset, []byte("keep"), 0600)
	a.markDraft(path)
	_ = a.rememberFile(path)
	doc, err := a.RenameDocument(path, "新名.md", documentRevision([]byte(content)))
	if err != nil {
		t.Fatal(err)
	}
	if doc.Content != content || doc.ReplacedPath != path || !doc.Draft {
		t.Fatalf("receipt: %+v", doc)
	}
	if _, err := os.Stat(path); !os.IsNotExist(err) {
		t.Fatalf("old name remains: %v", err)
	}
	data, _ := os.ReadFile(doc.Path)
	if string(data) != content {
		t.Fatal("content changed")
	}
	image, _ := os.ReadFile(asset)
	if string(image) != "keep" {
		t.Fatal("attachment changed")
	}
	p, _ := a.readPreferences()
	if indexPreferencePath(p.DraftFiles, doc.Path) < 0 || indexPreferencePath(p.RecentFiles, doc.Path) < 0 {
		t.Fatalf("paths not migrated: %+v", p)
	}
}

func TestRenameRejectsStaleRevisionAndExistingDestination(t *testing.T) {
	dir := t.TempDir()
	path := filepath.Join(dir, "a.md")
	other := filepath.Join(dir, "b.md")
	_ = os.WriteFile(path, []byte("current"), 0600)
	_ = os.WriteFile(other, []byte("other"), 0600)
	for _, item := range []struct{ name, revision string }{{"b.md", documentRevision([]byte("current"))}, {"c.md", documentRevision([]byte("stale"))}, {"c.txt", documentRevision([]byte("current"))}} {
		if _, _, err := renameDocument(path, item.name, item.revision); err == nil {
			t.Fatal("unsafe rename accepted")
		}
	}
	a, _ := os.ReadFile(path)
	b, _ := os.ReadFile(other)
	if string(a) != "current" || string(b) != "other" {
		t.Fatal("existing file changed")
	}
}

func TestDocumentNamesRejectPathsAndReservedNames(t *testing.T) {
	for _, name := range []string{"../x.md", `..\x.md`, "CON.md", "LPT1.txt", "a.md.", " a.md", "a.md ", "", "a.exe", "x\ny.md", "x:y.md"} {
		if validateDocumentName(name) == nil {
			t.Errorf("accepted %q", name)
		}
	}
	for _, name := range []string{"说明.md", "notes.markdown", "title.txt"} {
		if err := validateDocumentName(name); err != nil {
			t.Fatal(err)
		}
	}
}

func TestRenameCreateOnlyPublication(t *testing.T) {
	dir := t.TempDir()
	a := filepath.Join(dir, "a.md")
	b := filepath.Join(dir, "b.md")
	_ = os.WriteFile(a, []byte("A"), 0600)
	_ = os.WriteFile(b, []byte("B"), 0600)
	info, _ := os.Stat(a)
	if moveDocumentNoReplace(a, b, documentRevision([]byte("A")), info) == nil {
		t.Fatal("replaced destination")
	}
	old, _ := os.ReadFile(a)
	other, _ := os.ReadFile(b)
	if string(old) != "A" || string(other) != "B" {
		t.Fatal("files changed")
	}
}

func TestSaveCopyNeverOverwritesAndKeepsDraftOnFailure(t *testing.T) {
	a := testApp(t)
	// macOS temporary directories may start at the /var symlink. This test
	// exercises a permitted destination, not the separate alias-rejection rule.
	dir := textPackTestDirectory(t)
	source := filepath.Join(dir, "draft.md")
	target := filepath.Join(dir, "saved.md")
	_ = os.WriteFile(source, []byte("draft"), 0600)
	_ = os.WriteFile(target, []byte("existing"), 0600)
	a.markDraft(source)
	if _, err := a.SaveDocumentCopy(source, target, "new"); err == nil {
		t.Fatal("overwrite accepted")
	}
	if !a.isDraft(source) {
		t.Fatal("draft identity lost")
	}
	data, _ := os.ReadFile(target)
	if string(data) != "existing" {
		t.Fatal("destination changed")
	}
	doc, err := a.SaveDocumentCopy(source, filepath.Join(dir, "new.md"), "new")
	if err != nil {
		t.Fatal(err)
	}
	if doc.Draft || a.isDraft(source) {
		t.Fatal("saved document remains draft")
	}
	original, _ := os.ReadFile(source)
	if string(original) != "draft" {
		t.Fatal("draft deleted or modified")
	}
	p, _ := a.readPreferences()
	if p.LastSaveDirectory != dir {
		t.Fatal("save directory not remembered")
	}
}

func TestSavePickerPrefersDocumentDirectoryAndLastChosenForDraft(t *testing.T) {
	a := testApp(t)
	current := t.TempDir()
	chosen := t.TempDir()
	source := filepath.Join(current, "a.md")
	a.rememberSaveDirectory(chosen)
	if a.documentSaveDialogOptions(source).DefaultDirectory != current {
		t.Fatal("existing document not located")
	}
	a.markDraft(source)
	options := a.documentSaveDialogOptions(source)
	if options.DefaultDirectory != chosen || options.DefaultFilename != a.text("newDocument") {
		t.Fatalf("draft picker: %+v", options)
	}
	if a.documentSaveDialogOptions("").DefaultDirectory != chosen {
		t.Fatal("new picker ignored last directory")
	}
}

func TestEmbeddedImageModeDoesNotCreateAssets(t *testing.T) {
	a := testApp(t)
	dir := t.TempDir()
	doc := filepath.Join(dir, "a.md")
	image := filepath.Join(t.TempDir(), "sample.png")
	png, _ := base64.StdEncoding.DecodeString("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jgKkAAAAASUVORK5CYII=")
	_ = os.WriteFile(image, png, 0600)
	_, err := a.SetImageUploadSettings(ImageUploadSettingsInput{Mode: "embedded"})
	if err != nil {
		t.Fatal(err)
	}
	ref, err := a.ImportImage(doc, image)
	if err != nil || !strings.HasPrefix(ref, "data:image/png;base64,") {
		t.Fatalf("image: %s %v", ref, err)
	}
	if _, err := os.Stat(filepath.Join(dir, "assets")); !os.IsNotExist(err) {
		t.Fatal("embedded import created attachments")
	}
	pasted, err := a.SavePastedImage(doc, ref)
	if err != nil || pasted != ref {
		t.Fatalf("paste: %v", err)
	}
	if _, err := a.SavePastedImage(doc, "data:image/webp;base64,"+base64.StdEncoding.EncodeToString(png)); err == nil {
		t.Fatal("mismatched MIME accepted")
	}
}

func TestPortableRasterValidation(t *testing.T) {
	webp := append([]byte("RIFF"), []byte{20, 0, 0, 0}...)
	webp = append(webp, []byte("WEBPVP8 ")...)
	if err := validateEmbeddedRaster(webp, "image/webp"); err != nil {
		t.Fatal(err)
	}
	if validateEmbeddedRaster([]byte("<svg/>"), "image/svg+xml") == nil {
		t.Fatal("active image accepted")
	}
}

func TestAIEmbeddedImageProtectionAndBoundedRestore(t *testing.T) {
	image := "data:image/webp;base64," + strings.Repeat("a", 2_000_005)
	input := "Title ![x](" + image + ")"
	protected, images, err := protectAIEmbeddedImages(input)
	if err != nil || len(protected) > 100 || strings.Contains(protected, "data:image") {
		t.Fatalf("protection failed: %v", err)
	}
	restored, err := restoreAIEmbeddedImages(protected, images)
	if err != nil || restored != input {
		t.Fatal("image not restored")
	}
	if _, err := restoreAIEmbeddedImages(strings.Repeat(images[0].placeholder, 40), images); err == nil {
		t.Fatal("unbounded restoration accepted")
	}
}

func TestRenameKeepsOldHistoryAndCopiesVersionsToNewName(t *testing.T) {
	a := testApp(t)
	path := filepath.Join(t.TempDir(), "old.md")
	if err := os.WriteFile(path, []byte("first"), 0600); err != nil {
		t.Fatal(err)
	}
	doc, err := a.SaveFile(path, "second")
	if err != nil {
		t.Fatal(err)
	}
	old, err := a.ListDocumentVersions(path)
	if err != nil || len(old) != 1 {
		t.Fatalf("old history: %v %v", old, err)
	}
	renamed, err := a.RenameDocument(path, "new.md", doc.Revision)
	if err != nil || renamed.Warning != "" {
		t.Fatalf("rename: %+v %v", renamed, err)
	}
	versions, err := a.ListDocumentVersions(renamed.Path)
	if err != nil || len(versions) != 1 {
		t.Fatalf("new history: %v %v", versions, err)
	}
	for _, name := range []string{path, renamed.Path} {
		version, err := a.GetDocumentVersion(name, old[0].ID)
		if err != nil || version.Content != "first" {
			t.Fatalf("history changed: %+v %v", version, err)
		}
	}
}

func TestRenameHistoryFailureReportsSuccessWithPreservedBackup(t *testing.T) {
	a := testApp(t)
	path := filepath.Join(t.TempDir(), "old.md")
	_ = os.WriteFile(path, []byte("first"), 0600)
	doc, err := a.SaveFile(path, "second")
	if err != nil {
		t.Fatal(err)
	}
	target := filepath.Join(filepath.Dir(path), "new.md")
	_ = os.MkdirAll(a.documentHistoryRoot(), 0700)
	_ = os.WriteFile(a.documentHistoryDirectory(target), []byte("unrelated"), 0600)
	renamed, err := a.RenameDocument(path, "new.md", doc.Revision)
	if err != nil || renamed == nil || renamed.Warning != "DOCUMENT_RENAME_RECORDS" {
		t.Fatalf("rename result: %+v %v", renamed, err)
	}
	content, _ := os.ReadFile(target)
	unrelated, _ := os.ReadFile(a.documentHistoryDirectory(target))
	if string(content) != "second" || string(unrelated) != "unrelated" {
		t.Fatal("rename or foreign history changed")
	}
	versions, err := a.ListDocumentVersions(path)
	if err != nil || len(versions) != 1 {
		t.Fatal("original history lost")
	}
}

func TestPortableImageMissingAndInvalidEmbeddedData(t *testing.T) {
	a := testApp(t)
	if _, err := a.ReadPortableImage("missing.webp", t.TempDir()); err == nil || !strings.Contains(err.Error(), "PORTABLE_IMAGE_MISSING") {
		t.Fatalf("missing image: %v", err)
	}
	for _, ref := range []string{"data:image/webp;base64,UklGRg==", "data:image/png;base64,%%%%", "data:image/svg+xml;base64,PHN2Zy8+"} {
		if _, err := a.ReadPortableImage(ref, ""); err == nil {
			t.Fatal("accepted invalid data")
		}
	}
	if _, err := a.ReadPortableImage("file://server/share/image.webp", ""); err == nil || !strings.Contains(err.Error(), "PORTABLE_UNSUPPORTED_IMAGE") {
		t.Fatalf("remote file host misread: %v", err)
	}
}

func TestImageReadingHasAByteLimitAndRejectsDirectories(t *testing.T) {
	dir := t.TempDir()
	path := filepath.Join(dir, "large.png")
	file, err := os.Create(path)
	if err != nil {
		t.Fatal(err)
	}
	err = file.Truncate(maxImportedImageSize + 1)
	_ = file.Close()
	if err != nil {
		t.Fatal(err)
	}
	if _, err := readImageBytes(path); err == nil {
		t.Fatal("oversized image accepted")
	}
	if _, err := readImageBytes(dir); err == nil {
		t.Fatal("directory accepted")
	}
}

func TestSaveCopyReceiptSurvivesLibraryPreferenceFailure(t *testing.T) {
	a := testApp(t)
	dir := textPackTestDirectory(t)
	source := filepath.Join(dir, "draft.md")
	target := filepath.Join(dir, "saved.md")
	_ = os.WriteFile(source, []byte("original draft"), 0600)
	a.markDraft(source)
	// Simulate an unreadable preference object without altering an existing file.
	a.preferencesOverride = t.TempDir()
	doc, err := a.SaveDocumentCopy(source, target, "new content")
	if err != nil || doc == nil || doc.Warning != "DOCUMENT_SAVE_RECORDS" || doc.Content != "new content" {
		t.Fatalf("receipt: %+v %v", doc, err)
	}
	if doc.ReplacedPath != "" || !a.isDraft(source) {
		t.Fatal("failed metadata migration lost original draft records")
	}
	original, _ := os.ReadFile(source)
	saved, _ := os.ReadFile(target)
	if string(original) != "original draft" || string(saved) != "new content" {
		t.Fatal("copy or original lost")
	}
}

func TestRejectedCopyDoesNotChangeExistingFileHistory(t *testing.T) {
	a := testApp(t)
	dir := t.TempDir()
	source := filepath.Join(dir, "source.md")
	target := filepath.Join(dir, "target.md")
	_ = os.WriteFile(source, []byte("source"), 0600)
	_ = os.WriteFile(target, []byte("target"), 0600)
	if _, err := a.SaveDocumentCopy(source, target, "other content"); err == nil {
		t.Fatal("overwrite accepted")
	}
	versions, err := a.ListDocumentVersions(target)
	if err != nil || len(versions) != 0 {
		t.Fatalf("rejected copy changed foreign history: %+v %v", versions, err)
	}
}
