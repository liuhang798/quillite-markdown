package main

// Original-package editing is deliberately separate from the phase-one
// interchange importer. A save keeps every original entry, including resources
// and third-party application metadata this program does not understand.
import (
	"archive/zip"
	"bytes"
	"crypto/sha256"
	"encoding/hex"
	"fmt"
	"io"
	"os"
	"path"
	"path/filepath"
	"sort"
	"strings"
	"unicode/utf8"
)

type editableBundleSnapshot struct {
	SourcePath       string
	Kind             string
	Content          string
	TextEntry        string
	Prefix           string
	Revision         string
	Files            map[string][]byte
	Warnings         []TextPackWarning
	archive          *zip.Reader
	archiveRaw       []byte
	directoryHeaders map[string]zip.FileHeader
}

// readEditableBundle performs the same portable path, type and bounded-content
// checks as import, but does not discard unknown resources. Revision covers
// the entire archive (including ZIP metadata) or every directory file.
func readEditableBundle(source string) (*editableBundleSnapshot, error) {
	source, err := filepath.Abs(filepath.Clean(source))
	if err != nil {
		return nil, err
	}
	result := &editableBundleSnapshot{SourcePath: source}
	switch strings.ToLower(filepath.Ext(source)) {
	case ".textpack":
		root, err := textPackOpenRoot(filepath.Dir(source))
		if err != nil {
			return nil, err
		}
		defer root.Close()
		if err := textPackNoLinks(source); err != nil {
			return nil, err
		}
		data, err := textPackReadRootFile(root, filepath.Base(source), textPackMaxBytes)
		if err != nil {
			return nil, err
		}
		return editableTextPackSnapshot(source, data)
	case ".textbundle":
		result.Kind = "textbundle"
		result.Files, err = readTextBundleDirectory(source)
		if err != nil {
			return nil, err
		}
		result.directoryHeaders, err = editableDirectoryHeaders(source)
		if err != nil {
			return nil, err
		}
		for name := range result.directoryHeaders {
			if !strings.HasSuffix(name, "/") {
				if _, exists := result.Files[name]; !exists {
					return nil, textPackError("TEXTPACK_CHANGED")
				}
			}
		}
		for name := range result.Files {
			if _, exists := result.directoryHeaders[name]; !exists {
				return nil, textPackError("TEXTPACK_CHANGED")
			}
		}
	default:
		return nil, textPackError("TEXTPACK_INVALID: not an editable TextPack or TextBundle")
	}
	return finishEditableBundleSnapshot(result)
}

// A receipt/baseline is constructed from this operation's committed bytes,
// never by rereading a public path that another writer may already have changed.
func editableTextPackSnapshot(source string, data []byte) (*editableBundleSnapshot, error) {
	if len(data) == 0 || len(data) > textPackMaxBytes {
		return nil, textPackError("TEXTPACK_LIMIT")
	}
	source, err := filepath.Abs(filepath.Clean(source))
	if err != nil {
		return nil, err
	}
	reader, err := zip.NewReader(bytes.NewReader(data), int64(len(data)))
	if err != nil {
		return nil, textPackError("TEXTPACK_INVALID: invalid ZIP")
	}
	files, err := editableArchiveFiles(reader)
	if err != nil {
		return nil, err
	}
	return finishEditableBundleSnapshot(&editableBundleSnapshot{
		SourcePath: source, Kind: "textpack", Revision: documentRevision(data),
		Files: files, archive: reader, archiveRaw: data,
	})
}

func finishEditableBundleSnapshot(result *editableBundleSnapshot) (*editableBundleSnapshot, error) {
	parsed, err := parseTextBundleFiles(result.Files)
	if err != nil {
		return nil, err
	}
	result.Content, result.Warnings = parsed.Content, parsed.Warnings
	if result.Revision == "" {
		result.Revision = parsed.Revision
	}
	prefix := ""
	if _, exists := result.Files["info.json"]; !exists {
		for name := range result.Files {
			if strings.Count(name, "/") == 1 && strings.HasSuffix(name, ".textbundle/info.json") {
				prefix = strings.TrimSuffix(name, "info.json")
				break // parseTextBundleFiles already rejected ambiguous roots.
			}
		}
	}
	for candidate := range result.Files {
		if strings.HasPrefix(candidate, prefix+"text.") && !strings.Contains(strings.TrimPrefix(candidate, prefix), "/") {
			result.TextEntry = candidate
			result.Prefix = prefix
			return result, nil
		}
	}
	return nil, textPackError("TEXTPACK_INVALID: text missing")
}

