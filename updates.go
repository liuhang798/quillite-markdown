package main

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"net/url"
	"path/filepath"
	"runtime"
	"strconv"
	"strings"
	"time"
)

const (
	officialWebsiteBase      = "https://qm.ssssa.cn"
	officialLatestReleaseAPI = officialWebsiteBase + "/api/v1/releases/latest"
	officialDownloadPage     = officialWebsiteBase + "/#download"
)

var windowsUninstallerSafetyCheck = prepareWindowsUninstallerForUpdate

type UpdateInfo struct {
	Checked               bool   `json:"checked"`
	Suppressed            bool   `json:"suppressed"`
	Available             bool   `json:"available"`
	ManualInstallRequired bool   `json:"manualInstallRequired"`
	ManualInstallReason   string `json:"manualInstallReason"`
	ManualInstallerURL    string `json:"manualInstallerUrl"`
	CurrentVersion        string `json:"currentVersion"`
	LatestVersion         string `json:"latestVersion"`
	ReleaseName           string `json:"releaseName"`
	ReleaseNotes          string `json:"releaseNotes"`
	ReleaseURL            string `json:"releaseUrl"`
	PublishedAt           string `json:"publishedAt"`
}

// WindowsInstallSafety describes whether the current Windows installation can
// safely participate in in-app updates. Legacy uninstallers could recursively
// remove user files placed in the selected install directory, so this check is
// deliberately local and does not depend on the update service being online.
type WindowsInstallSafety struct {
	Applicable     bool   `json:"applicable"`
	Safe           bool   `json:"safe"`
	CurrentVersion string `json:"currentVersion"`
	DownloadURL    string `json:"downloadUrl"`
}

// GetWindowsInstallSafety is retained for compatibility with existing frontend
// bindings. It now reports the result after attempting silent remediation and
// does not require a standalone startup warning.
func (a *App) GetWindowsInstallSafety() WindowsInstallSafety {
	applicable := runtime.GOOS == "windows"
	safe := true
	if applicable {
		safe = windowsUninstallerSafetyCheck()
	}
	return windowsInstallSafetyForPlatform(runtime.GOOS, safe)
}

func windowsInstallSafetyForPlatform(goos string, safe bool) WindowsInstallSafety {
	applicable := goos == "windows"
	return WindowsInstallSafety{
		Applicable:     applicable,
		Safe:           !applicable || safe,
		CurrentVersion: appVersion,
		DownloadURL:    officialDownloadPage,
	}
}

type updateRelease struct {
	TagName     string               `json:"tag_name"`
	Name        string               `json:"name"`
	Body        string               `json:"body"`
	HTMLURL     string               `json:"html_url"`
	PublishedAt string               `json:"published_at"`
	Assets      []updateReleaseAsset `json:"assets"`
}

type updateReleaseAsset struct {
	Name               string `json:"name"`
	BrowserDownloadURL string `json:"browser_download_url"`
	Digest             string `json:"digest"`
}

type officialRelease struct {
	Version     string                 `json:"version"`
	TitleZH     string                 `json:"titleZh"`
	TitleEN     string                 `json:"titleEn"`
	NotesZH     string                 `json:"notesZh"`
	NotesEN     string                 `json:"notesEn"`
	PublishedAt string                 `json:"publishedAt"`
	Assets      []officialReleaseAsset `json:"assets"`
}

type officialReleaseAsset struct {
	FileName string `json:"fileName"`
	SHA256   string `json:"sha256"`
	URL      string `json:"url"`
}

// fetchLatestRelease uses the official website as the only update source.
// Source code remains on GitHub, but the desktop app never checks or downloads
// release assets from GitHub.
func (a *App) fetchLatestRelease() (*updateRelease, error) {
	return a.fetchOfficialLatestRelease()
}

