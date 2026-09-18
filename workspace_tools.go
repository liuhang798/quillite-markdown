package main

import (
	"crypto/rand"
	"encoding/hex"
	"errors"
	"io"
	"net/url"
	"os"
	"path/filepath"
	"strings"
	"time"
	"unicode/utf8"
)

// Tools scan only a bounded set of text files. No indexing, network requests,
// automatic deletion, or implicit replacement is performed.
type WorkspaceQuery struct {
	Root        string `json:"root"`
	Query       string `json:"query"`
	Filter      string `json:"filter"`
	Extension   string `json:"extension"`
	Replacement string `json:"replacement"`
	ExcludePath string `json:"excludePath"`
}
type WorkspaceMatch struct {
	Path         string `json:"path"`
	RelativePath string `json:"relativePath"`
	Line         int    `json:"line"`
	Text         string `json:"text"`
}
type WorkspaceSearchResult struct {
	Matches []WorkspaceMatch `json:"matches"`
	Scanned int              `json:"scanned"`
	Skipped int              `json:"skipped"`
	Limited bool             `json:"limited"`
}
type WorkspaceChange struct {
	Path         string `json:"path"`
	RelativePath string `json:"relativePath"`
	Before       string `json:"before"`
	After        string `json:"after"`
	Revision     string `json:"revision"`
	Count        int    `json:"count"`
}
type WorkspacePreview struct {
	Token   string            `json:"token"`
	Changes []WorkspaceChange `json:"changes"`
	Skipped int               `json:"skipped"`
	Limited bool              `json:"limited"`
}
type WorkspaceApplyResult struct {
	Path   string `json:"path"`
	Status string `json:"status"`
}
type workspaceReplacePlan struct {
	root     string
	rootInfo os.FileInfo
	token    string
	expires  time.Time
	changes  []WorkspaceChange
}

func validateWorkspaceQuery(q WorkspaceQuery) error {
	if strings.TrimSpace(q.Root) == "" || q.Query == "" || strings.ContainsAny(q.Query, "\r\n") || len(q.Query) > 4096 || len(q.Replacement) > 65536 || len(q.Filter) > 1024 {
		return errors.New("WORKSPACE_INVALID_QUERY")
	}
	if q.Extension != "" && !markdownExtensions[q.Extension] {
		return errors.New("WORKSPACE_INVALID_TYPE")
	}
	return nil
}

// Reject links inside the selected tree, not just the leaf. Batch writes must not
// escape the chosen tree via a symlink/junction or an alias.
func workspaceRegularPath(root, path string) bool {
	root, err := filepath.Abs(root)
	if err != nil {
		return false
	}
	path, err = filepath.Abs(path)
	if err != nil {
		return false
	}
	rel, err := filepath.Rel(root, path)
	if err != nil || rel == "." || rel == ".." || strings.HasPrefix(rel, ".."+string(os.PathSeparator)) || filepath.IsAbs(rel) {
		return false
	}
	for current := path; ; current = filepath.Dir(current) {
		info, e := os.Lstat(current)
		if e != nil || info.Mode()&os.ModeSymlink != 0 {
			return false
		}
		if current == path && !info.Mode().IsRegular() {
			return false
		}
		if sameFilesystemPath(current, root) {
			break
		}
		parent := filepath.Dir(current)
		if parent == current {
			break
		}
	}
	return true
}

func boundedWorkspaceText(path string, limit int64) (string, error) {
	f, err := os.Open(path)
	if err != nil {
		return "", err
	}
	defer f.Close()
	info, err := f.Stat()
	if err != nil || !info.Mode().IsRegular() || info.Size() > limit {
		return "", errors.New("WORKSPACE_FILE_LIMIT")
	}
	b, err := io.ReadAll(io.LimitReader(f, limit+1))
	if err != nil {
		return "", err
	}
	if int64(len(b)) > limit || !utf8.Valid(b) || strings.ContainsRune(string(b), 0) {
		return "", errors.New("WORKSPACE_NOT_UTF8")
	}
	return string(b), nil
}

