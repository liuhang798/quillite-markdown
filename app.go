package main

import (
	"context"
	_ "embed"
	"encoding/base64"
	"encoding/json"
	"errors"
	"fmt"
	"mime"
	"net/http"
	"net/url"
	"os"
	"os/exec"
	"path/filepath"
	goruntime "runtime"
	"sort"
	"strings"
	"sync"
	"time"

	"github.com/wailsapp/wails/v2/pkg/options"
	wailsruntime "github.com/wailsapp/wails/v2/pkg/runtime"
)

const (
	appNameZH       = "轻阅 Markdown"
	appNameShortZH  = "轻阅"
	appNameEN       = "Quillite Markdown"
	legacyAppNameZH = "MD阅读助手"
	legacyAppNameEN = "MD Reader Assistant"
	appVersion      = "2.7.3"
	maxRecent       = 10
)

var markdownExtensions = map[string]bool{
	".md": true, ".markdown": true, ".mdown": true, ".mkd": true, ".txt": true,
}

var imageExtensions = map[string]bool{
	".png": true, ".jpg": true, ".jpeg": true, ".gif": true,
	".webp": true, ".svg": true, ".bmp": true,
}

const maxImportedImageSize = int64(25 * 1024 * 1024)

var errDraftReplacementInProgress = errors.New("draft replacement is already in progress")

var errMacDocumentAccessNotGranted = errors.New("macOS document access was not granted")

// The built-in examples are generated from the same template registries used
// by the editor. They are materialised into the user cache on demand so Wails
// can open them like ordinary Markdown files on every supported platform.
//
//go:embed docs/reference/图表案例.MD
var chartReferenceMarkdown string

//go:embed docs/reference/科学公式案例.MD
var formulaReferenceMarkdown string

//go:embed docs/reference/常规内容案例.MD
var formatReferenceMarkdown string

type Document struct {
	Path         string `json:"path"`
	Name         string `json:"name"`
	Directory    string `json:"directory"`
	Content      string `json:"content"`
	ModifiedAt   string `json:"modifiedAt"`
	Size         int64  `json:"size"`
	ReplacedPath string `json:"replacedPath,omitempty"`
	ReadOnly     bool   `json:"readOnly,omitempty"`
}

type FolderFile struct {
	Path         string `json:"path"`
	Name         string `json:"name"`
	RelativePath string `json:"relativePath"`
	Directory    string `json:"directory"`
}

type FolderResult struct {
	Root  string       `json:"root"`
	Name  string       `json:"name"`
	Files []FolderFile `json:"files"`
}

type RecentFileStatus struct {
	Path   string `json:"path"`
	Exists bool   `json:"exists"`
}

type Preferences struct {
	RecentFiles          []string           `json:"recentFiles"`
	RecentFileStatuses   []RecentFileStatus `json:"recentFileStatuses,omitempty"`
	PinnedRecentFiles    []string           `json:"pinnedRecentFiles"`
	FavoriteFiles        []string           `json:"favoriteFiles"`
	FavoriteFileStatuses []RecentFileStatus `json:"favoriteFileStatuses,omitempty"`
	DraftFiles           []string           `json:"draftFiles,omitempty"`
	LastFile             string             `json:"lastFile,omitempty"`
	ExplorerRoot         string             `json:"explorerRoot,omitempty"`
	Language             string             `json:"language"`
	FontFamily           string             `json:"fontFamily,omitempty"`
	LastUpdateCheck      string             `json:"lastUpdateCheck,omitempty"`
	SuppressUpdateUntil  string             `json:"suppressUpdateUntil,omitempty"`
	UsageAnalytics       bool               `json:"usageAnalytics"`
	ImageUploadMode      string             `json:"imageUploadMode,omitempty"`
	PicGoServerURL       string             `json:"picGoServerUrl,omitempty"`
	AIProvider           string             `json:"aiProvider,omitempty"`
	AIBaseURL            string             `json:"aiBaseUrl,omitempty"`
	AIBaseURLs           map[string]string  `json:"aiBaseUrls,omitempty"`
	AIModel              string             `json:"aiModel,omitempty"`
	AIModels             map[string]string  `json:"aiModels,omitempty"`
	AnonymousInstallID   string             `json:"anonymousInstallId,omitempty"`
	LastActiveReport     string             `json:"lastActiveReport,omitempty"`
	ExportSettings       ExportSettings     `json:"exportSettings,omitempty"`
}

type App struct {
	ctx                 context.Context
	mu                  sync.RWMutex
	preferencesMu       sync.Mutex
	recoveryMu          sync.Mutex
	historyMu           sync.Mutex
	picGoCloudLoginMu   sync.Mutex
	securityBookmarksMu sync.Mutex
	draftsMu            sync.Mutex
	aiRequestMu         sync.Mutex
	draftFiles          map[string]bool
	draftReplacements   map[string]bool
	dirty               bool
	language            string
	initialFile         string
	frontendReady       bool
	preferencesOverride string
	referenceOverride   string
	aiCredentials       aiCredentialStore
	aiRewriteCancel     context.CancelFunc
	aiRewriteGeneration uint64
	aiReviewCancel      context.CancelFunc
	aiReviewGeneration  uint64
}

func NewApp() *App {
	return &App{language: "zh-CN", initialFile: findMarkdownArgument(os.Args), draftFiles: make(map[string]bool)}
}

func (a *App) startup(ctx context.Context) {
	a.mu.Lock()
	a.ctx = ctx
	a.mu.Unlock()
	installMacFullscreenCloseWorkaround()
	scheduleMacInstallerImageCleanup()
	prefs, _ := a.readPreferences()
	home, _ := os.UserHomeDir()
	prefs = a.migrateLegacyBundledDraftReferences(goruntime.GOOS, home, prefs)
	a.language = normaliseLanguage(prefs.Language)
	a.restoreDrafts(prefs.DraftFiles)
	a.scheduleDailyActiveReport()
}

func (a *App) beforeClose(ctx context.Context) bool {
	a.mu.RLock()
	dirty := a.dirty
	a.mu.RUnlock()
	if !dirty {
		return false
	}
	// Windows' native Wails warning dialog only exposes an OK button and
	// ignores custom button labels. Let the frontend show the product's
	// Save / Don't Save / Cancel dialog, then explicitly resume quitting.
	wailsruntime.EventsEmit(ctx, "document:confirm-close")
	return true
}

func (a *App) onSecondInstanceLaunch(data options.SecondInstanceData) {
	filePath := findMarkdownArgument(data.Args)
	if filePath != "" {
		a.openFileFromSystem(filePath)
	}
	a.mu.RLock()
	ctx := a.ctx
	a.mu.RUnlock()
	if ctx != nil {
		wailsruntime.WindowUnminimise(ctx)
		wailsruntime.WindowShow(ctx)
	}
}

func (a *App) onFileOpen(filePath string) {
	a.openFileFromSystem(filePath)
}

func (a *App) openFileFromSystem(filePath string) {
	if filePath == "" {
		return
	}
	a.mu.Lock()
	ctx := a.ctx
	if ctx == nil || !a.frontendReady {
		a.initialFile = filePath
		a.mu.Unlock()
		return
	}
	a.mu.Unlock()
	_ = a.rememberMacSecurityScopedPath(filePath, false)
	if doc, err := a.OpenRecentFile(filePath); err == nil {
		wailsruntime.EventsEmit(ctx, "file:open-from-main", doc)
		wailsruntime.WindowUnminimise(ctx)
		wailsruntime.WindowShow(ctx)
	}
}

func (a *App) preferencePath() string {
	if a.preferencesOverride != "" {
		return a.preferencesOverride
	}
	base, err := os.UserConfigDir()
	if err != nil {
		base = filepath.Dir(os.Args[0])
	}
	return filepath.Join(base, appNameZH, "preferences.json")
}

