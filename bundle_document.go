package main

import (
	"bytes"
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"io/fs"
	"os"
	"path/filepath"
	"sort"
	"strings"
	"sync"
	"time"

	wailsruntime "github.com/wailsapp/wails/v2/pkg/runtime"
)

// A workspace is durable recovery material, not a temporary unpacked document
// identity. It is never automatically deleted, even after a successful save.
const bundleWorkspaceBudget int64 = 2 * 1024 * 1024 * 1024
const bundleWorkspaceCount = 64

var bundleDocumentMu sync.Mutex

type bundleSessionManifest struct {
	Version         int               `json:"version"`
	ID              string            `json:"id"`
	SourcePath      string            `json:"sourcePath"`
	Kind            string            `json:"kind"`
	TextEntry       string            `json:"textEntry"`
	BaseArchiveHash string            `json:"baseArchiveHash"`
	BaseRevision    string            `json:"baseRevision"`
	CurrentRevision string            `json:"currentRevision"`
	CommittedAssets map[string]string `json:"committedAssets,omitempty"`
}

type bundleSession struct {
	manifest bundleSessionManifest
	dir      string
	base     *editableBundleSnapshot
}

func isEditableBundlePath(name string) bool {
	ext := strings.ToLower(filepath.Ext(filepath.Clean(name)))
	return ext == ".textpack" || ext == ".textbundle"
}

func validBundleID(id string) bool {
	data, err := hex.DecodeString(id)
	return err == nil && len(data) == 16 && id == strings.ToLower(id)
}

func validBundleRevision(revision string) bool {
	data, err := hex.DecodeString(revision)
	return err == nil && len(data) == 32
}

func (a *App) bundleWorkspaceRoot() string {
	return filepath.Join(filepath.Dir(a.preferencePath()), "bundle-sessions")
}

func (a *App) bundleManifest(id string) (bundleSessionManifest, string, error) {
	var manifest bundleSessionManifest
	if !validBundleID(id) {
		return manifest, "", textPackError("BUNDLE_SESSION_INVALID")
	}
	dir := filepath.Join(a.bundleWorkspaceRoot(), id)
	root, err := textPackOpenRoot(dir)
	if err != nil {
		return manifest, "", err
	}
	defer root.Close()
	data, err := textPackReadRootFile(root, "manifest.json", 1024*1024)
	if err != nil || json.Unmarshal(data, &manifest) != nil || manifest.Version != 1 || manifest.ID != id {
		return manifest, "", textPackError("BUNDLE_SESSION_INVALID")
	}
	if !filepath.IsAbs(manifest.SourcePath) || filepath.Clean(manifest.SourcePath) != manifest.SourcePath ||
		!isEditableBundlePath(manifest.SourcePath) || !validBundleRevision(manifest.BaseRevision) ||
		!validBundleRevision(manifest.CurrentRevision) || !validBundleRevision(manifest.BaseArchiveHash) ||
		(manifest.Kind != "textpack" && manifest.Kind != "textbundle") || validateTextPackPath(manifest.TextEntry, false) != nil {
		return manifest, "", textPackError("BUNDLE_SESSION_INVALID")
	}
	if manifest.CommittedAssets == nil {
		manifest.CommittedAssets = map[string]string{}
	}
	return manifest, dir, nil
}

func (a *App) loadBundleSession(id string) (*bundleSession, error) {
	manifest, dir, err := a.bundleManifest(id)
	if err != nil {
		return nil, err
	}
	base, err := readEditableBundle(filepath.Join(dir, "base.textpack"))
	if err != nil || base.Revision != manifest.BaseArchiveHash || base.TextEntry != manifest.TextEntry {
		return nil, textPackError("BUNDLE_SESSION_CHANGED")
	}
	if manifest.Kind == "textpack" && manifest.BaseRevision != base.Revision ||
		manifest.Kind == "textbundle" && manifest.BaseRevision != editableBundleDirectoryRevision(base.Files) {
		return nil, textPackError("BUNDLE_SESSION_CHANGED")
	}
	base.SourcePath, base.Kind, base.Revision = manifest.SourcePath, manifest.Kind, manifest.BaseRevision
	return &bundleSession{manifest: manifest, dir: dir, base: base}, nil
}

