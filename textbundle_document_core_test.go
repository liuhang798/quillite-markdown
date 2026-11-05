package main

import (
	"archive/zip"
	"bytes"
	"io"
	"os"
	"path/filepath"
	"reflect"
	"strings"
	"testing"
	"time"
)

func editableBundleTestArchive(t *testing.T, prefix string, bom bool) []byte {
	t.Helper()
	var output bytes.Buffer
	w := zip.NewWriter(&output)
	if err := w.SetComment("third-party archive comment \x00 preserved"); err != nil {
		t.Fatal(err)
	}
	text := []byte("# Original\r\n\r\n![Image](assets/a.png)\r\n")
	if bom {
		text = append([]byte{0xef, 0xbb, 0xbf}, text...)
	}
	entries := []struct {
		name, comment string
		data          []byte
		mode          os.FileMode
		method        uint16
	}{
		{prefix + "info.json", "metadata comment", []byte("{\n  \"version\":2,\n  \"type\":\"net.daringfireball.markdown\",\n  \"app.unknown\": {\"favorite\": true, \"opaque\": [3,2,1]}\n}\n"), 0o640, zip.Deflate},
		{prefix + "text.markdown", "text comment", text, 0o600, zip.Deflate},
		{prefix + "assets/", "directory comment", nil, os.ModeDir | 0o750, zip.Store},
		{prefix + "assets/a.png", "image comment", textPackTestPNG(t), 0o440, zip.Store},
		{prefix + "assets/not-an-image.bin", "opaque image-dir attachment", []byte{0, 7, 99, 0, 255}, 0o600, zip.Deflate},
		{prefix + "third-party/state.dat", "unknown state", []byte("\x00opaque\x00data\xff"), 0o640, zip.Deflate},
	}
	for _, entry := range entries {
		header := &zip.FileHeader{Name: entry.name, Comment: entry.comment, Method: entry.method,
			Extra: []byte{0xfe, 0xca, 0x03, 0x00, 0x07, 0x08, 0x09}, Modified: time.Date(2023, 7, 8, 9, 10, 12, 0, time.UTC)}
		header.SetMode(entry.mode)
		r, err := w.CreateHeader(header)
		if err != nil {
			t.Fatal(err)
		}
		if _, err := r.Write(entry.data); err != nil {
			t.Fatal(err)
		}
	}
	if err := w.Close(); err != nil {
		t.Fatal(err)
	}
	return output.Bytes()
}

func editableBundleTestReader(t *testing.T, data []byte) *zip.Reader {
	t.Helper()
	reader, err := zip.NewReader(bytes.NewReader(data), int64(len(data)))
	if err != nil {
		t.Fatal(err)
	}
	return reader
}

func editableBundleTestReadEntry(t *testing.T, entry *zip.File, raw bool) []byte {
	t.Helper()
	var r io.Reader
	if raw {
		reader, err := entry.OpenRaw()
		if err != nil {
			t.Fatal(err)
		}
		r = reader
	} else {
		reader, err := entry.Open()
		if err != nil {
			t.Fatal(err)
		}
		defer reader.Close()
		r = reader
	}
	data, err := io.ReadAll(r)
	if err != nil {
		t.Fatal(err)
	}
	return data
}

func TestEditableTextPackPreservesThirdPartyBytesHeadersAndComment(t *testing.T) {
	for _, prefix := range []string{"", "third-party.textbundle/"} {
		t.Run(prefix, func(t *testing.T) {
			dir := textPackTestDirectory(t)
			name := filepath.Join(dir, "Original.textpack")
			original := editableBundleTestArchive(t, prefix, true)
			textPackTestWrite(t, name, original)
			snapshot, err := readEditableBundle(name)
			if err != nil {
				t.Fatal(err)
			}
			if snapshot.Kind != "textpack" || snapshot.Prefix != prefix || snapshot.TextEntry != prefix+"text.markdown" || snapshot.Revision != documentRevision(original) || strings.HasPrefix(snapshot.Content, "\ufeff") {
				t.Fatalf("invalid snapshot: %+v", snapshot)
			}
			updated := "# Changed\n\nNew text and unchanged third-party resources.\n"
			built, err := buildEditableTextPack(snapshot, updated, map[string][]byte{prefix + "assets/new.png": textPackTestPNG(t)})
			if err != nil {
				t.Fatal(err)
			}
			before, after := editableBundleTestReader(t, original), editableBundleTestReader(t, built)
			if before.Comment != after.Comment || len(after.File) != len(before.File)+1 {
				t.Fatal("archive comment or unknown entries were lost")
			}
			for i, entry := range before.File {
				written := after.File[i]
				if entry.Name != written.Name {
					t.Fatal("original entry order changed")
				}
				if entry.Name == snapshot.TextEntry {
					if got := editableBundleTestReadEntry(t, written, false); string(got) != "\ufeff"+updated {
						t.Fatalf("replacement body lost BOM or text: %q", got)
					}
					continue
				}
				if !reflect.DeepEqual(entry.FileHeader, written.FileHeader) {
					t.Fatalf("third-party ZIP header changed for %s\n%+v\n%+v", entry.Name, entry.FileHeader, written.FileHeader)
				}
				if !bytes.Equal(editableBundleTestReadEntry(t, entry, true), editableBundleTestReadEntry(t, written, true)) {
					t.Fatalf("compressed third-party bytes changed: %s", entry.Name)
				}
			}
			if disk, _ := os.ReadFile(name); !bytes.Equal(disk, original) {
				t.Fatal("building a package unexpectedly modified the source")
			}
		})
	}
}