// migrateLegacyPreferences preserves user settings across the product rename.
// The legacy file is copied, not removed, so users can safely roll back once.
func (a *App) migrateLegacyPreferences() {
	if a.preferencesOverride != "" {
		return
	}
	newPath := a.preferencePath()
	if _, err := os.Stat(newPath); err == nil {
		return
	}
	base, err := os.UserConfigDir()
	if err != nil {
		return
	}
	_ = migrateLegacyPreferencesFile(newPath, []string{
		filepath.Join(base, legacyAppNameZH, "preferences.json"),
		filepath.Join(base, legacyAppNameEN, "preferences.json"),
	})
}

func migrateLegacyPreferencesFile(newPath string, legacyPaths []string) error {
	if _, err := os.Stat(newPath); err == nil {
		return nil
	}
	for _, legacyPath := range legacyPaths {
		data, err := os.ReadFile(legacyPath)
		if err != nil {
			continue
		}
		if err := os.MkdirAll(filepath.Dir(newPath), 0o755); err != nil {
			return err
		}
		return os.WriteFile(newPath, data, 0o644)
	}
	return nil
}

func (a *App) languageSelectionMarkerPath() string {
	return filepath.Join(filepath.Dir(a.preferencePath()), "first-run-language.flag")
}

func defaultPreferences() Preferences {
	return Preferences{
		RecentFiles: []string{}, PinnedRecentFiles: []string{}, FavoriteFiles: []string{}, DraftFiles: []string{},
		Language: "zh-CN", FontFamily: "system", UsageAnalytics: true, ImageUploadMode: imageUploadModeLocal, PicGoServerURL: defaultPicGoServerURL,
		AIProvider: aiProviderDeepSeek, AIBaseURL: defaultDeepSeekBaseURL, AIBaseURLs: map[string]string{}, AIModel: defaultDeepSeekModel, AIModels: map[string]string{},
		ExportSettings: defaultExportSettings(),
	}
}

func normaliseLanguage(language string) string {
	if language == "en" {
		return "en"
	}
	return "zh-CN"
}

func normaliseFontFamily(fontFamily string) string {
	switch strings.ToLower(strings.TrimSpace(fontFamily)) {
	case "sans", "serif", "rounded", "songti", "kaiti":
		return strings.ToLower(strings.TrimSpace(fontFamily))
	default:
		return "system"
	}
}

func (a *App) readPreferences() (Preferences, error) {
	a.preferencesMu.Lock()
	defer a.preferencesMu.Unlock()
	return a.readPreferencesUnlocked()
}

func (a *App) readPreferencesUnlocked() (Preferences, error) {
	a.migrateLegacyPreferences()
	prefs := defaultPreferences()
	data, err := os.ReadFile(a.preferencePath())
	if errors.Is(err, os.ErrNotExist) {
		return prefs, nil
	}
	if err != nil {
		return prefs, err
	}
	if err := json.Unmarshal(data, &prefs); err != nil {
		return defaultPreferences(), nil
	}
	prefs.Language = normaliseLanguage(prefs.Language)
	prefs.FontFamily = normaliseFontFamily(prefs.FontFamily)
	prefs.ImageUploadMode = normaliseImageUploadMode(prefs.ImageUploadMode)
	prefs.AIProvider = normaliseAIProvider(prefs.AIProvider)
	normaliseAIBaseURLPreferences(&prefs)
	normaliseAIModelPreferences(&prefs)
	prefs.ExportSettings = normaliseExportSettings(prefs.ExportSettings)
	if normalisedURL, normaliseErr := normalisePicGoServerURL(prefs.PicGoServerURL); normaliseErr == nil {
		prefs.PicGoServerURL = normalisedURL
	} else {
		prefs.PicGoServerURL = defaultPicGoServerURL
	}
	if prefs.RecentFiles == nil {
		prefs.RecentFiles = []string{}
	}
	if prefs.PinnedRecentFiles == nil {
		prefs.PinnedRecentFiles = []string{}
	}
	if prefs.FavoriteFiles == nil {
		prefs.FavoriteFiles = []string{}
	}
	if prefs.DraftFiles == nil {
		prefs.DraftFiles = []string{}
	}
	normaliseRecentPreferences(&prefs)
	// Reference documents are bundled, read-only examples rather than user
	// library entries. Older releases could leave them in Recent/LastFile, so
	// remove only the exact materialised reference paths during migration.
	// A user-created copy outside the reference directory remains an ordinary
	// editable document, even when it keeps the same filename.
	if a.removeReferenceDocumentsFromRecent(&prefs) {
		if err := a.writePreferencesUnlocked(prefs); err != nil {
			return prefs, err
		}
	}
	return prefs, nil
}

func (a *App) writePreferences(prefs Preferences) error {
	a.preferencesMu.Lock()
	defer a.preferencesMu.Unlock()
	return a.writePreferencesUnlocked(prefs)
}

func (a *App) writePreferencesUnlocked(prefs Preferences) error {
	prefs.Language = normaliseLanguage(prefs.Language)
	prefs.FontFamily = normaliseFontFamily(prefs.FontFamily)
	prefs.ImageUploadMode = normaliseImageUploadMode(prefs.ImageUploadMode)
	prefs.AIProvider = normaliseAIProvider(prefs.AIProvider)
	normaliseAIBaseURLPreferences(&prefs)
	normaliseAIModelPreferences(&prefs)
	prefs.ExportSettings = normaliseExportSettings(prefs.ExportSettings)
	if normalisedURL, err := normalisePicGoServerURL(prefs.PicGoServerURL); err == nil {
		prefs.PicGoServerURL = normalisedURL
	} else {
		prefs.PicGoServerURL = defaultPicGoServerURL
	}
	normaliseRecentPreferences(&prefs)
	path := a.preferencePath()
	if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
		return err
	}
	data, err := json.MarshalIndent(prefs, "", "  ")
	if err != nil {
		return err
	}
	return writeFileAtomically(path, data)
}

func (a *App) updatePreferences(update func(*Preferences)) (Preferences, error) {
	a.preferencesMu.Lock()
	defer a.preferencesMu.Unlock()
	prefs, err := a.readPreferencesUnlocked()
	if err != nil {
		return prefs, err
	}
	update(&prefs)
	normaliseRecentPreferences(&prefs)
	return prefs, a.writePreferencesUnlocked(prefs)
}

func samePreferencePath(left, right string) bool {
	if strings.TrimSpace(left) == "" || strings.TrimSpace(right) == "" {
		return false
	}
	return strings.EqualFold(filepath.Clean(left), filepath.Clean(right))
}

func indexPreferencePath(paths []string, target string) int {
	for index, item := range paths {
		if samePreferencePath(item, target) {
			return index
		}
	}
	return -1
}

// normaliseRecentPreferences keeps one ordered recent list with two partitions:
// every pinned record first (in pin order), followed by at most maxRecent
// unpinned records (in recent order). Pinned records do not consume the
// unpinned capacity and must also exist in RecentFiles.
func normaliseRecentPreferences(prefs *Preferences) {
	uniqueRecent := make([]string, 0, len(prefs.RecentFiles))
	for _, item := range prefs.RecentFiles {
		if strings.TrimSpace(item) == "" || indexPreferencePath(uniqueRecent, item) >= 0 {
			continue
		}
		uniqueRecent = append(uniqueRecent, filepath.Clean(item))
	}

	pinned := make([]string, 0, len(prefs.PinnedRecentFiles))
	for _, requested := range prefs.PinnedRecentFiles {
		index := indexPreferencePath(uniqueRecent, requested)
		if index < 0 || indexPreferencePath(pinned, uniqueRecent[index]) >= 0 {
			continue
		}
		pinned = append(pinned, uniqueRecent[index])
	}

	unpinned := make([]string, 0, maxRecent)
	for _, item := range uniqueRecent {
		if indexPreferencePath(pinned, item) >= 0 {
			continue
		}
		unpinned = append(unpinned, item)
		if len(unpinned) == maxRecent {
			break
		}
	}

	recent := make([]string, 0, len(pinned)+len(unpinned))
	recent = append(recent, pinned...)
	recent = append(recent, unpinned...)
	prefs.PinnedRecentFiles = pinned
	prefs.RecentFiles = recent
}