func (a *App) fetchOfficialLatestRelease() (*updateRelease, error) {
	endpoint, err := url.Parse(officialLatestReleaseAPI)
	if err != nil {
		return nil, err
	}
	query := endpoint.Query()
	query.Set("source", "app")
	query.Set("currentVersion", appVersion)
	query.Set("platform", updatePlatform(runtime.GOOS))
	query.Set("arch", runtime.GOARCH)
	endpoint.RawQuery = query.Encode()
	request, err := http.NewRequestWithContext(context.Background(), http.MethodGet, endpoint.String(), nil)
	if err != nil {
		return nil, err
	}
	request.Header.Set("Accept", "application/json")
	request.Header.Set("User-Agent", "QuilliteMarkdown/"+appVersion)
	response, err := officialHTTPClient(8 * time.Second).Do(request)
	if err != nil {
		return nil, fmt.Errorf("check official release catalog: %w", err)
	}
	defer response.Body.Close()
	if response.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("official release catalog returned %s", response.Status)
	}
	var item officialRelease
	if err := json.NewDecoder(response.Body).Decode(&item); err != nil {
		return nil, fmt.Errorf("decode official release catalog: %w", err)
	}
	return a.mapOfficialRelease(item)
}

func (a *App) mapOfficialRelease(item officialRelease) (*updateRelease, error) {
	if strings.TrimSpace(item.Version) == "" {
		return nil, errors.New("official release catalog returned an empty version")
	}
	name, notes := item.TitleZH, item.NotesZH
	if a.language == "en" {
		name, notes = item.TitleEN, item.NotesEN
	}
	if strings.TrimSpace(name) == "" {
		name = item.TitleEN
	}
	if strings.TrimSpace(notes) == "" {
		notes = item.NotesEN
	}
	mapped := &updateRelease{
		TagName:     "v" + normaliseVersion(item.Version),
		Name:        strings.TrimSpace(name),
		Body:        strings.TrimSpace(notes),
		HTMLURL:     officialDownloadPage,
		PublishedAt: item.PublishedAt,
		Assets:      make([]updateReleaseAsset, 0, len(item.Assets)),
	}
	base, _ := url.Parse(officialWebsiteBase)
	for _, asset := range item.Assets {
		assetURL, err := url.Parse(strings.TrimSpace(asset.URL))
		if err != nil || assetURL.String() == "" {
			continue
		}
		resolvedURL := base.ResolveReference(assetURL).String()
		if !isOfficialWebsiteURL(resolvedURL) {
			continue
		}
		mapped.Assets = append(mapped.Assets, updateReleaseAsset{
			Name:               filepath.Base(asset.FileName),
			BrowserDownloadURL: resolvedURL,
			Digest:             "sha256:" + strings.TrimPrefix(asset.SHA256, "sha256:"),
		})
	}
	return mapped, nil
}

func updatePlatform(goos string) string {
	if goos == "darwin" {
		return "macos"
	}
	return goos
}

func isOfficialWebsiteURL(value string) bool {
	parsed, err := url.Parse(strings.TrimSpace(value))
	if err != nil || parsed.Scheme != "https" {
		return false
	}
	host := strings.ToLower(parsed.Hostname())
	return host == "qm.ssssa.cn" && parsed.User == nil && (parsed.Port() == "" || parsed.Port() == "443")
}

// CheckForUpdates checks the latest stable official release. The frontend calls
// this once at startup and may call it again when the user requests a check.
func (a *App) CheckForUpdates(force bool) (UpdateInfo, error) {
	result := UpdateInfo{CurrentVersion: appVersion}
	windowsUninstallerSafe := true
	if runtime.GOOS == "windows" {
		windowsUninstallerSafe = windowsUninstallerSafetyCheck()
	}
	// A legacy uninstaller is remediated before the update check. If remediation
	// is impossible, keep the manual installer fallback visible regardless of the
	// ordinary 30-day reminder preference.
	if !force && windowsUninstallerSafe {
		prefs, err := a.readPreferences()
		if err == nil && prefs.SuppressUpdateUntil != "" {
			if until, parseErr := time.Parse(time.RFC3339, prefs.SuppressUpdateUntil); parseErr == nil && time.Now().Before(until) {
				result.Suppressed = true
				return result, nil
			}
		}
	}
	release, err := a.fetchLatestRelease()
	if err != nil {
		return result, err
	}

	latest := normaliseVersion(release.TagName)
	manualInstallReason := requiredManualInstallReason(runtime.GOOS, appVersion, latest, windowsUninstallerSafe)
	manualInstallerURL := ""
	if manualInstallReason != "" {
		manualInstallerURL = fullInstallerURLForPlatform(release.Assets, runtime.GOOS)
	}
	result = UpdateInfo{
		Checked:               true,
		Available:             compareVersions(latest, appVersion) > 0,
		ManualInstallRequired: manualInstallReason != "",
		ManualInstallReason:   manualInstallReason,
		ManualInstallerURL:    manualInstallerURL,
		CurrentVersion:        appVersion,
		LatestVersion:         latest,
		ReleaseName:           strings.TrimSpace(release.Name),
		ReleaseNotes:          strings.TrimSpace(release.Body),
		ReleaseURL:            release.HTMLURL,
		PublishedAt:           release.PublishedAt,
	}
	if result.ReleaseName == "" {
		result.ReleaseName = "v" + latest
	}
	if !isOfficialWebsiteURL(result.ReleaseURL) {
		result.ReleaseURL = officialDownloadPage
	}

	if _, err := a.updatePreferences(func(latestPrefs *Preferences) {
		latestPrefs.LastUpdateCheck = time.Now().UTC().Format(time.RFC3339)
	}); err != nil {
		return result, err
	}
	return result, nil
}

