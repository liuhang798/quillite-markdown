//go:build darwin

package main

import (
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
)

const macUpdateBundleIdentifier = "com.liuhang.quillite-markdown"

// applyUpdate stages and atomically replaces the complete signed .app bundle.
// A macOS code signature seals both the executable and the enclosing bundle;
// replacing only Contents/MacOS/QuilliteMarkdown invalidates that seal and dyld
// terminates the next launch with CODESIGNING / Invalid Page.
func applyUpdate(downloadPath string) error {
	if !strings.EqualFold(filepath.Ext(downloadPath), ".zip") {
		return fmt.Errorf("unsafe macOS update format %q: a complete signed .app archive is required", filepath.Ext(downloadPath))
	}

	executable, err := os.Executable()
	if err != nil {
		return err
	}
	executable, err = filepath.EvalSymlinks(executable)
	if err != nil {
		return err
	}
	appBundle := filepath.Dir(filepath.Dir(filepath.Dir(executable)))
	if !strings.EqualFold(filepath.Ext(appBundle), ".app") {
		return fmt.Errorf("the running executable is not inside a macOS application bundle: %s", executable)
	}
	if err := validateMacAppBundle(appBundle); err != nil {
		return fmt.Errorf("refuse to replace an unverified current application: %w", err)
	}

	updateDir := filepath.Dir(downloadPath)
	extractDir, err := os.MkdirTemp(updateDir, "extracted-app-")
	if err != nil {
		return err
	}
	cleanupExtract := true
	defer func() {
		if cleanupExtract {
			_ = os.RemoveAll(extractDir)
		}
	}()
	if output, err := exec.Command("/usr/bin/ditto", "-x", "-k", downloadPath, extractDir).CombinedOutput(); err != nil {
		return fmt.Errorf("extract macOS update: %w: %s", err, strings.TrimSpace(string(output)))
	}

	newBundle, err := findExtractedMacApp(extractDir)
	if err != nil {
		return err
	}
	if err := validateMacAppBundle(newBundle); err != nil {
		return fmt.Errorf("validate downloaded macOS application: %w", err)
	}

	// Stage the complete verified bundle beside the installed application while
	// the current process is still alive. The detached script then needs only
	// two same-volume renames after exit, keeping replacement fast and allowing
	// an immediate rollback if relaunching fails.
	stageRoot, err := os.MkdirTemp(filepath.Dir(appBundle), ".quillite-update-")
	if err != nil {
		return err
	}
	cleanupStage := true
	defer func() {
		if cleanupStage {
			_ = os.RemoveAll(stageRoot)
		}
	}()
	stagedBundle := filepath.Join(stageRoot, "staged.app")
	backupBundle := filepath.Join(stageRoot, "backup.app")
	failedBundle := filepath.Join(stageRoot, "failed.app")
	if output, err := exec.Command("/usr/bin/ditto", newBundle, stagedBundle).CombinedOutput(); err != nil {
		return fmt.Errorf("stage macOS update beside the installed application: %w: %s", err, strings.TrimSpace(string(output)))
	}
	if err := validateMacAppBundle(stagedBundle); err != nil {
		return fmt.Errorf("validate staged macOS application: %w", err)
	}

	logPath := filepath.Join(updateDir, "apply-update.log")
	scriptPath := filepath.Join(updateDir, "apply-update.sh")
	script := fmt.Sprintf(`#!/bin/sh
exec >>%s 2>&1
set -u
current=%s
staged=%s
backup=%s
failed=%s
stage_root=%s
archive=%s
extract_dir=%s
script_path=%s

while kill -0 %d 2>/dev/null; do sleep 0.3; done
if ! mv "$current" "$backup"; then
  echo "Unable to move the current application to its update backup."
  exit 1
fi
if ! mv "$staged" "$current"; then
  echo "Unable to install the staged application; restoring the previous version."
  if ! mv "$backup" "$current"; then
    echo "Unable to restore the previous version; preserving the backup at $backup."
    exit 1
  fi
  rm -rf -- "$extract_dir"
  rmdir "$stage_root" 2>/dev/null || true
  exit 1
fi
if ! /usr/bin/codesign --verify --deep --strict "$current"; then
  echo "Installed application signature verification failed; restoring the previous version."
  mv "$current" "$failed" || exit 1
  if ! mv "$backup" "$current"; then
    echo "Unable to restore the previous version; preserving update recovery files."
    exit 1
  fi
  rm -rf -- "$extract_dir"
  rmdir "$stage_root" 2>/dev/null || true
  exit 1
fi
if ! /usr/bin/open "$current"; then
  echo "Unable to relaunch the updated application; restoring the previous version."
  mv "$current" "$failed" || exit 1
  if ! mv "$backup" "$current"; then
    echo "Unable to restore the previous version; preserving update recovery files."
    exit 1
  fi
  /usr/bin/open "$current" || true
  rm -rf -- "$extract_dir"
  rmdir "$stage_root" 2>/dev/null || true
  exit 1
fi
echo "Previous application preserved for recovery at $backup"
rm -rf -- "$extract_dir"
rmdir "$stage_root" 2>/dev/null || true
rm -f "$archive" "$script_path"
`, shellQuote(logPath), shellQuote(appBundle), shellQuote(stagedBundle), shellQuote(backupBundle), shellQuote(failedBundle), shellQuote(stageRoot), shellQuote(downloadPath), shellQuote(extractDir), shellQuote(scriptPath), os.Getpid())
	if err := os.WriteFile(scriptPath, []byte(script), 0o755); err != nil {
		return err
	}
	if err := exec.Command("/bin/sh", scriptPath).Start(); err != nil {
		return err
	}
	cleanupExtract = false
	cleanupStage = false
	return nil
}