func (a *App) scanWorkspace(q WorkspaceQuery, limit int64, visit func(FolderFile, string) bool) (scanned, skipped int, limited bool, err error) {
	if err = validateWorkspaceQuery(q); err != nil {
		return
	}
	folder, e := a.ListFolder(q.Root)
	if e != nil {
		err = e
		return
	}
	limited = len(folder.Files) >= 800
	var total int
	deadline := time.Now().Add(15 * time.Second)
	for _, file := range folder.Files {
		if time.Now().After(deadline) {
			limited = true
			break
		}
		if q.Extension != "" && strings.ToLower(filepath.Ext(file.Path)) != q.Extension {
			continue
		}
		if !strings.Contains(strings.ToLower(filepath.ToSlash(file.RelativePath)), strings.ToLower(q.Filter)) {
			continue
		}
		if sameFilesystemPath(file.Path, q.ExcludePath) {
			skipped++
			continue
		}
		var content string
		read := func(path string) error {
			if !workspaceRegularPath(folder.Root, path) {
				return errors.New("WORKSPACE_UNSAFE_PATH")
			}
			var readErr error
			content, readErr = boundedWorkspaceText(path, limit)
			return readErr
		}
		_, found, readErr := a.withMacSecurityScopedPath(file.Path, read)
		if !found {
			readErr = read(file.Path)
		}
		if readErr != nil {
			skipped++
			continue
		}
		total += len(content)
		if total > 32*1024*1024 {
			limited = true
			break
		}
		scanned++
		if !visit(file, content) {
			limited = true
			break
		}
	}
	return
}

func (a *App) SearchWorkspace(q WorkspaceQuery) (WorkspaceSearchResult, error) {
	r := WorkspaceSearchResult{Matches: []WorkspaceMatch{}}
	var err error
	r.Scanned, r.Skipped, r.Limited, err = a.scanWorkspace(q, 2*1024*1024, func(f FolderFile, s string) bool {
		for i, line := range strings.Split(s, "\n") {
			if at := strings.Index(line, q.Query); at >= 0 {
				start := at - 80
				if start < 0 {
					start = 0
				}
				for start > 0 && !utf8.RuneStart(line[start]) {
					start--
				}
				end := at + len(q.Query) + 160
				if end > len(line) {
					end = len(line)
				}
				for end < len(line) && !utf8.RuneStart(line[end]) {
					end++
				}
				r.Matches = append(r.Matches, WorkspaceMatch{f.Path, f.RelativePath, i + 1, line[start:end]})
				if len(r.Matches) >= 500 {
					return false
				}
			}
		}
		return true
	})
	return r, err
}

func (a *App) PreviewWorkspaceReplace(q WorkspaceQuery) (WorkspacePreview, error) {
	a.workspaceMu.Lock()
	defer a.workspaceMu.Unlock()
	a.workspacePlan = nil // every new preview invalidates the previous permission
	r := WorkspacePreview{Changes: []WorkspaceChange{}}
	if err := validateWorkspaceQuery(q); err != nil {
		return r, err
	}
	rootInfo, err := os.Stat(q.Root)
	if err != nil {
		return r, err
	}
	extraSkipped := 0
	_, skipped, limited, err := a.scanWorkspace(q, 256*1024, func(f FolderFile, s string) bool {
		n := strings.Count(s, q.Query)
		if n == 0 || q.Query == q.Replacement {
			return true
		}
		// Bound expansion before allocating a replacement string.
		if len(s)+n*(len(q.Replacement)-len(q.Query)) > 256*1024 {
			extraSkipped++
			return true
		}
		r.Changes = append(r.Changes, WorkspaceChange{f.Path, f.RelativePath, s, strings.ReplaceAll(s, q.Query, q.Replacement), documentRevision([]byte(s)), n})
		return len(r.Changes) < 40
	})
	r.Skipped = skipped + extraSkipped
	r.Limited = limited
	if err != nil {
		return r, err
	}
	id := make([]byte, 24)
	if _, err = rand.Read(id); err != nil {
		return r, err
	}
	r.Token = hex.EncodeToString(id)
	afterRoot, err := os.Stat(q.Root)
	if err != nil || !os.SameFile(rootInfo, afterRoot) {
		return r, errors.New("WORKSPACE_ROOT_CHANGED")
	}
	a.workspacePlan = &workspaceReplacePlan{root: q.Root, rootInfo: rootInfo, token: r.Token, expires: time.Now().Add(10 * time.Minute), changes: r.Changes}
	return r, nil
}

