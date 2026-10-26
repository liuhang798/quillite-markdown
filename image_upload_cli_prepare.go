package main

import (
	"archive/tar"
	"archive/zip"
	"compress/gzip"
	"context"
	"crypto/sha256"
	_ "embed"
	"encoding/hex"
	"encoding/json"
	"errors"
	"io"
	"net/http"
	"net/url"
	"os"
	"os/exec"
	"path"
	"path/filepath"
	"runtime"
	"strings"
	"time"

	wailsruntime "github.com/wailsapp/wails/v2/pkg/runtime"
)

// Reviewed versions are pinned; preparing a component never selects "latest".
const picGoNodeVersion = "22.23.3"
const managedPicGoEntry = "quillite-picgo.cjs"

//go:embed packaging/picgo/package.json
var picGoPackage []byte

//go:embed packaging/picgo/package-lock.json
var picGoPackageLock []byte

var picGoPrepareSlot = make(chan struct{}, 1)

type picGoNodeArchive struct{ File, SHA256 string }

func picGoNodeFor(platform, arch string) (picGoNodeArchive, error) {
	archives := map[string]picGoNodeArchive{
		"windows/amd64": {"node-v22.23.3-win-x64.zip", "2b0ff57b049cda1bbcea2240eec20467018713c1efe1f7360c2681859b90ed71"},
		"darwin/arm64":  {"node-v22.23.3-darwin-arm64.tar.gz", "23b25245dcfb9af7262f8ff142e9e2e0af025368117329e7a7458a51e5922f53"},
		"darwin/amd64":  {"node-v22.23.3-darwin-x64.tar.gz", "8a677b0219178efd6eb0e475457c4afb452b521a92f6e67845a73bd85727f2a8"},
		"linux/amd64":   {"node-v22.23.3-linux-x64.tar.gz", "1084aa36196bba4c3a5e69a1ee388a6e4ff729dad09445fbcd434b28fe3c24af"},
	}
	if value, ok := archives[platform+"/"+arch]; ok {
		return value, nil
	}
	return picGoNodeArchive{}, errors.New("PICGO_PREPARE_PLATFORM")
}

func picGoOfficialURL(raw string) bool {
	u, err := url.Parse(raw)
	return err == nil && u.Scheme == "https" && u.User == nil && u.Port() == "" && (u.Host == "nodejs.org" || u.Host == "registry.npmjs.org")
}

func downloadPicGoNode(ctx context.Context, spec picGoNodeArchive, destination string) error {
	return downloadPicGoNodeWithProgress(ctx, spec, destination, func(string, int64, int64) {})
}

func downloadPicGoNodeWithProgress(ctx context.Context, spec picGoNodeArchive, destination string, report func(string, int64, int64)) error {
	report("downloading", 0, 0)
	client := &http.Client{Timeout: 3 * time.Minute, CheckRedirect: func(req *http.Request, via []*http.Request) error {
		if len(via) >= 3 || !picGoOfficialURL(req.URL.String()) {
			return errors.New("PICGO_PREPARE_SOURCE")
		}
		return nil
	}}
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, "https://nodejs.org/dist/v"+picGoNodeVersion+"/"+spec.File, nil)
	if err != nil {
		return err
	}
	response, err := client.Do(req)
	if err != nil {
		return errors.New("PICGO_PREPARE_DOWNLOAD")
	}
	defer response.Body.Close()
	if response.StatusCode != http.StatusOK || response.ContentLength > 100<<20 {
		return errors.New("PICGO_PREPARE_DOWNLOAD")
	}
	total := max(int64(0), response.ContentLength)
	report("downloading", 0, total)
	var last time.Time
	reader := newUploadProgressReader(response.Body, total, func(done, total int64) {
		if last.IsZero() || time.Since(last) >= 100*time.Millisecond || (total > 0 && done >= total) {
			last = time.Now()
			report("downloading", done, total)
		}
	})
	return writePicGoNodeDownloadWithProgress(reader, spec.SHA256, destination, func() { report("verifying", 0, 0) })
}

func writePicGoNodeDownload(reader io.Reader, expectedHash, destination string) error {
	return writePicGoNodeDownloadWithProgress(reader, expectedHash, destination, func() {})
}

func writePicGoNodeDownloadWithProgress(reader io.Reader, expectedHash, destination string, verify func()) error {
	f, err := os.OpenFile(destination, os.O_CREATE|os.O_EXCL|os.O_WRONLY, 0600)
	if err != nil {
		return err
	}
	hash := sha256.New()
	n, copyErr := io.Copy(io.MultiWriter(f, hash), io.LimitReader(reader, (100<<20)+1))
	closeErr := f.Close()
	if copyErr != nil || closeErr != nil || n > 100<<20 {
		return errors.New("PICGO_PREPARE_DOWNLOAD")
	}
	verify()
	if hex.EncodeToString(hash.Sum(nil)) != expectedHash {
		return errors.New("PICGO_PREPARE_INTEGRITY")
	}
	return nil
}