func (a *App) rememberFile(filePath string) error {
	cleaned := filepath.Clean(filePath)
	if a.isReferenceDocumentPath(cleaned) {
		return nil
	}
	_, err := a.updatePreferences(func(prefs *Preferences) {
		normaliseRecentPreferences(prefs)
		if index := indexPreferencePath(prefs.RecentFiles, cleaned); index >= 0 {
			// Reopening an existing recent record updates its canonical spelling
			// without changing either its partition or its position.
			prefs.RecentFiles[index] = cleaned
			if pinnedIndex := indexPreferencePath(prefs.PinnedRecentFiles, cleaned); pinnedIndex >= 0 {
				prefs.PinnedRecentFiles[pinnedIndex] = cleaned
			}
		} else {
			// New unpinned records enter at the front of the unpinned partition.
			prefs.RecentFiles = append([]string{cleaned}, prefs.RecentFiles...)
		}
		normaliseRecentPreferences(prefs)
		prefs.LastFile = cleaned
	})
	return err
}

func (a *App) readDocument(filePath string, remember bool) (*Document, error) {
	absPath, err := filepath.Abs(filepath.Clean(filePath))
	if err != nil {
		return nil, err
	}
	data, info, _, foundBookmark, bookmarkErr := a.readDocumentWithMacBookmark(absPath)
	if !foundBookmark || bookmarkErr != nil {
		data, err = os.ReadFile(absPath)
		if err == nil {
			info, err = os.Stat(absPath)
		}
		if err != nil {
			if foundBookmark {
				return nil, joinDocumentAccessErrors(err, bookmarkErr)
			}
			return nil, err
		}
	}
	if remember {
		_ = a.rememberFile(absPath)
	}
	return &Document{
		Path: absPath, Name: filepath.Base(absPath), Directory: filepath.Dir(absPath),
		Content: string(data), ModifiedAt: info.ModTime().Format(time.RFC3339Nano), Size: info.Size(),
	}, nil
}

func (a *App) markdownOpenDialogOptions() wailsruntime.OpenDialogOptions {
	return wailsruntime.OpenDialogOptions{
		Title: a.text("openMarkdown"),
		Filters: []wailsruntime.FileFilter{
			{DisplayName: a.text("markdownDocument"), Pattern: "*.md;*.markdown;*.mdown;*.mkd"},
			{DisplayName: a.text("textFile"), Pattern: "*.txt"},
			{DisplayName: a.text("allFiles"), Pattern: "*.*"},
		},
	}
}

func (a *App) OpenFile() (*Document, error) {
	filePath, err := wailsruntime.OpenFileDialog(a.ctx, a.markdownOpenDialogOptions())
	if err != nil || filePath == "" {
		return nil, err
	}
	_ = a.rememberMacSecurityScopedPath(filePath, false)
	return a.ReadFile(filePath)
}

// OpenReferenceDocument opens one of the bundled, generated example files.
// Built-in references deliberately do not enter Recent so the user's library
// stays reserved for their own documents.
func (a *App) OpenReferenceDocument(kind string) (*Document, error) {
	name, content, err := referenceDocument(kind)
	if err != nil {
		return nil, err
	}
	directory, err := a.referenceDocumentDirectory()
	if err != nil {
		return nil, err
	}
	path, err := materialiseReferenceDocument(directory, name, content)
	if err != nil {
		return nil, err
	}
	doc, err := a.readDocument(path, false)
	if err != nil {
		return nil, err
	}
	doc.ReadOnly = true
	return doc, nil
}

func (a *App) referenceDocumentDirectory() (string, error) {
	directory := strings.TrimSpace(a.referenceOverride)
	if directory != "" {
		return filepath.Abs(filepath.Clean(directory))
	}
	cache, err := os.UserCacheDir()
	if err != nil {
		return "", err
	}
	return filepath.Abs(filepath.Join(cache, "QuilliteMarkdown", "reference-documents"))
}

func (a *App) isReferenceDocumentPath(filePath string) bool {
	directory, err := a.referenceDocumentDirectory()
	if err != nil {
		return false
	}
	candidate, err := filepath.Abs(filepath.Clean(filePath))
	if err != nil || !samePreferencePath(filepath.Dir(candidate), directory) {
		return false
	}
	for _, kind := range []string{"charts", "formulas", "formats"} {
		name, _, referenceErr := referenceDocument(kind)
		if referenceErr == nil && strings.EqualFold(filepath.Base(candidate), name) {
			return true
		}
	}
	return false
}

func (a *App) removeReferenceDocumentsFromRecent(prefs *Preferences) bool {
	changed := false
	filter := func(paths []string) []string {
		filtered := make([]string, 0, len(paths))
		for _, item := range paths {
			if a.isReferenceDocumentPath(item) {
				changed = true
				continue
			}
			filtered = append(filtered, item)
		}
		return filtered
	}

	prefs.RecentFiles = filter(prefs.RecentFiles)
	prefs.PinnedRecentFiles = filter(prefs.PinnedRecentFiles)
	if a.isReferenceDocumentPath(prefs.LastFile) {
		prefs.LastFile = ""
		changed = true
	}
	if changed && prefs.LastFile == "" && len(prefs.RecentFiles) > 0 {
		prefs.LastFile = prefs.RecentFiles[0]
	}
	normaliseRecentPreferences(prefs)
	return changed
}

func referenceDocument(kind string) (string, string, error) {
	switch strings.ToLower(strings.TrimSpace(kind)) {
	case "charts":
		return "图表案例.MD", chartReferenceMarkdown, nil
	case "formulas":
		return "科学公式案例.MD", formulaReferenceMarkdown, nil
	case "formats":
		return "常规内容案例.MD", formatReferenceMarkdown, nil
	default:
		return "", "", fmt.Errorf("unknown reference document: %s", kind)
	}
}

func materialiseReferenceDocument(directory, name, content string) (string, error) {
	if err := os.MkdirAll(directory, 0o755); err != nil {
		return "", err
	}
	path := filepath.Join(directory, name)
	if err := os.WriteFile(path, []byte(content), 0o644); err != nil {
		return "", err
	}
	return path, nil
}

// NewFile creates a document without prompting for a location. macOS keeps
// user documents outside the replaceable .app bundle, while other platforms
// retain the portable executable-directory preference with safe fallbacks.
func (a *App) NewFile() (*Document, error) {
	executable, _ := os.Executable()
	home, _ := os.UserHomeDir()
	config, _ := os.UserConfigDir()
	directories := newDocumentDirectories(goruntime.GOOS, executable, home, config)
	baseName := strings.TrimSuffix(a.text("newDocument"), filepath.Ext(a.text("newDocument")))
	filePath, err := createNewMarkdownFile(directories, baseName, time.Now())
	if err != nil {
		return nil, err
	}
	a.markDraft(filePath)
	return a.readDocument(filePath, true)
}

func newDocumentDirectories(platform, executablePath, homeDir, configDir string) []string {
	directories := make([]string, 0, 3)
	if platform != "darwin" && strings.TrimSpace(executablePath) != "" {
		directories = append(directories, filepath.Dir(executablePath))
	}
	if strings.TrimSpace(homeDir) != "" {
		directories = append(directories, filepath.Join(homeDir, "Documents", appNameEN))
	}
	if strings.TrimSpace(configDir) != "" {
		directories = append(directories, filepath.Join(configDir, appNameEN, "Documents"))
	}
	return directories
}

