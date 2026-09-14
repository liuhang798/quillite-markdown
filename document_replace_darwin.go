//go:build darwin && cgo

package main

/*
#include <copyfile.h>
#include <stdlib.h>
*/
import "C"

import (
	"errors"
	"os"
	"syscall"
	"time"
	"unsafe"
)

func validateDocumentMetadata(path string) error {
	info, err := os.Stat(path)
	if os.IsNotExist(err) {
		return nil
	}
	if err != nil {
		return err
	}
	if stat, ok := info.Sys().(*syscall.Stat_t); ok && (stat.Nlink > 1 || stat.Uid != uint32(os.Getuid())) {
		return errors.New("DOCUMENT_METADATA_REQUIRES_COPY: ownership or hard links require saving a copy")
	}
	return nil
}

func replaceDocumentFile(staged, target string) error {
	if _, err := os.Stat(target); err == nil {
		src, dst := C.CString(target), C.CString(staged)
		defer C.free(unsafe.Pointer(src))
		defer C.free(unsafe.Pointer(dst))
		// Copy only metadata, never the old data or any directory tree.
		result, err := C.copyfile(src, dst, nil, C.COPYFILE_METADATA|C.COPYFILE_NOFOLLOW)
		if result != 0 {
			return err
		}
		// COPYFILE_STAT includes the old modification time; a save must still
		// advertise fresh content to external file watchers and recent lists.
		now := time.Now()
		if err := os.Chtimes(staged, now, now); err != nil {
			return err
		}
	}
	return os.Rename(staged, target)
}
