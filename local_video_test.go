package main

import (
	"bytes"
	"context"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/http/httptest"
	"net/url"
	"os"
	"path/filepath"
	"regexp"
	"strings"
	"testing"
	"time"
)

var testMP4Header = []byte{0, 0, 0, 20, 'f', 't', 'y', 'p', 'i', 's', 'o', 'm', 0, 0, 0, 0, 'm', 'p', '4', '2'}
var testWebMHeader = []byte{0x1a, 0x45, 0xdf, 0xa3, 0x87, 0x42, 0x82, 0x84, 'w', 'e', 'b', 'm', 0x18, 0x53, 0x80, 0x67, 0xff, 0xec, 0x80}

func localVideoFixture(t *testing.T) (*App, string, string) {
	t.Helper()
	a := NewApp()
	t.Cleanup(func() { a.shutdownLocalVideo(context.Background()) })
	folder, err := filepath.EvalSymlinks(t.TempDir())
	if err != nil {
		t.Fatal(err)
	}
	doc := filepath.Join(folder, "test.md")
	if err := os.WriteFile(doc, []byte("# Video"), 0o600); err != nil {
		t.Fatal(err)
	}
	// Production registers only after a successful conventional Markdown read.
	if _, err := a.readDocument(doc, false); err != nil {
		t.Fatal(err)
	}
	return a, doc, folder
}

func makeTestMP4(t *testing.T, path string, size int64) {
	t.Helper()
	file, err := os.Create(path)
	if err != nil {
		t.Fatal(err)
	}
	defer file.Close()
	if _, err := file.Write(testMP4Header); err != nil {
		t.Fatal(err)
	}
	if size > int64(len(testMP4Header))+4 {
		if _, err := file.WriteAt([]byte("TAIL"), size-4); err != nil {
			t.Fatal(err)
		}
	}
}

func fetchLocalVideo(t *testing.T, method, uri, byteRange, host string) (*http.Response, []byte) {
	t.Helper()
	req, err := http.NewRequest(method, uri, nil)
	if err != nil {
		t.Fatal(err)
	}
	if byteRange != "" {
		req.Header.Set("Range", byteRange)
	}
	if host != "" {
		req.Host = host
	}
	client := http.Client{Timeout: 5 * time.Second, Transport: &http.Transport{Proxy: nil}}
	defer client.CloseIdleConnections()
	resp, err := client.Do(req)
	if err != nil {
		t.Fatal(err)
	}
	defer resp.Body.Close()
	body, err := io.ReadAll(io.LimitReader(resp.Body, 64*1024+1))
	if err != nil {
		t.Fatal(err)
	}
	return resp, body
}

