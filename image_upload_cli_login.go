package main

import (
	"context"
	"encoding/json"
	"errors"
	"io"
	"os"
	"path/filepath"
	"sort"
	"strings"
	"time"

	wailsruntime "github.com/wailsapp/wails/v2/pkg/runtime"
)

type picGoCLILoginProgress struct {
	OperationID string `json:"operationId"`
	Phase       string `json:"phase"`
	ConfigPath  string `json:"configPath"`
}

// Only inspect application-created profiles. Never return credentials to the UI.
func (a *App) picGoLoginProfile(path string) (valid, hasToken bool) {
	root := filepath.Join(filepath.Dir(a.preferencePath()), "picgo-cli-profiles")
	rel, err := filepath.Rel(root, path)
	parts := strings.Split(rel, string(filepath.Separator))
	if err != nil || !filepath.IsAbs(path) || len(parts) != 2 || !strings.HasPrefix(parts[0], "cloud-") || parts[1] != "config.json" {
		return false, false
	}
	for _, dir := range []string{root, filepath.Dir(path)} {
		info, err := os.Lstat(dir)
		if err != nil || !info.IsDir() || info.Mode()&os.ModeSymlink != 0 {
			return false, false
		}
	}
	info, err := os.Lstat(path)
	if err != nil || !info.Mode().IsRegular() || info.Size() > maxPicGoResponseSize {
		return false, false
	}
	file, err := os.Open(path)
	if err != nil {
		return false, false
	}
	defer file.Close()
	data, err := io.ReadAll(io.LimitReader(file, maxPicGoResponseSize+1))
	if err != nil || len(data) > maxPicGoResponseSize {
		return false, false
	}
	var config struct {
		PicBed struct {
			Uploader string `json:"uploader"`
			Current  string `json:"current"`
		} `json:"picBed"`
		Settings struct {
			Cloud struct {
				Token      string `json:"token"`
				AutoImport bool   `json:"autoImport"`
			} `json:"picgoCloud"`
		} `json:"settings"`
	}
	if json.Unmarshal(data, &config) != nil || config.PicBed.Uploader != "picgo-cloud" || config.PicBed.Current != "picgo-cloud" || config.Settings.Cloud.AutoImport {
		return false, false
	}
	return true, strings.TrimSpace(config.Settings.Cloud.Token) != ""
}

func (a *App) recoverPicGoLoginProfile() string {
	prefs, _ := a.readPreferences()
	// A saved, authorized profile wins. A pending attempt must not hide an
	// older authorized profile (the duplicate-login regression).
	for _, path := range []string{prefs.PicGoCLIConfigPath, prefs.PicGoCLILoginConfigPath} {
		if valid, token := a.picGoLoginProfile(path); valid && token {
			return path
		}
	}
	root := filepath.Join(filepath.Dir(a.preferencePath()), "picgo-cli-profiles")
	if info, err := os.Lstat(root); err != nil || !info.IsDir() || info.Mode()&os.ModeSymlink != 0 {
		return ""
	}
	dir, err := os.Open(root)
	if err != nil {
		return ""
	}
	defer dir.Close()
	entries, _ := dir.ReadDir(256)
	type profile struct {
		path     string
		modified int64
	}
	var authorized []profile
	for _, entry := range entries {
		if !entry.IsDir() || !strings.HasPrefix(entry.Name(), "cloud-") {
			continue
		}
		path := filepath.Join(root, entry.Name(), "config.json")
		if valid, token := a.picGoLoginProfile(path); valid && token {
			if info, err := os.Stat(path); err == nil {
				authorized = append(authorized, profile{path, info.ModTime().UnixNano()})
			}
		}
	}
	sort.Slice(authorized, func(i, j int) bool {
		if authorized[i].modified == authorized[j].modified {
			return authorized[i].path < authorized[j].path
		}
		return authorized[i].modified > authorized[j].modified
	})
	if len(authorized) > 0 {
		return authorized[0].path
	}
	if valid, _ := a.picGoLoginProfile(prefs.PicGoCLILoginConfigPath); valid {
		return prefs.PicGoCLILoginConfigPath
	}
	return ""
}

func (a *App) newPicGoLoginProfile() (string, error) {
	root := filepath.Join(filepath.Dir(a.preferencePath()), "picgo-cli-profiles")
	if err := os.MkdirAll(root, 0700); err != nil {
		return "", errors.New("PICGO_CLI_CONFIG_INVALID")
	}
	dir, err := os.MkdirTemp(root, "cloud-")
	if err != nil {
		return "", errors.New("PICGO_CLI_CONFIG_INVALID")
	}
	path := filepath.Join(dir, "config.json")
	// Never delete these profiles, including on timeout/cancellation.
	if err := os.WriteFile(path, []byte(`{"picBed":{"uploader":"picgo-cloud","current":"picgo-cloud"},"settings":{"picgoCloud":{"autoImport":false}}}`), 0600); err != nil {
		return "", errors.New("PICGO_CLI_CONFIG_INVALID")
	}
	return path, nil
}