func TestEditableTextPackNoOpPreservesWholeOriginalArchive(t *testing.T) {
	name := filepath.Join(textPackTestDirectory(t), "Noop.textpack")
	original := editableBundleTestArchive(t, "", true)
	textPackTestWrite(t, name, original)
	snapshot, err := readEditableBundle(name)
	if err != nil {
		t.Fatal(err)
	}
	got, err := buildEditableTextPack(snapshot, snapshot.Content, nil)
	if err != nil || !bytes.Equal(got, original) {
		t.Fatalf("no-op rewrote original: %v", err)
	}
	text, err := editableBundleTextBytes(snapshot, snapshot.Content)
	if err != nil || !bytes.Equal(text, snapshot.Files[snapshot.TextEntry]) {
		t.Fatal("no-op lost original text bytes")
	}
}

func TestEditableTextPackUsesActualRootAndCoversArchiveMetadataRevision(t *testing.T) {
	dir := textPackTestDirectory(t)
	name := filepath.Join(dir, "Root.textpack")
	files := map[string][]byte{
		"info.json": []byte(`{"version":2}`), "text.md": []byte("root body"),
		"nested.textbundle/info.json": []byte(`{"version":2}`), "nested.textbundle/text.md": []byte("opaque nested body"),
	}
	original := textPackTestZip(t, files)
	textPackTestWrite(t, name, original)
	snapshot, err := readEditableBundle(name)
	if err != nil || snapshot.TextEntry != "text.md" || snapshot.Content != "root body" {
		t.Fatalf("unrelated nested bundle displaced actual root: %+v %v", snapshot, err)
	}
	changed, err := buildEditableTextPack(snapshot, "changed root", nil)
	if err != nil {
		t.Fatal(err)
	}
	for _, entry := range editableBundleTestReader(t, changed).File {
		if entry.Name == "nested.textbundle/text.md" && string(editableBundleTestReadEntry(t, entry, false)) != "opaque nested body" {
			t.Fatal("unrelated third-party nested document was changed")
		}
	}
	// Changing only the archive comment must still create a conflict revision.
	var buffer bytes.Buffer
	w := zip.NewWriter(&buffer)
	if err := w.SetComment("external metadata-only edit"); err != nil {
		t.Fatal(err)
	}
	for _, entry := range editableBundleTestReader(t, original).File {
		if err := w.Copy(entry); err != nil {
			t.Fatal(err)
		}
	}
	if err := w.Close(); err != nil {
		t.Fatal(err)
	}
	textPackTestWrite(t, name, buffer.Bytes())
	next, err := readEditableBundle(name)
	if err != nil || next.Revision == snapshot.Revision || next.Content != snapshot.Content {
		t.Fatal("metadata-only external change not reflected in package revision")
	}
}

func TestEditableTextPackNewAssetsRespectEmptyDirectoryCaseAliases(t *testing.T) {
	dir := textPackTestDirectory(t)
	name := filepath.Join(dir, "EmptyDirectories.textpack")
	var buffer bytes.Buffer
	w := zip.NewWriter(&buffer)
	for entryName, data := range map[string][]byte{"info.json": []byte(`{"version":2}`), "text.md": []byte("body")} {
		entry, err := w.Create(entryName)
		if err != nil {
			t.Fatal(err)
		}
		if _, err := entry.Write(data); err != nil {
			t.Fatal(err)
		}
	}
	header := &zip.FileHeader{Name: "assets/EMPTY/"}
	header.SetMode(os.ModeDir | 0o700)
	if _, err := w.CreateHeader(header); err != nil {
		t.Fatal(err)
	}
	if err := w.Close(); err != nil {
		t.Fatal(err)
	}
	textPackTestWrite(t, name, buffer.Bytes())
	snapshot, err := readEditableBundle(name)
	if err != nil {
		t.Fatal(err)
	}
	if _, err := buildEditableTextPack(snapshot, "updated", map[string][]byte{"assets/empty/new.png": textPackTestPNG(t)}); err == nil {
		t.Fatal("new asset case-collided with an originally empty directory")
	}
}

