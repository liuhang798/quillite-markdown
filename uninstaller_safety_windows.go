//go:build windows

package main

import (
	"bytes"
	"crypto/sha256"
	"encoding/binary"
	"errors"
	"os"
	"path/filepath"
	"strings"
	"unicode/utf16"

	"golang.org/x/sys/windows/registry"
)

const windowsSafeUninstallerMarker = "QUILLITE_SAFE_UNINSTALL_V1"

const (
	windowsUninstallKey       = `Software\Microsoft\Windows\CurrentVersion\Uninstall\Quillite Open Source轻阅 Markdown`
	windowsLegacyUninstallKey = `Software\Microsoft\Windows\CurrentVersion\Uninstall\LeafMD Open SourceMD阅读助手`
)

var (
	windowsRemoveUninstaller                = deleteVerifiedUninstallerHandle
	windowsRenameUninstaller                = renameVerifiedUninstallerHandle
	windowsHasMatchingUninstallRegistration = hasMatchingWindowsUninstallRegistration
	windowsDisableUninstallRegistrations    = disableMatchingWindowsUninstallRegistrations
)

func isWindowsUninstallerSafe() bool {
	executable, err := os.Executable()
	if err != nil {
		return false
	}
	return isWindowsUninstallerFileSafe(filepath.Join(filepath.Dir(executable), "uninstall.exe"))
}

// Both a verified binary digest and exact registration are required. Neither
// a filename/version nor the absence of the safe marker establishes ownership.
func prepareWindowsUninstallerForUpdate() bool {
	executable, err := os.Executable()
	if err != nil {
		return false
	}
	return prepareWindowsUninstallerForExecutable(executable)
}

func prepareWindowsUninstallerForExecutable(executable string) bool {
	if !strings.EqualFold(filepath.Base(executable), windowsUpdateExecutableName) {
		return false
	}
	installDirectory := filepath.Dir(executable)
	uninstallerPath := filepath.Join(installDirectory, "uninstall.exe")
	file, data, err := openLockedUninstaller(uninstallerPath)
	if errors.Is(err, os.ErrNotExist) {
		return true
	}
	if err != nil {
		return false
	}
	defer file.Close()
	if hasWindowsSafeUninstallerMarker(data) {
		return true
	}
	if !isVerifiedRiskyUninstaller(data) {
		return false
	}
	if !windowsHasMatchingUninstallRegistration(uninstallerPath, installDirectory) {
		// The verified risky binary has no matching Windows uninstall entry,
		// including after registry-only neutralization on a previous run. Match
		// the updater readiness check, but do not mutate an unregistered file.
		return true
	}

	neutralized, _ := neutralizeVerifiedUninstaller(file)
	if neutralized {
		windowsDisableUninstallRegistrations(uninstallerPath, installDirectory)
		return true
	}
	// A locked or permission-protected legacy file may not be removable or
	// renameable. Removing only its exact matching uninstall registration keeps
	// Windows Settings from launching it while leaving every other file intact.
	windowsDisableUninstallRegistrations(uninstallerPath, installDirectory)
	return !windowsHasMatchingUninstallRegistration(uninstallerPath, installDirectory)
}

// Only called with the still-open, hash-verified, write/delete-share-denying handle.
func neutralizeVerifiedUninstaller(file *os.File) (bool, string) {
	if err := windowsRemoveUninstaller(file); err == nil {
		return true, "deleted"
	}
	disabledPath, err := disabledUninstallerPath(file.Name())
	if err == nil && windowsRenameUninstaller(file, disabledPath) == nil {
		return true, disabledPath
	}
	return false, ""
}

func registeredUninstallerExecutable(command string) string {
	command = strings.TrimSpace(command)
	if command == "" {
		return ""
	}
	if strings.HasPrefix(command, `"`) {
		if end := strings.Index(command[1:], `"`); end >= 0 {
			return filepath.Clean(command[1 : end+1])
		}
	}
	lower := strings.ToLower(command)
	if end := strings.Index(lower, ".exe"); end >= 0 {
		return filepath.Clean(strings.TrimSpace(command[:end+4]))
	}
	return ""
}

