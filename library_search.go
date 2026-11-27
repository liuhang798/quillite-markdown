package main

import (
	"bytes"
	"errors"
	"os"
	"path/filepath"
	"regexp"
	"strconv"
	"strings"
	"time"
	"unicode/utf8"

	wailsruntime "github.com/wailsapp/wails/v2/pkg/runtime"
)

type LibrarySearchResult struct {
	Paths   []string `json:"paths"`
	Skipped int      `json:"skipped"`
}

// Search never opens an editor session, updates Recent or returns document text.
// candidates restricts the search; membership comes from native preferences or
// the actual Explorer listing, not from paths supplied by the page.
func (a *App) SearchLibraryFiles(mode, root, query string, candidates []string) (LibrarySearchResult, error) {
	return a.searchLibraryFiles(mode, root, query, candidates, nil)
}

// A single authorized scan streams path-only deltas. The return value is
// always the complete result, even if a WebView misses the last event.
func (a *App) SearchLibraryFilesWithProgress(mode, root, query string, candidates []string, request int) (LibrarySearchResult, error) {
	a.mu.RLock()
	ctx := a.ctx
	a.mu.RUnlock()
	if ctx == nil || request <= 0 {
		return a.SearchLibraryFiles(mode, root, query, candidates)
	}
	event := "library:search:" + strconv.Itoa(request)
	return a.searchLibraryFiles(mode, root, query, candidates, func(paths []string) {
		wailsruntime.EventsEmit(ctx, event, paths)
	})
}

func (a *App) searchLibraryFiles(mode, root, query string, candidates []string, notify func([]string)) (LibrarySearchResult, error) {
	result := LibrarySearchResult{Paths: []string{}}
	version := a.librarySearchVersion.Add(1)
	if query == "" || len(candidates) == 0 {
		return result, nil // also cancels an in-flight scan when the input is cleared
	}
	if len(query) > 1024 {
		return result, errors.New("LIBRARY_INVALID_QUERY")
	}
	a.librarySearchMu.Lock()
	defer a.librarySearchMu.Unlock()
	if version != a.librarySearchVersion.Load() {
		return result, nil
	}
	prefs, err := a.readPreferences()
	if err != nil {
		return result, err
	}
	var allowed []string
	switch mode {
	case "recent":
		allowed = prefs.RecentFiles
	case "favorites":
		allowed = prefs.FavoriteFiles
	case "explorer":
		if !localLibraryPath(root) || !localLibraryPath(prefs.ExplorerRoot) {
			return result, errors.New("LIBRARY_FOLDER_CHANGED")
		}
		folder, err := a.ListFolder(prefs.ExplorerRoot)
		if err != nil {
			return result, err
		}
		// A macOS bookmark can resolve a previously selected, moved folder.
		if !sameFilesystemPath(root, folder.Root) {
			return result, errors.New("LIBRARY_FOLDER_CHANGED")
		}
		for _, file := range folder.Files {
			allowed = append(allowed, file.Path)
		}
	default:
		return result, errors.New("LIBRARY_INVALID_SCOPE")
	}

	wanted := make(map[string]bool, len(candidates))
	for _, path := range candidates {
		wanted[path] = true
	}
	match, err := regexp.Compile("(?i)" + regexp.QuoteMeta(query))
	if err != nil {
		return result, err
	}
	sent := 0
	var lastBatch time.Time
	for _, path := range allowed {
		if version != a.librarySearchVersion.Load() {
			return result, nil
		}
		if !wanted[path] {
			continue
		}
		delete(wanted, path)
		read := func(accessible string) error {
			if mode == "explorer" && !isEditableBundlePath(accessible) && !workspaceRegularPath(root, accessible) {
				return os.ErrPermission
			}
			body, err := librarySearchBody(accessible)
			if err == nil && match.Match(body) {
				result.Paths = append(result.Paths, path)
			}
			return err
		}
		if !localLibraryPath(path) {
			result.Skipped++
			continue
		}
		_, found, err := a.withMacSecurityScopedPath(path, read)
		if !found {
			err = read(path)
		}
		if err != nil {
			result.Skipped++
		}
		if notify != nil && sent < len(result.Paths) && time.Since(lastBatch) >= 80*time.Millisecond && version == a.librarySearchVersion.Load() {
			notify(result.Paths[sent:len(result.Paths):len(result.Paths)])
			sent = len(result.Paths)
			lastBatch = time.Now()
		}
	}
	result.Skipped += len(wanted) // moved, deleted or no longer in this list
	return result, nil
}

func localLibraryPath(path string) bool {
	return filepath.IsAbs(path) && !strings.HasPrefix(filepath.ToSlash(path), "//")
}

// Only the body and its metadata are needed; never unpack attachments or
// create a package workspace simply because the user typed into the sidebar.
func libraryBundleEntry(name string) bool {
	if wrapper, entry, ok := strings.Cut(name, "/"); ok {
		if !strings.HasSuffix(wrapper, ".textbundle") {
			return false
		}
		name = entry
	} else if strings.HasSuffix(name, ".textbundle") {
		return true
	}
	return !strings.Contains(name, "/") && (name == "info.json" || strings.HasPrefix(name, "text."))
}

func librarySearchBody(path string) ([]byte, error) {
	if !localLibraryPath(path) {
		return nil, os.ErrPermission
	}
	var entries map[string][]byte
	var err error
	switch strings.ToLower(filepath.Ext(path)) {
	case ".textpack":
		entries, err = readTextPackEntries(path, libraryBundleEntry)
	case ".textbundle":
		entries, err = readTextBundleEntries(path, libraryBundleEntry)
	default:
		// Ordinary Recent/Favorites entries may live under an explicitly
		// selected alias (e.g. /var on macOS). Pin the parent and reject a
		// non-regular or substituted leaf before reading its bounded bytes.
		parent, err := os.OpenRoot(filepath.Dir(path))
		if err != nil {
			return nil, err
		}
		defer parent.Close()
		if err := textPackCheckReparse(path); err != nil {
			return nil, err
		}
		data, err := textPackReadRootFile(parent, filepath.Base(path), maxSupportedDocumentBytes)
		if err == nil && (!utf8.Valid(data) || bytes.IndexByte(data, 0) >= 0) {
			return nil, os.ErrInvalid
		}
		return data, err
	}
	if err != nil {
		return nil, err
	}
	doc, err := parseTextBundleFiles(entries)
	if err != nil {
		return nil, err
	}
	return []byte(doc.Content), nil
}
