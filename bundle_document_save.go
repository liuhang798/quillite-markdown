package main

import (
	"bytes"
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"strings"

	wailsruntime "github.com/wailsapp/wails/v2/pkg/runtime"
)

func (a *App) SaveBundleDocument(source, content, revision, sessionID string) (*Document, error) {
	bundleDocumentMu.Lock()
	defer bundleDocumentMu.Unlock()
	documentSaveMu.Lock()
	defer documentSaveMu.Unlock()
	session, err := a.loadBundleSession(sessionID)
	if err != nil {
		return nil, err
	}
	if err := bundleSourceMatches(session, source); err != nil {
		return nil, err
	}
	if !validBundleRevision(revision) || revision != session.manifest.CurrentRevision {
		return nil, errDocumentConflict
	}
	if err := a.checkBundleRevision(session.manifest, revision); err != nil {
		return nil, fmt.Errorf("%w: %v", errDocumentConflict, err)
	}
	assets, err := session.addedAssets()
	if err != nil {
		return nil, err
	}
	files, err := editableBundleFilesWithContent(session.base, content, assets)
	if err != nil {
		return nil, err
	}
	_ = a.captureDocumentVersion(source, content)
	var nextRevision string
	write := func(accessible string) error {
		if !sameFilesystemPath(filepath.Clean(accessible), session.manifest.SourcePath) {
			return errDocumentConflict
		}
		if session.manifest.Kind == "textpack" {
			data, err := buildEditableTextPack(session.base, content, assets)
			if err != nil {
				return err
			}
			nextRevision = documentRevision(data)
			if nextRevision == revision {
				return nil
			}
			return writeBundleDocumentWithRevision(accessible, data, revision, textPackMaxBytes, filepath.Dir(accessible), nil)
		}
		if err := saveTextBundleDirectory(accessible, session.base, files, revision); err != nil {
			return err
		}
		nextRevision = editableBundleDirectoryRevision(files)
		return nil
	}
	_, found, err := a.withMacSecurityScopedPath(source, write)
	if !found {
		err = write(source)
	}
	if err != nil {
		return nil, err
	}
	// Describe exactly this submitted generation, not a reread of a pathname
	// another editor may already have replaced. Its later change will conflict.
	session.manifest.CurrentRevision = nextRevision
	for name, data := range assets {
		session.manifest.CommittedAssets[name] = documentRevision(data)
	}
	doc := bundleDocumentReceipt(session, content, nextRevision)
	if err := a.persistBundleManifest(session); err != nil {
		// The package has been durably saved, but further saves must reload the
		// session. Returning an exact receipt avoids claiming the write failed.
		doc.Warning = "BUNDLE_SESSION_PERSIST_WARNING"
	}
	_ = a.rememberFile(source)
	return doc, nil
}

func (a *App) persistBundleManifest(session *bundleSession) error {
	name := filepath.Join(session.dir, "manifest.json")
	if err := textPackNoLinks(name); err != nil {
		return err
	}
	data, err := json.Marshal(session.manifest)
	if err != nil {
		return err
	}
	old, err := os.ReadFile(name)
	if err != nil {
		return err
	}
	if bytes.Equal(old, data) {
		return nil
	}
	used, _, err := a.bundleWorkspaceUsage()
	if err != nil {
		return err
	}
	// Atomic replacement temporarily retains both manifests. If no room is
	// available, leave the old recovery record and return the committed-save
	// warning rather than growing storage or deleting older recovery data.
	if int64(len(data)) > bundleWorkspaceBudget-used {
		return textPackError("BUNDLE_SESSION_LIMIT")
	}
	return writeFileAtomically(name, data)
}

func bundleOtherRevision(files map[string][]byte, textEntry string) string {
	other := make(map[string][]byte, len(files))
	for name, data := range files {
		if name != textEntry {
			other[name] = data
		}
	}
	return editableBundleDirectoryRevision(other)
}

