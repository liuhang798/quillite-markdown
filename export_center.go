package main

import (
	"bytes"
	"context"
	"encoding/base64"
	"errors"
	"fmt"
	"image"
	"image/draw"
	"image/jpeg"
	"image/png"
	"os"
	"os/exec"
	"path/filepath"
	"regexp"
	"runtime"
	"strings"
	"time"

	wailsruntime "github.com/wailsapp/wails/v2/pkg/runtime"
)

const (
	maxExportPresets      = 24
	maxPandocSourceSize   = 24 * 1024 * 1024
	maxExportImageSize    = 96 * 1024 * 1024
	maxExportImageSlices  = 64
	maxExportImagePixels  = 64_000_000
	maxExportPagePixels   = 120_000_000
	maxExportPageDataSize = 192 * 1024 * 1024
	maxExportImageSide    = 30_000
	maxExportSliceSide    = 8_192
	maxPandocArgumentSize = 4000
)

var pandocWriterPattern = regexp.MustCompile(`^[A-Za-z0-9][A-Za-z0-9_+.-]{0,63}$`)
var exportExtensionPattern = regexp.MustCompile(`^\.[A-Za-z0-9]{1,12}$`)

type ExportPreset struct {
	ID              string `json:"id"`
	Name            string `json:"name"`
	Format          string `json:"format"`
	Header          string `json:"header,omitempty"`
	Footer          string `json:"footer,omitempty"`
	ExtraArguments  string `json:"extraArguments,omitempty"`
	CustomWriter    string `json:"customWriter,omitempty"`
	CustomExtension string `json:"customExtension,omitempty"`
	ImageScale      int    `json:"imageScale,omitempty"`
	ImageLayout     string `json:"imageLayout,omitempty"`
}

type ExportSettings struct {
	PandocPath string         `json:"pandocPath,omitempty"`
	Presets    []ExportPreset `json:"presets,omitempty"`
}

type PandocStatus struct {
	Available bool   `json:"available"`
	Path      string `json:"path,omitempty"`
	Version   string `json:"version,omitempty"`
}

type PandocExportInput struct {
	SourcePath      string `json:"sourcePath"`
	Title           string `json:"title"`
	Content         string `json:"content"`
	Format          string `json:"format"`
	PandocPath      string `json:"pandocPath,omitempty"`
	Header          string `json:"header,omitempty"`
	Footer          string `json:"footer,omitempty"`
	ExtraArguments  string `json:"extraArguments,omitempty"`
	CustomWriter    string `json:"customWriter,omitempty"`
	CustomExtension string `json:"customExtension,omitempty"`
}

type pandocFormat struct {
	Writer    string
	Extension string
	DisplayZH string
	DisplayEN string
}

var pandocFormats = map[string]pandocFormat{
	"epub":      {Writer: "epub3", Extension: ".epub", DisplayZH: "EPUB 电子书", DisplayEN: "EPUB eBook"},
	"rtf":       {Writer: "rtf", Extension: ".rtf", DisplayZH: "RTF 富文本", DisplayEN: "RTF Document"},
	"odt":       {Writer: "odt", Extension: ".odt", DisplayZH: "ODT 文档", DisplayEN: "ODT Document"},
	"latex":     {Writer: "latex", Extension: ".tex", DisplayZH: "LaTeX 文档", DisplayEN: "LaTeX Document"},
	"mediawiki": {Writer: "mediawiki", Extension: ".wiki", DisplayZH: "MediaWiki 源码", DisplayEN: "MediaWiki Source"},
}

func defaultExportSettings() ExportSettings {
	return ExportSettings{Presets: []ExportPreset{}}
}

func normaliseExportFormat(format string) string {
	format = strings.ToLower(strings.TrimSpace(format))
	switch format {
	case "docx", "html", "html-plain", "pdf", "png", "jpeg", "epub", "rtf", "odt", "latex", "mediawiki", "custom":
		return format
	default:
		return "html"
	}
}

