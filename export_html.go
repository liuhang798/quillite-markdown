package main

import (
	"bytes"
	"errors"
	"fmt"
	"net/url"
	"path/filepath"
	"regexp"
	"strings"

	wailsruntime "github.com/wailsapp/wails/v2/pkg/runtime"
	"golang.org/x/net/html"
	"golang.org/x/net/html/atom"
)

var exportAccentPattern = regexp.MustCompile(`(?i)^#[0-9a-f]{6}$`)

// ExportHTML writes the rendered document as a safe, standalone HTML file.
func (a *App) ExportHTML(sourcePath, title, renderedHTML, colorMode, accentColor string) (string, error) {
	if len(renderedHTML) > maxDOCXHTMLSize {
		return "", errors.New("document is too large to export")
	}
	defaultName := strings.TrimSuffix(filepath.Base(sourcePath), filepath.Ext(sourcePath))
	if strings.TrimSpace(defaultName) == "" || defaultName == "." {
		defaultName = strings.TrimSuffix(strings.TrimSpace(title), filepath.Ext(strings.TrimSpace(title)))
	}
	if defaultName == "" {
		defaultName = strings.TrimSuffix(a.text("newDocument"), filepath.Ext(a.text("newDocument")))
	}
	defaultName += ".html"
	filePath, err := wailsruntime.SaveFileDialog(a.ctx, wailsruntime.SaveDialogOptions{
		Title:           a.text("exportHTML"),
		DefaultFilename: defaultName,
		Filters: []wailsruntime.FileFilter{
			{DisplayName: a.text("htmlDocument"), Pattern: "*.html"},
		},
	})
	if err != nil || filePath == "" {
		return "", err
	}
	if extension := strings.ToLower(filepath.Ext(filePath)); extension != ".html" && extension != ".htm" {
		filePath += ".html"
	}
	data, err := buildStandaloneHTML(renderedHTML, title, a.language, colorMode, accentColor)
	if err != nil {
		return "", err
	}
	if err := writeFileAtomically(filePath, data); err != nil {
		return "", err
	}
	return filePath, nil
}

// ExportPlainHTML writes semantic, sanitized HTML without an application theme.
func (a *App) ExportPlainHTML(sourcePath, title, renderedHTML, header, footer string) (string, error) {
	if len(renderedHTML) > maxDOCXHTMLSize {
		return "", errors.New("document is too large to export")
	}
	defaultName := exportBaseName(sourcePath, title) + ".html"
	filePath, err := wailsruntime.SaveFileDialog(a.ctx, wailsruntime.SaveDialogOptions{
		Title:           a.text("exportHTML"),
		DefaultFilename: defaultName,
		Filters: []wailsruntime.FileFilter{
			{DisplayName: a.text("htmlDocument"), Pattern: "*.html"},
		},
	})
	if err != nil || filePath == "" {
		return "", err
	}
	if extension := strings.ToLower(filepath.Ext(filePath)); extension != ".html" && extension != ".htm" {
		filePath += ".html"
	}
	data, err := buildPlainHTML(renderedHTML, title, a.language, header, footer)
	if err != nil {
		return "", err
	}
	if err := writeFileAtomically(filePath, data); err != nil {
		return "", err
	}
	return filePath, nil
}

func buildPlainHTML(renderedHTML, title, language, header, footer string) ([]byte, error) {
	body, err := sanitizeStandaloneHTML(renderedHTML)
	if err != nil {
		return nil, err
	}
	if language != "en" {
		language = "zh-CN"
	}
	header = strings.TrimSpace(expandExportVariables(header, title, "1"))
	footer = strings.TrimSpace(expandExportVariables(footer, title, "1"))
	headerHTML, footerHTML := "", ""
	if header != "" {
		headerHTML = "<header>" + xmlText(header) + "</header>"
	}
	if footer != "" {
		footerHTML = "<footer>" + xmlText(footer) + "</footer>"
	}
	document := `<!doctype html>
<html lang="` + xmlAttribute(language) + `">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src data: https: http:">
<title>` + xmlText(title) + `</title>
</head>
<body>` + headerHTML + `<main>` + body + `</main>` + footerHTML + `</body>
</html>`
	return []byte(document), nil
}

