package main

// Phase-one interchange import/export remains separate from original-package
// editing in bundle_document*.go. Import never writes back to its source.
import (
	"archive/zip"
	"bytes"
	"crypto/rand"
	"crypto/sha256"
	"encoding/base64"
	"encoding/hex"
	"encoding/json"
	"encoding/xml"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"os"
	"path"
	"path/filepath"
	"sort"
	"strings"
	"unicode"
	"unicode/utf8"

	wailsruntime "github.com/wailsapp/wails/v2/pkg/runtime"
)

const (
	textPackMaxBytes   = 256 * 1024 * 1024
	textPackMaxEntries = 1024
	textPackMaxInfo    = 1024 * 1024
)

type TextPackWarning struct {
	Code      string `json:"code"`
	Reference string `json:"reference"`
}
type TextPackImage struct {
	Source string `json:"source"`
	Target string `json:"target"`
}
type TextBundleSource struct {
	SourcePath string            `json:"sourcePath"`
	Content    string            `json:"content"`
	Revision   string            `json:"revision"`
	Assets     []string          `json:"assets"`
	Warnings   []TextPackWarning `json:"warnings"`
}
type TextBundleImportResult struct {
	Document  *Document         `json:"document"`
	Directory string            `json:"directory"`
	Warnings  []TextPackWarning `json:"warnings"`
}
type TextPackExportResult struct {
	Path       string            `json:"path"`
	Warnings   []TextPackWarning `json:"warnings"`
	AssetCount int               `json:"assetCount"`
}
type textBundleSnapshot struct {
	Content  string
	Revision string
	Assets   map[string][]byte
	Warnings []TextPackWarning
}

func textPackError(code string) error { return errors.New(code) }

func textPackWarning(code, reference string) TextPackWarning {
	if strings.HasPrefix(strings.ToLower(reference), "data:") {
		reference = "[embedded image]"
	}
	runes := []rune(reference)
	if len(runes) > 180 {
		reference = string(runes[:180]) + "…"
	}
	return TextPackWarning{Code: code, Reference: reference}
}

// ZIP names use portable slash-separated paths. Reject Windows aliases on all
// platforms so a package validated on macOS cannot become unsafe on Windows.
func validateTextPackPath(name string, directory bool) error {
	if directory {
		name = strings.TrimSuffix(name, "/")
	}
	if name == "" || len(name) > 1024 || !utf8.ValidString(name) || strings.HasPrefix(name, "/") || strings.ContainsAny(name, "\\:*?\"<>|\x00") {
		return textPackError("TEXTPACK_UNSAFE_PATH")
	}
	parts := strings.Split(name, "/")
	if len(parts) > 32 {
		return textPackError("TEXTPACK_LIMIT")
	}
	for _, part := range parts {
		if part == "" || part == "." || part == ".." || strings.TrimSpace(part) != part || strings.HasSuffix(part, ".") || len(part) > 240 {
			return textPackError("TEXTPACK_UNSAFE_PATH")
		}
		for _, r := range part {
			if unicode.IsControl(r) {
				return textPackError("TEXTPACK_UNSAFE_PATH")
			}
		}
		base := strings.ToUpper(strings.Split(part, ".")[0])
		runes := []rune(base)
		if base == "CON" || base == "PRN" || base == "AUX" || base == "NUL" || base == "CONIN$" || base == "CONOUT$" || (len(runes) == 4 && (strings.HasPrefix(base, "COM") || strings.HasPrefix(base, "LPT")) && strings.ContainsRune("123456789¹²³", runes[3])) {
			return textPackError("TEXTPACK_UNSAFE_PATH")
		}
	}
	return nil
}

// Track implicit parent directories too: assets/A/x and assets/a/y collide on
// case-insensitive systems even though neither complete file name is repeated.
type textPackPathTree struct {
	paths    map[string]string
	files    map[string]bool
	explicit map[string]bool
}

func (t *textPackPathTree) add(name string, directory bool) error {
	if err := validateTextPackPath(name, directory); err != nil {
		return err
	}
	name = strings.TrimSuffix(name, "/")
	if t.paths == nil {
		t.paths = map[string]string{}
		t.files = map[string]bool{}
		t.explicit = map[string]bool{}
	}
	parts := strings.Split(name, "/")
	for i := range parts {
		part := strings.Join(parts[:i+1], "/")
		key := strings.ToLower(part)
		final := i == len(parts)-1
		if original, ok := t.paths[key]; ok && original != part {
			return textPackError("TEXTPACK_INVALID: case-colliding entries")
		}
		if t.files[key] || (final && !directory && t.paths[key] != "") || (final && t.explicit[key]) {
			return textPackError("TEXTPACK_INVALID: duplicate or conflicting entries")
		}
		t.paths[key] = part
		if final {
			t.explicit[key] = true
			if !directory {
				t.files[key] = true
			}
		}
	}
	return nil
}