func (a *App) migrateLegacyBundledDraftReferences(platform, homeDir string, prefs Preferences) Preferences {
	if platform != "darwin" || strings.TrimSpace(homeDir) == "" {
		return prefs
	}
	safeDirectory := filepath.Join(homeDir, "Documents", appNameEN)
	replacements := make(map[string]string)
	for _, oldPath := range prefs.DraftFiles {
		cleaned := filepath.Clean(oldPath)
		if !strings.Contains(filepath.ToSlash(cleaned), ".app/Contents/MacOS/") {
			continue
		}
		recoveredPath := filepath.Join(safeDirectory, filepath.Base(cleaned))
		if info, err := os.Stat(recoveredPath); err == nil && !info.IsDir() {
			replacements[draftPathKey(cleaned)] = recoveredPath
		}
	}
	if len(replacements) == 0 {
		return prefs
	}
	updated, err := a.updatePreferences(func(current *Preferences) {
		for index, filePath := range current.RecentFiles {
			if replacement, ok := replacements[draftPathKey(filePath)]; ok {
				current.RecentFiles[index] = replacement
			}
		}
		for index, filePath := range current.PinnedRecentFiles {
			if replacement, ok := replacements[draftPathKey(filePath)]; ok {
				current.PinnedRecentFiles[index] = replacement
			}
		}
		for index, filePath := range current.DraftFiles {
			if replacement, ok := replacements[draftPathKey(filePath)]; ok {
				current.DraftFiles[index] = replacement
			}
		}
		if replacement, ok := replacements[draftPathKey(current.LastFile)]; ok {
			current.LastFile = replacement
		}
	})
	if err != nil {
		return prefs
	}
	return updated
}

func (a *App) markDraft(filePath string) {
	filePath = filepath.Clean(filePath)
	a.draftsMu.Lock()
	if a.draftFiles == nil {
		a.draftFiles = make(map[string]bool)
	}
	a.draftFiles[draftPathKey(filePath)] = true
	a.draftsMu.Unlock()
	_, _ = a.updatePreferences(func(prefs *Preferences) {
		for _, item := range prefs.DraftFiles {
			if draftPathKey(item) == draftPathKey(filePath) {
				return
			}
		}
		prefs.DraftFiles = append(prefs.DraftFiles, filePath)
	})
}

func (a *App) restoreDrafts(draftFiles []string) {
	a.draftsMu.Lock()
	defer a.draftsMu.Unlock()
	if a.draftFiles == nil {
		a.draftFiles = make(map[string]bool)
	}
	for _, filePath := range draftFiles {
		if strings.TrimSpace(filePath) != "" {
			a.draftFiles[draftPathKey(filePath)] = true
		}
	}
}

func draftPathKey(filePath string) string {
	cleaned := filepath.Clean(filePath)
	if goruntime.GOOS == "windows" {
		return strings.ToLower(cleaned)
	}
	return cleaned
}

func replaceDraftPreferencePath(paths []string, originalKey, savedPath string) ([]string, bool) {
	replaced := false
	updated := make([]string, 0, len(paths))
	for _, item := range paths {
		candidate := item
		if draftPathKey(item) == originalKey {
			candidate = savedPath
			replaced = true
		}
		if strings.TrimSpace(candidate) == "" || indexPreferencePath(updated, candidate) >= 0 {
			continue
		}
		updated = append(updated, filepath.Clean(candidate))
	}
	return updated, replaced
}

func (a *App) claimDraftReplacement(originalPath, savedPath string) (string, bool, error) {
	originalPath = filepath.Clean(originalPath)
	savedPath = filepath.Clean(savedPath)
	samePath := originalPath == savedPath
	if goruntime.GOOS == "windows" {
		samePath = strings.EqualFold(originalPath, savedPath)
	}
	if originalPath == "." || savedPath == "." || samePath {
		return "", false, nil
	}

	a.draftsMu.Lock()
	defer a.draftsMu.Unlock()
	key := draftPathKey(originalPath)
	if !a.draftFiles[key] {
		return "", false, nil
	}
	if a.draftReplacements == nil {
		a.draftReplacements = make(map[string]bool)
	}
	if a.draftReplacements[key] {
		return "", false, errDraftReplacementInProgress
	}
	a.draftReplacements[key] = true
	return key, true, nil
}

func (a *App) releaseDraftReplacementClaim(key string) {
	if key == "" {
		return
	}
	a.draftsMu.Lock()
	delete(a.draftReplacements, key)
	a.draftsMu.Unlock()
}

func (a *App) migrateClaimedDraft(originalPath, savedPath, key string) (string, error) {
	_, preferencesErr := a.updatePreferences(func(prefs *Preferences) {
		recent, replacedRecent := replaceDraftPreferencePath(prefs.RecentFiles, key, savedPath)
		if !replacedRecent && indexPreferencePath(recent, savedPath) < 0 {
			recent = append([]string{savedPath}, recent...)
		}
		prefs.RecentFiles = recent
		prefs.PinnedRecentFiles, _ = replaceDraftPreferencePath(prefs.PinnedRecentFiles, key, savedPath)
		favorites, _ := replaceDraftPreferencePath(prefs.FavoriteFiles, key, savedPath)
		prefs.FavoriteFiles = favorites
		drafts := make([]string, 0, len(prefs.DraftFiles))
		for _, item := range prefs.DraftFiles {
			if draftPathKey(item) != key {
				drafts = append(drafts, item)
			}
		}
		prefs.DraftFiles = drafts
		if draftPathKey(prefs.LastFile) == key {
			prefs.LastFile = savedPath
		}
	})
	if preferencesErr != nil {
		// Keep both the original file and the in-memory draft identity so the
		// operation can be retried without losing the user's recoverable draft.
		return "", preferencesErr
	}

	// Preferences now point at the saved document. Do not roll them back if
	// deleting the superseded draft fails: the target file has already been
	// written and the committed migration is the authoritative state.
	a.draftsMu.Lock()
	delete(a.draftFiles, key)
	delete(a.draftReplacements, key)
	a.draftsMu.Unlock()
	// The target and preferences are already authoritative. Cleanup is best
	// effort: reporting failure here would leave the frontend on the old path
	// even though its draft identity has been migrated to savedPath.
	_ = os.Remove(originalPath)
	return originalPath, nil
}

func (a *App) replaceDraft(originalPath, savedPath string) (string, error) {
	key, claimed, err := a.claimDraftReplacement(originalPath, savedPath)
	if err != nil || !claimed {
		return "", err
	}
	defer a.releaseDraftReplacementClaim(key)
	return a.migrateClaimedDraft(filepath.Clean(originalPath), filepath.Clean(savedPath), key)
}

func createNewMarkdownFile(directories []string, baseName string, now time.Time) (string, error) {
	baseName = strings.TrimSpace(baseName)
	if baseName == "" {
		baseName = "New document"
	}
	stamp := now.Format("20060102-150405")
	var lastErr error
	seen := make(map[string]bool)
	for _, directory := range directories {
		directory = filepath.Clean(strings.TrimSpace(directory))
		key := strings.ToLower(directory)
		if directory == "." || seen[key] {
			continue
		}
		seen[key] = true
		if err := os.MkdirAll(directory, 0o755); err != nil {
			lastErr = err
			continue
		}
		for suffix := 0; suffix < 100; suffix++ {
			name := fmt.Sprintf("%s-%s.md", baseName, stamp)
			if suffix > 0 {
				name = fmt.Sprintf("%s-%s-%d.md", baseName, stamp, suffix+1)
			}
			filePath := filepath.Join(directory, name)
			file, err := os.OpenFile(filePath, os.O_WRONLY|os.O_CREATE|os.O_EXCL, 0o644)
			if errors.Is(err, os.ErrExist) {
				continue
			}
			if err != nil {
				lastErr = err
				break
			}
			if err := file.Close(); err != nil {
				_ = os.Remove(filePath)
				lastErr = err
				break
			}
			return filePath, nil
		}
	}
	if lastErr == nil {
		lastErr = errors.New("no writable document directory")
	}
	return "", fmt.Errorf("create Markdown document: %w", lastErr)
}

