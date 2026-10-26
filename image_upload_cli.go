package main

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"io"
	"net/url"
	"os"
	"os/exec"
	"path/filepath"
	"regexp"
	"runtime"
	"strings"
	"sync"
	"time"
)

// CLI uploads are serialized because PicGo plugins share one user configuration.
var picGoCLISlot = make(chan struct{}, 1)

func findPicGoProgram(name string, candidates []string) (string, error) {
	if path, err := exec.LookPath(name); err == nil && filepath.IsAbs(path) {
		return path, nil
	}
	for _, path := range candidates {
		if filepath.IsAbs(path) {
			if info, err := os.Stat(path); err == nil && info.Mode().IsRegular() {
				return path, nil
			}
		}
	}
	return "", errors.New("PICGO_CLI_NOT_FOUND")
}

func resolvePicGoCLI(configured string) (string, []string, error) {
	path := strings.TrimSpace(configured)
	if strings.ContainsAny(path, "\x00\r\n") {
		return "", nil, errors.New("PICGO_CLI_PATH_INVALID")
	}
	if path == "" || path == "picgo" {
		home, _ := os.UserHomeDir()
		var err error
		path, err = findPicGoProgram("picgo", []string{filepath.Join(os.Getenv("APPDATA"), "npm", "picgo.cmd"), "/opt/homebrew/bin/picgo", "/usr/local/bin/picgo", filepath.Join(home, ".npm-global", "bin", "picgo"), filepath.Join(home, ".local", "bin", "picgo")})
		if err != nil {
			return "", nil, err
		}
	}
	if !filepath.IsAbs(path) {
		return "", nil, errors.New("PICGO_CLI_PATH_INVALID")
	}
	info, err := os.Stat(path)
	if err != nil || !info.Mode().IsRegular() {
		return "", nil, errors.New("PICGO_CLI_NOT_FOUND")
	}
	dir := filepath.Dir(path)
	if filepath.Base(path) == managedPicGoEntry {
		nodeName := "node"
		if runtime.GOOS == "windows" {
			nodeName = "node.exe"
		}
		node := filepath.Join(dir, nodeName)
		if info, err := os.Lstat(node); err != nil || !info.Mode().IsRegular() {
			return "", nil, errors.New("PICGO_CLI_NODE_MISSING")
		}
		return node, []string{path}, nil
	}
	ext := strings.ToLower(filepath.Ext(path))
	// npm's Windows shim is a batch script, not an executable. Never pass it
	// through cmd.exe: launch its verified PicGo package entry with Node instead.
	if ext == ".cmd" || ext == ".bat" || ext == ".ps1" {
		packageDir := filepath.Join(dir, "node_modules", "picgo")
		data, err := os.ReadFile(filepath.Join(packageDir, "package.json"))
		var metadata struct {
			Name string `json:"name"`
		}
		if err != nil || json.Unmarshal(data, &metadata) != nil || metadata.Name != "picgo" {
			return "", nil, errors.New("PICGO_CLI_PATH_INVALID")
		}
		path = filepath.Join(packageDir, "bin", "picgo")
		if info, err := os.Stat(path); err != nil || !info.Mode().IsRegular() {
			return "", nil, errors.New("PICGO_CLI_NOT_FOUND")
		}
	}
	file, err := os.Open(path)
	if err != nil {
		return "", nil, errors.New("PICGO_CLI_NOT_FOUND")
	}
	var header [128]byte
	n, _ := file.Read(header[:])
	file.Close()
	usesNode := ext == ".js" || ext == ".cjs" || ext == ".mjs" || ext == ".cmd" || ext == ".bat" || ext == ".ps1" || bytes.HasPrefix(header[:n], []byte("#!/usr/bin/env node"))
	if usesNode {
		nodeName := "node"
		if runtime.GOOS == "windows" {
			nodeName = "node.exe"
		}
		node, err := findPicGoProgram(nodeName, []string{filepath.Join(dir, nodeName), "/opt/homebrew/bin/node", "/usr/local/bin/node", filepath.Join(os.Getenv("ProgramFiles"), "nodejs", "node.exe")})
		if err != nil {
			return "", nil, errors.New("PICGO_CLI_NODE_MISSING")
		}
		return node, []string{path}, nil
	}
	return path, nil, nil
}

type picGoCLIOutput struct {
	mu       sync.Mutex
	data     []byte
	overflow bool
}

func (b *picGoCLIOutput) Write(p []byte) (int, error) {
	b.mu.Lock()
	defer b.mu.Unlock()
	n := len(p)
	remaining := maxPicGoResponseSize - len(b.data)
	if n > remaining {
		b.overflow = true
		p = p[:remaining]
	}
	b.data = append(b.data, p...)
	return n, nil
}

