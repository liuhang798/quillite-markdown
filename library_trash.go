package main

import (
	"errors"
	"os"
	"path/filepath"
	"runtime"
	"slices"
	"strings"
	"unicode"

	wailsruntime "github.com/wailsapp/wails/v2/pkg/runtime"
)

var errTrashUnavailable = errors.New("LIBRARY_TRASH_UNAVAILABLE")

// A recent record is not deletion authority. Resolve list membership natively,
// show the actual absolute path in an OS dialog, and recheck before recycling.
func (a *App) TrashLibraryFile(mode, root, path string) (string, error) {
	return a.trashLibraryFile(mode, root, path, a.confirmTrashLibraryFile, moveDocumentToTrash)
}

func (a *App) confirmTrashLibraryFile(path string) (bool, error) {
	a.mu.RLock()
	ctx, lang := a.ctx, a.language
	a.mu.RUnlock()
	if ctx == nil {
		return false, errTrashUnavailable
	}
	title, question := "删除本地文件", "将以下文件移到系统回收站？旁边的图片和附件不会被删除。"
	if lang == "en" || strings.HasPrefix(lang, "en-") {
		title, question = "Delete local file", "Move this file to the system Trash? Separate images and attachments will not be deleted."
	}
	message := question + "\n\n" + path
	// Wails 2's GTK backend passes the message as a printf format string.
	if runtime.GOOS == "linux" {
		message = strings.ReplaceAll(message, "%", "%%")
	}
	yes, no := "Yes", "No"
	if runtime.GOOS == "darwin" && title == "删除本地文件" {
		yes, no = "移到废纸篓", "取消"
	}
	answer, err := wailsruntime.MessageDialog(ctx, wailsruntime.MessageDialogOptions{
		Type: wailsruntime.QuestionDialog, Title: title, Message: message,
		Buttons: []string{no, yes}, DefaultButton: no, CancelButton: no,
	})
	return answer == yes, err
}

func (a *App) trashListContains(mode, root, path string) bool {
	p, err := a.readPreferences()
	if err != nil {
		return false
	}
	switch mode {
	case "recent":
		return slices.Contains(p.RecentFiles, path)
	case "favorites":
		return slices.Contains(p.FavoriteFiles, path)
	case "explorer":
		if !localLibraryPath(root) || !sameFilesystemPath(root, p.ExplorerRoot) {
			return false
		}
		folder, err := a.ListFolder(p.ExplorerRoot)
		if err == nil && sameFilesystemPath(folder.Root, root) {
			for _, f := range folder.Files {
				if f.Path == path {
					return true
				}
			}
		}
	}
	return false
}

func (a *App) validTrashPath(path string) bool {
	if !localLibraryPath(path) || filepath.Clean(path) != path || strings.IndexFunc(path, func(r rune) bool {
		return unicode.IsControl(r) || unicode.Is(unicode.Cf, r)
	}) >= 0 {
		return false
	}
	ext := strings.ToLower(filepath.Ext(path))
	if !markdownExtensions[ext] && ext != ".textpack" {
		return false
	}
	if runtime.GOOS == "windows" && (strings.Contains(path[len(filepath.VolumeName(path)):], ":") || strings.ContainsAny(path, "*?")) {
		return false
	}
	if a.isReferenceDocumentPath(path) {
		return false
	}
	if inside, err := bundlePathInside(filepath.Dir(a.preferencePath()), path); inside || err != nil {
		return false
	}
	for dir := filepath.Dir(path); dir != filepath.Dir(dir); dir = filepath.Dir(dir) {
		if strings.EqualFold(filepath.Ext(dir), ".textbundle") {
			return false
		}
	}
	return textPackNoLinks(path) == nil
}

func (a *App) trashLibraryFile(mode, root, path string, confirm func(string) (bool, error), move func(string) error) (string, error) {
	if !a.libraryTrashMu.TryLock() {
		return "", errTrashUnavailable
	}
	defer a.libraryTrashMu.Unlock()
	if !localLibraryPath(path) || !a.trashListContains(mode, root, path) {
		return "", errTrashUnavailable
	}
	status := "cancelled"
	act := func(actual string) error {
		if !sameFilesystemPath(path, actual) || !a.validTrashPath(actual) {
			return errTrashUnavailable
		}
		original, err := os.Lstat(actual)
		if err != nil || !original.Mode().IsRegular() {
			return errTrashUnavailable
		}
		// Retain the identity across the dialog even if the path is replaced.
		fd, err := os.Open(actual)
		if err != nil {
			return errTrashUnavailable
		}
		defer func() {
			if fd != nil {
				_ = fd.Close()
			}
		}()
		original, err = fd.Stat()
		if err != nil || !original.Mode().IsRegular() {
			return errTrashUnavailable
		}
		ok, err := confirm(actual)
		if err != nil || !ok {
			return err
		}
		documentSaveMu.Lock()
		defer documentSaveMu.Unlock()
		if !a.trashListContains(mode, root, path) || !a.validTrashPath(actual) {
			return errTrashUnavailable
		}
		current, err := os.Lstat(actual)
		if err != nil || !current.Mode().IsRegular() || !os.SameFile(current, original) ||
			current.Size() != original.Size() || !current.ModTime().Equal(original.ModTime()) {
			return errTrashUnavailable
		}
		// On Windows our read handle prevents the shell from moving the file.
		if err := fd.Close(); err != nil {
			return errTrashUnavailable
		}
		fd = nil
		if err := move(actual); err != nil {
			return errTrashUnavailable
		}
		status = "trashed"
		return nil
	}
	_, scoped, err := a.withMacSecurityScopedPath(path, act)
	if !scoped {
		err = act(path)
	}
	if err != nil || status != "trashed" {
		return status, err
	}
	a.draftsMu.Lock()
	delete(a.draftFiles, draftPathKey(path))
	a.draftsMu.Unlock()
	_, err = a.updatePreferences(func(p *Preferences) {
		match := func(s string) bool { return sameFilesystemPath(s, path) }
		p.RecentFiles = slices.DeleteFunc(p.RecentFiles, match)
		p.PinnedRecentFiles = slices.DeleteFunc(p.PinnedRecentFiles, match)
		p.FavoriteFiles = slices.DeleteFunc(p.FavoriteFiles, match)
		p.DraftFiles = slices.DeleteFunc(p.DraftFiles, match)
		if match(p.LastFile) {
			p.LastFile = ""
			if len(p.RecentFiles) > 0 {
				p.LastFile = p.RecentFiles[0]
			}
		}
	})
	if err != nil {
		// Never retry a completed disk operation.
		return "trashed-list-stale", nil
	}
	return status, nil
}
