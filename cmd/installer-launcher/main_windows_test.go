//go:build windows

package main

import (
	"errors"
	"image"
	"image/color"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"
)

func TestTwoThirdsWindowMapsClicksBackToDesignGrid(t *testing.T) {
	x, y := scaleToDesign(320, 350, displayWidth, displayHeight)
	if !inside(welcomePrimary, x, y) {
		t.Fatalf("scaled click (%d, %d) did not land in welcome primary action", x, y)
	}
	x, y = scaleToDesign(70, 401, displayWidth, displayHeight)
	if !inside(customInstall, x, y) {
		t.Fatalf("scaled click (%d, %d) did not land in custom-install action", x, y)
	}
	x, y = scaleToDesign(608, 32, displayWidth, displayHeight)
	if !inside(closeInstaller, x, y) {
		t.Fatalf("scaled click (%d, %d) did not land in close action", x, y)
	}
	x, y = scaleToDesign(560, 401, displayWidth, displayHeight)
	if !inside(languageAction, x, y) {
		t.Fatalf("scaled click (%d, %d) did not land in language action", x, y)
	}
	if displayWidth*3 != windowWidth*2 {
		t.Fatalf("display width %d is not exactly two-thirds of %d", displayWidth, windowWidth)
	}
	if delta := displayHeight*3 - windowHeight*2; delta < -1 || delta > 1 {
		t.Fatalf("display height %d is not the nearest two-thirds of %d", displayHeight, windowHeight)
	}
}

func TestClickableInstallerControlsUseTheHandCursor(t *testing.T) {
	if !installerClickablePoint(pageWelcome, false, 320, 350) {
		t.Fatal("welcome primary action should be clickable")
	}
	if !installerClickablePoint(pageWelcome, false, 70, 401) {
		t.Fatal("custom installation action should be clickable")
	}
	if !installerClickablePoint(pageConfirm, false, 320, 350) || !installerClickablePoint(pageConfirm, false, 70, 401) || !installerClickablePoint(pageConfirm, false, 113, 401) {
		t.Fatal("confirmation, change-location, and back actions should be clickable")
	}
	if !installerClickablePoint(pageConfirm, true, 150, 401) || installerClickablePoint(pageConfirm, false, 275, 401) {
		t.Fatal("English back must be clickable, while the old distant back area must not be")
	}
	if !installerClickablePoint(pageComplete, false, 320, 350) {
		t.Fatal("completion action should be clickable")
	}
	if !installerClickablePoint(pageInstalling, false, 608, 32) {
		t.Fatal("installing close action should be clickable")
	}
	if installerClickablePoint(pageInstalling, false, 320, 350) {
		t.Fatal("installing status button should not claim to be clickable")
	}
	for _, page := range []int{pageWelcome, pageConfirm, pageInstalling, pageComplete, pageFailed} {
		if !installerClickablePoint(page, false, 560, 401) {
			t.Fatalf("language action should be clickable on page %d", page)
		}
	}
}

func TestBackFollowsChangeLocationWithoutOverlapping(t *testing.T) {
	for _, english := range []bool{false, true} {
		change, back := confirmFooterRects(english)
		if back.left <= change.right || back.left-change.right > 8 || change.top != back.top {
			t.Fatalf("footer actions must be adjacent, not overlapping: change=%+v back=%+v", change, back)
		}
		changeX, backX := (change.left+change.right)/2, (back.left+back.right)/2
		if !inside(change, changeX, 401) || inside(back, changeX, 401) {
			t.Fatalf("change-location click must not activate Back: english=%t", english)
		}
		if !inside(back, backX, 401) || inside(change, backX, 401) {
			t.Fatalf("Back click must not activate change-location: english=%t", english)
		}
	}
}

func TestCloseActionTakesPriorityOverTheDraggableTitleArea(t *testing.T) {
	if got := installerNonClientHitTest(608, 32); got != htClient {
		t.Fatalf("close action hit test = %d, want HTCLIENT", got)
	}
	if got := installerNonClientHitTest(320, 24); got != htCaption {
		t.Fatalf("ordinary title-area hit test = %d, want HTCAPTION", got)
	}
	if got := installerNonClientHitTest(320, 90); got != 0 {
		t.Fatalf("content-area hit test = %d, want default handling", got)
	}
}

