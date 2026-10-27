package main

import (
	"os"
	"path/filepath"
	"testing"
)

func TestPicGoCLIHTTPOutputRequiresOptIn(t *testing.T) {
	for _, address := range []string{
		"http://example.org/image.png",
		"HTTP://example.org/a%20b.png?token=x&size=2#image",
		"http://127.0.0.1:8080/image.png",
		"http://[::1]:8080/image.png",
	} {
		output := "[PicGo SUCCESS]:\n" + address + "\n[PicGo WARN]: log rotated"
		if got, err := picGoCLIImageURL(output, false); got != "" || err == nil || err.Error() != "PICGO_CLI_HTTP_NOT_ALLOWED" {
			t.Fatalf("default must report protocol refusal: %q %v", got, err)
		}
		if got, err := picGoCLIImageURL(output, true); got != address || err != nil {
			t.Fatalf("opt-in must preserve exact URL: %q %v", got, err)
		}
	}
	for _, output := range []string{
		"http://example.org/a",
		"[PicGo SUCCESS]:\nhttp:///a",
		"[PicGo SUCCESS]:\nhttp://user:secret@example.org/a",
		"[PicGo SUCCESS]:\nhttp://example.org/a b",
		"[PicGo SUCCESS]:\nhttp://example.org/a\nhttps://example.org/b",
		"[PicGo SUCCESS]:\nhttp://example.org/a\nhttp://example.org/b",
		"[PicGo SUCCESS]:\nhttp://example.org/a\n[PicGo ERROR]: failed",
		"[PicGo SUCCESS]:\nfile:///tmp/image.png",
		"[PicGo SUCCESS]:\njavascript:alert(1)",
		"[PicGo SUCCESS]:\ndata:image/png;base64,x",
	} {
		for _, allow := range []bool{false, true} {
			if got, err := picGoCLIImageURL(output, allow); got != "" || err == nil || err.Error() != "PICGO_CLI_OUTPUT_INVALID" {
				t.Fatalf("invalid output accepted (allow=%t): %q %v", allow, got, err)
			}
		}
	}
}

func TestPicGoCLIHTTPVerificationPersistenceAndUpload(t *testing.T) {
	app := testApp(t)
	path := fakePicGoCLI(t, `console.log('[PicGo SUCCESS]:\nhttp://example.org/image.png');`)
	config := fakePicGoCLIConfig(t)
	input := ImageUploadSettingsInput{Mode: imageUploadModePicGoCLI, CLIPath: path, CLIConfigPath: config, CLIAllowHTTP: true}
	if _, err := app.TestPicGoCLIUpload(path, config, false, true); err == nil {
		t.Fatal("HTTP consent must not replace upload consent")
	}
	if _, err := app.TestPicGoCLIUpload(path, config, true, false); err == nil || err.Error() != "PICGO_CLI_HTTP_NOT_ALLOWED" {
		t.Fatalf("expected protocol refusal: %v", err)
	}
	if _, err := app.SetImageUploadSettings(input); err == nil {
		t.Fatal("refused test must not enable uploading")
	}
	if got, err := app.TestPicGoCLIUpload(path, config, true, true); err != nil || got != "http://example.org/image.png" {
		t.Fatalf("explicit HTTP test: %q %v", got, err)
	}
	if app.picGoCLIUploadVerified(path, config, false) || !app.picGoCLIUploadVerified(path, config, true) {
		t.Fatal("verification must bind HTTP policy")
	}
	if _, err := app.SetImageUploadSettings(input); err != nil {
		t.Fatal(err)
	}
	saved, err := app.GetImageUploadSettings()
	if err != nil || !saved.CLIAllowHTTP {
		t.Fatalf("HTTP consent not persisted: %#v %v", saved, err)
	}
	doc := filepath.Join(t.TempDir(), "note.md")
	asset, err := app.SavePastedImage(doc, "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=")
	if err != nil {
		t.Fatal(err)
	}
	got, err := app.UploadImageToPicGoCLI(doc, asset, "http-test")
	if err != nil || got != "http://example.org/image.png" {
		t.Fatalf("saved HTTP policy not used: %q %v", got, err)
	}
	// Old preferences have no opt-in. Reading those must enforce HTTPS even
	// when the CLI successfully uploads; the original local asset remains.
	if _, err := app.updatePreferences(func(prefs *Preferences) { prefs.PicGoCLIAllowHTTP = false }); err != nil {
		t.Fatal(err)
	}
	if got, err := app.UploadImageToPicGoCLI(doc, asset, "http-refused"); got != "" || err == nil || err.Error() != "PICGO_CLI_HTTP_NOT_ALLOWED" {
		t.Fatalf("missing opt-in accepted: %q %v", got, err)
	}
	if info, err := os.Stat(filepath.Join(filepath.Dir(doc), filepath.FromSlash(asset))); err != nil || info.Size() != 68 {
		t.Fatal("local backup lost")
	}
}

func TestPicGoCLIHTTPSVerificationCannotAuthorizeHTTP(t *testing.T) {
	app := testApp(t)
	path := fakePicGoCLI(t, `console.log('[PicGo SUCCESS]:\nhttps://example.org/image.png');`)
	config := fakePicGoCLIConfig(t)
	if _, err := app.TestPicGoCLIUpload(path, config, true, false); err != nil {
		t.Fatal(err)
	}
	input := ImageUploadSettingsInput{Mode: imageUploadModePicGoCLI, CLIPath: path, CLIConfigPath: config, CLIAllowHTTP: true}
	if _, err := app.SetImageUploadSettings(input); err == nil || err.Error() != "PICGO_CLI_TEST_REQUIRED" {
		t.Fatalf("policy changed without verification: %v", err)
	}
}