type windowsUninstallRegistration struct {
	root registry.Key
	path string
	view uint32
}

func windowsUninstallRegistrations() []windowsUninstallRegistration {
	registrations := make([]windowsUninstallRegistration, 0, 8)
	for _, root := range []registry.Key{registry.CURRENT_USER, registry.LOCAL_MACHINE} {
		for _, path := range []string{windowsUninstallKey, windowsLegacyUninstallKey} {
			for _, view := range []uint32{registry.WOW64_64KEY, registry.WOW64_32KEY} {
				registrations = append(registrations, windowsUninstallRegistration{root: root, path: path, view: view})
			}
		}
	}
	return registrations
}

func registrationMatches(registration windowsUninstallRegistration, uninstallerPath, installDirectory string) bool {
	key, err := registry.OpenKey(registration.root, registration.path, registry.QUERY_VALUE|registration.view)
	if err != nil {
		return false
	}
	defer key.Close()
	command, _, _ := key.GetStringValue("UninstallString")
	quietCommand, _, _ := key.GetStringValue("QuietUninstallString")
	registeredDirectory, _, _ := key.GetStringValue("InstallLocation")
	commandMatches := sameFilesystemPath(registeredUninstallerExecutable(command), uninstallerPath) ||
		sameFilesystemPath(registeredUninstallerExecutable(quietCommand), uninstallerPath)
	if !commandMatches {
		return false
	}
	return strings.TrimSpace(registeredDirectory) == "" || sameFilesystemPath(registeredDirectory, installDirectory)
}

func hasMatchingWindowsUninstallRegistration(uninstallerPath, installDirectory string) bool {
	for _, registration := range windowsUninstallRegistrations() {
		if registrationMatches(registration, uninstallerPath, installDirectory) {
			return true
		}
	}
	return false
}

func disableMatchingWindowsUninstallRegistrations(uninstallerPath, installDirectory string) {
	for _, registration := range windowsUninstallRegistrations() {
		if registrationMatches(registration, uninstallerPath, installDirectory) {
			_ = deleteWindowsRegistryKeyInView(registration)
		}
	}
}

func deleteWindowsRegistryKeyInView(registration windowsUninstallRegistration) error {
	parentPath, keyName := filepath.Split(registration.path)
	parentPath = strings.TrimRight(parentPath, `\/`)
	if parentPath == "" || keyName == "" {
		return errors.New("invalid uninstall registry path")
	}
	parent, err := registry.OpenKey(registration.root, parentPath, registry.WRITE|registration.view)
	if err != nil {
		return err
	}
	defer parent.Close()
	return registry.DeleteKey(parent, keyName)
}

func isWindowsUninstallerReadyForExecutable(executable string) bool {
	if !strings.EqualFold(filepath.Base(executable), windowsUpdateExecutableName) {
		return false
	}
	installDirectory := filepath.Dir(executable)
	uninstallerPath := filepath.Join(installDirectory, "uninstall.exe")
	file, data, err := openLockedUninstaller(uninstallerPath)
	if errors.Is(err, os.ErrNotExist) {
		return true
	}
	if err != nil {
		return false
	}
	defer file.Close()
	if hasWindowsSafeUninstallerMarker(data) {
		return true
	}
	return isVerifiedRiskyUninstaller(data) && !windowsHasMatchingUninstallRegistration(uninstallerPath, installDirectory)
}

func isWindowsUninstallerFileSafe(path string) bool {
	file, data, err := openLockedUninstaller(path)
	if err != nil {
		return false
	}
	defer file.Close()
	return hasWindowsSafeUninstallerMarker(data)
}

func isVerifiedRiskyUninstaller(data []byte) bool {
	_, confirmed := verifiedRiskyWindowsUninstallers[sha256.Sum256(data)]
	return confirmed && !hasWindowsSafeUninstallerMarker(data)
}

func hasWindowsSafeUninstallerMarker(data []byte) bool {
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
