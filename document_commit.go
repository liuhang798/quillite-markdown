package main

import (
	"fmt"
	"os"
	"path/filepath"
	"runtime"
)

func commitDocumentReplacement(staged, target, revision string) error {
	return commitDocumentReplacementWithPublish(staged, target, revision, publishDocumentFile)
}

// Bundle callers choose a bounded archive revision limit and a verified,
// same-volume recovery parent outside a TextBundle directory. The callback is
// private backend policy, never supplied through the frontend bridge.
func commitDocumentReplacementAt(staged, target, revision string, revisionLimit int64, recoveryParent string, beforePublish func() error) error {
	// Unlike the ordinary document writer, package callers stage their own
	// bytes. Keep the same metadata fail-closed rule at this new entry point.
	if err := validateDocumentMetadata(target); err != nil {
		return err
	}
	return commitDocumentReplacementWithOperationsAt(staged, target, revision, revisionLimit, recoveryParent, beforePublish, publishDocumentFile, prepareDocumentCandidate)
}

// The callback is a per-call seam for deterministic external-save regression
// tests, not a global hook and not exposed through the application bridge.
func commitDocumentReplacementWithPublish(staged, target, revision string, publish func(string, string) error) error {
	return commitDocumentReplacementWithOperations(staged, target, revision, publish, prepareDocumentCandidate)
}

func commitDocumentReplacementWithOperations(staged, target, revision string, publish, prepare func(string, string) error) error {
	return commitDocumentReplacementWithOperationsAt(staged, target, revision, maxSupportedDocumentBytes, "", nil, publish, prepare)
}

func commitDocumentReplacementWithOperationsAt(staged, target, revision string, revisionLimit int64, recoveryParent string, beforePublish func() error, publish, prepare func(string, string) error) error {
	if !validDocumentRevisionLimit(revisionLimit) {
		return errDocumentConflict
	}
	if recoveryParent == "" {
		recoveryParent = filepath.Dir(target)
	} else {
		// This parameter is internal, but fail closed on missing/non-directory
		// and linked final roots instead of following an unexpected redirection.
		if !filepath.IsAbs(recoveryParent) {
			return fmt.Errorf("DOCUMENT_SAFE_SAVE_ACCESS: recovery parent must be absolute")
		}
		recoveryParent = filepath.Clean(recoveryParent)
		parent, err := os.Lstat(recoveryParent)
		if err != nil || !parent.IsDir() || parent.Mode()&os.ModeSymlink != 0 {
			return fmt.Errorf("DOCUMENT_SAFE_SAVE_ACCESS: recovery parent is unavailable or unsafe")
		}
	}
	info, err := os.Lstat(target)
	if os.IsNotExist(err) && revision == "" {
		if beforePublish != nil {
			if err := beforePublish(); err != nil {
				return err
			}
		}
		return publish(staged, target)
	}
	if err != nil || !info.Mode().IsRegular() {
		return errDocumentConflict
	}
	dir, err := os.MkdirTemp(recoveryParent, ".quillite-save-recovery-")
	if err != nil {
		return err
	}
	original := filepath.Join(dir, "original")
	candidate := filepath.Join(dir, "candidate")
	// Probe using ONLY our staged file before moving any user file. Windows
	// uses a native copy; POSIX requires hard links for create-only rollback.
	if err = prepare(staged, candidate); err != nil {
		_ = os.Remove(dir)
		return fmt.Errorf("DOCUMENT_SAFE_SAVE_ACCESS: filesystem cannot stage a protected save; save a new copy: %w", err)
	}
	if err = os.Remove(candidate); err != nil {
		return err
	}
	if err = isolateDocumentOriginal(target, original, revision, info, revisionLimit); err != nil {
		// Non-recursive: never remove a recovery directory containing any file.
		_ = os.Remove(dir)
		return err
	}
	failed := func(cause error) error {
		// Another writer may have filled the public pathname. Never overwrite it
		// to roll back; keep the isolated original and any prepared candidate.
		old, oldErr := os.Stat(original)
		copy, copyErr := os.Stat(candidate)
		if oldErr == nil && copyErr == nil && os.SameFile(old, copy) {
			_ = os.Remove(candidate)
		}
		if publishDocumentFile(original, target) == nil {
			// Restoring creates a second link. Remove only our private aliases,
			// otherwise metadata validation would reject every subsequent save.
			_ = os.Remove(original)
			_ = os.Remove(dir) // non-empty (prepared new content) is retained
			return fmt.Errorf("%w; original restored; any prepared recovery file remains in %s", cause, dir)
		}
		return fmt.Errorf("%w; recovery retained at %s", cause, original)
	}
	// Revalidate the file actually moved, not a name checked before the move.
	actual, err := os.Lstat(original)
	if err != nil || !actual.Mode().IsRegular() || !os.SameFile(info, actual) {
		return failed(errDocumentConflict)
	}
	if revision != "" {
		if err = checkDocumentRevisionWithLimit(original, revision, revisionLimit); err != nil {
			return failed(err)
		}
	}
	// Preserve metadata using the existing platform replacement implementation,
	// but ONLY inside this newly-created private directory. The original inode
	// stays reachable, including writes through already-open POSIX descriptors.
	if err = prepare(original, candidate); err != nil {
		return failed(err)
	}
	if err = replaceDocumentFile(staged, candidate); err != nil {
		return failed(err)
	}
	if beforePublish != nil {
		if err = beforePublish(); err != nil {
			return failed(err)
		}
	}
	if err = publish(candidate, target); err != nil {
		return failed(fmt.Errorf("%w: %v", errDocumentConflict, err))
	}
	// candidate is our generated file, never a user-supplied cleanup pathname.
	_ = os.Remove(candidate)
	if runtime.GOOS == "windows" {
		// Windows isolation held a deny-write/delete handle until the original
		// moved to the private directory: no pre-existing writable handles exist.
		_ = os.Remove(original)
		_ = os.Remove(dir)
	}
	// POSIX advisory locks cannot exclude other editors. Retain the original
	// inode on success too; do not silently delete potential late fd writes.
	return nil
}