// All payloads are create-only. Failure leaves the newly created material in
// place, rather than deleting a pathname another process might have replaced.
func writeBundleWorkspaceFile(name string, data []byte) error {
	if err := textPackNoLinks(filepath.Dir(name)); err != nil {
		return err
	}
	file, err := os.OpenFile(name, os.O_WRONLY|os.O_CREATE|os.O_EXCL, 0o600)
	if err != nil {
		return err
	}
	_, err = file.Write(data)
	if err == nil {
		err = file.Sync()
	}
	if closeErr := file.Close(); err == nil {
		err = closeErr
	}
	return err
}

func (a *App) bundleWorkspaceUsage() (int64, int, error) {
	root := a.bundleWorkspaceRoot()
	if err := os.MkdirAll(root, 0o700); err != nil {
		return 0, 0, err
	}
	if err := textPackNoLinks(root); err != nil {
		return 0, 0, err
	}
	entries, err := os.ReadDir(root)
	if err != nil {
		return 0, 0, err
	}
	var total int64
	count := 0
	err = filepath.WalkDir(root, func(name string, entry fs.DirEntry, walkErr error) error {
		if walkErr != nil {
			return walkErr
		}
		if entry.Type()&os.ModeSymlink != 0 || textPackCheckReparse(name) != nil {
			return textPackError("BUNDLE_SESSION_INVALID")
		}
		count++
		if count > bundleWorkspaceCount*(textPackMaxEntries+8) {
			return textPackError("BUNDLE_SESSION_LIMIT")
		}
		if !entry.IsDir() {
			info, err := entry.Info()
			if err != nil {
				return err
			}
			total += info.Size()
			if total > bundleWorkspaceBudget {
				return textPackError("BUNDLE_SESSION_LIMIT")
			}
		}
		return nil
	})
	return total, len(entries), err
}

func (a *App) newBundleSession(snapshot *editableBundleSnapshot) (*bundleSession, error) {
	archive, err := buildEditableTextPack(snapshot, snapshot.Content, nil)
	if err != nil {
		return nil, err
	}
	var filesSize int64
	for _, data := range snapshot.Files {
		filesSize += int64(len(data))
	}
	token := make([]byte, 16)
	if _, err := rand.Read(token); err != nil {
		return nil, err
	}
	id := hex.EncodeToString(token)
	dir := filepath.Join(a.bundleWorkspaceRoot(), id)
	session := &bundleSession{dir: dir, base: snapshot, manifest: bundleSessionManifest{
		Version: 1, ID: id, SourcePath: snapshot.SourcePath, Kind: snapshot.Kind, TextEntry: snapshot.TextEntry,
		BaseArchiveHash: documentRevision(archive), BaseRevision: snapshot.Revision, CurrentRevision: snapshot.Revision,
		CommittedAssets: map[string]string{},
	}}
	data, err := json.Marshal(session.manifest)
	if err != nil {
		return nil, err
	}
	used, count, err := a.bundleWorkspaceUsage()
	if err != nil {
		return nil, err
	}
	if count >= bundleWorkspaceCount || used+filesSize+int64(len(archive))+int64(len(data)) > bundleWorkspaceBudget {
		return nil, textPackError("BUNDLE_SESSION_LIMIT")
	}
	if err := os.Mkdir(dir, 0o700); err != nil {
		return nil, err
	}
	if err := writeBundleWorkspaceFile(filepath.Join(dir, "base.textpack"), archive); err != nil {
		return nil, err
	}
	work := filepath.Join(dir, "work")
	if err := os.Mkdir(work, 0o700); err != nil {
		return nil, err
	}
	names := make([]string, 0, len(snapshot.Files))
	for name := range snapshot.Files {
		names = append(names, name)
	}
	sort.Strings(names)
	for _, name := range names {
		target := filepath.Join(work, filepath.FromSlash(name))
		if err := os.MkdirAll(filepath.Dir(target), 0o700); err != nil {
			return nil, err
		}
		if err := writeBundleWorkspaceFile(target, snapshot.Files[name]); err != nil {
			return nil, err
		}
	}
	if err := writeBundleWorkspaceFile(filepath.Join(dir, "manifest.json"), data); err != nil {
		return nil, err
	}
	return session, nil
}