func textPackReadBounded(r io.Reader, maximum int64) ([]byte, error) {
	data, err := io.ReadAll(io.LimitReader(r, maximum+1))
	if err != nil {
		return nil, err
	}
	if int64(len(data)) > maximum {
		return nil, textPackError("TEXTPACK_LIMIT")
	}
	return data, nil
}

func textPackNoLinks(name string) error {
	abs, err := filepath.Abs(name)
	if err != nil {
		return err
	}
	// Reject remote/device paths before even calling Lstat: Windows could
	// otherwise contact a server while merely validating an image reference.
	if strings.HasPrefix(strings.ReplaceAll(abs, "\\", "/"), "//") {
		return textPackError("TEXTPACK_UNSAFE_PATH")
	}
	for current := abs; ; current = filepath.Dir(current) {
		info, err := os.Lstat(current)
		if err != nil {
			return err
		}
		if info.Mode()&os.ModeSymlink != 0 {
			return textPackError("TEXTPACK_UNSAFE_PATH")
		}
		if err := textPackCheckReparse(current); err != nil {
			return err
		}
		if parent := filepath.Dir(current); parent == current {
			break
		}
	}
	return nil
}

func textPackOpenRoot(name string) (*os.Root, error) {
	if err := textPackNoLinks(name); err != nil {
		return nil, err
	}
	before, err := os.Lstat(name)
	if err != nil || !before.IsDir() {
		return nil, textPackError("TEXTPACK_UNSAFE_PATH")
	}
	root, err := os.OpenRoot(name)
	if err != nil {
		return nil, err
	}
	after, err := root.Stat(".")
	if err != nil || !os.SameFile(before, after) {
		root.Close()
		return nil, textPackError("TEXTPACK_CHANGED")
	}
	return root, nil
}

func textPackReadRootFile(root *os.Root, name string, limit int64) ([]byte, error) {
	before, err := root.Lstat(name)
	if err != nil {
		return nil, err
	}
	if !before.Mode().IsRegular() {
		return nil, textPackError("TEXTPACK_UNSAFE_PATH: non-regular entry")
	}
	if before.Size() > limit {
		return nil, textPackError("TEXTPACK_LIMIT")
	}
	f, err := root.Open(name)
	if err != nil {
		return nil, err
	}
	defer f.Close()
	opened, err := f.Stat()
	if err != nil || !opened.Mode().IsRegular() || !os.SameFile(before, opened) {
		return nil, textPackError("TEXTPACK_CHANGED")
	}
	data, err := textPackReadBounded(f, limit)
	if err != nil {
		return nil, err
	}
	after, err := f.Stat()
	if err != nil || int64(len(data)) != opened.Size() || after.Size() != opened.Size() || !after.ModTime().Equal(opened.ModTime()) {
		return nil, textPackError("TEXTPACK_CHANGED")
	}
	return data, nil
}

func textPackFileLimit(name string) int64 {
	if path.Base(name) == "info.json" {
		return textPackMaxInfo
	}
	if strings.HasPrefix(path.Base(name), "text.") {
		return maxSupportedDocumentBytes
	}
	return maxImportedImageSize
}

