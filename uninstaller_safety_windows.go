//go:build windows

package main

import (
	"bytes"
	"encoding/binary"
	"os"
	"path/filepath"
	"unicode/utf16"
)

const windowsSafeUninstallerMarker = "QUILLITE_SAFE_UNINSTALL_V1"

func isWindowsUninstallerSafe() bool {
	executable, err := os.Executable()
	if err != nil {
		return false
	}
	return isWindowsUninstallerFileSafe(filepath.Join(filepath.Dir(executable), "uninstall.exe"))
}

func isWindowsUninstallerFileSafe(path string) bool {
	data, err := os.ReadFile(path)
	if err != nil {
		return false
	}
	// NSIS stores version-resource strings as UTF-16LE. Accept ASCII as well so
	// the check remains valid if a future installer toolchain changes encoding.
	return bytes.Contains(data, []byte(windowsSafeUninstallerMarker)) ||
		bytes.Contains(data, utf16LEBytes(windowsSafeUninstallerMarker))
}

func utf16LEBytes(value string) []byte {
	encoded := utf16.Encode([]rune(value))
	result := make([]byte, len(encoded)*2)
	for index, item := range encoded {
		binary.LittleEndian.PutUint16(result[index*2:], item)
	}
	return result
}
