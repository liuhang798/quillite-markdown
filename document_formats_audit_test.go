package main

import (
	"bytes"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestDocumentFormatBundleBOMReceiptAndUnchangedSave(t *testing.T) {
	for _, kind := range []string{"textpack", "textbundle"} {
		for _, prefix := range []string{"", "\ufeff", "\ufeff\ufeff"} {
			for _, ending := range []string{"\n", "\r\n"} {
				t.Run(kind+"/"+documentRevision([]byte(prefix + ending))[:8], func(t *testing.T) {
					app := bundleIntegrationApp(t)
					source := filepath.Join(textPackTestDirectory(t), "source.md")
					raw := prefix + "# Encoding" + ending + ending + "正文" + ending
					textPackTestWrite(t, source, []byte(raw))
					target := filepath.Join(textPackTestDirectory(t), "copy."+kind)
					copy, err := app.saveDocumentAsFormatTo(source, target, raw, "", kind, nil, raw)
					if err != nil {
						t.Fatal(err)
					}
					canonical := strings.TrimPrefix(raw, "\ufeff")
					if copy.Content != canonical {
						t.Fatal("receipt does not match canonical session baseline")
					}
					for i := 0; i < 2; i++ {
						saved, err := app.SaveBundleDocument(target, copy.Content, copy.Revision, copy.BundleSessionID)
						if err != nil || saved.Revision != copy.Revision || saved.Content != canonical {
							t.Fatalf("unchanged save changed revision/text: %+v %v", saved, err)
						}
						disk, err := readEditableBundle(target)
						if err != nil || !bytes.Equal(disk.Files[disk.TextEntry], []byte(raw)) {
							t.Fatalf("BOM/line endings changed on unchanged save: %v", err)
						}
					}
					reopened := bundleIntegrationRead(t, app, target)
					if reopened.Content != canonical {
						t.Fatal("reopen disagrees with receipt")
					}
					second := filepath.Join(textPackTestDirectory(t), "second."+kind)
					again, err := app.saveDocumentAsFormatTo(target, second, copy.Content, copy.BundleSessionID, kind, nil, "unused")
					if err != nil || again.Content != canonical {
						t.Fatalf("package copy stripped a real leading FEFF: %+v %v", again, err)
					}
					disk, err := readEditableBundle(second)
					if err != nil || !bytes.Equal(disk.Files[disk.TextEntry], []byte(raw)) {
						t.Fatal("package copy did not preserve exact encoding bytes")
					}
					assertDocumentBytes(t, source, raw)
				})
			}
		}
	}
}

func TestDocumentFormatOrdinaryVerbatimBackupsDoNotPackageImages(t *testing.T) {
	for _, kind := range []string{"text", "markdown"} {
		app := bundleIntegrationApp(t)
		ext := map[string]string{"text": ".txt", "markdown": ".md"}[kind]
		source := filepath.Join(textPackTestDirectory(t), "source"+ext)
		content := "\ufeffliteral\r\n![missing](missing.png)\r\n<img srcset=\"absent.png 1x, absent-2.png 2x\">\r\n"
		textPackTestWrite(t, source, []byte(content))
		for _, parent := range []string{filepath.Dir(source), textPackTestDirectory(t)} {
			target := filepath.Join(parent, "copy"+ext)
			copy, err := app.saveDocumentAsFormatTo(source, target, content, "", kind, nil, content)
			if err != nil || copy.Content != content || documentFormatFromPath(copy.Path) != kind {
				t.Fatalf("ordinary backup parsed/repacked literal text: %+v %v", copy, err)
			}
			assertDocumentBytes(t, target, content)
			if _, err := os.Stat(filepath.Join(parent, "assets")); !os.IsNotExist(err) {
				t.Fatal("verbatim copy unexpectedly created assets")
			}
		}
		assertDocumentBytes(t, source, content)
	}
}

func TestDocumentFormatTXTPickerUsesActualLegacyCopyOptions(t *testing.T) {
	app := bundleIntegrationApp(t)
	source := filepath.Join(textPackTestDirectory(t), "Notes.TXT")
	options := app.documentSaveDialogOptions(source)
	if options.DefaultFilename != "Notes.TXT" || len(options.Filters) != 1 || options.Filters[0].Pattern != "*.txt" {
		t.Fatalf("TXT copy picker defaults to Markdown: %+v", options)
	}
	options = app.documentFormatSaveOptions(source, "text")
	if filepath.Ext(options.DefaultFilename) != ".txt" || len(options.Filters) != 1 || options.Filters[0].Pattern != "*.txt" {
		t.Fatalf("unified TXT picker defaults to Markdown: %+v", options)
	}
}

func TestBundleExportsRefuseOriginalAndManagedRecoveryTargets(t *testing.T) {
	app := bundleIntegrationApp(t)
	source, before := bundleIntegrationFixture(t, "textbundle")
	doc := bundleIntegrationRead(t, app, source)
	for _, sourcePath := range []string{source, doc.ResourcePath} {
		for _, parent := range []string{
			source, filepath.Join(source, "assets"), doc.Directory,
			filepath.Join(app.bundleWorkspaceRoot(), "future-session", "work"),
		} {
			md := filepath.Join(parent, "forbidden.md")
			if _, err := app.exportPortableMarkdownTo(sourcePath, md, "export"); err == nil {
				t.Fatalf("portable export accepted protected target: %s", md)
			}
			pack := filepath.Join(parent, "forbidden.textpack")
			if _, err := app.exportTextPackTo(sourcePath, pack, "export", nil); err == nil {
				t.Fatalf("TextPack export accepted protected target: %s", pack)
			}
			if _, err := os.Lstat(md); !os.IsNotExist(err) {
				t.Fatal("rejected export created a file")
			}
			if _, err := app.saveBundleCopyTo(source, pack, doc.Content, doc.BundleSessionID); err == nil {
				t.Fatal("legacy package copy bypassed the same target boundary")
			}
		}
	}
	badSource := filepath.Join(app.bundleWorkspaceRoot(), "invalid-session", "work", "text.md")
	if _, err := app.exportPortableMarkdownTo(badSource, filepath.Join(textPackTestDirectory(t), "bad.md"), "text"); err == nil {
		t.Fatal("invalid working source lost its package boundary")
	}
	valid := filepath.Join(textPackTestDirectory(t), "portable.md")
	if _, err := app.exportPortableMarkdownTo(doc.ResourcePath, valid, "safe exported text"); err != nil {
		t.Fatal(err)
	}
	assertDocumentBytes(t, valid, "safe exported text")
	pack := filepath.Join(textPackTestDirectory(t), "valid.textpack")
	if _, err := app.exportTextPackTo(doc.ResourcePath, pack, "safe exported text", nil); err != nil {
		t.Fatal(err)
	}
	after, err := readEditableBundle(source)
	if err != nil || after.Revision != before.Revision {
		t.Fatalf("export changed original package revision: %v", err)
	}
	if _, err := app.SaveBundleDocument(source, doc.Content+"\nEdit after exporting", doc.Revision, doc.BundleSessionID); err != nil {
		t.Fatalf("export caused an original save conflict: %v", err)
	}
}

func TestPortableExportRefusesAliasedPackageAndRecoveryTargets(t *testing.T) {
	for _, recovery := range []bool{false, true} {
		app := bundleIntegrationApp(t)
		source, before := bundleIntegrationFixture(t, "textbundle")
		doc := bundleIntegrationRead(t, app, source)
		directory := source
		if recovery {
			directory = doc.Directory
		}
		alias := filepath.Join(textPackTestDirectory(t), "outside-alias")
		bundleAuditDirectoryAlias(t, directory, alias)
		target := filepath.Join(alias, "forbidden.md")
		if _, err := app.exportPortableMarkdownTo(doc.ResourcePath, target, "export"); err == nil {
			t.Fatal("parent alias bypassed protected package/workspace boundary")
		}
		if _, err := os.Lstat(filepath.Join(directory, "forbidden.md")); !os.IsNotExist(err) {
			t.Fatal("export followed the alias and created a file")
		}
		after, err := readEditableBundle(source)
		if err != nil || after.Revision != before.Revision {
			t.Fatal("rejected alias export mutated original package")
		}
	}
}
