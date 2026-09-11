package main

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"fmt"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"runtime"
	"strings"
	"sync"
	"time"

	wailsruntime "github.com/wailsapp/wails/v2/pkg/runtime"
)

const updateProgressEvent = "update:progress"

// updateAssetNameForPlatform returns the suffix of the release asset used by
// the in-app updater on the given GOOS, or "" when self-update is unsupported.
func updateAssetNameForPlatform(goos string) string {
	switch goos {
	case "darwin":
		// macOS code signing seals the complete .app bundle. Replacing only
		// Contents/MacOS/QuilliteMarkdown makes the bundle fail dyld signature
		// validation on the next launch, so macOS updates must contain the
		// complete, already-signed application bundle.
		return "macos-universal.zip"
	case "windows":
		return "windows-amd64.bin"
	default:
		return ""
	}
}

func pickUpdateAsset(assets []updateReleaseAsset, goos string) (*updateReleaseAsset, error) {
	suffix := updateAssetNameForPlatform(goos)
	if suffix == "" {
		return nil, fmt.Errorf("in-app updates are not supported on %s", goos)
	}
	for index := range assets {
		if strings.HasSuffix(assets[index].Name, suffix) {
			return &assets[index], nil
		}
	}
	return nil, fmt.Errorf("no %q update asset found in the latest release", suffix)
}

// updateMutex keeps a double-click from starting two downloads or installers.
var updateMutex sync.Mutex

// DownloadAndApplyUpdate downloads the latest release asset for the current
// platform, verifies its SHA-256 digest, then applies the update without
// requiring the user to install anything manually. Progress is emitted through
// the "update:progress" event. The application is expected to quit shortly
// after this call succeeds so the platform updater can take over.
func (a *App) DownloadAndApplyUpdate() error {
	updateMutex.Lock()
	defer updateMutex.Unlock()
	if err := validateInAppUpdateSafety(runtime.GOOS, prepareWindowsUninstallerForUpdate()); err != nil {
		return err
	}

	release, err := a.fetchLatestRelease()
	if err != nil {
		return err
	}
	asset, err := pickUpdateAsset(release.Assets, runtime.GOOS)
	if err != nil {
		return fmt.Errorf("official release has no compatible update asset: %w", err)
	}

	configDir, err := os.UserConfigDir()
	if err != nil {
		return err
	}
	updateDir := filepath.Join(configDir, appNameZH, "update")
	if err := os.MkdirAll(updateDir, 0o755); err != nil {
		return err
	}
	// Every update gets a new private directory. Never enumerate and delete a
	// shared update folder: stale files are harmless, while an unexpected file
	// must never be mistaken for disposable application data.
	updateRunDir, err := os.MkdirTemp(updateDir, "run-")
	if err != nil {
		return err
	}
	downloadPath := filepath.Join(updateRunDir, filepath.Base(asset.Name))

	if err := a.downloadFile(asset.BrowserDownloadURL, downloadPath); err != nil {
		_ = os.Remove(downloadPath)
		return err
	}
	if err := verifyDigest(downloadPath, asset.Digest); err != nil {
		_ = os.Remove(downloadPath)
		return fmt.Errorf("update verification failed: %w", err)
	}
	return applyUpdate(downloadPath)
}

func validateInAppUpdateSafety(goos string, windowsUninstallerSafe bool) error {
	if goos == "windows" && !windowsUninstallerSafe {
		return errors.New("the risky Windows uninstaller could not be deleted or disabled; a full installer is required")
	}
	return nil
}

func (a *App) downloadFile(url, destination string) error {
	if !isOfficialWebsiteURL(url) {
		return errors.New("update download URL is not hosted by the official website")
	}
	return a.downloadFileFromURL(url, destination, &http.Client{Timeout: 30 * time.Minute})
}

func (a *App) downloadFileFromURL(url, destination string, client *http.Client) error {
	request, err := http.NewRequestWithContext(context.Background(), http.MethodGet, url, nil)
	if err != nil {
		return err
	}
	request.Header.Set("User-Agent", "QuilliteMarkdown/"+appVersion)

	response, err := client.Do(request)
	if err != nil {
		return fmt.Errorf("download update: %w", err)
	}
	defer response.Body.Close()
	if response.StatusCode != http.StatusOK {
		return fmt.Errorf("download update returned %s", response.Status)
	}

	file, err := os.Create(destination)
	if err != nil {
		return err
	}
	defer file.Close()

	total := response.ContentLength
	var written int64
	buffer := make([]byte, 64*1024)
	lastEmit := time.Now()
	for {
		count, readErr := response.Body.Read(buffer)
		if count > 0 {
			if _, err := file.Write(buffer[:count]); err != nil {
				return err
			}
			written += int64(count)
			if time.Since(lastEmit) > 150*time.Millisecond || (total > 0 && written >= total) {
				lastEmit = time.Now()
				a.emitProgress(written, total)
			}
		}
		if readErr == io.EOF {
			break
		}
		if readErr != nil {
			return readErr
		}
	}
	a.emitProgress(written, total)
	return nil
}

func (a *App) emitProgress(done, total int64) {
	if a.ctx == nil {
		return
	}
	wailsruntime.EventsEmit(a.ctx, updateProgressEvent, map[string]int64{"done": done, "total": total})
}

// verifyDigest checks the downloaded file against the SHA-256 digest published
// by the official website release catalog ("sha256:<hex>").
func verifyDigest(path, digest string) error {
	digest = strings.TrimSpace(digest)
	if strings.HasPrefix(digest, "sha256:") {
		digest = strings.TrimPrefix(digest, "sha256:")
	}
	if digest == "" {
		return errors.New("release asset has no SHA-256 digest")
	}
	file, err := os.Open(path)
	if err != nil {
		return err
	}
	defer file.Close()
	hash := sha256.New()
	if _, err := io.Copy(hash, file); err != nil {
		return err
	}
	actual := hex.EncodeToString(hash.Sum(nil))
	if !strings.EqualFold(actual, digest) {
		return fmt.Errorf("checksum mismatch (got %s, want %s)", actual, digest)
	}
	return nil
}