func readTextPackArchive(source string) (map[string][]byte, error) {
	root, err := textPackOpenRoot(filepath.Dir(source))
	if err != nil {
		return nil, err
	}
	defer root.Close()
	if err := textPackNoLinks(source); err != nil {
		return nil, err
	}
	before, err := root.Lstat(filepath.Base(source))
	if err != nil {
		return nil, err
	}
	if !before.Mode().IsRegular() || before.Size() > textPackMaxBytes {
		return nil, textPackError("TEXTPACK_LIMIT")
	}
	f, err := root.Open(filepath.Base(source))
	if err != nil {
		return nil, err
	}
	defer f.Close()
	opened, err := f.Stat()
	if err != nil || !os.SameFile(before, opened) {
		return nil, textPackError("TEXTPACK_CHANGED")
	}
	z, err := zip.NewReader(f, opened.Size())
	if err != nil {
		return nil, textPackError("TEXTPACK_INVALID: invalid ZIP")
	}
	if len(z.File) == 0 || len(z.File) > textPackMaxEntries {
		return nil, textPackError("TEXTPACK_LIMIT")
	}
	files := map[string][]byte{}
	var tree textPackPathTree
	var total uint64
	for _, entry := range z.File {
		directory := strings.HasSuffix(entry.Name, "/")
		if err := tree.add(entry.Name, directory); err != nil {
			return nil, err
		}
		if entry.Mode()&os.ModeSymlink != 0 || (directory && !entry.Mode().IsDir()) || (!directory && !entry.Mode().IsRegular()) || entry.Flags&1 != 0 {
			return nil, textPackError("TEXTPACK_UNSAFE_PATH")
		}
		if directory {
			if entry.UncompressedSize64 != 0 {
				return nil, textPackError("TEXTPACK_INVALID")
			}
			continue
		}
		limit := uint64(textPackFileLimit(entry.Name))
		if entry.UncompressedSize64 > limit || entry.CompressedSize64 > textPackMaxBytes || entry.UncompressedSize64 > textPackMaxBytes-total {
			return nil, textPackError("TEXTPACK_LIMIT")
		}
		total += entry.UncompressedSize64
		r, err := entry.Open()
		if err != nil {
			return nil, textPackError("TEXTPACK_INVALID")
		}
		data, readErr := textPackReadBounded(r, int64(limit))
		closeErr := r.Close()
		if readErr != nil || closeErr != nil || uint64(len(data)) != entry.UncompressedSize64 {
			return nil, textPackError("TEXTPACK_INVALID: corrupt or oversized ZIP entry")
		}
		files[entry.Name] = data
	}
	after, err := f.Stat()
	if err != nil || after.Size() != opened.Size() || !after.ModTime().Equal(opened.ModTime()) {
		return nil, textPackError("TEXTPACK_CHANGED")
	}
	return files, nil
}

func readTextBundleDirectory(source string) (map[string][]byte, error) {
	root, err := textPackOpenRoot(source)
	if err != nil {
		return nil, err
	}
	defer root.Close()
	files := map[string][]byte{}
	var tree textPackPathTree
	count := 0
	total := 0
	var visit func(string, int) error
	visit = func(directory string, depth int) error {
		if depth > 32 {
			return textPackError("TEXTPACK_LIMIT")
		}
		f, err := root.Open(directory)
		if err != nil {
			return err
		}
		defer f.Close()
		for {
			entries, readErr := f.ReadDir(64)
			for _, entry := range entries {
				count++
				if count > textPackMaxEntries {
					return textPackError("TEXTPACK_LIMIT")
				}
				name := entry.Name()
				if directory != "." {
					name = directory + "/" + name
				}
				info, err := root.Lstat(name)
				if err != nil {
					return err
				}
				if info.Mode()&os.ModeSymlink != 0 || (!info.IsDir() && !info.Mode().IsRegular()) {
					return textPackError("TEXTPACK_UNSAFE_PATH")
				}
				if err := textPackCheckReparse(filepath.Join(source, filepath.FromSlash(name))); err != nil {
					return err
				}
				if err := tree.add(name, info.IsDir()); err != nil {
					return err
				}
				if info.IsDir() {
					if err := visit(name, depth+1); err != nil {
						return err
					}
					continue
				}
				if info.Size() > int64(textPackMaxBytes-total) {
					return textPackError("TEXTPACK_LIMIT")
				}
				data, err := textPackReadRootFile(root, name, textPackFileLimit(name))
				if err != nil {
					return err
				}
				total += len(data)
				files[name] = data
			}
			if readErr == io.EOF {
				break
			}
			if readErr != nil {
				return readErr
			}
		}
		return nil
	}
	if err := visit(".", 0); err != nil {
		return nil, err
	}
	return files, nil
}

// Reject duplicate metadata keys rather than accepting JSON's last-key-wins
// ambiguity. Unknown application-specific dictionaries are otherwise retained
// only in the source and never interpreted or executed.
func validateTextPackJSON(data []byte) error {
	decoder := json.NewDecoder(bytes.NewReader(data))
	var value func(int) error
	value = func(depth int) error {
		if depth > 32 {
			return textPackError("TEXTPACK_INVALID")
		}
		token, err := decoder.Token()
		if err != nil {
			return err
		}
		delim, isDelim := token.(json.Delim)
		if !isDelim {
			return nil
		}
		if delim == '{' {
			keys := map[string]bool{}
			for decoder.More() {
				key, err := decoder.Token()
				if err != nil {
					return err
				}
				s, ok := key.(string)
				if !ok || keys[s] {
					return textPackError("TEXTPACK_INVALID")
				}
				keys[s] = true
				if err := value(depth + 1); err != nil {
					return err
				}
			}
		} else if delim == '[' {
			for decoder.More() {
				if err := value(depth + 1); err != nil {
					return err
				}
			}
		} else {
			return textPackError("TEXTPACK_INVALID")
		}
		_, err = decoder.Token()
		return err
	}
	if err := value(0); err != nil {
		return err
	}
	if _, err := decoder.Token(); err != io.EOF {
		return textPackError("TEXTPACK_INVALID")
	}
	return nil
}

