package main

import (
	"fmt"
	"os"
	"path/filepath"
	"runtime"
)

// writeDocumentAtomically never truncates an existing document in place. The
// original is restored or retained as recovery material if publication fails.
func writeDocumentAtomically(path string, content []byte) error {
	return writeDocumentWithRevision(path, content, "")
}

func writeDocumentWithRevision(path string, content []byte, revision string) error {
	target := filepath.Clean(path)
	info, err := os.Lstat(target)
	if err == nil && info.Mode()&os.ModeSymlink != 0 {
		// Preserve the user's link and replace its actual target, as WriteFile did.
		target, err = filepath.EvalSymlinks(target)
		if err != nil {
			return err
		}
		info, err = os.Stat(target)
	}
	mode := os.FileMode(0o644)
	if err == nil {
		if !info.Mode().IsRegular() {
			return fmt.Errorf("document is not a regular file: %s", target)
		}
		if !canEditFile(target) {
			return os.ErrPermission
		}
		mode = info.Mode().Perm()
	} else if !os.IsNotExist(err) {
		return err
	}
	if revision != "" {
		if err := checkDocumentRevision(target, revision); err != nil {
			return err
		}
	}
	if err := validateDocumentMetadata(target); err != nil {
		return err
	}

	temporary, err := os.CreateTemp(filepath.Dir(target), ".quillite-document-*.tmp")
	if err != nil {
		return fmt.Errorf("DOCUMENT_SAFE_SAVE_ACCESS: cannot create a safe temporary file in the document directory; save a copy in an authorized folder: %w", err)
	}
	temporaryPath := temporary.Name()
	defer os.Remove(temporaryPath)
	if err = temporary.Chmod(mode); err == nil {
		_, err = temporary.Write(content)
	}
	if err == nil {
		err = temporary.Sync()
	}
	if closeErr := temporary.Close(); err == nil {
		err = closeErr
	}
	if err != nil {
		return err
	}
	if revision != "" {
		if err := checkDocumentRevision(target, revision); err != nil {
			return err
		}
	}
	return classifyExportWriteError(runtime.GOOS, commitDocumentReplacement(temporaryPath, target, revision))
}
