package main

import (
	"bytes"
	"context"
	"errors"
	"fmt"
	"net/url"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"strings"
	"time"

	wailsruntime "github.com/wailsapp/wails/v2/pkg/runtime"
)

const (
	maxExportPDFSize       = 256 * 1024 * 1024
	pdfGenerationWaitLimit = 30 * time.Second
	pdfExportProcessLimit  = 90 * time.Second
)

type pdfBrowserProcessResult struct {
	output string
	err    error
}

func (a *App) ExportPDF(sourcePath, title, renderedHTML, header, footer string) (string, error) {
	browsers := findPDFBrowsers()
	if len(browsers) == 0 {
		return "", errors.New("PDF_ENGINE_NOT_FOUND")
	}
	defaultName := exportBaseName(sourcePath, title) + ".pdf"
	outputPath, err := wailsruntime.SaveFileDialog(a.ctx, wailsruntime.SaveDialogOptions{
		Title:           a.text("exportPDF"),
		DefaultFilename: defaultName,
		Filters:         []wailsruntime.FileFilter{{DisplayName: "PDF", Pattern: "*.pdf"}},
	})
	if err != nil || outputPath == "" {
		return "", err
	}
	if !strings.EqualFold(filepath.Ext(outputPath), ".pdf") {
		outputPath += ".pdf"
	}
	htmlData, err := buildPDFHTML(renderedHTML, title, a.language, header, footer)
	if err != nil {
		return "", err
	}
	temporaryDirectory, err := os.MkdirTemp("", "quillite-pdf-*")
	if err != nil {
		return "", err
	}
	defer os.RemoveAll(temporaryDirectory)
	htmlPath := filepath.Join(temporaryDirectory, "document.html")
	pdfPath := filepath.Join(temporaryDirectory, "document.pdf")
	if err := os.WriteFile(htmlPath, htmlData, 0o600); err != nil {
		return "", err
	}
	var pdfData []byte
	var lastErr error
	for index, browser := range browsers {
		_ = os.Remove(pdfPath)
		profilePath := filepath.Join(temporaryDirectory, fmt.Sprintf("browser-profile-%d", index))
		ctx, cancel := context.WithTimeout(context.Background(), pdfExportProcessLimit)
		pdfData, err = runPDFBrowser(ctx, browser, profilePath, pdfPath, htmlPath)
		cancel()
		if err != nil {
			lastErr = err
			continue
		}
		break
	}
	if len(pdfData) == 0 {
		if lastErr != nil {
			return "", lastErr
		}
		return "", errors.New("PDF_EXPORT_FAILED")
	}
	if err := writeFileAtomically(outputPath, pdfData); err != nil {
		return "", err
	}
	return outputPath, nil
}

// runPDFBrowser considers the export complete when the PDF itself is complete,
// rather than waiting for the browser process to exit first. Chrome and Edge can
// keep their macOS headless process alive after writing the requested file.
func runPDFBrowser(ctx context.Context, browser, profilePath, pdfPath, htmlPath string) ([]byte, error) {
	processCtx, cancelProcess := context.WithCancel(ctx)
	command := exec.CommandContext(processCtx, browser, pdfBrowserArguments(profilePath, pdfPath, htmlPath)...)
	var output bytes.Buffer
	command.Stdout = &output
	command.Stderr = &output
	if err := command.Start(); err != nil {
		cancelProcess()
		return nil, formatPDFBrowserFailure("", err)
	}

	processDone := make(chan pdfBrowserProcessResult, 1)
	processReaped := make(chan struct{})
	go func() {
		err := command.Wait()
		processDone <- pdfBrowserProcessResult{output: output.String(), err: err}
		close(processReaped)
	}()

	pdfData, err := waitForBrowserPDF(ctx, pdfPath, processDone)
	cancelProcess()
	select {
	case <-processReaped:
	case <-time.After(2 * time.Second):
		if command.Process != nil {
			_ = command.Process.Kill()
		}
		<-processReaped
	}
	return pdfData, err
}