func textPackImageType(data []byte) (string, error) {
	switch kind := http.DetectContentType(data); kind {
	case "image/png", "image/jpeg", "image/gif", "image/webp", "image/bmp", "image/x-icon":
		return kind, nil
	}
	// Recognise SVG by its XML root, not its extension; never execute it or
	// resolve entities. Its dependency completeness is deliberately uncertified.
	if len(data) <= int(maxImportedImageSize) && utf8.Valid(data) {
		d := xml.NewDecoder(bytes.NewReader(data))
		for {
			token, err := d.Token()
			if err != nil {
				break
			}
			switch v := token.(type) {
			case xml.StartElement:
				if v.Name.Local == "svg" {
					return "image/svg+xml", nil
				}
				return "", textPackError("UNSUPPORTED_IMAGE")
			case xml.Directive:
				return "", textPackError("UNSUPPORTED_IMAGE")
			}
		}
	}
	return "", textPackError("UNSUPPORTED_IMAGE")
}

func parseTextBundleFiles(files map[string][]byte) (*textBundleSnapshot, error) {
	prefix := ""
	if _, ok := files["info.json"]; !ok {
		for name := range files {
			if strings.HasSuffix(name, ".textbundle/info.json") && strings.Count(name, "/") == 1 {
				if prefix != "" {
					return nil, textPackError("TEXTPACK_INVALID")
				}
				prefix = strings.TrimSuffix(name, "info.json")
			}
		}
		if prefix == "" {
			return nil, textPackError("TEXTPACK_INVALID: info.json missing")
		}
	}
	info := files[prefix+"info.json"]
	if !utf8.Valid(info) || len(info) > textPackMaxInfo || validateTextPackJSON(info) != nil {
		return nil, textPackError("TEXTPACK_INVALID: invalid metadata")
	}
	var metadata struct {
		Version int    `json:"version"`
		Type    string `json:"type"`
	}
	if err := json.Unmarshal(info, &metadata); err != nil || (metadata.Version != 1 && metadata.Version != 2) || (metadata.Type != "" && metadata.Type != "net.daringfireball.markdown") {
		return nil, textPackError("TEXTPACK_INVALID: unsupported bundle type or version")
	}
	result := &textBundleSnapshot{Assets: map[string][]byte{}, Warnings: []TextPackWarning{}}
	textName := ""
	names := make([]string, 0, len(files))
	for name := range files {
		names = append(names, name)
	}
	sort.Strings(names)
	hash := sha256.New()
	for _, original := range names {
		data := files[original]
		fmt.Fprintf(hash, "%d:%s:%d:", len(original), original, len(data))
		hash.Write(data)
		if !strings.HasPrefix(original, prefix) {
			if strings.HasPrefix(original, "__MACOSX/") || original == ".DS_Store" {
				continue
			}
			return nil, textPackError("TEXTPACK_INVALID: multiple bundle roots")
		}
		name := strings.TrimPrefix(original, prefix)
		if !strings.Contains(name, "/") && strings.HasPrefix(name, "text.") {
			if textName != "" || len(data) > maxSupportedDocumentBytes || !utf8.Valid(data) || bytes.IndexByte(data, 0) >= 0 {
				return nil, textPackError("TEXTPACK_INVALID: ambiguous or invalid text")
			}
			textName = name
			result.Content = string(bytes.TrimPrefix(data, []byte{0xef, 0xbb, 0xbf}))
			continue
		}
		if strings.HasPrefix(name, "assets/") {
			kind, err := textPackImageType(data)
			if err != nil {
				result.Warnings = append(result.Warnings, textPackWarning("UNSUPPORTED_IMAGE", name))
				continue
			}
			result.Assets[name] = data
			if kind == "image/svg+xml" {
				result.Warnings = append(result.Warnings, textPackWarning("EXTERNAL_RESOURCES", name))
			}
		} else if name != "info.json" && name != ".DS_Store" && !strings.HasPrefix(name, "__MACOSX/") {
			result.Warnings = append(result.Warnings, textPackWarning("UNSUPPORTED_RESOURCE", name))
		}
	}
	if textName == "" {
		return nil, textPackError("TEXTPACK_INVALID: text missing")
	}
	result.Revision = hex.EncodeToString(hash.Sum(nil))
	return result, nil
}

