package main

import (
	"encoding/json"
	"errors"
	"os"
	"path/filepath"
	"runtime"
	"strings"
	"time"
)

const macSecurityBookmarkStoreVersion = 1

type macSecurityBookmarkEntry struct {
	ScopePath string `json:"scopePath"`
	Data      string `json:"data"`
	Directory bool   `json:"directory"`
	UpdatedAt string `json:"updatedAt"`
}

type macSecurityBookmarkStore struct {
	Version   int                                 `json:"version"`
	Bookmarks map[string]macSecurityBookmarkEntry `json:"bookmarks"`
}

func (a *App) macSecurityBookmarkPath() string {
	if a.preferencesOverride != "" {
		return filepath.Join(filepath.Dir(a.preferencesOverride), "mac-security-bookmarks.json")
	}
	base, err := os.UserConfigDir()
	if err != nil {
		base = filepath.Dir(os.Args[0])
	}
	return filepath.Join(base, appNameZH, "mac-security-bookmarks.json")
}

func newMacSecurityBookmarkStore() macSecurityBookmarkStore {
	return macSecurityBookmarkStore{
		Version:   macSecurityBookmarkStoreVersion,
		Bookmarks: make(map[string]macSecurityBookmarkEntry),
	}
}

func (a *App) readMacSecurityBookmarkStoreUnlocked() macSecurityBookmarkStore {
	store := newMacSecurityBookmarkStore()
	data, err := os.ReadFile(a.macSecurityBookmarkPath())
	if err != nil || json.Unmarshal(data, &store) != nil {
		return newMacSecurityBookmarkStore()
	}
	if store.Bookmarks == nil {
		store.Bookmarks = make(map[string]macSecurityBookmarkEntry)
	}
	store.Version = macSecurityBookmarkStoreVersion
	return store
}

func (a *App) writeMacSecurityBookmarkStoreUnlocked(store macSecurityBookmarkStore) error {
	path := a.macSecurityBookmarkPath()
	if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
		return err
	}
	data, err := json.MarshalIndent(store, "", "  ")
	if err != nil {
		return err
	}
	return writeFileAtomically(path, data)
}

func macSecurityBookmarkKey(path string) string {
	absPath, err := filepath.Abs(filepath.Clean(strings.TrimSpace(path)))
	if err != nil {
		return filepath.Clean(strings.TrimSpace(path))
	}
	return absPath
}

// rememberMacSecurityScopedPath must be called while macOS still has the
// user's explicit consent from NSOpenPanel, NSSavePanel, Finder, or an app-open
// event. Failure is intentionally non-fatal: the selected document remains
// usable for the current process and the existing reauthorization flow stays
// available as a fallback.
func (a *App) rememberMacSecurityScopedPath(path string, directory bool) error {
	if runtime.GOOS != "darwin" || strings.TrimSpace(path) == "" {
		return nil
	}
	scopePath := macSecurityBookmarkKey(path)
	bookmark, err := createMacSecurityScopedBookmark(scopePath)
	if err != nil {
		return err
	}
	entry := macSecurityBookmarkEntry{
		ScopePath: scopePath,
		Data:      bookmark,
		Directory: directory,
		UpdatedAt: time.Now().UTC().Format(time.RFC3339Nano),
	}
	a.securityBookmarksMu.Lock()
	defer a.securityBookmarksMu.Unlock()
	store := a.readMacSecurityBookmarkStoreUnlocked()
	store.Bookmarks[scopePath] = entry
	return a.writeMacSecurityBookmarkStoreUnlocked(store)
}

func (a *App) refreshMacSecurityBookmark(entry macSecurityBookmarkEntry, resolvedScope string) {
	bookmark, err := createMacSecurityScopedBookmark(resolvedScope)
	if err != nil {
		return
	}
	entry.Data = bookmark
	entry.UpdatedAt = time.Now().UTC().Format(time.RFC3339Nano)
	a.securityBookmarksMu.Lock()
	defer a.securityBookmarksMu.Unlock()
	store := a.readMacSecurityBookmarkStoreUnlocked()
	originalKey := macSecurityBookmarkKey(entry.ScopePath)
	store.Bookmarks[originalKey] = entry
	resolvedKey := macSecurityBookmarkKey(resolvedScope)
	if resolvedKey != originalKey {
		resolvedEntry := entry
		resolvedEntry.ScopePath = resolvedKey
		store.Bookmarks[resolvedKey] = resolvedEntry
	}
	_ = a.writeMacSecurityBookmarkStoreUnlocked(store)
}

