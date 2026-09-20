package main

import (
	"encoding/json"
	"errors"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"
)

func TestSendAppErrorLogContainsOnlyApprovedSoftwareFields(t *testing.T) {
	received := make(chan map[string]any, 1)
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		var event map[string]any
		if err := json.NewDecoder(r.Body).Decode(&event); err != nil {
			t.Fatal(err)
		}
		received <- event
		w.WriteHeader(http.StatusAccepted)
	}))
	defer server.Close()

	if !sendAppErrorLog(server.URL, "save: permission denied", server.Client()) {
		t.Fatal("软件错误日志发送失败")
	}
	event := <-received
	for _, field := range []string{"eventId", "sentAt", "errorLog", "os", "appVersion"} {
		value, ok := event[field].(string)
		if !ok || strings.TrimSpace(value) == "" {
			t.Fatalf("缺少字段 %s：%+v", field, event)
		}
	}
	if len(event) != 5 {
		t.Fatalf("错误日志包含未获准字段：%+v", event)
	}
	if _, err := time.Parse(time.RFC3339, event["sentAt"].(string)); err != nil {
		t.Fatalf("事件时间格式不正确：%v", err)
	}
}

func TestSendDailyActiveContainsOnlyApprovedAnonymousFields(t *testing.T) {
	received := make(chan map[string]any, 1)
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		var event map[string]any
		if err := json.NewDecoder(r.Body).Decode(&event); err != nil {
			t.Fatal(err)
		}
		received <- event
		w.WriteHeader(http.StatusAccepted)
	}))
	defer server.Close()

	if !sendAppStartup(server.URL, "anonymous-install-00000001", server.Client()) {
		t.Fatal("每日匿名活跃记录发送失败")
	}
	event := <-received
	for _, field := range []string{"eventId", "sentAt", "installId", "version", "os", "arch"} {
		value, ok := event[field].(string)
		if !ok || strings.TrimSpace(value) == "" {
			t.Fatalf("缺少字段 %s：%+v", field, event)
		}
	}
	if len(event) != 6 {
		t.Fatalf("每日活跃记录包含无关字段：%+v", event)
	}
}

func TestDailyActiveIgnoresErrorReportingOptOutAndRunsOncePerDay(t *testing.T) {
	app := NewApp()
	app.preferencesOverride = filepath.Join(t.TempDir(), "preferences.json")
	if _, err := app.SetUsageAnalytics(false); err != nil {
		t.Fatal(err)
	}
	now := time.Date(2026, 8, 18, 12, 0, 0, 0, time.UTC)
	calls := 0
	var installID string
	sender := func(value string) bool {
		calls++
		installID = value
		return true
	}
	if !app.reportDailyActive(now, sender) {
		t.Fatal("关闭错误回传后，每日活跃仍应正常上报")
	}
	if calls != 1 || len(installID) < 16 {
		t.Fatalf("每日活跃调用或匿名标识异常：calls=%d id=%q", calls, installID)
	}
	if app.reportDailyActive(now.Add(4*time.Hour), sender) || calls != 1 {
		t.Fatal("同一 UTC 日期不应重复上报每日活跃")
	}
	prefs, err := app.readPreferences()
	if err != nil {
		t.Fatal(err)
	}
	if prefs.UsageAnalytics || prefs.AnonymousInstallID != installID || prefs.LastActiveReport != "2026-08-18" {
		t.Fatalf("每日活跃不应改变错误回传开关，且应保存去重状态：%+v", prefs)
	}
	if !app.reportDailyActive(now.Add(24*time.Hour), sender) || calls != 2 {
		t.Fatal("下一 UTC 日期应再次上报一次活跃")
	}
}

func TestImprovementProgramPersistsOptOut(t *testing.T) {
	app := NewApp()
	app.preferencesOverride = filepath.Join(t.TempDir(), "preferences.json")
	prefs, err := app.SetUsageAnalytics(false)
	if err != nil {
		t.Fatal(err)
	}
	if prefs.UsageAnalytics {
		t.Fatal("关闭产品改进计划后仍处于启用状态")
	}
	data, err := os.ReadFile(app.preferencesOverride)
	if err != nil {
		t.Fatal(err)
	}
	if strings.Contains(string(data), "anonymousInstallId") {
		t.Fatal("偏好文件不应继续保存匿名安装标识")
	}
}