func bundleDocumentReceipt(session *bundleSession, content, revision string) *Document {
	m := session.manifest
	resource := filepath.Join(session.dir, "work", filepath.FromSlash(m.TextEntry))
	return &Document{Path: m.SourcePath, Name: filepath.Base(m.SourcePath), Directory: filepath.Dir(resource),
		Content: content, Revision: revision, Size: int64(len(content)), ModifiedAt: time.Now().Format(time.RFC3339Nano),
		BundleKind: m.Kind, BundleSessionID: m.ID, BundleTextPath: m.TextEntry, ResourcePath: resource,
		PackageDirectory: filepath.Dir(m.SourcePath)}
}

func (a *App) readBundleDocument(filePath string, remember bool) (*Document, error) {
	bundleDocumentMu.Lock()
	defer bundleDocumentMu.Unlock()
	var snapshot *editableBundleSnapshot
	read := func(accessible string) (err error) { snapshot, err = readEditableBundle(accessible); return err }
	_, found, err := a.withMacSecurityScopedPath(filePath, read)
	if !found {
		err = read(filePath)
	}
	if err != nil {
		return nil, err
	}
	// Reuse only a byte-identical published revision. A conflict read creates
	// another workspace; it never replaces the dirty editor's staging directory.
	var session *bundleSession
	entries, _ := os.ReadDir(a.bundleWorkspaceRoot())
	for _, entry := range entries {
		manifest, _, manifestErr := a.bundleManifest(entry.Name())
		if manifestErr != nil || !sameFilesystemPath(manifest.SourcePath, snapshot.SourcePath) || manifest.CurrentRevision != snapshot.Revision {
			continue
		}
		if candidate, loadErr := a.loadBundleSession(manifest.ID); loadErr == nil {
			if assets, assetErr := candidate.addedAssets(); assetErr == nil && len(assets) == len(candidate.manifest.CommittedAssets) {
				// A normal open must not quietly adopt attachments belonging to
				// an abandoned/unsaved editor. Only explicit resume/rebase can.
				session = candidate
				break
			}
		}
	}
	if session == nil {
		session, err = a.newBundleSession(snapshot)
		if err != nil {
			return nil, err
		}
	}
	if remember {
		_ = a.rememberFile(snapshot.SourcePath)
	}
	return bundleDocumentReceipt(session, snapshot.Content, snapshot.Revision), nil
}

func (a *App) OpenEditableBundle(kind string) (*Document, error) {
	var selected string
	var err error
	switch kind {
	case "textpack":
		selected, err = wailsruntime.OpenFileDialog(a.ctx, wailsruntime.OpenDialogOptions{Title: a.textPackLabel("直接打开 TextPack", "Open TextPack for editing"), Filters: []wailsruntime.FileFilter{{DisplayName: "TextPack", Pattern: "*.textpack"}}})
	case "textbundle":
		selected, err = wailsruntime.OpenDirectoryDialog(a.ctx, wailsruntime.OpenDialogOptions{Title: a.textPackLabel("直接打开 TextBundle", "Open TextBundle for editing")})
	default:
		return nil, textPackError("BUNDLE_SESSION_INVALID")
	}
	if err != nil || selected == "" {
		return nil, err
	}
	_ = a.rememberMacSecurityScopedPath(selected, kind == "textbundle")
	return a.readBundleDocument(selected, true)
}