func TestLocalVideoSeekLargeFileWithRevocablePrivatePath(t *testing.T) {
	a, doc, folder := localVideoFixture(t)
	const size = 128 * 1024 * 1024
	makeTestMP4(t, filepath.Join(folder, "教程 100%.mp4"), size)
	privatePath, err := a.BeginLocalVideo(doc, videoURLReference("教程 100%.mp4"))
	if err != nil {
		t.Fatal(err)
	}
	u, err := url.Parse(privatePath)
	if err != nil || u.IsAbs() || u.Host != "" || !regexp.MustCompile(`^/__quillite_video/[a-f0-9]{64}\.mp4$`).MatchString(u.Path) {
		t.Fatalf("not an opaque same-origin URL: %s %v", privatePath, err)
	}
	server := httptest.NewServer(a.localVideoMiddleware(http.NotFoundHandler()))
	defer server.Close()
	address := server.URL + privatePath
	resp, payload := fetchLocalVideo(t, http.MethodHead, address, "", "")
	if resp.StatusCode != http.StatusOK || resp.ContentLength != size || len(payload) != 0 ||
		resp.Header.Get("Content-Type") != "video/mp4" || resp.Header.Get("Accept-Ranges") != "bytes" ||
		resp.Header.Get("Cache-Control") != "no-store" || resp.Header.Get("Access-Control-Allow-Origin") != "" {
		t.Fatalf("bad HEAD response: %d %d %s, bytes=%d", resp.StatusCode, resp.ContentLength, resp.Header, len(payload))
	}
	resp, payload = fetchLocalVideo(t, http.MethodGet, address, "bytes=0-19", "")
	if resp.StatusCode != http.StatusPartialContent || !bytes.Equal(payload, testMP4Header) {
		t.Fatalf("header segment %d %q", resp.StatusCode, payload)
	}
	resp, _ = fetchLocalVideo(t, http.MethodGet, address, "bytes=0-", "")
	if resp.StatusCode != http.StatusPartialContent || resp.ContentLength != maxLocalVideoChunk ||
		resp.Header.Get("Content-Range") != fmt.Sprintf("bytes 0-%d/%d", maxLocalVideoChunk-1, size) {
		t.Fatalf("open-ended request was not truncated: %d %d %s", resp.StatusCode, resp.ContentLength, resp.Header)
	}
	resp, payload = fetchLocalVideo(t, http.MethodGet, address, fmt.Sprintf("bytes=%d-", size-4), "")
	if resp.StatusCode != http.StatusPartialContent || string(payload) != "TAIL" ||
		resp.Header.Get("Content-Range") != fmt.Sprintf("bytes %d-%d/%d", size-4, size-1, size) {
		t.Fatalf("late seek: %d %s %q", resp.StatusCode, resp.Header, payload)
	}
	for _, input := range []struct {
		method, uri, byteRange, host string
		want                         int
	}{
		{http.MethodPost, address, "", "", http.StatusMethodNotAllowed},
		{http.MethodGet, address, "bytes=0-1,5-8", "", http.StatusRequestedRangeNotSatisfiable},
		{http.MethodGet, address, fmt.Sprintf("bytes=%d-", size), "", http.StatusRequestedRangeNotSatisfiable},
		{http.MethodGet, address, "", "", http.StatusRequestedRangeNotSatisfiable},
		{http.MethodGet, address + "?x=1", "bytes=0-19", "", http.StatusNotFound},
		{http.MethodGet, server.URL + localVideoPrefix + strings.Repeat("0", 64) + ".mp4", "", "", http.StatusNotFound},
	} {
		resp, _ = fetchLocalVideo(t, input.method, input.uri, input.byteRange, input.host)
		if resp.StatusCode != input.want {
			t.Errorf("%s %s range %q host %q: got %d, want %d", input.method, input.uri, input.byteRange, input.host, resp.StatusCode, input.want)
		}
	}
	a.EndLocalVideo(privatePath)
	resp, _ = fetchLocalVideo(t, http.MethodGet, address, "", "")
	if resp.StatusCode != http.StatusNotFound {
		t.Fatalf("revoked URL still readable: %d", resp.StatusCode)
	}

	second, err := a.BeginLocalVideo(doc, videoURLReference("教程 100%.mp4"))
	if err != nil {
		t.Fatal(err)
	}
	a.shutdownLocalVideo(context.Background())
	resp, _ = fetchLocalVideo(t, http.MethodGet, server.URL+second, "bytes=0-19", "")
	if resp.StatusCode != http.StatusNotFound {
		t.Fatalf("second token survived shutdown: %d", resp.StatusCode)
	}
}