func TestErrorReportingNeverBlocksAndHonoursOptOut(t *testing.T) {
	app := NewApp()
	app.preferencesOverride = filepath.Join(t.TempDir(), "preferences.json")
	if _, err := app.SetUsageAnalytics(true); err != nil {
		t.Fatal(err)
	}
	started := make(chan struct{})
	release := make(chan struct{})
	start := time.Now()
	app.reportErrorLogInBackground("save", "permission denied", "", func(string) {
		close(started)
		<-release
	})
	if elapsed := time.Since(start); elapsed > 50*time.Millisecond {
		t.Fatalf("错误上报阻塞了软件功能：%s", elapsed)
	}
	select {
	case <-started:
	case <-time.After(time.Second):
		t.Fatal("后台错误上报没有启动")
	}
	close(release)

	if _, err := app.SetUsageAnalytics(false); err != nil {
		t.Fatal(err)
	}
	called := make(chan struct{}, 1)
	app.reportErrorLogInBackground("save", "permission denied", "", func(string) { called <- struct{}{} })
	select {
	case <-called:
		t.Fatal("退出产品改进计划后不应上报")
	case <-time.After(100 * time.Millisecond):
	}
}

func TestMissingRecentDocumentIsNotReportedAsSoftwareError(t *testing.T) {
	app := NewApp()
	app.preferencesOverride = filepath.Join(t.TempDir(), "preferences.json")
	if _, err := app.SetUsageAnalytics(true); err != nil {
		t.Fatal(err)
	}
	called := make(chan struct{}, 1)
	app.reportErrorLogInBackground(
		"document.open-recent",
		"open /Users/demo/Downloads/note.md: no such file or directory",
		"",
		func(string) { called <- struct{}{} },
	)
	select {
	case <-called:
		t.Fatal("已移动或删除的最近文档不应作为软件异常上报")
	case <-time.After(100 * time.Millisecond):
	}

	if isExpectedMissingDocumentError("document.save", "no such file or directory") {
		t.Fatal("保存等真正异常不应被缺失文档过滤器忽略")
	}
}

func TestErrorLogRemovesLocalPaths(t *testing.T) {
	log := buildSanitizedErrorLog("open", `failed at C:\Users\someone\secret\document.md and private-notes.md`, `/home/someone/private/document.md:12`)
	if strings.Contains(log, "document.md") || strings.Contains(log, "private-notes.md") || strings.Contains(log, "someone") {
		t.Fatalf("错误日志仍包含本地路径：%q", log)
	}
}

func TestErrorLogRemovesProviderCredentials(t *testing.T) {
	secrets := []string{
		"sk-exampleSecret123456",
		"github_pat_exampleSecret1234567890",
		"eyJexampleHeader.eyJexamplePayload.exampleSignature",
		"plain-provider-key-987654321",
		"query-secret-123456789",
		"oauth-client-secret-123456789",
		"oauth-refresh-token-123456789",
		"url-encoded-secret%2F123456789",
		"P@ssw0rd!#$-with-symbols",
	}
	log := buildSanitizedErrorLog(
		"ai.summary",
		"HTTP 401: api key: "+secrets[0]+" authorization=Bearer "+secrets[2]+
			" endpoint=https://provider.invalid/v1?key="+secrets[4]+" client_secret="+secrets[5],
		"access_token="+secrets[3]+" refresh_token="+secrets[6]+
			" client_secret%3D"+secrets[7]+" password="+secrets[8]+" github="+secrets[1],
	)
	for _, secret := range secrets {
		if strings.Contains(log, secret) {
			t.Fatalf("错误日志仍包含凭据 %q：%q", secret, log)
		}
	}
	if !strings.Contains(log, "[已隐藏]") {
		t.Fatalf("错误日志没有保留脱敏标记：%q", log)
	}
}

func TestErrorReportingSilentlyHandlesOfflineNetwork(t *testing.T) {
	client := &http.Client{Transport: failingRoundTripper{}}
	if sendAppErrorLog("https://telemetry.invalid/error", "render: failure", client) {
		t.Fatal("断网时错误日志请求不应报告成功")
	}
}

func TestErrorReportingSilentlyRecoversUnexpectedFailure(t *testing.T) {
	app := NewApp()
	app.preferencesOverride = filepath.Join(t.TempDir(), "preferences.json")
	if _, err := app.SetUsageAnalytics(true); err != nil {
		t.Fatal(err)
	}
	finished := make(chan struct{})
	app.reportErrorLogInBackground("render", "failure", "", func(string) {
		defer close(finished)
		panic("模拟错误上报组件异常")
	})
	select {
	case <-finished:
	case <-time.After(time.Second):
		t.Fatal("异常上报任务没有静默结束")
	}
}

type failingRoundTripper struct{}

func (failingRoundTripper) RoundTrip(*http.Request) (*http.Response, error) {
	return nil, errors.New("模拟内网或断网")
}