// waitForBrowserPDF handles both browser behaviours used in production:
// Windows launchers may exit before a detached process finishes the PDF, while
// macOS browser processes may stay alive after the PDF has already been written.
func waitForBrowserPDF(ctx context.Context, pdfPath string, processDone <-chan pdfBrowserProcessResult) ([]byte, error) {
	ticker := time.NewTicker(80 * time.Millisecond)
	defer ticker.Stop()

	var postExitTimer *time.Timer
	var postExit <-chan time.Time
	defer func() {
		if postExitTimer != nil {
			postExitTimer.Stop()
		}
	}()

	var lastErr error
	for {
		pdfData, err := os.ReadFile(pdfPath)
		if err == nil {
			if validationErr := validateGeneratedPDF(pdfData); validationErr == nil {
				return pdfData, nil
			} else {
				lastErr = validationErr
			}
		} else if !errors.Is(err, os.ErrNotExist) {
			lastErr = err
		}

		select {
		case result := <-processDone:
			processDone = nil
			if errors.Is(ctx.Err(), context.DeadlineExceeded) {
				return nil, errors.New("PDF_EXPORT_TIMEOUT")
			}
			if result.err != nil {
				// The process and filesystem notifications can arrive in either
				// order. Prefer a complete PDF written just before a non-zero exit.
				if pdfData, readErr := os.ReadFile(pdfPath); readErr == nil && validateGeneratedPDF(pdfData) == nil {
					return pdfData, nil
				}
				return nil, formatPDFBrowserFailure(result.output, result.err)
			}
			// Some Windows browser launchers hand work to another process and exit.
			// Give that detached writer a bounded grace period to finish the file.
			postExitTimer = time.NewTimer(pdfGenerationWaitLimit)
			postExit = postExitTimer.C
		case <-postExit:
			return nil, errors.New("PDF_EXPORT_TIMEOUT")
		case <-ctx.Done():
			// Resolve a file/deadline race in favour of a complete PDF.
			if pdfData, readErr := os.ReadFile(pdfPath); readErr == nil && validateGeneratedPDF(pdfData) == nil {
				return pdfData, nil
			}
			if errors.Is(ctx.Err(), context.DeadlineExceeded) {
				return nil, errors.New("PDF_EXPORT_TIMEOUT")
			}
			if lastErr != nil {
				return nil, fmt.Errorf("PDF_EXPORT_FAILED: %w", lastErr)
			}
			return nil, fmt.Errorf("PDF_EXPORT_FAILED: %w", ctx.Err())
		case <-ticker.C:
		}
	}
}

func formatPDFBrowserFailure(output string, runErr error) error {
	message := strings.TrimSpace(output)
	if message == "" && runErr != nil {
		message = runErr.Error()
	}
	if len(message) > 1200 {
		message = message[:1200]
	}
	if message == "" {
		return errors.New("PDF_EXPORT_FAILED")
	}
	return fmt.Errorf("PDF_EXPORT_FAILED: %s", message)
}

func waitForGeneratedPDF(ctx context.Context, pdfPath string) ([]byte, error) {
	ticker := time.NewTicker(80 * time.Millisecond)
	defer ticker.Stop()
	var lastErr error
	for {
		pdfData, err := os.ReadFile(pdfPath)
		if err == nil {
			if validationErr := validateGeneratedPDF(pdfData); validationErr == nil {
				return pdfData, nil
			} else {
				lastErr = validationErr
			}
		} else if !errors.Is(err, os.ErrNotExist) {
			lastErr = err
		}

		select {
		case <-ctx.Done():
			if errors.Is(ctx.Err(), context.DeadlineExceeded) {
				return nil, errors.New("PDF_EXPORT_TIMEOUT")
			}
			if lastErr != nil {
				return nil, fmt.Errorf("PDF_EXPORT_FAILED: %w", lastErr)
			}
			return nil, fmt.Errorf("PDF_EXPORT_FAILED: %w", ctx.Err())
		case <-ticker.C:
		}
	}
}

func validateGeneratedPDF(pdfData []byte) error {
	if len(pdfData) < 5 || len(pdfData) > maxExportPDFSize || string(pdfData[:5]) != "%PDF-" {
		return errors.New("browser returned an invalid PDF")
	}
	tailStart := max(0, len(pdfData)-4096)
	if !bytes.Contains(pdfData[tailStart:], []byte("%%EOF")) {
		return errors.New("browser returned an incomplete PDF")
	}
	return nil
}

func pdfBrowserArguments(profilePath, pdfPath, htmlPath string) []string {
	return []string{
		"--headless=new",
		"--disable-gpu",
		"--disable-extensions",
		"--no-first-run",
		"--no-pdf-header-footer",
		"--allow-file-access-from-files",
		"--run-all-compositor-stages-before-draw",
		"--virtual-time-budget=1600",
		"--generate-pdf-document-outline",
		"--user-data-dir=" + profilePath,
		"--print-to-pdf=" + pdfPath,
		localFileURL(htmlPath),
	}
}

func findPDFBrowser() (string, error) {
	browsers := findPDFBrowsers()
	if len(browsers) == 0 {
		return "", errors.New("PDF_ENGINE_NOT_FOUND")
	}
	return browsers[0], nil
}