func readTextBundleSnapshot(source string) (*textBundleSnapshot, error) {
	source, err := filepath.Abs(filepath.Clean(source))
	if err != nil {
		return nil, err
	}
	var files map[string][]byte
	switch strings.ToLower(filepath.Ext(source)) {
	case ".textpack":
		files, err = readTextPackArchive(source)
	case ".textbundle":
		files, err = readTextBundleDirectory(source)
	default:
		return nil, textPackError("TEXTPACK_INVALID: choose a TextPack or TextBundle")
	}
	if err != nil {
		return nil, err
	}
	return parseTextBundleFiles(files)
}

func (a *App) textPackLabel(zh, en string) string {
	if a.language == "en" {
		return en
	}
	return zh
}
func (a *App) textPackSnapshot(source string) (*textBundleSnapshot, string, error) {
	var snapshot *textBundleSnapshot
	read := func(accessible string) (err error) { snapshot, err = readTextBundleSnapshot(accessible); return err }
	resolved, found, err := a.withMacSecurityScopedPath(source, read)
	if !found {
		resolved = source
		err = read(source)
	}
	return snapshot, resolved, err
}

func (a *App) ChooseTextBundleSource(kind string) (*TextBundleSource, error) {
	var source string
	var err error
	switch kind {
	case "textpack":
		source, err = wailsruntime.OpenFileDialog(a.ctx, wailsruntime.OpenDialogOptions{Title: a.textPackLabel("导入 TextPack", "Import TextPack"), Filters: []wailsruntime.FileFilter{{DisplayName: "TextPack", Pattern: "*.textpack"}}})
	case "textbundle":
		source, err = wailsruntime.OpenDirectoryDialog(a.ctx, wailsruntime.OpenDialogOptions{Title: a.textPackLabel("选择 .textbundle 目录", "Choose a .textbundle directory"), TreatPackagesAsDirectories: true})
	default:
		return nil, textPackError("TEXTPACK_INVALID")
	}
	if err != nil || source == "" {
		return nil, err
	}
	_ = a.rememberMacSecurityScopedPath(source, kind == "textbundle")
	snapshot, resolved, err := a.textPackSnapshot(source)
	if err != nil {
		return nil, err
	}
	assets := make([]string, 0, len(snapshot.Assets))
	for name := range snapshot.Assets {
		assets = append(assets, name)
	}
	sort.Strings(assets)
	return &TextBundleSource{SourcePath: resolved, Content: snapshot.Content, Revision: snapshot.Revision, Assets: assets, Warnings: snapshot.Warnings}, nil
}

func textPackWriteNew(root *os.Root, name string, data []byte) error {
	f, err := root.OpenFile(filepath.FromSlash(name), os.O_WRONLY|os.O_CREATE|os.O_EXCL, 0o600)
	if os.IsExist(err) {
		return textPackError("TEXTPACK_EXISTS")
	}
	if err != nil {
		return err
	}
	_, err = f.Write(data)
	if err == nil {
		err = f.Sync()
	}
	if closeErr := f.Close(); err == nil {
		err = closeErr
	}
	return err
}

func textPackImportName(source string) string {
	name := strings.TrimSuffix(filepath.Base(source), filepath.Ext(source))
	name = strings.Map(func(r rune) rune {
		if unicode.IsControl(r) || strings.ContainsRune("\\/:*?\"<>|", r) {
			return '-'
		}
		return r
	}, name)
	name = strings.Trim(name, " .")
	runes := []rune(name)
	if len(runes) > 60 {
		name = string(runes[:60])
	}
	if name == "" || validateTextPackPath(name, false) != nil {
		return "Imported"
	}
	return name
}