func normaliseExportPreset(preset ExportPreset) ExportPreset {
	preset.ID = truncateText(strings.TrimSpace(preset.ID), 80)
	preset.Name = truncateText(strings.TrimSpace(preset.Name), 80)
	preset.Format = normaliseExportFormat(preset.Format)
	preset.Header = truncateText(preset.Header, 500)
	preset.Footer = truncateText(preset.Footer, 500)
	preset.ExtraArguments = truncateText(strings.TrimSpace(preset.ExtraArguments), maxPandocArgumentSize)
	preset.CustomWriter = truncateText(strings.TrimSpace(preset.CustomWriter), 64)
	preset.CustomExtension = normaliseCustomExtension(preset.CustomExtension)
	if preset.ImageScale < 1 || preset.ImageScale > 3 {
		preset.ImageScale = 2
	}
	if preset.ImageLayout != "long" {
		preset.ImageLayout = "pages"
	}
	return preset
}

func normaliseExportSettings(settings ExportSettings) ExportSettings {
	settings.PandocPath = strings.TrimSpace(settings.PandocPath)
	if settings.PandocPath != "" {
		settings.PandocPath = filepath.Clean(settings.PandocPath)
	}
	seen := map[string]bool{}
	presets := make([]ExportPreset, 0, len(settings.Presets))
	for _, item := range settings.Presets {
		preset := normaliseExportPreset(item)
		if preset.ID == "" || preset.Name == "" || seen[preset.ID] {
			continue
		}
		seen[preset.ID] = true
		presets = append(presets, preset)
		if len(presets) == maxExportPresets {
			break
		}
	}
	settings.Presets = presets
	return settings
}

func truncateText(value string, maximum int) string {
	runes := []rune(value)
	if len(runes) > maximum {
		return string(runes[:maximum])
	}
	return value
}

func normaliseCustomExtension(value string) string {
	value = strings.ToLower(strings.TrimSpace(value))
	if value != "" && !strings.HasPrefix(value, ".") {
		value = "." + value
	}
	if !exportExtensionPattern.MatchString(value) {
		return ".txt"
	}
	return value
}

func (a *App) GetExportSettings() (ExportSettings, error) {
	prefs, err := a.readPreferences()
	if err != nil {
		return defaultExportSettings(), err
	}
	return normaliseExportSettings(prefs.ExportSettings), nil
}

func (a *App) SetExportSettings(settings ExportSettings) (ExportSettings, error) {
	normalised := normaliseExportSettings(settings)
	_, err := a.updatePreferences(func(prefs *Preferences) {
		prefs.ExportSettings = normalised
	})
	return normalised, err
}

func (a *App) DetectPandoc() PandocStatus {
	prefs, _ := a.readPreferences()
	candidates := []string{prefs.ExportSettings.PandocPath}
	if found, err := exec.LookPath("pandoc"); err == nil {
		candidates = append(candidates, found)
	}
	if runtime.GOOS == "windows" {
		candidates = append(candidates,
			filepath.Join(os.Getenv("LOCALAPPDATA"), "Pandoc", "pandoc.exe"),
			filepath.Join(os.Getenv("ProgramFiles"), "Pandoc", "pandoc.exe"),
		)
	} else {
		candidates = append(candidates, "/opt/homebrew/bin/pandoc", "/usr/local/bin/pandoc", "/usr/bin/pandoc")
	}
	seen := map[string]bool{}
	for _, candidate := range candidates {
		candidate = strings.TrimSpace(candidate)
		if candidate == "" {
			continue
		}
		cleaned := filepath.Clean(candidate)
		key := strings.ToLower(cleaned)
		if seen[key] {
			continue
		}
		seen[key] = true
		if status, err := inspectPandoc(cleaned); err == nil {
			return status
		}
	}
	return PandocStatus{}
}

func inspectPandoc(executable string) (PandocStatus, error) {
	if strings.TrimSpace(executable) == "" {
		return PandocStatus{}, errors.New("pandoc path is empty")
	}
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	output, err := exec.CommandContext(ctx, executable, "--version").Output()
	if err != nil {
		return PandocStatus{}, err
	}
	line := strings.TrimSpace(strings.SplitN(string(output), "\n", 2)[0])
	if !strings.HasPrefix(strings.ToLower(line), "pandoc ") {
		return PandocStatus{}, errors.New("selected executable is not pandoc")
	}
	abs, err := filepath.Abs(filepath.Clean(executable))
	if err != nil {
		return PandocStatus{}, err
	}
	return PandocStatus{Available: true, Path: abs, Version: line}, nil
}

