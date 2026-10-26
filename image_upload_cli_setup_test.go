package main

import (
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"
)

func fakePicGoCLIConfig(t *testing.T) string {
	t.Helper()
	path := filepath.Join(t.TempDir(), "config.json")
	if err := os.WriteFile(path, []byte(`{"picBed":{"uploader":"github"}}`), 0600); err != nil {
		t.Fatal(err)
	}
	return path
}

func TestPicGoCLIUploadTestConsentBindingAndExpiry(t *testing.T) {
	app := testApp(t)
	path := fakePicGoCLI(t, `const fs=require('fs');const a=process.argv.slice(2);if(a.length!==4||a[0]!=='--config'||a[2]!=='upload')process.exit(2);const d=fs.readFileSync(a[3]);if(d.length!==68||d[0]!==137)process.exit(3);console.log('[PicGo SUCCESS]:\nhttps://example.org/test.png');`)
	config := fakePicGoCLIConfig(t)
	if _, err := app.TestPicGoCLIUpload(path, config, false); err == nil {
		t.Fatal("missing consent accepted")
	}
	if app.picGoCLIUploadVerified(path, config) {
		t.Fatal("unverified config accepted")
	}
	if _, err := app.TestPicGoCLIUpload(path, config, true); err != nil {
		t.Fatal(err)
	}
	if !app.picGoCLIUploadVerified(path, config) {
		t.Fatal("successful test not remembered")
	}
	if app.picGoCLIUploadVerified(path, fakePicGoCLIConfig(t)) {
		t.Fatal("different config accepted")
	}
	app.picGoCLIVerifiedAt = time.Now().Add(-11 * time.Minute)
	if app.picGoCLIUploadVerified(path, config) {
		t.Fatal("expired verification accepted")
	}
	app.picGoCLIVerifiedAt = time.Now()
	if err := os.WriteFile(config, []byte(`{"changed":true}`), 0600); err != nil {
		t.Fatal(err)
	}
	if app.picGoCLIUploadVerified(path, config) {
		t.Fatal("edited config accepted")
	}
}

func TestPicGoCLIZeroExitErrorDoesNotVerifyOrExposeSecrets(t *testing.T) {
	for _, stream := range []string{"log", "error"} {
		app := testApp(t)
		path := fakePicGoCLI(t, `console.`+stream+`('[PicGo ERROR]: Please login token=TOP_SECRET');`)
		config := fakePicGoCLIConfig(t)
		if _, err := app.TestPicGoCLIUpload(path, config, true); err == nil || err.Error() != "PICGO_CLI_AUTH_REQUIRED" {
			t.Fatalf("unsafe error %v", err)
		}
		if app.picGoCLIUploadVerified(path, config) {
			t.Fatal("error enabled uploads")
		}
		data, _ := os.ReadFile(config)
		if string(data) != `{"picBed":{"uploader":"github"}}` {
			t.Fatal("existing config changed")
		}
	}
}

func TestPicGoCLILoginUsesSeparateProfileAndCLIOnly(t *testing.T) {
	app := testApp(t)
	path := fakePicGoCLI(t, `const fs=require('fs');const a=process.argv.slice(2);if(a[0]!=='--config'||!a[1].includes('picgo-cli-profiles'))process.exit(2);if(a[2]==='login'){const c=JSON.parse(fs.readFileSync(a[1]));if(c.picBed.uploader!=='picgo-cloud')process.exit(3);c.settings.picgoCloud.token='test-secret';fs.writeFileSync(a[1],JSON.stringify(c));}else if(a.join(' ').includes('cloud auth status --format json'))console.log(JSON.stringify({status:'logged_in',loggedIn:true}));else process.exit(4);`)
	if _, err := app.LoginPicGoCLI(path, false); err == nil {
		t.Fatal("login without confirmation")
	}
	profile, err := app.LoginPicGoCLI(path, true)
	if err != nil {
		t.Fatal(err)
	}
	if !strings.HasPrefix(profile, filepath.Join(filepath.Dir(app.preferencePath()), "picgo-cli-profiles")) {
		t.Fatal("wrong profile location")
	}
	data, err := os.ReadFile(profile)
	if err != nil || !strings.Contains(string(data), "test-secret") {
		t.Fatal("CLI credentials not retained")
	}
	settings, err := app.GetImageUploadSettings()
	if err != nil || settings.Mode == imageUploadModePicGoCLI || settings.CLIConfigPath != "" {
		t.Fatal("login silently enabled settings")
	}
	if app.picGoCLIUploadVerified(path, profile) {
		t.Fatal("login counted as upload verification")
	}
}

func TestPicGoCLIConfigRejectsInvalidPaths(t *testing.T) {
	for _, path := range []string{"relative.json", "x\n.json", t.TempDir(), filepath.Join(t.TempDir(), "missing.json")} {
		if _, err := picGoCLIConfigArgs(path); err == nil {
			t.Fatalf("accepted %q", path)
		}
	}
}

func TestPicGoCLIInstalledCoreRejectsUnconfiguredHost(t *testing.T) {
	// No credentials/network: the official Cloud uploader rejects its empty
	// local token before making upload requests. All files stay in t.TempDir.
	entry, err := filepath.Abs(filepath.Join("packaging", "picgo", "node_modules", "picgo", "bin", "picgo"))
	if err != nil {
		t.Fatal(err)
	}
	if _, err := os.Stat(entry); err != nil {
		t.Skip("optional local PicGo package not installed")
	}
	config := fakePicGoCLIConfig(t)
	if err := os.WriteFile(config, []byte(`{"picBed":{"uploader":"picgo-cloud","current":"picgo-cloud"}}`), 0600); err != nil {
		t.Fatal(err)
	}
	app := testApp(t)
	if _, err := app.TestPicGoCLIUpload(entry, config, true); err == nil || err.Error() != "PICGO_CLI_AUTH_REQUIRED" {
		t.Fatalf("expected actionable login error, got %v", err)
	}
	if app.picGoCLIUploadVerified(entry, config) {
		t.Fatal("unconfigured official CLI enabled")
	}
}
