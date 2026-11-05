package main

import (
	"errors"
	"fmt"
	wailsruntime "github.com/wailsapp/wails/v2/pkg/runtime"
	"os"
	"path/filepath"
	"strings"
	"unicode/utf8"
)

func (a *App) isDraft(path string) bool {
	a.draftsMu.Lock()
	defer a.draftsMu.Unlock()
	return a.draftFiles[draftPathKey(path)]
}

func usableSaveDirectory(path string) string {
	if strings.TrimSpace(path) == "" || !filepath.IsAbs(path) {
		return ""
	}
	if info, err := os.Stat(path); err == nil && info.IsDir() {
		return filepath.Clean(path)
	}
	return ""
}

func (a *App) rememberSaveDirectory(path string) {
	_, _ = a.updatePreferences(func(p *Preferences) { p.LastSaveDirectory = path })
}

func (a *App) documentSaveDialogOptions(currentPath string) wailsruntime.SaveDialogOptions {
	directory := usableSaveDirectory(filepath.Dir(currentPath))
	if currentPath == "" || a.isDraft(currentPath) {
		if p, err := a.readPreferences(); err == nil && usableSaveDirectory(p.LastSaveDirectory) != "" {
			directory = p.LastSaveDirectory
		}
	}
	name := filepath.Base(currentPath)
	if name == "." || name == "" || a.isDraft(currentPath) {
		name = a.text("newDocument")
	}
	if strings.EqualFold(filepath.Ext(currentPath), ".txt") {
		return wailsruntime.SaveDialogOptions{Title: a.textPackLabel("另存为文本", "Save text as"), DefaultFilename: name, DefaultDirectory: directory,
			Filters: []wailsruntime.FileFilter{{DisplayName: a.text("textFile"), Pattern: "*.txt"}}}
	}
	return wailsruntime.SaveDialogOptions{Title: a.text("saveAsMarkdown"), DefaultFilename: name, DefaultDirectory: directory,
		Filters: []wailsruntime.FileFilter{{DisplayName: a.text("markdownDocument"), Pattern: "*.md"}, {DisplayName: a.text("textFile"), Pattern: "*.txt"}}}
}

// Splitting the picker from writing lets the frontend rebase image references
// to the chosen directory, without copying/deleting any original attachment.
func (a *App) ChooseDocumentSavePath(currentPath string) (string, error) {
	path, err := wailsruntime.SaveFileDialog(a.ctx, a.documentSaveDialogOptions(currentPath))
	if err == nil && path != "" {
		_ = a.rememberMacSecurityScopedPath(path, false)
	}
	return path, err
}

func (a *App) SaveDocumentCopy(currentPath, targetPath, content string) (*Document, error) {
	if err := a.validateDocumentCopyTarget(currentPath, targetPath); err != nil {
		return nil, err
	}
	if _, _, scoped, _ := a.bundleWorkspaceContext(currentPath); scoped {
		return nil, textPackError("BUNDLE_SESSION_REQUIRED")
	}
	if _, _, scoped, _ := a.bundleWorkspaceContext(targetPath); scoped {
		return nil, textPackError("BUNDLE_SESSION_REQUIRED")
	}
	if isEditableBundlePath(currentPath) || isEditableBundlePath(targetPath) {
		return nil, textPackError("BUNDLE_SESSION_REQUIRED: preserve the complete package with SaveBundleCopy")
	}
	documentSaveMu.Lock()
	defer documentSaveMu.Unlock()
	var doc *Document
	write := func(path string) (err error) {
		if err := a.validateDocumentCopyTarget(currentPath, path); err != nil {
			return err
		}
		doc, err = a.saveDocumentAs(currentPath, path, content)
		return err
	}
	_, found, err := a.withMacSecurityScopedPath(targetPath, write)
	if !found {
		err = write(targetPath)
	}
	return doc, err
}

func validateDocumentName(name string) error {
	if name != strings.TrimSpace(name) || name == "" || utf8.RuneCountInString(name) > 180 || strings.HasSuffix(name, ".") || strings.ContainsAny(name, "\\/:*?\"<>|\x00\r\n") {
		return errors.New("DOCUMENT_NAME_INVALID")
	}
	for _, ch := range name {
		if ch < 32 {
			return errors.New("DOCUMENT_NAME_INVALID")
		}
	}
	if !markdownExtensions[strings.ToLower(filepath.Ext(name))] {
		return errors.New("DOCUMENT_NAME_INVALID")
	}
	base := strings.ToUpper(strings.Split(name, ".")[0])
	if base == "CON" || base == "PRN" || base == "AUX" || base == "NUL" || (len(base) == 4 && (strings.HasPrefix(base, "COM") || strings.HasPrefix(base, "LPT")) && base[3] >= '1' && base[3] <= '9') {
		return errors.New("DOCUMENT_NAME_INVALID")
	}
	return nil
}