func TestLocalWebMContainerAndCapability(t *testing.T) {
	a, doc, folder := localVideoFixture(t)
	const size = 4 * 1024 * 1024
	filename := filepath.Join(folder, "视频 100%.WEBM")
	file, err := os.Create(filename)
	if err != nil {
		t.Fatal(err)
	}
	if _, err := file.Write(testWebMHeader); err != nil {
		_ = file.Close()
		t.Fatal(err)
	}
	_, err = file.WriteAt([]byte("TAIL"), size-4)
	closeErr := file.Close()
	if err != nil || closeErr != nil {
		t.Fatalf("writing fixture: %v; closing: %v", err, closeErr)
	}
	selected, err := a.DescribeDroppedLocalVideo(doc, filename)
	if err != nil || selected.External || selected.Reference != videoURLReference(filepath.Base(filename)) || selected.Size != size {
		t.Fatalf("WebM drop: %+v %v", selected, err)
	}
	privatePath, err := a.BeginLocalVideo(doc, selected.Reference)
	if err != nil || !regexp.MustCompile(`^/__quillite_video/[a-f0-9]{64}\.webm$`).MatchString(privatePath) {
		t.Fatalf("WebM stream failed: %q %v", privatePath, err)
	}
	server := httptest.NewServer(a.localVideoMiddleware(http.NotFoundHandler()))
	defer server.Close()
	address := server.URL + privatePath
	changedSuffix := strings.TrimSuffix(privatePath, ".webm") + ".mp4"
	resp, _ := fetchLocalVideo(t, http.MethodHead, server.URL+changedSuffix, "", "")
	if resp.StatusCode != http.StatusNotFound {
		t.Fatalf("wrong suffix accepted: %d", resp.StatusCode)
	}
	// EndLocalVideo must also require the actual capability address.
	a.EndLocalVideo(changedSuffix)
	resp, payload := fetchLocalVideo(t, http.MethodHead, address, "", "")
	if resp.StatusCode != http.StatusOK || resp.ContentLength != size || len(payload) != 0 ||
		resp.Header.Get("Content-Type") != "video/webm" || resp.Header.Get("Accept-Ranges") != "bytes" ||
		resp.Header.Get("X-Content-Type-Options") != "nosniff" || resp.Header.Get("Cache-Control") != "no-store" {
		t.Fatalf("WebM HEAD: %d, %d, %s", resp.StatusCode, resp.ContentLength, resp.Header)
	}
	resp, _ = fetchLocalVideo(t, http.MethodGet, address, "bytes=0-", "")
	if resp.StatusCode != http.StatusPartialContent || resp.ContentLength != maxLocalVideoChunk {
		t.Fatalf("WebM unbounded range exceeded limit: %d %d", resp.StatusCode, resp.ContentLength)
	}
	resp, payload = fetchLocalVideo(t, http.MethodGet, address, fmt.Sprintf("bytes=%d-", size-4), "")
	if resp.StatusCode != http.StatusPartialContent || !bytes.Equal(payload, []byte("TAIL")) {
		t.Fatalf("WebM distant seek: %d %q", resp.StatusCode, payload)
	}
	a.EndLocalVideo(privatePath)
	resp, _ = fetchLocalVideo(t, http.MethodGet, address, "bytes=0-1", "")
	if resp.StatusCode != http.StatusNotFound {
		t.Fatalf("WebM capability survived revocation: %d", resp.StatusCode)
	}
}

func TestLocalWebMRejectsMislabeledAndMalformedMedia(t *testing.T) {
	a, doc, folder := localVideoFixture(t)
	wrong := []struct {
		name string
		data []byte
	}{
		{"wrong.webm", testMP4Header},
		{"wrong.mp4", testWebMHeader},
		{"wrong.mov", testMP4Header},
		{"truncated.webm", testWebMHeader[:15]},
		{"matroska.webm", bytes.Join([][]byte{{0x1a, 0x45, 0xdf, 0xa3, 0x8b, 0x42, 0x82, 0x88}, []byte("matroska"), testWebMHeader[12:]}, nil)},
		{"webm-in-padding.webm", bytes.Join([][]byte{{0x1a, 0x45, 0xdf, 0xa3, 0x86, 0xec, 0x84}, []byte("webm"), testWebMHeader[12:]}, nil)},
		{"repeated-doctype.webm", bytes.Join([][]byte{{0x1a, 0x45, 0xdf, 0xa3, 0x8e}, testWebMHeader[5:12], testWebMHeader[5:]}, nil)},
		{"unknown-header-length.webm", bytes.Join([][]byte{testWebMHeader[:4], {0xff}, testWebMHeader[5:]}, nil)},
		{"unknown-child-length.webm", bytes.Join([][]byte{testWebMHeader[:7], {0xff}, testWebMHeader[8:]}, nil)},
	}
	for _, input := range wrong {
		if err := os.WriteFile(filepath.Join(folder, input.name), input.data, 0o600); err != nil {
			t.Fatal(err)
		}
		if _, err := a.BeginLocalVideo(doc, input.name); !errors.Is(err, errVideoFormat) {
			t.Errorf("unsupported video %q was not rejected as format error: %v", input.name, err)
		}
	}
}

func TestLocalWebMExternalSelectionCopyKeepsSuffix(t *testing.T) {
	a, doc, folder := localVideoFixture(t)
	outbound, err := filepath.EvalSymlinks(t.TempDir())
	if err != nil {
		t.Fatal(err)
	}
	source := filepath.Join(outbound, "video.WEBM")
	if err := os.WriteFile(source, testWebMHeader, 0o600); err != nil {
		t.Fatal(err)
	}
	if _, err := a.BeginLocalVideo(doc, videoURLReference(source)); !errors.Is(err, errVideoAccess) {
		t.Fatalf("unapproved WebM read: %v", err)
	}
	selected, err := a.localVideoSelection(doc, source, true)
	if err != nil || !selected.External {
		t.Fatalf("explicit WebM selection: %+v %v", selected, err)
	}
	assets := filepath.Join(folder, "assets")
	if err := os.Mkdir(assets, 0o700); err != nil {
		t.Fatal(err)
	}
	destination := filepath.Join(assets, "video.WEBM")
	existing := []byte("existing asset")
	if err := os.WriteFile(destination, existing, 0o600); err != nil {
		t.Fatal(err)
	}
	saved, err := a.CopyLocalVideoToAssets(doc, selected.Reference)
	if err != nil || !strings.HasPrefix(saved, "assets/video-") || !strings.HasSuffix(saved, ".WEBM") {
		t.Fatalf("copy did not keep format after a duplicate: %q %v", saved, err)
	}
	for path, expected := range map[string][]byte{source: testWebMHeader, destination: existing, filepath.Join(folder, filepath.FromSlash(saved)): testWebMHeader} {
		got, err := os.ReadFile(path)
		if err != nil || !bytes.Equal(got, expected) {
			t.Errorf("copy altered file %q: %q %v", path, got, err)
		}
	}
}