func editableDirectoryHeaders(source string) (map[string]zip.FileHeader, error) {
	root, err := textPackOpenRoot(source)
	if err != nil {
		return nil, err
	}
	defer root.Close()
	headers := make(map[string]zip.FileHeader)
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
				if len(headers) >= textPackMaxEntries {
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
				if err := validateTextPackPath(name, false); err != nil {
					return err
				}
				header, err := zip.FileInfoHeader(info)
				if err != nil {
					return err
				}
				header.Name = name
				if info.IsDir() {
					header.Name += "/"
				}
				headers[header.Name] = *header
				if info.IsDir() {
					if err := visit(name, depth+1); err != nil {
						return err
					}
				}
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
	return headers, nil
}

func editableArchiveFiles(reader *zip.Reader) (map[string][]byte, error) {
	if len(reader.File) == 0 || len(reader.File) > textPackMaxEntries {
		return nil, textPackError("TEXTPACK_LIMIT")
	}
	files := make(map[string][]byte, len(reader.File))
	var tree textPackPathTree
	var total uint64
	for _, entry := range reader.File {
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
	return files, nil
}

// editableBundleFilesWithContent is a shallow copy: unchanged image/metadata
// bytes are not duplicated just to calculate a receipt or package revision.
func editableBundleFilesWithContent(snapshot *editableBundleSnapshot, content string, addedAssets map[string][]byte) (map[string][]byte, error) {
	text, err := editableBundleTextBytes(snapshot, content)
	if err != nil {
		return nil, err
	}
	files := make(map[string][]byte, len(snapshot.Files)+len(addedAssets))
	for name, data := range snapshot.Files {
		files[name] = data
	}
	files[snapshot.TextEntry] = text
	var tree textPackPathTree
	if snapshot.archive != nil {
		for _, entry := range snapshot.archive.File {
			if strings.HasSuffix(entry.Name, "/") {
				if err := tree.add(entry.Name, true); err != nil {
					return nil, err
				}
			}
		}
	}
	if snapshot.archive == nil {
		for name := range snapshot.directoryHeaders {
			if strings.HasSuffix(name, "/") {
				if err := tree.add(name, true); err != nil {
					return nil, err
				}
			}
		}
	}
	for name := range files {
		if err := tree.add(name, false); err != nil {
			return nil, err
		}
	}
	for name, data := range addedAssets {
		if !strings.HasPrefix(name, snapshot.Prefix+"assets/") {
			return nil, textPackError("TEXTPACK_UNSAFE_PATH: added images must be package assets")
		}
		full := name
		if _, exists := files[full]; exists {
			// The staged image name may be reused only for the same bytes.
			if !bytes.Equal(files[full], data) {
				return nil, textPackError("TEXTPACK_EXISTS: an asset cannot replace an existing resource")
			}
			continue
		}
		if err := tree.add(full, false); err != nil {
			return nil, err
		}
		if len(data) > int(maxImportedImageSize) {
			return nil, textPackError("TEXTPACK_LIMIT")
		}
		if _, err := textPackImageType(data); err != nil {
			return nil, textPackError("TEXTPACK_INVALID: added asset is not an image")
		}
		files[full] = data
	}
	if len(files) > textPackMaxEntries {
		return nil, textPackError("TEXTPACK_LIMIT")
	}
	if snapshot.archive != nil && len(snapshot.archive.File)+len(files)-len(snapshot.Files) > textPackMaxEntries {
		return nil, textPackError("TEXTPACK_LIMIT")
	}
	if snapshot.archive == nil && len(snapshot.directoryHeaders)+len(files)-len(snapshot.Files) > textPackMaxEntries {
		return nil, textPackError("TEXTPACK_LIMIT")
	}
	total := 0
	for _, data := range files {
		if len(data) > textPackMaxBytes-total {
			return nil, textPackError("TEXTPACK_LIMIT")
		}
		total += len(data)
	}
	return files, nil
}

func editableBundleTextBytes(snapshot *editableBundleSnapshot, content string) ([]byte, error) {
	if snapshot == nil || snapshot.TextEntry == "" || len(content) > maxSupportedDocumentBytes || !utf8.ValidString(content) || strings.IndexByte(content, 0) >= 0 {
		return nil, textPackError("TEXTPACK_INVALID: invalid replacement text")
	}
	original := snapshot.Files[snapshot.TextEntry]
	if content == snapshot.Content {
		return original, nil
	}
	text := []byte(content)
	if bytes.HasPrefix(original, []byte{0xef, 0xbb, 0xbf}) {
		text = append([]byte{0xef, 0xbb, 0xbf}, text...)
	}
	if len(text) > maxSupportedDocumentBytes {
		return nil, textPackError("TEXTPACK_LIMIT")
	}
	return text, nil
}

func editableBundleDirectoryRevision(files map[string][]byte) string {
	names := make([]string, 0, len(files))
	for name := range files {
		names = append(names, name)
	}
	sort.Strings(names)
	hash := sha256.New()
	for _, name := range names {
		data := files[name]
		fmt.Fprintf(hash, "%d:%s:%d:", len(name), name, len(data))
		hash.Write(data)
	}
	return hex.EncodeToString(hash.Sum(nil))
}

// buildEditableTextPack copies unchanged entries raw, preserving compressed
// bytes, per-entry headers/extra fields/comments/attributes, order, directories
// and the archive comment. Only original text and genuinely new assets change.
// It never writes to the source or silently drops unsupported third-party data.
func buildEditableTextPack(snapshot *editableBundleSnapshot, content string, addedAssets map[string][]byte) ([]byte, error) {
	if snapshot == nil || (snapshot.Kind != "textpack" && snapshot.Kind != "textbundle") || (snapshot.Kind == "textpack" && snapshot.archive == nil) {
		return nil, textPackError("TEXTPACK_INVALID")
	}
	files, err := editableBundleFilesWithContent(snapshot, content, addedAssets)
	if err != nil {
		return nil, err
	}
	if snapshot.archive != nil && content == snapshot.Content && len(files) == len(snapshot.Files) {
		return snapshot.archiveRaw, nil
	}
	var buffer bytes.Buffer
	writer := zip.NewWriter(&buffer)
	if snapshot.archive != nil {
		if err := writer.SetComment(snapshot.archive.Comment); err != nil {
			return nil, err
		}
	}
	written := make(map[string]bool, len(snapshot.Files))
	var entries []*zip.File
	if snapshot.archive != nil {
		entries = snapshot.archive.File
	}
	for _, entry := range entries {
		written[entry.Name] = true
		if entry.Name != snapshot.TextEntry {
			if err := writer.Copy(entry); err != nil {
				return nil, err
			}
			continue
		}
		header := entry.FileHeader
		out, err := writer.CreateHeader(&header)
		if err != nil {
			return nil, err
		}
		if _, err := out.Write(files[entry.Name]); err != nil {
			return nil, err
		}
	}
	directories := make([]string, 0, len(snapshot.directoryHeaders))
	if snapshot.archive == nil {
		for name := range snapshot.directoryHeaders {
			if strings.HasSuffix(name, "/") {
				directories = append(directories, name)
			}
		}
	}
	sort.Strings(directories)
	for _, name := range directories {
		header := snapshot.directoryHeaders[name]
		if _, err := writer.CreateHeader(&header); err != nil {
			return nil, err
		}
	}
	names := make([]string, 0, len(addedAssets))
	for name := range files {
		if !written[name] {
			names = append(names, name)
		}
	}
	sort.Strings(names)
	for _, name := range names {
		header, exists := snapshot.directoryHeaders[name]
		if !exists {
			header = zip.FileHeader{Name: name, Method: zip.Store}
			header.SetMode(0o600)
		}
		if name == snapshot.TextEntry || path.Base(name) == "info.json" {
			header.Method = zip.Deflate
		}
		out, err := writer.CreateHeader(&header)
		if err != nil {
			return nil, err
		}
		if _, err := out.Write(files[name]); err != nil {
			return nil, err
		}
	}
	if err := writer.Close(); err != nil {
		return nil, err
	}
	if buffer.Len() > textPackMaxBytes {
		return nil, textPackError("TEXTPACK_LIMIT")
	}
	return buffer.Bytes(), nil
}

// readEditableBundleAsset validates a package-local path without treating a
// document reference as a host path. It never follows links or contacts a URL.
func readEditableBundleAsset(snapshot *editableBundleSnapshot, reference string) ([]byte, string, error) {
	if snapshot == nil || reference == "" || strings.ContainsAny(reference, "?#") {
		return nil, "", textPackError("TEXTPACK_UNSAFE_PATH")
	}
	if err := validateTextPackPath(reference, false); err != nil || !strings.HasPrefix(reference, "assets/") {
		return nil, "", textPackError("TEXTPACK_UNSAFE_PATH")
	}
	prefix := strings.TrimSuffix(snapshot.TextEntry, path.Base(snapshot.TextEntry))
	data, ok := snapshot.Files[prefix+reference]
	if !ok {
		return nil, "", os.ErrNotExist
	}
	kind, err := textPackImageType(data)
	if err != nil {
		return nil, "", fmt.Errorf("TEXTPACK_INVALID: resource is not an image: %w", err)
	}
	return data, kind, nil
}
