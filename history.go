package main

import (
	"bufio"
	"bytes"
	"compress/gzip"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"runtime"
	"sort"
	"strings"
	"time"
)

const (
	maxDocumentVersions       = 30
	maxDocumentHistoryBytes   = 100 * 1024 * 1024
	maxDocumentVersionContent = maxSupportedDocumentBytes
	maxDocumentVersionMeta    = 64 * 1024
	documentVersionMagic      = "QMH1\n"
)

type DocumentVersion struct {
	ID        string `json:"id"`
	Path      string `json:"path"`
	CreatedAt string `json:"createdAt"`
	Size      int64  `json:"size"`
}

type DocumentVersionDetail struct {
	DocumentVersion
	Content string `json:"content"`
}

type storedDocumentVersion struct {
	Path      string `json:"path"`
	CreatedAt string `json:"createdAt"`
	Content   string `json:"content"`
}

type storedDocumentVersionMetadata struct {
	Path      string `json:"path"`
	CreatedAt string `json:"createdAt"`
	Size      int64  `json:"size"`
}

func historyPathKey(path string) string {
	cleaned := filepath.Clean(strings.TrimSpace(path))
	if runtime.GOOS == "windows" {
		cleaned = strings.ToLower(cleaned)
	}
	sum := sha256.Sum256([]byte(cleaned))
	return hex.EncodeToString(sum[:])
}

func (a *App) documentHistoryRoot() string {
	return filepath.Join(filepath.Dir(a.preferencePath()), "document-history")
}

func (a *App) documentHistoryDirectory(path string) string {
	return filepath.Join(a.documentHistoryRoot(), historyPathKey(path))
}

func validDocumentVersionID(id string) bool {
	return id != "" && filepath.Base(id) == id && strings.HasSuffix(id, ".json.gz") && !strings.ContainsAny(id, `/\\`)
}

func encodeDocumentVersion(snapshot storedDocumentVersion) ([]byte, error) {
	var output bytes.Buffer
	writer := gzip.NewWriter(&output)
	if _, err := io.WriteString(writer, documentVersionMagic); err != nil {
		_ = writer.Close()
		return nil, err
	}
	metadata := storedDocumentVersionMetadata{Path: snapshot.Path, CreatedAt: snapshot.CreatedAt, Size: int64(len(snapshot.Content))}
	if err := json.NewEncoder(writer).Encode(metadata); err != nil {
		_ = writer.Close()
		return nil, err
	}
	if _, err := io.WriteString(writer, snapshot.Content); err != nil {
		_ = writer.Close()
		return nil, err
	}
	if err := writer.Close(); err != nil {
		return nil, err
	}
	return output.Bytes(), nil
}

func openDocumentVersion(path string) (*os.File, *gzip.Reader, *bufio.Reader, error) {
	file, err := os.Open(path)
	if err != nil {
		return nil, nil, nil, err
	}
	reader, err := gzip.NewReader(file)
	if err != nil {
		_ = file.Close()
		return nil, nil, nil, err
	}
	return file, reader, bufio.NewReaderSize(reader, maxDocumentVersionMeta+1), nil
}

func readDocumentVersionMetadata(reader *bufio.Reader) (storedDocumentVersionMetadata, bool, error) {
	prefix, err := reader.Peek(len(documentVersionMagic))
	if err == nil && string(prefix) == documentVersionMagic {
		_, _ = reader.Discard(len(documentVersionMagic))
		line, readErr := reader.ReadSlice('\n')
		if readErr != nil || len(line) > maxDocumentVersionMeta {
			return storedDocumentVersionMetadata{}, true, errors.New("document version metadata is invalid")
		}
		var metadata storedDocumentVersionMetadata
		if jsonErr := json.Unmarshal(line, &metadata); jsonErr != nil {
			return storedDocumentVersionMetadata{}, true, jsonErr
		}
		if strings.TrimSpace(metadata.Path) == "" || strings.TrimSpace(metadata.CreatedAt) == "" || metadata.Size < 0 || metadata.Size > maxDocumentVersionContent {
			return storedDocumentVersionMetadata{}, true, errors.New("document version metadata is invalid")
		}
		return metadata, true, nil
	}
	return storedDocumentVersionMetadata{}, false, nil
}

