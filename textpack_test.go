package main

import (
	"archive/zip"
	"bytes"
	"encoding/base64"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"net/url"
	"os"
	"path/filepath"
	"strings"
	"sync/atomic"
	"testing"
)

func textPackTestDirectory(t *testing.T) string {
	t.Helper()
	directory, err := filepath.EvalSymlinks(t.TempDir())
	if err != nil {
		t.Fatal(err)
	}
	return directory
}
func textPackTestPNG(t *testing.T) []byte {
	t.Helper()
	data, err := base64.StdEncoding.DecodeString("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=")
	if err != nil {
		t.Fatal(err)
	}
	return data
}
func textPackTestWrite(t *testing.T, name string, data []byte) {
	t.Helper()
	if err := os.MkdirAll(filepath.Dir(name), 0o700); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(name, data, 0o600); err != nil {
		t.Fatal(err)
	}
}
func textPackTestZip(t *testing.T, files map[string][]byte) []byte {
	t.Helper()
	var buffer bytes.Buffer
	writer := zip.NewWriter(&buffer)
	for name, data := range files {
		entry, err := writer.Create(name)
		if err != nil {
			t.Fatal(err)
		}
		if _, err = entry.Write(data); err != nil {
			t.Fatal(err)
		}
	}
	if err := writer.Close(); err != nil {
		t.Fatal(err)
	}
	return buffer.Bytes()
}

func TestTextPackExportImportRoundTripPreservesOriginal(t *testing.T) {
	dir := textPackTestDirectory(t)
	png := textPackTestPNG(t)
	source := filepath.Join(dir, "source.md")
	original := "# 源文档\n\n![图](本地 图片.png)\n"
	textPackTestWrite(t, source, []byte(original))
	textPackTestWrite(t, filepath.Join(dir, "本地 图片.png"), png)
	content := "# 未保存的新内容\n\n![图](assets/image-001.png)\n"
	app := NewApp()
	data, result, err := app.buildTextPack(source, content, []TextPackImage{{Source: "本地%20图片.png", Target: "assets/image-001.png"}})
	if err != nil {
		t.Fatal(err)
	}
	if result.AssetCount != 1 || len(result.Warnings) != 0 {
		t.Fatalf("report: %+v", result)
	}
	pack := filepath.Join(dir, "example.textpack")
	if err = writeTextPackCopy(source, pack, data); err != nil {
		t.Fatal(err)
	}
	snapshot, err := readTextBundleSnapshot(pack)
	if err != nil {
		t.Fatal(err)
	}
	if snapshot.Content != content || !bytes.Equal(snapshot.Assets["assets/image-001.png"], png) {
		t.Fatal("round trip changed content")
	}
	destination, err := materializeTextBundle(dir, pack, snapshot.Revision, snapshot.Content, snapshot)
	if err != nil {
		t.Fatal(err)
	}
	if filepath.Base(destination) != "example.md" || filepath.Dir(destination) == dir {
		t.Fatal("not an ordinary fresh document")
	}
	if got, _ := os.ReadFile(filepath.Join(filepath.Dir(destination), "assets", "image-001.png")); !bytes.Equal(got, png) {
		t.Fatal("image missing")
	}
	textPackTestWrite(t, destination, []byte("Edited imported document"))
	if got, _ := os.ReadFile(pack); !bytes.Equal(got, data) {
		t.Fatal("original package changed")
	}
	if got, _ := os.ReadFile(source); string(got) != original {
		t.Fatal("source document changed")
	}
	if got, _ := os.ReadFile(filepath.Join(dir, "本地 图片.png")); !bytes.Equal(got, png) {
		t.Fatal("source image changed")
	}
	second, err := materializeTextBundle(dir, pack, snapshot.Revision, snapshot.Content, snapshot)
	if err != nil {
		t.Fatal(err)
	}
	if second == destination {
		t.Fatal("import reused existing directory")
	}
}