func materializeTextBundle(parent, source, revision, content string, snapshot *textBundleSnapshot) (string, error) {
	if snapshot == nil || revision == "" || snapshot.Revision != revision {
		return "", textPackError("TEXTPACK_CHANGED")
	}
	if !utf8.ValidString(content) || len(content) > maxSupportedDocumentBytes || strings.IndexByte(content, 0) >= 0 {
		return "", textPackError("TEXTPACK_LIMIT")
	}
	parent, err := filepath.Abs(parent)
	if err != nil {
		return "", err
	}
	source, err = filepath.Abs(source)
	if err != nil {
		return "", err
	}
	if strings.EqualFold(filepath.Ext(source), ".textbundle") {
		relative, err := filepath.Rel(source, parent)
		if err != nil || relative == "." || (relative != ".." && !strings.HasPrefix(relative, ".."+string(filepath.Separator))) {
			return "", textPackError("TEXTPACK_UNSAFE_PATH: destination is inside source bundle")
		}
	}
	root, err := textPackOpenRoot(parent)
	if err != nil {
		return "", err
	}
	defer root.Close()
	var random [12]byte
	if _, err = rand.Read(random[:]); err != nil {
		return "", err
	}
	baseName := textPackImportName(source)
	name := baseName + "-imported-" + hex.EncodeToString(random[:])
	if err = root.Mkdir(name, 0o700); err != nil {
		return "", err
	}
	directory := filepath.Join(parent, name)
	fail := func(cause error) (string, error) {
		return "", fmt.Errorf("TEXTPACK_IMPORT_FAILED: incomplete copy retained at %s: %w", directory, cause)
	}
	before, err := root.Lstat(name)
	if err != nil || !before.IsDir() || before.Mode()&os.ModeSymlink != 0 {
		return fail(textPackError("TEXTPACK_UNSAFE_PATH"))
	}
	output, err := root.OpenRoot(name)
	if err != nil {
		return fail(err)
	}
	defer output.Close()
	opened, err := output.Stat(".")
	if err != nil || !os.SameFile(before, opened) {
		return fail(textPackError("TEXTPACK_CHANGED"))
	}
	if err = output.Mkdir("assets", 0o700); err != nil {
		return fail(err)
	}
	names := make([]string, 0, len(snapshot.Assets))
	for name := range snapshot.Assets {
		names = append(names, name)
	}
	sort.Strings(names)
	for _, name := range names {
		if err = validateTextPackPath(name, false); err != nil || !strings.HasPrefix(name, "assets/") {
			return fail(textPackError("TEXTPACK_UNSAFE_PATH"))
		}
		if err = output.MkdirAll(filepath.FromSlash(path.Dir(name)), 0o700); err != nil {
			return fail(err)
		}
		if err = textPackWriteNew(output, name, snapshot.Assets[name]); err != nil {
			return fail(err)
		}
	}
	// Write the document last: partial failed imports cannot look complete.
	documentName := baseName + ".md"
	if err = textPackWriteNew(output, documentName, []byte(content)); err != nil {
		return fail(err)
	}
	return filepath.Join(directory, documentName), nil
}

func (a *App) ImportTextBundle(sourcePath, revision, content string) (*TextBundleImportResult, error) {
	parent, err := wailsruntime.OpenDirectoryDialog(a.ctx, wailsruntime.OpenDialogOptions{Title: a.textPackLabel("选择导入位置（创建新目录，不回写原包）", "Choose import location (new folder; original package unchanged)")})
	if err != nil || parent == "" {
		return nil, err
	}
	_ = a.rememberMacSecurityScopedPath(parent, true)
	// Re-read after the picker: source changes during user interaction must not
	// mix old text with a newer set of assets.
	snapshot, resolved, err := a.textPackSnapshot(sourcePath)
	if err != nil {
		return nil, err
	}
	if snapshot.Revision != revision {
		return nil, textPackError("TEXTPACK_CHANGED")
	}
	var documentPath string
	write := func(accessible string) (err error) {
		documentPath, err = materializeTextBundle(accessible, resolved, revision, content, snapshot)
		return err
	}
	_, found, err := a.withMacSecurityScopedPath(parent, write)
	if !found {
		err = write(parent)
	}
	if err != nil {
		return nil, err
	}
	_ = a.rememberMacSecurityScopedPath(documentPath, false)
	doc, err := a.savedDocumentReceipt(documentPath, content, true)
	if err != nil {
		return nil, err
	}
	return &TextBundleImportResult{Document: doc, Directory: filepath.Dir(documentPath), Warnings: snapshot.Warnings}, nil
}

func textPackLocalImagePath(reference, directory string) (string, error) {
	if strings.TrimSpace(reference) != reference || reference == "" {
		return "", textPackError("UNSAFE_REFERENCE")
	}
	value := reference
	parsed, err := url.Parse(reference)
	if err == nil && strings.EqualFold(parsed.Scheme, "file") {
		if parsed.Opaque != "" || parsed.User != nil || parsed.RawQuery != "" || parsed.Fragment != "" || (parsed.Host != "" && !strings.EqualFold(parsed.Host, "localhost")) {
			return "", textPackError("UNSAFE_REFERENCE")
		}
		// URL.Path has already been decoded once by url.Parse.
		value = parsed.Path
		if len(value) > 3 && value[0] == '/' && value[2] == ':' {
			value = value[1:]
		}
	} else {
		value, err = url.PathUnescape(reference)
		if err != nil {
			return "", textPackError("UNSAFE_REFERENCE")
		}
		decoded, parseErr := url.Parse(value)
		if parseErr == nil && decoded.Scheme != "" && !(len(decoded.Scheme) == 1 && len(value) > 2 && value[1] == ':') {
			return "", textPackError("UNSAFE_REFERENCE")
		}
	}
	normalized := strings.ReplaceAll(value, "\\", "/")
	if strings.HasPrefix(normalized, "//") || strings.ContainsAny(normalized, "\x00*?\"<>|") {
		return "", textPackError("UNSAFE_REFERENCE")
	}
	parts := strings.Split(strings.TrimPrefix(normalized, "/"), "/")
	for i, part := range parts {
		if part == "." || part == ".." || part == "" {
			continue
		}
		if i == 0 && len(part) == 2 && part[1] == ':' {
			continue
		}
		if err := validateTextPackPath(part, false); err != nil {
			return "", textPackError("UNSAFE_REFERENCE")
		}
	}
	if !filepath.IsAbs(value) {
		value = filepath.Join(directory, filepath.FromSlash(value))
	}
	return filepath.Abs(filepath.Clean(value))
}

