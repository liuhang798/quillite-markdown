package main

import (
	"context"
	"crypto/rand"
	"encoding/binary"
	"encoding/hex"
	"errors"
	"io"
	"net/http"
	"net/url"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"sync"
	"time"
	"unicode"

	wailsruntime "github.com/wailsapp/wails/v2/pkg/runtime"
)

const (
	localVideoPrefix        = "/__quillite_video/"
	maxLocalVideoLeases     = 12
	maxLocalVideoResponses  = 6
	maxLocalVideoChunk      = 2 * 1024 * 1024
	maxLocalVideoDocuments  = 64
	maxLocalVideoSelections = 64
	localVideoLeaseLifetime = 4 * time.Hour
)

var (
	errVideoDocument = errors.New("LOCAL_VIDEO_DOCUMENT_UNSUPPORTED")
	errVideoPath     = errors.New("LOCAL_VIDEO_PATH_UNSAFE")
	errVideoAccess   = errors.New("LOCAL_VIDEO_NOT_AUTHORIZED")
	errVideoMissing  = errors.New("LOCAL_VIDEO_NOT_FOUND")
	errVideoFormat   = errors.New("LOCAL_VIDEO_UNSUPPORTED_FORMAT")
	errVideoStart    = errors.New("LOCAL_VIDEO_PLAYBACK_UNAVAILABLE")
	errVideoCopy     = errors.New("LOCAL_VIDEO_COPY_INCOMPLETE")
)

type LocalVideoFile struct {
	Reference string `json:"reference"`
	Name      string `json:"name"`
	Size      int64  `json:"size"`
	External  bool   `json:"external"`
}

type localVideoIdentity struct {
	path string
	info os.FileInfo
}

type localVideoGrantKey struct {
	document string
	path     string
}

type localVideoState struct {
	mu           sync.Mutex
	documents    map[string]localVideoIdentity
	documentLRU  []string
	selections   map[localVideoGrantKey]localVideoIdentity
	selectionLRU []localVideoGrantKey
	leases       map[string]*localVideoLease
	responses    int
	closed       bool
}

type localVideoLease struct {
	file      *os.File
	info      os.FileInfo
	mediaType string
	timer     *time.Timer
}

type localVideoFormat struct {
	suffix    string
	mediaType string
	valid     func(io.ReaderAt, int64) bool
}

func localVideoFormatForPath(path string) (localVideoFormat, bool) {
	switch strings.ToLower(filepath.Ext(path)) {
	case ".mp4":
		return localVideoFormat{".mp4", "video/mp4", localVideoMP4Header}, true
	case ".webm":
		return localVideoFormat{".webm", "video/webm", localVideoWebMHeader}, true
	default:
		return localVideoFormat{}, false
	}
}

func plainVideoDocument(path string) bool {
	if !markdownExtensions[strings.ToLower(filepath.Ext(path))] || strings.EqualFold(filepath.Ext(path), ".txt") {
		return false
	}
	return !videoPathInPackage(path)
}

func videoPathInPackage(path string) bool {
	for part := path; ; part = filepath.Dir(part) {
		if isEditableBundlePath(part) {
			return true
		}
		if filepath.Dir(part) == part {
			return false
		}
	}
}

func isRemoteVideoPath(path string) bool {
	return strings.HasPrefix(strings.ReplaceAll(path, "\\", "/"), "//")
}

// Workspace restrictions also apply through aliases of the document folder
// or of the configuration directory itself.
func (a *App) localVideoInManagedWorkspace(path string) bool {
	root := a.bundleWorkspaceRoot()
	inside := func(directory string) bool {
		_, within := videoPathWithin(directory, path)
		return within || sameFilesystemPath(directory, path)
	}
	if inside(root) {
		return true
	}
	canonical, err := filepath.EvalSymlinks(root)
	return err == nil && inside(canonical)
}

