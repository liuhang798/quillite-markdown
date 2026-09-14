//go:build !windows && !darwin

package main

import (
	"errors"
	"golang.org/x/sys/unix"
	"os"
	"syscall"
)

// Fail closed for metadata we cannot safely preserve with a portable rename.
func validateDocumentMetadata(path string) error {
	info, err := os.Stat(path)
	if os.IsNotExist(err) {
		return nil
	}
	if err != nil {
		return err
	}
	if stat, ok := info.Sys().(*syscall.Stat_t); ok && (stat.Nlink > 1 || stat.Uid != uint32(os.Getuid()) || stat.Gid != uint32(os.Getgid())) {
		return errors.New("DOCUMENT_METADATA_REQUIRES_COPY: ownership or hard links require saving a copy")
	}
	if info.Mode()&(os.ModeSetuid|os.ModeSetgid|os.ModeSticky) != 0 {
		return errors.New("DOCUMENT_METADATA_REQUIRES_COPY: special permissions require saving a copy")
	}
	n, err := unix.Listxattr(path, nil)
	if err != nil && !errors.Is(err, unix.ENOTSUP) {
		return err
	}
	if n > 0 {
		return errors.New("DOCUMENT_METADATA_REQUIRES_COPY: extended metadata requires saving a copy")
	}
	return nil
}

func replaceDocumentFile(staged, target string) error { return os.Rename(staged, target) }