func TestPreferredInstallDirectoryUsesRecordedUpgradeLocation(t *testing.T) {
	local := t.TempDir()
	recorded := filepath.Join(t.TempDir(), installProductDirectoryName)
	if err := os.MkdirAll(recorded, 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(recorded, installMarkerName), []byte(installMarkerContent+"\r\n"), 0o600); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(recorded, installExecutableName), []byte("owned"), 0o600); err != nil {
		t.Fatal(err)
	}
	if got := preferredInstallDirectory(local, recorded); got != recorded {
		t.Fatalf("preferred install directory = %q, want %q", got, recorded)
	}
	if got := preferredInstallDirectory(local, filepath.Join(local, "unverified"), recorded); got != recorded {
		t.Fatalf("owned previous install must be found after an unverified registry hint: got %q, want %q", got, recorded)
	}
	wantDefault := filepath.Join(local, "Programs", installProductDirectoryName)
	if got := preferredInstallDirectory(local, ""); got != wantDefault {
		t.Fatalf("default install directory = %q, want %q", got, wantDefault)
	}
}

func TestInstallerPathLayoutUsesCompactCardForOrdinaryDestination(t *testing.T) {
	shortBox, _, shortFlags, _ := installerPathLayout(`D:\MD工具\轻阅 Markdown`)
	longBox, _, longFlags, _ := installerPathLayout(`D:\` + strings.Repeat("long-install-folder\\", 12) + installProductDirectoryName)
	if shortBox.bottom-shortBox.top >= longBox.bottom-longBox.top {
		t.Fatal("ordinary installation path should use a shorter confirmation card")
	}
	if shortFlags&dtSingleLine == 0 || longFlags&dtWordBreak == 0 {
		t.Fatal("short paths should be single-line; long paths should wrap")
	}
}

func TestPreferredInstallDirectoryRejectsUnownedRegistryPath(t *testing.T) {
	local := t.TempDir()
	unowned := filepath.Join(t.TempDir(), "shared-folder")
	if err := os.MkdirAll(unowned, 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(unowned, installExecutableName), []byte("user file"), 0o600); err != nil {
		t.Fatal(err)
	}
	want := filepath.Join(local, "Programs", installProductDirectoryName)
	if got := preferredInstallDirectory(local, unowned); got != want {
		t.Fatalf("unowned registry path selected: got %q, want safe default %q", got, want)
	}
}

func TestInstallDestinationRejectsUnverifiedReservedFiles(t *testing.T) {
	directory := t.TempDir()
	if err := os.WriteFile(filepath.Join(directory, installExecutableName), []byte("user file"), 0o600); err != nil {
		t.Fatal(err)
	}
	if err := validateInstallDestination(directory); err == nil {
		t.Fatal("destination with an unverified executable must be rejected")
	}
}

func TestInstallDestinationAllowsDocumentsAndOwnedUpgrade(t *testing.T) {
	directory := t.TempDir()
	if err := os.WriteFile(filepath.Join(directory, "important.md"), []byte("keep"), 0o600); err != nil {
		t.Fatal(err)
	}
	if err := validateInstallDestination(directory); err != nil {
		t.Fatalf("documents-only destination should remain usable: %v", err)
	}
	if err := os.WriteFile(filepath.Join(directory, installExecutableName), []byte("owned"), 0o600); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(directory, installMarkerName), []byte("Quillite Markdown 2.7.3\r\n"), 0o600); err != nil {
		t.Fatal(err)
	}
	if err := validateInstallDestination(directory); err != nil {
		t.Fatalf("legacy safety-marker upgrade should be accepted: %v", err)
	}
}

func TestInstallerArgumentsKeepCustomDirectoryLastAndIntact(t *testing.T) {
	cancelFile := filepath.Join(t.TempDir(), "install.cancel")
	installDir := `D:\Markdown Apps\轻阅 Markdown`
	arguments := installerCommandArguments(cancelFile, installDir, true)
	if len(arguments) != 4 {
		t.Fatalf("installer arguments = %#v, want 4 entries", arguments)
	}
	if arguments[0] != "/S" || arguments[1] != "/CANCELFILE="+cancelFile {
		t.Fatalf("installer arguments prefix = %#v", arguments[:2])
	}
	if arguments[2] != "/APP-LANGUAGE=en" {
		t.Fatalf("English install language argument = %q", arguments[2])
	}
	if arguments[3] != "/INSTALLDIR="+installDir {
		t.Fatalf("custom install argument = %q, want %q", arguments[3], "/INSTALLDIR="+installDir)
	}
	if relative := installerCommandArguments(cancelFile, `relative\folder`, false); len(relative) != 3 {
		t.Fatalf("relative install directory should be ignored: %#v", relative)
	} else if relative[2] != "/APP-LANGUAGE=zh-CN" {
		t.Fatalf("Chinese install language argument = %q", relative[2])
	}
}

func TestInstallerEnvironmentReplacesStaleDestination(t *testing.T) {
	installDir := `D:\Markdown Apps\轻阅 Markdown`
	environment := installerCommandEnvironment([]string{
		"PATH=C:\\Windows",
		"quillite_install_dir=C:\\Old Install",
		"TEMP=C:\\Temp",
	}, installDir)
	found := 0
	for _, entry := range environment {
		if strings.HasPrefix(strings.ToUpper(entry), installDirectoryEnvName+"=") {
			found++
			if entry != installDirectoryEnvName+"="+installDir {
				t.Fatalf("installer environment destination = %q, want %q", entry, installDirectoryEnvName+"="+installDir)
			}
		}
	}
	if found != 1 {
		t.Fatalf("installer environment contains %d destination entries, want 1: %#v", found, environment)
	}
}

func TestInstallDirectoryComparisonIsNormalizedAndCaseInsensitive(t *testing.T) {
	if !sameInstallDirectory(`D:\Apps\轻阅 Markdown\.`, `d:\apps\轻阅 Markdown`) {
		t.Fatal("equivalent Windows install directories should match")
	}
	if sameInstallDirectory(`D:\Apps\轻阅 Markdown`, `C:\Apps\轻阅 Markdown`) {
		t.Fatal("different install drives must not match")
	}
}

func TestCustomInstallDirectoryAlwaysCreatesProductChild(t *testing.T) {
	for _, parent := range []string{t.TempDir(), filepath.Join(t.TempDir(), "empty-new-parent")} {
		want := filepath.Join(parent, installProductDirectoryName)
		got, err := customInstallDirectory(parent)
		if err != nil {
			t.Fatalf("custom install directory for %q: %v", parent, err)
		}
		if got != want {
			t.Fatalf("custom install directory = %q, want dedicated child %q", got, want)
		}
	}

	nonEmptyParent := t.TempDir()
	if err := os.WriteFile(filepath.Join(nonEmptyParent, "important-user-file.txt"), []byte("keep"), 0o600); err != nil {
		t.Fatal(err)
	}
	want := filepath.Join(nonEmptyParent, installProductDirectoryName)
	if got, err := customInstallDirectory(nonEmptyParent); err != nil || got != want {
		t.Fatalf("non-empty custom parent = %q, %v; want %q", got, err, want)
	}
}

func TestCustomInstallPickerStartsAtVerifiedPreviousInstall(t *testing.T) {
	parent := filepath.Join(t.TempDir(), "Documents")
	destination := filepath.Join(parent, installProductDirectoryName)
	if got := customPickerInitialDirectory(destination); got != parent {
		t.Fatalf("new install picker initial directory = %q, want parent %q", got, parent)
	}
	if err := os.MkdirAll(destination, 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(destination, installMarkerName), []byte(installMarkerContent+"\r\n"), 0o600); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(destination, installExecutableName), []byte("owned"), 0o600); err != nil {
		t.Fatal(err)
	}
	if got := customPickerInitialDirectory(destination); got != destination {
		t.Fatalf("repeat install picker initial directory = %q, want previous install %q", got, destination)
	}
	if got, err := resolveCustomInstallSelection(destination); err != nil || got != destination {
		t.Fatalf("confirming previous install directory = %q, %v; want %q", got, err, destination)
	}
	if got, err := resolveCustomInstallSelection(parent); err != nil || got != destination {
		t.Fatalf("selecting its parent = %q, %v; want %q", got, err, destination)
	}
	if got := customPickerInitialDirectory(parent); got != parent {
		t.Fatalf("non-product directory should stay unchanged: %q", got)
	}
}

func TestCustomSelectionDoesNotTrustUnownedProductDirectory(t *testing.T) {
	selected := filepath.Join(t.TempDir(), installProductDirectoryName)
	if err := os.MkdirAll(selected, 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(selected, installExecutableName), []byte("unknown"), 0o600); err != nil {
		t.Fatal(err)
	}
	if got := customPickerInitialDirectory(selected); got != filepath.Dir(selected) {
		t.Fatalf("unowned directory must not be used as prior install: %q", got)
	}
	if got, err := resolveCustomInstallSelection(selected); err != nil || got != filepath.Join(selected, installProductDirectoryName) {
		t.Fatalf("unowned folder must remain a parent, got %q, %v", got, err)
	}
}

func TestInstallSelectionWaitsForExplicitConfirmation(t *testing.T) {
	view.Lock()
	previous := installView{page: view.page, progress: view.progress, errorTextZH: view.errorTextZH, errorTextEN: view.errorTextEN, installDir: view.installDir, animationFrame: view.animationFrame, english: view.english, started: view.started}
	view.page = pageWelcome
	view.started = false
	view.Unlock()
	t.Cleanup(func() {
		view.Lock()
		view.page, view.progress = previous.page, previous.progress
		view.errorTextZH, view.errorTextEN = previous.errorTextZH, previous.errorTextEN
		view.installDir, view.animationFrame = previous.installDir, previous.animationFrame
		view.english, view.started = previous.english, previous.started
		view.Unlock()
	})

	destination := filepath.Join(t.TempDir(), installProductDirectoryName)
	reviewInstallDirectory(destination)
	view.RLock()
	page, started, installDir := view.page, view.started, view.installDir
	view.RUnlock()
	if page != pageConfirm || started || installDir != destination {
		t.Fatalf("selection must stop on the destination review screen: page=%d started=%t dir=%q", page, started, installDir)
	}
	returnToInstallerWelcome()
	view.RLock()
	page, started, installDir = view.page, view.started, view.installDir
	view.RUnlock()
	if page != pageWelcome || installDir != destination || started {
		t.Fatalf("back must keep the selected destination without starting installation: page=%d started=%t dir=%q", page, started, installDir)
	}
	beginInstall()
	view.RLock()
	page, started = view.page, view.started
	view.RUnlock()
	if page != pageWelcome || started {
		t.Fatal("installation must not start before the confirmation screen")
	}
}

func TestWindowsUninstallerNeverRecursivelyDeletesInstallDirectory(t *testing.T) {
	scriptPath := filepath.Join("..", "..", "build", "windows", "installer", "project.nsi")
	script, err := os.ReadFile(scriptPath)
	if err != nil {
		t.Fatalf("read installer script: %v", err)
	}
	text := string(script)
	if strings.Contains(strings.ToLower(text), "rmdir /r") {
		t.Fatal("installer and uninstaller must never recursively delete any directory")
	}
	for _, forbidden := range []string{
		`Delete "$INSTDIR\*"`,
		`Delete /REBOOTOK "$INSTDIR\*"`,
		`Delete "$INSTDIR\*.md"`,
		`Delete /REBOOTOK "$INSTDIR\*.md"`,
		`Delete "$INSTDIR\*.txt"`,
		`Delete /REBOOTOK "$INSTDIR\*.txt"`,
		`Delete /REBOOTOK "$PreviousInstallDir\`,
		`Call CleanupPreviousInstallDir`,
		`Delete /REBOOTOK "$INSTDIR\MDReaderAssistant-*.ico"`,
		`Delete /REBOOTOK "$INSTDIR\QuilliteMarkdown-*.ico"`,
	} {
		if strings.Contains(text, forbidden) {
			t.Fatalf("uninstaller must preserve documents created inside the install directory: found %q", forbidden)
		}
	}
	for _, required := range []string{
		`VIAddVersionKey "UninstallSafety" "QUILLITE_SAFE_UNINSTALL_V1"`,
		`ReadEnvStr $ExternalInstallDir "QUILLITE_INSTALL_DIR"`,
		`Call EnsurePreviousApplicationClosed`,
		`FileWrite $0 "${INSTALL_MARKER_CONTENT}$\r$\n"`,
		`IfFileExists "$0\${PRODUCT_EXECUTABLE}" 0 previousInstallDone`,
		`IfFileExists "$0\${INSTALL_MARKER}" 0 previousInstallDone`,
		`StrCmp $2 "${INSTALL_MARKER_CONTENT}$\r$\n" previousInstallOwned`,
		`Call un.VerifyInstallOwnership`,
		`StrCmp $InstallOwned "1" uninstallOwnershipConfirmed`,
		`Delete /REBOOTOK "$INSTDIR\${PRODUCT_EXECUTABLE}"`,
		`Delete /REBOOTOK "$INSTDIR\${INSTALL_MARKER}"`,
		`RMDir "$INSTDIR"`,
	} {
		if !strings.Contains(text, required) {
			t.Fatalf("uninstaller is missing owned-file cleanup %q", required)
		}
	}
}