// Only a document successfully opened or saved by the application can grant
// the ordinary sibling-directory scope. A player URL carries no filesystem path.
func (a *App) rememberLocalVideoDocument(path string) {
	if !filepath.IsAbs(path) || isRemoteVideoPath(path) || !plainVideoDocument(path) {
		return
	}
	if a.localVideoInManagedWorkspace(path) {
		return
	}
	directory, err := filepath.EvalSymlinks(filepath.Dir(path))
	if err != nil || isRemoteVideoPath(directory) || videoPathInPackage(directory) || a.localVideoInManagedWorkspace(directory) {
		return
	}
	info, err := os.Stat(directory)
	if err != nil || !info.IsDir() {
		return
	}
	state := &a.localVideo
	state.mu.Lock()
	defer state.mu.Unlock()
	if state.closed {
		return
	}
	if state.documents == nil {
		state.documents = make(map[string]localVideoIdentity)
	}
	key := draftPathKey(path)
	if previous, exists := state.documents[key]; exists && !os.SameFile(previous.info, info) {
		for grant := range state.selections {
			if grant.document == key {
				delete(state.selections, grant)
			}
		}
	}
	state.documents[key] = localVideoIdentity{directory, info}
	state.documentLRU = appendRecentVideoKey(state.documentLRU, key)
	if len(state.documentLRU) > maxLocalVideoDocuments {
		evicted := state.documentLRU[0]
		delete(state.documents, evicted)
		state.documentLRU = state.documentLRU[1:]
		for grant := range state.selections {
			if grant.document == evicted {
				delete(state.selections, grant)
			}
		}
	}
}

func appendRecentVideoKey[T comparable](items []T, key T) []T {
	for i, item := range items {
		if item == key {
			copy(items[i:], items[i+1:])
			items = items[:len(items)-1]
			break
		}
	}
	return append(items, key)
}

func (a *App) localVideoDocument(path string) (string, localVideoIdentity, error) {
	if !filepath.IsAbs(path) || isRemoteVideoPath(path) || !plainVideoDocument(path) {
		return "", localVideoIdentity{}, errVideoDocument
	}
	key := draftPathKey(path)
	a.localVideo.mu.Lock()
	directory, ok := a.localVideo.documents[key]
	a.localVideo.mu.Unlock()
	if !ok {
		return "", localVideoIdentity{}, errVideoDocument
	}
	canonical, err := filepath.EvalSymlinks(filepath.Dir(path))
	if err != nil || !sameFilesystemPath(canonical, directory.path) {
		return "", localVideoIdentity{}, errVideoAccess
	}
	info, err := os.Stat(canonical)
	if err != nil || !os.SameFile(info, directory.info) {
		return "", localVideoIdentity{}, errVideoAccess
	}
	return key, directory, nil
}

func videoReferencePath(reference string) (string, error) {
	if strings.TrimSpace(reference) == "" || len(reference) > 16*1024 {
		return "", errVideoPath
	}
	var path string
	if strings.HasPrefix(strings.ToLower(reference), "file://") {
		address, err := url.Parse(reference)
		if err != nil || address.Host != "" || address.User != nil || address.RawQuery != "" || address.Fragment != "" {
			return "", errVideoPath
		}
		path = address.Path
		if len(path) >= 3 && path[0] == '/' && path[2] == ':' && filepath.VolumeName(filepath.FromSlash(path[1:])) != "" {
			path = path[1:]
		}
	} else {
		if strings.Contains(reference, "://") {
			return "", errVideoPath
		}
		var err error
		path, err = url.PathUnescape(reference)
		if err != nil {
			return "", errVideoPath
		}
	}
	path = strings.ReplaceAll(path, "\\", "/")
	if isRemoteVideoPath(path) || strings.IndexFunc(path, unicode.IsControl) != -1 {
		return "", errVideoPath
	}
	native := filepath.FromSlash(path)
	volume := filepath.VolumeName(native)
	if strings.Contains(strings.TrimPrefix(native, volume), ":") || (volume != "" && !filepath.IsAbs(native)) {
		return "", errVideoPath
	}
	for _, part := range strings.Split(path, "/") {
		if part == ".." {
			return "", errVideoPath
		}
	}
	native = filepath.Clean(native)
	if !filepath.IsAbs(native) && !filepath.IsLocal(native) {
		return "", errVideoPath
	}
	return native, nil
}

func videoURLReference(path string) string {
	return (&url.URL{Path: filepath.ToSlash(path)}).EscapedPath()
}

func videoPathWithin(directory, path string) (string, bool) {
	relative, err := filepath.Rel(directory, path)
	return relative, err == nil && relative != "." && filepath.IsLocal(relative)
}

