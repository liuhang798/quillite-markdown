//go:build windows

package main

import (
	"errors"
	"os"
	"path/filepath"
	"strings"
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

func TestNeutralizeOwnedRiskyUninstallerPreservesSafeVersion(t *testing.T) {
	path := filepath.Join(t.TempDir(), "uninstall.exe")
	data := append([]byte("mock PE resource\x00"), utf16LEBytes(windowsSafeUninstallerMarker)...)
	if err := os.WriteFile(path, data, 0o600); err != nil {
		t.Fatal(err)
	}
	neutralized, action := neutralizeOwnedRiskyUninstallerFile(path)
	if !neutralized || action != "safe" {
		t.Fatalf("safe uninstaller result = %v, %q", neutralized, action)
	}
	got, err := os.ReadFile(path)
	if err != nil {
		t.Fatalf("safe uninstaller was removed: %v", err)
	}
	if string(got) != string(data) {
		t.Fatal("safe uninstaller was modified")
	}
}

func TestNeutralizeOwnedRiskyUninstallerDeletesExactFile(t *testing.T) {
	path := filepath.Join(t.TempDir(), "uninstall.exe")
	if err := os.WriteFile(path, []byte("legacy NSIS uninstaller"), 0o600); err != nil {
		t.Fatal(err)
	}
	neutralized, action := neutralizeOwnedRiskyUninstallerFile(path)
	if !neutralized || action != "deleted" {
		t.Fatalf("legacy uninstaller result = %v, %q", neutralized, action)
	}
	if _, err := os.Stat(path); !errors.Is(err, os.ErrNotExist) {
		t.Fatalf("legacy uninstaller still exists: %v", err)
	}
}

func TestNeutralizeOwnedRiskyUninstallerRenamesWhenDeleteFails(t *testing.T) {
	path := filepath.Join(t.TempDir(), "uninstall.exe")
	if err := os.WriteFile(path, []byte("legacy NSIS uninstaller"), 0o600); err != nil {
		t.Fatal(err)
	}
	originalRemove := windowsRemoveUninstaller
	windowsRemoveUninstaller = func(string) error { return errors.New("locked") }
	t.Cleanup(func() { windowsRemoveUninstaller = originalRemove })

	neutralized, action := neutralizeOwnedRiskyUninstallerFile(path)
	if !neutralized || action == "" || action == "safe" || action == "deleted" {
		t.Fatalf("legacy uninstaller fallback result = %v, %q", neutralized, action)
	}
	if _, err := os.Stat(path); !errors.Is(err, os.ErrNotExist) {
		t.Fatalf("legacy uninstaller was not disabled: %v", err)
	}
	if _, err := os.Stat(action); err != nil {
		t.Fatalf("disabled uninstaller is missing: %v", err)
	}
}

func TestPrepareWindowsUninstallerPreservesUnownedSameNameFile(t *testing.T) {
	directory := t.TempDir()
	executable := filepath.Join(directory, windowsUpdateExecutableName)
	uninstaller := filepath.Join(directory, "uninstall.exe")
	if err := os.WriteFile(uninstaller, []byte("unknown unmarked file"), 0o600); err != nil {
		t.Fatal(err)
	}
	originalHasRegistration := windowsHasMatchingUninstallRegistration
	originalRemove := windowsRemoveUninstaller
	removeCalled := false
	windowsHasMatchingUninstallRegistration = func(string, string) bool { return false }
	windowsRemoveUninstaller = func(string) error {
		removeCalled = true
		return nil
	}
	t.Cleanup(func() {
		windowsHasMatchingUninstallRegistration = originalHasRegistration
		windowsRemoveUninstaller = originalRemove
	})

	if prepareWindowsUninstallerForExecutable(executable) {
		t.Fatal("an unowned same-name file must not be treated as remediated")
	}
	if removeCalled {
		t.Fatal("an unowned same-name file must never reach deletion")
	}
	if _, err := os.Stat(uninstaller); err != nil {
		t.Fatalf("an unowned same-name file was changed: %v", err)
	}
}

func TestPrepareWindowsUninstallerDisablesRegistrationAfterFileOperationsFail(t *testing.T) {
	directory := t.TempDir()
	executable := filepath.Join(directory, windowsUpdateExecutableName)
	uninstaller := filepath.Join(directory, "uninstall.exe")
	if err := os.WriteFile(uninstaller, []byte("legacy NSIS uninstaller"), 0o600); err != nil {
		t.Fatal(err)
	}
	originalHasRegistration := windowsHasMatchingUninstallRegistration
	originalDisable := windowsDisableUninstallRegistrations
	originalRemove := windowsRemoveUninstaller
	originalRename := windowsRenameUninstaller
	registrationActive := true
	windowsHasMatchingUninstallRegistration = func(string, string) bool { return registrationActive }
	windowsDisableUninstallRegistrations = func(string, string) { registrationActive = false }
	windowsRemoveUninstaller = func(string) error { return errors.New("locked") }
	windowsRenameUninstaller = func(string, string) error { return errors.New("locked") }
	t.Cleanup(func() {
		windowsHasMatchingUninstallRegistration = originalHasRegistration
		windowsDisableUninstallRegistrations = originalDisable
		windowsRemoveUninstaller = originalRemove
		windowsRenameUninstaller = originalRename
	})

	if !prepareWindowsUninstallerForExecutable(executable) {
		t.Fatal("removing the exact uninstall registration must disable a locked risky uninstaller")
	}
	if registrationActive {
		t.Fatal("the exact risky uninstall registration was not disabled")
	}
	if _, err := os.Stat(uninstaller); err != nil {
		t.Fatalf("failed file operations must leave the file intact: %v", err)
	}
}

func TestRegisteredUninstallerExecutable(t *testing.T) {
	tests := map[string]string{
		`"D:\Apps\Quillite Markdown\uninstall.exe" /S`: `D:\Apps\Quillite Markdown\uninstall.exe`,
		`D:\Quillite\uninstall.exe /S`:                 `D:\Quillite\uninstall.exe`,
		`rundll32.exe shell32.dll`:                     `rundll32.exe`,
		``:                                             ``,
	}
	for command, want := range tests {
		if got := registeredUninstallerExecutable(command); got != want {
			t.Errorf("registeredUninstallerExecutable(%q) = %q, want %q", command, got, want)
		}
	}
}

func TestApplicationStartupAlwaysRunsWindowsUninstallerSafetyGuard(t *testing.T) {
	data, err := os.ReadFile("app.go")
	if err != nil {
		t.Fatal(err)
	}
	source := string(data)
	startupIndex := strings.Index(source, "func (a *App) startup(ctx context.Context)")
	guardIndex := strings.Index(source, "_ = prepareWindowsUninstallerForUpdate()")
	contextIndex := strings.Index(source, "a.ctx = ctx")
	if startupIndex < 0 || guardIndex < startupIndex || contextIndex < guardIndex {
		t.Fatal("Windows uninstaller safety guard must run first on every application startup")
	}
}