func TestInstallerPreservesUnverifiedShortcutsAndDestinations(t *testing.T) {
	script, err := os.ReadFile(filepath.Join("..", "..", "build", "windows", "installer", "project.nsi"))
	if err != nil {
		t.Fatal(err)
	}
	text := string(script)
	for _, forbidden := range []string{
		`Delete "$SMPROGRAMS\`, `Delete "$DESKTOP\`,
	} {
		if strings.Contains(text, forbidden) {
			t.Fatalf("installer deletes an unverified shortcut: %s", forbidden)
		}
	}
	for _, required := range []string{
		`Call VerifyInstallDestination`,
		`IfFileExists "$INSTDIR\uninstall.exe" installDestinationReserved`,
		`ReadRegStr $1 HKCU "${UNINST_KEY}" "UninstallString"`,
		`WriteRegStr HKCU "${UNINST_KEY}" "UninstallString" "$\"$INSTDIR\uninstall.exe$\" _?=$INSTDIR"`,
		`StrCmp $EXEPATH "$INSTDIR\uninstall.exe" 0 verifyInstallOwnershipDone`,
		`StrCmp $1 "Quillite Markdown 2.7.3$\r$\n" installDestinationMarkerOwned`,
		`IfFileExists "$SMPROGRAMS\${INFO_PRODUCTNAME}.lnk" publicStartMenuRemains`,
		`IfFileExists "$DESKTOP\${INFO_PRODUCTNAME}.lnk" publicDesktopRemains`,
	} {
		if !strings.Contains(text, required) {
			t.Fatalf("installer lacks safety guard: %s", required)
		}
	}
}

