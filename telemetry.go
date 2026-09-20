package main

import (
	"bytes"
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"net/http"
	"os"
	"regexp"
	goruntime "runtime"
	"strings"
	"time"
)

const (
	appStartupEndpoint = "https://qm.ssssa.cn/api/v1/telemetry/app/startup"
	appErrorEndpoint   = "https://qm.ssssa.cn/api/v1/telemetry/app/error"
)

type appStartupEvent struct {
	EventID   string `json:"eventId"`
	SentAt    string `json:"sentAt"`
	InstallID string `json:"installId"`
	Version   string `json:"version"`
	OS        string `json:"os"`
	Arch      string `json:"arch"`
}

type appErrorEvent struct {
	EventID    string `json:"eventId"`
	SentAt     string `json:"sentAt"`
	ErrorLog   string `json:"errorLog"`
	OS         string `json:"os"`
	AppVersion string `json:"appVersion"`
}

var windowsPathPattern = regexp.MustCompile(`(?i)\b[A-Z]:[\\/][^\s\r\n"']+`)
var unixPathPattern = regexp.MustCompile(`(^|[\s"'(])/(?:[^\s\r\n"'()]+)`)
var userFileNamePattern = regexp.MustCompile(`(?i)(^|[\s"'(])[^\\/\s"'():]+\.(?:md|markdown|txt|png|jpe?g|gif|webp|svg|pdf|docx?)([\s"'():,;]|$)`)
var labeledSecretPattern = regexp.MustCompile(`(?i)\b((?:x[ _-]?)?api[ _-]?key|key|access[ _-]?(?:key|token)|client[ _-]?secret|refresh[ _-]?token|id[ _-]?token|auth[ _-]?token|authorization|bearer|token|secret|password)\b(["']?\s*(?::|=|%3d)\s*["']?\s*)(?:bearer\s+)?[^\s&;,<>"']{6,}`)
var commonSecretPattern = regexp.MustCompile(`(?i)\b(?:sk-[A-Za-z0-9_-]{6,}|github_pat_[A-Za-z0-9_]{12,}|gh[pousr]_[A-Za-z0-9_]{12,}|AIza[A-Za-z0-9_-]{20,}|eyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,})\b`)

func newTelemetryEventID() (string, error) {
	random := make([]byte, 16)
	if _, err := rand.Read(random); err != nil {
		return "", err
	}
	return hex.EncodeToString(random), nil
}

// scheduleDailyActiveReport submits one anonymous active-device event per UTC day.
// It is intentionally independent of the optional error-reporting preference: the
// checkbox controls exception logs only. Network failures remain silent and are
// retried only when the user launches the application again.
func (a *App) scheduleDailyActiveReport() {
	go func() {
		defer func() { _ = recover() }()
		a.reportDailyActive(time.Now().UTC(), func(installID string) bool {
			return sendAppStartup(appStartupEndpoint, installID, &http.Client{Timeout: 4 * time.Second})
		})
	}()
}

func (a *App) reportDailyActive(now time.Time, sender func(string) bool) bool {
	if sender == nil {
		return false
	}
	today := now.UTC().Format("2006-01-02")
	prefs, err := a.readPreferences()
	if err != nil || prefs.LastActiveReport == today {
		return false
	}
	installID := strings.TrimSpace(prefs.AnonymousInstallID)
	if len(installID) < 16 {
		installID, err = newTelemetryEventID()
		if err != nil {
			return false
		}
		if _, err = a.updatePreferences(func(current *Preferences) {
			current.AnonymousInstallID = installID
		}); err != nil {
			return false
		}
	}
	if !sender(installID) {
		return false
	}
	_, err = a.updatePreferences(func(current *Preferences) {
		current.LastActiveReport = today
	})
	return err == nil
}

func sendAppStartup(endpoint, installID string, client *http.Client) bool {
	if strings.TrimSpace(endpoint) == "" || len(strings.TrimSpace(installID)) < 16 || client == nil {
		return false
	}
	eventID, err := newTelemetryEventID()
	if err != nil {
		return false
	}
	operatingSystem := telemetryOperatingSystem()
	if operatingSystem == "" {
		return false
	}
	architecture := goruntime.GOARCH
	if architecture != "amd64" && architecture != "arm64" && architecture != "x86_64" && architecture != "aarch64" {
		return false
	}
	payload, err := json.Marshal(appStartupEvent{
		EventID:   eventID,
		SentAt:    time.Now().UTC().Format(time.RFC3339),
		InstallID: strings.TrimSpace(installID),
		Version:   appVersion,
		OS:        operatingSystem,
		Arch:      architecture,
	})
	if err != nil {
		return false
	}
	request, err := http.NewRequest(http.MethodPost, endpoint, bytes.NewReader(payload))
	if err != nil {
		return false
	}
	request.Header.Set("Content-Type", "application/json")
	response, err := client.Do(request)
	if err != nil {
		return false
	}
	response.Body.Close()
	return response.StatusCode >= 200 && response.StatusCode < 300
}