func (a *App) readTextPackImage(reference, directory string) ([]byte, string, error) {
	if scopedPath, scoped, scopeErr := a.bundleWorkspaceImagePath(reference, directory); scoped && !strings.HasPrefix(strings.ToLower(reference), "data:") {
		if scopeErr != nil {
			return nil, "", scopeErr
		}
		data, err := readImageBytes(scopedPath)
		if err != nil {
			return nil, "", err
		}
		kind, err := textPackImageType(data)
		return data, kind, err
	}
	var data []byte
	if strings.HasPrefix(strings.ToLower(reference), "data:") {
		if len(reference) > int(maxImportedImageSize)*4/3+256 {
			return nil, "", textPackError("TEXTPACK_LIMIT")
		}
		meta, encoded, ok := strings.Cut(reference, ",")
		if !ok || !strings.HasPrefix(strings.ToLower(meta), "data:image/") || !strings.HasSuffix(strings.ToLower(meta), ";base64") {
			return nil, "", textPackError("UNSUPPORTED_IMAGE")
		}
		var err error
		data, err = base64.StdEncoding.DecodeString(encoded)
		if err != nil || int64(len(data)) > maxImportedImageSize {
			return nil, "", textPackError("UNSUPPORTED_IMAGE")
		}
		kind, err := textPackImageType(data)
		if err != nil || kind != strings.TrimSuffix(strings.TrimPrefix(strings.ToLower(meta), "data:"), ";base64") {
			return nil, "", textPackError("UNSUPPORTED_IMAGE")
		}
		return data, kind, nil
	}
	local, err := textPackLocalImagePath(reference, directory)
	if err != nil {
		return nil, "", err
	}
	read := func(accessible string) error {
		if err := textPackNoLinks(accessible); err != nil {
			return err
		}
		root, err := textPackOpenRoot(filepath.Dir(accessible))
		if err != nil {
			return err
		}
		defer root.Close()
		data, err = textPackReadRootFile(root, filepath.Base(accessible), maxImportedImageSize)
		return err
	}
	_, found, err := a.withMacSecurityScopedPath(local, read)
	if !found {
		err = read(local)
	}
	if err != nil {
		return nil, "", err
	}
	kind, err := textPackImageType(data)
	return data, kind, err
}

type textPackLimitedBuffer struct{ bytes.Buffer }

func (b *textPackLimitedBuffer) Write(data []byte) (int, error) {
	if len(data) > textPackMaxBytes-b.Len() {
		return 0, textPackError("TEXTPACK_LIMIT")
	}
	return b.Buffer.Write(data)
}

