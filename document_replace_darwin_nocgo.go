//go:build darwin && !cgo

package main

import (
	"errors"
	"os"
)

func validateDocumentMetadata(path string) error {
	if _, err := os.Stat(path); os.IsNotExist(err) {
		return nil
	}
	return errors.New("DOCUMENT_METADATA_REQUIRES_COPY: native metadata support is unavailable; save a copy")
}
func replaceDocumentFile(staged, target string) error { return os.Rename(staged, target) }