func findExtractedMacApp(root string) (string, error) {
	entries, err := os.ReadDir(root)
	if err != nil {
		return "", err
	}
	var appPath string
	for _, entry := range entries {
		if !entry.IsDir() || !strings.EqualFold(filepath.Ext(entry.Name()), ".app") {
			continue
		}
		if appPath != "" {
			return "", macUpdateError("the update archive contains more than one application bundle")
		}
		appPath = filepath.Join(root, entry.Name())
	}
	if appPath == "" {
		return "", macUpdateError("the update archive does not contain an application bundle")
	}
	return appPath, nil
}

func validateMacAppBundle(appPath string) error {
	infoPlist := filepath.Join(appPath, "Contents", "Info.plist")
	if _, err := os.Stat(infoPlist); err != nil {
		return fmt.Errorf("missing Info.plist: %w", err)
	}
	identifierOutput, err := exec.Command("/usr/libexec/PlistBuddy", "-c", "Print :CFBundleIdentifier", infoPlist).CombinedOutput()
	if err != nil {
		return fmt.Errorf("read bundle identifier: %w: %s", err, strings.TrimSpace(string(identifierOutput)))
	}
	identifier := strings.TrimSpace(string(identifierOutput))
	if identifier != macUpdateBundleIdentifier {
		return fmt.Errorf("unexpected bundle identifier %q", identifier)
	}
	if output, err := exec.Command("/usr/bin/codesign", "--verify", "--deep", "--strict", appPath).CombinedOutput(); err != nil {
		return fmt.Errorf("invalid application code signature: %w: %s", err, strings.TrimSpace(string(output)))
	}
	return nil
}

func shellQuote(value string) string {
	return "'" + strings.ReplaceAll(value, "'", "'\\''") + "'"
}

func macUpdateError(message string) error {
	return fmt.Errorf("invalid macOS update: %s", message)
}

// runUpdateHelperIfRequested is a no-op on darwin: the detached shell script
// performs the atomic bundle replacement after the application exits.
func runUpdateHelperIfRequested() {}

func cleanupUpdateHelperAfterRestart() {}