func TestLocalVideoScopeAndNativeSelection(t *testing.T) {
	a, doc, folder := localVideoFixture(t)
	outside, err := filepath.EvalSymlinks(t.TempDir())
	if err != nil {
		t.Fatal(err)
	}
	location := filepath.Join(outside, "same.mp4")
	makeTestMP4(t, location, 0)
	inside := filepath.Join(folder, "same.mp4")
	makeTestMP4(t, inside, 0)
	notMP4 := filepath.Join(folder, "wrong.mp4")
	if err := os.WriteFile(notMP4, []byte("not a movie"), 0o600); err != nil {
		t.Fatal(err)
	}
	if _, err := a.BeginLocalVideo(doc, "wrong.mp4"); !errors.Is(err, errVideoFormat) {
		t.Fatalf("non-media accepted: %v", err)
	}
	if _, err := a.BeginLocalVideo(doc, "missing.mp4"); !errors.Is(err, errVideoMissing) {
		t.Fatalf("missing resource not distinguished: %v", err)
	}
	other := filepath.Join(folder, "unopened.md")
	if err := os.WriteFile(other, []byte("# Unopened"), 0o600); err != nil {
		t.Fatal(err)
	}
	if _, err := a.BeginLocalVideo(other, "same.mp4"); !errors.Is(err, errVideoDocument) {
		t.Fatalf("unopened document accepted: %v", err)
	}
	if _, err := a.BeginLocalVideo(doc, videoURLReference(location)); !errors.Is(err, errVideoAccess) {
		t.Fatalf("outside file silently authorized: %v", err)
	}
	for _, ref := range []string{"../same.mp4", "./ignored/%2e%2e/same.mp4", "%2F%2Fno-network/same.mp4", "file://remote/same.mp4", "https://example.test/same.mp4", "same.mp4:alt"} {
		if _, err := a.BeginLocalVideo(doc, ref); !errors.Is(err, errVideoPath) {
			t.Errorf("accepted unsafe path %q: %v", ref, err)
		}
	}
	inScope, err := a.localVideoSelection(doc, inside, false)
	if err != nil || inScope.External || inScope.Reference != "same.mp4" {
		t.Fatalf("ordinary drop: %+v %v", inScope, err)
	}
	if _, err := a.localVideoSelection(doc, location, false); !errors.Is(err, errVideoAccess) {
		t.Fatalf("renderer path granted outside access without consent: %v", err)
	}
	selected, err := a.localVideoSelection(doc, location, true)
	if err != nil || !selected.External || selected.Reference != videoURLReference(location) {
		t.Fatalf("native selection: %+v %v", selected, err)
	}
	if _, err := a.readDocument(other, false); err != nil {
		t.Fatal(err)
	}
	if _, err := a.BeginLocalVideo(other, selected.Reference); !errors.Is(err, errVideoAccess) {
		t.Fatalf("outside scope carried to another document: %v", err)
	}
	address, err := a.BeginLocalVideo(doc, selected.Reference)
	if err != nil {
		t.Fatal(err)
	}
	a.EndLocalVideo(address)
	// Changing the filename's underlying object must require selecting it again.
	if err := os.Rename(location, filepath.Join(outside, "original.mp4")); err != nil {
		t.Fatal(err)
	}
	makeTestMP4(t, location, 0)
	if _, err := a.BeginLocalVideo(doc, selected.Reference); !errors.Is(err, errVideoAccess) {
		t.Fatalf("same pathname authorized a different file: %v", err)
	}
	// Symlink creation can require Windows developer mode; all other
	// authorization assertions above run even without it.
	link := filepath.Join(folder, "symlink.mp4")
	if err := os.Symlink(location, link); err == nil {
		if _, err := a.BeginLocalVideo(doc, "symlink.mp4"); !errors.Is(err, errVideoAccess) {
			t.Fatalf("symlink read not denied: %v", err)
		}
	}
}