func runPicGoCLI(ctx context.Context, configured string, args ...string) (string, error) {
	program, prefix, err := resolvePicGoCLI(configured)
	if err != nil {
		return "", err
	}
	cmd := exec.CommandContext(ctx, program, append(prefix, args...)...)
	if filepath.Base(configured) == managedPicGoEntry {
		// The managed runtime must not execute scripts injected by a system Node
		// setup. Child CLI/plugin commands can still find this private Node.
		for _, item := range os.Environ() {
			key, _, _ := strings.Cut(item, "=")
			if !strings.EqualFold(key, "NODE_OPTIONS") && !strings.EqualFold(key, "NODE_PATH") && !strings.EqualFold(key, "PATH") {
				cmd.Env = append(cmd.Env, item)
			}
		}
		cmd.Env = append(cmd.Env, "PATH="+filepath.Dir(program)+string(os.PathListSeparator)+os.Getenv("PATH"))
	}
	configurePicGoCLICommand(cmd)
	cmd.Dir = filepath.Dir(program)
	cmd.WaitDelay = 2 * time.Second
	stdout, stderr := &picGoCLIOutput{}, &picGoCLIOutput{}
	cmd.Stdout, cmd.Stderr = stdout, stderr
	err = cmd.Run()
	if ctx.Err() != nil {
		return "", errors.New("PICGO_CLI_TIMEOUT")
	}
	if err != nil {
		return "", picGoCLIExecutionError(string(stdout.data) + "\n" + string(stderr.data))
	}
	if stdout.overflow || stderr.overflow {
		return "", errors.New("PICGO_CLI_OUTPUT_INVALID")
	}
	if strings.Contains(strings.ToUpper(string(stdout.data)+string(stderr.data)), "[PICGO ERROR]") {
		return "", picGoCLIExecutionError(string(stdout.data) + "\n" + string(stderr.data))
	}
	// Do not surface stdout/stderr: plugins may print credentials and local paths.
	return string(stdout.data), nil
}

var picGoANSI = regexp.MustCompile(`\x1b\[[0-?]*[ -/]*[@-~]`)

func picGoCLIImageURL(output string) (string, error) {
	output = picGoANSI.ReplaceAllString(output, "")
	var result string
	success := false
	for _, line := range strings.Split(output, "\n") {
		line = strings.TrimSpace(line)
		if strings.Contains(strings.ToUpper(line), "[PICGO SUCCESS]") {
			success = true
			continue
		}
		if strings.Contains(strings.ToUpper(line), "[PICGO ERROR]") {
			return "", errors.New("PICGO_CLI_OUTPUT_INVALID")
		}
		if !success || !strings.HasPrefix(line, "https://") {
			continue
		}
		parsed, err := url.Parse(line)
		if err != nil || parsed.Hostname() == "" || parsed.User != nil || strings.ContainsAny(line, "\t\r\n <>\"`") || result != "" {
			return "", errors.New("PICGO_CLI_OUTPUT_INVALID")
		}
		result = line
	}
	if result == "" {
		return "", errors.New("PICGO_CLI_OUTPUT_INVALID")
	}
	return result, nil
}

// Detection only reads the CLI version. It never uploads the clipboard/image.
func (a *App) TestPicGoCLI(path string) (string, error) {
	ctx, cancel := context.WithTimeout(context.Background(), 8*time.Second)
	defer cancel()
	output, err := runPicGoCLI(ctx, path, "--version")
	if err != nil {
		return "", err
	}
	version := strings.TrimSpace(picGoANSI.ReplaceAllString(output, ""))
	if !regexp.MustCompile(`^v?\d+\.\d+\.\d+(?:[-+][A-Za-z0-9.-]+)?$`).MatchString(version) {
		return "", errors.New("PICGO_CLI_OUTPUT_INVALID")
	}
	return version, nil
}

func (a *App) UploadImageToPicGoCLI(currentFile, imagePath, operationID string) (string, error) {
	if !validImageUploadOperationID(operationID) {
		return "", errors.New("invalid image upload operation ID")
	}
	prefs, err := a.readPreferences()
	if err != nil {
		return "", err
	}
	if normaliseImageUploadMode(prefs.ImageUploadMode) != imageUploadModePicGoCLI {
		return "", errors.New("PicGo CLI uploading is disabled")
	}
	name, data, _, err := imageAssetForUpload(currentFile, imagePath)
	if err != nil {
		return "", err
	}
	ctx, cancel := context.WithTimeout(context.Background(), 2*time.Minute)
	defer cancel()
	select {
	case picGoCLISlot <- struct{}{}:
		defer func() { <-picGoCLISlot }()
	case <-ctx.Done():
		return "", errors.New("PICGO_CLI_TIMEOUT")
	}
	report := imageUploadReporter(operationID, a.emitImageUploadProgress)
	report("preparing", 0, int64(len(data)))
	report("uploading", 0, 0)
	result, err := uploadPicGoCLIConfiguredSnapshot(ctx, prefs.PicGoCLIPath, prefs.PicGoCLIConfigPath, name, data)
	if err != nil {
		report("failed", 0, int64(len(data)))
		return "", err
	}
	report("complete", int64(len(data)), int64(len(data)))
	return result, nil
}

func uploadPicGoCLISnapshot(ctx context.Context, cliPath, name string, data []byte) (string, error) {
	return uploadPicGoCLIConfiguredSnapshot(ctx, cliPath, "", name, data)
}

func uploadPicGoCLIConfiguredSnapshot(ctx context.Context, cliPath, configPath, name string, data []byte) (string, error) {
	args, err := picGoCLIConfigArgs(configPath)
	if err != nil {
		return "", err
	}
	// Plugins receive only our validated snapshot, not the user's original image.
	stage, err := os.CreateTemp("", "quillite-picgo-*"+filepath.Ext(name))
	if err != nil {
		return "", err
	}
	defer os.Remove(stage.Name()) // Exact file created above; never a user path or directory.
	if _, err := io.Copy(stage, bytes.NewReader(data)); err != nil {
		stage.Close()
		return "", err
	}
	if err := stage.Close(); err != nil {
		return "", err
	}
	output, err := runPicGoCLI(ctx, cliPath, append(args, "upload", stage.Name())...)
	if err != nil {
		return "", err
	}
	return picGoCLIImageURL(output)
}