// Only runtime/npm files are extracted. Archive links are never materialized.
// All destinations are inside a fresh, private MkdirTemp tree, never user paths.
func extractPicGoNode(archive, destination string) error {
	var total int64
	count := 0
	write := func(name string, size int64, mode os.FileMode, reader io.Reader) error {
		count++
		if count > 20000 || size < 0 || size > 150<<20 || strings.ContainsAny(name, "\\:\x00") || strings.HasPrefix(name, "/") || strings.HasPrefix(name, "../") || strings.HasPrefix(name, "./") || path.Clean(name) != strings.TrimSuffix(name, "/") {
			return errors.New("PICGO_PREPARE_ARCHIVE")
		}
		parts := strings.SplitN(name, "/", 2)
		if len(parts) < 2 {
			return nil
		}
		rel := strings.TrimSuffix(parts[1], "/")
		if rel == ".." || strings.HasPrefix(rel, "../") {
			return errors.New("PICGO_PREPARE_ARCHIVE")
		}
		if mode.IsDir() {
			return nil
		}
		if !mode.IsRegular() {
			return nil
		}
		if rel != "node.exe" && rel != "bin/node" && rel != "LICENSE" && !strings.HasPrefix(rel, "node_modules/npm/") && !strings.HasPrefix(rel, "lib/node_modules/npm/") {
			return nil
		}
		if rel == "bin/node" {
			rel = "node"
		}
		total += size
		if total > 300<<20 {
			return errors.New("PICGO_PREPARE_ARCHIVE")
		}
		target := filepath.Join(destination, filepath.FromSlash(rel))
		if err := os.MkdirAll(filepath.Dir(target), 0700); err != nil {
			return err
		}
		f, err := os.OpenFile(target, os.O_CREATE|os.O_EXCL|os.O_WRONLY, 0600)
		if err != nil {
			return err
		}
		n, copyErr := io.Copy(f, io.LimitReader(reader, size+1))
		closeErr := f.Close()
		if copyErr != nil || closeErr != nil || n != size {
			return errors.New("PICGO_PREPARE_ARCHIVE")
		}
		if rel == "node" {
			return os.Chmod(target, 0700)
		}
		return nil
	}
	if strings.HasSuffix(archive, ".zip") {
		z, err := zip.OpenReader(archive)
		if err != nil {
			return err
		}
		defer z.Close()
		for _, item := range z.File {
			r, err := item.Open()
			if err != nil {
				return err
			}
			err = write(item.Name, int64(item.UncompressedSize64), item.Mode(), r)
			r.Close()
			if err != nil {
				return err
			}
		}
		return nil
	}
	f, err := os.Open(archive)
	if err != nil {
		return err
	}
	defer f.Close()
	gz, err := gzip.NewReader(f)
	if err != nil {
		return err
	}
	defer gz.Close()
	tr := tar.NewReader(gz)
	for {
		header, err := tr.Next()
		if err == io.EOF {
			return nil
		}
		if err != nil {
			return err
		}
		if err := write(header.Name, header.Size, header.FileInfo().Mode(), tr); err != nil {
			return err
		}
	}
}

func validatePicGoLock(data []byte) error {
	var lock struct {
		Packages map[string]struct {
			Resolved, Integrity string
			HasInstallScript    bool
		}
	}
	if json.Unmarshal(data, &lock) != nil || len(lock.Packages) < 2 {
		return errors.New("PICGO_PREPARE_LOCK")
	}
	for name, pkg := range lock.Packages {
		if name == "" {
			continue
		}
		if !strings.HasPrefix(name, "node_modules/") || path.Clean(name) != name || strings.ContainsAny(name, "\\:\x00") || !strings.HasPrefix(pkg.Resolved, "https://registry.npmjs.org/") || !picGoOfficialURL(pkg.Resolved) || !strings.HasPrefix(pkg.Integrity, "sha512-") || pkg.HasInstallScript {
			return errors.New("PICGO_PREPARE_LOCK")
		}
	}
	return nil
}

// No NODE_OPTIONS, npm configuration, tokens, proxies, or system PATH inheritance.
func picGoPrepareEnv(nodeDir, tempDir string) []string {
	env := []string{"PATH=" + nodeDir, "TMP=" + tempDir, "TEMP=" + tempDir, "TMPDIR=" + tempDir}
	for _, key := range []string{"SystemRoot", "WINDIR", "SystemDrive", "COMSPEC", "HOME", "USERPROFILE", "APPDATA", "LOCALAPPDATA"} {
		if value := os.Getenv(key); value != "" {
			env = append(env, key+"="+value)
		}
	}
	return env
}

// Scope-bound cleanup can only remove the two private trees made here. Once
// successful, the component tree is retained and never automatically removed.
func preparePicGoComponent(ctx context.Context, parent string, install func(context.Context, string, string) error) (string, error) {
	if err := os.MkdirAll(parent, 0700); err != nil {
		return "", err
	}
	component, err := os.MkdirTemp(parent, "picgo-3.2.0-")
	if err != nil {
		return "", err
	}
	keep := false
	defer func() {
		if !keep {
			os.RemoveAll(component)
		}
	}()
	work, err := os.MkdirTemp(parent, ".picgo-prepare-")
	if err != nil {
		return "", err
	}
	defer os.RemoveAll(work)
	if err := install(ctx, component, work); err != nil {
		return "", err
	}
	entry := filepath.Join(component, "runtime", managedPicGoEntry)
	keep = true
	return entry, nil
}