func (a *App) SelectPandoc() (PandocStatus, error) {
	path, err := wailsruntime.OpenFileDialog(a.ctx, wailsruntime.OpenDialogOptions{
		Title: a.text("selectPandoc"),
		Filters: []wailsruntime.FileFilter{
			{DisplayName: a.text("pandocExecutable"), Pattern: executablePattern()},
			{DisplayName: a.text("allFiles"), Pattern: "*.*"},
		},
	})
	if err != nil || path == "" {
		return PandocStatus{}, err
	}
	status, err := inspectPandoc(path)
	if err != nil {
		return PandocStatus{}, err
	}
	_, err = a.updatePreferences(func(prefs *Preferences) {
		prefs.ExportSettings.PandocPath = status.Path
	})
	return status, err
}

func executablePattern() string {
	if runtime.GOOS == "windows" {
		return "*.exe"
	}
	return "*"
}

func (a *App) ExportWithPandoc(input PandocExportInput) (string, error) {
	if len(input.Content) > maxPandocSourceSize {
		return "", errors.New("document is too large to export")
	}
	format := strings.ToLower(strings.TrimSpace(input.Format))
	definition, supported := pandocFormats[format]
	if format == "custom" {
		writer := strings.TrimSpace(input.CustomWriter)
		if !pandocWriterPattern.MatchString(writer) {
			return "", errors.New("invalid custom pandoc writer")
		}
		definition = pandocFormat{Writer: writer, Extension: normaliseCustomExtension(input.CustomExtension), DisplayZH: "Pandoc 自定义格式", DisplayEN: "Custom Pandoc Format"}
		supported = true
	}
	if !supported {
		return "", fmt.Errorf("unsupported pandoc export format: %s", format)
	}
	path := strings.TrimSpace(input.PandocPath)
	if path == "" {
		status := a.DetectPandoc()
		if !status.Available {
			return "", errors.New("PANDOC_NOT_FOUND")
		}
		path = status.Path
	}
	status, err := inspectPandoc(path)
	if err != nil {
		return "", fmt.Errorf("PANDOC_NOT_FOUND: %w", err)
	}
	extraArguments, err := splitPandocArguments(input.ExtraArguments)
	if err != nil {
		return "", err
	}
	for _, argument := range extraArguments {
		lower := strings.ToLower(argument)
		if lower == "-o" || strings.HasPrefix(lower, "-o=") || (strings.HasPrefix(lower, "-o") && !strings.HasPrefix(lower, "--")) || lower == "--output" || strings.HasPrefix(lower, "--output=") {
			return "", errors.New("custom pandoc arguments cannot override the output path")
		}
	}
	defaultName := exportBaseName(input.SourcePath, input.Title) + definition.Extension
	displayName := definition.DisplayZH
	if a.language == "en" {
		displayName = definition.DisplayEN
	}
	outputPath, err := wailsruntime.SaveFileDialog(a.ctx, wailsruntime.SaveDialogOptions{
		Title:           a.text("exportDocument"),
		DefaultFilename: defaultName,
		Filters:         []wailsruntime.FileFilter{{DisplayName: displayName, Pattern: "*" + definition.Extension}},
	})
	if err != nil || outputPath == "" {
		return "", err
	}
	if !strings.EqualFold(filepath.Ext(outputPath), definition.Extension) {
		outputPath += definition.Extension
	}
	content := exportContentWithHeaderFooter(input.Content, input.Title, input.Header, input.Footer)
	args := []string{"--from=gfm+tex_math_dollars+footnotes"}
	args = append(args, extraArguments...)
	args = append(args, "--to="+definition.Writer, "--output="+outputPath)
	ctx, cancel := context.WithTimeout(context.Background(), 2*time.Minute)
	defer cancel()
	command := exec.CommandContext(ctx, status.Path, args...)
	command.Stdin = strings.NewReader(content)
	if directory := filepath.Dir(filepath.Clean(input.SourcePath)); directory != "." {
		command.Dir = directory
	}
	output, err := command.CombinedOutput()
	if ctx.Err() == context.DeadlineExceeded {
		return "", errors.New("pandoc export timed out")
	}
	if err != nil {
		message := strings.TrimSpace(string(output))
		if len(message) > 1200 {
			message = message[:1200]
		}
		return "", fmt.Errorf("pandoc export failed: %s", message)
	}
	return outputPath, nil
}

