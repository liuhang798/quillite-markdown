package main

import (
	"bytes"
	"encoding/base64"
	"image"
	"image/color"
	"image/png"
	"os"
	"path/filepath"
	"reflect"
	"strings"
	"testing"
)

func TestNormaliseExportSettingsKeepsSafeUniquePresets(t *testing.T) {
	settings := normaliseExportSettings(ExportSettings{
		PandocPath: ` C:\Tools\pandoc.exe `,
		Presets: []ExportPreset{
			{ID: "web", Name: " Web ", Format: "html-plain", ImageScale: 9, ImageLayout: "invalid"},
			{ID: "web", Name: "duplicate", Format: "epub"},
			{ID: "", Name: "missing id", Format: "rtf"},
			{ID: "book", Name: "Book", Format: "custom", CustomWriter: "docbook5", CustomExtension: "xml", ImageScale: 1},
		},
	})
	if len(settings.Presets) != 2 {
		t.Fatalf("presets = %#v, want two valid unique presets", settings.Presets)
	}
	if settings.Presets[0].Name != "Web" || settings.Presets[0].ImageScale != 2 || settings.Presets[0].ImageLayout != "pages" {
		t.Fatalf("first preset was not normalised: %#v", settings.Presets[0])
	}
	if settings.Presets[1].CustomExtension != ".xml" {
		t.Fatalf("custom extension = %q", settings.Presets[1].CustomExtension)
	}
}

func TestEncodeExportImagePageKeepsPNGAndProducesHighQualityJPEG(t *testing.T) {
	page := solidPNGDataURL(t, 7, 5, color.NRGBA{R: 30, G: 130, B: 220, A: 255})
	pngData, err := encodeExportImagePage(page, "png")
	if err != nil {
		t.Fatal(err)
	}
	if config, format, err := image.DecodeConfig(bytes.NewReader(pngData)); err != nil || format != "png" || config.Width != 7 || config.Height != 5 {
		t.Fatalf("PNG page config=%#v format=%q err=%v", config, format, err)
	}
	jpegData, err := encodeExportImagePage(page, "jpeg")
	if err != nil {
		t.Fatal(err)
	}
	if config, format, err := image.DecodeConfig(bytes.NewReader(jpegData)); err != nil || format != "jpeg" || config.Width != 7 || config.Height != 5 {
		t.Fatalf("JPEG page config=%#v format=%q err=%v", config, format, err)
	}
}

func TestAvailableExportPagePathsUseNumberedNonDestructiveBatch(t *testing.T) {
	directory := t.TempDir()
	selected := filepath.Join(directory, "report-01.png")
	paths := availableExportPagePaths(selected, 3)
	want := []string{
		filepath.Join(directory, "report-01.png"),
		filepath.Join(directory, "report-02.png"),
		filepath.Join(directory, "report-03.png"),
	}
	if !reflect.DeepEqual(paths, want) {
		t.Fatalf("page paths = %#v, want %#v", paths, want)
	}
	if err := os.WriteFile(paths[1], []byte("occupied"), 0o600); err != nil {
		t.Fatal(err)
	}
	paths = availableExportPagePaths(selected, 2)
	if filepath.Base(paths[0]) != "report (2)-01.png" || filepath.Base(paths[1]) != "report (2)-02.png" {
		t.Fatalf("occupied batch was not avoided: %#v", paths)
	}
}

func TestSplitPandocArgumentsDoesNotUseAShell(t *testing.T) {
	arguments, err := splitPandocArguments(`--standalone --metadata title="My Book" --css 'theme file.css'`)
	if err != nil {
		t.Fatal(err)
	}
	want := []string{"--standalone", "--metadata", "title=My Book", "--css", "theme file.css"}
	if !reflect.DeepEqual(arguments, want) {
		t.Fatalf("arguments = %#v, want %#v", arguments, want)
	}
	if _, err := splitPandocArguments(`--css "broken`); err == nil {
		t.Fatal("unclosed quote should be rejected")
	}
	windowsPath, err := splitPandocArguments(`--reference-doc "C:\Users\Example\reference.docx"`)
	if err != nil || len(windowsPath) != 2 || windowsPath[1] != `C:\Users\Example\reference.docx` {
		t.Fatalf("Windows path was not preserved: %#v, %v", windowsPath, err)
	}
}

