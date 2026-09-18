//go:build windows

package main

import (
	"crypto/rand"
	"encoding/hex"
	"errors"
	"io"
	"os"
	"unsafe"

	"golang.org/x/sys/windows"
)

const maxUninstallerInspectionBytes = 16 * 1024 * 1024

// Deny concurrent writes/deletes for the entire check-and-action interval.
// The final operation targets this handle, never a freshly resolved pathname.
func openLockedUninstaller(path string) (*os.File, []byte, error) {
	p, err := windows.UTF16PtrFromString(path)
	if err != nil {
		return nil, nil, err
	}
	h, err := windows.CreateFile(p, windows.GENERIC_READ|windows.DELETE, windows.FILE_SHARE_READ, nil, windows.OPEN_EXISTING, windows.FILE_FLAG_OPEN_REPARSE_POINT, 0)
	if err != nil {
		// Read-only inspection can still recognize a safe/known file; a handle
		// without DELETE rights cannot be used to delete or rename it.
		h, err = windows.CreateFile(p, windows.GENERIC_READ, windows.FILE_SHARE_READ, nil, windows.OPEN_EXISTING, windows.FILE_FLAG_OPEN_REPARSE_POINT, 0)
	}
	if err != nil {
		return nil, nil, &os.PathError{Op: "open", Path: path, Err: err}
	}
	f := os.NewFile(uintptr(h), path)
	fail := func(err error) (*os.File, []byte, error) { f.Close(); return nil, nil, err }
	var info windows.ByHandleFileInformation
	if err := windows.GetFileInformationByHandle(h, &info); err != nil {
		return fail(err)
	}
	if info.FileAttributes&(windows.FILE_ATTRIBUTE_REPARSE_POINT|windows.FILE_ATTRIBUTE_DIRECTORY) != 0 || info.NumberOfLinks != 1 {
		return fail(errors.New("uninstaller must be a regular, single-link file"))
	}
	size := uint64(info.FileSizeHigh)<<32 | uint64(info.FileSizeLow)
	if size > maxUninstallerInspectionBytes {
		return fail(errors.New("uninstaller exceeds inspection limit"))
	}
	data, err := io.ReadAll(io.LimitReader(f, maxUninstallerInspectionBytes+1))
	if err != nil {
		return fail(err)
	}
	if len(data) > maxUninstallerInspectionBytes {
		return fail(errors.New("uninstaller exceeds inspection limit"))
	}
	return f, data, nil
}

func deleteVerifiedUninstallerHandle(file *os.File) error {
	remove := byte(1)
	return windows.SetFileInformationByHandle(windows.Handle(file.Fd()), windows.FileDispositionInfo, &remove, 1)
}

func disabledUninstallerPath(path string) (string, error) {
	var suffix [16]byte
	if _, err := rand.Read(suffix[:]); err != nil {
		return "", err
	}
	return path + ".unsafe-disabled-" + hex.EncodeToString(suffix[:]), nil
}

func renameVerifiedUninstallerHandle(file *os.File, destination string) error {
	return renameLockedFileHandle(file, destination)
}

// Shared no-replace primitive; callers must verify and lock the source handle.
func renameLockedFileHandle(file *os.File, destination string) error {
	name, err := windows.UTF16FromString(destination)
	if err != nil {
		return err
	}
	// FILE_RENAME_INFO, with ReplaceIfExists=false. A collision must not
	// overwrite an unrelated file, even when the source was hash-confirmed.
	type renameInfo struct {
		Flags  uint32
		Root   windows.Handle
		Length uint32
		Name   [1]uint16
	}
	offset := int(unsafe.Offsetof(renameInfo{}.Name))
	size := offset + len(name)*2
	buffer := make([]byte, size)
	info := (*renameInfo)(unsafe.Pointer(&buffer[0]))
	info.Length = uint32((len(name) - 1) * 2)
	copy(unsafe.Slice((*uint16)(unsafe.Pointer(&buffer[offset])), len(name)), name)
	return windows.SetFileInformationByHandle(windows.Handle(file.Fd()), windows.FileRenameInfo, &buffer[0], uint32(size))
}
