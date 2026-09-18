//go:build windows

package main

import (
	"crypto/sha256"
	"errors"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func confirmTestUninstaller(t *testing.T, data []byte) {
	t.Helper()
	original := verifiedRiskyWindowsUninstallers
	verifiedRiskyWindowsUninstallers = map[[sha256.Size]byte]string{sha256.Sum256(data): "test fixture only"}
	t.Cleanup(func() { verifiedRiskyWindowsUninstallers = original })
}

func testUninstallRegistration(t *testing.T, active bool) *bool {
	t.Helper()
	originalHas, originalDisable := windowsHasMatchingUninstallRegistration, windowsDisableUninstallRegistrations
	windowsHasMatchingUninstallRegistration = func(string, string) bool { return active }
	windowsDisableUninstallRegistrations = func(string, string) { active = false }
	t.Cleanup(func() {
		windowsHasMatchingUninstallRegistration, windowsDisableUninstallRegistrations = originalHas, originalDisable
	})
	return &active
}

func prepareTestUninstaller(path string) bool {
	return prepareWindowsUninstallerForExecutable(filepath.Join(filepath.Dir(path), windowsUpdateExecutableName))
}

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
	confirmTestUninstaller(t, data) // Safe marker wins even if a digest were listed.
	if !prepareTestUninstaller(path) {
		t.Fatal("safe uninstaller was not recognized")
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
	confirmTestUninstaller(t, []byte("legacy NSIS uninstaller"))
	testUninstallRegistration(t, true)
	path := filepath.Join(t.TempDir(), "uninstall.exe")
	if err := os.WriteFile(path, []byte("legacy NSIS uninstaller"), 0o600); err != nil {
		t.Fatal(err)
	}
	if !prepareTestUninstaller(path) {
		t.Fatal("confirmed legacy uninstaller not handled")
	}
	if _, err := os.Stat(path); !errors.Is(err, os.ErrNotExist) {
		t.Fatalf("legacy uninstaller still exists: %v", err)
	}
}

func TestNeutralizeOwnedRiskyUninstallerRenamesWhenDeleteFails(t *testing.T) {
	confirmTestUninstaller(t, []byte("legacy NSIS uninstaller"))
	testUninstallRegistration(t, true)
	path := filepath.Join(t.TempDir(), "uninstall.exe")
	if err := os.WriteFile(path, []byte("legacy NSIS uninstaller"), 0o600); err != nil {
		t.Fatal(err)
	}
	originalRemove := windowsRemoveUninstaller
	windowsRemoveUninstaller = func(*os.File) error { return errors.New("delete denied") }
	t.Cleanup(func() { windowsRemoveUninstaller = originalRemove })

	if !prepareTestUninstaller(path) {
		t.Fatal("confirmed uninstaller rename fallback failed")
	}
	if _, err := os.Stat(path); !errors.Is(err, os.ErrNotExist) {
		t.Fatalf("legacy uninstaller was not disabled: %v", err)
	}
	files, _ := filepath.Glob(path + ".unsafe-disabled-*")
	if len(files) != 1 {
		t.Fatalf("expected one disabled file, got %v", files)
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
	windowsRemoveUninstaller = func(*os.File) error {
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
	confirmTestUninstaller(t, []byte("legacy NSIS uninstaller"))
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
	windowsRemoveUninstaller = func(*os.File) error { return errors.New("locked") }
	windowsRenameUninstaller = func(*os.File, string) error { return errors.New("locked") }
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
	windowsRemoveUninstaller = func(*os.File) error { t.Fatal("unregistered file reached deletion"); return nil }
	windowsRenameUninstaller = func(*os.File, string) error { t.Fatal("unregistered file reached rename"); return nil }
	for attempt := 0; attempt < 3; attempt++ {
		if !prepareWindowsUninstallerForExecutable(executable) || !isWindowsUninstallerReadyForExecutable(executable) {
			t.Fatal("registry-only remediation must stay update-ready on subsequent checks")
		}
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