// A directory bundle is not a multi-file atomic transaction. New assets are
// create-only and durable first; only the original text is atomically replaced.
// A failed/partial save retains those additions and the recovery workspace.
func saveTextBundleDirectory(source string, base *editableBundleSnapshot, files map[string][]byte, revision string) (saveErr error) {
	publishedAsset := false
	defer func() {
		if saveErr != nil && publishedAsset {
			saveErr = fmt.Errorf("BUNDLE_PARTIAL_SAVE: new attachments and recovery workspace retained; text publication was not confirmed: %w", saveErr)
		}
	}()
	before, err := readTextBundleDirectory(source)
	if err != nil || editableBundleDirectoryRevision(before) != revision {
		return errDocumentConflict
	}
	root, err := textPackOpenRoot(source)
	if err != nil {
		return err
	}
	defer root.Close()
	for name, data := range files {
		if name == base.TextEntry {
			continue
		}
		if existing, exists := before[name]; exists {
			if !bytes.Equal(existing, data) {
				return errDocumentConflict
			}
			continue
		}
		if !strings.HasPrefix(name, base.Prefix+"assets/") {
			return textPackError("TEXTPACK_UNSAFE_PATH")
		}
		if err := textPackNoLinksAllowMissing(filepath.Join(source, filepath.FromSlash(name))); err != nil {
			return err
		}
		if err := root.MkdirAll(filepath.Dir(filepath.FromSlash(name)), 0o700); err != nil {
			return err
		}
		if err := textPackNoLinks(filepath.Dir(filepath.Join(source, filepath.FromSlash(name)))); err != nil {
			return err
		}
		if err := textPackWriteNew(root, filepath.FromSlash(name), data); err != nil {
			return fmt.Errorf("BUNDLE_PARTIAL_SAVE: new attachments and recovery workspace retained: %w", err)
		}
		publishedAsset = true
	}
	expectedOther := bundleOtherRevision(files, base.TextEntry)
	verifyOther := func() error {
		current, err := readTextBundleDirectory(source)
		if err != nil || bundleOtherRevision(current, base.TextEntry) != expectedOther {
			return errDocumentConflict
		}
		return nil
	}
	if err := verifyOther(); err != nil {
		return err
	}
	target := filepath.Join(source, filepath.FromSlash(base.TextEntry))
	if bytes.Equal(before[base.TextEntry], files[base.TextEntry]) {
		// Still reject a concurrent edit, even when the submitted text is equal.
		return checkDocumentRevision(target, documentRevision(before[base.TextEntry]))
	}
	return writeBundleDocumentWithRevision(target, files[base.TextEntry], documentRevision(before[base.TextEntry]),
		maxSupportedDocumentBytes, filepath.Dir(source), verifyOther)
}

func (a *App) SaveBundleCopy(source, content, sessionID string) (*Document, error) {
	manifest, _, err := a.bundleManifest(sessionID)
	if err != nil || !sameFilesystemPath(source, manifest.SourcePath) {
		return nil, textPackError("BUNDLE_SESSION_INVALID")
	}
	name := strings.TrimSuffix(filepath.Base(source), filepath.Ext(source)) + "-copy.textpack"
	target, err := wailsruntime.SaveFileDialog(a.ctx, wailsruntime.SaveDialogOptions{
		Title: a.textPackLabel("另存完整文档包", "Save a complete package copy"), DefaultFilename: name,
		DefaultDirectory: filepath.Dir(source), Filters: []wailsruntime.FileFilter{{DisplayName: "TextPack", Pattern: "*.textpack"}},
	})
	if err != nil || target == "" {
		return nil, err
	}
	_ = a.rememberMacSecurityScopedPath(target, false)
	return a.saveBundleCopyTo(source, target, content, sessionID)
}