// ReportErrorLog 只安排一个可选的后台任务并立即返回。偏好读取、文本清理和
// 网络请求全部在后台完成，任何异常、断网或内网环境都会被静默忽略。
func (a *App) ReportErrorLog(source, message, stack string) {
	a.reportErrorLogInBackground(source, message, stack, func(errorLog string) {
		sendAppErrorLog(appErrorEndpoint, errorLog, &http.Client{Timeout: 4 * time.Second})
	})
}

func (a *App) reportErrorLogInBackground(source, message, stack string, sender func(string)) {
	go func() {
		defer func() { _ = recover() }()
		if sender == nil {
			return
		}
		if isExpectedMissingDocumentError(source, message) {
			return
		}
		prefs, err := a.readPreferences()
		if err != nil || !prefs.UsageAnalytics {
			return
		}
		errorLog := buildSanitizedErrorLog(source, message, stack)
		if errorLog == "" {
			return
		}
		sender(errorLog)
	}()
}

// Missing files in Recent are expected when a document was moved, deleted, or
// a chat application's temporary cache was cleaned. They are reflected in the
// library UI and must not pollute software-error telemetry.
func isExpectedMissingDocumentError(source, message string) bool {
	source = strings.ToLower(strings.TrimSpace(source))
	if source != "document.open" && source != "document.open-recent" && source != "document.refresh" {
		return false
	}
	message = strings.ToLower(message)
	markers := []string{
		"no such file or directory",
		"not a directory",
		"file does not exist",
		"cannot find the file specified",
		"cannot find the path specified",
		"the system cannot find the file specified",
		"the system cannot find the path specified",
		"path does not exist",
		"系统找不到指定的文件",
		"系统找不到指定的路径",
		"找不到指定的文件",
		"文件不存在",
	}
	for _, marker := range markers {
		if strings.Contains(message, marker) {
			return true
		}
	}
	return false
}

func (a *App) SetUsageAnalytics(enabled bool) (Preferences, error) {
	return a.updatePreferences(func(prefs *Preferences) {
		prefs.UsageAnalytics = enabled
	})
}

func sendAppErrorLog(endpoint, errorLog string, client *http.Client) bool {
	if strings.TrimSpace(endpoint) == "" || strings.TrimSpace(errorLog) == "" || client == nil {
		return false
	}
	eventID, err := newTelemetryEventID()
	if err != nil {
		return false
	}
	operatingSystem := telemetryOperatingSystem()
	if operatingSystem == "" {
		return false
	}
	payload, err := json.Marshal(appErrorEvent{
		EventID:    eventID,
		SentAt:     time.Now().UTC().Format(time.RFC3339),
		ErrorLog:   errorLog,
		OS:         operatingSystem,
		AppVersion: appVersion,
	})
	if err != nil {
		return false
	}
	request, err := http.NewRequest(http.MethodPost, endpoint, bytes.NewReader(payload))
	if err != nil {
		return false
	}
	request.Header.Set("Content-Type", "application/json")
	response, err := client.Do(request)
	if err != nil {
		return false
	}
	response.Body.Close()
	return response.StatusCode >= 200 && response.StatusCode < 300
}

func telemetryOperatingSystem() string {
	operatingSystem := goruntime.GOOS
	if operatingSystem == "darwin" {
		operatingSystem = "macos"
	}
	if operatingSystem != "windows" && operatingSystem != "macos" && operatingSystem != "linux" {
		return ""
	}
	return operatingSystem
}

func buildSanitizedErrorLog(source, message, stack string) string {
	source = sanitizeErrorText(source, 80)
	message = sanitizeErrorText(message, 1000)
	stack = sanitizeErrorText(stack, 2800)
	parts := make([]string, 0, 2)
	if message != "" {
		if source != "" {
			message = source + ": " + message
		}
		parts = append(parts, message)
	}
	if stack != "" {
		parts = append(parts, stack)
	}
	result := strings.TrimSpace(strings.Join(parts, "\n"))
	if len(result) > 4096 {
		result = result[:4096]
	}
	return result
}

func sanitizeErrorText(value string, limit int) string {
	value = strings.Map(func(r rune) rune {
		if r == '\n' || r == '\t' {
			return r
		}
		if r < 0x20 || r == 0x7f {
			return -1
		}
		return r
	}, value)
	if home, err := os.UserHomeDir(); err == nil && strings.TrimSpace(home) != "" {
		for _, candidate := range []string{home, filepathSlash(home)} {
			value = strings.ReplaceAll(value, candidate, "[用户目录]")
		}
	}
	value = windowsPathPattern.ReplaceAllString(value, "[路径]")
	value = unixPathPattern.ReplaceAllString(value, "$1[路径]")
	value = userFileNamePattern.ReplaceAllString(value, "$1[文件名]$2")
	// Provider and network errors are untrusted text. Remove credentials even
	// when a caller accidentally forwards an authentication failure.
	value = labeledSecretPattern.ReplaceAllString(value, "$1$2[已隐藏]")
	value = commonSecretPattern.ReplaceAllString(value, "[已隐藏]")
	value = strings.TrimSpace(value)
	if len(value) > limit {
		value = value[:limit]
	}
	return value
}

func filepathSlash(value string) string {
	return strings.ReplaceAll(value, `\`, "/")
}