func exportBaseName(sourcePath, title string) string {
	name := strings.TrimSuffix(filepath.Base(sourcePath), filepath.Ext(sourcePath))
	if strings.TrimSpace(name) == "" || name == "." {
		name = strings.TrimSuffix(strings.TrimSpace(title), filepath.Ext(strings.TrimSpace(title)))
	}
	if strings.TrimSpace(name) == "" {
		name = "document"
	}
	return name
}

func exportContentWithHeaderFooter(content, title, header, footer string) string {
	header = expandExportVariables(header, title, "1")
	footer = expandExportVariables(footer, title, "1")
	var sections []string
	if strings.TrimSpace(header) != "" {
		sections = append(sections, strings.TrimSpace(header), "---")
	}
	sections = append(sections, content)
	if strings.TrimSpace(footer) != "" {
		sections = append(sections, "---", strings.TrimSpace(footer))
	}
	return strings.Join(sections, "\n\n")
}

func expandExportVariables(value, title, page string) string {
	value = strings.ReplaceAll(value, "{title}", title)
	value = strings.ReplaceAll(value, "{date}", time.Now().Format("2006-01-02"))
	return strings.ReplaceAll(value, "{page}", page)
}

func splitPandocArguments(value string) ([]string, error) {
	if len(value) > maxPandocArgumentSize {
		return nil, errors.New("pandoc arguments are too long")
	}
	var result []string
	var current strings.Builder
	quote := rune(0)
	flush := func() {
		if current.Len() > 0 {
			result = append(result, current.String())
			current.Reset()
		}
	}
	for _, character := range value {
		if character == '\\' {
			current.WriteRune(character)
			continue
		}
		if quote != 0 {
			if character == quote {
				quote = 0
			} else {
				current.WriteRune(character)
			}
			continue
		}
		if character == '\'' || character == '"' {
			quote = character
			continue
		}
		if character == ' ' || character == '\t' || character == '\r' || character == '\n' {
			flush()
			continue
		}
		if character == 0 {
			return nil, errors.New("pandoc arguments contain an invalid character")
		}
		current.WriteRune(character)
	}
	if quote != 0 {
		return nil, errors.New("pandoc arguments contain an unclosed quote")
	}
	flush()
	if len(result) > 64 {
		return nil, errors.New("too many pandoc arguments")
	}
	return result, nil
}

func (a *App) SaveExportImage(sourcePath, title, dataURL, format string) (string, error) {
	format, mimeType, extension, display := a.exportImageDefinition(format)
	data, err := decodeExportImageDataURL(dataURL, mimeType)
	if err != nil {
		return "", err
	}
	return a.saveExportImageData(sourcePath, title, data, extension, display)
}

// SaveExportImageSlices joins independently rendered PNG strips before saving.
// Chromium canvases are limited to 16384px on either side; rendering strips
// preserves the requested pixel width instead of silently shrinking a long
// document to fit that limit.
func (a *App) SaveExportImageSlices(sourcePath, title, format string, dataURLs []string) (string, error) {
	format, _, extension, display := a.exportImageDefinition(format)
	data, err := combineExportImageSlices(dataURLs, format)
	if err != nil {
		return "", err
	}
	return a.saveExportImageData(sourcePath, title, data, extension, display)
}