func (a *App) saveBundleCopyTo(source, target, content, sessionID string) (*Document, error) {
	bundleDocumentMu.Lock()
	defer bundleDocumentMu.Unlock()
	session, err := a.loadBundleSession(sessionID)
	if err != nil {
		return nil, err
	}
	if err := bundleSourceMatches(session, source); err != nil {
		return nil, err
	}
	source = session.manifest.SourcePath
	target, err = filepath.Abs(filepath.Clean(target))
	if err != nil {
		return nil, err
	}
	if err := a.validateDocumentCopyTarget(source, target); err != nil {
		return nil, err
	}
	if session.manifest.Kind == "textbundle" {
		inside, err := bundlePathInside(source, target)
		if err != nil {
			return nil, err
		}
		if inside {
			return nil, textPackError("BUNDLE_COPY_INSIDE_SOURCE")
		}
	}
	assets, err := session.addedAssets()
	if err != nil {
		return nil, err
	}
	data, err := buildEditableTextPack(session.base, content, assets)
	if err != nil {
		return nil, err
	}
	write := func(accessible string) error {
		if err := a.validateDocumentCopyTarget(source, accessible); err != nil {
			return err
		}
		return writeTextPackCopy(source, accessible, data)
	}
	_, found, err := a.withMacSecurityScopedPath(target, write)
	if !found {
		err = write(target)
	}
	if err != nil {
		return nil, err
	}
	snapshot, err := editableTextPackSnapshot(target, data)
	if err != nil {
		return nil, err
	}
	copySession, err := a.newBundleSession(snapshot)
	if err != nil {
		return nil, fmt.Errorf("BUNDLE_COPY_SAVED: complete copy retained at %s; could not open its workspace: %w", target, err)
	}
	_ = a.rememberFile(target)
	a.rememberSaveDirectory(filepath.Dir(target))
	return bundleDocumentReceipt(copySession, content, snapshot.Revision), nil
}

// Manual conflict merge adopts the explicitly inspected disk package as the
// new metadata baseline, retaining new local attachments without overwriting a
// same-named disk resource. Ordinary saves cannot silently perform this rebase.
func (a *App) RebaseBundleDocument(oldID, diskID, expectedDiskRevision string) (*Document, error) {
	bundleDocumentMu.Lock()
	defer bundleDocumentMu.Unlock()
	old, err := a.loadBundleSession(oldID)
	if err != nil {
		return nil, err
	}
	disk, err := a.loadBundleSession(diskID)
	if err != nil {
		return nil, err
	}
	if !sameFilesystemPath(old.manifest.SourcePath, disk.manifest.SourcePath) || disk.manifest.CurrentRevision != expectedDiskRevision {
		return nil, errDocumentConflict
	}
	if err := a.checkBundleRevision(disk.manifest, expectedDiskRevision); err != nil {
		return nil, errDocumentConflict
	}
	var diskContent string
	readCurrent := func(source string) error {
		current, err := readEditableBundle(source)
		if err != nil || current.Revision != expectedDiskRevision {
			return errDocumentConflict
		}
		diskContent = current.Content
		return nil
	}
	_, found, readErr := a.withMacSecurityScopedPath(disk.manifest.SourcePath, readCurrent)
	if !found {
		readErr = readCurrent(disk.manifest.SourcePath)
	}
	if readErr != nil {
		return nil, readErr
	}
	assets, err := old.addedAssets()
	if err != nil {
		return nil, err
	}
	for name, data := range assets {
		name = disk.base.Prefix + strings.TrimPrefix(name, old.base.Prefix)
		if existing, exists := disk.base.Files[name]; exists {
			if !bytes.Equal(existing, data) {
				return nil, textPackError("BUNDLE_ASSET_CONFLICT")
			}
			continue
		}
		target := filepath.Join(disk.dir, "work", filepath.FromSlash(name))
		if err := textPackNoLinksAllowMissing(target); err != nil {
			return nil, err
		}
		root, rootErr := textPackOpenRoot(filepath.Join(disk.dir, "work"))
		if rootErr != nil {
			return nil, rootErr
		}
		existing, readErr := textPackReadRootFile(root, filepath.FromSlash(name), maxImportedImageSize)
		root.Close()
		if readErr == nil {
			if !bytes.Equal(existing, data) {
				return nil, textPackError("BUNDLE_ASSET_CONFLICT")
			}
			continue
		} else if !errors.Is(readErr, os.ErrNotExist) {
			return nil, readErr
		}
		used, _, err := a.bundleWorkspaceUsage()
		if err != nil {
			return nil, err
		}
		if int64(len(data)) > bundleWorkspaceBudget-used {
			return nil, textPackError("BUNDLE_SESSION_LIMIT")
		}
		if err := os.MkdirAll(filepath.Dir(target), 0o700); err != nil {
			return nil, err
		}
		if err := writeBundleWorkspaceFile(target, data); err != nil {
			return nil, err
		}
	}
	return bundleDocumentReceipt(disk, diskContent, expectedDiskRevision), nil
}