func openVideoRoot(identity localVideoIdentity) (*os.Root, error) {
	root, err := textPackOpenRoot(identity.path)
	if err != nil {
		return nil, errVideoAccess
	}
	info, err := root.Stat(".")
	if err != nil || !os.SameFile(info, identity.info) {
		_ = root.Close()
		return nil, errVideoAccess
	}
	return root, nil
}

func openValidatedLocalVideo(root *os.Root, relative string) (*os.File, os.FileInfo, error) {
	format, ok := localVideoFormatForPath(relative)
	if !ok {
		return nil, nil, errVideoFormat
	}
	path := filepath.Join(root.Name(), relative)
	if videoPathInPackage(path) {
		return nil, nil, errVideoDocument
	}
	info, err := root.Lstat(relative)
	if err != nil {
		if os.IsNotExist(err) {
			return nil, nil, errVideoMissing
		}
		return nil, nil, errVideoAccess
	}
	if !info.Mode().IsRegular() || textPackNoLinks(path) != nil {
		return nil, nil, errVideoAccess
	}
	file, err := root.Open(relative)
	if err != nil {
		return nil, nil, errVideoAccess
	}
	pinned, err := file.Stat()
	if err != nil || !pinned.Mode().IsRegular() || !os.SameFile(info, pinned) {
		_ = file.Close()
		return nil, nil, errVideoAccess
	}
	if !format.valid(file, pinned.Size()) {
		_ = file.Close()
		return nil, nil, errVideoFormat
	}
	return file, pinned, nil
}

func localVideoMP4Header(file io.ReaderAt, size int64) bool {
	var signature [4096]byte
	n, _ := file.ReadAt(signature[:], 0)
	boxSize := int(binary.BigEndian.Uint32(signature[:4]))
	if n < 16 || string(signature[4:8]) != "ftyp" || boxSize < 16 || boxSize > n || int64(boxSize) > size || boxSize%4 != 0 || string(signature[8:12]) == "qt  " {
		return false
	}
	for offset := 8; offset+4 <= boxSize; offset += 4 {
		if offset == 12 { // minor version, not a brand
			continue
		}
		switch string(signature[offset : offset+4]) {
		case "isom", "iso2", "iso3", "iso4", "iso5", "iso6", "iso7", "iso8", "iso9", "mp41", "mp42", "avc1", "M4V ", "MSNV", "dash":
			return true
		}
	}
	return false
}

// Read one bounded header, not the video. A generic Matroska file starts with
// the same EBML signature; the header's actual DocType element must say webm.
func localVideoWebMHeader(file io.ReaderAt, size int64) bool {
	var signature [4096]byte
	n, _ := file.ReadAt(signature[:], 0)
	if n < 5 || binary.BigEndian.Uint32(signature[:4]) != 0x1a45dfa3 {
		return false
	}
	data := signature[4:n]
	headerSize, width := localVideoEBMLVINT(data, 8)
	if width == 0 || localVideoEBMLUnknownSize(headerSize, width) || headerSize > uint64(len(data)-width) {
		return false
	}
	header, tail := data[width:width+int(headerSize)], data[width+int(headerSize):]
	foundDocType := false
	for len(header) > 0 {
		id, idWidth := localVideoEBMLVINT(header, 4)
		if idWidth == 0 || localVideoEBMLUnknownSize(id, idWidth) {
			return false
		}
		isDocType := idWidth == 2 && header[0] == 0x42 && header[1] == 0x82
		header = header[idWidth:]
		length, width := localVideoEBMLVINT(header, 8)
		if width == 0 || localVideoEBMLUnknownSize(length, width) || length > uint64(len(header)-width) {
			return false
		}
		value := header[width : width+int(length)]
		if isDocType {
			if foundDocType || strings.TrimRight(string(value), "\x00") != "webm" {
				return false
			}
			foundDocType = true
		}
		header = header[width+int(length):]
	}
	if !foundDocType {
		return false
	}
	// Permit small leading padding, then require a Segment with actual data.
	// MediaRecorder can use the EBML unknown-size Sentinel for that Segment.
	for len(tail) > 0 && tail[0] == 0xec { // Void
		length, width := localVideoEBMLVINT(tail[1:], 8)
		if width == 0 || localVideoEBMLUnknownSize(length, width) || length > uint64(len(tail)-1-width) {
			return false
		}
		tail = tail[1+width+int(length):]
	}
	if len(tail) < 5 || binary.BigEndian.Uint32(tail[:4]) != 0x18538067 {
		return false
	}
	length, width := localVideoEBMLVINT(tail[4:], 8)
	remaining := size - int64(n-len(tail)+4+width)
	return width != 0 && remaining > 0 && (localVideoEBMLUnknownSize(length, width) || length > 0 && length <= uint64(remaining))
}

