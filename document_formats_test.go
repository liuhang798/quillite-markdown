package main

import (
	"bytes"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestDocumentFormatOpenPromotesOnlyImmediateBundleText(t *testing.T) {
	app := bundleIntegrationApp(t)
	source, _ := bundleIntegrationFixture(t, "textbundle")
	doc, err := app.ReadFile(filepath.Join(source, "text.md"))
	if err != nil || doc == nil || doc.Path != source || doc.BundleKind != "textbundle" {
		t.Fatalf("selected body detached from package: %+v %v", doc, err)
	}
	for _, path := range []string{filepath.Join(source, "info.json"), filepath.Join(source, "assets", "text.md"), filepath.Join(filepath.Dir(source), "text.md")} {
		if bundleOpenDocumentPath(path) != path {
			t.Fatalf("promoted unrelated file: %s", path)
		}
	}
	// Nested .textbundle roots in a TextPack are controlled workspaces, not
	// host directories to promote before the workspace identity is resolved.
	prefixed := filepath.Join(textPackTestDirectory(t), "nested.textpack")
	textPackTestWrite(t, prefixed, editableBundleTestArchive(t, "nested.textbundle/", true))
	opened := bundleIntegrationRead(t, app, prefixed)
	reopened, err := app.ReadFile(opened.ResourcePath)
	if err != nil || reopened.Path != prefixed {
		t.Fatalf("prefixed workspace self-open: %+v %v", reopened, err)
	}
}

func TestDocumentFormatNativeSaveOptions(t *testing.T) {
	app := bundleIntegrationApp(t)
	for _, kind := range []string{"markdown", "textbundle", "textpack"} {
		options := app.documentFormatSaveOptions(filepath.Join(textPackTestDirectory(t), "name.md"), kind)
		if len(options.Filters) != 1 || documentFormatFromPath(options.DefaultFilename) != kind {
			t.Fatalf("ambiguous native save filter: %+v", options)
		}
	}
	if normaliseExportPreset(ExportPreset{ID: "assets", Name: "Markdown assets", Format: "markdown-assets"}).Format != "markdown-assets" {
		t.Fatal("new export preset discarded")
	}
	if normaliseExportPreset(ExportPreset{ID: "portable", Name: "Embedded Markdown", Format: "markdown-portable"}).Format != "markdown-portable" {
		t.Fatal("old embedded preset changed")
	}
}

func TestDocumentFormatPackageCopiesKeepMetadataAndNewAssets(t *testing.T) {
	for _, from := range []string{"textpack", "textbundle"} {
		for _, to := range []string{"textpack", "textbundle"} {
			t.Run(from+"-"+to, func(t *testing.T) {
				app := bundleIntegrationApp(t)
				source, original := bundleIntegrationFixture(t, from)
				doc := bundleIntegrationRead(t, app, source)
				image := textPackTestPNG(t)
				bundleIntegrationStage(t, doc, "assets/new.png", image)
				content := "# EDITED\n\n![new](assets/new.png)"
				target := filepath.Join(textPackTestDirectory(t), "Copy."+to)
				copy, err := app.saveDocumentAsFormatTo(source, target, content, doc.BundleSessionID, to, nil, "unused prepared content")
				if err != nil {
					t.Fatal(err)
				}
				if copy.Path != target || copy.Content != content || copy.BundleKind != to || copy.BundleSessionID == doc.BundleSessionID {
					t.Fatalf("bad receipt: %+v", copy)
				}
				saved, err := readEditableBundle(target)
				if err != nil {
					t.Fatal(err)
				}
				for name, data := range original.Files {
					if name != original.TextEntry && !bytes.Equal(data, saved.Files[name]) {
						t.Fatalf("third-party entry changed: %s", name)
					}
				}
				if !bytes.Equal(saved.Files["assets/new.png"], image) {
					t.Fatal("unsaved new image omitted")
				}
				after, err := readEditableBundle(source)
				if err != nil || after.Revision != original.Revision {
					t.Fatalf("source changed: %v", err)
				}
				if _, err := app.saveDocumentAsFormatTo(source, target, "overwrite", doc.BundleSessionID, to, nil, "overwrite"); err == nil {
					t.Fatal("existing copy overwritten")
				}
				if to == "textbundle" {
					if info, err := os.Stat(target); err != nil || !info.IsDir() {
						t.Fatal("TextBundle is not a directory")
					}
				}
				if _, err := app.SaveBundleDocument(copy.Path, content+"\nAgain", copy.Revision, copy.BundleSessionID); err != nil {
					t.Fatalf("new package cannot save normally: %v", err)
				}
			})
		}
	}
}

func TestDocumentFormatIdenticalTextPackCopyKeepsZIPBytes(t *testing.T) {
	app := bundleIntegrationApp(t)
	source, _ := bundleIntegrationFixture(t, "textpack")
	doc := bundleIntegrationRead(t, app, source)
	target := filepath.Join(textPackTestDirectory(t), "copy.textpack")
	if _, err := app.saveDocumentAsFormatTo(source, target, doc.Content, doc.BundleSessionID, "textpack", nil, "unused"); err != nil {
		t.Fatal(err)
	}
	before, _ := os.ReadFile(source)
	after, _ := os.ReadFile(target)
	if !bytes.Equal(before, after) {
		t.Fatal("unchanged TextPack ZIP headers/comments changed")
	}
}

func TestDocumentFormatMarkdownCopiesUseNewWorkspaceImages(t *testing.T) {
	app := bundleIntegrationApp(t)
	source, original := bundleIntegrationFixture(t, "textpack")
	doc := bundleIntegrationRead(t, app, source)
	image := textPackTestPNG(t)
	bundleIntegrationStage(t, doc, "assets/new.png", image)
	prepared := "# Markdown\n\n![new](assets/image-001.png)\n![remote](https://example.invalid/image.png)"
	images := []TextPackImage{{Source: "assets/new.png", Target: "assets/image-001.png"}}
	target := filepath.Join(textPackTestDirectory(t), "Copy.md")
	copy, err := app.saveDocumentAsFormatTo(source, target, "raw snapshot", doc.BundleSessionID, "markdown", images, prepared)
	if err != nil {
		t.Fatal(err)
	}
	if copy.BundleKind != "" || copy.Content != prepared || copy.Path != target {
		t.Fatalf("Markdown receipt kept package identity: %+v", copy)
	}
	assertDocumentBytes(t, target, prepared)
	data, _ := os.ReadFile(filepath.Join(filepath.Dir(target), "assets", "image-001.png"))
	if !bytes.Equal(data, image) {
		t.Fatal("new workspace attachment missing")
	}
	after, _ := readEditableBundle(source)
	if after.Revision != original.Revision {
		t.Fatal("Markdown conversion modified source")
	}
	if _, err := app.saveDocumentAsFormatTo(source, filepath.Join(textPackTestDirectory(t), "bad.md"), "raw", "invalid-session", "markdown", images, prepared); err == nil {
		t.Fatal("wrong session accepted")
	}
}

func TestDocumentFormatOrdinaryCopiesAndMissingImageFailure(t *testing.T) {
	for _, kind := range []string{"markdown", "textpack", "textbundle"} {
		t.Run(kind, func(t *testing.T) {
			app := bundleIntegrationApp(t)
			dir := textPackTestDirectory(t)
			source := filepath.Join(dir, "source.md")
			textPackTestWrite(t, source, []byte("source untouched"))
			textPackTestWrite(t, filepath.Join(dir, "assets", "pic.png"), textPackTestPNG(t))
			ext := map[string]string{"markdown": ".md", "textpack": ".textpack", "textbundle": ".textbundle"}[kind]
			target := filepath.Join(textPackTestDirectory(t), "Copy"+ext)
			images := []TextPackImage{{Source: "assets/pic.png", Target: "assets/image-001.png"}}
			copy, err := app.saveDocumentAsFormatTo(source, target, "raw source", "", kind, images, "![copy](assets/image-001.png)")
			if err != nil || copy == nil {
				t.Fatalf("normal conversion: %+v %v", copy, err)
			}
			assertDocumentBytes(t, source, "source untouched")
			missing := filepath.Join(textPackTestDirectory(t), "Missing"+ext)
			_, err = app.saveDocumentAsFormatTo(source, missing, "raw", "", kind, []TextPackImage{{Source: "missing.png", Target: "assets/image-001.png"}}, "![bad](assets/image-001.png)")
			if err == nil || !strings.Contains(err.Error(), "TEXTPACK_CONVERSION_INCOMPLETE") {
				t.Fatalf("missing asset silently accepted: %v", err)
			}
			if _, err := os.Lstat(missing); !os.IsNotExist(err) {
				t.Fatal("incomplete copy published")
			}
		})
	}
}

func TestDocumentFormatRefusesAssetCollisionAndInsideSource(t *testing.T) {
	app := bundleIntegrationApp(t)
	source, _ := bundleIntegrationFixture(t, "textbundle")
	doc := bundleIntegrationRead(t, app, source)
	if _, err := app.saveDocumentAsFormatTo(source, filepath.Join(source, "copy.textpack"), doc.Content, doc.BundleSessionID, "textpack", nil, ""); err == nil {
		t.Fatal("copy inside source accepted")
	}
	dir := textPackTestDirectory(t)
	textPackTestWrite(t, filepath.Join(dir, "assets", "image-001.png"), []byte("user data"))
	target := filepath.Join(dir, "copy.md")
	images := []TextPackImage{{Source: "assets/pic.png", Target: "assets/image-001.png"}}
	ordinary := filepath.Join(textPackTestDirectory(t), "source.md")
	textPackTestWrite(t, ordinary, []byte("original"))
	textPackTestWrite(t, filepath.Join(filepath.Dir(ordinary), "assets", "pic.png"), textPackTestPNG(t))
	if _, err := app.saveDocumentAsFormatTo(ordinary, target, "raw", "", "markdown", images, "![x](assets/image-001.png)"); err == nil {
		t.Fatal("existing asset overwritten")
	}
	assertDocumentBytes(t, filepath.Join(dir, "assets", "image-001.png"), "user data")
	if _, err := os.Lstat(target); !os.IsNotExist(err) {
		t.Fatal("Markdown published despite attachment conflict")
	}
	if _, err := app.saveDocumentAsFormatTo(ordinary, filepath.Join(dir, "bad.md"), "raw", "", "textpack", nil, "text"); err == nil {
		t.Fatal("format/extension mismatch accepted")
	}
}

func TestDocumentFormatRefusesRecoveryWorkspaceTargets(t *testing.T) {
	app := bundleIntegrationApp(t)
	source, _ := bundleIntegrationFixture(t, "textpack")
	doc := bundleIntegrationRead(t, app, source)
	for _, target := range []string{
		filepath.Join(doc.Directory, "copy.md"),
		filepath.Join(app.bundleWorkspaceRoot(), "future-session", "copy.textpack"),
		filepath.Join(app.bundleWorkspaceRoot(), doc.BundleSessionID, "base.textpack"),
	} {
		_, err := app.saveDocumentAsFormatTo(source, target, doc.Content, doc.BundleSessionID, "", nil, doc.Content)
		if err == nil || !strings.Contains(err.Error(), "BUNDLE_SESSION_REQUIRED") {
			t.Fatalf("private recovery target accepted: %s %v", target, err)
		}
	}
}

func TestDocumentFormatNestedMarkdownAssetsAndUnsafeNames(t *testing.T) {
	app := bundleIntegrationApp(t)
	source := filepath.Join(textPackTestDirectory(t), "source.md")
	textPackTestWrite(t, source, []byte("original"))
	textPackTestWrite(t, filepath.Join(filepath.Dir(source), "pic.png"), textPackTestPNG(t))
	target := filepath.Join(textPackTestDirectory(t), "copy.md")
	prepared := "![nested](assets/quillite-0123456789/image-001.png)"
	images := []TextPackImage{{Source: "pic.png", Target: "assets/quillite-0123456789/image-001.png"}}
	if _, err := app.saveDocumentAsFormatTo(source, target, "raw", "", "markdown", images, prepared); err != nil {
		t.Fatal(err)
	}
	assertDocumentBytes(t, target, prepared)
	if _, err := os.Stat(filepath.Join(filepath.Dir(target), "assets", "quillite-0123456789", "image-001.png")); err != nil {
		t.Fatal(err)
	}
	for _, name := range []string{"CON.md", "unsafe .md.", "bad:stream.md"} {
		if err := writeMarkdownAssetsCopy(source, filepath.Join(filepath.Dir(target), name), "text", nil); err == nil {
			t.Fatalf("unsafe filename accepted: %s", name)
		}
	}
}

func TestDocumentFormatPrefixedPackageBecomesStandardBundle(t *testing.T) {
	app := bundleIntegrationApp(t)
	source := filepath.Join(textPackTestDirectory(t), "prefixed.textpack")
	textPackTestWrite(t, source, editableBundleTestArchive(t, "wrapped.textbundle/", true))
	doc := bundleIntegrationRead(t, app, source)
	target := filepath.Join(textPackTestDirectory(t), "copy.textbundle")
	copy, err := app.saveDocumentAsFormatTo(source, target, doc.Content, doc.BundleSessionID, "textbundle", nil, "unused")
	if err != nil {
		t.Fatal(err)
	}
	if _, err := os.Stat(filepath.Join(target, "info.json")); err != nil {
		t.Fatal("package root not flattened")
	}
	if copy.BundleTextPath != filepath.Base(doc.BundleTextPath) {
		t.Fatalf("wrong body: %+v", copy)
	}
	if _, err := app.SaveBundleDocument(target, doc.Content+"\nsecond", copy.Revision, copy.BundleSessionID); err != nil {
		t.Fatal(err)
	}
}