func (a *App) ApplyWorkspaceReplace(token string, selected []string) ([]WorkspaceApplyResult, error) {
	a.workspaceMu.Lock()
	defer a.workspaceMu.Unlock()
	p := a.workspacePlan
	if p == nil || p.token != token || time.Now().After(p.expires) {
		return nil, errors.New("WORKSPACE_PREVIEW_EXPIRED")
	}
	if len(selected) == 0 || len(selected) > len(p.changes) {
		return nil, errors.New("WORKSPACE_INVALID_SELECTION")
	}
	wanted := map[string]bool{}
	for _, path := range selected {
		found := false
		for _, c := range p.changes {
			if c.Path == path {
				found = true
				break
			}
		}
		if !found || wanted[path] {
			return nil, errors.New("WORKSPACE_INVALID_SELECTION")
		}
		wanted[path] = true
	}
	a.workspacePlan = nil // single-use, including partial failure; never retry automatically
	results := []WorkspaceApplyResult{}
	for _, c := range p.changes {
		if wanted[c.Path] {
			status := "saved"
			documentSaveMu.Lock()
			write := func(path string) error {
				rootInfo, err := os.Stat(p.root)
				if err != nil || !os.SameFile(p.rootInfo, rootInfo) {
					return errors.New("WORKSPACE_ROOT_CHANGED")
				}
				if !workspaceRegularPath(p.root, path) {
					return errors.New("WORKSPACE_UNSAFE_PATH")
				}
				if err := checkDocumentRevision(path, c.Revision); err != nil {
					return err
				}
				// History is mandatory for batch writes (unlike ordinary single saves).
				if err := a.captureDocumentVersion(path, c.After); err != nil {
					return err
				}
				return writeDocumentWithRevision(path, []byte(c.After), c.Revision)
			}
			_, found, err := a.withMacSecurityScopedPath(c.Path, write)
			if !found {
				err = write(c.Path)
			}
			documentSaveMu.Unlock()
			if errors.Is(err, errDocumentConflict) {
				status = "conflict"
			} else if err != nil {
				status = "failed"
			}
			results = append(results, WorkspaceApplyResult{c.Path, status})
		}
	}
	return results, nil
}

// This API only reports existence; it never fetches a remote image.
func (a *App) CheckDocumentAssets(documentPath string, references []string) ([]string, error) {
	if len(references) > 128 {
		return nil, errors.New("ASSET_CHECK_LIMIT")
	}
	missing := []string{}
	for _, ref := range references {
		isFileURL := strings.HasPrefix(strings.ToLower(ref), "file://")
		if (strings.Contains(ref, "://") && !isFileURL) || strings.HasPrefix(ref, "//") || strings.HasPrefix(ref, "data:") {
			continue
		}
		if isFileURL {
			u, e := url.Parse(ref)
			if e != nil || (u.Host != "" && !strings.EqualFold(u.Host, "localhost")) {
				missing = append(missing, ref)
				continue
			}
		}
		path, err := resolveLocalImagePath(ref, filepath.Dir(documentPath))
		if err != nil {
			missing = append(missing, ref)
			continue
		}
		if strings.HasPrefix(path, `\\`) || strings.HasPrefix(path, "//") {
			missing = append(missing, ref)
			continue
		}
		check := func(p string) error {
			info, e := os.Stat(p)
			if e != nil {
				return e
			}
			if !info.Mode().IsRegular() {
				return errors.New("not regular")
			}
			return nil
		}
		_, found, err := a.withMacSecurityScopedPath(path, check)
		if !found {
			err = check(path)
		}
		if err != nil {
			missing = append(missing, ref)
		}
	}
	return missing, nil
}

func (a *App) ShowDocumentBackupDirectory() error {
	path := a.recoverySnapshotPath()
	if _, err := os.Stat(path); err != nil {
		path = a.preferencePath()
	}
	return a.ShowInFolder(path)
}