// RFC 8794 variable-size integer: the first set bit identifies the field
// width and is not part of its data. A zero width means invalid/truncated.
func localVideoEBMLVINT(data []byte, maxWidth int) (uint64, int) {
	if len(data) == 0 {
		return 0, 0
	}
	marker := byte(0x80)
	for width := 1; width <= maxWidth && width <= len(data); width, marker = width+1, marker>>1 {
		if data[0]&marker == 0 {
			continue
		}
		value := uint64(data[0] &^ marker)
		for _, octet := range data[1:width] {
			value = value<<8 | uint64(octet)
		}
		return value, width
	}
	return 0, 0
}

func localVideoEBMLUnknownSize(value uint64, width int) bool {
	return value == (uint64(1)<<(7*width))-1
}

func (a *App) resolveLocalVideo(documentPath, reference string) (*os.File, os.FileInfo, string, error) {
	document, directory, err := a.localVideoDocument(documentPath)
	if err != nil {
		return nil, nil, "", err
	}
	path, err := videoReferencePath(reference)
	if err != nil {
		return nil, nil, "", err
	}
	var approved localVideoIdentity
	if filepath.IsAbs(path) {
		if relative, inside := videoPathWithin(filepath.Dir(documentPath), path); inside {
			path = relative
		} else if relative, inside := videoPathWithin(directory.path, path); inside {
			path = relative
		} else {
			state := &a.localVideo
			state.mu.Lock()
			approved = state.selections[localVideoGrantKey{document, draftPathKey(path)}]
			state.mu.Unlock()
			if approved.info == nil {
				return nil, nil, "", errVideoAccess
			}
			path = filepath.Base(approved.path)
		}
	}
	var file *os.File
	var info os.FileInfo
	if approved.info != nil {
		// Hold the user's native picker ACL scope until the validated file is open.
		open := func(canonical string) error {
			parent, err := filepath.EvalSymlinks(filepath.Dir(canonical))
			if err != nil {
				return errVideoAccess
			}
			if a.localVideoInManagedWorkspace(parent) {
				return errVideoDocument
			}
			root, err := textPackOpenRoot(parent)
			if err != nil {
				return errVideoAccess
			}
			defer root.Close()
			file, info, err = openValidatedLocalVideo(root, filepath.Base(canonical))
			return err
		}
		_, found, err := a.withMacSecurityScopedPath(approved.path, open)
		if !found {
			err = open(approved.path)
		}
		if err != nil {
			return nil, nil, "", err
		}
		if !os.SameFile(info, approved.info) {
			_ = file.Close()
			return nil, nil, "", errVideoAccess
		}
		return file, info, approved.path, nil
	}
	if a.localVideoInManagedWorkspace(filepath.Join(directory.path, path)) {
		return nil, nil, "", errVideoDocument
	}
	root, err := openVideoRoot(directory)
	if err != nil {
		return nil, nil, "", err
	}
	defer root.Close()
	file, info, err = openValidatedLocalVideo(root, path)
	return file, info, filepath.Join(directory.path, path), err
}