func decodeDocumentVersion(path string) (storedDocumentVersion, error) {
	file, gzipReader, reader, err := openDocumentVersion(path)
	if err != nil {
		return storedDocumentVersion{}, err
	}
	defer file.Close()
	defer gzipReader.Close()
	metadata, currentFormat, err := readDocumentVersionMetadata(reader)
	if err != nil {
		return storedDocumentVersion{}, err
	}
	if currentFormat {
		content, readErr := io.ReadAll(io.LimitReader(reader, maxDocumentVersionContent+1))
		if readErr != nil {
			return storedDocumentVersion{}, readErr
		}
		if int64(len(content)) != metadata.Size {
			return storedDocumentVersion{}, errors.New("document version content size is invalid")
		}
		return storedDocumentVersion{Path: metadata.Path, CreatedAt: metadata.CreatedAt, Content: string(content)}, nil
	}

	// Versions created by pre-2.7.3 development builds used one JSON object.
	// JSON escaping may expand valid content up to six times, so keep the
	// compatibility limit separate from the decoded content limit.
	var snapshot storedDocumentVersion
	legacyLimit := int64(maxDocumentVersionContent*6 + maxDocumentVersionMeta)
	if err := json.NewDecoder(io.LimitReader(reader, legacyLimit)).Decode(&snapshot); err != nil {
		return storedDocumentVersion{}, err
	}
	if strings.TrimSpace(snapshot.Path) == "" || strings.TrimSpace(snapshot.CreatedAt) == "" || len(snapshot.Content) > maxDocumentVersionContent {
		return storedDocumentVersion{}, errors.New("document version is invalid")
	}
	return snapshot, nil
}

func decodeDocumentVersionMetadata(path string) (storedDocumentVersionMetadata, error) {
	file, gzipReader, reader, err := openDocumentVersion(path)
	if err != nil {
		return storedDocumentVersionMetadata{}, err
	}
	defer file.Close()
	defer gzipReader.Close()
	metadata, currentFormat, err := readDocumentVersionMetadata(reader)
	if err != nil {
		return storedDocumentVersionMetadata{}, err
	}
	if currentFormat {
		return metadata, nil
	}
	legacy, err := decodeDocumentVersion(path)
	if err != nil {
		return storedDocumentVersionMetadata{}, err
	}
	return storedDocumentVersionMetadata{Path: legacy.Path, CreatedAt: legacy.CreatedAt, Size: int64(len(legacy.Content))}, nil
}

func sameHistoryPath(left, right string) bool {
	if runtime.GOOS == "windows" {
		return strings.EqualFold(filepath.Clean(left), filepath.Clean(right))
	}
	return filepath.Clean(left) == filepath.Clean(right)
}

func (a *App) captureDocumentVersion(filePath, nextContent string) error {
	cleaned, err := filepath.Abs(filepath.Clean(strings.TrimSpace(filePath)))
	if err != nil || strings.TrimSpace(filePath) == "" {
		return err
	}
	var current []byte
	_, foundBookmark, bookmarkErr := a.withMacSecurityScopedPath(cleaned, func(accessiblePath string) error {
		var readErr error
		current, readErr = os.ReadFile(accessiblePath)
		return readErr
	})
	if !foundBookmark || bookmarkErr != nil {
		current, err = os.ReadFile(cleaned)
		if err != nil {
			if errors.Is(err, os.ErrNotExist) {
				return nil
			}
			return err
		}
	}
	if len(current) > maxDocumentVersionContent || string(current) == nextContent {
		return nil
	}

	a.historyMu.Lock()
	defer a.historyMu.Unlock()
	directory := a.documentHistoryDirectory(cleaned)
	created := time.Now().UTC()
	snapshot := storedDocumentVersion{Path: cleaned, CreatedAt: created.Format(time.RFC3339Nano), Content: string(current)}
	data, err := encodeDocumentVersion(snapshot)
	if err != nil {
		return err
	}
	if err := os.MkdirAll(directory, 0o700); err != nil {
		return err
	}
	if !regularHistoryDirectory(a.documentHistoryRoot()) || !regularHistoryDirectory(directory) {
		return errors.New("document history directory is not owned")
	}
	contentHash := sha256.Sum256(current)
	id := created.Format("20060102T150405.000000000Z") + "-" + hex.EncodeToString(contentHash[:4]) + ".json.gz"
	if err := writeFileAtomically(filepath.Join(directory, id), data); err != nil {
		return err
	}
	return a.pruneDocumentHistoryLocked(directory)
}