func TestCancellationMarker(t *testing.T) {
	resetInstallControl()
	path := filepath.Join(t.TempDir(), "install.cancel")
	setInstallCancelFile(path)
	requestInstallCancel()
	if !installWasCancelled() {
		t.Fatal("cancel request was not retained")
	}
	if _, err := os.Stat(path); err != nil {
		t.Fatalf("cancel marker was not written: %v", err)
	}
	clearInstallControl()
}

func TestInstallCancelPathStartsWithoutMarker(t *testing.T) {
	path, cleanup, err := createInstallCancelPath()
	if err != nil {
		t.Fatalf("create install cancel path: %v", err)
	}
	directory := filepath.Dir(path)
	defer cleanup()
	if info, err := os.Stat(directory); err != nil || !info.IsDir() {
		t.Fatalf("private control directory was not created: %v", err)
	}
	if _, err := os.Stat(path); !errors.Is(err, os.ErrNotExist) {
		t.Fatalf("cancel marker must be absent before cancellation, stat error = %v", err)
	}
	writeCancelMarker(path)
	if _, err := os.Stat(path); err != nil {
		t.Fatalf("cancel marker was not written on request: %v", err)
	}
	cleanup()
	if _, err := os.Stat(directory); !errors.Is(err, os.ErrNotExist) {
		t.Fatalf("private control directory was not removed, stat error = %v", err)
	}
}