// SaveExportImagePages saves independently rendered portrait pages beside one
// another. A single ultra-tall bitmap is always scaled down by image viewers;
// page-sized files keep text readable in previews and social apps.
func (a *App) SaveExportImagePages(sourcePath, title, format string, dataURLs []string) ([]string, error) {
	format, _, extension, display := a.exportImageDefinition(format)
	if len(dataURLs) == 0 || len(dataURLs) > maxExportImageSlices {
		return nil, errors.New("invalid exported image pages")
	}
	pages := make([][]byte, 0, len(dataURLs))
	var totalPixels int64
	totalDataSize := 0
	for _, dataURL := range dataURLs {
		page, err := encodeExportImagePage(dataURL, format)
		if err != nil {
			return nil, err
		}
		config, _, err := image.DecodeConfig(bytes.NewReader(page))
		if err != nil {
			return nil, errors.New("invalid exported image page")
		}
		totalPixels += int64(config.Width) * int64(config.Height)
		totalDataSize += len(page)
		if totalPixels > maxExportPagePixels || totalDataSize > maxExportPageDataSize {
			return nil, errors.New("exported image pages are too large")
		}
		pages = append(pages, page)
	}
	outputPath, err := wailsruntime.SaveFileDialog(a.ctx, wailsruntime.SaveDialogOptions{
		Title:           a.text("exportImage"),
		DefaultFilename: exportBaseName(sourcePath, title) + "-01" + extension,
		Filters:         []wailsruntime.FileFilter{{DisplayName: display, Pattern: "*" + extension}},
	})
	if err != nil || outputPath == "" {
		return nil, err
	}
	if !strings.EqualFold(filepath.Ext(outputPath), extension) {
		outputPath += extension
	}
	paths := availableExportPagePaths(outputPath, len(pages))
	written := make([]string, 0, len(paths))
	for index, path := range paths {
		if err := writeFileAtomically(path, pages[index]); err != nil {
			for _, created := range written {
				_ = os.Remove(created)
			}
			return nil, err
		}
		written = append(written, path)
	}
	return written, nil
}

func (a *App) exportImageDefinition(format string) (string, string, string, string) {
	format = strings.ToLower(strings.TrimSpace(format))
	if format == "jpeg" || format == "jpg" {
		return "jpeg", "image/jpeg", ".jpg", a.text("jpegImage")
	}
	return "png", "image/png", ".png", a.text("pngImage")
}

func decodeExportImageDataURL(dataURL, mimeType string) ([]byte, error) {
	metadata, encoded, found := strings.Cut(dataURL, ",")
	if !found || !strings.EqualFold(strings.TrimSuffix(metadata, ";base64"), "data:"+mimeType) || !strings.HasSuffix(strings.ToLower(metadata), ";base64") {
		return nil, errors.New("invalid exported image data")
	}
	data, err := base64.StdEncoding.DecodeString(encoded)
	if err != nil || len(data) == 0 {
		return nil, errors.New("invalid exported image data")
	}
	if len(data) > maxExportImageSize {
		return nil, errors.New("exported image is too large")
	}
	return data, nil
}

func encodeExportImagePage(dataURL, format string) ([]byte, error) {
	data, err := decodeExportImageDataURL(dataURL, "image/png")
	if err != nil {
		return nil, err
	}
	config, imageFormat, err := image.DecodeConfig(bytes.NewReader(data))
	if err != nil || imageFormat != "png" || config.Width <= 0 || config.Height <= 0 || config.Width > maxExportSliceSide || config.Height > maxExportSliceSide {
		return nil, errors.New("invalid exported image page")
	}
	if int64(config.Width)*int64(config.Height) > maxExportImagePixels {
		return nil, errors.New("exported image page is too large")
	}
	if format != "jpeg" && format != "jpg" {
		return data, nil
	}
	page, decodedFormat, err := image.Decode(bytes.NewReader(data))
	if err != nil || decodedFormat != "png" {
		return nil, errors.New("invalid exported image page")
	}
	var output bytes.Buffer
	if err := jpeg.Encode(&output, page, &jpeg.Options{Quality: 94}); err != nil {
		return nil, fmt.Errorf("encode exported image page: %w", err)
	}
	if output.Len() == 0 || output.Len() > maxExportImageSize {
		return nil, errors.New("exported image page is too large")
	}
	return output.Bytes(), nil
}

