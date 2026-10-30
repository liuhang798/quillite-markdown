//go:build windows

package main

import (
	"os"
	"path/filepath"
	"testing"
)

func TestPortableExecutableDoesNotRequireInstallerRepair(t *testing.T) {
	for _, name := range []string{"quillite-markdown-3.0.2-windows-amd64-portable.exe", "我的阅读器.exe", windowsUpdateExecutableName} {
		t.Run(name, func(t *testing.T) {
			dir := t.TempDir()
			oldHas, oldDisable := windowsHasMatchingUninstallRegistration, windowsDisableUninstallRegistrations
			windowsHasMatchingUninstallRegistration = func(string, string) bool { t.Fatal("standalone check accessed registration"); return false }
			windowsDisableUninstallRegistrations = func(string, string) { t.Fatal("standalone check changed registration") }
			defer func() {
				windowsHasMatchingUninstallRegistration, windowsDisableUninstallRegistrations = oldHas, oldDisable
			}()
			if !prepareWindowsUninstallerForExecutable(filepath.Join(dir, name)) {
				t.Fatal("standalone executable without an uninstaller must not request repair")
			}
		})
	}
}

func TestPortableExecutableNeverRemediatesNeighbouringUnknownUninstaller(t *testing.T) {
	dir := t.TempDir()
	path := filepath.Join(dir, "uninstall.exe")
	data := []byte("unrelated neighbouring file")
	if err := os.WriteFile(path, data, 0600); err != nil {
		t.Fatal(err)
	}
	original := windowsDisableUninstallRegistrations
	windowsDisableUninstallRegistrations = func(string, string) { t.Fatal("changed registry") }
	defer func() { windowsDisableUninstallRegistrations = original }()
	for _, name := range []string{"portable.exe", windowsUpdateExecutableName} {
		if prepareWindowsUninstallerForExecutable(filepath.Join(dir, name)) {
			t.Fatal("unknown file treated as safe")
		}
		got, err := os.ReadFile(path)
		if err != nil || string(got) != string(data) {
			t.Fatal("neighbouring file changed")
		}
	}
}

func TestRenamedExecutableKeepsSafeUninstallerUntouched(t *testing.T) {
	dir := t.TempDir()
	path := filepath.Join(dir, "uninstall.exe")
	data := []byte(windowsSafeUninstallerMarker)
	if err := os.WriteFile(path, data, 0600); err != nil {
		t.Fatal(err)
	}
	if !prepareWindowsUninstallerForExecutable(filepath.Join(dir, "portable.exe")) {
		t.Fatal("safe marker not recognized")
	}
	got, err := os.ReadFile(path)
	if err != nil || string(got) != string(data) {
		t.Fatal("safe uninstaller changed")
	}
}