// Resume never replaces a recovery snapshot's authorization with today's disk
// revision. Missing/changed originals remain recoverable, but cannot autosave.
func (a *App) ResumeBundleDocument(source, id, baseRevision string) (*Document, error) {
	bundleDocumentMu.Lock()
	defer bundleDocumentMu.Unlock()
	session, err := a.loadBundleSession(id)
	if err != nil {
		return nil, err
	}
	if !sameFilesystemPath(source, session.manifest.SourcePath) {
		return nil, textPackError("BUNDLE_SESSION_INVALID")
	}
	if _, err := session.addedAssets(); err != nil {
		return nil, err
	}
	doc := bundleDocumentReceipt(session, session.base.Content, baseRevision)
	doc.BundleConflict = !validBundleRevision(baseRevision) || baseRevision != session.manifest.CurrentRevision || a.checkBundleRevision(session.manifest, baseRevision) != nil
	if !doc.BundleConflict {
		read := func(source string) error {
			current, readErr := readEditableBundle(source)
			if readErr != nil || current.Revision != baseRevision {
				doc.BundleConflict = true
				return nil
			}
			doc.Content = current.Content
			return nil
		}
		_, found, scopeErr := a.withMacSecurityScopedPath(session.manifest.SourcePath, read)
		if !found {
			scopeErr = read(session.manifest.SourcePath)
		}
		if scopeErr != nil {
			doc.BundleConflict = true
		}
	}
	return doc, nil
}

func (session *bundleSession) addedAssets() (map[string][]byte, error) {
	work := filepath.Join(session.dir, "work")
	files, err := readTextBundleDirectory(work)
	if err != nil {
		return nil, err
	}
	for name, original := range session.base.Files {
		actual, exists := files[name]
		if !exists || !bytes.Equal(actual, original) {
			return nil, textPackError("BUNDLE_SESSION_CHANGED")
		}
	}
	added := map[string][]byte{}
	for name, data := range files {
		if _, exists := session.base.Files[name]; exists {
			continue
		}
		if !strings.HasPrefix(name, session.base.Prefix+"assets/") {
			return nil, textPackError("BUNDLE_SESSION_CHANGED")
		}
		if _, err := textPackImageType(data); err != nil {
			return nil, textPackError("BUNDLE_SESSION_CHANGED")
		}
		if committed, exists := session.manifest.CommittedAssets[name]; exists && committed != documentRevision(data) {
			return nil, textPackError("BUNDLE_ASSET_CONFLICT")
		}
		added[name] = data
	}
	for name := range session.manifest.CommittedAssets {
		if _, exists := added[name]; !exists {
			return nil, textPackError("BUNDLE_ASSET_CONFLICT")
		}
	}
	return added, nil
}

func (a *App) checkBundleRevision(manifest bundleSessionManifest, expected string) error {
	if !validBundleRevision(expected) {
		return errDocumentConflict
	}
	check := func(source string) error {
		if !sameFilesystemPath(filepath.Clean(source), manifest.SourcePath) {
			return errDocumentConflict
		}
		if err := textPackNoLinks(source); err != nil {
			return err
		}
		if manifest.Kind == "textpack" {
			return checkDocumentRevisionWithLimit(source, expected, textPackMaxBytes)
		}
		files, err := readTextBundleDirectory(source)
		if err != nil || editableBundleDirectoryRevision(files) != expected {
			return errDocumentConflict
		}
		return nil
	}
	_, found, err := a.withMacSecurityScopedPath(manifest.SourcePath, check)
	if !found {
		err = check(manifest.SourcePath)
	}
	return err
}

func (a *App) validateBundleRecovery(input RecoverySnapshotInput) error {
	if input.BundleSessionID == "" && input.BundleKind == "" && !isEditableBundlePath(input.Path) {
		return nil
	}
	m, _, err := a.bundleManifest(input.BundleSessionID)
	if err != nil || m.Kind != input.BundleKind || !sameFilesystemPath(input.Path, m.SourcePath) {
		return textPackError("BUNDLE_SESSION_INVALID")
	}
	return nil
}

// This helper is deliberately not an authorization to rename/delete anything.
func bundleSourceMatches(session *bundleSession, source string) error {
	absolute, err := filepath.Abs(filepath.Clean(source))
	if err != nil || !sameFilesystemPath(absolute, session.manifest.SourcePath) {
		return textPackError("BUNDLE_SESSION_INVALID")
	}
	return nil
}