func (a *App) emitPicGoCLILoginProgress(operationID, phase, path string) {
	a.mu.RLock()
	ctx := a.ctx
	a.mu.RUnlock()
	if ctx != nil {
		wailsruntime.EventsEmit(ctx, "picgo-cli:login-progress", picGoCLILoginProgress{operationID, phase, path})
	}
}

// Cancel only the operation owned by this dialog, never another CLI/upload.
func (a *App) CancelPicGoCLILogin(operationID string) {
	if !validImageUploadOperationID(operationID) {
		return
	}
	a.mu.Lock()
	cancel := a.picGoCLILoginCancel
	match := operationID == a.picGoCLILoginID
	if match || a.picGoCLILoginID == "" {
		a.picGoCLILoginCancelledID = operationID
	}
	a.mu.Unlock()
	if match && cancel != nil {
		cancel()
	}
}

func (a *App) LoginPicGoCLI(path string, confirmed bool, operationID string, forceNew bool) (string, error) {
	if !confirmed {
		return "", errors.New("PICGO_CLI_CONFIRM_REQUIRED")
	}
	if !validImageUploadOperationID(operationID) {
		return "", errors.New("PICGO_CLI_LOGIN_OPERATION")
	}
	path = a.effectivePicGoCLIPath(path)
	if _, _, err := resolvePicGoCLI(path); err != nil {
		return "", err
	}
	select {
	case picGoCLISlot <- struct{}{}:
		defer func() { <-picGoCLISlot }()
	default:
		return "", errors.New("PICGO_CLI_BUSY")
	}
	ctx, cancel := context.WithCancel(context.Background())
	a.mu.Lock()
	if a.picGoCLILoginCancelledID == operationID {
		a.mu.Unlock()
		cancel()
		return "", errors.New("PICGO_CLI_LOGIN_CANCELLED")
	}
	a.picGoCLILoginID, a.picGoCLILoginCancel = operationID, cancel
	a.mu.Unlock()
	defer func() {
		cancel()
		a.mu.Lock()
		a.picGoCLILoginID, a.picGoCLILoginCancel = "", nil
		a.mu.Unlock()
	}()
	config := ""
	if !forceNew {
		config = a.recoverPicGoLoginProfile()
	}
	if config == "" {
		var err error
		config, err = a.newPicGoLoginProfile()
		if err != nil {
			return "", err
		}
	}
	if _, err := a.updatePreferences(func(p *Preferences) { p.PicGoCLILoginConfigPath = config }); err != nil {
		return "", errors.New("PICGO_CLI_CONFIG_INVALID")
	}
	_, hasToken := a.picGoLoginProfile(config)
	if !hasToken {
		a.emitPicGoCLILoginProgress(operationID, "waiting", config)
		if err := a.waitForPicGoLogin(ctx, path, config, 3*time.Minute); err != nil {
			return "", err
		}
	}
	a.emitPicGoCLILoginProgress(operationID, "checking", config)
	check, stop := context.WithTimeout(ctx, 20*time.Second)
	defer stop()
	output, err := runPicGoCLI(check, path, "--config", config, "cloud", "auth", "status", "--format", "json")
	if ctx.Err() != nil {
		return "", errors.New("PICGO_CLI_LOGIN_CANCELLED")
	}
	if err != nil {
		return "", errors.New("PICGO_CLI_AUTH_CHECK_FAILED")
	}
	var status struct {
		Status   string `json:"status"`
		LoggedIn bool   `json:"loggedIn"`
	}
	if json.Unmarshal([]byte(output), &status) != nil || status.Status != "logged_in" || !status.LoggedIn {
		return "", errors.New("PICGO_CLI_AUTH_CHECK_FAILED")
	}
	a.emitPicGoCLILoginProgress(operationID, "complete", config)
	return config, nil
}

func (a *App) waitForPicGoLogin(ctx context.Context, path, config string, timeout time.Duration) error {
	browser, stop := context.WithTimeout(ctx, timeout)
	defer stop()
	done := make(chan error, 1)
	go func() { _, err := runPicGoCLI(browser, path, "--config", config, "login"); done <- err }()
	tick := time.NewTicker(250 * time.Millisecond)
	defer tick.Stop()
	var tokenSeen time.Time
	for {
		select {
		case err := <-done:
			if ctx.Err() != nil {
				return errors.New("PICGO_CLI_LOGIN_CANCELLED")
			}
			if _, token := a.picGoLoginProfile(config); token {
				return nil
			} // Still require remote status verification.
			if browser.Err() != nil {
				return errors.New("PICGO_CLI_LOGIN_TIMEOUT")
			}
			if err != nil {
				return err
			}
			return errors.New("PICGO_CLI_AUTH_REQUIRED")
		case <-tick.C:
			if _, token := a.picGoLoginProfile(config); token {
				if tokenSeen.IsZero() {
					tokenSeen = time.Now()
				}
				// Allow the callback response to flush, then stop only our login
				// process if it remains alive. A token is NOT proof of valid login.
				if time.Since(tokenSeen) >= time.Second {
					stop()
				}
			}
		}
	}
}
