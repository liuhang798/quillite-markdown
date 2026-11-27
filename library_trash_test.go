package main

import (
	"errors"
	"os"
	"path/filepath"
	"slices"
	"testing"
)

func TestLibraryTrashBoundaries(t *testing.T) {
	for _, tc := range []string{"cancel", "missing", "unlisted", "stale-scope", "folder", "inside-bundle", "private", "link", "changed", "lost-membership", "bin-unavailable", "recent", "favorites", "explorer"} {
		t.Run(tc, func(t *testing.T) {
			a := testApp(t)
			dir, err := filepath.EvalSymlinks(t.TempDir())
			if err != nil {
				t.Fatal(err)
			}
			path := filepath.Join(dir, "doc.md")
			switch tc {
			case "private":
				path = filepath.Join(filepath.Dir(a.preferencePath()), "doc.md")
			case "folder":
				path = filepath.Join(dir, "folder.textbundle")
				if err := os.Mkdir(path, 0700); err != nil {
					t.Fatal(err)
				}
			case "inside-bundle":
				base := filepath.Join(dir, "doc.textbundle")
				if err := os.Mkdir(base, 0700); err != nil {
					t.Fatal(err)
				}
				path = filepath.Join(base, "text.md")
			}
			write := func(p, body string) {
				t.Helper()
				if err := os.WriteFile(p, []byte(body), 0600); err != nil {
					t.Fatal(err)
				}
			}
			other := filepath.Join(dir, "neighbor.md")
			write(other, "untouched")
			if tc == "link" {
				if err := os.Symlink(other, path); err != nil {
					t.Skip(err)
				}
			} else if tc != "missing" && tc != "folder" {
				write(path, "original")
			}
			p := defaultPreferences()
			p.RecentFiles = []string{path, other}
			p.FavoriteFiles = []string{path}
			p.PinnedRecentFiles = []string{path}
			p.LastFile = path
			p.ExplorerRoot = dir
			if tc == "unlisted" {
				p.RecentFiles = []string{other}
				p.PinnedRecentFiles = nil
			}
			if err := a.writePreferences(p); err != nil {
				t.Fatal(err)
			}
			mode, root := "recent", dir
			if tc == "favorites" || tc == "explorer" {
				mode = tc
			}
			if tc == "stale-scope" {
				mode = "explorer"
				root = filepath.Dir(dir)
			}
			confirmed, moved := 0, 0
			result, err := a.trashLibraryFile(mode, root, path, func(shown string) (bool, error) {
				confirmed++
				if shown != path {
					t.Fatalf("wrong prompt path %q", shown)
				}
				if tc == "changed" {
					write(path, "new contents")
				}
				if tc == "lost-membership" {
					if _, err := a.RemoveRecent(path); err != nil {
						t.Fatal(err)
					}
				}
				return tc != "cancel", nil
			}, func(target string) error {
				moved++
				if target != path {
					t.Fatalf("wrong target %q", target)
				}
				if tc == "bin-unavailable" {
					return errors.New("no trash")
				}
				return os.Rename(target, filepath.Join(dir, "recycled-fixture"))
			})
			success := tc == "recent" || tc == "favorites" || tc == "explorer"
			if success != (err == nil && result == "trashed") {
				t.Fatalf("result=%q error=%v", result, err)
			}
			if tc == "cancel" && (result != "cancelled" || err != nil) {
				t.Fatal(result, err)
			}
			if (success || tc == "bin-unavailable") != (moved == 1) {
				t.Fatalf("moves=%d", moved)
			}
			if (success || slices.Contains([]string{"cancel", "changed", "lost-membership", "bin-unavailable"}, tc)) != (confirmed == 1) {
				t.Fatalf("prompts=%d", confirmed)
			}
			q, err := a.readPreferences()
			if err != nil {
				t.Fatal(err)
			}
			if success && (slices.Contains(q.RecentFiles, path) || slices.Contains(q.PinnedRecentFiles, path) || slices.Contains(q.FavoriteFiles, path) || q.LastFile == path) {
				t.Fatal("stale records")
			}
			if !success && !slices.Contains(q.FavoriteFiles, path) {
				t.Fatal("failed/cancelled move removed favorite")
			}
			_, err = os.Lstat(path)
			if (success || tc == "missing") != os.IsNotExist(err) {
				t.Fatalf("source stat: %v", err)
			}
			body, err := os.ReadFile(other)
			if err != nil || string(body) != "untouched" {
				t.Fatal("neighbor modified")
			}
		})
	}
}

// Explicit opt-in only: the system Trash receives one clearly identified
// temporary document. Never accept a file path from flags or environment.
func TestLibraryTrashNativeSmoke(t *testing.T) {
	if os.Getenv("QUILLITE_TEST_NATIVE_TRASH") != "1" {
		t.Skip("opt-in desktop integration")
	}
	dir, err := filepath.EvalSymlinks(t.TempDir())
	if err != nil {
		t.Fatal(err)
	}
	fd, err := os.CreateTemp(dir, "Quillite-recycle-test-*.md")
	if err != nil {
		t.Fatal(err)
	}
	path := fd.Name()
	if _, err := fd.WriteString("Temporary Quillite recycle-bin integration test."); err != nil {
		t.Fatal(err)
	}
	if err := fd.Close(); err != nil {
		t.Fatal(err)
	}
	a := testApp(t)
	p := defaultPreferences()
	p.RecentFiles = []string{path}
	if err := a.writePreferences(p); err != nil {
		t.Fatal(err)
	}
	result, err := a.trashLibraryFile("recent", "", path, func(shown string) (bool, error) { return shown == path, nil }, moveDocumentToTrash)
	if result != "trashed" || err != nil {
		t.Fatalf("result=%q err=%v", result, err)
	}
	if _, err := os.Lstat(path); !os.IsNotExist(err) {
		t.Fatalf("source still exists: %v", err)
	}
	t.Logf("recycled %s", filepath.Base(path))
}
