package main

import (
	"net/url"
	"os"
	"path/filepath"
	"strings"
)

// Package references never authorize access outside a backend-created workspace.
func (a *App) bundleWorkspaceContext(name string) (bundleSessionManifest, string, bool, error) {
	var empty bundleSessionManifest
	absolute, err := filepath.Abs(filepath.Clean(name))
	if err != nil {
		return empty, "", false, err
	}
	relative, err := filepath.Rel(a.bundleWorkspaceRoot(), absolute)
	if err != nil || relative == ".." || strings.HasPrefix(relative, ".."+string(filepath.Separator)) {
		return empty, "", false, nil
	}
	parts := strings.Split(relative, string(filepath.Separator))
	if len(parts) < 2 || !validBundleID(parts[0]) || parts[1] != "work" {
		return empty, "", true, textPackError("BUNDLE_SESSION_INVALID")
	}
	manifest, dir, err := a.bundleManifest(parts[0])
	if err != nil {
		return empty, "", true, err
	}
	work := filepath.Join(dir, "work")
	if err := textPackNoLinks(absolute); err != nil {
		return empty, "", true, err
	}
	return manifest, work, true, nil
}

func (a *App) bundleWorkspaceImagePath(reference, directory string) (string, bool, error) {
	_, work, scoped, err := a.bundleWorkspaceContext(directory)
	if !scoped || err != nil {
		return "", scoped, err
	}
	parsed, err := url.Parse(strings.TrimSpace(reference))
	if err != nil || parsed.Scheme != "" || parsed.Host != "" || parsed.RawQuery != "" || parsed.Fragment != "" ||
		strings.Contains(reference, "\\") || filepath.IsAbs(reference) || filepath.VolumeName(reference) != "" {
		return "", true, textPackError("BUNDLE_RESOURCE_OUTSIDE")
	}
	local := parsed.Path // Decode URL path once, not twice.
	for strings.HasPrefix(local, "./") {
		local = strings.TrimPrefix(local, "./")
	}
	if validateTextPackPath(local, false) != nil {
		return "", true, textPackError("BUNDLE_RESOURCE_OUTSIDE")
	}
	resolved := filepath.Join(directory, filepath.FromSlash(local))
	relative, err := filepath.Rel(work, resolved)
	if err != nil || relative == ".." || strings.HasPrefix(relative, ".."+string(filepath.Separator)) {
		return "", true, textPackError("BUNDLE_RESOURCE_OUTSIDE")
	}
	if err := textPackNoLinks(resolved); err != nil {
		return "", true, err
	}
	return resolved, true, nil
}

// Only export-picker defaults use the original name; resource IO stays scoped.
func (a *App) bundleResourceOrigin(resource string) string {
	manifest, work, scoped, err := a.bundleWorkspaceContext(resource)
	if !scoped || err != nil {
		return resource
	}
	if sameFilesystemPath(filepath.Join(work, filepath.FromSlash(manifest.TextEntry)), resource) {
		return manifest.SourcePath
	}
	return resource
}

func textPackNoLinksAllowMissing(name string) error {
	for {
		_, err := os.Lstat(name)
		if err == nil {
			return textPackNoLinks(name)
		}
		if !os.IsNotExist(err) {
			return err
		}
		parent := filepath.Dir(name)
		if parent == name {
			return err
		}
		name = parent
	}
}

func bundlePathInside(directory, target string) (bool, error) {
	if !strings.EqualFold(filepath.VolumeName(directory), filepath.VolumeName(target)) {
		return false, nil
	}
	relative, err := filepath.Rel(directory, target)
	if err != nil {
		return false, err
	}
	return relative != ".." && !strings.HasPrefix(relative, ".."+string(filepath.Separator)), nil
}

func (a *App) validateBundleImageDestination(resource string) error {
	if isEditableBundlePath(resource) {
		return textPackError("BUNDLE_SESSION_REQUIRED")
	}
	manifest, work, scoped, err := a.bundleWorkspaceContext(resource)
	if !scoped {
		return nil
	}
	if err != nil {
		return err
	}
	if !sameFilesystemPath(resource, filepath.Join(work, filepath.FromSlash(manifest.TextEntry))) {
		return textPackError("BUNDLE_SESSION_INVALID")
	}
	return textPackNoLinksAllowMissing(filepath.Join(filepath.Dir(resource), "assets"))
}

// Image inserts, package opens/copies, rebases and original saves share the
// same allocation lock. Keep the quota check and full create-only write in one
// critical section: concurrent uploads must not each spend the same free bytes.
// No old workspace or recovery attachment is deleted to make room.
func (a *App) writeImageAsset(resource, preferredName string, data []byte) (string, error) {
	_, _, scoped, _ := a.bundleWorkspaceContext(resource)
	if !scoped {
		if err := a.validateBundleImageDestination(resource); err != nil {
			return "", err
		}
		return writeImageAsset(resource, preferredName, data)
	}
	bundleDocumentMu.Lock()
	defer bundleDocumentMu.Unlock()
	if err := a.validateBundleImageDestination(resource); err != nil {
		return "", err
	}
	used, _, err := a.bundleWorkspaceUsage()
	if err != nil {
		return "", err
	}
	if int64(len(data)) > bundleWorkspaceBudget-used {
		return "", textPackError("BUNDLE_SESSION_LIMIT")
	}
	return writeImageAsset(resource, preferredName, data)
}