func TestExitDuringInstallRequestsSafeCancellation(t *testing.T) {
	resetInstallControl()
	path := filepath.Join(t.TempDir(), "install.cancel")
	setInstallCancelFile(path)
	requestInstallExit()
	installControl.Lock()
	closeAfterCancel := installControl.closeAfterCancel
	installControl.Unlock()
	if !closeAfterCancel || !installWasCancelled() {
		t.Fatal("exit did not request cancellation before closing")
	}
	if _, err := os.Stat(path); err != nil {
		t.Fatalf("exit did not write a cancellation marker: %v", err)
	}
	clearInstallControl()
}

func TestInstallerVisualSourcesStayUnder800KB(t *testing.T) {
	paths := []string{
		"main_windows.go",
		"main_windows_test.go",
		"main_other.go",
		"launcher.manifest",
		filepath.Join("assets", "background-base.webp"),
		filepath.Join("assets", "app-icon.webp"),
		filepath.Join("..", "..", "build", "windows", "icon.ico"),
	}
	var total int64
	for _, path := range paths {
		info, err := os.Stat(path)
		if err != nil {
			t.Fatalf("stat %s: %v", path, err)
		}
		total += info.Size()
	}
	const budget = int64(800 * 1024)
	if total > budget {
		t.Fatalf("installer visual/text sources use %d bytes, budget is %d", total, budget)
	}
	t.Logf("installer visual/text sources: %d / %d bytes", total, budget)
}

