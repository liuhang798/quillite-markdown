package main

import (
	"archive/zip"
	"bytes"
	"fmt"
	"os"
	"path/filepath"
	"sort"
	"strings"

	wailsruntime "github.com/wailsapp/wails/v2/pkg/runtime"
)

// A file picker on Windows/Linux cannot select a directory. Selecting the
// bundle's text file still opens the original package, never a detached editor
// on its body. Arbitrary attachments and nested directories are not promoted.
func bundleOpenDocumentPath(name string) string {
	name = filepath.Clean(name)
	parent := filepath.Dir(name)
	if strings.EqualFold(filepath.Ext(parent), ".textbundle") && strings.HasPrefix(filepath.Base(name), "text.") {
		return parent
	}
	return name
}

func documentFormatFromPath(name string) string {
	switch strings.ToLower(filepath.Ext(name)) {
	case ".md", ".markdown", ".mdown", ".mkd":
		return "markdown"
	case ".txt":
		return "text"
	case ".textpack":
		return "textpack"
	case ".textbundle":
		return "textbundle"
	}
	return ""
}

func (a *App) documentFormatSaveOptions(source, format string) wailsruntime.SaveDialogOptions {
	options := a.documentSaveDialogOptions(source)
	options.Title = a.textPackLabel("另存为", "Save As")
	explicitFormat := format != ""
	if format == "" {
		format = documentFormatFromPath(source)
	}
	if format == "" {
		format = "markdown"
	}
	filters := map[string]wailsruntime.FileFilter{
		"text":       {DisplayName: a.text("textFile"), Pattern: "*.txt"},
		"markdown":   {DisplayName: a.textPackLabel("Markdown（含图片）", "Markdown with images"), Pattern: "*.md"},
		"textbundle": {DisplayName: "TextBundle", Pattern: "*.textbundle"},
		"textpack":   {DisplayName: "TextPack", Pattern: "*.textpack"},
	}
	options.Filters = []wailsruntime.FileFilter{filters[format]}
	for _, kind := range []string{"text", "markdown", "textbundle", "textpack"} {
		if !explicitFormat && kind != format {
			options.Filters = append(options.Filters, filters[kind])
		}
	}
	ext := map[string]string{"text": ".txt", "markdown": ".md", "textbundle": ".textbundle", "textpack": ".textpack"}[format]
	options.DefaultFilename = strings.TrimSuffix(filepath.Base(source), filepath.Ext(source)) + "-copy" + ext
	return options
}

// Native Save As chooses the storage format, not a different editing mode.
// rawContent is retained for whole-package copies; preparedContent and images
// come from the shared Markdown range parser for media-rebased conversions.
func (a *App) SaveDocumentAsFormat(source, rawContent, sessionID, format string, images []TextPackImage, preparedContent string) (*Document, error) {
	if format != "" && format != "text" && format != "markdown" && format != "textpack" && format != "textbundle" {
		return nil, textPackError("TEXTPACK_INVALID")
	}
	target, err := wailsruntime.SaveFileDialog(a.ctx, a.documentFormatSaveOptions(source, format))
	if err != nil || target == "" {
		return nil, err
	}
	_ = a.rememberMacSecurityScopedPath(target, strings.EqualFold(filepath.Ext(target), ".textbundle"))
	return a.saveDocumentAsFormatTo(source, target, rawContent, sessionID, format, images, preparedContent)
}

func (a *App) conversionResourcePath(source, sessionID string) (string, error) {
	if isEditableBundlePath(source) {
		manifest, dir, err := a.bundleManifest(sessionID)
		if err != nil || !sameFilesystemPath(source, manifest.SourcePath) {
			return "", textPackError("BUNDLE_SESSION_INVALID")
		}
		return filepath.Join(dir, "work", filepath.FromSlash(manifest.TextEntry)), nil
	}
	if sessionID != "" {
		return "", textPackError("BUNDLE_SESSION_INVALID")
	}
	if _, _, scoped, _ := a.bundleWorkspaceContext(source); scoped {
		return "", textPackError("BUNDLE_SESSION_REQUIRED")
	}
	return source, nil
}

