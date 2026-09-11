package main

import (
	"strings"
	"testing"
)

func TestMapOfficialReleaseUsesLanguageAndAbsoluteAssetURL(t *testing.T) {
	app := &App{language: "zh-CN"}
	release, err := app.mapOfficialRelease(officialRelease{
		Version:     "2.5.0",
		TitleZH:     "轻阅 Markdown 2.5.0",
		TitleEN:     "Quillite Markdown 2.5.0",
		NotesZH:     "中文更新日志",
		NotesEN:     "English release notes",
		PublishedAt: "2026-08-18T08:00:00Z",
		Assets: []officialReleaseAsset{{
			FileName: "quillite-markdown-2.5.0-windows-amd64.bin",
			SHA256:   "abc123",
			URL:      "/api/v1/releases/2.5.0/assets/windows/update",
		}},
	})
	if err != nil {
		t.Fatal(err)
	}
	if release.TagName != "v2.5.0" || release.Name != "轻阅 Markdown 2.5.0" || release.Body != "中文更新日志" {
		t.Fatalf("官网版本映射不正确：%+v", release)
	}
	if len(release.Assets) != 1 || release.Assets[0].BrowserDownloadURL != officialWebsiteBase+"/api/v1/releases/2.5.0/assets/windows/update" {
		t.Fatalf("官网安装包地址映射不正确：%+v", release.Assets)
	}
	if release.Assets[0].Digest != "sha256:abc123" {
		t.Fatalf("官网安装包摘要映射不正确：%q", release.Assets[0].Digest)
	}
	if release.HTMLURL != officialDownloadPage {
		t.Fatalf("更新下载页必须固定指向官网：%q", release.HTMLURL)
	}
}

func TestMapOfficialReleaseRejectsExternalAssets(t *testing.T) {
	app := &App{language: "zh-CN"}
	release, err := app.mapOfficialRelease(officialRelease{Version: "2.5.0", NotesZH: "更新", Assets: []officialReleaseAsset{{FileName: "bad.bin", SHA256: "abc", URL: "https://github.com/example/bad.bin"}}})
	if err != nil {
		t.Fatal(err)
	}
	if len(release.Assets) != 0 {
		t.Fatalf("不应接受官网以外的更新文件：%+v", release.Assets)
	}
}

func TestMapOfficialReleaseUsesEnglishCopy(t *testing.T) {
	app := &App{language: "en"}
	release, err := app.mapOfficialRelease(officialRelease{Version: "2.5.0", TitleEN: "English title", NotesEN: "English notes"})
	if err != nil {
		t.Fatal(err)
	}
	if release.Name != "English title" || release.Body != "English notes" {
		t.Fatalf("英文版本说明未生效：%+v", release)
	}
}

func TestOnlyQMSubdomainIsAcceptedForOfficialDownloads(t *testing.T) {
	if !isOfficialWebsiteURL("https://qm.ssssa.cn/api/v1/releases/2.5.0/assets/windows/update") {
		t.Fatal("qm.ssssa.cn 必须是允许的官网更新域名")
	}
	apexHost := strings.TrimPrefix(officialWebsiteBase, "https://qm.")
	for _, value := range []string{
		"https://" + apexHost + "/api/v1/releases/2.5.0/assets/windows/update",
		"https://www." + apexHost + "/api/v1/releases/2.5.0/assets/windows/update",
		"https://qm.ssssa.cn.example.com/update.bin",
		"http://qm.ssssa.cn/update.bin",
	} {
		if isOfficialWebsiteURL(value) {
			t.Fatalf("不应接受非指定二级域名或非 HTTPS 地址：%s", value)
		}
	}
}

