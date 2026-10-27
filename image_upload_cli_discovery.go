package main

import (
	"bytes"
	"encoding/json"
	"errors"
	"os"
	"path/filepath"
	"sort"
	"strings"
)

const managedPicGoBootstrap = "require('../cli/node_modules/picgo/bin/picgo');\n"

func (a *App) picGoComponentsDirectory() string {
	return filepath.Join(filepath.Dir(a.preferencePath()), "components")
}

// Discovery only examines the application's own component layout. Never follow
// links, execute candidates, read host credentials, or search arbitrary folders.
func (a *App) validManagedPicGoCLI(entry string) bool {
	root := a.picGoComponentsDirectory()
	rel, err := filepath.Rel(root, entry)
	parts := strings.Split(rel, string(filepath.Separator))
	if err != nil || !filepath.IsAbs(entry) || len(parts) != 3 ||
		!strings.HasPrefix(parts[0], "picgo-3.2.0-") || parts[1] != "runtime" || parts[2] != managedPicGoEntry {
		return false
	}
	component := filepath.Join(root, parts[0])
	for _, dir := range []string{root, component, filepath.Join(component, "runtime"), filepath.Join(component, "cli"),
		filepath.Join(component, "cli", "node_modules"), filepath.Join(component, "cli", "node_modules", "picgo"),
		filepath.Join(component, "cli", "node_modules", "picgo", "bin")} {
		if info, err := os.Lstat(dir); err != nil || !info.IsDir() || info.Mode()&os.ModeSymlink != 0 {
			return false
		}
	}
	read := func(path string, limit int64) []byte {
		info, err := os.Lstat(path)
		if err != nil || !info.Mode().IsRegular() || info.Size() > limit {
			return nil
		}
		data, _ := os.ReadFile(path)
		return data
	}
	if !bytes.Equal(read(entry, 1024), []byte(managedPicGoBootstrap)) ||
		!bytes.Equal(read(filepath.Join(component, "cli", "package.json"), int64(len(picGoPackage))), picGoPackage) ||
		!bytes.Equal(read(filepath.Join(component, "cli", "package-lock.json"), int64(len(picGoPackageLock))), picGoPackageLock) {
		return false
	}
	var pkg struct{ Name, Version string }
	if json.Unmarshal(read(filepath.Join(component, "cli", "node_modules", "picgo", "package.json"), 64*1024), &pkg) != nil ||
		pkg.Name != "picgo" || pkg.Version != "3.2.0" {
		return false
	}
	if info, err := os.Lstat(filepath.Join(component, "cli", "node_modules", "picgo", "bin", "picgo")); err != nil || !info.Mode().IsRegular() {
		return false
	}
	// The existing resolver also requires a private, regular Node executable.
	_, _, err = resolvePicGoCLI(entry)
	return err == nil
}

func (a *App) managedPicGoCLI(prefs Preferences) string {
	if a.validManagedPicGoCLI(prefs.PicGoManagedCLIPath) {
		return prefs.PicGoManagedCLIPath
	}
	root := a.picGoComponentsDirectory()
	info, err := os.Lstat(root)
	if err != nil || !info.IsDir() || info.Mode()&os.ModeSymlink != 0 {
		return ""
	}
	dir, err := os.Open(root)
	if err != nil {
		return ""
	}
	defer dir.Close()
	// Bound legacy discovery; this is not a recursive filesystem scan.
	entries, _ := dir.ReadDir(256)
	type candidate struct {
		path     string
		modified int64
	}
	var candidates []candidate
	for _, item := range entries {
		if !item.IsDir() || !strings.HasPrefix(item.Name(), "picgo-3.2.0-") {
			continue
		}
		entry := filepath.Join(root, item.Name(), "runtime", managedPicGoEntry)
		if !a.validManagedPicGoCLI(entry) {
			continue
		}
		info, err := item.Info()
		if err == nil {
			candidates = append(candidates, candidate{entry, info.ModTime().UnixNano()})
		}
	}
	sort.Slice(candidates, func(i, j int) bool {
		if candidates[i].modified == candidates[j].modified {
			return candidates[i].path < candidates[j].path
		}
		return candidates[i].modified > candidates[j].modified
	})
	if len(candidates) > 0 {
		return candidates[0].path
	}
	return ""
}

func (a *App) effectivePicGoCLIPath(path string) string {
	if strings.TrimSpace(path) != "" {
		return path // Never replace an explicit user choice, even if unavailable.
	}
	prefs, err := a.readPreferences()
	if err == nil {
		return a.managedPicGoCLI(prefs)
	}
	return ""
}

func (a *App) rememberPreparedPicGoCLI(entry string) error {
	if !a.validManagedPicGoCLI(entry) {
		return errors.New("PICGO_PREPARE_VERIFY")
	}
	_, err := a.updatePreferences(func(prefs *Preferences) { prefs.PicGoManagedCLIPath = entry })
	return err
}
