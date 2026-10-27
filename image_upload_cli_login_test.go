package main

import (
	"context"
	"encoding/json"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"
)

func authorizedPicGoProfile(t *testing.T, a *App) string {
	t.Helper()
	path, err := a.newPicGoLoginProfile()
	if err != nil {
		t.Fatal(err)
	}
	data, _ := os.ReadFile(path)
	var cfg map[string]interface{}
	if err := json.Unmarshal(data, &cfg); err != nil {
		t.Fatal(err)
	}
	cfg["settings"].(map[string]interface{})["picgoCloud"].(map[string]interface{})["token"] = "SYNTHETIC_TOKEN"
	data, _ = json.Marshal(cfg)
	if err := os.WriteFile(path, data, 0600); err != nil {
		t.Fatal(err)
	}
	return path
}

func TestPicGoLoginRecoversAuthorizedProfileInsteadOfNewerPendingAttempt(t *testing.T) {
	a := testApp(t)
	authorized := authorizedPicGoProfile(t, a)
	pending, err := a.newPicGoLoginProfile()
	if err != nil {
		t.Fatal(err)
	}
	if _, err := a.updatePreferences(func(p *Preferences) { p.PicGoCLILoginConfigPath = pending }); err != nil {
		t.Fatal(err)
	}
	cli := fakePicGoCLI(t, `if(process.argv.includes('login'))process.exit(9);console.log(JSON.stringify({status:'logged_in',loggedIn:true}));`)
	got, err := a.LoginPicGoCLI(cli, true, "recover-old", false)
	if err != nil || got != authorized {
		t.Fatalf("failed to recover existing auth: %q %v", got, err)
	}
	entries, _ := os.ReadDir(filepath.Dir(filepath.Dir(authorized)))
	if len(entries) != 2 {
		t.Fatal("recovery started another login")
	}
	restarted := NewApp()
	restarted.preferencesOverride = a.preferencePath()
	settings, err := restarted.GetImageUploadSettings()
	if err != nil || settings.CLILoginConfigPath != authorized || settings.Mode != imageUploadModeLocal || settings.CLIConfigPath != "" {
		t.Fatalf("recovery changed upload configuration: %#v %v", settings, err)
	}
	if _, err := os.Stat(pending); err != nil {
		t.Fatal("pending profile removed")
	}
}

func TestPicGoLoginRetainsProfileOnFailedStatusAndRequiresExplicitReauthorization(t *testing.T) {
	a := testApp(t)
	profile := authorizedPicGoProfile(t, a)
	cli := fakePicGoCLI(t, `if(process.argv.includes('login'))process.exit(9);console.log(JSON.stringify({status:'error',loggedIn:false,message:'SECRET_SHOULD_NOT_ESCAPE'}));process.exitCode=3;`)
	for _, id := range []string{"check-one", "check-two"} {
		if _, err := a.LoginPicGoCLI(cli, true, id, false); err == nil || err.Error() != "PICGO_CLI_AUTH_CHECK_FAILED" {
			t.Fatalf("unsafe or wrong error: %v", err)
		}
	}
	entries, _ := os.ReadDir(filepath.Dir(filepath.Dir(profile)))
	if len(entries) != 1 {
		t.Fatal("status failure started a new login")
	}
	if valid, token := a.picGoLoginProfile(profile); !valid || !token {
		t.Fatal("lost credentials after status failure")
	}
	cli = fakePicGoCLI(t, `const fs=require('fs');const c=process.argv[3];if(process.argv.includes('login')){const v=JSON.parse(fs.readFileSync(c));v.settings.picgoCloud.token='NEW_SYNTHETIC_TOKEN';fs.writeFileSync(c,JSON.stringify(v));}else console.log(JSON.stringify({status:'logged_in',loggedIn:true}));`)
	newProfile, err := a.LoginPicGoCLI(cli, true, "explicit-new", true)
	if err != nil || newProfile == profile {
		t.Fatalf("explicit reauthorization: %q %v", newProfile, err)
	}
	if valid, token := a.picGoLoginProfile(profile); !valid || !token {
		t.Fatal("reauthorization changed old profile")
	}
}