func buildStandaloneHTML(renderedHTML, title, language, colorMode, accentColor string) ([]byte, error) {
	body, err := sanitizeStandaloneHTML(renderedHTML)
	if err != nil {
		return nil, err
	}
	if language != "en" {
		language = "zh-CN"
	}
	if colorMode != "dark" {
		colorMode = "light"
	}
	if !exportAccentPattern.MatchString(accentColor) {
		accentColor = "#159A63"
	}
	background, paper, text, muted, line, code := "#f3f6f4", "#ffffff", "#1f2924", "#68716b", "#d9e0db", "#eef3ef"
	if colorMode == "dark" {
		background, paper, text, muted, line, code = "#151a17", "#1d2420", "#e7ece9", "#aab5ae", "#39443e", "#28312c"
	}
	document := `<!doctype html>
<html lang="` + xmlAttribute(language) + `" data-color-mode="` + colorMode + `">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src data: https: http:; style-src 'unsafe-inline'; font-src data:">
<title>` + xmlText(title) + `</title>
<style>
:root{color-scheme:` + colorMode + `;--accent:` + accentColor + `;--background:` + background + `;--paper:` + paper + `;--text:` + text + `;--muted:` + muted + `;--line:` + line + `;--code:` + code + `}
*{box-sizing:border-box}html{background:var(--background)}body{margin:0;padding:40px 20px;color:var(--text);background:var(--background);font:16px/1.75 -apple-system,BlinkMacSystemFont,"Segoe UI","Microsoft YaHei",sans-serif}.markdown-body{width:min(900px,100%);min-height:calc(100vh - 80px);margin:auto;padding:52px 64px;background:var(--paper);border:1px solid var(--line);border-radius:14px;overflow-wrap:anywhere}.markdown-body>:first-child{margin-top:0}.markdown-body>:last-child{margin-bottom:0}h1,h2,h3,h4,h5,h6{margin:1.55em 0 .65em;line-height:1.3}h1,h2{padding-bottom:.3em;border-bottom:1px solid var(--line)}p,ul,ol,blockquote,pre,table{margin:1em 0}a{color:var(--accent);text-underline-offset:3px}blockquote{margin-left:0;padding:.2em 1em;border-left:4px solid var(--accent);color:var(--muted);background:color-mix(in srgb,var(--accent) 6%,transparent)}code,kbd{padding:.12em .35em;border-radius:5px;background:var(--code);font:90%/1.6 ui-monospace,SFMono-Regular,Consolas,monospace}pre{padding:18px;overflow:auto;border:1px solid var(--line);border-radius:9px;background:var(--code)}pre code{padding:0;background:transparent}table{width:100%;border-collapse:collapse}th,td{padding:9px 12px;border:1px solid var(--line);text-align:left}th{background:color-mix(in srgb,var(--accent) 8%,var(--paper))}img{display:block;max-width:100%;height:auto;margin:1.25em auto;border-radius:8px}hr{height:1px;margin:2em 0;border:0;background:var(--line)}mark{padding:.05em .2em;border-radius:3px}details{padding:.7em 1em;border:1px solid var(--line);border-radius:8px}.math-inline{display:inline-block;vertical-align:-.12em}.math-block{margin:1.5em 0;padding:.5em;overflow:auto;text-align:center}.math-inline .katex-html,.math-block .katex-html,annotation,annotation-xml{display:none!important}math{font-size:1.08em}.math-block math{display:block;margin:auto}.hljs-keyword,.hljs-selector-tag,.hljs-literal{color:#8b4ec2}.hljs-string,.hljs-attr{color:#16834f}.hljs-number,.hljs-symbol{color:#b05b18}.hljs-comment{color:var(--muted);font-style:italic}@media(max-width:680px){body{padding:0}.markdown-body{min-height:100vh;padding:30px 22px;border:0;border-radius:0}}@media print{html,body{background:#fff}.markdown-body{width:auto;min-height:0;padding:0;border:0;color:#111;background:#fff}.code-block{max-width:100%;overflow:visible;box-shadow:none}.markdown-body pre,.code-block pre{max-width:100%;overflow:visible!important;white-space:pre-wrap!important;overflow-wrap:anywhere;word-break:break-word}.markdown-table-scroll,.math-block{max-width:100%;overflow:visible!important}.markdown-table-scroll table,.markdown-body table{width:100%!important;max-width:100%;table-layout:fixed}.markdown-body th,.markdown-body td{min-width:0!important;overflow-wrap:anywhere;word-break:break-word}.markdown-body img,.markdown-body svg{max-width:100%!important;height:auto!important}}
.export-document-header,.export-document-footer{padding:0 0 12px;border-bottom:1px solid var(--line);color:var(--muted);font-size:.82em}.export-document-footer{margin-top:2em;padding:12px 0 0;border-top:1px solid var(--line);border-bottom:0}
</style>
</head>
<body><main class="markdown-body">` + body + `</main></body>
</html>`
	return []byte(document), nil
}