func (a *App) buildTextPack(sourcePath, content string, images []TextPackImage) ([]byte, *TextPackExportResult, error) {
	if len(content) > maxSupportedDocumentBytes || !utf8.ValidString(content) || strings.IndexByte(content, 0) >= 0 || len(images) > textPackMaxEntries-2 {
		return nil, nil, textPackError("TEXTPACK_LIMIT")
	}
	result := &TextPackExportResult{Warnings: []TextPackWarning{}}
	var output textPackLimitedBuffer
	writer := zip.NewWriter(&output)
	writeEntry := func(name string, data []byte, method uint16) error {
		header := &zip.FileHeader{Name: name, Method: method}
		header.SetMode(0o600)
		entry, err := writer.CreateHeader(header)
		if err != nil {
			return err
		}
		_, err = entry.Write(data)
		return err
	}
	if err := writeEntry("text.md", []byte(content), zip.Deflate); err != nil {
		return nil, nil, err
	}
	var tree textPackPathTree
	total := len(content)
	for _, image := range images {
		if !strings.HasPrefix(image.Target, "assets/") {
			return nil, nil, textPackError("TEXTPACK_UNSAFE_PATH")
		}
		if err := tree.add(image.Target, false); err != nil {
			return nil, nil, err
		}
		data, kind, err := a.readTextPackImage(image.Source, filepath.Dir(sourcePath))
		if err != nil {
			code := "MISSING_IMAGE"
			if strings.Contains(err.Error(), "UNSUPPORTED_IMAGE") {
				code = "UNSUPPORTED_IMAGE"
			} else if strings.Contains(err.Error(), "UNSAFE") {
				code = "UNSAFE_REFERENCE"
			} else if strings.Contains(err.Error(), "LIMIT") {
				return nil, nil, err
			}
			result.Warnings = append(result.Warnings, textPackWarning(code, image.Source))
			continue
		}
		if len(data) > textPackMaxBytes-total {
			return nil, nil, textPackError("TEXTPACK_LIMIT")
		}
		total += len(data)
		// Copy each image to the bounded archive before reading the next; do not
		// retain another complete in-memory map of all attachment bytes.
		if err := writeEntry(image.Target, data, zip.Store); err != nil {
			return nil, nil, err
		}
		result.AssetCount++
		if kind == "image/svg+xml" {
			result.Warnings = append(result.Warnings, textPackWarning("EXTERNAL_RESOURCES", image.Target))
		}
	}
	info, err := json.Marshal(map[string]any{"version": 2, "type": "net.daringfireball.markdown", "creatorIdentifier": "cn.ssssa.quillite-markdown", "cn.ssssa.quillite-markdown": map[string]any{"version": 1, "offlineComplete": false, "assetCount": result.AssetCount, "warningCount": len(result.Warnings)}})
	if err != nil {
		return nil, nil, err
	}
	if err = writeEntry("info.json", info, zip.Deflate); err != nil {
		return nil, nil, err
	}
	if err = writer.Close(); err != nil {
		return nil, nil, err
	}
	return output.Bytes(), result, nil
}

func writeTextPackCopy(source, target string, data []byte) error {
	if len(data) > textPackMaxBytes {
		return textPackError("TEXTPACK_LIMIT")
	}
	source, err := filepath.Abs(source)
	if err != nil {
		return err
	}
	target, err = filepath.Abs(target)
	if err != nil {
		return err
	}
	if sameFilesystemPath(source, target) {
		return textPackError("TEXTPACK_EXISTS")
	}
	if strings.EqualFold(filepath.Ext(source), ".textbundle") {
		inside, err := bundlePathInside(source, target)
		if err != nil {
			return err
		}
		if inside {
			return textPackError("BUNDLE_COPY_INSIDE_SOURCE")
		}
	}
	if !strings.EqualFold(filepath.Ext(target), ".textpack") {
		return textPackError("TEXTPACK_INVALID: output must end in .textpack")
	}
	if err = validateTextPackPath(filepath.Base(target), false); err != nil {
		return err
	}
	root, err := textPackOpenRoot(filepath.Dir(target))
	if err != nil {
		return err
	}
	defer root.Close()
	// Create-only publication; a failed write retains the new partial file. No
	// pre-existing document, package, attachment, or directory is ever removed.
	return textPackWriteNew(root, filepath.Base(target), data)
}

func (a *App) ExportTextPack(sourcePath, content string, images []TextPackImage) (*TextPackExportResult, error) {
	origin := a.bundleResourceOrigin(sourcePath)
	options := a.documentSaveDialogOptions(origin)
	options.Title = a.textPackLabel("打包文档（含图片）", "Package document with images")
	options.DefaultFilename = strings.TrimSuffix(filepath.Base(origin), filepath.Ext(origin)) + ".textpack"
	options.Filters = []wailsruntime.FileFilter{{DisplayName: "TextPack", Pattern: "*.textpack"}}
	target, err := wailsruntime.SaveFileDialog(a.ctx, options)
	if err != nil || target == "" {
		return nil, err
	}
	_ = a.rememberMacSecurityScopedPath(target, false)
	return a.exportTextPackTo(sourcePath, target, content, images)
}

func (a *App) exportTextPackTo(sourcePath, target, content string, images []TextPackImage) (*TextPackExportResult, error) {
	if err := a.validateDocumentCopyTarget(sourcePath, target); err != nil {
		return nil, err
	}
	origin := a.bundleResourceOrigin(sourcePath)
	data, result, err := a.buildTextPack(sourcePath, content, images)
	if err != nil {
		return nil, err
	}
	write := func(accessible string) error {
		if err := a.validateDocumentCopyTarget(sourcePath, accessible); err != nil {
			return err
		}
		return writeTextPackCopy(origin, accessible, data)
	}
	_, found, err := a.withMacSecurityScopedPath(target, write)
	if !found {
		err = write(target)
	}
	if err != nil {
		return nil, err
	}
	a.rememberSaveDirectory(filepath.Dir(target))
	result.Path = target
	return result, nil
}
