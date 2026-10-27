package main

import (
	"context"
	"encoding/base64"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"testing"
	"time"
)

func fakePicGoCLI(t *testing.T, script string) string {
	t.Helper()
	if _, err := exec.LookPath("node"); err != nil {
		t.Skip("Node.js required for CLI integration")
	}
	dir := filepath.Join(t.TempDir(), "中文 space & percent%")
	if err := os.MkdirAll(dir, 0700); err != nil {
		t.Fatal(err)
	}
	path := filepath.Join(dir, "picgo.cjs")
	if err := os.WriteFile(path, []byte(script), 0600); err != nil {
		t.Fatal(err)
	}
	return path
}

func TestPicGoCLIOutputValidation(t *testing.T) {
	for _, output := range []string{
		"[PicGo SUCCESS]:\nhttps://example.org/image.png\n",
		"[PicGo SUCCESS]:\nhttps://example.org/image.png\n[PicGo WARN]: Log file is too large, recreate log file\n",
		"[PicGo INFO]: uploading\n\x1b[32m[PicGo SUCCESS]:\x1b[0m\r\nhttps://example.org/a%20b.png?token=x\r\n",
	} {
		if _, err := picGoCLIImageURL(output, false); err != nil {
			t.Fatal(err)
		}
	}
	for _, output := range []string{
		"", "https://example.org/help", "[PicGo SUCCESS]:\nhttp://example.org/x",
		"[PicGo SUCCESS]:\nhttps://user:secret@example.org/x", "[PicGo SUCCESS]:\nhttps:///x",
		"[PicGo SUCCESS]:\nhttps://example.org/a b", "[PicGo SUCCESS]:\nhttps://example.org/a\nhttps://example.org/b",
		"[PicGo SUCCESS]:\nhttps://example.org/x\n[PicGo ERROR]: failed",
	} {
		if _, err := picGoCLIImageURL(output, false); err == nil {
			t.Fatalf("accepted invalid output %q", output)
		}
	}
	var buffer picGoCLIOutput
	input := []byte(strings.Repeat("x", maxPicGoResponseSize+1024))
	if n, err := buffer.Write(input); n != len(input) || err != nil || !buffer.overflow || len(buffer.data) != maxPicGoResponseSize {
		t.Fatal("unbounded CLI output")
	}
}

func TestPicGoCLISettingsAndVersion(t *testing.T) {
	path := fakePicGoCLI(t, `if(process.argv[2]==='--version')console.log('3.2.0');else if(process.argv[4]==='upload')console.log('[PicGo SUCCESS]:\nhttps://example.org/test.png');else process.exit(9);`)
	config := fakePicGoCLIConfig(t)
	app := testApp(t)
	version, err := app.TestPicGoCLI(path)
	if err != nil || version != "3.2.0" {
		t.Fatalf("version %q %v", version, err)
	}
	input := ImageUploadSettingsInput{Mode: imageUploadModePicGoCLI, CLIPath: path, CLIConfigPath: config}
	if _, err := app.SetImageUploadSettings(input); err == nil {
		t.Fatal("version-only check enabled uploads")
	}
	if _, err := app.TestPicGoCLIUpload(path, config, true, false); err != nil {
		t.Fatal(err)
	}
	settings, err := app.SetImageUploadSettings(input)
	if err != nil || settings.Mode != imageUploadModePicGoCLI || settings.CLIPath != path {
		t.Fatalf("save %#v %v", settings, err)
	}
	saved, err := app.GetImageUploadSettings()
	if err != nil || saved.CLIPath != path || saved.Mode != imageUploadModePicGoCLI {
		t.Fatalf("load %#v %v", saved, err)
	}
	for _, invalid := range []string{"relative/path", path + " --evil", path + "\n" + "evil"} {
		if _, err := app.SetImageUploadSettings(ImageUploadSettingsInput{Mode: imageUploadModePicGoCLI, CLIPath: invalid}); err == nil {
			t.Fatalf("accepted %q", invalid)
		}
	}
	for _, mode := range []string{"local", "embedded", "picgo", "picgo-cloud", "picgo-cli"} {
		if normaliseImageUploadMode(mode) != mode {
			t.Fatal(mode)
		}
	}
	if normaliseImageUploadMode("") != "local" {
		t.Fatal("legacy default changed")
	}
}