func TestExportContentAddsExpandedHeaderAndFooter(t *testing.T) {
	content := exportContentWithHeaderFooter("# Body", "Guide", "{title}", "Page {page}")
	if !strings.Contains(content, "Guide\n\n---\n\n# Body") || !strings.HasSuffix(content, "---\n\nPage 1") {
		t.Fatalf("unexpected export content: %s", content)
	}
}

func TestPandocFormatsCoverRequestedExports(t *testing.T) {
	want := map[string]string{"epub": ".epub", "rtf": ".rtf", "odt": ".odt", "latex": ".tex", "mediawiki": ".wiki"}
	for format, extension := range want {
		definition, ok := pandocFormats[format]
		if !ok || definition.Extension != extension || definition.Writer == "" {
			t.Fatalf("format %s = %#v, %v", format, definition, ok)
		}
	}
}

func TestCombineExportImageSlicesPreservesFullWidthAndOrder(t *testing.T) {
	top := solidPNGDataURL(t, 4, 3, color.NRGBA{R: 220, G: 30, B: 40, A: 255})
	bottom := solidPNGDataURL(t, 4, 2, color.NRGBA{R: 20, G: 80, B: 220, A: 255})
	data, err := combineExportImageSlices([]string{top, bottom}, "png")
	if err != nil {
		t.Fatal(err)
	}
	combined, imageFormat, err := image.Decode(bytes.NewReader(data))
	if err != nil || imageFormat != "png" {
		t.Fatalf("decode combined image: format=%q err=%v", imageFormat, err)
	}
	if bounds := combined.Bounds(); bounds.Dx() != 4 || bounds.Dy() != 5 {
		t.Fatalf("combined bounds = %v, want 4x5", bounds)
	}
	if got := color.NRGBAModel.Convert(combined.At(1, 1)).(color.NRGBA); got.R < 200 || got.B > 80 {
		t.Fatalf("top slice colour = %#v", got)
	}
	if got := color.NRGBAModel.Convert(combined.At(1, 4)).(color.NRGBA); got.B < 200 || got.R > 80 {
		t.Fatalf("bottom slice colour = %#v", got)
	}
}

func TestCombineExportImageSlicesEncodesJPEGOnceAfterJoining(t *testing.T) {
	slices := []string{
		solidPNGDataURL(t, 5, 2, color.NRGBA{R: 250, G: 250, B: 250, A: 255}),
		solidPNGDataURL(t, 5, 3, color.NRGBA{R: 30, G: 30, B: 30, A: 255}),
	}
	data, err := combineExportImageSlices(slices, "jpeg")
	if err != nil {
		t.Fatal(err)
	}
	config, imageFormat, err := image.DecodeConfig(bytes.NewReader(data))
	if err != nil || imageFormat != "jpeg" || config.Width != 5 || config.Height != 5 {
		t.Fatalf("JPEG config = %#v format=%q err=%v", config, imageFormat, err)
	}
}

func TestCombineExportImageSlicesRejectsInconsistentWidths(t *testing.T) {
	slices := []string{
		solidPNGDataURL(t, 4, 2, color.NRGBA{A: 255}),
		solidPNGDataURL(t, 5, 2, color.NRGBA{A: 255}),
	}
	if _, err := combineExportImageSlices(slices, "png"); err == nil || !strings.Contains(err.Error(), "inconsistent widths") {
		t.Fatalf("expected inconsistent-width error, got %v", err)
	}
}

func solidPNGDataURL(t *testing.T, width, height int, fill color.NRGBA) string {
	t.Helper()
	imageData := image.NewNRGBA(image.Rect(0, 0, width, height))
	for y := 0; y < height; y++ {
		for x := 0; x < width; x++ {
			imageData.SetNRGBA(x, y, fill)
		}
	}
	var output bytes.Buffer
	if err := png.Encode(&output, imageData); err != nil {
		t.Fatal(err)
	}
	return "data:image/png;base64," + base64.StdEncoding.EncodeToString(output.Bytes())
}