// A conversion must not leave rewritten references pointing to silently skipped
// local files. Network links remain untouched and are reported by the frontend.
func (a *App) conversionSnapshot(source, content string, images []TextPackImage) (*editableBundleSnapshot, []TextPackWarning, error) {
	data, report, err := a.buildTextPack(source, content, images)
	if err != nil {
		return nil, nil, err
	}
	for _, warning := range report.Warnings {
		if warning.Code != "EXTERNAL_RESOURCES" {
			return nil, nil, textPackError("TEXTPACK_CONVERSION_INCOMPLETE: " + warning.Code)
		}
	}
	snapshot, err := editableTextPackSnapshot(source, data)
	return snapshot, report.Warnings, err
}

func (a *App) saveDocumentAsFormatTo(source, target, rawContent, sessionID, format string, images []TextPackImage, preparedContent string) (*Document, error) {
	target, err := filepath.Abs(filepath.Clean(target))
	if err != nil {
		return nil, err
	}
	if err := a.validateDocumentCopyTarget(source, target); err != nil {
		return nil, err
	}
	actual := documentFormatFromPath(target)
	if actual == "" || (format != "" && actual != format) {
		return nil, textPackError("DOCUMENT_FORMAT_EXTENSION")
	}
	if sameFilesystemPath(source, target) {
		return nil, textPackError("TEXTPACK_EXISTS")
	}
	// An ordinary backup is not an asset-packaging operation. In particular a
	// TXT file may contain literal Markdown/HTML, and same-folder Markdown may
	// contain complex references which must not prevent rescuing its text.
	if !isEditableBundlePath(source) && sessionID == "" {
		if actual == "text" {
			return a.SaveDocumentCopy(source, target, rawContent)
		}
		if actual == "markdown" && documentFormatFromPath(source) == "markdown" && len(images) == 0 {
			return a.SaveDocumentCopy(source, target, preparedContent)
		}
	}
	if actual == "text" {
		return nil, textPackError("DOCUMENT_FORMAT_EXTENSION")
	}
	if isEditableBundlePath(source) && strings.EqualFold(filepath.Ext(source), ".textbundle") {
		inside, err := bundlePathInside(source, target)
		if err != nil || inside {
			return nil, textPackError("BUNDLE_COPY_INSIDE_SOURCE")
		}
	}
	bundleDocumentMu.Lock()
	defer bundleDocumentMu.Unlock()
	resourcePath, err := a.conversionResourcePath(source, sessionID)
	if err != nil {
		return nil, err
	}
	claimKey, claimedDraft, err := a.claimDraftReplacement(source, target)
	if err != nil {
		return nil, err
	}
	if claimedDraft {
		defer a.releaseDraftReplacementClaim(claimKey)
	}
	var snapshot *editableBundleSnapshot
	var warnings []TextPackWarning
	content := preparedContent
	if isEditableBundlePath(source) && actual != "markdown" {
		session, err := a.loadBundleSession(sessionID)
		if err != nil {
			return nil, err
		}
		assets, err := session.addedAssets()
		if err != nil {
			return nil, err
		}
		data, err := buildEditableTextPack(session.base, rawContent, assets)
		if err != nil {
			return nil, err
		}
		snapshot, err = editableTextPackSnapshot(source, data)
		if err != nil {
			return nil, err
		}
		content = rawContent
	} else {
		snapshot, warnings, err = a.conversionSnapshot(resourcePath, content, images)
		if err != nil {
			return nil, err
		}
	}
	var doc *Document
	write := func(accessible string) error {
		if err := a.validateDocumentCopyTarget(source, accessible); err != nil {
			return err
		}
		if documentFormatFromPath(accessible) != actual {
			return textPackError("DOCUMENT_FORMAT_EXTENSION")
		}
		if strings.EqualFold(filepath.Ext(source), ".textbundle") {
			inside, err := bundlePathInside(source, accessible)
			if err != nil || inside {
				return textPackError("BUNDLE_COPY_INSIDE_SOURCE")
			}
		}
		if actual == "markdown" {
			if err := writeMarkdownAssetsCopy(source, accessible, content, snapshot.Files); err != nil {
				return err
			}
			var err error
			doc, err = a.savedDocumentReceipt(accessible, content, true)
			return err
		}
		if actual == "textpack" {
			if err := writeTextPackCopy(source, accessible, snapshot.archiveRaw); err != nil {
				return err
			}
			snapshot.SourcePath = accessible
		} else {
			files, err := flattenedBundleFiles(snapshot)
			if err != nil {
				return err
			}
			headers, err := flattenedBundleHeaders(snapshot)
			if err != nil {
				return err
			}
			if err := writeNewDocumentDirectory(accessible, files, headers, strings.TrimPrefix(snapshot.TextEntry, snapshot.Prefix)); err != nil {
				return err
			}
			snapshot, err = finishEditableBundleSnapshot(&editableBundleSnapshot{SourcePath: accessible, Kind: "textbundle", Files: files, directoryHeaders: headers})
			if err != nil {
				return err
			}
		}
		session, err := a.newBundleSession(snapshot)
		if err != nil {
			return fmt.Errorf("BUNDLE_COPY_SAVED: complete copy retained at %s; could not open its workspace: %w", accessible, err)
		}
		// Bundle sessions expose canonical text without its encoding BOM. The
		// original bytes still contain that BOM; returning the raw source text
		// here would treat it as an edit and prepend a second BOM on Ctrl+S.
		doc = bundleDocumentReceipt(session, snapshot.Content, snapshot.Revision)
		_ = a.rememberFile(accessible)
		return nil
	}
	_, found, err := a.withMacSecurityScopedPath(target, write)
	if !found {
		err = write(target)
	}
	if err != nil {
		return nil, err
	}
	doc.ExportWarnings = warnings
	if claimedDraft {
		replaced, err := a.migrateClaimedDraft(filepath.Clean(source), doc.Path, claimKey)
		if err != nil {
			doc.Warning = "DOCUMENT_SAVE_RECORDS"
		} else {
			doc.ReplacedPath = replaced
		}
	}
	a.rememberSaveDirectory(filepath.Dir(target))
	return doc, nil
}