func availableExportPagePaths(selectedPath string, count int) []string {
	extension := filepath.Ext(selectedPath)
	base := strings.TrimSuffix(filepath.Base(selectedPath), extension)
	base = regexp.MustCompile(`(?i)-0*1$`).ReplaceAllString(base, "")
	if strings.TrimSpace(base) == "" {
		base = "document"
	}
	directory := filepath.Dir(selectedPath)
	pathsFor := func(suffix string) []string {
		paths := make([]string, count)
		width := len(fmt.Sprintf("%d", count))
		if width < 2 {
			width = 2
		}
		for index := range paths {
			paths[index] = filepath.Join(directory, fmt.Sprintf("%s%s-%0*d%s", base, suffix, width, index+1, extension))
		}
		return paths
	}
	for attempt := 1; ; attempt++ {
		suffix := ""
		if attempt > 1 {
			suffix = fmt.Sprintf(" (%d)", attempt)
		}
		paths := pathsFor(suffix)
		available := true
		for _, path := range paths {
			if _, err := os.Stat(path); err == nil || !os.IsNotExist(err) {
				available = false
				break
			}
		}
		if available {
			return paths
		}
	}
}

func combineExportImageSlices(dataURLs []string, format string) ([]byte, error) {
	if len(dataURLs) == 0 || len(dataURLs) > maxExportImageSlices {
		return nil, errors.New("invalid exported image slices")
	}
	encodedSlices := make([][]byte, 0, len(dataURLs))
	width, totalHeight := 0, 0
	for _, dataURL := range dataURLs {
		data, err := decodeExportImageDataURL(dataURL, "image/png")
		if err != nil {
			return nil, err
		}
		config, imageFormat, err := image.DecodeConfig(bytes.NewReader(data))
		if err != nil || imageFormat != "png" || config.Width <= 0 || config.Height <= 0 || config.Width > maxExportSliceSide || config.Height > maxExportSliceSide {
			return nil, errors.New("invalid exported image slice")
		}
		if width == 0 {
			width = config.Width
		} else if config.Width != width {
			return nil, errors.New("exported image slices have inconsistent widths")
		}
		totalHeight += config.Height
		if totalHeight > maxExportImageSide || int64(width)*int64(totalHeight) > maxExportImagePixels {
			return nil, errors.New("exported image is too large")
		}
		encodedSlices = append(encodedSlices, data)
	}

	canvas := image.NewNRGBA(image.Rect(0, 0, width, totalHeight))
	yOffset := 0
	for _, data := range encodedSlices {
		slice, imageFormat, err := image.Decode(bytes.NewReader(data))
		if err != nil || imageFormat != "png" {
			return nil, errors.New("invalid exported image slice")
		}
		bounds := slice.Bounds()
		destination := image.Rect(0, yOffset, width, yOffset+bounds.Dy())
		draw.Draw(canvas, destination, slice, bounds.Min, draw.Src)
		yOffset += bounds.Dy()
	}

	var output bytes.Buffer
	var err error
	if format == "jpeg" || format == "jpg" {
		err = jpeg.Encode(&output, canvas, &jpeg.Options{Quality: 92})
	} else {
		err = (&png.Encoder{CompressionLevel: png.BestSpeed}).Encode(&output, canvas)
	}
	if err != nil {
		return nil, fmt.Errorf("encode exported image: %w", err)
	}
	if output.Len() == 0 || output.Len() > maxExportImageSize {
		return nil, errors.New("exported image is too large")
	}
	return output.Bytes(), nil
}

func (a *App) saveExportImageData(sourcePath, title string, data []byte, extension, display string) (string, error) {
	outputPath, err := wailsruntime.SaveFileDialog(a.ctx, wailsruntime.SaveDialogOptions{
		Title:           a.text("exportImage"),
		DefaultFilename: exportBaseName(sourcePath, title) + extension,
		Filters:         []wailsruntime.FileFilter{{DisplayName: display, Pattern: "*" + extension}},
	})
	if err != nil || outputPath == "" {
		return "", err
	}
	if !strings.EqualFold(filepath.Ext(outputPath), extension) {
		outputPath += extension
	}
	if err := writeFileAtomically(outputPath, data); err != nil {
		return "", err
	}
	return outputPath, nil
}