// SelectImage copies the selected image into the document's assets directory
// and returns a portable, Markdown-friendly relative path.
func (a *App) SelectImage(currentFile string) (string, error) {
	imagePath, err := wailsruntime.OpenFileDialog(a.ctx, wailsruntime.OpenDialogOptions{
		Title: a.text("selectImage"),
		Filters: []wailsruntime.FileFilter{
			{DisplayName: a.text("imageFile"), Pattern: "*.png;*.jpg;*.jpeg;*.gif;*.webp;*.svg;*.bmp"},
			{DisplayName: a.text("allFiles"), Pattern: "*.*"},
		},
	})
	if err != nil || imagePath == "" {
		return "", err
	}
	_ = a.rememberMacSecurityScopedPath(imagePath, false)
	return importImageToAssets(currentFile, imagePath)
}

// ImportImage copies a dropped image into the document's assets directory.
func (a *App) ImportImage(currentFile, sourcePath string) (string, error) {
	_ = a.rememberMacSecurityScopedPath(sourcePath, false)
	return importImageToAssets(currentFile, sourcePath)
}

// SavePastedImage stores image data received from the clipboard in the same
// assets directory used by selected and dropped files.
func (a *App) SavePastedImage(currentFile, dataURL string) (string, error) {
	metadata, encoded, found := strings.Cut(strings.TrimSpace(dataURL), ",")
	if !found || !strings.HasPrefix(strings.ToLower(metadata), "data:image/") || !strings.Contains(strings.ToLower(metadata), ";base64") {
		return "", errors.New("clipboard data is not a base64 image")
	}
	if int64(len(encoded)) > maxImportedImageSize*2 {
		return "", errors.New("clipboard image exceeds the 25 MB limit")
	}
	data, err := base64.StdEncoding.DecodeString(encoded)
	if err != nil {
		return "", fmt.Errorf("decode clipboard image: %w", err)
	}
	if int64(len(data)) > maxImportedImageSize {
		return "", errors.New("clipboard image exceeds the 25 MB limit")
	}
	mimeType := strings.ToLower(strings.TrimSuffix(strings.TrimPrefix(strings.Split(metadata, ";")[0], "data:"), ";base64"))
	extensionByMIME := map[string]string{
		"image/png": ".png", "image/jpeg": ".jpg", "image/gif": ".gif",
		"image/webp": ".webp", "image/bmp": ".bmp",
	}
	extension := extensionByMIME[mimeType]
	if extension == "" {
		return "", fmt.Errorf("unsupported clipboard image type: %s", mimeType)
	}
	name := "image-" + time.Now().Format("20060102-150405.000") + extension
	return writeImageAsset(currentFile, name, data)
}

func importImageToAssets(currentFile, sourcePath string) (string, error) {
	if strings.TrimSpace(sourcePath) == "" {
		return "", errors.New("image path is empty")
	}
	source, err := filepath.Abs(filepath.Clean(sourcePath))
	if err != nil {
		return "", err
	}
	extension := strings.ToLower(filepath.Ext(source))
	if !imageExtensions[extension] {
		return "", errors.New("selected file is not a supported image")
	}
	info, err := os.Stat(source)
	if err != nil {
		return "", err
	}
	if info.IsDir() || info.Size() > maxImportedImageSize {
		return "", errors.New("image is a directory or exceeds the 25 MB limit")
	}
	assetsDirectory, documentDirectory, err := imageAssetsDirectory(currentFile)
	if err != nil {
		return "", err
	}
	if sameFilesystemPath(filepath.Dir(source), assetsDirectory) {
		relative, relativeErr := filepath.Rel(documentDirectory, source)
		if relativeErr != nil {
			return "", relativeErr
		}
		return filepath.ToSlash(relative), nil
	}
	data, err := os.ReadFile(source)
	if err != nil {
		return "", err
	}
	return writeImageAsset(currentFile, filepath.Base(source), data)
}

func imageAssetsDirectory(currentFile string) (assetsDirectory, documentDirectory string, err error) {
	if strings.TrimSpace(currentFile) == "" {
		return "", "", errors.New("document path is empty")
	}
	documentPath, err := filepath.Abs(filepath.Clean(currentFile))
	if err != nil {
		return "", "", err
	}
	documentDirectory = filepath.Dir(documentPath)
	assetsDirectory = filepath.Join(documentDirectory, "assets")
	if err := os.MkdirAll(assetsDirectory, 0o755); err != nil {
		return "", "", fmt.Errorf("create image assets directory: %w", err)
	}
	return assetsDirectory, documentDirectory, nil
}

func sameFilesystemPath(first, second string) bool {
	first = filepath.Clean(first)
	second = filepath.Clean(second)
	if goruntime.GOOS == "windows" {
		return strings.EqualFold(first, second)
	}
	return first == second
}

func writeImageAsset(currentFile, preferredName string, data []byte) (string, error) {
	if int64(len(data)) > maxImportedImageSize {
		return "", errors.New("image exceeds the 25 MB limit")
	}
	assetsDirectory, documentDirectory, err := imageAssetsDirectory(currentFile)
	if err != nil {
		return "", err
	}
	extension := strings.ToLower(filepath.Ext(preferredName))
	if !imageExtensions[extension] {
		return "", errors.New("selected file is not a supported image")
	}
	baseName := strings.TrimSuffix(filepath.Base(preferredName), filepath.Ext(preferredName))
	if strings.TrimSpace(baseName) == "" {
		baseName = "image"
	}
	for suffix := 0; suffix < 10000; suffix++ {
		name := baseName + extension
		if suffix > 0 {
			name = fmt.Sprintf("%s-%d%s", baseName, suffix+1, extension)
		}
		destination := filepath.Join(assetsDirectory, name)
		file, openErr := os.OpenFile(destination, os.O_WRONLY|os.O_CREATE|os.O_EXCL, 0o644)
		if errors.Is(openErr, os.ErrExist) {
			continue
		}
		if openErr != nil {
			return "", openErr
		}
		if _, writeErr := file.Write(data); writeErr != nil {
			_ = file.Close()
			_ = os.Remove(destination)
			return "", writeErr
		}
		if closeErr := file.Close(); closeErr != nil {
			_ = os.Remove(destination)
			return "", closeErr
		}
		relative, relativeErr := filepath.Rel(documentDirectory, destination)
		if relativeErr != nil {
			return "", relativeErr
		}
		return filepath.ToSlash(relative), nil
	}
	return "", errors.New("unable to allocate a unique image asset name")
}

// ReadImageData reads local images for the WebView. Direct file:// access is
// blocked by WebView security rules, so previews use a data URL instead.
func (a *App) ReadImageData(imagePath, documentDirectory string) (string, error) {
	resolved, err := resolveLocalImagePath(imagePath, documentDirectory)
	if err != nil {
		return "", err
	}
	info, err := os.Stat(resolved)
	if err != nil {
		return "", err
	}
	if info.IsDir() {
		return "", errors.New("image path is a directory")
	}
	if info.Size() > maxImportedImageSize {
		return "", errors.New("image exceeds the 25 MB preview limit")
	}
	data, err := os.ReadFile(resolved)
	if err != nil {
		return "", err
	}
	contentType := mime.TypeByExtension(strings.ToLower(filepath.Ext(resolved)))
	if contentType == "" {
		contentType = http.DetectContentType(data)
	}
	contentType = strings.Split(contentType, ";")[0]
	if !strings.HasPrefix(contentType, "image/") {
		return "", errors.New("selected file is not a supported image")
	}
	return "data:" + contentType + ";base64," + base64.StdEncoding.EncodeToString(data), nil
}