func flattenedBundleFiles(snapshot *editableBundleSnapshot) (map[string][]byte, error) {
	files := make(map[string][]byte, len(snapshot.Files))
	var tree textPackPathTree
	for name, data := range snapshot.Files {
		name = strings.TrimPrefix(name, snapshot.Prefix)
		if err := tree.add(name, false); err != nil {
			return nil, err
		}
		files[name] = data
	}
	return files, nil
}

func flattenedBundleHeaders(snapshot *editableBundleSnapshot) (map[string]zip.FileHeader, error) {
	headers := map[string]zip.FileHeader{}
	add := func(header zip.FileHeader) error {
		header.Name = strings.TrimPrefix(header.Name, snapshot.Prefix)
		if header.Name == "" {
			return nil
		}
		if err := validateTextPackPath(header.Name, strings.HasSuffix(header.Name, "/")); err != nil {
			return err
		}
		headers[header.Name] = header
		return nil
	}
	if snapshot.archive != nil {
		for _, entry := range snapshot.archive.File {
			if err := add(entry.FileHeader); err != nil {
				return nil, err
			}
		}
	} else {
		for _, header := range snapshot.directoryHeaders {
			if err := add(header); err != nil {
				return nil, err
			}
		}
	}
	return headers, nil
}

func (a *App) validateDocumentFormatTarget(target string) error {
	root, err := filepath.Abs(a.bundleWorkspaceRoot())
	if err != nil {
		return err
	}
	inside, err := bundlePathInside(root, target)
	if err != nil {
		return err
	}
	if inside {
		return textPackError("BUNDLE_SESSION_REQUIRED")
	}
	return nil
}

