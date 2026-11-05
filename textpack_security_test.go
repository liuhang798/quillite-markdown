package main

// Independent adversarial regressions for the TextPack interchange boundary.
// Fixtures are private test files. No test invokes a picker, network request,
// user document, registry entry, installation, or archive write-back.
import (
	"archive/zip"
	"bytes"
	"encoding/base64"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

type textPackAuditEntry struct {
	name string
	data []byte
	mode os.FileMode
}

func textPackAuditTemp(t *testing.T) string {
	t.Helper()
	// macOS commonly spells its temporary root through /var -> /private/var.
	// Test the package boundary itself, not that environmental alias.
	path, err := filepath.EvalSymlinks(t.TempDir())
	if err != nil {
		t.Fatal(err)
	}
	return path
}

func textPackAuditPNG(t *testing.T) []byte {
	t.Helper()
	data, err := base64.StdEncoding.DecodeString("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aY1cAAAAASUVORK5CYII=")
	if err != nil {
		t.Fatal(err)
	}
	return data
}

func textPackAuditZIP(t *testing.T, entries []textPackAuditEntry) []byte {
	t.Helper()
	var data bytes.Buffer
	z := zip.NewWriter(&data)
	for _, entry := range entries {
		header := &zip.FileHeader{Name: entry.name, Method: zip.Store}
		mode := entry.mode
		if mode == 0 {
			mode = 0o600
		}
		header.SetMode(mode)
		writer, err := z.CreateHeader(header)
		if err != nil {
			t.Fatal(err)
		}
		if _, err = writer.Write(entry.data); err != nil {
			t.Fatal(err)
		}
	}
	if err := z.Close(); err != nil {
		t.Fatal(err)
	}
	return data.Bytes()
}

func textPackAuditSource(t *testing.T, entries []textPackAuditEntry) string {
	t.Helper()
	source := filepath.Join(textPackAuditTemp(t), "audit.textpack")
	if err := os.WriteFile(source, textPackAuditZIP(t, entries), 0o600); err != nil {
		t.Fatal(err)
	}
	return source
}

func textPackAuditBase() []textPackAuditEntry {
	return []textPackAuditEntry{
		{name: "info.json", data: []byte(`{"version":2,"type":"net.daringfireball.markdown"}`)},
		{name: "text.md", data: []byte("# Source\n\n![local](assets/image.png)\n")},
	}
}

func TestTextPackAuditRejectsPortableAliases(t *testing.T) {
	for _, name := range []string{
		"../outside.png", "/outside.png", "C:/outside.png", `assets\outside.png`,
		"assets/../outside.png", "assets//outside.png", "assets/image.png:stream",
		"assets/CON.png", "assets/COM1.png", "assets/COM¹.png", "assets/LPT².png", "assets/LPT³.png",
		"assets/trailing./image.png", "assets/trailing /image.png", "assets/\x00bad.png",
	} {
		t.Run(name, func(t *testing.T) {
			entries := append(textPackAuditBase(), textPackAuditEntry{name: name, data: textPackAuditPNG(t)})
			if _, err := readTextBundleSnapshot(textPackAuditSource(t, entries)); err == nil {
				t.Fatalf("unsafe package entry accepted: %q", name)
			}
		})
	}
}

func TestTextPackAuditRejectsCaseAndPrefixCollisions(t *testing.T) {
	for _, names := range [][]string{
		{"assets/image.png", "assets/IMAGE.png"},
		{"assets/A/one.png", "assets/a/two.png"},
		{"assets/path", "assets/path/image.png"},
		{"assets/path/image.png", "assets/path"},
		{"assets/image.png", "assets/image.png"},
	} {
		t.Run(strings.Join(names, "+"), func(t *testing.T) {
			entries := textPackAuditBase()
			for _, name := range names {
				entries = append(entries, textPackAuditEntry{name: name, data: textPackAuditPNG(t)})
			}
			if _, err := readTextBundleSnapshot(textPackAuditSource(t, entries)); err == nil {
				t.Fatalf("colliding package entries accepted: %v", names)
			}
		})
	}
}

func TestTextPackAuditRejectsZIPLinks(t *testing.T) {
	for _, entry := range []textPackAuditEntry{
		{name: "assets/link.png", data: []byte("../../outside.png"), mode: os.ModeSymlink | 0o777},
		// ZIP's trailing slash adds ModeDir when read; Unix attributes must
		// independently encode the symlink (SetMode on both bits is lossy).
		{name: "assets/", mode: os.ModeSymlink | 0o777},
		{name: "assets/pipe.png", mode: os.ModeNamedPipe | 0o600},
	} {
		t.Run(entry.name, func(t *testing.T) {
			if _, err := readTextBundleSnapshot(textPackAuditSource(t, append(textPackAuditBase(), entry))); err == nil {
				t.Fatalf("special ZIP entry accepted: %v", entry.mode)
			}
		})
	}
}

func TestTextPackAuditRejectsAmbiguousMetadataAndText(t *testing.T) {
	cases := map[string][]textPackAuditEntry{
		"duplicate-info":    append(textPackAuditBase(), textPackAuditEntry{name: "info.json", data: []byte(`{"version":1}`)}),
		"duplicate-version": {{name: "info.json", data: []byte(`{"version":1,"version":2}`)}, {name: "text.md", data: []byte("ok")}},
		"non-utf8-text":     {{name: "info.json", data: []byte(`{"version":2}`)}, {name: "text.md", data: []byte{0xff, 0xfe}}},
		"ambiguous-text":    append(textPackAuditBase(), textPackAuditEntry{name: "text.markdown", data: []byte("another document")}),
		"two-wrapped-roots": {{name: "one.textbundle/info.json", data: []byte(`{"version":2}`)}, {name: "one.textbundle/text.md", data: []byte("one")}, {name: "two.textbundle/info.json", data: []byte(`{"version":2}`)}, {name: "two.textbundle/text.md", data: []byte("two")}},
	}
	for label, entries := range cases {
		t.Run(label, func(t *testing.T) {
			if _, err := readTextBundleSnapshot(textPackAuditSource(t, entries)); err == nil {
				t.Fatal("ambiguous or corrupt package accepted")
			}
		})
	}
}

func TestTextPackAuditChecksCRCAndEntryBudget(t *testing.T) {
	t.Run("crc", func(t *testing.T) {
		entries := textPackAuditBase()
		entries[1].data = []byte("AUDIT_UNIQUE_CONTENT_CRC")
		data := textPackAuditZIP(t, entries)
		index := bytes.Index(data, entries[1].data)
		if index < 0 {
			t.Fatal("fixture payload missing")
		}
		data[index] ^= 1
		source := filepath.Join(textPackAuditTemp(t), "corrupt.textpack")
		if err := os.WriteFile(source, data, 0o600); err != nil {
			t.Fatal(err)
		}
		if _, err := readTextBundleSnapshot(source); err == nil {
			t.Fatal("CRC-corrupt package accepted")
		}
	})
	t.Run("entry-count", func(t *testing.T) {
		entries := textPackAuditBase()
		for i := 0; i < textPackMaxEntries; i++ {
			entries = append(entries, textPackAuditEntry{name: "ignored/" + strings.Repeat("x", i%10) + string(rune(0x400+i)), data: []byte("x")})
		}
		if _, err := readTextBundleSnapshot(textPackAuditSource(t, entries)); err == nil {
			t.Fatal("entry limit was not enforced before ignored-file filtering")
		}
	})
}

func TestTextPackAuditRevisionIncludesAssets(t *testing.T) {
	source := filepath.Join(textPackAuditTemp(t), "source.textbundle")
	if err := os.MkdirAll(filepath.Join(source, "assets"), 0o700); err != nil {
		t.Fatal(err)
	}
	for _, entry := range append(textPackAuditBase(), textPackAuditEntry{name: "assets/image.png", data: textPackAuditPNG(t)}) {
		if err := os.WriteFile(filepath.Join(source, filepath.FromSlash(entry.name)), entry.data, 0o600); err != nil {
			t.Fatal(err)
		}
	}
	before, err := readTextBundleSnapshot(source)
	if err != nil {
		t.Fatal(err)
	}
	imagePath := filepath.Join(source, "assets", "image.png")
	image := append(textPackAuditPNG(t), []byte(" changed")...)
	if err := os.WriteFile(imagePath, image, 0o600); err != nil {
		t.Fatal(err)
	}
	after, err := readTextBundleSnapshot(source)
	if err != nil {
		t.Fatal(err)
	}
	if before.Revision == after.Revision {
		t.Fatal("asset change did not invalidate the import preview revision")
	}
	parent := textPackAuditTemp(t)
	if _, err := materializeTextBundle(parent, source, before.Revision, before.Content, after); err == nil {
		t.Fatal("stale preview revision imported")
	}
	entries, err := os.ReadDir(parent)
	if err != nil || len(entries) != 0 {
		t.Fatal("stale import created output before rejection")
	}
}

func TestTextPackAuditImportNeverWritesBack(t *testing.T) {
	source := textPackAuditSource(t, append(textPackAuditBase(), textPackAuditEntry{name: "assets/image.png", data: textPackAuditPNG(t)}))
	original, err := os.ReadFile(source)
	if err != nil {
		t.Fatal(err)
	}
	snapshot, err := readTextBundleSnapshot(source)
	if err != nil {
		t.Fatal(err)
	}
	parent := textPackAuditTemp(t)
	first, err := materializeTextBundle(parent, source, snapshot.Revision, snapshot.Content, snapshot)
	if err != nil {
		t.Fatal(err)
	}
	second, err := materializeTextBundle(parent, source, snapshot.Revision, snapshot.Content, snapshot)
	if err != nil {
		t.Fatal(err)
	}
	if first == second || filepath.Ext(first) != ".md" || filepath.Dir(first) == filepath.Dir(source) {
		t.Fatal("import did not create distinct ordinary Markdown documents")
	}
	if err := os.WriteFile(first, []byte("edited ordinary document"), 0o600); err != nil {
		t.Fatal(err)
	}
	after, err := os.ReadFile(source)
	if err != nil || !bytes.Equal(original, after) {
		t.Fatal("editing imported document modified its source package")
	}
	secondData, err := os.ReadFile(second)
	if err != nil || string(secondData) != snapshot.Content {
		t.Fatal("separate import was overwritten")
	}
}

func TestTextPackAuditCannotImportInsideSourceBundle(t *testing.T) {
	source := filepath.Join(textPackAuditTemp(t), "source.textbundle")
	if err := os.MkdirAll(filepath.Join(source, "assets"), 0o700); err != nil {
		t.Fatal(err)
	}
	for _, entry := range textPackAuditBase() {
		if err := os.WriteFile(filepath.Join(source, entry.name), entry.data, 0o600); err != nil {
			t.Fatal(err)
		}
	}
	snapshot, err := readTextBundleSnapshot(source)
	if err != nil {
		t.Fatal(err)
	}
	for _, parent := range []string{source, filepath.Join(source, "assets")} {
		if _, err := materializeTextBundle(parent, source, snapshot.Revision, snapshot.Content, snapshot); err == nil {
			t.Fatalf("import modified the original bundle: %s", parent)
		}
	}
	after, err := readTextBundleSnapshot(source)
	if err != nil || after.Revision != snapshot.Revision {
		t.Fatal("rejected import changed source bundle")
	}
}

func TestTextPackAuditRejectsNetworkAndDeviceImageReferencesBeforeIO(t *testing.T) {
	for _, reference := range []string{
		"http://127.0.0.1:9/image.png", "https://example.invalid/image.png", "//host/share/image.png", `\\host\share\image.png`,
		"%2f%2fhost/share/image.png", "file://host/share/image.png", "file://localhost//host/share/image.png", `\\?\C:\image.png`, `\\.\pipe\image.png`,
		"assets/image.png:stream", "assets/CON.png", "assets/COM¹.png", "assets/LPT².png", "C:relative.png", "file:///C:/image.png?query=1",
	} {
		t.Run(reference, func(t *testing.T) {
			if _, err := textPackLocalImagePath(reference, textPackAuditTemp(t)); err == nil {
				t.Fatalf("unsafe image reference accepted: %q", reference)
			}
		})
	}
}

func TestTextPackAuditExportPreservesExistingFiles(t *testing.T) {
	root := textPackAuditTemp(t)
	source := filepath.Join(root, "original.md")
	target := filepath.Join(root, "existing.textpack")
	if err := os.WriteFile(source, []byte("SOURCE"), 0o600); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(target, []byte("EXISTING PACKAGE"), 0o600); err != nil {
		t.Fatal(err)
	}
	for _, destination := range []string{source, target} {
		if err := writeTextPackCopy(source, destination, []byte("NEW")); err == nil {
			t.Fatal("existing export destination overwritten")
		}
	}
	for name, expected := range map[string]string{source: "SOURCE", target: "EXISTING PACKAGE"} {
		actual, err := os.ReadFile(name)
		if err != nil || string(actual) != expected {
			t.Fatalf("original bytes changed: %s", name)
		}
	}
	link := filepath.Join(root, "alias.textpack")
	if err := os.Link(target, link); err == nil {
		if err := writeTextPackCopy(source, link, []byte("NEW")); err == nil {
			t.Fatal("existing hardlink export destination overwritten")
		}
		actual, _ := os.ReadFile(target)
		if string(actual) != "EXISTING PACKAGE" {
			t.Fatal("hardlink write changed existing package")
		}
	}
}