func resolveLocalImagePath(imagePath, documentDirectory string) (string, error) {
	imagePath = strings.TrimSpace(imagePath)
	if imagePath == "" {
		return "", errors.New("image path is empty")
	}
	if parsed, err := url.Parse(imagePath); err == nil && strings.EqualFold(parsed.Scheme, "file") {
		imagePath, err = url.PathUnescape(parsed.Path)
		if err != nil {
			return "", err
		}
		if goruntime.GOOS == "windows" && len(imagePath) >= 3 && imagePath[0] == '/' && imagePath[2] == ':' {
			imagePath = imagePath[1:]
		}
	} else if strings.Contains(imagePath, "://") {
		return "", errors.New("only local images can be read")
	} else if unescaped, err := url.PathUnescape(imagePath); err == nil {
		imagePath = unescaped
	}
	imagePath = filepath.FromSlash(imagePath)
	if !filepath.IsAbs(imagePath) {
		if strings.TrimSpace(documentDirectory) == "" {
			return "", errors.New("document directory is empty")
		}
		imagePath = filepath.Join(documentDirectory, imagePath)
	}
	return filepath.Abs(filepath.Clean(imagePath))
}

func (a *App) OpenFolder() (*FolderResult, error) {
	root, err := wailsruntime.OpenDirectoryDialog(a.ctx, wailsruntime.OpenDialogOptions{Title: a.text("openFolder")})
	if err != nil || root == "" {
		return nil, err
	}
	_ = a.rememberMacSecurityScopedPath(root, true)
	folder, err := a.ListFolder(root)
	if err != nil {
		return nil, err
	}
	if err := a.rememberExplorerRoot(folder.Root); err != nil {
		return nil, err
	}
	return folder, nil
}

func (a *App) ReadFile(filePath string) (*Document, error) {
	return a.readDocument(filePath, true)
}

// OpenRecentFile opens a user-selected library record. macOS protects files in
// folders such as Documents, Desktop and Downloads. A path remembered by the
// app can outlive the system's permission for the app identity (notably after
// replacing an unsigned build), so a direct POSIX read can return EPERM even
// though Finder can still open the file. In that case, let the system open
// panel renew the user's consent and continue with the selected document.
// Background refreshes deliberately keep using ReadFile so they never summon
// an authorization panel without a user action.
func (a *App) OpenRecentFile(filePath string) (*Document, error) {
	document, err := a.readDocument(filePath, true)
	if err == nil || !isDocumentAccessDenied(goruntime.GOOS, err) {
		return document, err
	}

	cleaned, cleanErr := filepath.Abs(filepath.Clean(filePath))
	if cleanErr != nil {
		return nil, err
	}
	options := a.markdownOpenDialogOptions()
	options.Title = a.text("reauthorizeDocument")
	options.DefaultFilename = filepath.Base(cleaned)
	if directory := filepath.Dir(cleaned); directory != "" {
		if info, statErr := os.Stat(directory); statErr == nil && info.IsDir() {
			options.DefaultDirectory = directory
		}
	}

	selected, dialogErr := wailsruntime.OpenFileDialog(a.ctx, options)
	if dialogErr != nil {
		return nil, dialogErr
	}
	if strings.TrimSpace(selected) == "" {
		return nil, errMacDocumentAccessNotGranted
	}
	_ = a.rememberMacSecurityScopedPath(selected, false)
	return a.readDocument(selected, true)
}

func isDocumentAccessDenied(platform string, err error) bool {
	return platform == "darwin" && errors.Is(err, os.ErrPermission)
}

// CanEditFile checks whether the existing document can be opened for writing
// without changing its contents. This catches read-only chat-app cache files,
// restricted locations, and files currently locked against writes.
func (a *App) CanEditFile(filePath string) bool {
	editable := false
	_, foundBookmark, bookmarkErr := a.withMacSecurityScopedPath(filePath, func(accessiblePath string) error {
		editable = canEditFile(accessiblePath)
		if !editable {
			return os.ErrPermission
		}
		return nil
	})
	if foundBookmark && bookmarkErr == nil {
		return editable
	}
	return canEditFile(filePath)
}

func canEditFile(filePath string) bool {
	if strings.TrimSpace(filePath) == "" {
		return false
	}
	cleaned := filepath.Clean(filePath)
	info, err := os.Stat(cleaned)
	if err != nil || info.IsDir() {
		return false
	}
	file, err := os.OpenFile(cleaned, os.O_WRONLY, 0)
	if err != nil {
		return false
	}
	return file.Close() == nil
}

func (a *App) SaveFile(filePath, content string) (*Document, error) {
	if strings.TrimSpace(filePath) == "" {
		return a.SaveAs("", content)
	}
	if a.isReferenceDocumentPath(filePath) {
		return nil, errors.New("built-in reference documents are read-only; save a copy to edit")
	}
	// Version history is best-effort and must never prevent the user's save.
	// Capture the last on-disk state before replacing it.
	_ = a.captureDocumentVersion(filePath, content)
	resolvedPath, foundBookmark, bookmarkErr := a.writeDocumentWithMacBookmark(filePath, []byte(content))
	if !foundBookmark || bookmarkErr != nil {
		if err := os.WriteFile(filepath.Clean(filePath), []byte(content), 0o644); err != nil {
			if foundBookmark {
				return nil, joinDocumentAccessErrors(err, bookmarkErr)
			}
			return nil, err
		}
		resolvedPath = filePath
	}
	return a.readDocument(resolvedPath, true)
}

func (a *App) saveDocumentAs(currentPath, filePath, content string) (*Document, error) {
	targetPath, err := filepath.Abs(filepath.Clean(filePath))
	if err != nil {
		return nil, err
	}
	claimKey, claimedDraft, err := a.claimDraftReplacement(currentPath, targetPath)
	if err != nil {
		return nil, err
	}
	if claimedDraft {
		defer a.releaseDraftReplacementClaim(claimKey)
	}
	_ = a.captureDocumentVersion(targetPath, content)
	if err := os.WriteFile(targetPath, []byte(content), 0o644); err != nil {
		return nil, err
	}
	saved, err := a.readDocument(targetPath, false)
	if err != nil {
		return nil, err
	}
	if claimedDraft {
		replacedPath, err := a.migrateClaimedDraft(filepath.Clean(currentPath), saved.Path, claimKey)
		if err != nil {
			return nil, err
		}
		saved.ReplacedPath = replacedPath
	} else if err := a.rememberFile(saved.Path); err != nil {
		return nil, err
	}
	// The frontend owns dirty state: a completed write may belong to an older
	// document session or snapshot. Only it can acknowledge the saved content.
	return saved, nil
}

func (a *App) SaveAs(currentPath, content string) (*Document, error) {
	defaultName := filepath.Base(currentPath)
	if defaultName == "." || defaultName == "" {
		defaultName = a.text("newDocument")
	}
	filePath, err := wailsruntime.SaveFileDialog(a.ctx, wailsruntime.SaveDialogOptions{
		Title: a.text("saveAsMarkdown"), DefaultFilename: defaultName,
		Filters: []wailsruntime.FileFilter{
			{DisplayName: a.text("markdownDocument"), Pattern: "*.md"},
			{DisplayName: a.text("textFile"), Pattern: "*.txt"},
		},
	})
	if err != nil || filePath == "" {
		return nil, err
	}
	document, err := a.saveDocumentAs(currentPath, filePath, content)
	if err == nil {
		_ = a.rememberMacSecurityScopedPath(filePath, false)
	}
	return document, err
}

func (a *App) SetDirty(dirty bool) {
	a.mu.Lock()
	a.dirty = dirty
	a.mu.Unlock()
}