// Every public document-copy/export writer must reject persistent recovery
// storage and the original directory package, including when its caller only
// has the managed working Markdown path. Recheck after native bookmark
// resolution as a bookmark can resolve to a different selected pathname.
func (a *App) validateDocumentCopyTarget(source, target string) error {
	target, err := filepath.Abs(filepath.Clean(target))
	if err != nil {
		return err
	}
	if err := a.validateDocumentFormatTarget(target); err != nil {
		return err
	}
	// Portable/plain-text writers follow parent directories. Do not let an
	// alias selected outside the package bypass its identity boundary and
	// publish inside the original or a managed recovery directory instead.
	if err := textPackNoLinksAllowMissing(target); err != nil {
		return err
	}
	origin := source
	manifest, work, scoped, scopeErr := a.bundleWorkspaceContext(source)
	if scoped {
		if scopeErr != nil {
			return scopeErr
		}
		if !sameFilesystemPath(source, filepath.Join(work, filepath.FromSlash(manifest.TextEntry))) {
			return textPackError("BUNDLE_SESSION_REQUIRED")
		}
		origin = manifest.SourcePath
	}
	if strings.EqualFold(filepath.Ext(origin), ".textbundle") {
		inside, err := bundlePathInside(origin, target)
		if err != nil || inside {
			return textPackError("BUNDLE_COPY_INSIDE_SOURCE")
		}
	}
	return nil
}

// Create-only directory publication: a partial copy is kept and explicitly
// identified on error. No rollback deletes paths visible to other processes.
func writeNewDocumentDirectory(target string, files map[string][]byte, headers map[string]zip.FileHeader, textName string) error {
	if err := validateTextPackPath(filepath.Base(target), false); err != nil {
		return err
	}
	parent, err := textPackOpenRoot(filepath.Dir(target))
	if err != nil {
		return err
	}
	defer parent.Close()
	if err := parent.Mkdir(filepath.Base(target), 0o700); err != nil {
		if os.IsExist(err) {
			return textPackError("TEXTPACK_EXISTS")
		}
		return err
	}
	fail := func(err error) error {
		return fmt.Errorf("TEXTPACK_COPY_FAILED: incomplete copy retained at %s: %w", target, err)
	}
	if err := textPackNoLinks(target); err != nil {
		return fail(err)
	}
	created, err := parent.Lstat(filepath.Base(target))
	if err != nil || !created.IsDir() || created.Mode()&os.ModeSymlink != 0 {
		return fail(textPackError("TEXTPACK_UNSAFE_PATH"))
	}
	root, err := parent.OpenRoot(filepath.Base(target))
	if err != nil {
		return fail(err)
	}
	defer root.Close()
	opened, err := root.Stat(".")
	if err != nil || !os.SameFile(created, opened) {
		return fail(textPackError("TEXTPACK_CHANGED"))
	}
	for name := range headers {
		if strings.HasSuffix(name, "/") {
			if err := validateTextPackPath(name, true); err != nil {
				return fail(err)
			}
			if err := root.MkdirAll(filepath.FromSlash(strings.TrimSuffix(name, "/")), 0o700); err != nil {
				return fail(err)
			}
		}
	}
	for _, name := range documentCopyNames(files, textName) {
		if err := validateTextPackPath(name, false); err != nil {
			return fail(err)
		}
		if err := root.MkdirAll(filepath.Dir(filepath.FromSlash(name)), 0o700); err != nil {
			return fail(err)
		}
		if err := textPackWriteNew(root, name, files[name]); err != nil {
			return fail(err)
		}
	}
	return nil
}

func documentCopyNames(files map[string][]byte, textName string) []string {
	names := make([]string, 0, len(files))
	for name := range files {
		if name != textName {
			names = append(names, name)
		}
	}
	sort.Strings(names)
	if _, exists := files[textName]; exists {
		names = append(names, textName)
	}
	return names
}

