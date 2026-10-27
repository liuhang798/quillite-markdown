package main

import (
	"io"
	"os"
	"os/exec"
	"path/filepath"
	"reflect"
	"runtime"
	"strings"
	"testing"
	"time"
)

func managedPicGoFixture(t *testing.T, a *App, name string) string {
	t.Helper()
	component := filepath.Join(a.picGoComponentsDirectory(), "picgo-3.2.0-"+name)
	for _, dir := range []string{"runtime", "cli/node_modules/picgo/bin"} {
		if err := os.MkdirAll(filepath.Join(component, filepath.FromSlash(dir)), 0700); err != nil {
			t.Fatal(err)
		}
	}
	node := "node"
	if runtime.GOOS == "windows" {
		node = "node.exe"
	}
	files := map[string][]byte{
		"runtime/" + managedPicGoEntry:        []byte(managedPicGoBootstrap),
		"runtime/" + node:                     []byte("not executed by discovery"),
		"cli/package.json":                    picGoPackage,
		"cli/package-lock.json":               picGoPackageLock,
		"cli/node_modules/picgo/package.json": []byte(`{"name":"picgo","version":"3.2.0"}`),
		"cli/node_modules/picgo/index.js":     []byte(`exports.PicGo = class { constructor() {this.cmd={program:{parseAsync:async()=>{console.log('[PicGo SUCCESS]:\nhttps://example.org/test.png');}}};} registerCommands() {} };`),
		"cli/node_modules/picgo/bin/picgo":    []byte(`if(process.argv.includes('--version'))console.log('3.2.0');else if(process.argv.includes('upload'))console.log('[PicGo SUCCESS]:\nhttps://example.org/test.png');else process.exit(1);`),
	}
	for file, data := range files {
		if err := os.WriteFile(filepath.Join(component, filepath.FromSlash(file)), data, 0700); err != nil {
			t.Fatal(err)
		}
	}
	return filepath.Join(component, "runtime", managedPicGoEntry)
}

func TestPicGoPreparedLocationPersistsWithoutEnablingOrReplacingSettings(t *testing.T) {
	a := testApp(t)
	before, err := a.updatePreferences(func(p *Preferences) {
		p.ImageUploadMode = imageUploadModeEmbedded
		p.PicGoCLIPath = filepath.Join(t.TempDir(), "user-cli")
		p.PicGoCLIConfigPath = "existing-config"
		p.PicGoCLIAllowHTTP = true
	})
	if err != nil {
		t.Fatal(err)
	}
	before, err = a.readPreferences()
	if err != nil {
		t.Fatal(err)
	}
	entry := managedPicGoFixture(t, a, "one")
	if err := a.rememberPreparedPicGoCLI(entry); err != nil {
		t.Fatal(err)
	}
	restarted := NewApp()
	restarted.preferencesOverride = a.preferencePath()
	after, err := restarted.readPreferences()
	if err != nil {
		t.Fatal(err)
	}
	if after.PicGoManagedCLIPath != entry {
		t.Fatal("component location was lost on restart")
	}
	after.PicGoManagedCLIPath = before.PicGoManagedCLIPath
	if !reflect.DeepEqual(before, after) {
		t.Fatal("preparation changed upload settings")
	}
	if got := restarted.effectivePicGoCLIPath(before.PicGoCLIPath); got != before.PicGoCLIPath {
		t.Fatal("explicit CLI replaced")
	}
	if got := restarted.effectivePicGoCLIPath(""); got != entry {
		t.Fatal("blank path did not discover prepared component")
	}
}

func TestPicGoLegacyDiscoveryFindsNewestValidComponentWithoutWriting(t *testing.T) {
	a := testApp(t)
	old := managedPicGoFixture(t, a, "old")
	fresh := managedPicGoFixture(t, a, "new")
	broken := managedPicGoFixture(t, a, "broken")
	oldTime := time.Now().Add(-time.Hour)
	if err := os.Chtimes(filepath.Dir(filepath.Dir(old)), oldTime, oldTime); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(broken, []byte("untrusted entry"), 0600); err != nil {
		t.Fatal(err)
	}
	if got := a.effectivePicGoCLIPath(""); got != fresh {
		t.Fatalf("discovered %q, want %q", got, fresh)
	}
	settings, err := a.GetImageUploadSettings()
	if err != nil || settings.CLIPath != fresh || settings.Mode != imageUploadModeLocal {
		t.Fatalf("%#v %v", settings, err)
	}
	if _, err := os.Stat(a.preferencePath()); !os.IsNotExist(err) {
		t.Fatal("discovery wrote preferences")
	}
	if err := a.rememberPreparedPicGoCLI(old); err != nil {
		t.Fatal(err)
	}
	if got := a.effectivePicGoCLIPath(""); got != old {
		t.Fatal("valid remembered component should take precedence")
	}
	if err := os.WriteFile(old, []byte("damaged"), 0600); err != nil {
		t.Fatal(err)
	}
	if got := a.effectivePicGoCLIPath(""); got != fresh {
		t.Fatal("stale remembered path blocked recovery")
	}
}