func fullInstallerURLForPlatform(assets []updateReleaseAsset, goos string) string {
	suffix := ""
	switch goos {
	case "windows":
		suffix = "windows-amd64.exe"
	case "darwin":
		suffix = "macos-universal.dmg"
	}
	for _, asset := range assets {
		if suffix != "" && strings.HasSuffix(asset.Name, suffix) && isOfficialWebsiteURL(asset.BrowserDownloadURL) {
			return asset.BrowserDownloadURL
		}
	}
	return ""
}

const (
	manualInstallReasonMacLegacyUpdater         = "mac-legacy-updater"
	manualInstallReasonWindowsUnsafeUninstaller = "windows-unsafe-uninstaller"
)

func requiredManualInstallReason(goos, currentVersion, latestVersion string, windowsUninstallerSafe bool) string {
	if goos == "windows" && !windowsUninstallerSafe {
		return manualInstallReasonWindowsUnsafeUninstaller
	}
	if requiresManualMacUpdateMigration(goos, currentVersion, latestVersion) {
		return manualInstallReasonMacLegacyUpdater
	}
	return ""
}

// Version 2.5.0 was the last macOS build that expected a raw executable
// update. A raw binary replacement invalidates the enclosing .app signature,
// so it cannot be used as a bridge to the complete-bundle ZIP updater. Those
// users must install one DMG manually; every later version can self-update by
// atomically replacing the complete signed application bundle.
func requiresManualMacUpdateMigration(goos, currentVersion, latestVersion string) bool {
	return goos == "darwin" &&
		compareVersions(currentVersion, "2.5.0") <= 0 &&
		compareVersions(latestVersion, currentVersion) > 0
}

// SnoozeUpdates suppresses automatic prompts. Manual update checks always
// bypass this preference.
func (a *App) SnoozeUpdates(days int) error {
	if days < 1 {
		days = 1
	}
	if days > 365 {
		days = 365
	}
	_, err := a.updatePreferences(func(prefs *Preferences) {
		prefs.SuppressUpdateUntil = time.Now().Add(time.Duration(days) * 24 * time.Hour).UTC().Format(time.RFC3339)
	})
	return err
}

func normaliseVersion(version string) string {
	return strings.TrimPrefix(strings.TrimPrefix(strings.TrimSpace(version), "v"), "V")
}

func compareVersions(left, right string) int {
	parse := func(version string) []int {
		version = normaliseVersion(version)
		if index := strings.IndexAny(version, "-+"); index >= 0 {
			version = version[:index]
		}
		parts := strings.Split(version, ".")
		values := make([]int, len(parts))
		for index, part := range parts {
			value, _ := strconv.Atoi(part)
			values[index] = value
		}
		return values
	}
	leftParts, rightParts := parse(left), parse(right)
	length := len(leftParts)
	if len(rightParts) > length {
		length = len(rightParts)
	}
	for index := 0; index < length; index++ {
		leftValue, rightValue := 0, 0
		if index < len(leftParts) {
			leftValue = leftParts[index]
		}
		if index < len(rightParts) {
			rightValue = rightParts[index]
		}
		if leftValue > rightValue {
			return 1
		}
		if leftValue < rightValue {
			return -1
		}
	}
	return 0
}