func (a *App) pruneDocumentHistoryLocked(currentDirectory string) error {
	if !regularHistoryDirectory(a.documentHistoryRoot()) || !regularHistoryDirectory(currentDirectory) {
		return errors.New("document history directory is not owned")
	}
	entries, err := os.ReadDir(currentDirectory)
	if err != nil {
		return err
	}
	entries = documentVersionEntries(currentDirectory, entries)
	sort.Slice(entries, func(i, j int) bool { return entries[i].Name() > entries[j].Name() })
	for index := maxDocumentVersions; index < len(entries); index++ {
		if !entries[index].IsDir() {
			_ = os.Remove(filepath.Join(currentDirectory, entries[index].Name()))
		}
	}
	type historyFile struct {
		path    string
		modTime time.Time
		size    int64
	}
	files := make([]historyFile, 0)
	var total int64
	root := a.documentHistoryRoot()
	if !regularHistoryDirectory(root) {
		return nil
	}
	directories, err := os.ReadDir(root)
	if err != nil {
		return err
	}
	for _, directoryEntry := range directories {
		directory := filepath.Join(root, directoryEntry.Name())
		if !validHistoryDirectoryName(directoryEntry.Name()) || !regularHistoryDirectory(directory) {
			continue
		}
		versionEntries, readErr := os.ReadDir(directory)
		if readErr != nil {
			continue
		}
		for _, entry := range documentVersionEntries(directory, versionEntries) {
			path := filepath.Join(directory, entry.Name())
			info, infoErr := os.Lstat(path)
			if infoErr == nil && info.Mode().IsRegular() {
				total += info.Size()
				files = append(files, historyFile{path: path, modTime: info.ModTime(), size: info.Size()})
			}
		}
	}
	if total <= maxDocumentHistoryBytes {
		return nil
	}
	sort.Slice(files, func(i, j int) bool { return files[i].modTime.Before(files[j].modTime) })
	for _, file := range files {
		if total <= maxDocumentHistoryBytes {
			break
		}
		if removeErr := os.Remove(file.path); removeErr == nil {
			total -= file.size
		}
	}
	return nil
}

func validHistoryDirectoryName(name string) bool {
	if len(name) != 64 {
		return false
	}
	for _, char := range name {
		if (char < '0' || char > '9') && (char < 'a' || char > 'f') {
			return false
		}
	}
	return true
}

func regularHistoryDirectory(path string) bool {
	info, err := os.Lstat(path)
	return err == nil && info.IsDir() && info.Mode()&os.ModeSymlink == 0
}

func documentVersionEntries(directory string, entries []os.DirEntry) []os.DirEntry {
	versions := make([]os.DirEntry, 0, len(entries))
	for _, entry := range entries {
		if !validDocumentVersionID(entry.Name()) || entry.IsDir() || entry.Type()&os.ModeSymlink != 0 {
			continue
		}
		path := filepath.Join(directory, entry.Name())
		info, err := os.Lstat(path)
		if err != nil || !info.Mode().IsRegular() {
			continue
		}
		metadata, err := decodeDocumentVersionMetadata(path)
		if err == nil && historyPathKey(metadata.Path) == filepath.Base(directory) {
			versions = append(versions, entry)
		}
	}
	return versions
}

func (a *App) ListDocumentVersions(filePath string) ([]DocumentVersion, error) {
	cleaned, err := filepath.Abs(filepath.Clean(strings.TrimSpace(filePath)))
	if err != nil || strings.TrimSpace(filePath) == "" {
		return nil, errors.New("document path is empty")
	}
	a.historyMu.Lock()
	defer a.historyMu.Unlock()
	directory := a.documentHistoryDirectory(cleaned)
	entries, err := os.ReadDir(directory)
	if errors.Is(err, os.ErrNotExist) {
		return []DocumentVersion{}, nil
	}
	if err != nil {
		return nil, err
	}
	versions := make([]DocumentVersion, 0, len(entries))
	for _, entry := range entries {
		if entry.IsDir() || !validDocumentVersionID(entry.Name()) {
			continue
		}
		metadata, decodeErr := decodeDocumentVersionMetadata(filepath.Join(directory, entry.Name()))
		if decodeErr != nil || !sameHistoryPath(metadata.Path, cleaned) {
			continue
		}
		versions = append(versions, DocumentVersion{ID: entry.Name(), Path: metadata.Path, CreatedAt: metadata.CreatedAt, Size: metadata.Size})
	}
	sort.Slice(versions, func(i, j int) bool { return versions[i].CreatedAt > versions[j].CreatedAt })
	return versions, nil
}

func (a *App) GetDocumentVersion(filePath, id string) (*DocumentVersionDetail, error) {
	cleaned, err := filepath.Abs(filepath.Clean(strings.TrimSpace(filePath)))
	if err != nil || strings.TrimSpace(filePath) == "" {
		return nil, errors.New("document path is empty")
	}
	if !validDocumentVersionID(id) {
		return nil, errors.New("invalid document version")
	}
	a.historyMu.Lock()
	defer a.historyMu.Unlock()
	snapshot, err := decodeDocumentVersion(filepath.Join(a.documentHistoryDirectory(cleaned), id))
	if err != nil {
		return nil, err
	}
	if !sameHistoryPath(snapshot.Path, cleaned) {
		return nil, fmt.Errorf("document version does not belong to %s", filepath.Base(cleaned))
	}
	return &DocumentVersionDetail{DocumentVersion: DocumentVersion{ID: id, Path: snapshot.Path, CreatedAt: snapshot.CreatedAt, Size: int64(len(snapshot.Content))}, Content: snapshot.Content}, nil
}
