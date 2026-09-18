package main

import (
	"encoding/json"
	"path/filepath"
	"runtime"
	"time"

	wailsruntime "github.com/wailsapp/wails/v2/pkg/runtime"
)

type DiagnosticFlags struct {
	DocumentOpen bool `json:"documentOpen"`
	Unsaved      bool `json:"unsaved"`
	Conflict     bool `json:"conflict"`
	Saving       bool `json:"saving"`
}
type DiagnosticInput struct {
	Checks DiagnosticFlags `json:"checks"`
	Errors map[string]int  `json:"errors"`
}

func diagnosticReport(input DiagnosticInput) ([]byte, error) {
	counts := map[string]int{}
	for _, key := range []string{"document", "frontend", "preview", "export", "library", "folder", "preferences", "ai", "spellcheck", "tools"} {
		if n := input.Errors[key]; n > 0 && n <= 9999 {
			counts[key] = n
		}
	}
	return json.MarshalIndent(struct {
		Schema       int             `json:"schema"`
		Version      string          `json:"version"`
		Platform     string          `json:"platform"`
		Architecture string          `json:"architecture"`
		Checks       DiagnosticFlags `json:"checks"`
		Errors       map[string]int  `json:"errors"`
	}{1, appVersion, runtime.GOOS, runtime.GOARCH, input.Checks, counts}, "", "  ")
}

func (a *App) SaveDiagnosticReport(input DiagnosticInput) (string, error) {
	data, err := diagnosticReport(input)
	if err != nil {
		return "", err
	}
	path, err := wailsruntime.SaveFileDialog(a.ctx, wailsruntime.SaveDialogOptions{Title: "Quillite · 诊断报告 / Diagnostic report", DefaultFilename: "quillite-diagnostic-" + time.Now().Format("20060102-150405") + ".json", Filters: []wailsruntime.FileFilter{{DisplayName: "JSON", Pattern: "*.json"}}})
	if err != nil || path == "" {
		return "", err
	}
	_ = a.rememberMacSecurityScopedPath(path, false)
	write := func(target string) error { return writeConflictCopy(a.preferencePath(), target, data) }
	_, found, err := a.withMacSecurityScopedPath(path, write)
	if !found {
		err = write(path)
	}
	if err != nil {
		return "", err
	}
	return filepath.Clean(path), nil
}