func TestLocalVideoCopyCreatesOnlyAndPreservesSource(t *testing.T) {
	a, doc, folder := localVideoFixture(t)
	source := filepath.Join(folder, "clip.mp4")
	makeTestMP4(t, source, 280)
	assets := filepath.Join(folder, "assets")
	if err := os.Mkdir(assets, 0o700); err != nil {
		t.Fatal(err)
	}
	collision := filepath.Join(assets, "clip.mp4")
	original := []byte("already owned by somebody else")
	if err := os.WriteFile(collision, original, 0o600); err != nil {
		t.Fatal(err)
	}
	saved, err := a.CopyLocalVideoToAssets(doc, "clip.mp4")
	if err != nil || saved == "assets/clip.mp4" || !strings.HasPrefix(saved, "assets/clip-") {
		t.Fatalf("copy did not use a create-only name: %q %v", saved, err)
	}
	fileBytes, err := os.ReadFile(collision)
	if err != nil || !bytes.Equal(fileBytes, original) {
		t.Fatalf("copy changed the existing target: %q %v", fileBytes, err)
	}
	from, _ := os.ReadFile(source)
	to, err := os.ReadFile(filepath.Join(folder, filepath.FromSlash(saved)))
	if err != nil || !bytes.Equal(to, from) || len(to) != 280 {
		t.Fatalf("copy lost data or changed source: %v", err)
	}
	same, err := a.CopyLocalVideoToAssets(doc, saved)
	if err != nil || same != saved {
		t.Fatalf("asset was copied again: %q (%v)", same, err)
	}
	bundle := filepath.Join(folder, "restricted.textbundle")
	if err := os.Mkdir(bundle, 0o700); err != nil {
		t.Fatal(err)
	}
	makeTestMP4(t, filepath.Join(bundle, "clip.mp4"), 0)
	if _, err := a.BeginLocalVideo(doc, "restricted.textbundle/clip.mp4"); !errors.Is(err, errVideoDocument) {
		t.Fatalf("ordinary path could read a package resource: %v", err)
	}
}

func TestLocalVideoDeniesManagedWorkspaceThroughDocumentAlias(t *testing.T) {
	a, ordinary, folder := localVideoFixture(t)
	a.preferencesOverride = filepath.Join(folder, "config", "preferences.json")
	work := filepath.Join(a.bundleWorkspaceRoot(), strings.Repeat("a", 32), "work")
	if err := os.MkdirAll(work, 0o700); err != nil {
		t.Fatal(err)
	}
	protectedDoc := filepath.Join(work, "paper.md")
	if err := os.WriteFile(protectedDoc, []byte("# Managed document"), 0o600); err != nil {
		t.Fatal(err)
	}
	protectedVideo := filepath.Join(work, "clip.mp4")
	makeTestMP4(t, protectedVideo, 0)
	if !a.localVideoInManagedWorkspace(work) || !a.localVideoInManagedWorkspace(protectedVideo) {
		t.Fatal("managed directories and their members must both be denied")
	}
	// Neither contained paths nor an explicit picker can use the managed
	// workspace in MVP mode, even though the ordinary doc's directory includes it.
	rel, err := filepath.Rel(folder, protectedVideo)
	if err != nil {
		t.Fatal(err)
	}
	if _, err := a.BeginLocalVideo(ordinary, videoURLReference(rel)); !errors.Is(err, errVideoDocument) {
		t.Fatalf("nested managed workspace video accepted: %v", err)
	}
	a.rememberLocalVideoDocument(protectedDoc)
	if _, _, err := a.localVideoDocument(protectedDoc); !errors.Is(err, errVideoDocument) {
		t.Fatalf("managed document acquired ordinary scope: %v", err)
	}
	alias := filepath.Join(folder, "alias")
	if err := os.Symlink(work, alias); err == nil {
		aliasedDoc := filepath.Join(alias, "paper.md")
		a.rememberLocalVideoDocument(aliasedDoc)
		if _, _, err := a.localVideoDocument(aliasedDoc); !errors.Is(err, errVideoDocument) {
			t.Fatalf("managed document acquired scope through directory alias: %v", err)
		}
	}
}
