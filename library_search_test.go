package main

import (
	"archive/zip"
	"bytes"
	"os"
	"path/filepath"
	"reflect"
	"testing"
)

func TestLibrarySearchUsesOnlyVisibleAuthorizedFilesAndNeverOpensThem(t *testing.T) {
	if maxRecent != 100 {
		t.Fatalf("recent file limit = %d", maxRecent)
	}
	a := testApp(t)
	dir := t.TempDir()
	root := filepath.Join(dir, "folder")
	if err := os.Mkdir(root, 0700); err != nil {
		t.Fatal(err)
	}
	write := func(path string, content []byte) string {
		t.Helper()
		if err := os.WriteFile(path, content, 0600); err != nil {
			t.Fatal(err)
		}
		return path
	}
	body := []byte("中文 NeEdLe.[x]")
	recent := write(filepath.Join(dir, "a.md"), body)
	fav := write(filepath.Join(dir, "b.txt"), body)
	nested := write(filepath.Join(root, "c.md"), body)
	omitted := write(filepath.Join(root, "other.md"), body)
	hidden := write(filepath.Join(root, ".hidden.md"), body)
	missing := filepath.Join(dir, "missing.md")
	binaryFile := write(filepath.Join(dir, "binary.md"), []byte("needle.[x]\x00"))
	p := defaultPreferences()
	p.RecentFiles, p.FavoriteFiles, p.ExplorerRoot = []string{recent, missing, binaryFile}, []string{fav}, root
	if err := a.writePreferences(p); err != nil {
		t.Fatal(err)
	}
	before, err := os.ReadFile(a.preferencePath())
	if err != nil {
		t.Fatal(err)
	}
	for _, tc := range []struct {
		mode, root string
		want       string
	}{{"recent", "", recent}, {"favorites", "", fav}, {"explorer", root, nested}} {
		r, err := a.SearchLibraryFiles(tc.mode, tc.root, "needle.[x]", []string{recent, fav, nested, hidden, missing, binaryFile})
		if err != nil || !reflect.DeepEqual(r.Paths, []string{tc.want}) || r.Skipped != 5 {
			t.Fatalf("%s: %+v, %v", tc.mode, r, err)
		}
	}
	if r, err := a.SearchLibraryFiles("explorer", dir, "needle", []string{omitted}); err == nil || len(r.Paths) != 0 {
		t.Fatal("unselected root accepted")
	}
	if r, err := a.SearchLibraryFiles("recent", "", "missing", []string{recent}); err != nil || len(r.Paths) != 0 || r.Skipped != 0 {
		t.Fatal(r, err)
	}
	after, err := os.ReadFile(a.preferencePath())
	if err != nil || !bytes.Equal(before, after) {
		t.Fatal("search changed library preferences", err)
	}
}

func TestLibrarySearchReadsPackageBodyNotAttachments(t *testing.T) {
	a := testApp(t)
	root, err := filepath.EvalSymlinks(t.TempDir())
	if err != nil {
		t.Fatal(err)
	}
	dir := filepath.Join(root, "sample.textbundle")
	if err := os.MkdirAll(filepath.Join(dir, "assets"), 0700); err != nil {
		t.Fatal(err)
	}
	members := map[string]string{"info.json": `{"version":2}`, "text.markdown": "正文关键词", "assets/text.md": "附件关键词"}
	var buf bytes.Buffer
	z := zip.NewWriter(&buf)
	for name, content := range members {
		if err := os.WriteFile(filepath.Join(dir, filepath.FromSlash(name)), []byte(content), 0600); err != nil {
			t.Fatal(err)
		}
		w, err := z.Create("wrapped.textbundle/" + name)
		if err != nil {
			t.Fatal(err)
		}
		if _, err := w.Write([]byte(content)); err != nil {
			t.Fatal(err)
		}
	}
	if err := z.Close(); err != nil {
		t.Fatal(err)
	}
	pack := filepath.Join(root, "sample.textpack")
	if err := os.WriteFile(pack, buf.Bytes(), 0600); err != nil {
		t.Fatal(err)
	}
	p := defaultPreferences()
	p.RecentFiles = []string{dir, pack}
	if err := a.writePreferences(p); err != nil {
		t.Fatal(err)
	}
	for q, n := range map[string]int{"正文关键词": 2, "附件关键词": 0, "version": 0} {
		r, err := a.SearchLibraryFiles("recent", "", q, p.RecentFiles)
		if err != nil || len(r.Paths) != n || r.Skipped != 0 {
			t.Fatalf("%s: %+v %v", q, r, err)
		}
	}
}

func TestLibrarySearchStreamsBeforeCompletionAndHonorsCancellation(t *testing.T) {
	a := testApp(t)
	dir := t.TempDir()
	paths := []string{filepath.Join(dir, "first.md"), filepath.Join(dir, "second.md")}
	for i, content := range []string{"find", "initially absent"} {
		if err := os.WriteFile(paths[i], []byte(content), 0600); err != nil {
			t.Fatal(err)
		}
	}
	p := defaultPreferences()
	p.RecentFiles = paths
	if err := a.writePreferences(p); err != nil {
		t.Fatal(err)
	}
	var batches []string
	r, err := a.searchLibraryFiles("recent", "", "find", paths, func(batch []string) {
		batches = append(batches, batch...)
		if len(batches) == 1 {
			if err := os.WriteFile(paths[1], []byte("find"), 0600); err != nil {
				t.Fatal(err)
			}
		}
	})
	if err != nil || len(batches) == 0 || batches[0] != paths[0] || !reflect.DeepEqual(r.Paths, paths) {
		t.Fatalf("first hit must be sent before reading the second file: batches=%v final=%+v err=%v", batches, r, err)
	}
	r, err = a.searchLibraryFiles("recent", "", "find", paths, func([]string) {
		_, _ = a.SearchLibraryFiles("recent", "", "", nil)
	})
	if err != nil || !reflect.DeepEqual(r.Paths, paths[:1]) {
		t.Fatalf("scan was not superseded: %+v %v", r, err)
	}
}
