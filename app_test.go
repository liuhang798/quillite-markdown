package main

import (
	"bytes"
	"context"
	"crypto/sha256"
	"encoding/base64"
	"encoding/binary"
	"encoding/json"
	"errors"
	"fmt"
	"image"
	"image/png"
	"io"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"reflect"
	"strings"
	"syscall"
	"testing"
	"time"

	"github.com/wailsapp/wails/v2/pkg/menu/keys"
	"github.com/wailsapp/wails/v2/pkg/options"
)

func TestDocumentAccessDeniedRecoveryIsLimitedToMacOSPermissions(t *testing.T) {
	permissionError := fmt.Errorf("open document: %w", &os.PathError{Op: "open", Path: "/Users/demo/Documents/guide.md", Err: syscall.EPERM})
	if !isDocumentAccessDenied("darwin", permissionError) {
		t.Fatal("macOS permission error should request user-authorized recovery")
	}
	if isDocumentAccessDenied("windows", permissionError) || isDocumentAccessDenied("linux", permissionError) {
		t.Fatal("non-macOS permission errors must not open an unexpected file picker")
	}
	if isDocumentAccessDenied("darwin", os.ErrNotExist) {
		t.Fatal("missing files must stay on the missing-file path")
	}
}

func TestMigrateLegacyPreferencesFilePreservesExistingSettings(t *testing.T) {
	root := t.TempDir()
	legacyPath := filepath.Join(root, legacyAppNameZH, "preferences.json")
	newPath := filepath.Join(root, appNameZH, "preferences.json")
	legacyData := []byte(`{"language":"en","recentFiles":["C:\\notes\\guide.md"]}`)
	if err := os.MkdirAll(filepath.Dir(legacyPath), 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(legacyPath, legacyData, 0o644); err != nil {
		t.Fatal(err)
	}
	if err := migrateLegacyPreferencesFile(newPath, []string{legacyPath}); err != nil {
		t.Fatal(err)
	}
	migrated, err := os.ReadFile(newPath)
	if err != nil {
		t.Fatal(err)
	}
	if !bytes.Equal(migrated, legacyData) {
		t.Fatalf("migrated preferences = %q, want %q", migrated, legacyData)
	}

	existing := []byte(`{"language":"zh-CN"}`)
	if err := os.WriteFile(newPath, existing, 0o644); err != nil {
		t.Fatal(err)
	}
	if err := migrateLegacyPreferencesFile(newPath, []string{legacyPath}); err != nil {
		t.Fatal(err)
	}
	unchanged, _ := os.ReadFile(newPath)
	if !bytes.Equal(unchanged, existing) {
		t.Fatal("an existing new-brand preference file must never be overwritten")
	}
}

func TestLegacyPreferencesWithoutPinnedRecentsRemainCompatible(t *testing.T) {
	app := testApp(t)
	legacyData := []byte(`{"recentFiles":[],"favoriteFiles":[],"language":"en","usageAnalytics":true}`)
	if err := os.WriteFile(app.preferencePath(), legacyData, 0o644); err != nil {
		t.Fatal(err)
	}
	prefs, err := app.GetPreferences()
	if err != nil {
		t.Fatal(err)
	}
	if prefs.PinnedRecentFiles == nil || len(prefs.PinnedRecentFiles) != 0 {
		t.Fatalf("legacy preferences did not receive an empty pinned recent default: %#v", prefs.PinnedRecentFiles)
	}
}

func TestCreateNewMarkdownFileUsesFirstWritableDirectory(t *testing.T) {
	first := filepath.Join(t.TempDir(), "install")
	fallback := filepath.Join(t.TempDir(), "documents")
	now := time.Date(2026, 7, 21, 12, 34, 56, 0, time.Local)
	filePath, err := createNewMarkdownFile([]string{first, fallback}, "New document", now)
	if err != nil {
		t.Fatal(err)
	}
	if filepath.Dir(filePath) != first {
		t.Fatalf("created document in %q, want %q", filepath.Dir(filePath), first)
	}
	if filepath.Base(filePath) != "New document-20260721-123456.md" {
		t.Fatalf("unexpected generated name: %q", filepath.Base(filePath))
	}

	secondPath, err := createNewMarkdownFile([]string{first}, "New document", now)
	if err != nil {
		t.Fatal(err)
	}
	if filepath.Base(secondPath) != "New document-20260721-123456-2.md" {
		t.Fatalf("collision did not get a unique suffix: %q", filepath.Base(secondPath))
	}
}

func TestCanEditFileChecksExistingWritableDocuments(t *testing.T) {
	filePath := filepath.Join(t.TempDir(), "editable.md")
	if err := os.WriteFile(filePath, []byte("# Editable"), 0o644); err != nil {
		t.Fatal(err)
	}
	if !canEditFile(filePath) {
		t.Fatal("a normal writable document should be editable")
	}
	if canEditFile(filepath.Join(t.TempDir(), "missing.md")) {
		t.Fatal("a missing document must not be reported as editable")
	}
	if canEditFile(filepath.Dir(filePath)) {
		t.Fatal("a directory must not be reported as an editable document")
	}

	if err := os.Chmod(filePath, 0o444); err != nil {
		t.Fatal(err)
	}
	defer os.Chmod(filePath, 0o644)
	if canEditFile(filePath) {
		t.Skip("the current elevated user or filesystem can still write a read-only file")
	}
}

func TestMacNewDocumentsNeverUseTheReplaceableApplicationBundle(t *testing.T) {
	executable := filepath.Join(string(filepath.Separator), "Applications", "轻阅 Markdown.app", "Contents", "MacOS", "QuilliteMarkdown")
	home := filepath.Join(string(filepath.Separator), "Users", "reader")
	config := filepath.Join(home, "Library", "Application Support")

	directories := newDocumentDirectories("darwin", executable, home, config)
	want := []string{
		filepath.Join(home, "Documents", appNameEN),
		filepath.Join(config, appNameEN, "Documents"),
	}
	if !reflect.DeepEqual(directories, want) {
		t.Fatalf("macOS document directories = %#v, want %#v", directories, want)
	}
	for _, directory := range directories {
		if strings.Contains(filepath.ToSlash(directory), ".app/Contents/") {
			t.Fatalf("macOS user document would be stored inside the application bundle: %q", directory)
		}
	}
}

func TestOtherPlatformsRetainPortableExecutableDirectoryPreference(t *testing.T) {
	executable := filepath.Join(string(filepath.Separator), "opt", "md-reader", "QuilliteMarkdown")
	home := filepath.Join(string(filepath.Separator), "Users", "reader")
	config := filepath.Join(home, ".config")

	for _, platform := range []string{"windows", "linux"} {
		directories := newDocumentDirectories(platform, executable, home, config)
		if len(directories) != 3 || directories[0] != filepath.Dir(executable) {
			t.Fatalf("%s portable directory preference changed: %#v", platform, directories)
		}
	}
}

func TestRecoveredMacDraftReferencesMoveToTheSafeDocumentsDirectory(t *testing.T) {
	app := testApp(t)
	home := t.TempDir()
	legacyPath := filepath.Join(string(filepath.Separator), "Applications", "轻阅 Markdown.app", "Contents", "MacOS", "新建文档-20260808-211433.md")
	recoveredPath := filepath.Join(home, "Documents", appNameEN, filepath.Base(legacyPath))
	if err := os.MkdirAll(filepath.Dir(recoveredPath), 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(recoveredPath, []byte("recovered"), 0o644); err != nil {
		t.Fatal(err)
	}
	if _, err := app.updatePreferences(func(prefs *Preferences) {
		prefs.RecentFiles = []string{legacyPath}
		prefs.PinnedRecentFiles = []string{legacyPath}
		prefs.DraftFiles = []string{legacyPath}
		prefs.LastFile = legacyPath
	}); err != nil {
		t.Fatal(err)
	}
	prefs, err := app.readPreferences()
	if err != nil {
		t.Fatal(err)
	}
	prefs = app.migrateLegacyBundledDraftReferences("darwin", home, prefs)
	if !reflect.DeepEqual(prefs.RecentFiles, []string{recoveredPath}) {
		t.Fatalf("recent references were not migrated: %#v", prefs.RecentFiles)
	}
	if !reflect.DeepEqual(prefs.PinnedRecentFiles, []string{recoveredPath}) {
		t.Fatalf("pinned recent references were not migrated: %#v", prefs.PinnedRecentFiles)
	}
	if !reflect.DeepEqual(prefs.DraftFiles, []string{recoveredPath}) {
		t.Fatalf("draft references were not migrated: %#v", prefs.DraftFiles)
	}
	if prefs.LastFile != recoveredPath {
		t.Fatalf("last file = %q, want %q", prefs.LastFile, recoveredPath)
	}

	unchanged := app.migrateLegacyBundledDraftReferences("windows", home, prefs)
	if !reflect.DeepEqual(unchanged, prefs) {
		t.Fatal("legacy macOS migration affected another platform")
	}
}

func TestReplaceDraftRemovesTemporaryFileAndRecentRecord(t *testing.T) {
	app := testApp(t)
	root := t.TempDir()
	draftPath := filepath.Join(root, "New document-20260721-123456.md")
	savedPath := filepath.Join(root, "final.md")
	if err := os.WriteFile(draftPath, []byte("draft"), 0o644); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(savedPath, []byte("final"), 0o644); err != nil {
		t.Fatal(err)
	}
	if err := app.rememberFile(draftPath); err != nil {
		t.Fatal(err)
	}
	if err := app.rememberFile(savedPath); err != nil {
		t.Fatal(err)
	}
	app.markDraft(draftPath)
	prefsBeforeRestart, err := app.GetPreferences()
	if err != nil {
		t.Fatal(err)
	}
	if len(prefsBeforeRestart.DraftFiles) != 1 || prefsBeforeRestart.DraftFiles[0] != draftPath {
		t.Fatalf("draft was not persisted: %#v", prefsBeforeRestart.DraftFiles)
	}

	// Simulate closing and reopening the application before Save As.
	app = &App{language: "zh-CN", preferencesOverride: app.preferencesOverride}
	app.restoreDrafts(prefsBeforeRestart.DraftFiles)

	replacedPath, err := app.replaceDraft(draftPath, savedPath)
	if err != nil {
		t.Fatal(err)
	}
	if replacedPath != draftPath {
		t.Fatalf("replaced path = %q, want %q", replacedPath, draftPath)
	}
	if _, err := os.Stat(draftPath); !errors.Is(err, os.ErrNotExist) {
		t.Fatalf("temporary draft was not removed: %v", err)
	}
	prefs, err := app.GetPreferences()
	if err != nil {
		t.Fatal(err)
	}
	if len(prefs.RecentFiles) != 1 || prefs.RecentFiles[0] != savedPath {
		t.Fatalf("unexpected recent records after replacement: %#v", prefs.RecentFiles)
	}
	if len(prefs.DraftFiles) != 0 {
		t.Fatalf("draft record was not cleared: %#v", prefs.DraftFiles)
	}

	regularPath := filepath.Join(root, "existing.md")
	if err := os.WriteFile(regularPath, []byte("keep"), 0o644); err != nil {
		t.Fatal(err)
	}
	if replaced, err := app.replaceDraft(regularPath, savedPath); err != nil || replaced != "" {
		t.Fatalf("ordinary document was treated as a draft: replaced=%q err=%v", replaced, err)
	}
	if _, err := os.Stat(regularPath); err != nil {
		t.Fatalf("ordinary document was removed: %v", err)
	}
}

func TestReadImageDataSupportsRelativeLocalImages(t *testing.T) {
	root := t.TempDir()
	pngBytes, err := base64.StdEncoding.DecodeString("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=")
	if err != nil {
		t.Fatal(err)
	}
	imagePath := filepath.Join(root, "preview image.png")
	if err := os.WriteFile(imagePath, pngBytes, 0o644); err != nil {
		t.Fatal(err)
	}
	dataURL, err := testApp(t).ReadImageData("preview%20image.png", root)
	if err != nil {
		t.Fatal(err)
	}
	if !strings.HasPrefix(dataURL, "data:image/png;base64,") {
		t.Fatalf("unexpected image data URL prefix: %.40q", dataURL)
	}
}

func TestImportImageCopiesIntoDocumentAssetsWithUniqueNames(t *testing.T) {
	root := t.TempDir()
	documentPath := filepath.Join(root, "notes.md")
	if err := os.WriteFile(documentPath, []byte("# Notes"), 0o644); err != nil {
		t.Fatal(err)
	}
	sourceDirectory := t.TempDir()
	sourcePath := filepath.Join(sourceDirectory, "diagram.png")
	imageData := []byte("test image bytes")
	if err := os.WriteFile(sourcePath, imageData, 0o644); err != nil {
		t.Fatal(err)
	}

	first, err := importImageToAssets(documentPath, sourcePath)
	if err != nil {
		t.Fatal(err)
	}
	second, err := importImageToAssets(documentPath, sourcePath)
	if err != nil {
		t.Fatal(err)
	}
	if first != "assets/diagram.png" || second != "assets/diagram-2.png" {
		t.Fatalf("unexpected imported image paths: %q, %q", first, second)
	}
	for _, relative := range []string{first, second} {
		copied, readErr := os.ReadFile(filepath.Join(root, filepath.FromSlash(relative)))
		if readErr != nil {
			t.Fatal(readErr)
		}
		if !bytes.Equal(copied, imageData) {
			t.Fatalf("imported image %q changed content", relative)
		}
	}
}

func TestSavePastedImageWritesClipboardDataIntoAssets(t *testing.T) {
	root := t.TempDir()
	documentPath := filepath.Join(root, "notes.md")
	pngBase64 := "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII="
	relative, err := testApp(t).SavePastedImage(documentPath, "data:image/png;base64,"+pngBase64)
	if err != nil {
		t.Fatal(err)
	}
	if !strings.HasPrefix(relative, "assets/image-") || filepath.Ext(relative) != ".png" {
		t.Fatalf("unexpected pasted image path: %q", relative)
	}
	data, err := os.ReadFile(filepath.Join(root, filepath.FromSlash(relative)))
	if err != nil {
		t.Fatal(err)
	}
	if len(data) == 0 {
		t.Fatal("pasted image asset is empty")
	}
}

func TestPicGoSettingsOnlyAllowLoopbackAndKeepSecretOutOfPreferences(t *testing.T) {
	app := testApp(t)
	if _, err := app.SetImageUploadSettings(ImageUploadSettingsInput{
		Mode: imageUploadModePicGo, ServerURL: "https://example.com:36677",
	}); err == nil {
		t.Fatal("a remote PicGo server address must be rejected")
	}

	settings, err := app.SetImageUploadSettings(ImageUploadSettingsInput{
		Mode: imageUploadModePicGo, ServerURL: "http://localhost:36677/", Secret: "shared-local-secret",
	})
	if err != nil {
		t.Fatal(err)
	}
	if settings.Mode != imageUploadModePicGo || settings.ServerURL != "http://localhost:36677" || !settings.HasSecret {
		t.Fatalf("unexpected saved image upload settings: %#v", settings)
	}
	preferencesData, err := os.ReadFile(app.preferencePath())
	if err != nil {
		t.Fatal(err)
	}
	if bytes.Contains(preferencesData, []byte("shared-local-secret")) {
		t.Fatal("the PicGo shared secret must not be written to preferences.json")
	}
	if secretData, err := os.ReadFile(app.picGoSecretPath()); err != nil || strings.TrimSpace(string(secretData)) != "shared-local-secret" {
		t.Fatalf("PicGo secret was not stored separately: value=%q err=%v", secretData, err)
	}

	settings, err = app.SetImageUploadSettings(ImageUploadSettingsInput{
		Mode: imageUploadModeLocal, ServerURL: defaultPicGoServerURL, ClearSecret: true,
	})
	if err != nil {
		t.Fatal(err)
	}
	if settings.HasSecret {
		t.Fatal("clearing image upload settings retained the PicGo secret")
	}
	if _, err := os.Stat(app.picGoSecretPath()); !errors.Is(err, os.ErrNotExist) {
		t.Fatalf("cleared PicGo secret file still exists: %v", err)
	}
}

func TestUploadImageToPicGoUsesMultipartAndFallsBackOnlyAtTheFrontend(t *testing.T) {
	app := testApp(t)
	const secret = "picgo-test-secret"
	pngBytes, err := base64.StdEncoding.DecodeString("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=")
	if err != nil {
		t.Fatal(err)
	}

	server := httptest.NewServer(http.HandlerFunc(func(response http.ResponseWriter, request *http.Request) {
		if request.Header.Get("Authorization") != "Bearer "+secret {
			http.Error(response, "unauthorized", http.StatusUnauthorized)
			return
		}
		switch request.URL.Path {
		case "/heartbeat":
			response.Header().Set("Content-Type", "application/json")
			_, _ = response.Write([]byte(`{"success":true,"result":"alive"}`))
		case "/upload":
			if err := request.ParseMultipartForm(maxImportedImageSize + 1024); err != nil {
				http.Error(response, "invalid multipart upload", http.StatusBadRequest)
				return
			}
			file, header, err := request.FormFile("files")
			if err != nil {
				http.Error(response, "missing image", http.StatusBadRequest)
				return
			}
			defer file.Close()
			uploaded, err := io.ReadAll(file)
			if err != nil || !bytes.Equal(uploaded, pngBytes) || header.Filename == "" {
				http.Error(response, "image changed", http.StatusBadRequest)
				return
			}
			response.Header().Set("Content-Type", "application/json")
			_, _ = response.Write([]byte(`{"success":true,"result":["https://img.example.test/uploaded.png"]}`))
		default:
			http.NotFound(response, request)
		}
	}))
	defer server.Close()

	settingsInput := ImageUploadSettingsInput{Mode: imageUploadModePicGo, ServerURL: server.URL, Secret: secret}
	if err := app.TestPicGo(settingsInput); err != nil {
		t.Fatalf("PicGo heartbeat failed: %v", err)
	}
	if _, err := app.SetImageUploadSettings(settingsInput); err != nil {
		t.Fatal(err)
	}

	documentRoot := t.TempDir()
	documentPath := filepath.Join(documentRoot, "notes.md")
	if err := os.WriteFile(documentPath, []byte("# Notes"), 0o644); err != nil {
		t.Fatal(err)
	}
	assetPath := filepath.Join(documentRoot, "assets", "pasted.png")
	if err := os.MkdirAll(filepath.Dir(assetPath), 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(assetPath, pngBytes, 0o644); err != nil {
		t.Fatal(err)
	}
	uploadedURL, err := app.UploadImageToPicGo(documentPath, "assets/pasted.png")
	if err != nil {
		t.Fatal(err)
	}
	if uploadedURL != "https://img.example.test/uploaded.png" {
		t.Fatalf("unexpected uploaded URL: %q", uploadedURL)
	}
	if _, err := app.UploadImageToPicGo(documentPath, filepath.Join(documentRoot, "outside.png")); err == nil {
		t.Fatal("an image outside the document assets folder must not be uploaded")
	}
}

func TestPicGoCloudCredentialsStayOutOfPreferencesAndPKCEIsValid(t *testing.T) {
	app := testApp(t)
	const token = "picgo-cloud-test-token"
	if err := app.writePicGoCloudToken(token); err != nil {
		t.Fatal(err)
	}
	settings, err := app.SetImageUploadSettings(ImageUploadSettingsInput{
		Mode: imageUploadModePicGoCloud, ServerURL: defaultPicGoServerURL,
	})
	if err != nil {
		t.Fatal(err)
	}
	if settings.Mode != imageUploadModePicGoCloud || !settings.HasCloudToken {
		t.Fatalf("unexpected PicGo Cloud settings: %#v", settings)
	}
	preferencesData, err := os.ReadFile(app.preferencePath())
	if err != nil {
		t.Fatal(err)
	}
	if bytes.Contains(preferencesData, []byte(token)) {
		t.Fatal("the PicGo Cloud token must not be written to preferences.json")
	}
	if stored := readPrivateText(app.picGoCloudTokenPath()); stored != token {
		t.Fatalf("PicGo Cloud token was not stored separately: %q", stored)
	}

	verifier, challenge, state, err := picGoCloudPKCE()
	if err != nil {
		t.Fatal(err)
	}
	digest := sha256.Sum256([]byte(verifier))
	if challenge != base64.RawURLEncoding.EncodeToString(digest[:]) || verifier == "" || state == "" {
		t.Fatal("PicGo Cloud PKCE values are invalid")
	}

	loggedOut, err := app.LogoutPicGoCloud()
	if err != nil {
		t.Fatal(err)
	}
	if loggedOut.Mode != imageUploadModeLocal || loggedOut.HasCloudToken {
		t.Fatalf("logging out did not disable PicGo Cloud: %#v", loggedOut)
	}
}

func TestPicGoCloudStatusAndDirectUploadUseOfficialPresignFlow(t *testing.T) {
	const token = "direct-cloud-token"
	pngBytes, err := base64.StdEncoding.DecodeString("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=")
	if err != nil {
		t.Fatal(err)
	}
	var server *httptest.Server
	server = httptest.NewServer(http.HandlerFunc(func(response http.ResponseWriter, request *http.Request) {
		if request.URL.Path != "/storage/upload.png" && request.Header.Get("Authorization") != "Bearer "+token {
			http.Error(response, `{"message":"unauthorized"}`, http.StatusUnauthorized)
			return
		}
		response.Header().Set("Content-Type", "application/json")
		switch request.URL.Path {
		case "/api/whoami":
			_, _ = response.Write([]byte(`{"user":"reader","plan":0}`))
		case "/api/upload/presign":
			var input map[string]any
			if err := json.NewDecoder(request.Body).Decode(&input); err != nil || input["filename"] != "pasted.png" || input["contentType"] != "image/png" {
				http.Error(response, `{"message":"invalid input"}`, http.StatusBadRequest)
				return
			}
			_, _ = fmt.Fprintf(response, `{"success":true,"objectKey":"object-key","publicId":"public-id","uploadUrl":%q,"method":"PUT","headers":{"x-upload":"allowed"}}`, server.URL+"/storage/upload.png")
		case "/storage/upload.png":
			uploaded, _ := io.ReadAll(request.Body)
			if request.Method != http.MethodPut || request.Header.Get("x-upload") != "allowed" || !bytes.Equal(uploaded, pngBytes) {
				http.Error(response, "upload changed", http.StatusBadRequest)
				return
			}
			response.WriteHeader(http.StatusOK)
		case "/api/album-items/complete":
			_, _ = response.Write([]byte(`{"success":true,"data":{"item":{"imgUrl":"https://cdn.picgo.example/uploaded.png"}}}`))
		default:
			http.NotFound(response, request)
		}
	}))
	defer server.Close()
	client := picGoCloudHTTPClient(10 * time.Second)
	defer client.CloseIdleConnections()
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	status, err := picGoCloudStatus(ctx, client, server.URL, token)
	if err != nil || !status.Connected || status.User != "reader" {
		t.Fatalf("PicGo Cloud status failed: status=%#v err=%v", status, err)
	}
	var uploadedBytes, uploadTotal int64
	uploadedURL, err := uploadImageToPicGoCloud(ctx, client, server.URL, token, "pasted.png", pngBytes, "image/png", func(done, total int64) {
		uploadedBytes = done
		uploadTotal = total
	})
	if err != nil {
		t.Fatal(err)
	}
	if uploadedURL != "https://cdn.picgo.example/uploaded.png" {
		t.Fatalf("unexpected PicGo Cloud URL: %q", uploadedURL)
	}
	if uploadedBytes != int64(len(pngBytes)) {
		t.Fatalf("upload progress stopped at %d of %d bytes", uploadedBytes, len(pngBytes))
	}
	if uploadTotal != int64(len(pngBytes)) {
		t.Fatalf("unexpected upload total: got %d want %d", uploadTotal, len(pngBytes))
	}
}

func TestPicGoCloudMultipartUploadHandlesAssetsUpToLocalLimit(t *testing.T) {
	const token = "multipart-cloud-token"
	data := bytes.Repeat([]byte{0x5a}, picGoCloudMultipartMinimum+1024)
	partSize := 4 * 1024 * 1024
	partCount := (len(data) + partSize - 1) / partSize
	var server *httptest.Server
	server = httptest.NewServer(http.HandlerFunc(func(response http.ResponseWriter, request *http.Request) {
		if !strings.HasPrefix(request.URL.Path, "/part/") && request.Header.Get("Authorization") != "Bearer "+token {
			http.Error(response, `{"message":"unauthorized"}`, http.StatusUnauthorized)
			return
		}
		response.Header().Set("Content-Type", "application/json")
		switch request.URL.Path {
		case "/api/upload/multipart/initiate":
			parts := make([]string, 0, partCount)
			for number := 1; number <= partCount; number++ {
				parts = append(parts, fmt.Sprintf(`{"partNumber":%d,"url":%q,"method":"PUT","headers":{}}`, number, fmt.Sprintf("%s/part/%d", server.URL, number)))
			}
			_, _ = fmt.Fprintf(response, `{"success":true,"uploadId":"upload-id","objectKey":"object-key","publicId":"public-id","url":"https://cdn.picgo.example/large.png","partSize":%d,"partCount":%d,"parts":[%s]}`, partSize, partCount, strings.Join(parts, ","))
		case "/api/upload/multipart/complete":
			var input struct {
				Parts []picGoCloudCompletedPart `json:"parts"`
			}
			if err := json.NewDecoder(request.Body).Decode(&input); err != nil || len(input.Parts) != partCount {
				http.Error(response, `{"message":"missing completed parts"}`, http.StatusBadRequest)
				return
			}
			_, _ = response.Write([]byte(`{"success":true}`))
		case "/api/album-items/complete":
			_, _ = response.Write([]byte(`{"success":true,"data":{"item":{"imgUrl":"https://cdn.picgo.example/large.png"}}}`))
		default:
			if strings.HasPrefix(request.URL.Path, "/part/") {
				_, _ = io.Copy(io.Discard, request.Body)
				response.Header().Set("ETag", `"part-etag"`)
				response.WriteHeader(http.StatusOK)
				return
			}
			http.NotFound(response, request)
		}
	}))
	defer server.Close()
	client := picGoCloudHTTPClient(20 * time.Second)
	defer client.CloseIdleConnections()
	ctx, cancel := context.WithTimeout(context.Background(), 20*time.Second)
	defer cancel()
	var uploadedBytes, uploadTotal int64
	uploadedURL, err := uploadImageToPicGoCloud(ctx, client, server.URL, token, "large.png", data, "image/png", func(done, total int64) {
		uploadedBytes = done
		uploadTotal = total
	})
	if err != nil {
		t.Fatal(err)
	}
	if uploadedURL != "https://cdn.picgo.example/large.png" {
		t.Fatalf("unexpected multipart URL: %q", uploadedURL)
	}
	if uploadedBytes != int64(len(data)) {
		t.Fatalf("multipart upload progress stopped at %d of %d bytes", uploadedBytes, len(data))
	}
	if uploadTotal != int64(len(data)) {
		t.Fatalf("unexpected multipart upload total: got %d want %d", uploadTotal, len(data))
	}
}

func testApp(t *testing.T) *App {
	t.Helper()
	return &App{
		language:            "zh-CN",
		preferencesOverride: filepath.Join(t.TempDir(), "preferences.json"),
	}
}

func TestSnoozeUpdatesSuppressesAutomaticChecks(t *testing.T) {
	app := testApp(t)
	if err := app.SnoozeUpdates(30); err != nil {
		t.Fatal(err)
	}
	prefs, err := app.GetPreferences()
	if err != nil {
		t.Fatal(err)
	}
	until, err := time.Parse(time.RFC3339, prefs.SuppressUpdateUntil)
	if err != nil {
		t.Fatalf("invalid suppression timestamp %q: %v", prefs.SuppressUpdateUntil, err)
	}
	if until.Before(time.Now().Add(29 * 24 * time.Hour)) {
		t.Fatalf("suppression period is too short: %s", until)
	}
	info, err := app.CheckForUpdates(false)
	if err != nil {
		t.Fatal(err)
	}
	if !info.Suppressed || info.Checked {
		t.Fatalf("automatic update check was not suppressed: %#v", info)
	}
}

func TestReadSaveAndRecent(t *testing.T) {
	app := testApp(t)
	dir := t.TempDir()
	filePath := filepath.Join(dir, "sample.md")
	if err := os.WriteFile(filePath, []byte("# First"), 0o644); err != nil {
		t.Fatal(err)
	}

	doc, err := app.ReadFile(filePath)
	if err != nil {
		t.Fatal(err)
	}
	if doc.Content != "# First" || doc.Name != "sample.md" {
		t.Fatalf("unexpected document: %#v", doc)
	}

	app.SetDirty(true)
	saved, err := app.SaveFile(filePath, "# Updated")
	if err != nil {
		t.Fatal(err)
	}
	if saved.Content != "# Updated" {
		t.Fatalf("save returned %q", saved.Content)
	}
	prefs, err := app.GetPreferences()
	if err != nil {
		t.Fatal(err)
	}
	if len(prefs.RecentFiles) != 1 || prefs.RecentFiles[0] != filePath {
		t.Fatalf("recent files not updated: %#v", prefs.RecentFiles)
	}
	app.mu.RLock()
	dirty := app.dirty
	app.mu.RUnlock()
	if dirty {
		t.Fatal("save did not clear dirty state")
	}
}

func TestReadingExistingRecentFileKeepsItsPosition(t *testing.T) {
	app := testApp(t)
	dir := t.TempDir()
	firstPath := filepath.Join(dir, "first.md")
	secondPath := filepath.Join(dir, "second.md")
	for _, filePath := range []string{firstPath, secondPath} {
		if err := os.WriteFile(filePath, []byte("# Document"), 0o644); err != nil {
			t.Fatal(err)
		}
		if _, err := app.ReadFile(filePath); err != nil {
			t.Fatal(err)
		}
	}

	if _, err := app.ReadFile(firstPath); err != nil {
		t.Fatal(err)
	}
	prefs, err := app.GetPreferences()
	if err != nil {
		t.Fatal(err)
	}
	want := []string{secondPath, firstPath}
	if len(prefs.RecentFiles) != len(want) {
		t.Fatalf("recent file count = %d, want %d: %#v", len(prefs.RecentFiles), len(want), prefs.RecentFiles)
	}
	for index := range want {
		if prefs.RecentFiles[index] != want[index] {
			t.Fatalf("recent files reordered: got %#v, want %#v", prefs.RecentFiles, want)
		}
	}
}

func TestRecentPinningPartitionsPersistsAndCapsOnlyUnpinnedRecords(t *testing.T) {
	app := testApp(t)
	root := t.TempDir()
	firstPinned := filepath.Join(root, "first-pinned.md")
	secondPinned := filepath.Join(root, "second-pinned.md")
	for _, filePath := range []string{firstPinned, secondPinned} {
		if err := os.WriteFile(filePath, []byte("pinned"), 0o644); err != nil {
			t.Fatal(err)
		}
		if err := app.rememberFile(filePath); err != nil {
			t.Fatal(err)
		}
	}
	if _, err := app.SetRecentPinned(firstPinned, true); err != nil {
		t.Fatal(err)
	}
	if _, err := app.SetRecentPinned(secondPinned, true); err != nil {
		t.Fatal(err)
	}
	if _, err := app.SetRecentPinned(firstPinned, true); err != nil {
		t.Fatal(err)
	}

	unpinnedPaths := make([]string, 0, maxRecent+1)
	for index := 0; index < maxRecent+1; index++ {
		filePath := filepath.Join(root, fmt.Sprintf("recent-%02d.md", index))
		unpinnedPaths = append(unpinnedPaths, filePath)
		if err := app.rememberFile(filePath); err != nil {
			t.Fatal(err)
		}
	}
	prefs, err := app.GetPreferences()
	if err != nil {
		t.Fatal(err)
	}
	wantPins := []string{secondPinned, firstPinned}
	if !reflect.DeepEqual(prefs.PinnedRecentFiles, wantPins) {
		t.Fatalf("idempotent pin changed pin order: got %#v, want %#v", prefs.PinnedRecentFiles, wantPins)
	}
	if len(prefs.RecentFiles) != len(wantPins)+maxRecent {
		t.Fatalf("pinned records consumed unpinned capacity: %#v", prefs.RecentFiles)
	}
	if !reflect.DeepEqual(prefs.RecentFiles[:len(wantPins)], wantPins) {
		t.Fatalf("pinned records are not the recent prefix: %#v", prefs.RecentFiles)
	}
	if indexPreferencePath(prefs.RecentFiles, unpinnedPaths[0]) >= 0 {
		t.Fatalf("oldest unpinned record was not evicted: %#v", prefs.RecentFiles)
	}

	beforeReopen := append([]string(nil), prefs.RecentFiles...)
	for _, filePath := range []string{unpinnedPaths[5], firstPinned} {
		if err := app.rememberFile(filePath); err != nil {
			t.Fatal(err)
		}
	}
	prefs, err = app.GetPreferences()
	if err != nil {
		t.Fatal(err)
	}
	if !reflect.DeepEqual(prefs.RecentFiles, beforeReopen) {
		t.Fatalf("reopening an existing pinned or unpinned record changed its position: got %#v, want %#v", prefs.RecentFiles, beforeReopen)
	}

	restarted := &App{language: "zh-CN", preferencesOverride: app.preferencesOverride}
	prefs, err = restarted.ReorderPinnedRecent([]string{firstPinned, filepath.Join(root, "unknown.md"), firstPinned})
	if err != nil {
		t.Fatal(err)
	}
	wantPins = []string{firstPinned, secondPinned}
	if !reflect.DeepEqual(prefs.PinnedRecentFiles, wantPins) || !reflect.DeepEqual(prefs.RecentFiles[:2], wantPins) {
		t.Fatalf("explicit pinned reorder failed: pins=%#v recent=%#v", prefs.PinnedRecentFiles, prefs.RecentFiles)
	}
	restarted = &App{language: "zh-CN", preferencesOverride: app.preferencesOverride}
	prefs, err = restarted.GetPreferences()
	if err != nil {
		t.Fatal(err)
	}
	if !reflect.DeepEqual(prefs.PinnedRecentFiles, wantPins) || !reflect.DeepEqual(prefs.RecentFiles[:2], wantPins) {
		t.Fatalf("pinned reorder did not persist across restart: pins=%#v recent=%#v", prefs.PinnedRecentFiles, prefs.RecentFiles)
	}

	prefs, err = restarted.SetRecentPinned(firstPinned, false)
	if err != nil {
		t.Fatal(err)
	}
	if !reflect.DeepEqual(prefs.PinnedRecentFiles, []string{secondPinned}) {
		t.Fatalf("unpin did not preserve the remaining pin order: %#v", prefs.PinnedRecentFiles)
	}
	if len(prefs.RecentFiles) != 1+maxRecent || !reflect.DeepEqual(prefs.RecentFiles[:2], []string{secondPinned, firstPinned}) {
		t.Fatalf("unpin did not move the record to the front of the bounded unpinned partition: %#v", prefs.RecentFiles)
	}
	if indexPreferencePath(prefs.RecentFiles, unpinnedPaths[1]) >= 0 {
		t.Fatalf("unpin did not evict the oldest excess unpinned record: %#v", prefs.RecentFiles)
	}
}

func TestRememberFileAfterAllExistingRecentsArePinnedAddsAnOrdinaryRecord(t *testing.T) {
	app := testApp(t)
	root := t.TempDir()
	wantPins := make([]string, 0, maxRecent+2)
	for index := 0; index < maxRecent+2; index++ {
		filePath := filepath.Join(root, fmt.Sprintf("pinned-%02d.md", index))
		if err := os.WriteFile(filePath, []byte("pinned"), 0o644); err != nil {
			t.Fatal(err)
		}
		if err := app.rememberFile(filePath); err != nil {
			t.Fatal(err)
		}
		if _, err := app.SetRecentPinned(filePath, true); err != nil {
			t.Fatal(err)
		}
		wantPins = append([]string{filePath}, wantPins...)
	}
	prefs, err := app.GetPreferences()
	if err != nil {
		t.Fatal(err)
	}
	if !reflect.DeepEqual(prefs.RecentFiles, wantPins) || !reflect.DeepEqual(prefs.PinnedRecentFiles, wantPins) {
		t.Fatalf("test setup does not contain only pinned recents: %#v", prefs)
	}

	newPath := filepath.Join(root, "new-ordinary.md")
	if err := os.WriteFile(newPath, []byte("ordinary"), 0o644); err != nil {
		t.Fatal(err)
	}
	if err := app.rememberFile(newPath); err != nil {
		t.Fatal(err)
	}
	prefs, err = app.GetPreferences()
	if err != nil {
		t.Fatal(err)
	}
	wantRecent := append(append([]string(nil), wantPins...), newPath)
	if !reflect.DeepEqual(prefs.PinnedRecentFiles, wantPins) || !reflect.DeepEqual(prefs.RecentFiles, wantRecent) {
		t.Fatalf("new ordinary recent was lost after an all-pinned list: pins=%#v recent=%#v", prefs.PinnedRecentFiles, prefs.RecentFiles)
	}
}

func TestMissingUnpinnedRecentCannotBeNewlyPinned(t *testing.T) {
	app := testApp(t)
	missingPath := filepath.Join(t.TempDir(), "never-existed.md")
	if err := app.rememberFile(missingPath); err != nil {
		t.Fatal(err)
	}
	prefs, err := app.SetRecentPinned(missingPath, true)
	if err != nil {
		t.Fatal(err)
	}
	if len(prefs.PinnedRecentFiles) != 0 || !reflect.DeepEqual(prefs.RecentFiles, []string{missingPath}) {
		t.Fatalf("missing unpinned recent was pinned or removed: %#v", prefs)
	}
}

func TestPreviouslyPinnedMissingRecentsCanBeUnpinnedAndRemoved(t *testing.T) {
	app := testApp(t)
	root := t.TempDir()
	remainingPath := filepath.Join(root, "remaining.md")
	missingToUnpin := filepath.Join(root, "missing-to-unpin.md")
	missingToRemove := filepath.Join(root, "missing-to-remove.md")
	for _, filePath := range []string{remainingPath, missingToUnpin, missingToRemove} {
		if err := os.WriteFile(filePath, []byte("existing"), 0o644); err != nil {
			t.Fatal(err)
		}
		if err := app.rememberFile(filePath); err != nil {
			t.Fatal(err)
		}
		if filePath != remainingPath {
			if _, err := app.SetRecentPinned(filePath, true); err != nil {
				t.Fatal(err)
			}
		}
	}
	for _, filePath := range []string{missingToUnpin, missingToRemove} {
		if err := os.Remove(filePath); err != nil {
			t.Fatal(err)
		}
	}
	if _, err := app.AddFavorite(missingToRemove); err != nil {
		t.Fatal(err)
	}

	prefs, err := app.GetPreferences()
	if err != nil {
		t.Fatal(err)
	}
	wantPins := []string{missingToRemove, missingToUnpin}
	if !reflect.DeepEqual(prefs.PinnedRecentFiles, wantPins) {
		t.Fatalf("previously pinned missing recents were not retained: %#v", prefs.PinnedRecentFiles)
	}
	wantStatuses := []RecentFileStatus{{Path: missingToRemove, Exists: false}, {Path: missingToUnpin, Exists: false}, {Path: remainingPath, Exists: true}}
	if !reflect.DeepEqual(prefs.RecentFileStatuses, wantStatuses) {
		t.Fatalf("missing pinned status was not retained: %#v", prefs.RecentFileStatuses)
	}
	prefs, err = app.ReorderPinnedRecent([]string{missingToUnpin, missingToRemove})
	if err != nil {
		t.Fatal(err)
	}
	if !reflect.DeepEqual(prefs.PinnedRecentFiles, []string{missingToUnpin, missingToRemove}) || !reflect.DeepEqual(prefs.RecentFiles[:2], []string{missingToUnpin, missingToRemove}) {
		t.Fatalf("missing pinned recents could not be reordered: %#v", prefs)
	}

	prefs, err = app.SetRecentPinned(missingToUnpin, false)
	if err != nil {
		t.Fatal(err)
	}
	if !reflect.DeepEqual(prefs.PinnedRecentFiles, []string{missingToRemove}) || !reflect.DeepEqual(prefs.RecentFiles, []string{missingToRemove, missingToUnpin, remainingPath}) {
		t.Fatalf("missing pinned recent could not be moved to the ordinary partition: %#v", prefs)
	}
	prefs, err = app.SetRecentPinned(missingToUnpin, true)
	if err != nil {
		t.Fatal(err)
	}
	if !reflect.DeepEqual(prefs.PinnedRecentFiles, []string{missingToRemove}) || !reflect.DeepEqual(prefs.RecentFiles, []string{missingToRemove, missingToUnpin, remainingPath}) {
		t.Fatalf("missing unpinned recent was unexpectedly re-pinned: %#v", prefs)
	}

	prefs, err = app.RemoveRecent(missingToRemove)
	if err != nil {
		t.Fatal(err)
	}
	if len(prefs.PinnedRecentFiles) != 0 || !reflect.DeepEqual(prefs.RecentFiles, []string{missingToUnpin, remainingPath}) {
		t.Fatalf("removing a pinned recent did not clear both recent indexes: %#v", prefs)
	}
	if !reflect.DeepEqual(prefs.FavoriteFiles, []string{missingToRemove}) {
		t.Fatalf("removing a pinned recent changed favorites: %#v", prefs.FavoriteFiles)
	}
	if prefs.LastFile != missingToUnpin {
		t.Fatalf("last file = %q, want first remaining recent %q", prefs.LastFile, missingToUnpin)
	}
}

func TestSaveDocumentAsAtomicallyMigratesPinnedDraftAtFullCapacity(t *testing.T) {
	app := testApp(t)
	root := t.TempDir()
	draftPath := filepath.Join(root, "New document-20260818-120000.md")
	savedPath := filepath.Join(root, "final.md")
	if err := os.WriteFile(draftPath, []byte("draft"), 0o644); err != nil {
		t.Fatal(err)
	}
	if err := app.rememberFile(draftPath); err != nil {
		t.Fatal(err)
	}
	if _, err := app.SetRecentPinned(draftPath, true); err != nil {
		t.Fatal(err)
	}
	if _, err := app.AddFavorite(draftPath); err != nil {
		t.Fatal(err)
	}
	app.markDraft(draftPath)

	unpinnedPaths := make([]string, 0, maxRecent)
	for index := 0; index < maxRecent; index++ {
		filePath := filepath.Join(root, fmt.Sprintf("unpinned-%02d.md", index))
		unpinnedPaths = append(unpinnedPaths, filePath)
		if err := app.rememberFile(filePath); err != nil {
			t.Fatal(err)
		}
	}
	if err := app.rememberFile(draftPath); err != nil {
		t.Fatal(err)
	}
	app.SetDirty(true)

	saved, err := app.saveDocumentAs(draftPath, savedPath, "# Final")
	if err != nil {
		t.Fatal(err)
	}
	if saved.ReplacedPath != draftPath || saved.Path != savedPath || saved.Content != "# Final" {
		t.Fatalf("unexpected Save As result: %#v", saved)
	}
	if _, err := os.Stat(draftPath); !errors.Is(err, os.ErrNotExist) {
		t.Fatalf("temporary draft was not removed: %v", err)
	}
	prefs, err := app.GetPreferences()
	if err != nil {
		t.Fatal(err)
	}
	if !reflect.DeepEqual(prefs.PinnedRecentFiles, []string{savedPath}) {
		t.Fatalf("draft pin was not migrated: %#v", prefs.PinnedRecentFiles)
	}
	if !reflect.DeepEqual(prefs.FavoriteFiles, []string{savedPath}) {
		t.Fatalf("draft favorite was not migrated: %#v", prefs.FavoriteFiles)
	}
	if len(prefs.DraftFiles) != 0 || prefs.LastFile != savedPath {
		t.Fatalf("draft metadata was not migrated atomically: drafts=%#v last=%q", prefs.DraftFiles, prefs.LastFile)
	}
	wantRecent := []string{savedPath}
	for index := len(unpinnedPaths) - 1; index >= 0; index-- {
		wantRecent = append(wantRecent, unpinnedPaths[index])
	}
	if !reflect.DeepEqual(prefs.RecentFiles, wantRecent) {
		t.Fatalf("draft replacement lost a full-capacity recent record: got %#v, want %#v", prefs.RecentFiles, wantRecent)
	}
	app.mu.RLock()
	dirty := app.dirty
	app.mu.RUnlock()
	if dirty {
		t.Fatal("successful Save As did not clear dirty state")
	}
}

func TestSaveDocumentAsAtomicallyReplacesUnpinnedDraftWithinFullRecentCapacity(t *testing.T) {
	app := testApp(t)
	root := t.TempDir()
	draftPath := filepath.Join(root, "New document-20260818-130000.md")
	savedPath := filepath.Join(root, "renamed.md")
	if err := os.WriteFile(draftPath, []byte("draft"), 0o644); err != nil {
		t.Fatal(err)
	}

	paths := make([]string, 0, maxRecent)
	for index := 0; index < 5; index++ {
		paths = append(paths, filepath.Join(root, fmt.Sprintf("older-%02d.md", index)))
	}
	paths = append(paths, draftPath)
	for index := 0; index < 4; index++ {
		paths = append(paths, filepath.Join(root, fmt.Sprintf("newer-%02d.md", index)))
	}
	for _, filePath := range paths {
		if err := app.rememberFile(filePath); err != nil {
			t.Fatal(err)
		}
	}
	app.markDraft(draftPath)
	if err := app.rememberFile(draftPath); err != nil {
		t.Fatal(err)
	}
	prefsBefore, err := app.GetPreferences()
	if err != nil {
		t.Fatal(err)
	}
	if len(prefsBefore.RecentFiles) != maxRecent {
		t.Fatalf("test setup recent count = %d, want %d", len(prefsBefore.RecentFiles), maxRecent)
	}
	draftIndex := indexPreferencePath(prefsBefore.RecentFiles, draftPath)
	if draftIndex <= 0 || draftIndex >= len(prefsBefore.RecentFiles)-1 {
		t.Fatalf("test setup did not place draft within the full recent list: %#v", prefsBefore.RecentFiles)
	}

	saved, err := app.saveDocumentAs(draftPath, savedPath, "saved")
	if err != nil {
		t.Fatal(err)
	}
	if saved.ReplacedPath != draftPath {
		t.Fatalf("Save As replaced path = %q, want %q", saved.ReplacedPath, draftPath)
	}
	prefsAfter, err := app.GetPreferences()
	if err != nil {
		t.Fatal(err)
	}
	wantRecent := append([]string(nil), prefsBefore.RecentFiles...)
	wantRecent[draftIndex] = savedPath
	if !reflect.DeepEqual(prefsAfter.RecentFiles, wantRecent) {
		t.Fatalf("unpinned draft replacement lost or reordered a full-capacity record: got %#v, want %#v", prefsAfter.RecentFiles, wantRecent)
	}
	if len(prefsAfter.PinnedRecentFiles) != 0 {
		t.Fatalf("unpinned draft became pinned during replacement: %#v", prefsAfter.PinnedRecentFiles)
	}
}

func TestReplaceDraftPreferenceWriteFailurePreservesRecoverableDraft(t *testing.T) {
	app := testApp(t)
	root := t.TempDir()
	draftPath := filepath.Join(root, "draft.md")
	savedPath := filepath.Join(root, "saved.md")
	for filePath, content := range map[string]string{draftPath: "draft", savedPath: "saved"} {
		if err := os.WriteFile(filePath, []byte(content), 0o644); err != nil {
			t.Fatal(err)
		}
	}
	if err := app.rememberFile(draftPath); err != nil {
		t.Fatal(err)
	}
	if _, err := app.SetRecentPinned(draftPath, true); err != nil {
		t.Fatal(err)
	}
	app.markDraft(draftPath)

	preferencesPath := app.preferencePath()
	if err := os.Chmod(preferencesPath, 0o444); err != nil {
		t.Fatal(err)
	}
	defer os.Chmod(preferencesPath, 0o644)
	if writable, err := os.OpenFile(preferencesPath, os.O_WRONLY, 0); err == nil {
		_ = writable.Close()
		t.Skip("the current user or filesystem can still write a read-only preferences file")
	}

	if replacedPath, err := app.replaceDraft(draftPath, savedPath); err == nil || replacedPath != "" {
		t.Fatalf("replaceDraft() = %q, %v; want empty path and preference write error", replacedPath, err)
	}
	if content, err := os.ReadFile(draftPath); err != nil || string(content) != "draft" {
		t.Fatalf("preference failure removed or changed the recoverable draft: content=%q err=%v", content, err)
	}
	app.draftsMu.Lock()
	stillDraft := app.draftFiles[draftPathKey(draftPath)]
	stillClaimed := app.draftReplacements[draftPathKey(draftPath)]
	app.draftsMu.Unlock()
	if !stillDraft {
		t.Fatal("preference failure cleared the in-memory draft identity")
	}
	if stillClaimed {
		t.Fatal("preference failure left the draft replacement claim stuck")
	}
	if err := os.Chmod(preferencesPath, 0o644); err != nil {
		t.Fatal(err)
	}
	prefs, err := app.GetPreferences()
	if err != nil {
		t.Fatal(err)
	}
	if !reflect.DeepEqual(prefs.RecentFiles, []string{draftPath}) || !reflect.DeepEqual(prefs.PinnedRecentFiles, []string{draftPath}) || !reflect.DeepEqual(prefs.DraftFiles, []string{draftPath}) {
		t.Fatalf("preference failure partially migrated the draft: %#v", prefs)
	}
}

func TestSaveDocumentAsDeleteFailureStillReturnsCommittedMigration(t *testing.T) {
	app := testApp(t)
	root := t.TempDir()
	draftPath := filepath.Join(root, "non-empty-draft")
	savedPath := filepath.Join(root, "saved.md")
	if err := os.MkdirAll(draftPath, 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(draftPath, "child"), []byte("keep"), 0o644); err != nil {
		t.Fatal(err)
	}
	if err := app.rememberFile(draftPath); err != nil {
		t.Fatal(err)
	}
	app.markDraft(draftPath)

	saved, err := app.saveDocumentAs(draftPath, savedPath, "saved")
	if err != nil || saved == nil || saved.Path != savedPath || saved.ReplacedPath != draftPath {
		t.Fatalf("saveDocumentAs() = %#v, %v; want committed replacement of %q", saved, err, draftPath)
	}
	prefs, err := app.GetPreferences()
	if err != nil {
		t.Fatal(err)
	}
	if !reflect.DeepEqual(prefs.RecentFiles, []string{savedPath}) || len(prefs.PinnedRecentFiles) != 0 || len(prefs.DraftFiles) != 0 || prefs.LastFile != savedPath {
		t.Fatalf("cleanup failure rolled back or damaged committed migration: %#v", prefs)
	}
	app.draftsMu.Lock()
	stillDraft := app.draftFiles[draftPathKey(draftPath)]
	stillClaimed := app.draftReplacements[draftPathKey(draftPath)]
	app.draftsMu.Unlock()
	if stillDraft {
		t.Fatal("cleanup failure left in-memory draft state inconsistent with committed preferences")
	}
	if stillClaimed {
		t.Fatal("cleanup failure left the completed draft replacement claim stuck")
	}
	if _, err := os.Stat(filepath.Join(draftPath, "child")); err != nil {
		t.Fatalf("failed draft deletion damaged the original directory: %v", err)
	}
}

func TestConcurrentSaveDocumentAsClaimsTheDraftBeforeWritingTarget(t *testing.T) {
	app := testApp(t)
	root := t.TempDir()
	draftPath := filepath.Join(root, "draft.md")
	firstSavedPath := filepath.Join(root, "first.md")
	secondSavedPath := filepath.Join(root, "second.md")
	if err := os.WriteFile(draftPath, []byte("draft"), 0o644); err != nil {
		t.Fatal(err)
	}
	if err := app.rememberFile(draftPath); err != nil {
		t.Fatal(err)
	}
	if _, err := app.SetRecentPinned(draftPath, true); err != nil {
		t.Fatal(err)
	}
	if _, err := app.AddFavorite(draftPath); err != nil {
		t.Fatal(err)
	}
	app.markDraft(draftPath)

	type saveAsResult struct {
		document *Document
		err      error
	}
	// Hold preference persistence after the first call has claimed and written
	// its target, keeping the claim active while the competing call starts.
	app.preferencesMu.Lock()
	preferencesLocked := true
	defer func() {
		if preferencesLocked {
			app.preferencesMu.Unlock()
		}
	}()

	firstResult := make(chan saveAsResult, 1)
	go func() {
		document, err := app.saveDocumentAs(draftPath, firstSavedPath, "first")
		firstResult <- saveAsResult{document: document, err: err}
	}()
	deadline := time.Now().Add(2 * time.Second)
	for {
		if _, err := os.Stat(firstSavedPath); err == nil {
			break
		} else if !errors.Is(err, os.ErrNotExist) {
			t.Fatal(err)
		}
		if time.Now().After(deadline) {
			t.Fatal("first Save As did not write its target before the deadline")
		}
		time.Sleep(time.Millisecond)
	}

	secondResult := make(chan saveAsResult, 1)
	go func() {
		document, err := app.saveDocumentAs(draftPath, secondSavedPath, "second")
		secondResult <- saveAsResult{document: document, err: err}
	}()
	var second saveAsResult
	select {
	case second = <-secondResult:
	case <-time.After(2 * time.Second):
		t.Fatal("competing Save As did not reject the in-flight draft claim")
	}
	if second.document != nil || !errors.Is(second.err, errDraftReplacementInProgress) {
		t.Fatalf("competing Save As = %#v, %v; want nil document and in-progress error", second.document, second.err)
	}
	if _, err := os.Stat(secondSavedPath); !errors.Is(err, os.ErrNotExist) {
		t.Fatalf("competing Save As wrote its target before acquiring the draft claim: %v", err)
	}

	app.preferencesMu.Unlock()
	preferencesLocked = false
	first := <-firstResult
	if first.err != nil || first.document == nil || first.document.ReplacedPath != draftPath || first.document.Path != firstSavedPath {
		t.Fatalf("winning Save As = %#v, %v; want replacement of %q", first.document, first.err, draftPath)
	}

	prefs, err := app.GetPreferences()
	if err != nil {
		t.Fatal(err)
	}
	if !reflect.DeepEqual(prefs.RecentFiles, []string{firstSavedPath}) ||
		!reflect.DeepEqual(prefs.PinnedRecentFiles, []string{firstSavedPath}) ||
		!reflect.DeepEqual(prefs.FavoriteFiles, []string{firstSavedPath}) ||
		len(prefs.DraftFiles) != 0 || prefs.LastFile != firstSavedPath {
		t.Fatalf("concurrent replacement produced inconsistent preferences: %#v", prefs)
	}
	if _, err := os.Stat(draftPath); !errors.Is(err, os.ErrNotExist) {
		t.Fatalf("claimed draft was not removed: %v", err)
	}
}

func TestSaveDocumentAsForOrdinaryFileKeepsOriginalAndItsPin(t *testing.T) {
	app := testApp(t)
	root := t.TempDir()
	originalPath := filepath.Join(root, "original.md")
	olderRecentPath := filepath.Join(root, "older.md")
	savedPath := filepath.Join(root, "copy.md")
	for _, filePath := range []string{olderRecentPath, originalPath} {
		if err := os.WriteFile(filePath, []byte("original"), 0o644); err != nil {
			t.Fatal(err)
		}
		if err := app.rememberFile(filePath); err != nil {
			t.Fatal(err)
		}
	}
	if _, err := app.SetRecentPinned(originalPath, true); err != nil {
		t.Fatal(err)
	}
	if _, err := app.AddFavorite(originalPath); err != nil {
		t.Fatal(err)
	}

	saved, err := app.saveDocumentAs(originalPath, savedPath, "copy")
	if err != nil {
		t.Fatal(err)
	}
	if saved.ReplacedPath != "" {
		t.Fatalf("ordinary file was treated as a replaced draft: %#v", saved)
	}
	if content, err := os.ReadFile(originalPath); err != nil || string(content) != "original" {
		t.Fatalf("ordinary original changed during Save As: content=%q err=%v", content, err)
	}
	prefs, err := app.GetPreferences()
	if err != nil {
		t.Fatal(err)
	}
	if !reflect.DeepEqual(prefs.PinnedRecentFiles, []string{originalPath}) {
		t.Fatalf("ordinary original pin changed during Save As: %#v", prefs.PinnedRecentFiles)
	}
	if !reflect.DeepEqual(prefs.FavoriteFiles, []string{originalPath}) {
		t.Fatalf("ordinary original favorite changed during Save As: %#v", prefs.FavoriteFiles)
	}
	wantRecent := []string{originalPath, savedPath, olderRecentPath}
	if !reflect.DeepEqual(prefs.RecentFiles, wantRecent) {
		t.Fatalf("ordinary Save As recent order = %#v, want %#v", prefs.RecentFiles, wantRecent)
	}
}

func TestGetPreferencesMarksMissingRecentFilesWithoutRemovingThem(t *testing.T) {
	app := testApp(t)
	dir := t.TempDir()
	existingPath := filepath.Join(dir, "existing.md")
	missingPath := filepath.Join(dir, "deleted.md")
	if err := os.WriteFile(existingPath, []byte("# Existing"), 0o644); err != nil {
		t.Fatal(err)
	}
	if err := app.rememberFile(existingPath); err != nil {
		t.Fatal(err)
	}
	if err := app.rememberFile(missingPath); err != nil {
		t.Fatal(err)
	}

	prefs, err := app.GetPreferences()
	if err != nil {
		t.Fatal(err)
	}
	wantFiles := []string{missingPath, existingPath}
	if !reflect.DeepEqual(prefs.RecentFiles, wantFiles) {
		t.Fatalf("missing recent file was removed or reordered: got %#v, want %#v", prefs.RecentFiles, wantFiles)
	}
	wantStatuses := []RecentFileStatus{
		{Path: missingPath, Exists: false},
		{Path: existingPath, Exists: true},
	}
	if !reflect.DeepEqual(prefs.RecentFileStatuses, wantStatuses) {
		t.Fatalf("unexpected recent file statuses: got %#v, want %#v", prefs.RecentFileStatuses, wantStatuses)
	}

	data, err := os.ReadFile(app.preferencePath())
	if err != nil {
		t.Fatal(err)
	}
	if bytes.Contains(data, []byte("recentFileStatuses")) {
		t.Fatalf("derived existence statuses were persisted: %s", data)
	}
}

func TestFavoritesPersistAndRemainIndependentFromRecentFiles(t *testing.T) {
	app := testApp(t)
	dir := t.TempDir()
	filePath := filepath.Join(dir, "favorite.md")
	if err := os.WriteFile(filePath, []byte("# Favorite"), 0o644); err != nil {
		t.Fatal(err)
	}
	if _, err := app.ReadFile(filePath); err != nil {
		t.Fatal(err)
	}

	prefs, err := app.AddFavorite(filePath)
	if err != nil {
		t.Fatal(err)
	}
	if !reflect.DeepEqual(prefs.FavoriteFiles, []string{filePath}) {
		t.Fatalf("favorite was not added: %#v", prefs.FavoriteFiles)
	}
	if _, err := app.AddFavorite(strings.ToUpper(filePath)); err != nil {
		t.Fatal(err)
	}

	// A new App instance proves the record was written to disk rather than
	// being held only in memory.
	restarted := &App{language: "zh-CN", preferencesOverride: app.preferencesOverride}
	prefs, err = restarted.GetPreferences()
	if err != nil {
		t.Fatal(err)
	}
	if !reflect.DeepEqual(prefs.FavoriteFiles, []string{filePath}) {
		t.Fatalf("favorite was not persisted or was duplicated: %#v", prefs.FavoriteFiles)
	}
	if !reflect.DeepEqual(prefs.FavoriteFileStatuses, []RecentFileStatus{{Path: filePath, Exists: true}}) {
		t.Fatalf("unexpected favorite status: %#v", prefs.FavoriteFileStatuses)
	}

	if _, err := restarted.RemoveRecent(filePath); err != nil {
		t.Fatal(err)
	}
	prefs, err = restarted.GetPreferences()
	if err != nil {
		t.Fatal(err)
	}
	if len(prefs.RecentFiles) != 0 || !reflect.DeepEqual(prefs.FavoriteFiles, []string{filePath}) {
		t.Fatalf("removing Recent changed Favorites: recent=%#v favorites=%#v", prefs.RecentFiles, prefs.FavoriteFiles)
	}

	if _, err := restarted.RemoveFavorite(filePath); err != nil {
		t.Fatal(err)
	}
	if _, err := os.Stat(filePath); err != nil {
		t.Fatalf("removing a favorite deleted the original file: %v", err)
	}
}

func TestFavoriteStatusesKeepMissingFilesAvailableForRemoval(t *testing.T) {
	app := testApp(t)
	missingPath := filepath.Join(t.TempDir(), "moved.md")
	if _, err := app.AddFavorite(missingPath); err != nil {
		t.Fatal(err)
	}
	prefs, err := app.GetPreferences()
	if err != nil {
		t.Fatal(err)
	}
	if !reflect.DeepEqual(prefs.FavoriteFiles, []string{missingPath}) {
		t.Fatalf("missing favorite was discarded: %#v", prefs.FavoriteFiles)
	}
	if !reflect.DeepEqual(prefs.FavoriteFileStatuses, []RecentFileStatus{{Path: missingPath, Exists: false}}) {
		t.Fatalf("missing favorite status = %#v", prefs.FavoriteFileStatuses)
	}
	data, err := os.ReadFile(app.preferencePath())
	if err != nil {
		t.Fatal(err)
	}
	if bytes.Contains(data, []byte("favoriteFileStatuses")) {
		t.Fatalf("derived favorite statuses were persisted: %s", data)
	}

	prefs, err = app.RemoveFavorite(missingPath)
	if err != nil {
		t.Fatal(err)
	}
	if len(prefs.FavoriteFiles) != 0 {
		t.Fatalf("missing favorite could not be removed: %#v", prefs.FavoriteFiles)
	}
}

func TestReplacingFavoritedDraftMigratesFavoriteToSavedDocument(t *testing.T) {
	app := testApp(t)
	root := t.TempDir()
	draftPath := filepath.Join(root, "New document-20260810-120000.md")
	savedPath := filepath.Join(root, "notes.md")
	if err := os.WriteFile(draftPath, []byte("draft"), 0o644); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(savedPath, []byte("saved"), 0o644); err != nil {
		t.Fatal(err)
	}
	app.markDraft(draftPath)
	if _, err := app.AddFavorite(draftPath); err != nil {
		t.Fatal(err)
	}

	if replacedPath, err := app.replaceDraft(draftPath, savedPath); err != nil || replacedPath != draftPath {
		t.Fatalf("replaceDraft() = %q, %v; want %q, nil", replacedPath, err, draftPath)
	}
	prefs, err := app.GetPreferences()
	if err != nil {
		t.Fatal(err)
	}
	if !reflect.DeepEqual(prefs.FavoriteFiles, []string{savedPath}) {
		t.Fatalf("draft favorite was not migrated: %#v", prefs.FavoriteFiles)
	}
}

func TestFileOpenBeforeFrontendReadyBecomesInitialDocument(t *testing.T) {
	app := testApp(t)
	filePath := filepath.Join(t.TempDir(), "opened-from-finder.md")
	if err := os.WriteFile(filePath, []byte("# Opened from Finder"), 0o644); err != nil {
		t.Fatal(err)
	}

	app.onFileOpen(filePath)
	doc, err := app.GetInitialFile()
	if err != nil {
		t.Fatal(err)
	}
	if doc == nil || doc.Path != filePath || doc.Content != "# Opened from Finder" {
		t.Fatalf("queued macOS file was not opened: %#v", doc)
	}

	doc, err = app.GetInitialFile()
	if err != nil {
		t.Fatal(err)
	}
	if doc != nil {
		t.Fatalf("initial document should only be consumed once: %#v", doc)
	}
}

func TestSecondInstanceFileOpenBeforeFrontendReadyBecomesInitialDocument(t *testing.T) {
	app := testApp(t)
	filePath := filepath.Join(t.TempDir(), "opened-from-explorer.md")
	if err := os.WriteFile(filePath, []byte("# Opened from Explorer"), 0o644); err != nil {
		t.Fatal(err)
	}

	app.onSecondInstanceLaunch(options.SecondInstanceData{Args: []string{filePath}})
	doc, err := app.GetInitialFile()
	if err != nil {
		t.Fatal(err)
	}
	if doc == nil || doc.Path != filePath || doc.Content != "# Opened from Explorer" {
		t.Fatalf("queued Windows file-association document was not opened: %#v", doc)
	}
}

func TestHideWindowOnCloseOnlyOnMacOS(t *testing.T) {
	if !hideWindowOnClose("darwin") {
		t.Fatal("macOS close button should hide the window")
	}
	for _, platform := range []string{"windows", "linux"} {
		if hideWindowOnClose(platform) {
			t.Fatalf("%s close button must keep the existing quit behaviour", platform)
		}
	}
}

func TestMacApplicationMenuProvidesConventionalCloseAndQuitShortcuts(t *testing.T) {
	applicationMenu := buildApplicationMenu("darwin")
	if applicationMenu == nil || len(applicationMenu.Items) != 3 {
		t.Fatalf("unexpected macOS application menu: %#v", applicationMenu)
	}
	if applicationMenu.Items[0].Role == 0 {
		t.Fatal("the native app menu containing Command+Q must remain present")
	}
	fileMenu := applicationMenu.Items[1]
	if fileMenu.Label != "File" || fileMenu.SubMenu == nil || len(fileMenu.SubMenu.Items) != 1 {
		t.Fatalf("unexpected File menu: %#v", fileMenu)
	}
	closeItem := fileMenu.SubMenu.Items[0]
	if closeItem.Label != "Close Window" || closeItem.Accelerator == nil || closeItem.Accelerator.Key != "w" {
		t.Fatalf("unexpected close-window item: %#v", closeItem)
	}
	if len(closeItem.Accelerator.Modifiers) != 1 || closeItem.Accelerator.Modifiers[0] != keys.CmdOrCtrlKey {
		t.Fatalf("close-window shortcut is not Command+W: %#v", closeItem.Accelerator)
	}
	if buildApplicationMenu("windows") != nil || buildApplicationMenu("linux") != nil {
		t.Fatal("the native macOS application menu must not affect other platforms")
	}
}

func TestFolderListingAndRecentRemoval(t *testing.T) {
	app := testApp(t)
	root := t.TempDir()
	if err := os.MkdirAll(filepath.Join(root, "docs", "nested"), 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.MkdirAll(filepath.Join(root, "node_modules"), 0o755); err != nil {
		t.Fatal(err)
	}
	for path, content := range map[string]string{
		filepath.Join(root, "README.md"):                  "# Root",
		filepath.Join(root, "docs", "guide.markdown"):     "# Guide",
		filepath.Join(root, "docs", "nested", "note.txt"): "note",
		filepath.Join(root, "node_modules", "skip.md"):    "skip",
		filepath.Join(root, "ignore.png"):                 "png",
	} {
		if err := os.WriteFile(path, []byte(content), 0o644); err != nil {
			t.Fatal(err)
		}
	}

	listing, err := app.ListFolder(root)
	if err != nil {
		t.Fatal(err)
	}
	if len(listing.Files) != 3 {
		t.Fatalf("expected 3 Markdown/text files, got %d: %#v", len(listing.Files), listing.Files)
	}
	if err := app.rememberExplorerRoot(listing.Root); err != nil {
		t.Fatal(err)
	}
	restoredPreferences, err := app.GetPreferences()
	if err != nil {
		t.Fatal(err)
	}
	if restoredPreferences.ExplorerRoot != listing.Root {
		t.Fatalf("explorer root was not persisted: got %q, want %q", restoredPreferences.ExplorerRoot, listing.Root)
	}
	if _, err := app.ReadFile(filepath.Join(root, "README.md")); err != nil {
		t.Fatal(err)
	}
	prefs, err := app.RemoveRecent(filepath.Join(root, "README.md"))
	if err != nil {
		t.Fatal(err)
	}
	if len(prefs.RecentFiles) != 0 {
		t.Fatalf("recent record was not removed: %#v", prefs.RecentFiles)
	}
}

func TestLanguagePersistenceAndArgumentDetection(t *testing.T) {
	app := testApp(t)
	markerPath := app.languageSelectionMarkerPath()
	if err := os.MkdirAll(filepath.Dir(markerPath), 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(markerPath, []byte("new-install"), 0o600); err != nil {
		t.Fatal(err)
	}
	if !app.NeedsLanguageSelection() {
		t.Fatal("expected a new installation to require language selection")
	}
	language, err := app.SetLanguage("en")
	if err != nil {
		t.Fatal(err)
	}
	if language != "en" {
		t.Fatalf("expected en, got %s", language)
	}
	prefs, err := app.GetPreferences()
	if err != nil {
		t.Fatal(err)
	}
	if prefs.Language != "en" {
		t.Fatalf("language was not persisted: %#v", prefs)
	}
	if app.NeedsLanguageSelection() {
		t.Fatal("language selection marker was not cleared")
	}

	legacyRoot := t.TempDir()
	legacyPreferences := filepath.Join(legacyRoot, "preferences.json")
	legacyMarker := filepath.Join(legacyRoot, "first-run-language.flag")
	if needsLanguageSelection("windows", legacyPreferences, legacyMarker) {
		t.Fatal("an installation without the new marker must be treated as an upgrade")
	}
	if !needsLanguageSelection("darwin", legacyPreferences, legacyMarker) {
		t.Fatal("a new macOS/Linux installation without preferences should ask for a language")
	}
	if err := os.WriteFile(legacyPreferences, []byte(`{"language":"zh-CN"}`), 0o600); err != nil {
		t.Fatal(err)
	}
	if needsLanguageSelection("linux", legacyPreferences, legacyMarker) {
		t.Fatal("an existing macOS/Linux preference file must suppress the upgrade prompt")
	}

	expected := filepath.Join("C:\\docs", "guide.md")
	if actual := findMarkdownArgument([]string{"app.exe", expected}); actual != expected {
		t.Fatalf("argument detection returned %q", actual)
	}
	if actual := findMarkdownArgument([]string{"app.exe", "image.png"}); actual != "" {
		t.Fatalf("unexpected argument detection: %q", actual)
	}
}

func TestWindowsInstallerIsSimplifiedChineseOnly(t *testing.T) {
	data, err := os.ReadFile(filepath.Join("build", "windows", "installer", "project.nsi"))
	if err != nil {
		t.Fatal(err)
	}
	installer := string(data)
	for _, required := range []string{
		`!define WAILS_WIN10_REQUIRED "轻阅 Markdown 仅支持 Windows 10（Server 2016）及更高版本。"`,
		`!define WAILS_ARCHITECTURE_NOT_SUPPORTED "当前 Windows 系统架构不受支持。支持的架构：${ARCH}"`,
		`!define WAILS_INSTALL_WEBVIEW_DETAILPRINT "正在安装 Microsoft WebView2 运行时"`,
		`!insertmacro MUI_LANGUAGE "SimpChinese"`,
		`StrCpy $LANGUAGE ${LANG_SIMPCHINESE}`,
		`ShowInstDetails nevershow`,
		`Delete "$APPDATA\${INFO_PRODUCTNAME}\first-run-language.flag"`,
		`IfFileExists "$APPDATA\${INFO_PRODUCTNAME}\preferences.json" installerLanguageDone`,
		`$\"language$\":$\"zh-CN$\"`,
		`"使用 ${INFO_PRODUCTNAME} 打开"`,
	} {
		if !strings.Contains(installer, required) {
			t.Errorf("Windows installer is missing initial-language rule %q", required)
		}
	}
	if strings.Contains(installer, `FileOpen $0 "$APPDATA\${INFO_PRODUCTNAME}\first-run-language.flag"`) {
		t.Fatal("Windows installer must not create a marker that asks for language again in the application")
	}
	for _, forbidden := range []string{
		`!insertmacro MUI_LANGUAGE "English"`,
		`MUI_LANGDLL_DISPLAY`,
		`MUI_UNGETLANGUAGE`,
		`${LANG_ENGLISH}`,
		`$\"language$\":$\"en$\"`,
		`Open with ${INFO_PRODUCTNAME}`,
	} {
		if strings.Contains(installer, forbidden) {
			t.Errorf("Windows installer must not contain English/multilingual setup rule %q", forbidden)
		}
	}
}

func TestWindowsInstallerDefaultsToPerUserNonElevatedInstallation(t *testing.T) {
	data, err := os.ReadFile(filepath.Join("build", "windows", "installer", "project.nsi"))
	if err != nil {
		t.Fatal(err)
	}
	installer := string(data)
	includeIndex := strings.Index(installer, `!include "wails_tools.nsh"`)
	userScopeIndex := strings.Index(installer, `!define WAILS_INSTALL_SCOPE "user"`)
	userLevelIndex := strings.Index(installer, `!define REQUEST_EXECUTION_LEVEL "user"`)
	if includeIndex < 0 || userScopeIndex < 0 || userLevelIndex < 0 || userScopeIndex > includeIndex || userLevelIndex > includeIndex {
		t.Fatal("Windows installer must default to a per-user, non-elevated install before loading Wails installer tools")
	}
	if strings.Contains(installer[:includeIndex], `!define REQUEST_EXECUTION_LEVEL "admin"`) {
		t.Fatal("Windows installer must not launch the application at a higher integrity level than Explorer")
	}
}

func TestWindowsInstallerUsesReinstallSafeShortcutIcons(t *testing.T) {
	data, err := os.ReadFile(filepath.Join("build", "windows", "installer", "project.nsi"))
	if err != nil {
		t.Fatal(err)
	}
	installer := string(data)

	if strings.Contains(installer, `File "/oname=QuilliteMarkdown-${INFO_PRODUCTVERSION}.ico"`) {
		t.Fatal("Windows installer must not overwrite a standalone shortcut icon that Explorer may still have locked")
	}
	for _, required := range []string{
		`CreateShortcut "$SMPROGRAMS\${INFO_PRODUCTNAME}.lnk" "$INSTDIR\${PRODUCT_EXECUTABLE}" "" "$INSTDIR\${PRODUCT_EXECUTABLE}" 0`,
		`CreateShortCut "$DESKTOP\${INFO_PRODUCTNAME}.lnk" "$INSTDIR\${PRODUCT_EXECUTABLE}" "" "$INSTDIR\${PRODUCT_EXECUTABLE}" 0`,
		`Delete /REBOOTOK "$INSTDIR\QuilliteMarkdown-*.ico"`,
	} {
		if !strings.Contains(installer, required) {
			t.Errorf("Windows installer is missing reinstall-safe shortcut rule %q", required)
		}
	}
}

func TestWindowsInstallerUsesReinstallSafeFileAssociationIcons(t *testing.T) {
	data, err := os.ReadFile(filepath.Join("build", "windows", "installer", "project.nsi"))
	if err != nil {
		t.Fatal(err)
	}
	installer := string(data)

	if strings.Contains(installer, `!insertmacro wails.associateFiles`) {
		t.Fatal("Windows installer must not use Wails file associations that overwrite a standalone icon")
	}
	for _, required := range []string{
		`!macro AssociateMarkdownFiles`,
		`!insertmacro APP_ASSOCIATE "md" "Markdown Document" "Markdown 文档" "$INSTDIR\${PRODUCT_EXECUTABLE},0"`,
		`!insertmacro APP_ASSOCIATE "txt" "Text Document" "文本文件" "$INSTDIR\${PRODUCT_EXECUTABLE},0"`,
		`!insertmacro AssociateMarkdownFiles`,
		`Delete /REBOOTOK "$INSTDIR\mdFileIcon.ico"`,
	} {
		if !strings.Contains(installer, required) {
			t.Errorf("Windows installer is missing reinstall-safe file-association rule %q", required)
		}
	}
}

func TestWindowsInstallerOffersToCloseALockedRunningApplication(t *testing.T) {
	data, err := os.ReadFile(filepath.Join("build", "windows", "installer", "project.nsi"))
	if err != nil {
		t.Fatal(err)
	}
	installer := string(data)

	for _, required := range []string{
		`LangString CloseRunningAppPrompt ${LANG_SIMPCHINESE}`,
		`Function EnsureApplicationClosed`,
		`Call EnsureApplicationClosed`,
		`MessageBox MB_YESNO|MB_ICONEXCLAMATION "$(CloseRunningAppPrompt)"`,
		`nsExec::ExecToStack '"$SYSDIR\taskkill.exe" /F /T /IM "${PRODUCT_EXECUTABLE}"'`,
	} {
		if !strings.Contains(installer, required) {
			t.Errorf("Windows installer is missing running-application handling %q", required)
		}
	}

	closeCheck := strings.Index(installer, `Call EnsureApplicationClosed`)
	fileWrite := strings.Index(installer, `!insertmacro wails.files`)
	if closeCheck < 0 || fileWrite < 0 || closeCheck > fileWrite {
		t.Fatal("Windows installer must handle the running application before overwriting executable files")
	}
}

func TestCompareVersions(t *testing.T) {
	tests := []struct {
		left, right string
		want        int
	}{
		{"v2.2.0", "2.1.0", 1},
		{"2.1.0", "2.1.0", 0},
		{"2.0.9", "2.1.0", -1},
		{"v2.1.10", "2.1.9", 1},
		{"2.1.0-beta.1", "2.1.0", 0},
		{"2.1", "2.1.0", 0},
	}
	for _, test := range tests {
		if got := compareVersions(test.left, test.right); got != test.want {
			t.Errorf("compareVersions(%q, %q) = %d, want %d", test.left, test.right, got, test.want)
		}
	}
}

func TestReleaseVersionConsistency(t *testing.T) {
	var wailsConfig struct {
		Info struct {
			ProductVersion string `json:"productVersion"`
		} `json:"info"`
	}
	data, err := os.ReadFile("wails.json")
	if err != nil {
		t.Fatal(err)
	}
	if err := json.Unmarshal(data, &wailsConfig); err != nil {
		t.Fatal(err)
	}
	if wailsConfig.Info.ProductVersion != appVersion {
		t.Fatalf("wails.json version %q does not match app version %q", wailsConfig.Info.ProductVersion, appVersion)
	}

	var frontendPackage struct {
		Version string `json:"version"`
	}
	data, err = os.ReadFile(filepath.Join("frontend", "package.json"))
	if err != nil {
		t.Fatal(err)
	}
	if err := json.Unmarshal(data, &frontendPackage); err != nil {
		t.Fatal(err)
	}
	if frontendPackage.Version != appVersion {
		t.Fatalf("frontend version %q does not match app version %q", frontendPackage.Version, appVersion)
	}

	visibleVersionFiles := []string{
		filepath.Join("frontend", "index.html"),
		filepath.Join("frontend", "src", "main.js"),
		filepath.Join("frontend", "src", "renderer.js"),
		filepath.Join("build", "windows", "installer", "project.nsi"),
	}
	for _, path := range visibleVersionFiles {
		data, err = os.ReadFile(path)
		if err != nil {
			t.Fatal(err)
		}
		if !strings.Contains(string(data), appVersion) {
			t.Errorf("%s does not contain release version %s", path, appVersion)
		}
	}
}

func TestMacBundleUsesProductDisplayNameAndCanonicalFilename(t *testing.T) {
	for _, path := range []string{
		filepath.Join("build", "darwin", "Info.plist"),
		filepath.Join("build", "darwin", "Info.dev.plist"),
	} {
		data, err := os.ReadFile(path)
		if err != nil {
			t.Fatal(err)
		}
		plist := string(data)
		if !strings.Contains(plist, "<key>CFBundleDisplayName</key>") ||
			!strings.Contains(plist, "<string>{{.Info.ProductName}}</string>") {
			t.Errorf("%s must expose the configured product name through CFBundleDisplayName", path)
		}
		if !strings.Contains(plist, "<key>CFBundleIdentifier</key>") ||
			!strings.Contains(plist, "<string>com.liuhang.quillite-markdown</string>") {
			t.Errorf("%s must keep a stable bundle identifier for macOS privacy permissions", path)
		}
		for _, privacyKey := range []string{
			"NSDocumentsFolderUsageDescription",
			"NSDesktopFolderUsageDescription",
			"NSDownloadsFolderUsageDescription",
			"NSNetworkVolumesUsageDescription",
			"NSRemovableVolumesUsageDescription",
		} {
			if !strings.Contains(plist, "<key>"+privacyKey+"</key>") {
				t.Errorf("%s must declare %s", path, privacyKey)
			}
		}
	}

	buildScript, err := os.ReadFile(filepath.Join("scripts", "build-macos.sh"))
	if err != nil {
		t.Fatal(err)
	}
	if !strings.Contains(string(buildScript), `app_name="轻阅 Markdown.app"`) {
		t.Fatal("macOS build wrapper must normalize the bundle filename to 轻阅 Markdown.app")
	}
	if !strings.Contains(string(buildScript), `codesign --force --deep --sign -`) ||
		!strings.Contains(string(buildScript), `codesign --verify --deep --strict`) {
		t.Fatal("macOS build wrapper must sign and verify the complete application bundle")
	}

	workflow, err := os.ReadFile(filepath.Join(".github", "workflows", "release.yml"))
	if err != nil {
		t.Fatal(err)
	}
	workflowText := string(workflow)
	if !strings.Contains(workflowText, "bash scripts/build-macos.sh darwin/universal") ||
		!strings.Contains(workflowText, `app_path="build/bin/轻阅 Markdown.app"`) {
		t.Fatal("release workflow must build and package the canonical macOS app bundle")
	}
	if !strings.Contains(workflowText, `touch "${staging_dir}/.metadata_never_index"`) {
		t.Fatal("macOS DMG must opt out of metadata indexing so its mounted app is not shown as a duplicate")
	}
	if !strings.Contains(workflowText, `macos-universal.zip`) ||
		!strings.Contains(workflowText, `/usr/bin/ditto -c -k --sequesterRsrc --keepParent`) ||
		strings.Contains(workflowText, `cp "${binary}" "${release_dir}/quillite-markdown-${APP_VERSION}-macos-universal.bin"`) {
		t.Fatal("macOS in-app updates must publish the signed complete .app archive, never a raw executable")
	}
}

func TestMountedMacInstallerImageDetectionIsNarrow(t *testing.T) {
	volumesRoot := t.TempDir()
	validMount := filepath.Join(volumesRoot, appNameZH)
	validApp := filepath.Join(validMount, appNameZH+".app", "Contents")
	if err := os.MkdirAll(validApp, 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.Symlink(string(filepath.Separator)+"Applications", filepath.Join(validMount, "Applications")); err != nil {
		t.Skipf("platform does not permit creating the macOS installer test symlink: %v", err)
	}
	validPlist := "<plist><dict><key>CFBundleIdentifier</key><string>" + macBundleIdentifier + "</string></dict></plist>"
	if err := os.WriteFile(filepath.Join(validApp, "Info.plist"), []byte(validPlist), 0o644); err != nil {
		t.Fatal(err)
	}

	wrongBundleMount := filepath.Join(volumesRoot, appNameZH+" 1")
	wrongBundleApp := filepath.Join(wrongBundleMount, appNameZH+".app", "Contents")
	if err := os.MkdirAll(wrongBundleApp, 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.Symlink(string(filepath.Separator)+"Applications", filepath.Join(wrongBundleMount, "Applications")); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(wrongBundleApp, "Info.plist"), []byte("<plist><dict><key>CFBundleIdentifier</key><string>example.invalid</string></dict></plist>"), 0o644); err != nil {
		t.Fatal(err)
	}

	matches := findMountedMacInstallerImages(volumesRoot)
	if len(matches) != 1 || matches[0] != validMount {
		t.Fatalf("installer image matches = %#v, want only %q", matches, validMount)
	}
	if !isInstalledMacApplication(filepath.Join(string(filepath.Separator), "Applications", appNameZH+".app", "Contents", "MacOS", "QuilliteMarkdown"), "/Users/test") {
		t.Fatal("the system Applications folder must be recognized as an installed app location")
	}
	if isInstalledMacApplication(filepath.Join(string(filepath.Separator), "Volumes", appNameZH, appNameZH+".app", "Contents", "MacOS", "QuilliteMarkdown"), "/Users/test") {
		t.Fatal("an app running from a mounted installer image must never attempt to eject itself")
	}
}

func TestPlainTextFilesAreSupportedEverywhere(t *testing.T) {
	if !markdownExtensions[".txt"] {
		t.Fatal("markdownExtensions must include .txt so folders, command-line args and drag-in accept plain text files")
	}
	var wailsConfig struct {
		Info struct {
			FileAssociations []struct {
				Ext         string `json:"ext"`
				Name        string `json:"name"`
				Description string `json:"description"`
			} `json:"fileAssociations"`
		} `json:"info"`
	}
	data, err := os.ReadFile("wails.json")
	if err != nil {
		t.Fatal(err)
	}
	if err := json.Unmarshal(data, &wailsConfig); err != nil {
		t.Fatal(err)
	}
	foundTXT := false
	for _, association := range wailsConfig.Info.FileAssociations {
		if association.Ext == "txt" {
			foundTXT = true
			if association.Name != "Text Document" || association.Description == "" {
				t.Fatalf("txt association metadata is incomplete: %+v", association)
			}
		}
	}
	if !foundTXT {
		t.Fatal("wails.json fileAssociations must include a .txt entry so the installer registers plain text files")
	}
}

func TestApplicationIconAssetsUseTransparentBrightGreenBrand(t *testing.T) {
	for _, path := range []string{
		filepath.Join("build", "appicon.png"),
		filepath.Join("frontend", "src", "assets", "images", "app-logo.png"),
	} {
		file, err := os.Open(path)
		if err != nil {
			t.Fatal(err)
		}
		icon, err := png.Decode(file)
		file.Close()
		if err != nil {
			t.Fatalf("decode %s: %v", path, err)
		}
		assertTransparentBrightGreenIcon(t, path, icon)
	}

	windowsIcon, err := os.ReadFile(filepath.Join("build", "windows", "icon.ico"))
	if err != nil {
		t.Fatal(err)
	}
	rootIcon, err := os.ReadFile(filepath.Join("build", "appicon.ico"))
	if err != nil {
		t.Fatal(err)
	}
	if !bytes.Equal(rootIcon, windowsIcon) {
		t.Fatal("build/appicon.ico and build/windows/icon.ico must be identical")
	}

	sizes, largestPNG, err := icoSizesAndLargestPNG(rootIcon)
	if err != nil {
		t.Fatal(err)
	}
	wantSizes := []int{16, 24, 32, 48, 64, 96, 128, 192, 256}
	if !reflect.DeepEqual(sizes, wantSizes) {
		t.Fatalf("Windows icon sizes = %v, want %v", sizes, wantSizes)
	}
	icon, err := png.Decode(bytes.NewReader(largestPNG))
	if err != nil {
		t.Fatalf("decode largest Windows icon: %v", err)
	}
	assertTransparentBrightGreenIcon(t, "build/windows/icon.ico", icon)
}

func assertTransparentBrightGreenIcon(t *testing.T, name string, icon image.Image) {
	t.Helper()
	bounds := icon.Bounds()
	for _, point := range []image.Point{
		bounds.Min,
		{X: bounds.Max.X - 1, Y: bounds.Min.Y},
		{X: bounds.Min.X, Y: bounds.Max.Y - 1},
		{X: bounds.Max.X - 1, Y: bounds.Max.Y - 1},
	} {
		_, _, _, alpha := icon.At(point.X, point.Y).RGBA()
		if alpha != 0 {
			t.Fatalf("%s corner %v alpha = %d, want 0", name, point, alpha)
		}
	}

	sampleX := bounds.Min.X + bounds.Dx()/2
	sampleY := bounds.Min.Y + bounds.Dy()/8
	red16, green16, blue16, alpha16 := icon.At(sampleX, sampleY).RGBA()
	red, green, blue, alpha := uint8(red16>>8), uint8(green16>>8), uint8(blue16>>8), uint8(alpha16>>8)
	if alpha < 250 || green < 150 || int(green)-int(red) < 60 || int(green)-int(blue) < 40 {
		t.Fatalf("%s theme sample = rgba(%d,%d,%d,%d), want opaque bright green", name, red, green, blue, alpha)
	}
}

func icoSizesAndLargestPNG(data []byte) ([]int, []byte, error) {
	if len(data) < 6 || binary.LittleEndian.Uint16(data[0:2]) != 0 || binary.LittleEndian.Uint16(data[2:4]) != 1 {
		return nil, nil, errors.New("invalid ICO header")
	}
	count := int(binary.LittleEndian.Uint16(data[4:6]))
	if len(data) < 6+count*16 {
		return nil, nil, errors.New("truncated ICO directory")
	}
	sizes := make([]int, 0, count)
	var largest []byte
	for index := 0; index < count; index++ {
		offset := 6 + index*16
		width := int(data[offset])
		if width == 0 {
			width = 256
		}
		sizes = append(sizes, width)
		length := int(binary.LittleEndian.Uint32(data[offset+8 : offset+12]))
		imageOffset := int(binary.LittleEndian.Uint32(data[offset+12 : offset+16]))
		if imageOffset < 0 || length < 0 || imageOffset+length > len(data) {
			return nil, nil, errors.New("invalid ICO image entry")
		}
		if width == 256 {
			largest = data[imageOffset : imageOffset+length]
		}
	}
	if len(largest) == 0 {
		return nil, nil, errors.New("ICO has no 256px image")
	}
	return sizes, largest, nil
}

func TestSelectMacSecurityBookmarkPrefersExactFileThenDeepestFolder(t *testing.T) {
	root := filepath.Join(t.TempDir(), "Documents")
	project := filepath.Join(root, "Project")
	document := filepath.Join(project, "notes", "README.md")
	bookmarks := map[string]macSecurityBookmarkEntry{
		root: {
			ScopePath: root,
			Data:      "root-bookmark",
			Directory: true,
		},
		project: {
			ScopePath: project,
			Data:      "project-bookmark",
			Directory: true,
		},
	}

	selected, ok := selectMacSecurityBookmark(bookmarks, document)
	if !ok || selected.Data != "project-bookmark" {
		t.Fatalf("selected bookmark = %#v, %v; want deepest project folder", selected, ok)
	}

	bookmarks[document] = macSecurityBookmarkEntry{ScopePath: document, Data: "file-bookmark"}
	selected, ok = selectMacSecurityBookmark(bookmarks, document)
	if !ok || selected.Data != "file-bookmark" {
		t.Fatalf("selected bookmark = %#v, %v; want exact file bookmark", selected, ok)
	}
}

func TestSelectMacSecurityBookmarkRejectsSiblingPrefix(t *testing.T) {
	base := t.TempDir()
	root := filepath.Join(base, "Project")
	sibling := filepath.Join(base, "Project-copy", "README.md")
	bookmarks := map[string]macSecurityBookmarkEntry{
		root: {ScopePath: root, Data: "project-bookmark", Directory: true},
	}
	if selected, ok := selectMacSecurityBookmark(bookmarks, sibling); ok {
		t.Fatalf("unexpected sibling bookmark match: %#v", selected)
	}
}

func TestOpenReferenceDocumentMaterialisesAllBundledExamples(t *testing.T) {
	app := testApp(t)
	app.referenceOverride = t.TempDir()

	tests := []struct {
		kind string
		name string
		want string
	}{
		{kind: "charts", name: "图表案例.MD", want: "# 图表案例大全"},
		{kind: "formulas", name: "科学公式案例.MD", want: "# 科学公式案例大全"},
		{kind: "formats", name: "常规内容案例.MD", want: "# Markdown 常规内容格式大全"},
	}

	for _, tc := range tests {
		t.Run(tc.kind, func(t *testing.T) {
			doc, err := app.OpenReferenceDocument(tc.kind)
			if err != nil {
				t.Fatalf("OpenReferenceDocument(%q): %v", tc.kind, err)
			}
			if doc.Name != tc.name {
				t.Fatalf("name = %q, want %q", doc.Name, tc.name)
			}
			if !strings.Contains(doc.Content, tc.want) {
				t.Fatalf("content does not contain %q", tc.want)
			}
			if !doc.ReadOnly {
				t.Fatal("built-in reference document must be marked read-only")
			}
			if _, err := os.Stat(doc.Path); err != nil {
				t.Fatalf("materialised document missing: %v", err)
			}
			if _, err := app.SaveFile(doc.Path, "changed"); err == nil {
				t.Fatal("SaveFile should reject writes to a built-in reference document")
			}
		})
	}

	if _, err := app.OpenReferenceDocument("unknown"); err == nil {
		t.Fatal("unknown reference kind should fail")
	}

	prefs, err := app.GetPreferences()
	if err != nil {
		t.Fatal(err)
	}
	if len(prefs.RecentFiles) != 0 || prefs.LastFile != "" {
		t.Fatalf("built-in references entered Recent: recent=%#v last=%q", prefs.RecentFiles, prefs.LastFile)
	}
}

func TestReferenceDocumentsAreRemovedFromLegacyRecentButSavedCopiesRemain(t *testing.T) {
	app := testApp(t)
	app.referenceOverride = t.TempDir()

	name, content, err := referenceDocument("charts")
	if err != nil {
		t.Fatal(err)
	}
	referencePath, err := materialiseReferenceDocument(app.referenceOverride, name, content)
	if err != nil {
		t.Fatal(err)
	}
	copyDirectory := t.TempDir()
	copyPath := filepath.Join(copyDirectory, name)
	if err := os.WriteFile(copyPath, []byte("# 用户另存的可编辑副本"), 0o644); err != nil {
		t.Fatal(err)
	}

	legacy := defaultPreferences()
	legacy.RecentFiles = []string{referencePath, copyPath}
	legacy.PinnedRecentFiles = []string{referencePath}
	legacy.LastFile = referencePath
	data, err := json.Marshal(legacy)
	if err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(app.preferencePath(), data, 0o644); err != nil {
		t.Fatal(err)
	}

	prefs, err := app.GetPreferences()
	if err != nil {
		t.Fatal(err)
	}
	if !reflect.DeepEqual(prefs.RecentFiles, []string{copyPath}) {
		t.Fatalf("reference cleanup removed the user copy or retained the built-in file: %#v", prefs.RecentFiles)
	}
	if len(prefs.PinnedRecentFiles) != 0 || prefs.LastFile != copyPath {
		t.Fatalf("reference cleanup left stale state: pins=%#v last=%q", prefs.PinnedRecentFiles, prefs.LastFile)
	}

	doc, err := app.ReadFile(copyPath)
	if err != nil {
		t.Fatal(err)
	}
	if doc.ReadOnly {
		t.Fatal("a user-saved copy outside the built-in directory must remain editable")
	}
	prefs, err = app.GetPreferences()
	if err != nil {
		t.Fatal(err)
	}
	if !reflect.DeepEqual(prefs.RecentFiles, []string{copyPath}) {
		t.Fatalf("user-saved copy did not remain in Recent: %#v", prefs.RecentFiles)
	}
}
