package main

import (
	"fmt"
	"io"
	"net/http"
	"runtime"
	"strings"
	"testing"
	"time"
)

func TestUpdateSummariesAreLocalizedBoundedAndIndependentOfLatestAssets(t *testing.T) {
	if !validUpdateNotesVersion("99.0.1+build-1") || validUpdateNotesVersion("99.0.1-rc1+build-1") {
		t.Fatal("stable build metadata was confused with a pre-release")
	}
	app := &App{language: "en"}
	input := officialRelease{Version: "99.0.20", SummaryZH: "新增文档包编辑。", SummaryEN: "Package editing\n and saving.", NotesZH: "完整中文日志", NotesEN: "Full English notes", UpdateCount: 20, UpdatesTruncated: true,
		Assets: []officialReleaseAsset{{FileName: "latest.bin", URL: "/api/v1/releases/99.0.20/assets/windows/update", SHA256: "latest-sha"}}}
	for i := 1; i <= 20; i++ {
		input.Updates = append(input.Updates, UpdateReleaseNotes{Version: fmt.Sprintf("99.0.%d", i), SummaryZH: strings.Repeat("字", 200), NotesEN: strings.Repeat("x", 33000)})
	}
	input.Updates = append(input.Updates, UpdateReleaseNotes{Version: appVersion}, UpdateReleaseNotes{Version: "100.0.0"}, UpdateReleaseNotes{Version: "99.0.9-rc1"}, UpdateReleaseNotes{Version: "invalid"}, input.Updates[0])
	mapped, err := app.mapOfficialRelease(input)
	if err != nil {
		t.Fatal(err)
	}
	if mapped.Summary != "Package editing and saving." || mapped.SummaryZH != input.SummaryZH {
		t.Fatalf("localized summary: %+v", mapped)
	}
	if len(mapped.Updates) != 12 || mapped.Updates[0].Version != "99.0.20" || mapped.Updates[11].Version != "99.0.9" || mapped.UpdateCount != 20 || !mapped.UpdatesTruncated {
		t.Fatalf("bounded ordered history: %+v", mapped)
	}
	if len([]rune(mapped.Updates[0].SummaryZH)) != 160 || len(mapped.Updates[0].NotesEN) != 5000 || !mapped.Updates[0].NotesTruncated {
		t.Fatal("history copy is unbounded")
	}
	if len(mapped.Assets) != 1 || mapped.Assets[0].Name != "latest.bin" || mapped.Assets[0].Digest != "sha256:latest-sha" {
		t.Fatal("history changed latest installer selection")
	}
	legacy, err := app.mapOfficialRelease(officialRelease{Version: "99.0.20", NotesEN: "Legacy notes"})
	if err != nil || legacy.Summary != "" || len(legacy.Updates) != 0 || legacy.UpdateCount != 0 {
		t.Fatal("legacy fields guessed unavailable summaries/history")
	}
}

type updateSummaryTransport func(*http.Request) (*http.Response, error)

func (f updateSummaryTransport) RoundTrip(r *http.Request) (*http.Response, error) { return f(r) }

func TestSevenDayUpdateSnoozeStillChecksSafetyAndManualCheckBypasses(t *testing.T) {
	oldSafety, oldTransport := windowsUninstallerSafetyCheck, http.DefaultTransport
	calls, requests := 0, 0
	windowsUninstallerSafetyCheck = func() bool { calls++; return false }
	http.DefaultTransport = updateSummaryTransport(func(r *http.Request) (*http.Response, error) {
		requests++
		if r.URL.Host != "qm.ssssa.cn" || r.URL.Query().Get("currentVersion") != appVersion {
			t.Fatal("update request left official catalog or lost installed version")
		}
		return &http.Response{StatusCode: 200, Header: make(http.Header), Body: io.NopCloser(strings.NewReader(`{"version":"99.0.0","summaryZh":"更新摘要","summaryEn":"Update summary","notesZh":"说明","notesEn":"Notes"}`))}, nil
	})
	t.Cleanup(func() { windowsUninstallerSafetyCheck = oldSafety; http.DefaultTransport = oldTransport })
	app := testApp(t)
	if err := app.SnoozeUpdates(7); err != nil {
		t.Fatal(err)
	}
	prefs, err := app.GetPreferences()
	if err != nil {
		t.Fatal(err)
	}
	until, err := time.Parse(time.RFC3339, prefs.SuppressUpdateUntil)
	if err != nil || until.Before(time.Now().Add(167*time.Hour)) || until.After(time.Now().Add(169*time.Hour)) {
		t.Fatal("seven-day window not persisted")
	}
	info, err := app.CheckForUpdates(false)
	if err != nil || !info.Suppressed || info.Checked || requests != 0 {
		t.Fatalf("automatic check bypassed snooze: %+v %v", info, err)
	}
	if runtime.GOOS == "windows" && calls != 1 {
		t.Fatal("snooze skipped silent Windows safety check")
	}
	info, err = app.CheckForUpdates(true)
	if err != nil || !info.Checked || !info.Available || info.SummaryZH != "更新摘要" || requests != 1 {
		t.Fatalf("manual check ignored or used stale summary: %+v %v", info, err)
	}
	if runtime.GOOS == "windows" && (!info.ManualInstallRequired || calls != 2) {
		t.Fatal("manual install safety was weakened")
	}
}
