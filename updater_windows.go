//go:build windows

package main

import (
	"crypto/sha256"
	"errors"
	"fmt"
	"io"
	"os"
	"os/exec"
	"path/filepath"
	"strconv"
	"strings"
	"syscall"
	"time"

	"golang.org/x/sys/windows"
)

const (
	windowsUpdateExecutableName    = "QuilliteMarkdown.exe"
	updateCleanupHelperEnvironment = "QUILLITE_CONFIRMED_UPDATE_HELPER"
	updateCleanupBackupEnvironment = "QUILLITE_CONFIRMED_UPDATE_BACKUP"
	windowsSharingViolation        = syscall.Errno(32)
	windowsLockViolation           = syscall.Errno(33)
)

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

	return stageAndStartUpdateHelper(executable, downloadPath, strconv.Itoa(os.Getpid()), startUpdateHelperProcess)
}

type updateHelperLauncher func(helperPath, downloadPath, executable, parentPID string) error

func startUpdateHelperProcess(helperPath, downloadPath, executable, parentPID string) error {
	command := exec.Command(helperPath, "--apply-update", downloadPath, executable, parentPID)
	command.SysProcAttr = &syscall.SysProcAttr{HideWindow: true}
	return command.Start()
}

// stageAndStartUpdateHelper normally runs the detached helper from the private
// update directory. Some Windows application-control policies deny executables
// launched from AppData even though the installed application itself is
// trusted. Only for that precise access-denied case, retry with an exclusive,
// application-owned helper beside the installed executable. No existing file
// is overwritten and all other launch failures remain failures.
func stageAndStartUpdateHelper(executable, downloadPath, parentPID string, launch updateHelperLauncher) error {
	updateHelperPath := filepath.Join(filepath.Dir(downloadPath), "apply-update-helper-"+parentPID+".exe")
	if err := copyExecutable(executable, updateHelperPath); err != nil {
		return fmt.Errorf("stage update helper: %w", err)
	}
	if err := launch(updateHelperPath, downloadPath, executable, parentPID); err == nil {
		return nil
	} else if !errors.Is(err, syscall.ERROR_ACCESS_DENIED) && !os.IsPermission(err) {
		return fmt.Errorf("start update helper: %w", err)
	}

	fallbackName := fmt.Sprintf(".quillite-update-helper-%s-%d.exe", parentPID, time.Now().UnixNano())
	fallbackPath := filepath.Join(filepath.Dir(executable), fallbackName)
	if err := copyExecutableCreateOnly(executable, fallbackPath); err != nil {
		return fmt.Errorf("the update helper was blocked in AppData and could not be staged beside the application: %w", err)
	}
	if err := launch(fallbackPath, downloadPath, executable, parentPID); err != nil {
		// Keep the exclusively named helper on failure. Deleting it by path after
		// the launcher returns would reintroduce a check/delete race if another
		// process replaced the pathname in that narrow interval.
		return fmt.Errorf("start trusted update helper fallback: %w", err)
	}
	return nil
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

func isUpdateHelperFilename(name string) bool {
	name = strings.ToLower(filepath.Base(name))
	return (strings.HasPrefix(name, "apply-update-helper-") || strings.HasPrefix(name, ".quillite-update-helper-")) && strings.HasSuffix(name, ".exe")
}

// cleanupUpdateHelperAfterRestart is the primary cleanup path for both update
// helper locations. It never scans a directory. The exact helper path is
// inherited from the verified helper, constrained to an application-owned
// directory, and must be byte-identical to the previous-version backup before
// this process removes that single file.
func cleanupUpdateHelperAfterRestart() {
	helperPath := os.Getenv(updateCleanupHelperEnvironment)
	backupPath := os.Getenv(updateCleanupBackupEnvironment)
	_ = os.Unsetenv(updateCleanupHelperEnvironment)
	_ = os.Unsetenv(updateCleanupBackupEnvironment)
	if strings.TrimSpace(helperPath) == "" || strings.TrimSpace(backupPath) == "" {
		return
	}
	currentExecutable, err := os.Executable()
	if err != nil {
		return
	}
	go func() {
		deadline := time.Now().Add(30 * time.Second)
		delay := 500 * time.Millisecond
		// The helper only launches the new version immediately before it exits.
		// Waiting once avoids hashing a large executable while it is still locked
		// in the normal successful path.
		time.Sleep(delay)
		for {
			// Revalidate immediately before every retry. If anything replaced or
			// altered the path after the running helper released its file lock,
			// cleanup stops instead of deleting the new occupant.
			err := removeConfirmedUpdateHelper(helperPath, backupPath, currentExecutable)
			if err == nil || errors.Is(err, os.ErrNotExist) {
				return
			}
			if !errors.Is(err, windowsSharingViolation) && !errors.Is(err, windowsLockViolation) && !errors.Is(err, syscall.ERROR_ACCESS_DENIED) {
				return
			}
			if time.Now().After(deadline) {
				return
			}
			time.Sleep(delay)
			if delay < 4*time.Second {
				delay *= 2
			}
		}
	}()
}

// removeConfirmedUpdateHelper deletes the exact file object that was opened,
// hashed and approved. Deleting through the held Windows handle closes the
// check/delete race that would exist if cleanup called os.Remove(path) after
// validation: a different file can never be substituted at that path between
// the identity check and deletion.
func removeConfirmedUpdateHelper(helperPath, backupPath, currentExecutable string) error {
	confirmedPath, confirmedBackupPath, err := validatedUpdateHelperCleanupPaths(helperPath, backupPath, currentExecutable)
	if err != nil {
		return err
	}
	pointer, err := windows.UTF16PtrFromString(confirmedPath)
	if err != nil {
		return err
	}
	handle, err := windows.CreateFile(
		pointer,
		windows.FILE_GENERIC_READ|windows.DELETE,
		windows.FILE_SHARE_READ|windows.FILE_SHARE_WRITE|windows.FILE_SHARE_DELETE,
		nil,
		windows.OPEN_EXISTING,
		windows.FILE_ATTRIBUTE_NORMAL|windows.FILE_FLAG_OPEN_REPARSE_POINT,
		0,
	)
	if err != nil {
		return err
	}
	file := os.NewFile(uintptr(handle), confirmedPath)
	if file == nil {
		_ = windows.CloseHandle(handle)
		return errors.New("open confirmed update helper handle")
	}
	defer file.Close()
	info, err := file.Stat()
	if err != nil {
		return err
	}
	if !info.Mode().IsRegular() {
		return errors.New("cleanup helper handle is not a regular file")
	}
	helperDigest, err := fileSHA256(file)
	if err != nil {
		return err
	}
	backupDigest, err := fileSHA256Path(confirmedBackupPath)
	if err != nil {
		return err
	}
	if helperDigest != backupDigest {
		return errors.New("cleanup helper handle does not match the confirmed previous version")
	}
	deleteFile := byte(1)
	if err := windows.SetFileInformationByHandle(handle, windows.FileDispositionInfo, &deleteFile, 1); err != nil {
		return err
	}
	return file.Close()
}

func confirmedUpdateHelperPath(helperPath, backupPath, currentExecutable string) (string, error) {
	confirmedPath, confirmedBackupPath, err := validatedUpdateHelperCleanupPaths(helperPath, backupPath, currentExecutable)
	if err != nil {
		return "", err
	}
	matching, err := filesHaveSameSHA256(confirmedPath, confirmedBackupPath)
	if err != nil {
		return "", err
	}
	if !matching {
		return "", errors.New("cleanup helper does not match the confirmed previous version")
	}
	return confirmedPath, nil
}

func validatedUpdateHelperCleanupPaths(helperPath, backupPath, currentExecutable string) (string, string, error) {
	var err error
	helperPath, err = filepath.Abs(filepath.Clean(helperPath))
	if err != nil {
		return "", "", err
	}
	backupPath, err = filepath.Abs(filepath.Clean(backupPath))
	if err != nil {
		return "", "", err
	}
	currentExecutable, err = filepath.Abs(filepath.Clean(currentExecutable))
	if err != nil {
		return "", "", err
	}
	if !isUpdateHelperFilename(filepath.Base(helperPath)) {
		return "", "", errors.New("cleanup target is not an update helper")
	}
	if !strings.EqualFold(filepath.Base(backupPath), "previous-version.exe") {
		return "", "", errors.New("cleanup backup has an unexpected name")
	}
	configDirectory, err := os.UserConfigDir()
	if err != nil {
		return "", "", err
	}
	updateRoot := filepath.Join(configDirectory, appNameZH, "update")
	backupDirectory := filepath.Dir(backupPath)
	if !sameFilesystemPath(filepath.Dir(backupDirectory), updateRoot) || !strings.HasPrefix(strings.ToLower(filepath.Base(backupDirectory)), "run-") {
		return "", "", errors.New("cleanup backup is outside the application update directory")
	}
	helperDirectory := filepath.Dir(helperPath)
	if !sameFilesystemPath(helperDirectory, backupDirectory) && !sameFilesystemPath(helperDirectory, filepath.Dir(currentExecutable)) {
		return "", "", errors.New("cleanup helper is outside an application-owned directory")
	}
	if sameFilesystemPath(helperPath, backupPath) || sameFilesystemPath(helperPath, currentExecutable) {
		return "", "", errors.New("cleanup helper aliases a protected executable")
	}
	for label, path := range map[string]string{"cleanup helper": helperPath, "previous-version backup": backupPath} {
		info, statErr := os.Lstat(path)
		if statErr != nil {
			return "", "", fmt.Errorf("%s is unavailable: %w", label, statErr)
		}
		if !info.Mode().IsRegular() {
			return "", "", fmt.Errorf("%s is not a regular file", label)
		}
	}
	return helperPath, backupPath, nil
}

func filesHaveSameSHA256(firstPath, secondPath string) (bool, error) {
	first, err := fileSHA256Path(firstPath)
	if err != nil {
		return false, err
	}
	second, err := fileSHA256Path(secondPath)
	if err != nil {
		return false, err
	}
	return first == second, nil
}

func fileSHA256Path(path string) ([sha256.Size]byte, error) {
	file, err := os.Open(path)
	if err != nil {
		return [sha256.Size]byte{}, err
	}
	defer file.Close()
	return fileSHA256(file)
}

func fileSHA256(file *os.File) ([sha256.Size]byte, error) {
	if _, err := file.Seek(0, io.SeekStart); err != nil {
		return [sha256.Size]byte{}, err
	}
	hash := sha256.New()
	if _, err := io.Copy(hash, file); err != nil {
		return [sha256.Size]byte{}, err
	}
	var result [sha256.Size]byte
	copy(result[:], hash.Sum(nil))
	return result, nil
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
	restart := exec.Command(oldExecutable)
	if helperPath, executableErr := os.Executable(); executableErr == nil && isUpdateHelperFilename(filepath.Base(helperPath)) {
		restart.Env = updateRestartEnvironment(helperPath, backupPath)
	}
	if err := restart.Start(); err != nil {
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

func updateRestartEnvironment(helperPath, backupPath string) []string {
	helperPrefix := strings.ToLower(updateCleanupHelperEnvironment + "=")
	backupPrefix := strings.ToLower(updateCleanupBackupEnvironment + "=")
	environment := make([]string, 0, len(os.Environ())+2)
	for _, entry := range os.Environ() {
		lower := strings.ToLower(entry)
		if strings.HasPrefix(lower, helperPrefix) || strings.HasPrefix(lower, backupPrefix) {
			continue
		}
		environment = append(environment, entry)
	}
	return append(environment,
		updateCleanupHelperEnvironment+"="+helperPath,
		updateCleanupBackupEnvironment+"="+backupPath,
	)
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

func copyExecutableCreateOnly(source, target string) error {
	data, err := os.ReadFile(source)
	if err != nil {
		return err
	}
	file, err := os.OpenFile(target, os.O_CREATE|os.O_EXCL|os.O_WRONLY, 0o700)
	if err != nil {
		return err
	}
	if _, err = file.Write(data); err == nil {
		err = file.Sync()
	}
	if closeErr := file.Close(); err == nil {
		err = closeErr
	}
	// A partial exclusively named file is intentionally retained on write
	// failure. Path-based cleanup after closing the handle could delete a
	// replacement file; a harmless orphan is safer than ambiguous deletion.
	return err
}
