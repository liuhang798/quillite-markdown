package main

import (
	"context"
	"crypto/sha256"
	"encoding/base64"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"time"

	wailsruntime "github.com/wailsapp/wails/v2/pkg/runtime"
)

// Never return plugin output: it can contain credentials, local paths or URLs
// containing tokens. These fixed codes are safe to display and diagnose.
func picGoCLIExecutionError(output string) error {
	lower := strings.ToLower(output)
	for _, phrase := range []string{"login", "log in", "unauthorized", "invalid token", "登录", "401"} {
		if strings.Contains(lower, phrase) {
			return errors.New("PICGO_CLI_AUTH_REQUIRED")
		}
	}
	for _, phrase := range []string{"quota", "rate limit", "429", "额度"} {
		if strings.Contains(lower, phrase) {
			return errors.New("PICGO_CLI_QUOTA")
		}
	}
	return errors.New("PICGO_CLI_FAILED")
}

func picGoCLIConfigArgs(path string) ([]string, error) {
	path = strings.TrimSpace(path)
	if path == "" {
		return nil, nil
	}
	if !filepath.IsAbs(path) || strings.ContainsAny(path, "\x00\r\n") {
		return nil, errors.New("PICGO_CLI_CONFIG_INVALID")
	}
	info, err := os.Stat(path)
	if err != nil || !info.Mode().IsRegular() || info.Size() > maxPicGoResponseSize {
		return nil, errors.New("PICGO_CLI_CONFIG_INVALID")
	}
	return []string{"--config", filepath.Clean(path)}, nil
}

// Select an existing CLI configuration without reading its secrets into the UI.
func (a *App) SelectPicGoCLIConfig() (string, error) {
	a.mu.RLock()
	ctx := a.ctx
	a.mu.RUnlock()
	if ctx == nil {
		return "", errors.New("PICGO_CLI_DESKTOP_REQUIRED")
	}
	path, err := wailsruntime.OpenFileDialog(ctx, wailsruntime.OpenDialogOptions{
		Title: "PicGo CLI config.json", Filters: []wailsruntime.FileFilter{{DisplayName: "PicGo JSON", Pattern: "*.json"}},
	})
	if err != nil || path == "" {
		return path, err
	}
	_, err = picGoCLIConfigArgs(path)
	return path, err
}

// The official CLI owns browser login and credentials. No Server upload service
// or direct Cloud uploader is used here. New profiles never overwrite ~/.picgo.
func (a *App) LoginPicGoCLI(path string, confirmed bool) (string, error) {
	if !confirmed {
		return "", errors.New("PICGO_CLI_CONFIRM_REQUIRED")
	}
	if _, _, err := resolvePicGoCLI(path); err != nil {
		return "", err
	}
	ctx, cancel := context.WithTimeout(context.Background(), 3*time.Minute)
	defer cancel()
	select {
	case picGoCLISlot <- struct{}{}:
		defer func() { <-picGoCLISlot }()
	default:
		return "", errors.New("PICGO_CLI_BUSY")
	}
	root := filepath.Join(filepath.Dir(a.preferencePath()), "picgo-cli-profiles")
	if err := os.MkdirAll(root, 0700); err != nil {
		return "", errors.New("PICGO_CLI_CONFIG_INVALID")
	}
	dir, err := os.MkdirTemp(root, "cloud-")
	if err != nil {
		return "", errors.New("PICGO_CLI_CONFIG_INVALID")
	}
	// Retained even on failure: credentials may have been written after browser
	// approval. Never recursively remove a CLI profile or the user's configuration.
	config := filepath.Join(dir, "config.json")
	if err := os.WriteFile(config, []byte(`{"picBed":{"uploader":"picgo-cloud","current":"picgo-cloud"},"settings":{"picgoCloud":{"autoImport":false}}}`), 0600); err != nil {
		return "", errors.New("PICGO_CLI_CONFIG_INVALID")
	}
	if _, err := runPicGoCLI(ctx, path, "--config", config, "login"); err != nil {
		return "", err
	}
	// PicGo's login command can exit zero after logging an error. Probe its
	// structured auth result; process exit alone is not evidence of login.
	output, err := runPicGoCLI(ctx, path, "--config", config, "cloud", "auth", "status", "--format", "json")
	if err != nil {
		return "", err
	}
	var status struct {
		Status   string `json:"status"`
		LoggedIn bool   `json:"loggedIn"`
	}
	if json.Unmarshal([]byte(output), &status) != nil || status.Status != "logged_in" || !status.LoggedIn {
		return "", errors.New("PICGO_CLI_AUTH_REQUIRED")
	}
	return config, nil
}

func picGoCLITestFingerprint(path, config string) (string, error) {
	program, prefix, err := resolvePicGoCLI(path)
	if err != nil {
		return "", err
	}
	if _, err := picGoCLIConfigArgs(config); err != nil {
		return "", err
	}
	config = strings.TrimSpace(config)
	if config == "" {
		home, err := os.UserHomeDir()
		if err != nil {
			return "", err
		}
		config = filepath.Join(home, ".picgo", "config.json")
	}
	info, err := os.Stat(config)
	if err != nil || !info.Mode().IsRegular() || info.Size() > maxPicGoResponseSize {
		return "", errors.New("PICGO_CLI_CONFIG_INVALID")
	}
	data, err := os.ReadFile(config)
	if err != nil {
		return "", errors.New("PICGO_CLI_CONFIG_INVALID")
	}
	h := sha256.New()
	fmt.Fprintf(h, "%s\x00%s\x00%s\x00", strings.TrimSpace(path), strings.TrimSpace(config), program)
	for _, file := range append([]string{program}, prefix...) {
		info, err := os.Stat(file)
		if err != nil {
			return "", err
		}
		fmt.Fprintf(h, "%s:%d:%d\x00", file, info.Size(), info.ModTime().UnixNano())
	}
	h.Write(data)
	return hex.EncodeToString(h.Sum(nil)), nil
}

func (a *App) picGoCLIUploadVerified(path, config string) bool {
	key, err := picGoCLITestFingerprint(path, config)
	if err != nil {
		return false
	}
	a.mu.RLock()
	defer a.mu.RUnlock()
	return key == a.picGoCLIVerified && time.Since(a.picGoCLIVerifiedAt) < 10*time.Minute
}

// Explicitly uploads ONLY this built-in one-pixel PNG. Never reads clipboard,
// document contents or user images. One attempt; no retry on unknown outcomes.
func (a *App) TestPicGoCLIUpload(path, config string, confirmed bool) (string, error) {
	if !confirmed {
		return "", errors.New("PICGO_CLI_CONFIRM_REQUIRED")
	}
	select {
	case picGoCLISlot <- struct{}{}:
		defer func() { <-picGoCLISlot }()
	default:
		return "", errors.New("PICGO_CLI_BUSY")
	}
	a.mu.Lock()
	a.picGoCLIVerified = ""
	a.mu.Unlock()
	if _, err := picGoCLITestFingerprint(path, config); err != nil {
		return "", err
	}
	data, _ := base64.StdEncoding.DecodeString("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=")
	ctx, cancel := context.WithTimeout(context.Background(), 2*time.Minute)
	defer cancel()
	result, err := uploadPicGoCLIConfiguredSnapshot(ctx, path, config, "test.png", data)
	if err != nil {
		return "", err
	}
	key, err := picGoCLITestFingerprint(path, config)
	if err != nil {
		return "", err
	}
	a.mu.Lock()
	a.picGoCLIVerified = key
	a.picGoCLIVerifiedAt = time.Now()
	a.mu.Unlock()
	return result, nil
}