func (a *App) localVideoSelection(documentPath, selected string, externalApproved bool) (*LocalVideoFile, error) {
	document, directory, err := a.localVideoDocument(documentPath)
	if err != nil {
		return nil, err
	}
	if !filepath.IsAbs(selected) || isRemoteVideoPath(selected) {
		return nil, errVideoPath
	}
	selected = filepath.Clean(selected)
	ref := videoURLReference(selected)
	if rel, inside := videoPathWithin(filepath.Dir(documentPath), selected); inside {
		ref = videoURLReference(rel)
	} else if rel, inside := videoPathWithin(directory.path, selected); inside {
		ref = videoURLReference(rel)
	}
	if ref != videoURLReference(selected) {
		file, info, _, err := a.resolveLocalVideo(documentPath, ref)
		if err != nil {
			return nil, err
		}
		_ = file.Close()
		return &LocalVideoFile{Reference: ref, Name: filepath.Base(selected), Size: info.Size()}, nil
	}
	if !externalApproved {
		return nil, errVideoAccess
	}
	_ = a.rememberMacSecurityScopedPath(selected, false)
	var info os.FileInfo
	validate := func(accessible string) error {
		parent, err := filepath.EvalSymlinks(filepath.Dir(accessible))
		if err != nil {
			return errVideoAccess
		}
		if a.localVideoInManagedWorkspace(parent) {
			return errVideoDocument
		}
		root, err := textPackOpenRoot(parent)
		if err != nil {
			return errVideoAccess
		}
		defer root.Close()
		file, pinned, err := openValidatedLocalVideo(root, filepath.Base(accessible))
		if err != nil {
			return err
		}
		info = pinned
		return file.Close()
	}
	_, found, err := a.withMacSecurityScopedPath(selected, validate)
	if !found {
		err = validate(selected)
	}
	if err != nil {
		return nil, err
	}
	state := &a.localVideo
	state.mu.Lock()
	defer state.mu.Unlock()
	if state.closed {
		return nil, errVideoAccess
	}
	if state.selections == nil {
		state.selections = make(map[localVideoGrantKey]localVideoIdentity)
	}
	key := localVideoGrantKey{document, draftPathKey(selected)}
	state.selections[key] = localVideoIdentity{selected, info}
	state.selectionLRU = appendRecentVideoKey(state.selectionLRU, key)
	if len(state.selectionLRU) > maxLocalVideoSelections {
		delete(state.selections, state.selectionLRU[0])
		state.selectionLRU = state.selectionLRU[1:]
	}
	return &LocalVideoFile{Reference: ref, Name: filepath.Base(selected), Size: info.Size(), External: true}, nil
}

func (a *App) localVideoPicker(directory, filename string) (string, error) {
	a.mu.RLock()
	ctx := a.ctx
	a.mu.RUnlock()
	if ctx == nil {
		return "", errVideoAccess
	}
	return wailsruntime.OpenFileDialog(ctx, wailsruntime.OpenDialogOptions{
		Title:            a.textPackLabel("选择本地视频", "Choose a local video"),
		DefaultDirectory: directory,
		DefaultFilename:  filename,
		Filters: []wailsruntime.FileFilter{{
			DisplayName: a.textPackLabel("视频文件（MP4、WebM）", "Video files (MP4, WebM)"),
			Pattern:     "*.mp4;*.webm",
		}},
	})
}

func (a *App) SelectLocalVideo(documentPath string) (*LocalVideoFile, error) {
	_, directory, err := a.localVideoDocument(documentPath)
	if err != nil {
		return nil, err
	}
	path, err := a.localVideoPicker(directory.path, "")
	if err != nil || path == "" {
		return nil, err
	}
	return a.localVideoSelection(documentPath, path, true)
}

func (a *App) DescribeDroppedLocalVideo(documentPath, path string) (*LocalVideoFile, error) {
	video, err := a.localVideoSelection(documentPath, path, false)
	_, formatSupported := localVideoFormatForPath(path)
	if !errors.Is(err, errVideoAccess) || !filepath.IsAbs(path) || isRemoteVideoPath(path) || !formatSupported {
		return video, err
	}
	// Wails drop data arrives at the renderer. An out-of-scope renderer path
	// may suggest a filename, but only a native confirmation can authorize it.
	chosen, err := a.localVideoPicker(filepath.Dir(path), filepath.Base(path))
	if err != nil || chosen == "" {
		return nil, err
	}
	if !sameFilesystemPath(chosen, path) {
		return nil, errVideoAccess
	}
	return a.localVideoSelection(documentPath, chosen, true)
}