func TestInstallerProgressIsMonotonicAndWaitsForSuccess(t *testing.T) {
	checkpoints := []time.Duration{
		0,
		400 * time.Millisecond,
		800 * time.Millisecond,
		2 * time.Second,
		6 * time.Second,
		30 * time.Second,
	}
	previous := 0
	for _, checkpoint := range checkpoints {
		progress := installerProgressTarget(checkpoint)
		if progress < previous {
			t.Fatalf("progress went backwards at %s: %d after %d", checkpoint, progress, previous)
		}
		if progress >= 100 {
			t.Fatalf("progress reached completion before installer success at %s: %d", checkpoint, progress)
		}
		previous = progress
	}
	if got := installerProgressTarget(10 * time.Minute); got != 96 {
		t.Fatalf("long-running install progress = %d, want 96", got)
	}
}

func TestRoundedWindowGeometryKeepsCornersTransparent(t *testing.T) {
	if insideRoundedDisplay(0.5, 0.5) {
		t.Fatal("top-left corner should remain transparent")
	}
	if !insideRoundedDisplay(float64(displayCornerRadius), 0.5) {
		t.Fatal("top edge at the corner radius should be visible")
	}
	if !insideRoundedDisplay(float64(displayWidth)/2, 0.5) {
		t.Fatal("center of top edge should be visible")
	}
	if insideRoundedDisplay(float64(displayWidth)-0.5, float64(displayHeight)-0.5) {
		t.Fatal("bottom-right corner should remain transparent")
	}
}

func TestButtonCoverageIncludesAntialiasedEdgePixels(t *testing.T) {
	button := rect{left: 0, top: 0, right: 20, bottom: 20}
	if got := roundedRectCoverage(10, 10, button, 10, 8); got != 255 {
		t.Fatalf("button center coverage = %d, want 255", got)
	}
	if got := roundedRectCoverage(0, 0, button, 10, 8); got != 0 {
		t.Fatalf("button corner coverage = %d, want 0", got)
	}
	if got := roundedRectCoverage(2, 3, button, 10, 8); got <= 0 || got >= 255 {
		t.Fatalf("button edge coverage = %d, want a partial alpha", got)
	}
}

