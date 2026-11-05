package main

import (
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"io"
	"os"
	"path/filepath"
	"sync"
	"time"
)

const maxSupportedDocumentBytes = 64 * 1024 * 1024

// Package commits may verify an archive larger than its Markdown body. This is
// an explicit internal limit, never inferred from a path or extension (private
// isolated originals intentionally have no extension).
const maxDocumentRevisionBytes int64 = 256 * 1024 * 1024

var documentSaveMu sync.Mutex
var errDocumentConflict = errors.New("DOCUMENT_CONFLICT: the file changed on disk; save a copy to preserve both versions")

func documentRevision(content []byte) string {
	sum := sha256.Sum256(content)
	return hex.EncodeToString(sum[:])
}

// A save receipt describes exactly the bytes this operation wrote. Never read
// content/revision back from the path: another writer may have changed it in
// the meantime, and that revision must not authorize the next editor save.
func (a *App) savedDocumentReceipt(path, content string, remember bool) (*Document, error) {
	absPath, err := filepath.Abs(filepath.Clean(path))
	if err != nil {
		return nil, err
	}
	doc := &Document{
		Path: absPath, Name: filepath.Base(absPath), Directory: filepath.Dir(absPath),
		Content: content, Revision: documentRevision([]byte(content)), Size: int64(len(content)),
		ModifiedAt: time.Now().Format(time.RFC3339Nano), Draft: a.isDraft(absPath),
	}
	if remember {
		_ = a.rememberFile(absPath)
	}
	return doc, nil
}

func readDocumentBytes(path string) ([]byte, error) {
	file, err := os.Open(path)
	if err != nil {
		return nil, err
	}
	defer file.Close()
	info, err := file.Stat()
	if err != nil {
		return nil, err
	}
	if !info.Mode().IsRegular() {
		return nil, errors.New("document is not a regular file")
	}
	if info.Size() > maxSupportedDocumentBytes {
		return nil, errors.New("DOCUMENT_TOO_LARGE: maximum supported document size is 64 MiB")
	}
	data, err := io.ReadAll(io.LimitReader(file, maxSupportedDocumentBytes+1))
	if len(data) > maxSupportedDocumentBytes {
		return nil, errors.New("DOCUMENT_TOO_LARGE: maximum supported document size is 64 MiB")
	}
	return data, err
}

func checkDocumentRevision(path, expected string) error {
	return checkDocumentRevisionWithLimit(path, expected, maxSupportedDocumentBytes)
}

func validDocumentRevisionLimit(limit int64) bool {
	return limit > 0 && limit <= maxDocumentRevisionBytes
}

// Check with bounded streaming rather than retaining another full archive in
// memory. Ordinary document readers and their 64 MiB cap remain unchanged.
func checkDocumentRevisionWithLimit(path, expected string, limit int64) error {
	if !validDocumentRevisionLimit(limit) {
		return errDocumentConflict
	}
	file, err := os.Open(path)
	if err != nil {
		return errDocumentConflict
	}
	defer file.Close()
	info, err := file.Stat()
	if err != nil || !info.Mode().IsRegular() || info.Size() > limit {
		return errDocumentConflict
	}
	return checkDocumentRevisionReaderWithLimit(file, expected, limit)
}

// Windows passes the same deny-write/delete handle it subsequently renames.
// This must not reopen the pathname or silently revert to the ordinary cap.
func checkDocumentRevisionReaderWithLimit(input io.Reader, expected string, limit int64) error {
	if !validDocumentRevisionLimit(limit) {
		return errDocumentConflict
	}
	hash := sha256.New()
	size, err := io.Copy(hash, io.LimitReader(input, limit+1))
	if err != nil || size > limit || hex.EncodeToString(hash.Sum(nil)) != expected {
		return errDocumentConflict
	}
	return nil
}

// SaveFileWithRevision rejects stale editor buffers, including files deleted
// or replaced by another editor. No forced overwrite is exposed to the UI.
func (a *App) SaveFileWithRevision(path, content, revision string) (*Document, error) {
	if len(revision) != 64 {
		return nil, errDocumentConflict
	}
	return a.saveFile(path, content, revision)
}