func (a *App) CopyLocalVideoToAssets(documentPath, reference string) (string, error) {
	_, location, err := a.localVideoDocument(documentPath)
	if err != nil {
		return "", err
	}
	source, info, resolved, err := a.resolveLocalVideo(documentPath, reference)
	if err != nil {
		return "", err
	}
	defer source.Close()
	root, err := openVideoRoot(location)
	if err != nil {
		return "", err
	}
	defer root.Close()
	if err := root.Mkdir("assets", 0o755); err != nil && !os.IsExist(err) {
		return "", errVideoCopy
	}
	assetsInfo, err := root.Lstat("assets")
	if err != nil || !assetsInfo.IsDir() || textPackCheckReparse(filepath.Join(location.path, "assets")) != nil {
		return "", errVideoAccess
	}
	assets, err := root.OpenRoot("assets")
	if err != nil {
		return "", errVideoAccess
	}
	defer assets.Close()
	pinnedAssets, err := assets.Stat(".")
	if err != nil || !os.SameFile(assetsInfo, pinnedAssets) {
		return "", errVideoAccess
	}
	if relative, inside := videoPathWithin(filepath.Join(location.path, "assets"), resolved); inside {
		return videoURLReference(filepath.Join("assets", relative)), nil
	}
	name := filepath.Base(resolved)
	extension := filepath.Ext(name)
	stem := strings.TrimSuffix(name, extension)
	for i := 0; i < 1000; i++ {
		if i > 0 {
			name = stem + "-" + randomVideoFilenameSuffix() + extension
		}
		target, err := assets.OpenFile(name, os.O_WRONLY|os.O_CREATE|os.O_EXCL, 0o644)
		if os.IsExist(err) {
			continue
		}
		if err != nil {
			return "", errVideoCopy
		}
		n, copyErr := io.Copy(target, io.NewSectionReader(source, 0, info.Size()))
		syncErr := target.Sync()
		closeErr := target.Close()
		if copyErr != nil || syncErr != nil || closeErr != nil || n != info.Size() {
			// Leave a partial new file for explicit user cleanup. Never remove or
			// overwrite a path that a concurrent operation could have replaced.
			return "", errVideoCopy
		}
		entry, err := root.Lstat("assets")
		if err != nil || !os.SameFile(pinnedAssets, entry) {
			return "", errVideoCopy
		}
		return videoURLReference(filepath.Join("assets", name)), nil
	}
	return "", errVideoCopy
}

func randomVideoFilenameSuffix() string {
	var value [6]byte
	_, _ = rand.Read(value[:]) // Go's crypto/rand guarantees success or terminates.
	return hex.EncodeToString(value[:])
}

func (a *App) OpenLocalVideoExternally(documentPath, reference string) error {
	file, pinned, path, err := a.resolveLocalVideo(documentPath, reference)
	if err != nil {
		return err
	}
	defer file.Close()
	current, err := os.Lstat(path)
	if err != nil || !os.SameFile(current, pinned) {
		return errVideoAccess
	}
	if err := openLocalVideoPlayer(path); err != nil {
		return errVideoStart
	}
	return nil
}

func (a *App) BeginLocalVideo(documentPath, reference string) (string, error) {
	file, info, resolved, err := a.resolveLocalVideo(documentPath, reference)
	if err != nil {
		return "", err
	}
	format, ok := localVideoFormatForPath(resolved)
	if !ok {
		_ = file.Close()
		return "", errVideoFormat
	}
	address, err := a.localVideo.add(file, info, format)
	if err != nil {
		_ = file.Close()
	}
	return address, err
}

func (a *App) EndLocalVideo(address string) { a.localVideo.revoke(address) }

func (a *App) shutdownLocalVideo(context.Context) { a.localVideo.close() }

func (s *localVideoState) add(file *os.File, info os.FileInfo, format localVideoFormat) (string, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	if s.closed || len(s.leases) >= maxLocalVideoLeases {
		return "", errVideoStart
	}
	if s.leases == nil {
		s.leases = make(map[string]*localVideoLease)
	}
	var value [32]byte
	_, _ = rand.Read(value[:])
	address := localVideoPrefix + hex.EncodeToString(value[:]) + format.suffix
	lease := &localVideoLease{file: file, info: info, mediaType: format.mediaType}
	s.leases[address] = lease
	lease.timer = time.AfterFunc(localVideoLeaseLifetime, func() { s.revoke(address) })
	return address, nil
}

func (a *App) localVideoMiddleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if strings.HasPrefix(r.URL.Path, localVideoPrefix) {
			a.localVideo.serve(w, r)
			return
		}
		next.ServeHTTP(w, r)
	})
}

