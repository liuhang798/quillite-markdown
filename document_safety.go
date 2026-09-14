package main

import (
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"io"
	"os"
	"sync"
)

const maxSupportedDocumentBytes = 64 * 1024 * 1024

var documentSaveMu sync.Mutex
var errDocumentConflict = errors.New("DOCUMENT_CONFLICT: the file changed on disk; save a copy to preserve both versions")

func documentRevision(content []byte) string {
	sum := sha256.Sum256(content)
	return hex.EncodeToString(sum[:])
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
	data, err := readDocumentBytes(path)
	if err != nil {
		return errDocumentConflict
	}
	if documentRevision(data) != expected {
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
