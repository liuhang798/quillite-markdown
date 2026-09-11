//go:build windows

package main

import (
	"errors"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"strconv"
	"strings"
	"syscall"
	"time"
)

const windowsUpdateExecutableName = "QuilliteMarkdown.exe"

// applyUpdate starts a hidden helper instance of the same executable that
// performs the replacement after this process exits. A batch script cannot be
// used here: cmd.exe is unable to resolve non-ASCII paths (the update folder
// lives under a user profile whose name is Chinese on this machine), so the
// whole flow runs in Go, which passes UTF-16 paths to the Win32 API.
func applyUpdate(downloadPath string) error {
	executable, err := os.Executable()
	if err != nil {
		return err
	}
	logPath := filepath.Join(filepath.Dir(downloadPath), "apply-update.log")
	if err := validateUpdateHelperRequest(downloadPath, executable, strconv.Itoa(os.Getpid()), logPath); err != nil {
		return fmt.Errorf("refuse unsafe update request: %w", err)
	}

	// Windows keeps a running executable locked. Starting helper mode from the
	// installed executable would make the helper hold the exact file it needs
	// to replace. Stage a separate copy in the update directory so the installed
	// executable becomes writable as soon as the main process exits.
	helperPath := filepath.Join(filepath.Dir(downloadPath), "apply-update-helper-"+strconv.Itoa(os.Getpid())+".exe")
	if err := copyExecutable(executable, helperPath); err != nil {
		return fmt.Errorf("stage update helper: %w", err)
	}

	command := exec.Command(helperPath, "--apply-update", downloadPath, executable, strconv.Itoa(os.Getpid()))
	command.SysProcAttr = &syscall.SysProcAttr{HideWindow: true}
	return command.Start()
}

// runUpdateHelperIfRequested handles the "--apply-update" helper mode: it
// waits for the parent process to exit, replaces the old executable with the
// verified new binary, and starts the new version.
func runUpdateHelperIfRequested() {
	if len(os.Args) < 5 || os.Args[1] != "--apply-update" {
		return
	}
	logPath := filepath.Join(filepath.Dir(os.Args[2]), "apply-update.log")
	if err := validateUpdateHelperRequest(os.Args[2], os.Args[3], os.Args[4], logPath); err != nil {
		os.Exit(1)
	}
	err := runUpdateHelper(os.Args[2], os.Args[3], os.Args[4], logPath)
	if err != nil {
		os.Exit(1)
	}
	os.Exit(0)
}

func runUpdateHelper(newBinary, oldExecutable, parentPID, logPath string) error {
	if err := validateUpdateHelperRequest(newBinary, oldExecutable, parentPID, logPath); err != nil {
		return fmt.Errorf("refuse unsafe update request: %w", err)
	}
	writeLog := func(format string, args ...any) {
		file, err := os.OpenFile(logPath, os.O_APPEND|os.O_CREATE|os.O_WRONLY, 0o644)
		if err != nil {
			return
		}
		defer file.Close()
		_, _ = fmt.Fprintf(file, format+"\n", args...)
	}

	writeLog("[apply-update] helper started, waiting for pid %s to exit", parentPID)
	deadline := time.Now().Add(90 * time.Second)
	for time.Now().Before(deadline) {
		if !processAlive(parentPID) {
			break
		}
		time.Sleep(time.Second)
	}
	if processAlive(parentPID) {
		err := fmt.Errorf("timed out waiting for the old process to exit")
		writeLog("[apply-update] ERROR: %v", err)
		return err
	}

	writeLog("[apply-update] replacing %s", oldExecutable)
	backupPath := filepath.Join(filepath.Dir(newBinary), "previous-version.exe")
	if err := copyExecutable(oldExecutable, backupPath); err != nil {
		err = fmt.Errorf("backup current version: %w", err)
		writeLog("[apply-update] ERROR: %v", err)
		return err
	}
	if err := replaceFile(newBinary, oldExecutable); err != nil {
		err = fmt.Errorf("replace failed: %w", err)
		writeLog("[apply-update] ERROR: %v", err)
		return err
	}

	writeLog("[apply-update] starting the new version")
	if err := exec.Command(oldExecutable).Start(); err != nil {
		startErr := err
		if restoreErr := replaceFile(backupPath, oldExecutable); restoreErr != nil {
			err = fmt.Errorf("start failed: %w; restore failed and backup was preserved at %s: %v", startErr, backupPath, restoreErr)
		} else {
			err = fmt.Errorf("start failed and the previous version was restored: %w", startErr)
		}
		writeLog("[apply-update] ERROR: %v", err)
		return err
	}
	writeLog("[apply-update] done")
	return nil
}

func validateUpdateHelperRequest(newBinary, oldExecutable, parentPID, logPath string) error {
	pid, err := strconv.Atoi(strings.TrimSpace(parentPID))
	if err != nil || pid <= 0 {
		return errors.New("invalid parent process ID")
	}
	newBinary, err = filepath.Abs(filepath.Clean(newBinary))
	if err != nil {
		return err
	}
	oldExecutable, err = filepath.Abs(filepath.Clean(oldExecutable))
	if err != nil {
		return err
	}
	logPath, err = filepath.Abs(filepath.Clean(logPath))
	if err != nil {
		return err
	}
	updateDirectory := filepath.Dir(newBinary)
	configDirectory, err := os.UserConfigDir()
	if err != nil {
		return fmt.Errorf("resolve application update directory: %w", err)
	}
	expectedUpdateRoot := filepath.Join(configDirectory, appNameZH, "update")
	if !sameFilesystemPath(filepath.Dir(updateDirectory), expectedUpdateRoot) ||
		!strings.HasPrefix(strings.ToLower(filepath.Base(updateDirectory)), "run-") {
		return errors.New("replacement binary is outside the application update directory")
	}
	if !strings.HasSuffix(strings.ToLower(filepath.Base(newBinary)), "windows-amd64.bin") {
		return errors.New("replacement binary has an unexpected name")
	}
	if !sameFilesystemPath(filepath.Dir(logPath), updateDirectory) || !strings.EqualFold(filepath.Base(logPath), "apply-update.log") {
		return errors.New("update log is outside the application update directory")
	}
	if !strings.EqualFold(filepath.Base(oldExecutable), windowsUpdateExecutableName) {
		return errors.New("update target is not the Quillite executable")
	}
	if !isWindowsUninstallerReadyForExecutable(oldExecutable) {
		return errors.New("update target still has an active risky uninstaller")
	}
	for label, path := range map[string]string{"replacement binary": newBinary, "update target": oldExecutable} {
		info, statErr := os.Stat(path)
		if statErr != nil || info.IsDir() {
			if statErr != nil {
				return fmt.Errorf("%s is unavailable: %w", label, statErr)
			}
			return fmt.Errorf("%s is not a regular file", label)
		}
	}
	return nil
}

func processAlive(pid string) bool {
	output, err := exec.Command("tasklist", "/FI", "PID eq "+pid, "/NH").Output()
	return err == nil && strings.Contains(string(output), pid)
}

func replaceFile(source, target string) error {
	data, err := os.ReadFile(source)
	if err != nil {
		return err
	}
	return writeFileAtomically(target, data)
}

func copyExecutable(source, target string) error {
	data, err := os.ReadFile(source)
	if err != nil {
		return err
	}
	return writeFileAtomically(target, data)
}
