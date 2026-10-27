package main

import (
	"errors"
	"path/filepath"
	"strings"
)

// A draft is never read by upload, login, or verification code. It contains
// paths and an HTTP preference only, not credentials or verification evidence.
type PicGoCLIDraft struct {
	CLIPath       string `json:"cliPath"`
	CLIConfigPath string `json:"cliConfigPath"`
	CLIAllowHTTP  bool   `json:"cliAllowHttp"`
}

func (a *App) SavePicGoCLIDraft(input PicGoCLIDraft) (PicGoCLIDraft, error) {
	input.CLIPath = strings.TrimSpace(input.CLIPath)
	input.CLIConfigPath = strings.TrimSpace(input.CLIConfigPath)
	for _, path := range []string{input.CLIPath, input.CLIConfigPath} {
		if len(path) > 4096 || strings.ContainsAny(path, "\x00\r\n") || (path != "" && !filepath.IsAbs(path)) {
			return PicGoCLIDraft{}, errors.New("PICGO_CLI_DRAFT_INVALID")
		}
	}
	// Deliberately no CLI execution, network request, credential read, or active
	// settings change. Offline and incomplete configurations can be kept safely.
	_, err := a.updatePreferences(func(p *Preferences) { p.PicGoCLIDraft = &input })
	return input, err
}