// Only the basename can change. Atomic create-only platform moves never
// overwrite another file; the actual moved inode and revision are revalidated.
func renameDocument(path, name, revision string) (string, string, error) {
	if err := validateDocumentName(name); err != nil {
		return "", "", err
	}
	source, err := filepath.Abs(filepath.Clean(path))
	if err != nil {
		return "", "", err
	}
	target := filepath.Join(filepath.Dir(source), name)
	if strings.EqualFold(filepath.Ext(source), ".txt") != strings.EqualFold(filepath.Ext(target), ".txt") {
		return "", "", errors.New("DOCUMENT_NAME_FORMAT")
	}
	if sameFilesystemPath(source, target) {
		return "", "", errors.New("DOCUMENT_NAME_UNCHANGED")
	}
	info, err := os.Lstat(source)
	if err != nil || !info.Mode().IsRegular() || len(revision) != 64 {
		return "", "", errDocumentConflict
	}
	data, err := readDocumentBytes(source)
	if err != nil || documentRevision(data) != revision {
		return "", "", errDocumentConflict
	}
	if _, err = os.Lstat(target); !os.IsNotExist(err) {
		return "", "", errors.New("DOCUMENT_COPY_EXISTS")
	}
	if err = moveDocumentNoReplace(source, target, revision, info); err != nil {
		return "", "", err
	}
	moved, statErr := os.Lstat(target)
	if statErr != nil || !moved.Mode().IsRegular() || !os.SameFile(info, moved) || checkDocumentRevision(target, revision) != nil {
		// Roll back only into an empty source name, never overwrite a concurrent file.
		if moved != nil && moved.Mode().IsRegular() && os.SameFile(info, moved) {
			_ = moveDocumentNoReplace(target, source, "", moved)
		}
		return "", "", fmt.Errorf("%w; rename recovery may remain at %s", errDocumentConflict, target)
	}
	return target, string(data), nil
}

func (a *App) RenameDocument(path, name, revision string) (*Document, error) {
	if _, _, scoped, _ := a.bundleWorkspaceContext(path); scoped {
		return nil, textPackError("BUNDLE_RENAME_NOT_SUPPORTED")
	}
	if isEditableBundlePath(path) || isEditableBundlePath(name) {
		return nil, textPackError("BUNDLE_RENAME_NOT_SUPPORTED")
	}
	if a.isReferenceDocumentPath(path) {
		return nil, errors.New("DOCUMENT_READ_ONLY")
	}
	documentSaveMu.Lock()
	defer documentSaveMu.Unlock()
	var target, content string
	move := func(source string) (err error) {
		target, content, err = renameDocument(source, name, revision)
		return err
	}
	_, found, err := a.withMacSecurityScopedPath(path, move)
	if !found {
		err = move(path)
	}
	if err != nil {
		return nil, err
	}
	_ = a.rememberMacSecurityScopedPath(target, false)
	key := draftPathKey(path)
	_, preferencesErr := a.updatePreferences(func(p *Preferences) {
		p.RecentFiles, _ = replaceDraftPreferencePath(p.RecentFiles, key, target)
		p.PinnedRecentFiles, _ = replaceDraftPreferencePath(p.PinnedRecentFiles, key, target)
		p.FavoriteFiles, _ = replaceDraftPreferencePath(p.FavoriteFiles, key, target)
		p.DraftFiles, _ = replaceDraftPreferencePath(p.DraftFiles, key, target)
		if draftPathKey(p.LastFile) == key {
			p.LastFile = target
		}
	})
	a.draftsMu.Lock()
	if a.draftFiles[key] {
		delete(a.draftFiles, key)
		a.draftFiles[draftPathKey(target)] = true
	}
	a.draftsMu.Unlock()
	doc, err := a.savedDocumentReceipt(target, content, true)
	if doc != nil {
		doc.ReplacedPath = path
		historyErr := a.copyRenamedDocumentHistory(path, target)
		if preferencesErr != nil || historyErr != nil {
			doc.Warning = "DOCUMENT_RENAME_RECORDS"
		}
	}
	return doc, err
}

// Copy and re-key versions; originals are kept. Never prune or delete history
// as a side effect of renaming a document.
func (a *App) copyRenamedDocumentHistory(source, target string) error {
	versions, err := a.ListDocumentVersions(source)
	if err != nil {
		return err
	}
	if len(versions) == 0 {
		return nil
	}
	if len(versions) > maxDocumentVersions {
		versions = versions[:maxDocumentVersions]
	}
	var total int64
	var contentBytes int64
	for _, version := range versions {
		contentBytes += version.Size
		if contentBytes > maxDocumentHistoryBytes {
			return errors.New("DOCUMENT_RENAME_RECORDS")
		}
		detail, err := a.GetDocumentVersion(source, version.ID)
		if err != nil {
			return err
		}
		data, err := encodeDocumentVersion(storedDocumentVersion{Path: target, CreatedAt: detail.CreatedAt, Content: detail.Content})
		if err != nil {
			return err
		}
		total += int64(len(data))
		if total > maxDocumentHistoryBytes {
			return errors.New("DOCUMENT_RENAME_RECORDS")
		}
		directory := a.documentHistoryDirectory(target)
		a.historyMu.Lock()
		// Existing links/foreign objects are not authority to create outside
		// the product's history root.
		for _, path := range []string{a.documentHistoryRoot(), directory} {
			if _, statErr := os.Lstat(path); statErr == nil && !regularHistoryDirectory(path) {
				err = errors.New("DOCUMENT_RENAME_RECORDS")
				break
			} else if statErr != nil && !os.IsNotExist(statErr) {
				err = statErr
				break
			}
		}
		if err == nil {
			err = os.MkdirAll(directory, 0700)
		}
		if err == nil && (!regularHistoryDirectory(a.documentHistoryRoot()) || !regularHistoryDirectory(directory)) {
			err = errors.New("DOCUMENT_RENAME_RECORDS")
		}
		if err == nil {
			err = writeConflictCopy(filepath.Join(a.documentHistoryDirectory(source), version.ID), filepath.Join(directory, version.ID), data)
		}
		a.historyMu.Unlock()
		if err != nil {
			return err
		}
	}
	return nil
}