func TestPicGoLoginFinishesWhenCallbackSavedButCLIStaysAlive(t *testing.T) {
	a := testApp(t)
	cli := fakePicGoCLI(t, `const fs=require('fs');if(process.argv.includes('login')){const f=process.argv[3],c=JSON.parse(fs.readFileSync(f));c.settings.picgoCloud.token='SYNTHETIC_TOKEN';fs.writeFileSync(f,JSON.stringify(c));setInterval(()=>{},1000);}else console.log(JSON.stringify({status:'logged_in',loggedIn:true}));`)
	start := time.Now()
	profile, err := a.LoginPicGoCLI(cli, true, "callback-hang", false)
	if err != nil {
		t.Fatal(err)
	}
	if time.Since(start) > 8*time.Second {
		t.Fatal("waited for login process instead of verifying saved callback")
	}
	if valid, token := a.picGoLoginProfile(profile); !valid || !token {
		t.Fatal("callback not retained")
	}
	prefs, _ := a.readPreferences()
	if prefs.PicGoCLIConfigPath != "" || normaliseImageUploadMode(prefs.ImageUploadMode) != imageUploadModeLocal {
		t.Fatal("login enabled upload")
	}
}

func TestPicGoLoginCancellationOwnsOnlyMatchingOperationAndKeepsProfile(t *testing.T) {
	a := testApp(t)
	cli := fakePicGoCLI(t, `setInterval(()=>{},1000);`)
	done := make(chan error, 1)
	go func() { _, err := a.LoginPicGoCLI(cli, true, "cancel-owner", false); done <- err }()
	deadline := time.Now().Add(5 * time.Second)
	var profile string
	for time.Now().Before(deadline) {
		prefs, _ := a.readPreferences()
		profile = prefs.PicGoCLILoginConfigPath
		if profile != "" {
			break
		}
		time.Sleep(10 * time.Millisecond)
	}
	if profile == "" {
		a.CancelPicGoCLILogin("cancel-owner")
		t.Fatal("login did not persist pending profile")
	}
	a.CancelPicGoCLILogin("stale-other")
	select {
	case err := <-done:
		t.Fatalf("stale cancel stopped current operation: %v", err)
	case <-time.After(50 * time.Millisecond):
	}
	a.CancelPicGoCLILogin("cancel-owner")
	select {
	case err := <-done:
		if err == nil || err.Error() != "PICGO_CLI_LOGIN_CANCELLED" {
			t.Fatalf("cancel: %v", err)
		}
	case <-time.After(5 * time.Second):
		t.Fatal("cancel did not release operation")
	}
	if valid, _ := a.picGoLoginProfile(profile); !valid {
		t.Fatal("cancel removed profile")
	}
	if a.recoverPicGoLoginProfile() != profile {
		t.Fatal("pending profile cannot be recovered")
	}
	a.CancelPicGoCLILogin("cancel-before-start")
	if _, err := a.LoginPicGoCLI(cli, true, "cancel-before-start", false); err == nil || err.Error() != "PICGO_CLI_LOGIN_CANCELLED" {
		t.Fatalf("early cancel lost: %v", err)
	}
}

func TestPicGoLoginRecoveryDoesNotReadForeignOrMalformedProfiles(t *testing.T) {
	a, other := testApp(t), testApp(t)
	foreign := authorizedPicGoProfile(t, other)
	if _, err := a.updatePreferences(func(p *Preferences) { p.PicGoCLILoginConfigPath = foreign }); err != nil {
		t.Fatal(err)
	}
	if got := a.recoverPicGoLoginProfile(); got != "" {
		t.Fatal("accepted foreign credentials")
	}
	malformed, err := a.newPicGoLoginProfile()
	if err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(malformed, []byte(strings.Repeat("x", 100)), 0600); err != nil {
		t.Fatal(err)
	}
	if _, err := a.updatePreferences(func(p *Preferences) { p.PicGoCLILoginConfigPath = malformed }); err != nil {
		t.Fatal(err)
	}
	if got := a.recoverPicGoLoginProfile(); got != "" {
		t.Fatal("accepted malformed profile")
	}
}

func TestPicGoLoginTimeoutKeepsPendingProfileAndDoesNotClaimSuccess(t *testing.T) {
	a := testApp(t)
	profile, err := a.newPicGoLoginProfile()
	if err != nil {
		t.Fatal(err)
	}
	cli := fakePicGoCLI(t, `setInterval(()=>{},1000);`)
	err = a.waitForPicGoLogin(context.Background(), cli, profile, 80*time.Millisecond)
	if err == nil || err.Error() != "PICGO_CLI_LOGIN_TIMEOUT" {
		t.Fatalf("timeout: %v", err)
	}
	if valid, token := a.picGoLoginProfile(profile); !valid || token {
		t.Fatal("timeout changed profile")
	}
}
