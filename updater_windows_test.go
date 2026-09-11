//go:build windows

package main

import (
	"os"
	"os/exec"
	"path/filepath"
	"strconv"
	"strings"
	"testing"
	"time"
)

func TestMain(m *testing.M) {
	if len(os.Args) >= 3 && os.Args[1] == "--test-start-update" {
		if err := applyUpdate(os.Args[2]); err != nil {
			os.Exit(2)
		}
		os.Exit(0)
	}
	runUpdateHelperIfRequested()
	os.Exit(m.Run())
}

func TestReplaceFileWithChinesePaths(t *testing.T) {
	dir := t.TempDir()
	source := filepath.Join(dir, "新版本-测试.bin")
	target := filepath.Join(dir, "旧应用-测试.exe")
	if err := os.WriteFile(source, []byte("PAYLOAD-42"), 0o644); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(target, []byte("OLD"), 0o644); err != nil {
		t.Fatal(err)
	}
	if err := replaceFile(source, target); err != nil {
		t.Fatalf("replaceFile: %v", err)
	}
	data, err := os.ReadFile(target)
	if err != nil {
		t.Fatal(err)
	}
	if string(data) != "PAYLOAD-42" {
		t.Fatalf("target content = %q, want PAYLOAD-42", data)
	}
}

func TestProcessAlive(t *testing.T) {
	if !processAlive(strconv.Itoa(os.Getpid())) {
		t.Fatal("the current test process must be reported as alive")
	}
	if processAlive("99999999") {
		t.Fatal("a non-existent PID must not be reported as alive")
	}
}

