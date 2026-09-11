//go:build windows

package main

import (
	"os"
	"path/filepath"
	"testing"
)

func TestWindowsUninstallerSafetyMarker(t *testing.T) {
	directory := t.TempDir()
	path := filepath.Join(directory, "uninstall.exe")
	if isWindowsUninstallerFileSafe(path) {
		t.Fatal("a missing uninstaller must require a full installation")
	}
	if err := os.WriteFile(path, []byte("legacy NSIS uninstaller"), 0o600); err != nil {
		t.Fatal(err)
	}
	if isWindowsUninstallerFileSafe(path) {
		t.Fatal("an unmarked legacy uninstaller must require a full installation")
	}
	data := append([]byte("mock PE resource\x00"), utf16LEBytes(windowsSafeUninstallerMarker)...)
	if err := os.WriteFile(path, data, 0o600); err != nil {
		t.Fatal(err)
	}
	if !isWindowsUninstallerFileSafe(path) {
		t.Fatal("the safety-marked uninstaller must allow in-app updates")
	}
}
