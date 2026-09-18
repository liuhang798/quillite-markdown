package main

import (
	"errors"
	"os"
	"path/filepath"
	"strings"

	wailsruntime "github.com/wailsapp/wails/v2/pkg/runtime"
)

// ReadDocumentConflict is a read-only snapshot: comparing must not change the
// recent-file list or acknowledge a new revision on behalf of the editor.
func (a *App) ReadDocumentConflict(path string) (*Document, error) {
	return a.readDocument(path, false)
}

// SaveConflictCopy never overwrites an existing path, including the source,
// aliases, links, and a destination created after the file picker returned.
func (a *App) SaveConflictCopy(currentPath, content string) (*Document, error) {
	name := filepath.Base(currentPath)
	ext := filepath.Ext(name)
	path, err := wailsruntime.SaveFileDialog(a.ctx, wailsruntime.SaveDialogOptions{
		Title:           a.text("saveAsMarkdown"),
		DefaultFilename: strings.TrimSuffix(name, ext) + "-copy" + ext,
		Filters:         []wailsruntime.FileFilter{{DisplayName: a.text("markdownDocument"), Pattern: "*.md"}},
	})
	if err != nil || path == "" {
		return nil, err
	}
	// The save picker grants access on macOS. Register it before scoped I/O.
	_ = a.rememberMacSecurityScopedPath(path, false)
	write := func(target string) error { return writeConflictCopy(currentPath, target, []byte(content)) }
	_, found, scopeErr := a.withMacSecurityScopedPath(path, write)
	if found {
		err = scopeErr
	} else {
		err = write(path)
	}
	if err != nil {
		return nil, err
	}
	return a.savedDocumentReceipt(path, content, true)
}

func writeConflictCopy(source, path string, content []byte) error {
	if len(content) > maxSupportedDocumentBytes {
		return errors.New("DOCUMENT_TOO_LARGE: maximum supported document size is 64 MiB")
	}
	path, err := filepath.Abs(filepath.Clean(path))
	if err != nil {
		return err
	}
	source, err = filepath.Abs(filepath.Clean(source))
	if err != nil {
		return err
	}
	if sameFilesystemPath(source, path) {
		return errors.New("DOCUMENT_COPY_EXISTS: the conflict source cannot be used as a copy destination")
	}
	file, err := os.OpenFile(path, os.O_WRONLY|os.O_CREATE|os.O_EXCL, 0o600)
	if os.IsExist(err) {
		return errors.New("DOCUMENT_COPY_EXISTS: choose a new filename; existing files are never overwritten")
	}
	if err != nil {
		return err
	}
	// On failure preserve the newly created partial copy for recovery. Never
	// remove a path that could have been replaced by another process.
	_, err = file.Write(content)
	if err == nil {
		err = file.Sync()
	}
	if closeErr := file.Close(); err == nil {
		err = closeErr
	}
	return err
}