func findPDFBrowsers() []string {
	var candidates []string
	if runtime.GOOS == "windows" {
		candidates = append(candidates,
			filepath.Join(os.Getenv("ProgramFiles(x86)"), "Microsoft", "Edge", "Application", "msedge.exe"),
			filepath.Join(os.Getenv("ProgramFiles"), "Microsoft", "Edge", "Application", "msedge.exe"),
			filepath.Join(os.Getenv("ProgramFiles"), "Google", "Chrome", "Application", "chrome.exe"),
			filepath.Join(os.Getenv("ProgramFiles(x86)"), "Google", "Chrome", "Application", "chrome.exe"),
			filepath.Join(os.Getenv("LOCALAPPDATA"), "Microsoft", "Edge", "Application", "msedge.exe"),
			filepath.Join(os.Getenv("LOCALAPPDATA"), "Google", "Chrome", "Application", "chrome.exe"),
		)
	} else if runtime.GOOS == "darwin" {
		candidates = append(candidates,
			"/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge",
			"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
			"/Applications/Chromium.app/Contents/MacOS/Chromium",
		)
	}
	for _, name := range []string{"msedge", "microsoft-edge", "google-chrome", "google-chrome-stable", "chromium", "chromium-browser"} {
		if path, err := exec.LookPath(name); err == nil {
			candidates = append(candidates, path)
		}
	}
	seen := map[string]bool{}
	available := make([]string, 0, len(candidates))
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
		if info, err := os.Stat(cleaned); err == nil && !info.IsDir() {
			available = append(available, cleaned)
		}
	}
	return available
}

func localFileURL(path string) string {
	slashed := filepath.ToSlash(path)
	if runtime.GOOS == "windows" && !strings.HasPrefix(slashed, "/") {
		slashed = "/" + slashed
	}
	return (&url.URL{Scheme: "file", Path: slashed}).String()
}

func buildPDFHTML(renderedHTML, title, language, header, footer string) ([]byte, error) {
	document, err := buildStandaloneHTML(renderedHTML, title, language, "light", "#159A63")
	if err != nil {
		return nil, err
	}
	styles := `<style>` + pdfPageRule(header, footer, title) + `
html,body{print-color-adjust:exact;-webkit-print-color-adjust:exact}
@media print{body{padding:0}.markdown-body{overflow:visible}.code-block{max-width:100%;overflow:visible;box-shadow:none}.markdown-body pre,.code-block pre{max-width:100%;overflow:visible!important;white-space:pre-wrap!important;overflow-wrap:anywhere;word-break:break-word}.markdown-table-scroll,.markdown-body .math-block{max-width:100%;overflow:visible!important}.markdown-table-scroll table,.markdown-body table{width:100%!important;max-width:100%;table-layout:fixed}.markdown-body th,.markdown-body td{min-width:0!important;overflow-wrap:anywhere;word-break:break-word}.markdown-body img,.markdown-body svg{max-width:100%!important;height:auto!important}.markdown-dynamic-toc a{color:#333}}
</style>`
	result := strings.Replace(string(document), "</head>", styles+"</head>", 1)
	return []byte(result), nil
}

func pdfPageRule(header, footer, title string) string {
	var rule strings.Builder
	rule.WriteString(`@page{size:A4;margin:22mm 16mm;`)
	if content := pdfMarginBoxContent(header, title); content != "" {
		rule.WriteString(`@top-center{content:` + content + `;width:100%;padding-bottom:2.5mm;border-bottom:.2mm solid #d8d8d8;color:#666;font:9pt/1.35 system-ui,sans-serif;vertical-align:bottom}`)
	}
	if content := pdfMarginBoxContent(footer, title); content != "" {
		rule.WriteString(`@bottom-center{content:` + content + `;width:100%;padding-top:2.5mm;border-top:.2mm solid #d8d8d8;color:#666;font:9pt/1.35 system-ui,sans-serif;vertical-align:top}`)
	}
	rule.WriteString(`}`)
	return rule.String()
}

func pdfMarginBoxContent(template, title string) string {
	template = strings.ReplaceAll(template, "{title}", title)
	template = strings.ReplaceAll(template, "{date}", time.Now().Format("2006-01-02"))
	if strings.TrimSpace(template) == "" {
		return ""
	}
	parts := strings.Split(template, "{page}")
	var result strings.Builder
	for index, part := range parts {
		if index > 0 {
			result.WriteString(` counter(page) `)
		}
		result.WriteString(`"` + cssString(part) + `"`)
	}
	return result.String()
}

func cssString(value string) string {
	value = strings.ReplaceAll(value, `\`, `\\`)
	value = strings.ReplaceAll(value, `"`, `\"`)
	value = strings.ReplaceAll(value, "\r", "")
	return strings.ReplaceAll(value, "\n", `\A `)
}