func TestPicGoCLINpmShimNeverUsesShell(t *testing.T) {
	script := fakePicGoCLI(t, "console.log('3.2.0')")
	dir := filepath.Dir(script)
	shim := filepath.Join(dir, "picgo.cmd")
	if err := os.WriteFile(shim, []byte("DO NOT EXECUTE THIS SHELL SCRIPT"), 0600); err != nil {
		t.Fatal(err)
	}
	if _, _, err := resolvePicGoCLI(shim); err == nil {
		t.Fatal("unverified shim accepted")
	}
	pkg := filepath.Join(dir, "node_modules", "picgo")
	if err := os.MkdirAll(filepath.Join(pkg, "bin"), 0700); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(pkg, "package.json"), []byte(`{"name":"picgo"}`), 0600); err != nil {
		t.Fatal(err)
	}
	entry := filepath.Join(pkg, "bin", "picgo")
	if err := os.WriteFile(entry, []byte("console.log('3.2.0')"), 0600); err != nil {
		t.Fatal(err)
	}
	program, args, err := resolvePicGoCLI(shim)
	if err != nil || !strings.HasPrefix(strings.ToLower(filepath.Base(program)), "node") || len(args) != 1 || args[0] != entry {
		t.Fatalf("unsafe shim resolution %q %v %v", program, args, err)
	}
	if version, err := testApp(t).TestPicGoCLI(shim); err != nil || version != "3.2.0" {
		t.Fatalf("shim version %q %v", version, err)
	}
}

func TestPicGoCLIPrivateSnapshotCleanupAndOriginalPreservation(t *testing.T) {
	for _, scenario := range []string{"success", "exit", "invalid", "timeout"} {
		t.Run(scenario, func(t *testing.T) {
			stageDir := t.TempDir()
			t.Setenv("TMPDIR", stageDir)
			t.Setenv("TMP", stageDir)
			t.Setenv("TEMP", stageDir)
			original := filepath.Join(stageDir, "用户 & 原始.png")
			data := []byte("validated snapshot")
			if err := os.WriteFile(original, data, 0600); err != nil {
				t.Fatal(err)
			}
			script := `const fs=require('fs');if(process.argv.length!==4||process.argv[2]!=='upload')process.exit(11);const p=process.argv[3];if(!p.includes('quillite-picgo-')||fs.readFileSync(p,'utf8')!=='validated snapshot')process.exit(12);fs.writeFileSync(p,'plugin modified snapshot');`
			switch scenario {
			case "success":
				script += `console.log('[PicGo SUCCESS]:\nhttps://example.org/test.png');`
			case "exit":
				script += `console.error('secret must not escape');process.exit(2);`
			case "invalid":
				script += `console.log('invalid output');`
			case "timeout":
				script += `setInterval(()=>{},1000);`
			}
			path := fakePicGoCLI(t, script)
			ctx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
			defer cancel()
			result, err := uploadPicGoCLISnapshot(ctx, path, filepath.Base(original), data)
			if scenario == "success" {
				if err != nil || result != "https://example.org/test.png" {
					t.Fatalf("%q %v", result, err)
				}
			} else if err == nil || strings.Contains(err.Error(), "secret") {
				t.Fatalf("unsafe failure %v", err)
			}
			contents, err := os.ReadFile(original)
			if err != nil || string(contents) != string(data) {
				t.Fatal("original modified/deleted")
			}
			entries, err := os.ReadDir(stageDir)
			if err != nil {
				t.Fatal(err)
			}
			for _, entry := range entries {
				if strings.HasPrefix(entry.Name(), "quillite-picgo-") {
					t.Fatal("owned snapshot not cleaned")
				}
			}
		})
	}
}

func TestPicGoCLIUploadUsesAssetsAndModeGuard(t *testing.T) {
	app := testApp(t)
	path := fakePicGoCLI(t, `const fs=require('fs');if(process.argv.length!==6||process.argv[4]!=='upload')process.exit(1);if(fs.readFileSync(process.argv[5])[0]!==137)process.exit(2);console.log('[PicGo SUCCESS]:\nhttps://example.org/image.png');`)
	config := fakePicGoCLIConfig(t)
	doc := filepath.Join(t.TempDir(), "note.md")
	png := "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII="
	image, err := app.SavePastedImage(doc, "data:image/png;base64,"+png)
	if err != nil {
		t.Fatal(err)
	}
	if _, err = app.UploadImageToPicGoCLI(doc, image, "cli-test"); err == nil {
		t.Fatal("disabled upload allowed")
	}
	if _, err = app.TestPicGoCLIUpload(path, config, true, false); err != nil {
		t.Fatal(err)
	}
	if _, err = app.SetImageUploadSettings(ImageUploadSettingsInput{Mode: imageUploadModePicGoCLI, CLIPath: path, CLIConfigPath: config}); err != nil {
		t.Fatal(err)
	}
	if _, err = app.UploadImageToPicGoCLI(doc, image, ""); err == nil {
		t.Fatal("invalid operation accepted")
	}
	url, err := app.UploadImageToPicGoCLI(doc, image, "cli-test")
	if err != nil || url != "https://example.org/image.png" {
		t.Fatalf("%q %v", url, err)
	}
	original, err := os.ReadFile(filepath.Join(filepath.Dir(doc), filepath.FromSlash(image)))
	expected, _ := base64.StdEncoding.DecodeString(png)
	if err != nil || string(original) != string(expected) {
		t.Fatal("asset lost")
	}
	if _, err = app.UploadImageToPicGoCLI(doc, path, "cli-test"); err == nil {
		t.Fatal("outside assets allowed")
	}
}