// TestRunUpdateHelperEndToEnd compiles a tiny helper binary, runs it as the
// "old process", then runs the updater helper against it and verifies the
// replacement and the automatic restart of the new binary.
func TestRunUpdateHelperEndToEnd(t *testing.T) {
	dir := t.TempDir()
	configDir := filepath.Join(dir, "config")
	t.Setenv("APPDATA", configDir)
	updateDir := filepath.Join(configDir, appNameZH, "update", "run-test")
	installDir := filepath.Join(dir, "installed")
	if err := os.MkdirAll(updateDir, 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.MkdirAll(installDir, 0o755); err != nil {
		t.Fatal(err)
	}
	writeSafetyMarkedUninstaller(t, installDir)
	helperSrc := filepath.Join(dir, "helper.go")
	if err := os.WriteFile(helperSrc, []byte(
		"package main\n"+
			"import (\"os\"; \"path/filepath\")\n"+
			"func main() { _ = os.WriteFile(filepath.Join(os.Getenv(\"HELPER_PROOF_DIR\"), \"proof.txt\"), []byte(\"proof\"), 0o644) }\n"), 0o644); err != nil {
		t.Fatal(err)
	}

	buildHelper := func(name string) string {
		t.Helper()
		path := filepath.Join(dir, name)
		cmd := exec.Command("go", "build", "-o", path, helperSrc)
		cmd.Env = os.Environ()
		if output, err := cmd.CombinedOutput(); err != nil {
			t.Fatalf("go build %s: %v\n%s", name, err, output)
		}
		return path
	}

	// The "old process": helper that exits after writing its proof.
	oldProcess := buildHelper("old-进程.exe")
	newBinary := filepath.Join(updateDir, "new-版本-windows-amd64.bin")
	build := exec.Command("go", "build", "-o", newBinary, helperSrc)
	build.Env = os.Environ()
	if output, err := build.CombinedOutput(); err != nil {
		t.Fatalf("go build new version: %v\n%s", err, output)
	}
	targetBinary := buildHelper(filepath.Join("installed", windowsUpdateExecutableName))

	proofDir := filepath.Join(dir, "proof")
	if err := os.MkdirAll(proofDir, 0o755); err != nil {
		t.Fatal(err)
	}
	proofPath := filepath.Join(proofDir, "proof.txt")
	t.Setenv("HELPER_PROOF_DIR", proofDir)

	oldCmd := exec.Command(oldProcess)
	oldCmd.Env = os.Environ()
	if err := oldCmd.Start(); err != nil {
		t.Fatal(err)
	}
	parentPID := strconv.Itoa(oldCmd.Process.Pid)
	_ = oldCmd.Wait()
	// Give the process a moment to fully terminate.
	deadline := time.Now().Add(5 * time.Second)
	for processAlive(parentPID) && time.Now().Before(deadline) {
		time.Sleep(50 * time.Millisecond)
	}
	if processAlive(parentPID) {
		t.Fatal("old process did not terminate")
	}
	_ = os.Remove(proofPath)

	logPath := filepath.Join(updateDir, "apply-update.log")
	if err := runUpdateHelper(newBinary, targetBinary, parentPID, logPath); err != nil {
		t.Fatalf("runUpdateHelper: %v", err)
	}

	// The target binary must have been replaced by the new payload...
	data, err := os.ReadFile(targetBinary)
	if err != nil {
		t.Fatal(err)
	}
	if string(data) != string(mustRead(t, newBinary)) {
		t.Fatal("target was not replaced with the new binary content")
	}
	backup := filepath.Join(updateDir, "previous-version.exe")
	if _, err := os.Stat(backup); err != nil {
		t.Fatalf("previous executable backup was not preserved: %v", err)
	}

	// ...and the new version must have been started (it writes its proof).
	deadline = time.Now().Add(10 * time.Second)
	for {
		if _, err := os.Stat(proofPath); err == nil {
			break
		}
		if time.Now().After(deadline) {
			t.Fatal("the restarted binary did not run")
		}
		time.Sleep(100 * time.Millisecond)
	}

	logData, err := os.ReadFile(logPath)
	if err != nil {
		t.Fatal(err)
	}
	for _, expected := range []string{"helper started", "replacing", "starting the new version", "done"} {
		if !strings.Contains(string(logData), expected) {
			t.Fatalf("log is missing %q\n--- log ---\n%s", expected, logData)
		}
	}
}

// TestApplyUpdateCanReplaceTheExecutableThatLaunchedIt catches the Windows
// file-locking bug where the updater was launched from the installed
// executable and then tried to overwrite that same running executable.
func TestApplyUpdateCanReplaceTheExecutableThatLaunchedIt(t *testing.T) {
	root := t.TempDir()
	configDir := filepath.Join(root, "config")
	t.Setenv("APPDATA", configDir)
	dir := filepath.Join(root, "installed")
	updateDir := filepath.Join(configDir, appNameZH, "update", "run-test")
	if err := os.MkdirAll(dir, 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.MkdirAll(updateDir, 0o755); err != nil {
		t.Fatal(err)
	}
	writeSafetyMarkedUninstaller(t, dir)

	testExecutable, err := os.Executable()
	if err != nil {
		t.Fatal(err)
	}
	installedExecutable := filepath.Join(dir, windowsUpdateExecutableName)
	testExecutableData, err := os.ReadFile(testExecutable)
	if err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(installedExecutable, testExecutableData, 0o755); err != nil {
		t.Fatal(err)
	}

	newSource := filepath.Join(dir, "new-version.go")
	proofPath := filepath.Join(dir, "restarted.txt")
	newSourceCode := "package main\n" +
		"import \"os\"\n" +
		"func main() { _ = os.WriteFile(" + strconv.Quote(proofPath) + ", []byte(\"restarted\"), 0o644) }\n"
	if err := os.WriteFile(newSource, []byte(newSourceCode), 0o644); err != nil {
		t.Fatal(err)
	}
	newBinary := filepath.Join(updateDir, "quillite-markdown-next-windows-amd64.bin")
	build := exec.Command("go", "build", "-o", newBinary, newSource)
	if output, err := build.CombinedOutput(); err != nil {
		t.Fatalf("build replacement binary: %v\n%s", err, output)
	}

	oldApp := exec.Command(installedExecutable, "--test-start-update", newBinary)
	if output, err := oldApp.CombinedOutput(); err != nil {
		t.Fatalf("start old app update flow: %v\n%s", err, output)
	}

	deadline := time.Now().Add(15 * time.Second)
	for time.Now().Before(deadline) {
		if data, err := os.ReadFile(proofPath); err == nil && string(data) == "restarted" {
			return
		}
		time.Sleep(100 * time.Millisecond)
	}

	logPath := filepath.Join(updateDir, "apply-update.log")
	logData, _ := os.ReadFile(logPath)
	t.Fatalf("updated executable did not restart; updater log:\n%s", logData)
}

func TestRunUpdateHelperLogsReplacementFailure(t *testing.T) {
	root := t.TempDir()
	configDir := filepath.Join(root, "config")
	t.Setenv("APPDATA", configDir)
	updateDir := filepath.Join(configDir, appNameZH, "update", "run-test")
	installDir := filepath.Join(root, "installed")
	if err := os.MkdirAll(updateDir, 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.MkdirAll(installDir, 0o755); err != nil {
		t.Fatal(err)
	}
	writeSafetyMarkedUninstaller(t, installDir)
	target := filepath.Join(installDir, windowsUpdateExecutableName)
	if err := os.WriteFile(target, []byte("old"), 0o600); err != nil {
		t.Fatal(err)
	}
	logPath := filepath.Join(updateDir, "apply-update.log")
	err := runUpdateHelper(
		filepath.Join(updateDir, "missing-windows-amd64.bin"),
		target,
		"99999999",
		logPath,
	)
	if err == nil {
		t.Fatal("runUpdateHelper must report a missing replacement binary")
	}
	if !strings.Contains(err.Error(), "replacement binary is unavailable") {
		t.Fatalf("unexpected validation error: %v", err)
	}
}

func TestRunUpdateHelperRestoresPreviousExecutableWhenRelaunchFails(t *testing.T) {
	root := t.TempDir()
	configDir := filepath.Join(root, "config")
	t.Setenv("APPDATA", configDir)
	updateDir := filepath.Join(configDir, appNameZH, "update", "run-test")
	installDir := filepath.Join(root, "installed")
	if err := os.MkdirAll(updateDir, 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.MkdirAll(installDir, 0o755); err != nil {
		t.Fatal(err)
	}
	writeSafetyMarkedUninstaller(t, installDir)
	target := filepath.Join(installDir, windowsUpdateExecutableName)
	previous := []byte("previous executable that must survive")
	if err := os.WriteFile(target, previous, 0o600); err != nil {
		t.Fatal(err)
	}
	newBinary := filepath.Join(updateDir, "invalid-windows-amd64.bin")
	if err := os.WriteFile(newBinary, []byte("not a Windows executable"), 0o600); err != nil {
		t.Fatal(err)
	}
	err := runUpdateHelper(newBinary, target, "99999999", filepath.Join(updateDir, "apply-update.log"))
	if err == nil || !strings.Contains(err.Error(), "previous version was restored") {
		t.Fatalf("expected a restored-version launch failure, got %v", err)
	}
	if got, readErr := os.ReadFile(target); readErr != nil || string(got) != string(previous) {
		t.Fatalf("failed relaunch did not restore previous executable: %q, %v", got, readErr)
	}
	if got, readErr := os.ReadFile(filepath.Join(updateDir, "previous-version.exe")); readErr != nil || string(got) != string(previous) {
		t.Fatalf("recovery backup was not preserved: %q, %v", got, readErr)
	}
}

func TestUpdateHelperRejectsArbitraryOverwriteTargets(t *testing.T) {
	root := t.TempDir()
	configDir := filepath.Join(root, "config")
	t.Setenv("APPDATA", configDir)
	updateDir := filepath.Join(configDir, appNameZH, "update", "run-test")
	installDir := filepath.Join(root, "installed")
	if err := os.MkdirAll(updateDir, 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.MkdirAll(installDir, 0o755); err != nil {
		t.Fatal(err)
	}
	newBinary := filepath.Join(updateDir, "release-windows-amd64.bin")
	if err := os.WriteFile(newBinary, []byte("new"), 0o600); err != nil {
		t.Fatal(err)
	}
	userFile := filepath.Join(installDir, "important-user-file.txt")
	if err := os.WriteFile(userFile, []byte("keep"), 0o600); err != nil {
		t.Fatal(err)
	}
	err := validateUpdateHelperRequest(newBinary, userFile, strconv.Itoa(os.Getpid()), filepath.Join(updateDir, "apply-update.log"))
	if err == nil {
		t.Fatal("the update helper accepted an arbitrary overwrite target")
	}
	if data, readErr := os.ReadFile(userFile); readErr != nil || string(data) != "keep" {
		t.Fatalf("rejected update changed the user file: %q, %v", data, readErr)
	}
}

func writeSafetyMarkedUninstaller(t *testing.T, directory string) {
	t.Helper()
	data := append([]byte("mock PE resource\x00"), utf16LEBytes(windowsSafeUninstallerMarker)...)
	if err := os.WriteFile(filepath.Join(directory, "uninstall.exe"), data, 0o600); err != nil {
		t.Fatal(err)
	}
}

func mustRead(t *testing.T, path string) []byte {
	t.Helper()
	data, err := os.ReadFile(path)
	if err != nil {
		t.Fatal(err)
	}
	return data
}