func (a *App) ListFolder(root string) (*FolderResult, error) {
	absRoot, err := filepath.Abs(filepath.Clean(root))
	if err != nil {
		return nil, err
	}
	var folder *FolderResult
	resolvedRoot, foundBookmark, bookmarkErr := a.withMacSecurityScopedPath(absRoot, func(accessibleRoot string) error {
		var listErr error
		folder, listErr = a.listFolderAccessible(accessibleRoot)
		return listErr
	})
	if foundBookmark && bookmarkErr == nil {
		folder.Root = filepath.Clean(resolvedRoot)
		return folder, nil
	}
	folder, err = a.listFolderAccessible(absRoot)
	if err != nil && foundBookmark {
		return nil, joinDocumentAccessErrors(err, bookmarkErr)
	}
	return folder, err
}

func (a *App) listFolderAccessible(absRoot string) (*FolderResult, error) {
	info, err := os.Stat(absRoot)
	if err != nil {
		return nil, err
	}
	if !info.IsDir() {
		return nil, fmt.Errorf("resource explorer path is not a directory: %s", absRoot)
	}
	// os.Stat can succeed for a privacy-protected directory while listing its
	// contents still returns EPERM. Probe the root explicitly so callers can
	// reauthorize instead of silently rendering an empty Explorer.
	if _, err := os.ReadDir(absRoot); err != nil {
		return nil, err
	}
	files := make([]FolderFile, 0)
	a.collectMarkdownFiles(absRoot, absRoot, 0, &files)
	return &FolderResult{Root: absRoot, Name: filepath.Base(absRoot), Files: files}, nil
}

func (a *App) rememberExplorerRoot(root string) error {
	cleaned := filepath.Clean(root)
	_, err := a.updatePreferences(func(prefs *Preferences) {
		prefs.ExplorerRoot = cleaned
	})
	return err
}

func (a *App) collectMarkdownFiles(root, current string, depth int, result *[]FolderFile) {
	if depth > 5 || len(*result) >= 800 {
		return
	}
	entries, err := os.ReadDir(current)
	if err != nil {
		return
	}
	sort.Slice(entries, func(i, j int) bool {
		if entries[i].IsDir() != entries[j].IsDir() {
			return entries[i].IsDir()
		}
		return strings.ToLower(entries[i].Name()) < strings.ToLower(entries[j].Name())
	})
	for _, entry := range entries {
		if strings.HasPrefix(entry.Name(), ".") || entry.Name() == "node_modules" {
			continue
		}
		fullPath := filepath.Join(current, entry.Name())
		if entry.IsDir() {
			a.collectMarkdownFiles(root, fullPath, depth+1, result)
		} else if markdownExtensions[strings.ToLower(filepath.Ext(entry.Name()))] {
			relative, _ := filepath.Rel(root, fullPath)
			directory, _ := filepath.Rel(root, filepath.Dir(fullPath))
			if directory == "" {
				directory = "."
			}
			*result = append(*result, FolderFile{Path: fullPath, Name: entry.Name(), RelativePath: relative, Directory: directory})
		}
		if len(*result) >= 800 {
			break
		}
	}
}

func (a *App) GetPreferences() (Preferences, error) {
	prefs, err := a.readPreferences()
	if err != nil {
		return prefs, err
	}
	prefs.RecentFileStatuses = a.recentFileStatuses(prefs.RecentFiles)
	prefs.FavoriteFileStatuses = a.recentFileStatuses(prefs.FavoriteFiles)
	return prefs, nil
}

func (a *App) recentFileStatuses(paths []string) []RecentFileStatus {
	statuses := make([]RecentFileStatus, 0, len(paths))
	for _, filePath := range paths {
		exists := false
		_, foundBookmark, bookmarkErr := a.withMacSecurityScopedPath(filePath, func(accessiblePath string) error {
			info, err := os.Stat(filepath.Clean(accessiblePath))
			exists = err == nil && !info.IsDir()
			return err
		})
		if !foundBookmark || bookmarkErr != nil {
			info, err := os.Stat(filepath.Clean(filePath))
			exists = err == nil && !info.IsDir()
		}
		statuses = append(statuses, RecentFileStatus{
			Path:   filePath,
			Exists: exists,
		})
	}
	return statuses
}

// NeedsLanguageSelection is true only when an installer has explicitly marked
// this as a new installation. Older versions never created the marker, so an
// upgrade does not interrupt existing users with a first-run dialog.
func (a *App) NeedsLanguageSelection() bool {
	return needsLanguageSelection(goruntime.GOOS, a.preferencePath(), a.languageSelectionMarkerPath())
}

func needsLanguageSelection(platform, preferencePath, markerPath string) bool {
	if _, err := os.Stat(markerPath); err == nil {
		return true
	}
	// Windows installers create the marker only for a genuinely new install.
	// On macOS and Linux there is no equivalent install wizard, so the absence
	// of preferences is the first-launch signal. Existing users already have a
	// preference file and are therefore never interrupted after an upgrade.
	if platform == "windows" {
		return false
	}
	_, err := os.Stat(preferencePath)
	return errors.Is(err, os.ErrNotExist)
}

// SetRecentPinned changes only an existing recent record. Pinning inserts the
// record at the front of the pinned partition; repeating the same request is
// idempotent and does not reorder an already pinned record.
func (a *App) SetRecentPinned(filePath string, pinned bool) (Preferences, error) {
	cleaned := filepath.Clean(filePath)
	return a.updatePreferences(func(prefs *Preferences) {
		normaliseRecentPreferences(prefs)
		recentIndex := indexPreferencePath(prefs.RecentFiles, cleaned)
		if recentIndex < 0 {
			return
		}
		storedPath := prefs.RecentFiles[recentIndex]
		pinnedIndex := indexPreferencePath(prefs.PinnedRecentFiles, storedPath)
		if pinned {
			if pinnedIndex < 0 {
				info, err := os.Stat(storedPath)
				if err != nil || info.IsDir() {
					return
				}
				prefs.PinnedRecentFiles = append([]string{storedPath}, prefs.PinnedRecentFiles...)
			}
			return
		}
		if pinnedIndex >= 0 {
			prefs.PinnedRecentFiles = append(prefs.PinnedRecentFiles[:pinnedIndex], prefs.PinnedRecentFiles[pinnedIndex+1:]...)
		}
	})
}

// ReorderPinnedRecent applies the requested order to currently pinned records.
// Unknown, unpinned, and duplicate paths are ignored; omitted pinned records
// retain their relative order at the end.
func (a *App) ReorderPinnedRecent(filePaths []string) (Preferences, error) {
	return a.updatePreferences(func(prefs *Preferences) {
		normaliseRecentPreferences(prefs)
		reordered := make([]string, 0, len(prefs.PinnedRecentFiles))
		for _, requested := range filePaths {
			index := indexPreferencePath(prefs.PinnedRecentFiles, requested)
			if index < 0 || indexPreferencePath(reordered, prefs.PinnedRecentFiles[index]) >= 0 {
				continue
			}
			reordered = append(reordered, prefs.PinnedRecentFiles[index])
		}
		for _, existing := range prefs.PinnedRecentFiles {
			if indexPreferencePath(reordered, existing) < 0 {
				reordered = append(reordered, existing)
			}
		}
		prefs.PinnedRecentFiles = reordered
	})
}