func sanitizeStandaloneHTML(fragment string) (string, error) {
	context := &html.Node{Type: html.ElementNode, DataAtom: atom.Div, Data: "div"}
	nodes, err := html.ParseFragment(strings.NewReader(fragment), context)
	if err != nil {
		return "", fmt.Errorf("parse rendered document: %w", err)
	}
	root := &html.Node{Type: html.ElementNode, DataAtom: atom.Div, Data: "div"}
	for _, node := range nodes {
		root.AppendChild(node)
	}
	sanitizeStandaloneNode(root)
	var output bytes.Buffer
	for node := root.FirstChild; node != nil; node = node.NextSibling {
		if err := html.Render(&output, node); err != nil {
			return "", fmt.Errorf("serialize rendered document: %w", err)
		}
	}
	return output.String(), nil
}

func sanitizeStandaloneNode(node *html.Node) {
	for child := node.FirstChild; child != nil; {
		next := child.NextSibling
		if child.Type == html.ElementNode && unsafeStandaloneElement(child.Data) {
			node.RemoveChild(child)
		} else {
			sanitizeStandaloneNode(child)
		}
		child = next
	}
	if node.Type != html.ElementNode {
		return
	}
	attributes := node.Attr[:0]
	for _, attribute := range node.Attr {
		name := strings.ToLower(attribute.Key)
		if strings.HasPrefix(name, "on") || name == "srcdoc" || name == "srcset" || name == "poster" || name == "background" || name == "action" || name == "formaction" {
			continue
		}
		if name == "style" {
			match := cssColorPattern.FindStringSubmatch(attribute.Val)
			if len(match) != 2 {
				continue
			}
			attribute.Val = "color:#" + strings.ToUpper(match[1])
		}
		if name == "href" && !safeStandaloneURL(attribute.Val, false) {
			continue
		}
		if name == "src" && !safeStandaloneURL(attribute.Val, strings.EqualFold(node.Data, "img")) {
			continue
		}
		attributes = append(attributes, attribute)
	}
	node.Attr = attributes
	removeFlattenedMathSource(node)
}

// removeFlattenedMathSource removes the plain-text LaTeX copy that some
// DOMPurify/WebView combinations leave directly below a MathML container after
// unwrapping KaTeX's <annotation>. The structural MathML remains the single
// exported representation, matching the formula shown in the application.
func removeFlattenedMathSource(node *html.Node) {
	if node == nil || node.Type != html.ElementNode {
		return
	}
	tag := strings.ToLower(node.Data)
	if tag != "math" && tag != "semantics" {
		return
	}
	hasStructuralMath := false
	for child := node.FirstChild; child != nil; child = child.NextSibling {
		if child.Type == html.ElementNode && !strings.EqualFold(child.Data, "annotation") && !strings.EqualFold(child.Data, "annotation-xml") {
			hasStructuralMath = true
			break
		}
	}
	if !hasStructuralMath {
		return
	}
	for child := node.FirstChild; child != nil; {
		next := child.NextSibling
		if (child.Type == html.TextNode && strings.TrimSpace(child.Data) != "") ||
			(child.Type == html.ElementNode && (strings.EqualFold(child.Data, "annotation") || strings.EqualFold(child.Data, "annotation-xml"))) {
			node.RemoveChild(child)
		}
		child = next
	}
}

func unsafeStandaloneElement(tag string) bool {
	switch strings.ToLower(tag) {
	case "script", "style", "iframe", "object", "embed", "form", "base", "meta", "link", "svg":
		return true
	default:
		return false
	}
}

func safeStandaloneURL(value string, image bool) bool {
	trimmed := strings.TrimSpace(value)
	if trimmed == "" || strings.HasPrefix(trimmed, "#") {
		return true
	}
	parsed, err := url.Parse(trimmed)
	if err != nil {
		return false
	}
	scheme := strings.ToLower(parsed.Scheme)
	if scheme == "http" || scheme == "https" || (!image && scheme == "mailto") {
		return true
	}
	return image && strings.HasPrefix(strings.ToLower(trimmed), "data:image/")
}
