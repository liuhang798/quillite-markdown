//go:build !windows

package main

import "os"

// Link publishes atomically only if the destination does not exist. The caller
// removes its private staging name, never an existing public destination.
func publishDocumentFile(staged, target string) error { return os.Link(staged, target) }

func isolateDocumentOriginal(target, backup, revision string, expected os.FileInfo) error {
	// backup is a fresh name inside an unexposed MkdirTemp directory. Validate
	// the displaced inode in the caller and retain it even after a successful
	// save: POSIX locks would not exclude writers that ignore advisory locks.
	return os.Rename(target, backup)
}