func installOfficialPicGo(ctx context.Context, component, work string) error {
	return installOfficialPicGoWithProgress(ctx, component, work, func(string, int64, int64) {})
}

func installOfficialPicGoWithProgress(ctx context.Context, component, work string, report func(string, int64, int64)) error {
	spec, err := picGoNodeFor(runtime.GOOS, runtime.GOARCH)
	if err != nil {
		return err
	}
	if err := validatePicGoLock(picGoPackageLock); err != nil {
		return err
	}
	archive := filepath.Join(work, spec.File)
	if err := downloadPicGoNodeWithProgress(ctx, spec, archive, report); err != nil {
		return err
	}
	runtimeDir := filepath.Join(component, "runtime")
	report("extracting", 0, 0)
	if err := extractPicGoNode(archive, runtimeDir); err != nil {
		return err
	}
	nodeName, npmPath := "node", filepath.Join(runtimeDir, "lib", "node_modules", "npm", "bin", "npm-cli.js")
	if runtime.GOOS == "windows" {
		nodeName = "node.exe"
		npmPath = filepath.Join(runtimeDir, "node_modules", "npm", "bin", "npm-cli.js")
	}
	cliDir := filepath.Join(component, "cli")
	if err := os.Mkdir(cliDir, 0700); err != nil {
		return err
	}
	for name, data := range map[string][]byte{"package.json": picGoPackage, "package-lock.json": picGoPackageLock} {
		if err := os.WriteFile(filepath.Join(cliDir, name), data, 0600); err != nil {
			return err
		}
	}
	for _, name := range []string{"user.npmrc", "global.npmrc"} {
		if err := os.WriteFile(filepath.Join(work, name), nil, 0600); err != nil {
			return err
		}
	}
	cmd := exec.CommandContext(ctx, filepath.Join(runtimeDir, nodeName), npmPath, "ci", "--ignore-scripts", "--omit=dev", "--no-audit", "--no-fund", "--bin-links=false", "--registry=https://registry.npmjs.org", "--fetch-retries=0", "--fetch-timeout=60000", "--cache="+filepath.Join(work, "cache"), "--userconfig="+filepath.Join(work, "user.npmrc"), "--globalconfig="+filepath.Join(work, "global.npmrc"))
	cmd.Dir, cmd.Env, cmd.WaitDelay = cliDir, picGoPrepareEnv(runtimeDir, work), 2*time.Second
	configurePicGoCLICommand(cmd)
	output := &picGoCLIOutput{}
	cmd.Stdout, cmd.Stderr = output, output
	report("installing", 0, 0)
	if err := cmd.Run(); err != nil {
		return errors.New("PICGO_PREPARE_INSTALL")
	}
	entry := filepath.Join(runtimeDir, managedPicGoEntry)
	if err := os.WriteFile(entry, []byte("require('../cli/node_modules/picgo/bin/picgo');\n"), 0600); err != nil {
		return err
	}
	// Isolate the smoke check from the user's existing ~/.picgo configuration.
	report("checking", 0, 0)
	result, err := runPicGoCLI(ctx, entry, "--config", filepath.Join(work, "check.json"), "--version")
	if err != nil || strings.TrimSpace(result) != "3.2.0" {
		return errors.New("PICGO_PREPARE_VERIFY")
	}
	return nil
}

// Explicit button only: preparing does not upload an image or change preferences.
func (a *App) PreparePicGoCLI(confirmed bool, operationID string) (string, error) {
	if !confirmed {
		return "", errors.New("PICGO_PREPARE_CONFIRM")
	}
	if !validImageUploadOperationID(operationID) {
		return "", errors.New("PICGO_PREPARE_OPERATION")
	}
	select {
	case picGoPrepareSlot <- struct{}{}:
		defer func() { <-picGoPrepareSlot }()
	default:
		return "", errors.New("PICGO_PREPARE_BUSY")
	}
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Minute)
	defer cancel()
	report := imageUploadReporter(operationID, a.emitPicGoPrepareProgress)
	report("starting", 0, 0)
	entry, err := preparePicGoComponent(ctx, filepath.Join(filepath.Dir(a.preferencePath()), "components"), func(ctx context.Context, component, work string) error {
		return installOfficialPicGoWithProgress(ctx, component, work, report)
	})
	if ctx.Err() != nil {
		report("failed", 0, 0)
		return "", errors.New("PICGO_PREPARE_TIMEOUT")
	}
	if err != nil {
		report("failed", 0, 0)
	} else {
		report("complete", 0, 0)
	}
	return entry, err
}

func (a *App) emitPicGoPrepareProgress(progress imageUploadProgress) {
	a.mu.RLock()
	ctx := a.ctx
	a.mu.RUnlock()
	if ctx != nil {
		wailsruntime.EventsEmit(ctx, "picgo-cli:prepare-progress", progress)
	}
}
