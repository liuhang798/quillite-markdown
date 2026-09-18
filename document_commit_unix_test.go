//go:build !windows

package main

import (
	"os"
	"path/filepath"
	"testing"
)

func TestDocumentCommitRetainsLateExternalDescriptorWrites(t *testing.T) {
	dir := t.TempDir()
	target, staged := filepath.Join(dir, "doc.md"), filepath.Join(dir, "stage")
	os.WriteFile(target, []byte("original"), 0600)
	os.WriteFile(staged, []byte("editor"), 0600)
	f, err := os.OpenFile(target, os.O_WRONLY, 0600)
	if err != nil {
		t.Fatal(err)
	}
	defer f.Close()
	err = commitDocumentReplacementWithPublish(staged, target, documentRevision([]byte("original")), func(candidate, path string) error {
		if _, err := f.WriteAt([]byte("external"), 0); err != nil {
			t.Fatal(err)
		}
		return publishDocumentFile(candidate, path)
	})
	if err != nil {
		t.Fatal(err)
	}
	assertDocumentBytes(t, target, "editor")
	backups, _ := filepath.Glob(filepath.Join(dir, ".quillite-save-recovery-*", "original"))
	if len(backups) != 1 {
		t.Fatal("original inode lost")
	}
	assertDocumentBytes(t, backups[0], "external")
}
