package main

import (
	"os"
	"path/filepath"
	"runtime"
)

// Stage complete output beside its destination, then replace it in one rename.
// Never delete the original as a fallback: failure must preserve existing data.
func writeFileAtomically(filePath string, data []byte) error {
	directory := filepath.Dir(filepath.Clean(filePath))
	if err := os.MkdirAll(directory, 0o755); err != nil {
		return err
	}
	temporary, err := os.CreateTemp(directory, ".quillite-write-*.tmp")
	if err != nil {
		return err
	}
	temporaryPath := temporary.Name()
	defer os.Remove(temporaryPath)
	if _, err = temporary.Write(data); err == nil {
		err = temporary.Sync()
	}
	if closeErr := temporary.Close(); err == nil {
		err = closeErr
	}
	if err != nil {
		return err
	}
	// Go uses MoveFileEx(REPLACE_EXISTING) on Windows, so existing files do
	// not need to be removed first. Locked destinations remain untouched.
	return classifyExportWriteError(runtime.GOOS, os.Rename(temporaryPath, filepath.Clean(filePath)))
}