func TestEditableBundleDirectoryRevisionIncludesOpaqueResources(t *testing.T) {
	dir := filepath.Join(textPackTestDirectory(t), "Original.textbundle")
	files := map[string][]byte{
		"info.json": []byte(`{"version":2,"type":"net.daringfireball.markdown","third-party":{"id":123}}`),
		"text.md":   []byte("# Original"), "assets/a.png": textPackTestPNG(t), "third-party/state.dat": []byte("unknown resource"),
	}
	for name, data := range files {
		textPackTestWrite(t, filepath.Join(dir, filepath.FromSlash(name)), data)
	}
	snapshot, err := readEditableBundle(dir)
	if err != nil {
		t.Fatal(err)
	}
	if snapshot.Kind != "textbundle" || snapshot.TextEntry != "text.md" || snapshot.Revision != editableBundleDirectoryRevision(files) {
		t.Fatal("directory package fingerprint differs from all-file fingerprint")
	}
	copyFiles := make(map[string][]byte, len(files))
	for name, data := range files {
		copyFiles[name] = data
	}
	for _, changed := range []string{"info.json", "assets/a.png", "third-party/state.dat", "text.md"} {
		copyFiles[changed] = append(append([]byte{}, files[changed]...), '\n')
		if editableBundleDirectoryRevision(copyFiles) == snapshot.Revision {
			t.Fatalf("fingerprint ignores %s", changed)
		}
		copyFiles[changed] = files[changed]
	}
	want := "# Changed"
	updated, err := editableBundleFilesWithContent(snapshot, want, nil)
	if err != nil || string(updated["text.md"]) != want || string(files["text.md"]) != "# Original" {
		t.Fatal("replacement mutated source snapshot")
	}
	for name, data := range files {
		if name != "text.md" && !bytes.Equal(updated[name], data) {
			t.Fatalf("opaque directory resource changed: %s", name)
		}
	}
}

func TestEditableTextBundleBuildsCompleteWorkspaceAndCopyArchive(t *testing.T) {
	parent := textPackTestDirectory(t)
	dir := filepath.Join(parent, "Original.textbundle")
	files := map[string][]byte{
		"info.json":    []byte("{ \"version\": 2, \"third-party\": {\"opaque\":true} }\n"),
		"text.md":      append([]byte{0xef, 0xbb, 0xbf}, []byte("# Directory original\r\n")...),
		"assets/a.png": textPackTestPNG(t), "assets/opaque.bin": []byte{0, 1, 2, 0xff},
		"custom/state.bin": []byte("\x00unknown third-party resource\xff"),
	}
	for name, data := range files {
		textPackTestWrite(t, filepath.Join(dir, filepath.FromSlash(name)), data)
	}
	if err := os.Mkdir(filepath.Join(dir, "empty-third-party-directory"), 0o750); err != nil {
		t.Fatal(err)
	}
	snapshot, err := readEditableBundle(dir)
	if err != nil {
		t.Fatal(err)
	}
	for _, content := range []string{snapshot.Content, "# Edited copy\n"} {
		data, err := buildEditableTextPack(snapshot, content, map[string][]byte{"assets/new.png": textPackTestPNG(t)})
		if err != nil {
			t.Fatalf("directory cannot form complete ZIP baseline/copy: %v", err)
		}
		// Receipt construction must work even when this destination does not
		// exist, or contains a completely different concurrent writer's data.
		target := filepath.Join(parent, "Snapshot.textpack")
		textPackTestWrite(t, target, []byte("concurrent writer contents, not a ZIP"))
		receipt, err := editableTextPackSnapshot(target, data)
		if err != nil {
			t.Fatal(err)
		}
		if receipt.Kind != "textpack" || receipt.TextEntry != "text.md" || receipt.Content != content || receipt.Revision != documentRevision(data) {
			t.Fatalf("bad in-memory ZIP receipt: %+v", receipt)
		}
		for name, want := range files {
			if name == "text.md" {
				want, err = editableBundleTextBytes(snapshot, content)
				if err != nil {
					t.Fatal(err)
				}
			}
			if !bytes.Equal(receipt.Files[name], want) {
				t.Fatalf("complete directory resource missing from ZIP: %s", name)
			}
			original, err := os.ReadFile(filepath.Join(dir, filepath.FromSlash(name)))
			if err != nil || !bytes.Equal(original, files[name]) {
				t.Fatalf("directory source changed during baseline/copy build: %s", name)
			}
		}
		foundEmpty := false
		for _, entry := range receipt.archive.File {
			if entry.Name == "empty-third-party-directory/" {
				foundEmpty = entry.Mode().IsDir()
			}
		}
		if !foundEmpty {
			t.Fatal("empty third-party directory lost from directory ZIP copy")
		}
	}
}