func (a *App) RemoveRecent(filePath string) (Preferences, error) {
	cleaned := filepath.Clean(filePath)
	return a.updatePreferences(func(prefs *Preferences) {
		filtered := make([]string, 0, len(prefs.RecentFiles))
		for _, item := range prefs.RecentFiles {
			if !strings.EqualFold(filepath.Clean(item), cleaned) {
				filtered = append(filtered, item)
			}
		}
		prefs.RecentFiles = filtered
		filteredPins := make([]string, 0, len(prefs.PinnedRecentFiles))
		for _, item := range prefs.PinnedRecentFiles {
			if !samePreferencePath(item, cleaned) {
				filteredPins = append(filteredPins, item)
			}
		}
		prefs.PinnedRecentFiles = filteredPins
		normaliseRecentPreferences(prefs)
		if samePreferencePath(prefs.LastFile, cleaned) {
			prefs.LastFile = ""
			if len(prefs.RecentFiles) > 0 {
				prefs.LastFile = prefs.RecentFiles[0]
			}
		}
	})
}

func (a *App) AddFavorite(filePath string) (Preferences, error) {
	if strings.TrimSpace(filePath) == "" {
		return Preferences{}, errors.New("favorite path is empty")
	}
	cleaned, err := filepath.Abs(filepath.Clean(filePath))
	if err != nil {
		return Preferences{}, err
	}
	return a.updatePreferences(func(prefs *Preferences) {
		for _, item := range prefs.FavoriteFiles {
			if strings.EqualFold(filepath.Clean(item), cleaned) {
				return
			}
		}
		prefs.FavoriteFiles = append([]string{cleaned}, prefs.FavoriteFiles...)
	})
}

func (a *App) RemoveFavorite(filePath string) (Preferences, error) {
	if strings.TrimSpace(filePath) == "" {
		return a.GetPreferences()
	}
	cleaned := filepath.Clean(filePath)
	return a.updatePreferences(func(prefs *Preferences) {
		filtered := make([]string, 0, len(prefs.FavoriteFiles))
		for _, item := range prefs.FavoriteFiles {
			if !strings.EqualFold(filepath.Clean(item), cleaned) {
				filtered = append(filtered, item)
			}
		}
		prefs.FavoriteFiles = filtered
	})
}

func (a *App) GetInitialFile() (*Document, error) {
	a.mu.Lock()
	a.frontendReady = true
	filePath := a.initialFile
	a.initialFile = ""
	a.mu.Unlock()
	// Wails can perform one final native title-bar layout after startup. Align
	// the macOS traffic lights again once the web toolbar is actually ready.
	refreshMacWindowChrome()
	if filePath == "" {
		return nil, nil
	}
	_ = a.rememberMacSecurityScopedPath(filePath, false)
	return a.OpenRecentFile(filePath)
}

func (a *App) GetStartupMode() string {
	for _, arg := range os.Args {
		if arg == "--edit" {
			return "edit"
		}
	}
	return "preview"
}

func (a *App) Dirname(filePath string) string {
	return filepath.Dir(filePath)
}

func (a *App) ShowInFolder(filePath string) error {
	return revealInFolder(filePath)
}

func (a *App) OpenExternal(rawURL string) error {
	parsed, err := url.Parse(rawURL)
	if err != nil || (parsed.Scheme != "http" && parsed.Scheme != "https" && parsed.Scheme != "mailto") {
		return fmt.Errorf("unsupported URL")
	}
	wailsruntime.BrowserOpenURL(a.ctx, rawURL)
	return nil
}

func (a *App) OpenDefaultApps() error {
	if goruntime.GOOS == "windows" {
		return exec.Command("explorer.exe", "ms-settings:defaultapps").Start()
	}
	return nil
}

func (a *App) Print() {
	wailsruntime.WindowPrint(a.ctx)
}

func (a *App) SetTheme(dark bool) {
	if dark {
		wailsruntime.WindowSetDarkTheme(a.ctx)
	} else {
		wailsruntime.WindowSetLightTheme(a.ctx)
	}
}

func (a *App) SetLanguage(language string) (string, error) {
	a.language = normaliseLanguage(language)
	_, err := a.updatePreferences(func(prefs *Preferences) {
		prefs.Language = a.language
	})
	if err == nil {
		if removeErr := os.Remove(a.languageSelectionMarkerPath()); removeErr != nil && !errors.Is(removeErr, os.ErrNotExist) {
			err = removeErr
		}
	}
	return a.language, err
}

func (a *App) SetFontFamily(fontFamily string) (string, error) {
	normalised := normaliseFontFamily(fontFamily)
	_, err := a.updatePreferences(func(prefs *Preferences) {
		prefs.FontFamily = normalised
	})
	return normalised, err
}

func (a *App) RequestQuit() bool {
	a.mu.RLock()
	dirty := a.dirty
	a.mu.RUnlock()
	if dirty {
		wailsruntime.EventsEmit(a.ctx, "document:confirm-close")
		return false
	}
	_ = a.ClearRecoverySnapshot()
	wailsruntime.Quit(a.ctx)
	return true
}

func (a *App) DiscardChangesAndQuit() bool {
	_ = a.ClearRecoverySnapshot()
	a.SetDirty(false)
	wailsruntime.Quit(a.ctx)
	return true
}

func findMarkdownArgument(args []string) string {
	for _, arg := range args {
		if markdownExtensions[strings.ToLower(filepath.Ext(strings.Trim(arg, "\"")))] {
			return strings.Trim(arg, "\"")
		}
	}
	return ""
}

func (a *App) text(key string) string {
	translations := map[string]map[string]string{
		"zh-CN": {
			"unsavedTitle": "尚未保存", "openUnsavedMessage": "当前文档有尚未保存的更改。打开其他文档将放弃这些更改。",
			"exitUnsavedMessage": "文档中的更改尚未保存。确定要退出并放弃这些更改吗？", "continueEditing": "继续编辑",
			"discardAndOpen": "不保存并打开", "discardAndExit": "不保存并退出", "openMarkdown": "打开 Markdown 文档", "reauthorizeDocument": "请选择该文档以恢复访问权限",
			"markdownDocument": "Markdown 文档", "textFile": "文本文件", "allFiles": "所有文件", "openFolder": "打开文档文件夹",
			"saveAsMarkdown": "另存为 Markdown 文档", "newDocument": "新建文档.md", "newMarkdown": "新建 Markdown 文档",
			"selectImage": "选择要插入的图片", "imageFile": "图片文件", "exportWord": "导出 Word 文档", "wordDocument": "Word 文档", "exportHTML": "导出 HTML 网页", "htmlDocument": "HTML 网页",
			"exportDocument": "导出文档", "exportPDF": "导出 PDF", "selectPandoc": "选择 Pandoc 可执行文件", "pandocExecutable": "Pandoc 可执行文件", "exportImage": "导出长图", "pngImage": "PNG 图片", "jpegImage": "JPEG 图片",
		},
		"en": {
			"unsavedTitle": "Unsaved Changes", "openUnsavedMessage": "The current document has unsaved changes. Opening another document will discard them.",
			"exitUnsavedMessage": "The document has unsaved changes. Exit and discard them?", "continueEditing": "Continue Editing",
			"discardAndOpen": "Discard and Open", "discardAndExit": "Discard and Exit", "openMarkdown": "Open Markdown Document", "reauthorizeDocument": "Choose this document to restore access",
			"markdownDocument": "Markdown Document", "textFile": "Text File", "allFiles": "All Files", "openFolder": "Open Document Folder",
			"saveAsMarkdown": "Save Markdown Document As", "newDocument": "New document.md", "newMarkdown": "New Markdown Document",
			"selectImage": "Choose an image to insert", "imageFile": "Image files", "exportWord": "Export Word Document", "wordDocument": "Word Document", "exportHTML": "Export HTML Page", "htmlDocument": "HTML Page",
			"exportDocument": "Export Document", "exportPDF": "Export PDF", "selectPandoc": "Select Pandoc Executable", "pandocExecutable": "Pandoc Executable", "exportImage": "Export Long Image", "pngImage": "PNG Image", "jpegImage": "JPEG Image",
		},
	}
	if value := translations[a.language][key]; value != "" {
		return value
	}
	return key
}
