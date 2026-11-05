//go:build windows

package main

import (
	"os"

	"golang.org/x/sys/windows"
)

// MoveFile is create-only and also restores originals on volumes without
// hardlink support. Do not substitute MoveFileEx with REPLACE_EXISTING.
func publishDocumentFile(staged, target string) error {
	s, err := windows.UTF16PtrFromString(staged)
	if err != nil {
		return err
	}
	t, err := windows.UTF16PtrFromString(target)
	if err != nil {
		return err
	}
	return windows.MoveFile(s, t)
}

func isolateDocumentOriginal(target, backup, revision string, expected os.FileInfo, limits ...int64) error {
	limit := int64(maxSupportedDocumentBytes)
	if len(limits) > 1 {
		return errDocumentConflict
	}
	if len(limits) == 1 {
		limit = limits[0]
	}
	if !validDocumentRevisionLimit(limit) {
		return errDocumentConflict
	}
	p, err := windows.UTF16PtrFromString(target)
	if err != nil {
		return err
	}
	h, err := windows.CreateFile(p, windows.GENERIC_READ|windows.DELETE, windows.FILE_SHARE_READ,
		nil, windows.OPEN_EXISTING, windows.FILE_FLAG_OPEN_REPARSE_POINT, 0)
	if err != nil {
		return errDocumentConflict
	} // A writer is active: fail closed.
	f := os.NewFile(uintptr(h), target)
	defer f.Close()
	var metadata windows.ByHandleFileInformation
	if err = windows.GetFileInformationByHandle(h, &metadata); err != nil {
		return err
	}
	if metadata.FileAttributes&(windows.FILE_ATTRIBUTE_REPARSE_POINT|windows.FILE_ATTRIBUTE_DIRECTORY) != 0 || metadata.NumberOfLinks != 1 {
		return errDocumentConflict
	}
	actual, err := f.Stat()
	if err != nil || !os.SameFile(expected, actual) {
		return errDocumentConflict
	}
	if revision != "" {
		if err := checkDocumentRevisionReaderWithLimit(f, revision, limit); err != nil {
			return errDocumentConflict
		}
	}
	// Rename exactly the verified object while writers/deleters remain excluded.
	// FILE_RENAME_INFO.ReplaceIfExists is false, never an overwriting rename.
	return renameLockedFileHandle(f, backup)
}
