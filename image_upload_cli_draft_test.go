package main

import (
	"path/filepath"
	"reflect"
	"testing"
)

func TestPicGoCLIDraftSurvivesRestartWithoutChangingActiveSettings(t *testing.T) {
	a := testApp(t)
	before, err := a.updatePreferences(func(p *Preferences) {
		p.ImageUploadMode = imageUploadModePicGoCLI
		p.PicGoCLIPath = "active-cli"
		p.PicGoCLIConfigPath = "active-config"
		p.PicGoCLIAllowHTTP = false
	})
	if err != nil {
		t.Fatal(err)
	}
	before, err = a.readPreferences()
	if err != nil {
		t.Fatal(err)
	}
	draft := PicGoCLIDraft{CLIPath: filepath.Join(t.TempDir(), "missing-cli"), CLIConfigPath: filepath.Join(t.TempDir(), "missing.json"), CLIAllowHTTP: true}
	if got, err := a.SavePicGoCLIDraft(draft); err != nil || got != draft {
		t.Fatal(got, err)
	}
	restarted := NewApp()
	restarted.preferencesOverride = a.preferencePath()
	after, err := restarted.readPreferences()
	if err != nil {
		t.Fatal(err)
	}
	if after.PicGoCLIDraft == nil || *after.PicGoCLIDraft != draft {
		t.Fatal("draft lost")
	}
	after.PicGoCLIDraft = nil
	if !reflect.DeepEqual(before, after) {
		t.Fatal("draft changed active preferences")
	}
	settings, err := restarted.GetImageUploadSettings()
	if err != nil || settings.CLIDraft == nil || !settings.CLIDraft.CLIAllowHTTP || settings.CLIAllowHTTP {
		t.Fatal("draft leaked into active settings", err)
	}
}

func TestPicGoCLIDraftCannotBypassVerification(t *testing.T) {
	a := testApp(t)
	cli := fakePicGoCLI(t, `console.log('[PicGo SUCCESS]:\nhttps://example.org/test.png');`)
	config := fakePicGoCLIConfig(t)
	draft := PicGoCLIDraft{CLIPath: cli, CLIConfigPath: config, CLIAllowHTTP: true}
	if _, err := a.SavePicGoCLIDraft(draft); err != nil {
		t.Fatal(err)
	}
	input := ImageUploadSettingsInput{Mode: imageUploadModePicGoCLI, CLIPath: cli, CLIConfigPath: config, CLIAllowHTTP: true}
	if _, err := a.SetImageUploadSettings(input); err == nil {
		t.Fatal("draft enabled without verification")
	}
	if _, err := a.TestPicGoCLIUpload(cli, config, true, false); err != nil {
		t.Fatal(err)
	}
	if _, err := a.SetImageUploadSettings(input); err == nil {
		t.Fatal("verification transferred to HTTP draft")
	}
	if _, err := a.TestPicGoCLIUpload(cli, config, true, true); err != nil {
		t.Fatal(err)
	}
	got, err := a.SetImageUploadSettings(input)
	if err != nil || got.CLIDraft != nil || !got.CLIAllowHTTP {
		t.Fatal("verified enable did not clear draft", err)
	}
	prefs, _ := a.readPreferences()
	if prefs.PicGoCLIDraft != nil {
		t.Fatal("draft remains after enabling")
	}
}

func TestPicGoCLIDraftRejectsInvalidPathsWithoutOverwritingDraft(t *testing.T) {
	a := testApp(t)
	draft := PicGoCLIDraft{CLIAllowHTTP: true}
	if _, err := a.SavePicGoCLIDraft(draft); err != nil {
		t.Fatal(err)
	}
	for _, bad := range []PicGoCLIDraft{{CLIPath: "relative"}, {CLIConfigPath: "x\nsecret"}, {CLIPath: "x\x00"}} {
		if _, err := a.SavePicGoCLIDraft(bad); err == nil {
			t.Fatal("invalid draft accepted")
		}
	}
	prefs, _ := a.readPreferences()
	if prefs.PicGoCLIDraft == nil || *prefs.PicGoCLIDraft != draft {
		t.Fatal("invalid write lost draft")
	}
}