func TestLegacyMacUpdateRequiresOneManualInstall(t *testing.T) {
	if !requiresManualMacUpdateMigration("darwin", "2.5.0", "2.5.1") {
		t.Fatal("macOS 2.5.0 must be routed to the one-time DMG migration")
	}
	for _, test := range []struct {
		goos, current, latest string
	}{
		{"windows", "2.5.0", "2.5.1"},
		{"darwin", "2.5.1", "2.5.2"},
		{"darwin", "2.5.0", "2.5.0"},
	} {
		if requiresManualMacUpdateMigration(test.goos, test.current, test.latest) {
			t.Fatalf("unexpected manual migration for %s %s -> %s", test.goos, test.current, test.latest)
		}
	}
}

func TestUnsafeWindowsUninstallerRequiresFullInstallation(t *testing.T) {
	if got := requiredManualInstallReason("windows", "2.7.3", "2.7.4", false); got != manualInstallReasonWindowsUnsafeUninstaller {
		t.Fatalf("unsafe Windows uninstaller reason = %q", got)
	}
	// The repair prompt must still appear after a legacy client has already
	// replaced its application binary and current/latest versions are equal.
	if got := requiredManualInstallReason("windows", "2.7.4", "2.7.4", false); got != manualInstallReasonWindowsUnsafeUninstaller {
		t.Fatalf("same-version Windows repair reason = %q", got)
	}
	for _, test := range []struct {
		goos, current, latest string
		safe                  bool
	}{
		{"windows", "2.7.3", "2.7.4", true},
		{"linux", "2.7.3", "2.7.4", false},
	} {
		if got := requiredManualInstallReason(test.goos, test.current, test.latest, test.safe); got != "" {
			t.Fatalf("unexpected manual install reason %q for %+v", got, test)
		}
	}
}

func TestWindowsInstallSafetyStatusSupportsStandaloneStartupWarning(t *testing.T) {
	unsafe := windowsInstallSafetyForPlatform("windows", false)
	if !unsafe.Applicable || unsafe.Safe {
		t.Fatalf("unsafe Windows status = %#v", unsafe)
	}
	if unsafe.CurrentVersion != appVersion || unsafe.DownloadURL != officialDownloadPage {
		t.Fatalf("unsafe Windows guidance is incomplete: %#v", unsafe)
	}

	safe := windowsInstallSafetyForPlatform("windows", true)
	if !safe.Applicable || !safe.Safe {
		t.Fatalf("safe Windows status = %#v", safe)
	}
	nonWindows := windowsInstallSafetyForPlatform("darwin", false)
	if nonWindows.Applicable || !nonWindows.Safe {
		t.Fatalf("non-Windows status must not trigger the warning: %#v", nonWindows)
	}
}

func TestManualInstallationUsesOfficialFullInstaller(t *testing.T) {
	assets := []updateReleaseAsset{
		{Name: "quillite-markdown-2.7.4-windows-amd64.bin", BrowserDownloadURL: officialWebsiteBase + "/api/v1/releases/2.7.4/assets/windows/update"},
		{Name: "quillite-markdown-2.7.4-windows-amd64.exe", BrowserDownloadURL: officialWebsiteBase + "/api/v1/releases/2.7.4/assets/windows/installer"},
		{Name: "quillite-markdown-2.7.4-macos-universal.dmg", BrowserDownloadURL: officialWebsiteBase + "/api/v1/releases/2.7.4/assets/macos/installer"},
		{Name: "quillite-markdown-2.7.4-windows-amd64.exe", BrowserDownloadURL: "https://example.com/untrusted.exe"},
	}
	if got := fullInstallerURLForPlatform(assets, "windows"); got != officialWebsiteBase+"/api/v1/releases/2.7.4/assets/windows/installer" {
		t.Fatalf("Windows full installer URL = %q", got)
	}
	if got := fullInstallerURLForPlatform(assets, "darwin"); got != officialWebsiteBase+"/api/v1/releases/2.7.4/assets/macos/installer" {
		t.Fatalf("macOS full installer URL = %q", got)
	}
	if got := fullInstallerURLForPlatform(assets, "linux"); got != "" {
		t.Fatalf("Linux must not receive a manual installer URL: %q", got)
	}
}
