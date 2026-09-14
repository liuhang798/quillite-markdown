//go:build windows

package main

import (
	"fmt"
	"golang.org/x/sys/windows"
	"os"
	"path/filepath"
	"unsafe"
)

var documentReplaceFileW = windows.NewLazySystemDLL("kernel32.dll").NewProc("ReplaceFileW")

func validateDocumentMetadata(path string) error {
	f, err := os.Open(path)
	if os.IsNotExist(err) {
		return nil
	}
	if err != nil {
		return err
	}
	defer f.Close()
	var info windows.ByHandleFileInformation
	if err = windows.GetFileInformationByHandle(windows.Handle(f.Fd()), &info); err != nil {
		return err
	}
	if info.NumberOfLinks > 1 {
		return fmt.Errorf("DOCUMENT_METADATA_REQUIRES_COPY: hard-linked document; save a copy")
	}
	return nil
}

// ReplaceFile preserves the original ACL and alternate data streams. Its backup
// also protects against the documented partial-failure states of ReplaceFileW.
func replaceDocumentFile(staged, target string) error {
	if _, err := os.Lstat(target); os.IsNotExist(err) {
		s, err := windows.UTF16PtrFromString(staged)
		if err != nil {
			return err
		}
		t, err := windows.UTF16PtrFromString(target)
		if err != nil {
			return err
		}
		return windows.MoveFile(s, t) // Create-only: do not overwrite a concurrently created file.
	}
	dir, err := os.MkdirTemp(filepath.Dir(target), ".quillite-save-backup-")
	if err != nil {
		return err
	}
	backup := filepath.Join(dir, "original")
	t, err := windows.UTF16PtrFromString(target)
	if err != nil {
		return err
	}
	s, err := windows.UTF16PtrFromString(staged)
	if err != nil {
		return err
	}
	b, err := windows.UTF16PtrFromString(backup)
	if err != nil {
		return err
	}
	ok, _, callErr := documentReplaceFileW.Call(uintptr(unsafe.Pointer(t)), uintptr(unsafe.Pointer(s)), uintptr(unsafe.Pointer(b)), 0, 0, 0)
	if ok == 0 {
		if _, err := os.Lstat(backup); err == nil {
			// Link is create-only: never overwrite a file recreated by another process.
			if _, err := os.Lstat(target); os.IsNotExist(err) {
				_ = os.Link(backup, target)
			}
			return fmt.Errorf("save replacement failed; original retained at %s: %w", backup, callErr)
		}
		_ = os.Remove(dir)
		return callErr
	}
	_ = os.Remove(backup)
	_ = os.Remove(dir)
	return nil
}