func (s *localVideoState) serve(w http.ResponseWriter, r *http.Request) {
	if r.URL.RawQuery != "" || r.URL.ForceQuery || r.URL.RawPath != "" {
		http.NotFound(w, r)
		return
	}
	s.mu.Lock()
	// Match the exact opaque address, including the format-qualified suffix.
	lease := s.leases[r.URL.Path]
	if lease == nil {
		s.mu.Unlock()
		http.NotFound(w, r)
		return
	}
	if r.Method != http.MethodGet && r.Method != http.MethodHead {
		s.mu.Unlock()
		w.Header().Set("Allow", "GET, HEAD")
		w.WriteHeader(http.StatusMethodNotAllowed)
		return
	}
	if s.responses >= maxLocalVideoResponses {
		s.mu.Unlock()
		w.WriteHeader(http.StatusServiceUnavailable)
		return
	}
	s.responses++
	s.mu.Unlock()
	defer func() {
		s.mu.Lock()
		s.responses--
		s.mu.Unlock()
	}()
	w.Header().Set("Content-Type", lease.mediaType)
	w.Header().Set("X-Content-Type-Options", "nosniff")
	w.Header().Set("Referrer-Policy", "no-referrer")
	w.Header().Set("Cache-Control", "no-store")
	w.Header().Set("Accept-Ranges", "bytes")
	size := lease.info.Size()
	content := r.Clone(r.Context())
	// Wails 2.13's Windows WebView adapter can buffer the entire HTTP
	// response. Only send one bounded chunk even when the browser asks for
	// "bytes=0-" or supplies conditional headers that could discard Range.
	content.Header = make(http.Header)
	if r.Method == http.MethodGet {
		byteRange, ok := boundedLocalVideoRange(r.Header.Values("Range"), size)
		if !ok {
			w.Header().Set("Content-Range", "bytes */"+strconv.FormatInt(size, 10))
			w.WriteHeader(http.StatusRequestedRangeNotSatisfiable)
			return
		}
		if byteRange != "" {
			content.Header.Set("Range", byteRange)
		}
	}
	reader := io.NewSectionReader(lease.file, 0, size)
	http.ServeContent(w, content, "", time.Time{}, reader)
}

func boundedLocalVideoRange(values []string, size int64) (string, bool) {
	if len(values) == 0 {
		// Native video loaders send a byte range. Never send a partial 200 OK
		// or allocate a whole large file for an unexpected unbounded request.
		return "", size <= maxLocalVideoChunk
	}
	if len(values) != 1 || !strings.HasPrefix(values[0], "bytes=") || strings.Contains(values[0], ",") {
		return "", false
	}
	first, last, ok := strings.Cut(strings.TrimPrefix(values[0], "bytes="), "-")
	if !ok {
		return "", false
	}
	var start int64
	end := size - 1
	if first == "" {
		suffix, err := strconv.ParseInt(last, 10, 64)
		if err != nil || suffix <= 0 {
			return "", false
		}
		start = size - min(size, min(suffix, maxLocalVideoChunk))
	} else {
		var err error
		start, err = strconv.ParseInt(first, 10, 64)
		if err != nil || start < 0 || start >= size {
			return "", false
		}
		if last != "" {
			limit, err := strconv.ParseInt(last, 10, 64)
			if err != nil || limit < start {
				return "", false
			}
			end = min(end, limit)
		}
		if end-start >= maxLocalVideoChunk {
			end = start + maxLocalVideoChunk - 1
		}
	}
	return "bytes=" + strconv.FormatInt(start, 10) + "-" + strconv.FormatInt(end, 10), true
}

func (s *localVideoState) revoke(address string) {
	s.mu.Lock()
	lease := s.leases[address]
	delete(s.leases, address)
	s.mu.Unlock()
	if lease != nil {
		lease.timer.Stop()
		_ = lease.file.Close()
	}
}

func (s *localVideoState) close() {
	s.mu.Lock()
	s.closed = true
	leases := s.leases
	s.leases, s.documents, s.selections = nil, nil, nil
	s.documentLRU, s.selectionLRU = nil, nil
	s.mu.Unlock()
	for _, lease := range leases {
		lease.timer.Stop()
		_ = lease.file.Close()
	}
}
