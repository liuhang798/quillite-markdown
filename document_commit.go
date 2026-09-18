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

// The callback is a per-call seam for deterministic external-save regression
// tests, not a global hook and not exposed through the application bridge.
func commitDocumentReplacementWithPublish(staged, target, revision string, publish func(string, string) error) error {
	info, err := os.Lstat(target)
	if os.IsNotExist(err) && revision == "" {
		return publish(staged, target)
	}
	if err != nil || !info.Mode().IsRegular() {
		return errDocumentConflict
	}
	dir, err := os.MkdirTemp(filepath.Dir(target), ".quillite-save-recovery-")
	if err != nil {
		return err
	}
	original := filepath.Join(dir, "original")
	candidate := filepath.Join(dir, "candidate")
	// Probe the required operation using ONLY our staged file, before moving
	// any user file. exFAT and some network volumes cannot create hard links;
	// on those volumes even the POSIX create-only rollback would be unavailable.
	if err = os.Link(staged, candidate); err != nil {
		_ = os.Remove(dir)
		return fmt.Errorf("DOCUMENT_SAFE_SAVE_ACCESS: filesystem cannot stage a protected save; save a new copy: %w", err)
	}
	if err = os.Remove(candidate); err != nil {
		return err
	}
	if err = isolateDocumentOriginal(target, original, revision, info); err != nil {
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
		if err = checkDocumentRevision(original, revision); err != nil {
			return failed(err)
		}
	}
	// Preserve metadata using the existing platform replacement implementation,
	// but ONLY inside this newly-created private directory. The original inode
	// stays reachable, including writes through already-open POSIX descriptors.
	if err = os.Link(original, candidate); err != nil {
		return failed(err)
	}
	if err = replaceDocumentFile(staged, candidate); err != nil {
		return failed(err)
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