func pathInsideBookmarkScope(scopePath, requestedPath string) (string, bool) {
	relative, err := filepath.Rel(filepath.Clean(scopePath), filepath.Clean(requestedPath))
	if err != nil || relative == ".." || strings.HasPrefix(relative, ".."+string(filepath.Separator)) {
		return "", false
	}
	return relative, true
}

func selectMacSecurityBookmark(bookmarks map[string]macSecurityBookmarkEntry, requestedPath string) (macSecurityBookmarkEntry, bool) {
	requestedPath = macSecurityBookmarkKey(requestedPath)
	if exact, ok := bookmarks[requestedPath]; ok && strings.TrimSpace(exact.Data) != "" {
		return exact, true
	}
	var selected macSecurityBookmarkEntry
	found := false
	for _, entry := range bookmarks {
		if !entry.Directory || strings.TrimSpace(entry.Data) == "" {
			continue
		}
		if _, inside := pathInsideBookmarkScope(entry.ScopePath, requestedPath); !inside {
			continue
		}
		if !found || len(filepath.Clean(entry.ScopePath)) > len(filepath.Clean(selected.ScopePath)) {
			selected = entry
			found = true
		}
	}
	return selected, found
}

func (a *App) findMacSecurityBookmark(requestedPath string) (macSecurityBookmarkEntry, bool) {
	if runtime.GOOS != "darwin" {
		return macSecurityBookmarkEntry{}, false
	}
	a.securityBookmarksMu.Lock()
	defer a.securityBookmarksMu.Unlock()
	store := a.readMacSecurityBookmarkStoreUnlocked()
	return selectMacSecurityBookmark(store.Bookmarks, requestedPath)
}

// withMacSecurityScopedPath resolves the most specific stored bookmark and
// keeps its security scope active only for the supplied operation. The caller
// may fall back to normal filesystem access when found is false or resolution
// fails, which keeps unsigned and non-sandboxed builds working as before.
func (a *App) withMacSecurityScopedPath(requestedPath string, operation func(string) error) (resolvedPath string, found bool, err error) {
	entry, found := a.findMacSecurityBookmark(requestedPath)
	if !found {
		return "", false, nil
	}
	resolvedScope, stale, release, err := startAccessingMacSecurityScopedBookmark(entry.Data)
	if err != nil {
		return "", true, err
	}
	defer release()

	resolvedPath = resolvedScope
	if entry.Directory {
		relative, inside := pathInsideBookmarkScope(entry.ScopePath, requestedPath)
		if !inside {
			return "", true, os.ErrPermission
		}
		resolvedPath = filepath.Join(resolvedScope, relative)
	}
	if err := operation(resolvedPath); err != nil {
		return resolvedPath, true, err
	}
	if stale {
		// Refresh while the resolved security scope is active. A failure here
		// must not turn a successful document read into an application error.
		a.refreshMacSecurityBookmark(entry, resolvedScope)
	}
	return resolvedPath, true, nil
}

func (a *App) writeDocumentWithMacBookmark(filePath string, content []byte) (string, bool, error) {
	return a.withMacSecurityScopedPath(filePath, func(accessiblePath string) error {
		return writeDocumentAtomically(accessiblePath, content)
	})
}

func (a *App) readDocumentWithMacBookmark(filePath string) ([]byte, os.FileInfo, string, bool, error) {
	var data []byte
	var info os.FileInfo
	resolved, found, err := a.withMacSecurityScopedPath(filePath, func(accessiblePath string) error {
		var readErr error
		data, readErr = readDocumentBytes(accessiblePath)
		if readErr != nil {
			return readErr
		}
		info, readErr = os.Stat(accessiblePath)
		return readErr
	})
	return data, info, resolved, found, err
}

func joinDocumentAccessErrors(primary, bookmark error) error {
	if primary == nil {
		return bookmark
	}
	if bookmark == nil {
		return primary
	}
	return errors.Join(primary, bookmark)
}