func TestInstallingActionLabelCyclesItsDots(t *testing.T) {
	wants := []string{"正在安装...", "正在安装.", "正在安装..", "正在安装..."}
	for frame, want := range wants {
		if got := installingActionLabel(frame, false); got != want {
			t.Fatalf("installing label frame %d = %q, want %q", frame, got, want)
		}
	}
	englishWants := []string{"Installing...", "Installing.", "Installing..", "Installing..."}
	for frame, want := range englishWants {
		if got := installingActionLabel(frame, true); got != want {
			t.Fatalf("English installing label frame %d = %q, want %q", frame, got, want)
		}
	}
}

func TestInstallerCopySupportsChineseAndEnglish(t *testing.T) {
	chinese := installerText(false)
	english := installerText(true)
	if chinese.readyTitle != "准备安装轻阅 Markdown" || chinese.startAction != "下一步" || chinese.confirmAction != "确认并安装" || chinese.destinationLabel != "最终安装路径" || chinese.languageAction != "English" {
		t.Fatalf("unexpected Chinese installer copy: %#v", chinese)
	}
	if english.readyTitle != "Ready to install Quillite Markdown" || english.startAction != "Continue" || english.confirmAction != "Confirm and install" || english.destinationLabel != "Final installation folder" || english.languageAction != "中文" {
		t.Fatalf("unexpected English installer copy: %#v", english)
	}
	if chinese.folderTitle == english.folderTitle {
		t.Fatal("folder picker title should follow the selected installer language")
	}
}

func TestLanguageToggleDoesNotResetInstallState(t *testing.T) {
	view.Lock()
	previousPage := view.page
	previousProgress := view.progress
	previousErrorZH := view.errorTextZH
	previousErrorEN := view.errorTextEN
	previousInstallDir := view.installDir
	previousAnimationFrame := view.animationFrame
	previousEnglish := view.english
	previousStarted := view.started
	view.page = pageInstalling
	view.progress = 47
	view.installDir = `D:\Apps\Quillite`
	view.english = false
	view.Unlock()
	t.Cleanup(func() {
		view.Lock()
		view.page = previousPage
		view.progress = previousProgress
		view.errorTextZH = previousErrorZH
		view.errorTextEN = previousErrorEN
		view.installDir = previousInstallDir
		view.animationFrame = previousAnimationFrame
		view.english = previousEnglish
		view.started = previousStarted
		view.Unlock()
	})

	if !toggleInstallerLanguage() {
		t.Fatal("first language toggle should select English")
	}
	view.RLock()
	defer view.RUnlock()
	if view.page != pageInstalling || view.progress != 47 || view.installDir != `D:\Apps\Quillite` {
		t.Fatalf("language toggle reset installation state: page=%d progress=%d dir=%q", view.page, view.progress, view.installDir)
	}
}

func TestCompletedInstallerClosesAfterThreeSeconds(t *testing.T) {
	if completionAutoCloseDelay != 3*time.Second {
		t.Fatalf("completion auto-close delay = %s, want 3s", completionAutoCloseDelay)
	}
}

func TestTransparentIconPixelsBorrowNeighbourColourWithoutChangingAlpha(t *testing.T) {
	source := image.NewNRGBA(image.Rect(0, 0, 3, 1))
	source.SetNRGBA(1, 0, color.NRGBA{R: 12, G: 180, B: 112, A: 255})
	result, ok := bleedTransparentEdges(source).(*image.NRGBA)
	if !ok {
		t.Fatal("edge bleeding did not return an NRGBA image")
	}
	left := result.NRGBAAt(0, 0)
	if left.R != 12 || left.G != 180 || left.B != 112 || left.A != 0 {
		t.Fatalf("transparent edge = %#v, want borrowed green RGB with zero alpha", left)
	}
}