func TestTextPackEmbeddedImagesAndNeverCertifiesOffline(t *testing.T) {
	png := textPackTestPNG(t)
	ref := "data:image/png;base64," + base64.StdEncoding.EncodeToString(png)
	app := NewApp()
	data, result, err := app.buildTextPack(filepath.Join(textPackTestDirectory(t), "source.md"), "![img](assets/image-001.png)\n![online](https://example.invalid/a.png)", []TextPackImage{{Source: ref, Target: "assets/image-001.png"}})
	if err != nil {
		t.Fatal(err)
	}
	if result.AssetCount != 1 {
		t.Fatal(result)
	}
	reader, err := zip.NewReader(bytes.NewReader(data), int64(len(data)))
	if err != nil {
		t.Fatal(err)
	}
	for _, entry := range reader.File {
		if entry.Name != "info.json" {
			continue
		}
		f, err := entry.Open()
		if err != nil {
			t.Fatal(err)
		}
		var metadata map[string]json.RawMessage
		err = json.NewDecoder(f).Decode(&metadata)
		f.Close()
		if err != nil {
			t.Fatal(err)
		}
		var own struct {
			OfflineComplete bool `json:"offlineComplete"`
			AssetCount      int  `json:"assetCount"`
		}
		if err = json.Unmarshal(metadata["cn.ssssa.quillite-markdown"], &own); err != nil {
			t.Fatal(err)
		}
		if own.OfflineComplete || own.AssetCount != 1 {
			t.Fatal("invalid offline claim")
		}
	}
	if bytes.Contains(data, []byte("source.md")) {
		t.Fatal("local path leaked into archive metadata")
	}
}

func TestTextPackMissingUnsupportedAndRemoteNeverDownload(t *testing.T) {
	var requests atomic.Int32
	server := httptest.NewServer(http.HandlerFunc(func(http.ResponseWriter, *http.Request) { requests.Add(1) }))
	defer server.Close()
	dir := textPackTestDirectory(t)
	textPackTestWrite(t, filepath.Join(dir, "not-image.png"), []byte("not an image"))
	images := []TextPackImage{{Source: "missing.png", Target: "assets/image-001.png"}, {Source: "not-image.png", Target: "assets/image-002.png"}, {Source: server.URL + "/network.png", Target: "assets/image-003.png"}}
	_, report, err := NewApp().buildTextPack(filepath.Join(dir, "source.md"), "unchanged remote links", images)
	if err != nil {
		t.Fatal(err)
	}
	if requests.Load() != 0 || report.AssetCount != 0 || len(report.Warnings) != 3 {
		t.Fatalf("report %+v requests %d", report, requests.Load())
	}
	for i, code := range []string{"MISSING_IMAGE", "UNSUPPORTED_IMAGE", "UNSAFE_REFERENCE"} {
		if report.Warnings[i].Code != code {
			t.Fatalf("warning %d: %+v", i, report.Warnings[i])
		}
	}
}

func TestTextPackImportVersionOneDirectoryAndWrappedVersionTwo(t *testing.T) {
	dir := textPackTestDirectory(t)
	bundle := filepath.Join(dir, "文档.textbundle")
	png := textPackTestPNG(t)
	files := map[string][]byte{"info.json": []byte(`{"version":1}`), "text.markdown": []byte("# 目录形式\n![图](assets/sub/img.png)"), "assets/sub/img.png": png}
	for name, data := range files {
		textPackTestWrite(t, filepath.Join(bundle, filepath.FromSlash(name)), data)
	}
	snapshot, err := readTextBundleSnapshot(bundle)
	if err != nil {
		t.Fatal(err)
	}
	if len(snapshot.Assets) != 1 || snapshot.Content != string(files["text.markdown"]) {
		t.Fatal("directory import differs")
	}
	wrapped := map[string][]byte{}
	for name, data := range files {
		wrapped["Example.textbundle/"+name] = data
	}
	wrapped["Example.textbundle/info.json"] = []byte(`{"version":2,"type":"net.daringfireball.markdown","transient":false}`)
	pack := filepath.Join(dir, "wrapped.textpack")
	textPackTestWrite(t, pack, textPackTestZip(t, wrapped))
	snapshot, err = readTextBundleSnapshot(pack)
	if err != nil {
		t.Fatal(err)
	}
	if !bytes.Equal(snapshot.Assets["assets/sub/img.png"], png) {
		t.Fatal("wrapped asset missing")
	}
}