func TestEditableTextPackSnapshotValidatesBytesRatherThanReadingPath(t *testing.T) {
	missing := filepath.Join(textPackTestDirectory(t), "missing.textpack")
	valid := editableBundleTestArchive(t, "", false)
	snapshot, err := editableTextPackSnapshot(missing, valid)
	if err != nil || snapshot.Revision != documentRevision(valid) || snapshot.SourcePath != missing {
		t.Fatalf("byte snapshot unexpectedly depends on public path: %+v %v", snapshot, err)
	}
	for _, invalid := range [][]byte{nil, []byte("not ZIP"), textPackTestZip(t, map[string][]byte{"info.json": []byte(`{"version":2}`), "text.md": []byte("body"), "../outside": []byte("escape")})} {
		if _, err := editableTextPackSnapshot(missing, invalid); err == nil {
			t.Fatal("invalid bytes accepted as an editable package receipt")
		}
	}
}

func TestEditableTextPackRejectsAssetOverwriteEscapeAndCaseCollision(t *testing.T) {
	name := filepath.Join(textPackTestDirectory(t), "Assets.textpack")
	textPackTestWrite(t, name, editableBundleTestArchive(t, "Root.textbundle/", false))
	snapshot, err := readEditableBundle(name)
	if err != nil {
		t.Fatal(err)
	}
	for _, bad := range []map[string][]byte{
		{"assets/outside-prefix.png": textPackTestPNG(t)},
		{"Root.textbundle/assets/../outside.png": textPackTestPNG(t)},
		{"Root.textbundle/assets/a.png": []byte("overwrite")},
		{"Root.textbundle/assets/A.png": textPackTestPNG(t)},
		{"Root.textbundle/assets/not-image.png": []byte("not an image")},
	} {
		if _, err := buildEditableTextPack(snapshot, "# Changed", bad); err == nil {
			t.Fatalf("accepted unsafe added asset: %v", bad)
		}
	}
}

func TestEditableTextPackRejectsInvalidOrCorruptInputs(t *testing.T) {
	dir := textPackTestDirectory(t)
	base := map[string][]byte{"info.json": []byte(`{"version":2}`), "text.md": []byte("ok")}
	for _, badName := range []string{"../escape", "assets/A/one", "assets/a/two"} {
		files := make(map[string][]byte)
		for name, data := range base {
			files[name] = data
		}
		files[badName] = []byte("bad")
		if strings.Contains(badName, "/A/") || strings.Contains(badName, "/a/") {
			files["assets/A/one"] = []byte("one")
			files["assets/a/two"] = []byte("two")
		}
		name := filepath.Join(dir, "Bad.textpack")
		textPackTestWrite(t, name, textPackTestZip(t, files))
		if _, err := readEditableBundle(name); err == nil {
			t.Fatalf("accepted unsafe package entry: %s", badName)
		}
	}
	data := editableBundleTestArchive(t, "", false)
	reader := editableBundleTestReader(t, data)
	for _, file := range reader.File {
		if file.Name == "assets/a.png" {
			offset, err := file.DataOffset()
			if err != nil {
				t.Fatal(err)
			}
			data[offset] ^= 0xff
		}
	}
	name := filepath.Join(dir, "Corrupt.textpack")
	textPackTestWrite(t, name, data)
	if _, err := readEditableBundle(name); err == nil {
		t.Fatal("accepted corrupted preserved resource")
	}
}

func TestEditableBundleAssetReadCannotEscapePackage(t *testing.T) {
	name := filepath.Join(textPackTestDirectory(t), "Images.textpack")
	textPackTestWrite(t, name, editableBundleTestArchive(t, "Root.textbundle/", false))
	snapshot, err := readEditableBundle(name)
	if err != nil {
		t.Fatal(err)
	}
	data, kind, err := readEditableBundleAsset(snapshot, "assets/a.png")
	if err != nil || kind != "image/png" || !bytes.Equal(data, textPackTestPNG(t)) {
		t.Fatal("package asset not readable")
	}
	for _, bad := range []string{"../outside.png", "file:///tmp/a.png", "https://example.test/a.png", "assets/a.png?x", "assets/a.png#x", "assets/not-an-image.bin"} {
		if _, _, err := readEditableBundleAsset(snapshot, bad); err == nil {
			t.Fatalf("read unsafe/non-image asset %q", bad)
		}
	}
}