// Exact selected Markdown path plus its assets. Shared asset names may be
// reused only for identical bytes; neither the source nor existing files change.
func writeMarkdownAssetsCopy(source, target, content string, files map[string][]byte) error {
	if err := validateTextPackPath(filepath.Base(target), false); err != nil {
		return err
	}
	if sameFilesystemPath(source, target) || documentFormatFromPath(target) != "markdown" {
		return textPackError("TEXTPACK_EXISTS")
	}
	if strings.EqualFold(filepath.Ext(source), ".textbundle") {
		inside, err := bundlePathInside(source, target)
		if err != nil || inside {
			return textPackError("BUNDLE_COPY_INSIDE_SOURCE")
		}
	}
	if _, err := os.Lstat(target); !os.IsNotExist(err) {
		if err == nil {
			return textPackError("TEXTPACK_EXISTS")
		}
		return err
	}
	root, err := textPackOpenRoot(filepath.Dir(target))
	if err != nil {
		return err
	}
	defer root.Close()
	assets := make(map[string][]byte)
	for name, data := range files {
		if !strings.HasPrefix(name, "assets/") {
			continue
		}
		if err := validateTextPackPath(name, false); err != nil {
			return err
		}
		if err := textPackNoLinksAllowMissing(filepath.Join(filepath.Dir(target), filepath.FromSlash(name))); err != nil {
			return err
		}
		old, err := textPackReadRootFile(root, filepath.FromSlash(name), maxImportedImageSize)
		if err == nil {
			if !bytes.Equal(old, data) {
				return textPackError("TEXTPACK_EXISTS: an attachment has different contents")
			}
		} else if os.IsNotExist(err) {
			assets[name] = data
		} else {
			return err
		}
	}
	fail := func(err error) error {
		return fmt.Errorf("TEXTPACK_COPY_FAILED: new attachments or incomplete Markdown retained beside %s; original unchanged: %w", target, err)
	}
	for _, name := range documentCopyNames(assets, "") {
		if err := root.MkdirAll(filepath.Dir(filepath.FromSlash(name)), 0o700); err != nil {
			return fail(err)
		}
		if err := textPackWriteNew(root, name, assets[name]); err != nil {
			return fail(err)
		}
	}
	if err := textPackWriteNew(root, filepath.Base(target), []byte(content)); err != nil {
		return fail(err)
	}
	return nil
}

func (a *App) ExportMarkdownWithAssets(source, content, sessionID string, images []TextPackImage) (*TextPackExportResult, error) {
	options := a.documentFormatSaveOptions(source, "markdown")
	options.Title = a.textPackLabel("导出 Markdown（含图片）", "Export Markdown with images")
	options.Filters = options.Filters[:1]
	target, err := wailsruntime.SaveFileDialog(a.ctx, options)
	if err != nil || target == "" {
		return nil, err
	}
	target, err = filepath.Abs(filepath.Clean(target))
	if err != nil {
		return nil, err
	}
	if err := a.validateDocumentCopyTarget(source, target); err != nil {
		return nil, err
	}
	_ = a.rememberMacSecurityScopedPath(target, false)
	resourcePath, err := a.conversionResourcePath(source, sessionID)
	if err != nil {
		return nil, err
	}
	snapshot, warnings, err := a.conversionSnapshot(resourcePath, content, images)
	if err != nil {
		return nil, err
	}
	if strings.EqualFold(filepath.Ext(source), ".textbundle") {
		inside, err := bundlePathInside(source, target)
		if err != nil || inside {
			return nil, textPackError("BUNDLE_COPY_INSIDE_SOURCE")
		}
	}
	write := func(accessible string) error {
		if err := a.validateDocumentCopyTarget(source, accessible); err != nil {
			return err
		}
		return writeMarkdownAssetsCopy(source, accessible, content, snapshot.Files)
	}
	_, found, err := a.withMacSecurityScopedPath(target, write)
	if !found {
		err = write(target)
	}
	if err != nil {
		return nil, err
	}
	a.rememberSaveDirectory(filepath.Dir(target))
	return &TextPackExportResult{Path: target, Warnings: warnings, AssetCount: len(images)}, nil
}