func TestPicGoDiscoveryRejectsForeignIncompleteAndLinkedComponents(t *testing.T) {
	a, foreign := testApp(t), testApp(t)
	external := managedPicGoFixture(t, foreign, "foreign")
	if a.validManagedPicGoCLI(external) {
		t.Fatal("accepted outside component root")
	}
	if err := a.rememberPreparedPicGoCLI(external); err == nil {
		t.Fatal("remembered foreign component")
	}
	if _, err := a.updatePreferences(func(p *Preferences) { p.PicGoManagedCLIPath = external }); err != nil {
		t.Fatal(err)
	}
	if got := a.effectivePicGoCLIPath(""); got != "" {
		t.Fatal("foreign stored path discovered")
	}
	entry := managedPicGoFixture(t, a, "incomplete")
	lock := filepath.Join(filepath.Dir(filepath.Dir(entry)), "cli", "package-lock.json")
	if err := os.WriteFile(lock, []byte("{}"), 0600); err != nil {
		t.Fatal(err)
	}
	if got := a.effectivePicGoCLIPath(""); got != "" {
		t.Fatal("partial installation discovered")
	}
	link := filepath.Join(a.picGoComponentsDirectory(), "picgo-3.2.0-linked")
	if err := os.Symlink(filepath.Dir(filepath.Dir(external)), link); err != nil {
		t.Log("symlink creation unavailable:", err)
	} else if got := a.effectivePicGoCLIPath(""); got != "" {
		t.Fatal("followed linked component")
	}
}

func TestPicGoDiscoveredComponentWorksAcrossDetectionVerificationAndSave(t *testing.T) {
	node, err := exec.LookPath("node")
	if err != nil {
		t.Skip("Node required for integration")
	}
	a := testApp(t)
	entry := managedPicGoFixture(t, a, "functional")
	nodeName := "node"
	if runtime.GOOS == "windows" {
		nodeName = "node.exe"
	}
	// Copy the trusted test runtime into this test-owned component. No network,
	// user configuration, global PATH changes or real uploads.
	src, err := os.Open(node)
	if err != nil {
		t.Fatal(err)
	}
	defer src.Close()
	dst, err := os.OpenFile(filepath.Join(filepath.Dir(entry), nodeName), os.O_WRONLY|os.O_TRUNC, 0700)
	if err != nil {
		t.Fatal(err)
	}
	_, copyErr := io.Copy(dst, src)
	closeErr := dst.Close()
	if copyErr != nil || closeErr != nil {
		t.Fatal(copyErr, closeErr)
	}
	if err := a.rememberPreparedPicGoCLI(entry); err != nil {
		t.Fatal(err)
	}
	restarted := NewApp()
	restarted.preferencesOverride = a.preferencePath()
	if version, err := restarted.TestPicGoCLI(""); err != nil || version != "3.2.0" {
		t.Fatalf("detect after restart: %q %v", version, err)
	}
	config := fakePicGoCLIConfig(t)
	if _, err := restarted.TestPicGoCLIUpload("", config, true, false); err != nil {
		t.Fatal(err)
	}
	prefs, err := restarted.readPreferences()
	if err != nil || normaliseImageUploadMode(prefs.ImageUploadMode) != imageUploadModeLocal || prefs.PicGoCLIPath != "" {
		t.Fatal("test silently enabled uploads")
	}
	settings, err := restarted.SetImageUploadSettings(ImageUploadSettingsInput{Mode: imageUploadModePicGoCLI, CLIConfigPath: config})
	if err != nil || settings.CLIPath != entry {
		t.Fatalf("verification/save resolved different CLI: %#v %v", settings, err)
	}
	if _, err := restarted.TestPicGoCLI(filepath.Join(t.TempDir(), "missing")); err == nil {
		t.Fatal("explicit missing path silently replaced")
	}
}

func TestPicGoPrepareRemembersOnlySuccessfulComponent(t *testing.T) {
	source, err := os.ReadFile("image_upload_cli_prepare.go")
	if err != nil {
		t.Fatal(err)
	}
	if !strings.Contains(string(source), "if err == nil {\n\t\terr = a.rememberPreparedPicGoCLI(entry)\n\t}") {
		t.Fatal("preparation must remember a successful component before reporting complete")
	}
}

// Optional, read-only layout audit. Never reads preferences or host config,
// launches a component, uploads anything, or writes to the supplied directory.
func TestPicGoExistingComponentsReadOnly(t *testing.T) {
	root := os.Getenv("QUILLITE_EXISTING_COMPONENT_CONFIG_DIR")
	if root == "" {
		t.Skip("existing component audit is opt-in")
	}
	if !filepath.IsAbs(root) {
		t.Fatal("absolute application config directory required")
	}
	a := &App{preferencesOverride: filepath.Join(root, "preferences.json")}
	entry := a.managedPicGoCLI(Preferences{})
	if entry == "" {
		t.Fatal("no complete managed component found")
	}
	t.Log("Recognized component:", entry)
}
