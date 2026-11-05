package main

import (
	"encoding/hex"
	"fmt"
	"os"
	"path/filepath"
)

// The package layer provides already validated document/archive bytes and a
// package-policy callback. This writer owns only its fresh private stage, not
// arbitrary attachments or any recovery copies retained by the commit layer.
func writeBundleDocumentWithRevision(target string, data []byte, revision string, limit int64, recoveryParent string, beforePublish func() error) error {
	if !validDocumentRevisionLimit(limit) {
		return errDocumentConflict
	}
	if int64(len(data)) > limit {
		return textPackError("TEXTPACK_LIMIT: staged package data exceeds its supported save limit")
	}
	target, err := filepath.Abs(filepath.Clean(target))
	if err != nil {
		return err
	}
	if recoveryParent == "" {
		recoveryParent = filepath.Dir(target)
	} else if !filepath.IsAbs(recoveryParent) {
		return fmt.Errorf("DOCUMENT_SAFE_SAVE_ACCESS: recovery parent must be absolute")
	}
	recoveryParent = filepath.Clean(recoveryParent)
	if err := textPackNoLinks(recoveryParent); err != nil {
		return err
	}
	parentInfo, err := os.Lstat(recoveryParent)
	if err != nil || !parentInfo.IsDir() {
		return fmt.Errorf("DOCUMENT_SAFE_SAVE_ACCESS: recovery parent is unavailable")
	}
	if err := textPackNoLinks(filepath.Dir(target)); err != nil {
		return err
	}
	targetInfo, statErr := os.Lstat(target)
	if os.IsNotExist(statErr) {
		// This API updates only an existing original. A missing original is a
		// conflict, never authority to recreate it from a recovery buffer.
		return errDocumentConflict
	}
	if statErr != nil {
		return statErr
	}
	if err := textPackNoLinks(target); err != nil {
		return err
	}
	decoded, revisionErr := hex.DecodeString(revision)
	if !targetInfo.Mode().IsRegular() || revisionErr != nil || len(decoded) != 32 || !canEditFile(target) {
		return errDocumentConflict
	}
	if err := validateDocumentMetadata(target); err != nil {
		return err
	}
	if err := checkDocumentRevisionWithLimit(target, revision, limit); err != nil {
		return err
	}
	mode := targetInfo.Mode().Perm()

	stageDir, err := os.MkdirTemp(recoveryParent, ".quillite-bundle-stage-")
	if err != nil {
		return fmt.Errorf("DOCUMENT_SAFE_SAVE_ACCESS: cannot prepare a protected bundle save: %w", err)
	}
	retained := func(cause error) error {
		// An interrupted/failed stage may contain the only complete edited
		// bytes. Never delete it or a commit layer's separately retained copy.
		return fmt.Errorf("%w; bundle save preparation retained at %s", cause, stageDir)
	}
	stageInfo, err := os.Lstat(stageDir)
	if err != nil || !stageInfo.IsDir() || stageInfo.Mode()&os.ModeSymlink != 0 {
		return retained(textPackError("TEXTPACK_UNSAFE_PATH"))
	}
	root, err := textPackOpenRoot(stageDir)
	if err != nil {
		return retained(err)
	}
	opened, err := root.Stat(".")
	if err != nil || !os.SameFile(stageInfo, opened) {
		root.Close()
		return retained(textPackError("TEXTPACK_CHANGED"))
	}
	file, err := root.OpenFile("content", os.O_WRONLY|os.O_CREATE|os.O_EXCL, mode)
	if err != nil {
		root.Close()
		return retained(err)
	}
	if err = file.Chmod(mode); err == nil {
		_, err = file.Write(data)
	}
	if err == nil {
		err = file.Sync()
	}
	if closeErr := file.Close(); err == nil {
		err = closeErr
	}
	root.Close()
	if err != nil {
		return retained(err)
	}
	if err := commitDocumentReplacementAt(filepath.Join(stageDir, "content"), target, revision, limit, recoveryParent, beforePublish); err != nil {
		return retained(err)
	}
	// The candidate was moved by an existing-file commit, leaving an empty
	// private stage. Remove ONLY that original, still-identical empty directory.
	// No file cleanup is authorized: a concurrently added file, a replaced
	// directory is deliberately kept.
	if current, err := os.Lstat(stageDir); err == nil && current.IsDir() && os.SameFile(stageInfo, current) {
		_ = os.Remove(stageDir) // non-recursive; non-empty stages are retained
	}
	return nil
}