func TestTextPackSVGPreservedButNotCertified(t *testing.T) {
	dir := textPackTestDirectory(t)
	svg := []byte(`<svg xmlns="http://www.w3.org/2000/svg"><image href="https://example.invalid/x.png"/></svg>`)
	textPackTestWrite(t, filepath.Join(dir, "image.svg"), svg)
	data, report, err := NewApp().buildTextPack(filepath.Join(dir, "source.md"), "![image](assets/image-001.svg)", []TextPackImage{{Source: "image.svg", Target: "assets/image-001.svg"}})
	if err != nil {
		t.Fatal(err)
	}
	if report.AssetCount != 1 || len(report.Warnings) != 1 || report.Warnings[0].Code != "EXTERNAL_RESOURCES" {
		t.Fatal(report)
	}
	pack := filepath.Join(dir, "svg.textpack")
	textPackTestWrite(t, pack, data)
	snapshot, err := readTextBundleSnapshot(pack)
	if err != nil {
		t.Fatal(err)
	}
	if len(snapshot.Warnings) != 1 || !bytes.Equal(snapshot.Assets["assets/image-001.svg"], svg) {
		t.Fatal("svg omitted or certified")
	}
}

func TestTextPackFileURLDecodedExactlyOnce(t *testing.T) {
	dir := textPackTestDirectory(t)
	for _, name := range []string{"literal%20name.png", "中文 空格.png", "photo#1.png", "photo%.png"} {
		t.Run(name, func(t *testing.T) {
			source := filepath.Join(dir, name)
			textPackTestWrite(t, source, textPackTestPNG(t))
			urlPath := filepath.ToSlash(source)
			if !strings.HasPrefix(urlPath, "/") {
				urlPath = "/" + urlPath
			}
			reference := (&url.URL{Scheme: "file", Path: urlPath}).String()
			resolved, err := textPackLocalImagePath(reference, dir)
			if err != nil {
				t.Fatal(err)
			}
			if resolved != source {
				t.Fatalf("decoded incorrectly: %q instead of %q", resolved, source)
			}
			data, kind, err := NewApp().readTextPackImage(reference, dir)
			if err != nil || len(data) == 0 || kind != "image/png" {
				t.Fatalf("file url failed %s %v", kind, err)
			}
		})
	}
}

func TestTextPackImportNameAndCompression(t *testing.T) {
	for _, test := range []struct{ source, want string }{{"中文图片.textpack", "中文图片"}, {"CON.textbundle", "Imported"}, {"normal.textpack", "normal"}, {".textpack", "Imported"}} {
		if got := textPackImportName(test.source); got != test.want {
			t.Fatalf("%q name %q", test.source, got)
		}
	}
	content := strings.Repeat("This is a repeated Markdown paragraph.\n\n", 10000)
	data, _, err := NewApp().buildTextPack(filepath.Join(textPackTestDirectory(t), "source.md"), content, nil)
	if err != nil {
		t.Fatal(err)
	}
	if len(data) > len(content)/2 {
		t.Fatal("Markdown text was not compressed")
	}
	pack := filepath.Join(textPackTestDirectory(t), "compressed.textpack")
	textPackTestWrite(t, pack, data)
	snapshot, err := readTextBundleSnapshot(pack)
	if err != nil || snapshot.Content != content {
		t.Fatalf("legitimate high-compression text rejected: %v", err)
	}
}

func TestTextPackWarningDoesNotEchoDataURI(t *testing.T) {
	warning := textPackWarning("UNSUPPORTED_IMAGE", "data:image/png;base64,"+strings.Repeat("A", 1024))
	if warning.Reference != "[embedded image]" {
		t.Fatal("embedded data echoed")
	}
	warning = textPackWarning("MISSING_IMAGE", strings.Repeat("中", 1000))
	if len([]rune(warning.Reference)) > 181 {
		t.Fatal("warning unbounded")
	}
}
