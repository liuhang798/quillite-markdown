package main

import (
	"archive/zip"
	"bytes"
	"encoding/base64"
	"encoding/xml"
	"errors"
	"fmt"
	"image"
	_ "image/gif"
	_ "image/jpeg"
	_ "image/png"
	"io"
	"mime"
	"net/http"
	"net/url"
	"os"
	"path/filepath"
	"regexp"
	"strconv"
	"strings"
	"syscall"
	"time"

	wailsruntime "github.com/wailsapp/wails/v2/pkg/runtime"
	"golang.org/x/net/html"
	"golang.org/x/net/html/atom"
)

const (
	// Rendered HTML can be substantially larger than the Markdown source when
	// diagrams and local images are embedded. Keep a bounded limit, but allow a
	// full 64 MiB supported document plus that normal export expansion.
	maxRenderedExportHTMLSize  = 96 * 1024 * 1024
	maxDOCXImageSize           = 20 * 1024 * 1024
	exportFileInUseErrorMarker = "EXPORT_FILE_IN_USE"
	exportTooLargeErrorMarker  = "EXPORT_DOCUMENT_TOO_LARGE"
)

type docxRelationship struct {
	ID         string
	Type       string
	Target     string
	TargetMode string
}

type docxImage struct {
	RelID       string
	Name        string
	ContentType string
	Extension   string
	Data        []byte
	WidthEMU    int
	HeightEMU   int
	Alt         string
}

type docxRun struct {
	Text       string
	MathXML    string
	MathSource string
	Bold       bool
	Italic     bool
	Strike     bool
	Underline  bool
	Code       bool
	BlockCode  bool
	Highlight  bool
	Sup        bool
	Sub        bool
	Color      string
	Link       string
	Break      bool
	Image      *docxImage
}

type docxFormat struct {
	Bold      bool
	Italic    bool
	Strike    bool
	Underline bool
	Code      bool
	Highlight bool
	Sup       bool
	Sub       bool
	Color     string
	Link      string
}

type docxBuilder struct {
	body          strings.Builder
	relationships []docxRelationship
	images        []docxImage
	nextRel       int
	nextDrawing   int
	nextListNum   int
	orderedLists  []int
	baseDirectory string
	httpClient    *http.Client
}

var inlineSpacePattern = regexp.MustCompile(`\s+`)
var cssColorPattern = regexp.MustCompile(`(?i)(?:^|;)\s*color\s*:\s*#([0-9a-f]{6})(?:\s*;|$)`)

// ExportDOCX writes the current rendered Markdown document as a standards-based
// DOCX file. The conversion and packaging happen locally in Go.
func (a *App) ExportDOCX(sourcePath, title, renderedHTML string) (string, error) {
	if err := validateRenderedExportHTMLSize(len(renderedHTML)); err != nil {
		return "", err
	}
	defaultName := strings.TrimSuffix(filepath.Base(sourcePath), filepath.Ext(sourcePath))
	if strings.TrimSpace(defaultName) == "" || defaultName == "." {
		defaultName = strings.TrimSuffix(strings.TrimSpace(title), filepath.Ext(strings.TrimSpace(title)))
	}
	if defaultName == "" {
		defaultName = strings.TrimSuffix(a.text("newDocument"), filepath.Ext(a.text("newDocument")))
	}
	defaultName += ".docx"
	filePath, err := wailsruntime.SaveFileDialog(a.ctx, wailsruntime.SaveDialogOptions{
		Title:           a.text("exportWord"),
		DefaultFilename: defaultName,
		Filters: []wailsruntime.FileFilter{
			{DisplayName: a.text("wordDocument"), Pattern: "*.docx"},
		},
	})
	if err != nil || filePath == "" {
		return "", err
	}
	if !strings.EqualFold(filepath.Ext(filePath), ".docx") {
		filePath += ".docx"
	}
	data, err := buildDOCX(renderedHTML, title, filepath.Dir(sourcePath))
	if err != nil {
		return "", err
	}
	if err := writeFileAtomically(filePath, data); err != nil {
		return "", err
	}
	return filePath, nil
}

// classifyExportWriteError turns Windows sharing and lock violations into a
// stable business error that the frontend can explain without reporting it as
// a software fault. Numeric Errno values keep this testable on every platform.
func classifyExportWriteError(platform string, err error) error {
	if err == nil {
		return nil
	}
	if platform == "windows" {
		var errno syscall.Errno
		if errors.As(err, &errno) && (errno == syscall.Errno(32) || errno == syscall.Errno(33)) {
			return fmt.Errorf("%s: %w", exportFileInUseErrorMarker, err)
		}
	}
	return err
}

func buildDOCX(renderedHTML, title, baseDirectory string) ([]byte, error) {
	if err := validateRenderedExportHTMLSize(len(renderedHTML)); err != nil {
		return nil, err
	}
	// Avoid allocating a second full-size copy of large rendered documents just
	// to add the parser wrapper. The DOM is still bounded by the checked input
	// limit, while the source is streamed into the parser.
	document, err := html.Parse(io.MultiReader(
		strings.NewReader("<!doctype html><html><body>"),
		strings.NewReader(renderedHTML),
		strings.NewReader("</body></html>"),
	))
	if err != nil {
		return nil, fmt.Errorf("parse rendered document: %w", err)
	}
	builder := &docxBuilder{
		nextRel:       3,
		nextDrawing:   1,
		nextListNum:   2,
		baseDirectory: baseDirectory,
		httpClient:    newRemoteImageClient(),
	}
	body := findHTMLBody(document)
	if body == nil {
		return nil, errors.New("rendered document has no body")
	}
	for child := body.FirstChild; child != nil; child = child.NextSibling {
		builder.renderBlock(child, 0)
	}
	if strings.TrimSpace(builder.body.String()) == "" {
		builder.writeParagraph("Normal", 0, []docxRun{{Text: strings.TrimSpace(title)}})
	}
	return builder.packageDOCX(title)
}

func validateRenderedExportHTMLSize(size int) error {
	if size > maxRenderedExportHTMLSize {
		return errors.New(exportTooLargeErrorMarker + ": rendered document exceeds the 96 MiB export limit")
	}
	return nil
}

func findHTMLBody(node *html.Node) *html.Node {
	if node.Type == html.ElementNode && node.DataAtom == atom.Body {
		return node
	}
	for child := node.FirstChild; child != nil; child = child.NextSibling {
		if found := findHTMLBody(child); found != nil {
			return found
		}
	}
	return nil
}

func (b *docxBuilder) renderBlock(node *html.Node, listLevel int) {
	if node == nil {
		return
	}
	if node.Type == html.TextNode {
		if text := strings.TrimSpace(node.Data); text != "" {
			b.writeParagraph("Normal", listLevel, []docxRun{{Text: text}})
		}
		return
	}
	if node.Type != html.ElementNode {
		return
	}
	tag := strings.ToLower(node.Data)
	switch tag {
	case "h1", "h2", "h3", "h4", "h5", "h6":
		level, _ := strconv.Atoi(tag[1:])
		b.writeParagraph("Heading"+strconv.Itoa(level), 0, b.inlineRuns(node, docxFormat{}))
	case "p":
		b.writeParagraph("Normal", listLevel, b.inlineRuns(node, docxFormat{}))
	case "blockquote":
		wroteParagraph := false
		for child := node.FirstChild; child != nil; child = child.NextSibling {
			if child.Type == html.ElementNode && strings.EqualFold(child.Data, "p") {
				b.writeParagraph("Quote", listLevel, b.inlineRuns(child, docxFormat{}))
				wroteParagraph = true
			}
		}
		if !wroteParagraph {
			b.writeParagraph("Quote", listLevel, b.inlineRuns(node, docxFormat{}))
		}
	case "ul":
		b.renderList(node, false, listLevel, 1)
	case "ol":
		b.renderList(node, true, listLevel, 0)
	case "pre":
		b.writeCodeBlock(nodeText(node))
	case "table":
		b.writeTable(node)
	case "hr":
		b.body.WriteString(`<w:p><w:pPr><w:pBdr><w:bottom w:val="single" w:sz="6" w:space="8" w:color="B7BDB8"/></w:pBdr><w:spacing w:before="160" w:after="160"/></w:pPr></w:p>`)
	case "img":
		if imageRun := b.imageRun(node); imageRun != nil {
			b.writeParagraph("Normal", 0, []docxRun{*imageRun})
		}
	case "div":
		if hasHTMLClass(node, "math-block") {
			b.writeMathParagraph(node, listLevel)
			return
		}
		if hasHTMLClass(node, "code-block") {
			if pre := findFirstElement(node, "pre"); pre != nil {
				b.writeCodeBlock(nodeText(pre))
			}
			return
		}
		if hasHTMLClass(node, "plain-text") {
			b.writeCodeBlock(nodeText(node))
			return
		}
		b.renderChildren(node, listLevel)
	case "section", "article", "main", "details":
		b.renderChildren(node, listLevel)
	case "summary":
		b.writeParagraph("Heading3", listLevel, b.inlineRuns(node, docxFormat{}))
	default:
		if containsBlockElement(node) {
			b.renderChildren(node, listLevel)
		} else if runs := b.inlineRuns(node, docxFormat{}); runsHaveContent(runs) {
			b.writeParagraph("Normal", listLevel, runs)
		}
	}
}

func (b *docxBuilder) renderChildren(node *html.Node, listLevel int) {
	for child := node.FirstChild; child != nil; child = child.NextSibling {
		b.renderBlock(child, listLevel)
	}
}

func (b *docxBuilder) renderList(node *html.Node, ordered bool, listLevel, numID int) {
	if ordered && numID == 0 {
		numID = b.nextListNum
		b.nextListNum++
		b.orderedLists = append(b.orderedLists, numID)
	}
	if !ordered {
		numID = 1
	}
	for child := node.FirstChild; child != nil; child = child.NextSibling {
		if child.Type != html.ElementNode || strings.ToLower(child.Data) != "li" {
			continue
		}
		var runs []docxRun
		for item := child.FirstChild; item != nil; item = item.NextSibling {
			if item.Type == html.ElementNode && (strings.EqualFold(item.Data, "ul") || strings.EqualFold(item.Data, "ol")) {
				continue
			}
			runs = append(runs, b.inlineRuns(item, docxFormat{})...)
		}
		b.writeListParagraph(listLevel, numID, runs)
		for item := child.FirstChild; item != nil; item = item.NextSibling {
			if item.Type == html.ElementNode && strings.EqualFold(item.Data, "ul") {
				b.renderList(item, false, listLevel+1, 1)
			}
			if item.Type == html.ElementNode && strings.EqualFold(item.Data, "ol") {
				nestedNumID := numID
				if !ordered {
					nestedNumID = 0
				}
				b.renderList(item, true, listLevel+1, nestedNumID)
			}
		}
	}
}

func (b *docxBuilder) writeTable(table *html.Node) {
	rows := collectElements(table, "tr")
	if len(rows) == 0 {
		return
	}
	columnWidths := tableColumnWidths(rows, 9398)
	if len(columnWidths) == 0 {
		return
	}
	b.body.WriteString(`<w:tbl><w:tblPr><w:tblW w:w="9398" w:type="dxa"/><w:tblInd w:w="120" w:type="dxa"/><w:tblLayout w:type="fixed"/><w:tblCellMar><w:top w:w="100" w:type="dxa"/><w:start w:w="140" w:type="dxa"/><w:bottom w:w="100" w:type="dxa"/><w:end w:w="140" w:type="dxa"/></w:tblCellMar><w:tblBorders><w:top w:val="single" w:sz="4" w:color="CCD5CF"/><w:left w:val="single" w:sz="4" w:color="CCD5CF"/><w:bottom w:val="single" w:sz="4" w:color="CCD5CF"/><w:right w:val="single" w:sz="4" w:color="CCD5CF"/><w:insideH w:val="single" w:sz="4" w:color="D9E0DB"/><w:insideV w:val="single" w:sz="4" w:color="D9E0DB"/></w:tblBorders></w:tblPr><w:tblGrid>`)
	for _, width := range columnWidths {
		b.body.WriteString(`<w:gridCol w:w="` + strconv.Itoa(width) + `"/>`)
	}
	b.body.WriteString(`</w:tblGrid>`)
	for rowIndex, row := range rows {
		b.body.WriteString(`<w:tr>`)
		if rowIndex == 0 {
			b.body.WriteString(`<w:trPr><w:tblHeader/></w:trPr>`)
		}
		cells := directChildElements(row, "th", "td")
		for columnIndex, cell := range cells {
			width := columnWidths[min(columnIndex, len(columnWidths)-1)]
			b.body.WriteString(`<w:tc><w:tcPr><w:tcW w:w="` + strconv.Itoa(width) + `" w:type="dxa"/><w:vAlign w:val="center"/>`)
			if rowIndex == 0 || strings.EqualFold(cell.Data, "th") {
				b.body.WriteString(`<w:shd w:val="clear" w:fill="E7F3EC"/>`)
			}
			b.body.WriteString(`</w:tcPr>`)
			runs := b.inlineRuns(cell, docxFormat{Bold: rowIndex == 0 || strings.EqualFold(cell.Data, "th")})
			b.writeParagraph("TableText", 0, runs)
			b.body.WriteString(`</w:tc>`)
		}
		b.body.WriteString(`</w:tr>`)
	}
	b.body.WriteString(`</w:tbl>`)
}

func (b *docxBuilder) inlineRuns(node *html.Node, format docxFormat) []docxRun {
	if node == nil {
		return nil
	}
	if node.Type == html.TextNode {
		text := inlineSpacePattern.ReplaceAllString(node.Data, " ")
		if text == "" {
			return nil
		}
		return []docxRun{{Text: text, Bold: format.Bold, Italic: format.Italic, Strike: format.Strike, Underline: format.Underline, Code: format.Code, Highlight: format.Highlight, Sup: format.Sup, Sub: format.Sub, Color: format.Color, Link: format.Link}}
	}
	if node.Type != html.ElementNode {
		return nil
	}
	if hasHTMLClass(node, "math-inline") || hasHTMLClass(node, "math-block") {
		if formula := mathOMML(node); formula != "" {
			return []docxRun{{MathXML: formula, MathSource: mathSource(node)}}
		}
		if source := mathSource(node); source != "" {
			return []docxRun{{Text: source, Bold: format.Bold, Italic: format.Italic, Color: format.Color, Link: format.Link, Code: true}}
		}
		return nil
	}
	next := format
	switch strings.ToLower(node.Data) {
	case "strong", "b":
		next.Bold = true
	case "em", "i":
		next.Italic = true
	case "s", "strike", "del":
		next.Strike = true
	case "u":
		next.Underline = true
	case "code", "kbd":
		next.Code = true
	case "mark":
		next.Highlight = true
	case "sup":
		next.Sup = true
	case "sub":
		next.Sub = true
	case "a":
		next.Link = htmlAttribute(node, "href")
	case "br":
		return []docxRun{{Break: true}}
	case "img":
		if imageRun := b.imageRun(node); imageRun != nil {
			return []docxRun{*imageRun}
		}
	case "input":
		if strings.EqualFold(htmlAttribute(node, "type"), "checkbox") {
			checked := htmlAttributePresent(node, "checked")
			if checked {
				return []docxRun{{Text: "☑ ", Color: "159A63"}}
			}
			return []docxRun{{Text: "☐ ", Color: "68716B"}}
		}
	}
	if color := htmlTextColor(node); color != "" {
		next.Color = color
	}
	var runs []docxRun
	for child := node.FirstChild; child != nil; child = child.NextSibling {
		runs = append(runs, b.inlineRuns(child, next)...)
	}
	return runs
}

func (b *docxBuilder) writeParagraph(style string, indentLevel int, runs []docxRun) {
	runs = removeDuplicateMathSourceRuns(runs)
	if !runsHaveContent(runs) {
		return
	}
	b.body.WriteString(`<w:p><w:pPr>`)
	if style != "" && style != "Normal" {
		b.body.WriteString(`<w:pStyle w:val="` + xmlAttribute(style) + `"/>`)
	}
	if indentLevel > 0 {
		b.body.WriteString(`<w:ind w:left="` + strconv.Itoa(indentLevel*360) + `"/>`)
	}
	b.body.WriteString(`</w:pPr>`)
	for _, run := range runs {
		b.writeRun(run)
	}
	b.body.WriteString(`</w:p>`)
}

func (b *docxBuilder) writeMathParagraph(node *html.Node, indentLevel int) {
	if formula, label, ok := taggedMathOMML(node); ok {
		b.body.WriteString(`<w:p><w:pPr><w:tabs><w:tab w:val="center" w:pos="4699"/><w:tab w:val="right" w:pos="9398"/></w:tabs><w:spacing w:before="100" w:after="160"/>`)
		if indentLevel > 0 {
			b.body.WriteString(`<w:ind w:left="` + strconv.Itoa(indentLevel*360) + `"/>`)
		}
		b.body.WriteString(`</w:pPr><w:r><w:tab/></w:r><m:oMath>` + formula + `</m:oMath><w:r><w:tab/></w:r><m:oMath>` + label + `</m:oMath></w:p>`)
		return
	}
	formula := mathOMML(node)
	if formula == "" {
		if source := mathSource(node); source != "" {
			b.writeParagraph("Normal", indentLevel, []docxRun{{Text: source, Code: true}})
		}
		return
	}
	b.body.WriteString(`<w:p><w:pPr><w:jc w:val="center"/><w:spacing w:before="100" w:after="160"/>`)
	if indentLevel > 0 {
		b.body.WriteString(`<w:ind w:left="` + strconv.Itoa(indentLevel*360) + `"/>`)
	}
	b.body.WriteString(`</w:pPr><m:oMathPara><m:oMathParaPr><m:jc m:val="centerGroup"/></m:oMathParaPr><m:oMath>` + formula + `</m:oMath></m:oMathPara></w:p>`)
}

func taggedMathOMML(node *html.Node) (string, string, bool) {
	math := findFirstElement(node, "math")
	if math == nil {
		return "", "", false
	}
	table := findFirstElement(math, "mtable")
	if table == nil || !strings.EqualFold(strings.TrimSpace(htmlAttribute(table, "width")), "100%") {
		return "", "", false
	}
	rows := directChildElements(table, "mtr", "mlabeledtr")
	if len(rows) != 1 {
		return "", "", false
	}
	var populated []string
	for _, cell := range directChildElements(rows[0], "mtd") {
		if content := mathMLNodeToOMML(cell); content != "" {
			populated = append(populated, content)
		}
	}
	if len(populated) < 2 {
		return "", "", false
	}
	return populated[0], populated[len(populated)-1], true
}

func (b *docxBuilder) writeListParagraph(listLevel, numID int, runs []docxRun) {
	runs = removeDuplicateMathSourceRuns(runs)
	if !runsHaveContent(runs) {
		return
	}
	level := listLevel
	if level < 0 {
		level = 0
	}
	if level > 8 {
		level = 8
	}
	b.body.WriteString(`<w:p><w:pPr><w:pStyle w:val="ListParagraph"/><w:numPr><w:ilvl w:val="` + strconv.Itoa(level) + `"/><w:numId w:val="` + strconv.Itoa(numID) + `"/></w:numPr></w:pPr>`)
	for _, run := range runs {
		b.writeRun(run)
	}
	b.body.WriteString(`</w:p>`)
}

// removeDuplicateMathSourceRuns prevents a KaTeX source fallback from being
// emitted beside a successfully converted native Office Math equation. Some
// WebView/WPS combinations expose both accessibility layers in list items.
func removeDuplicateMathSourceRuns(runs []docxRun) []docxRun {
	if len(runs) < 2 {
		return runs
	}
	remove := make([]bool, len(runs))
	for index, run := range runs {
		source := normalizedMathSource(run.MathSource)
		if run.MathXML == "" || source == "" {
			continue
		}
		var combined strings.Builder
		for candidate := index + 1; candidate < len(runs); candidate++ {
			next := runs[candidate]
			if next.MathXML != "" || next.Image != nil || next.Break {
				break
			}
			combined.WriteString(next.Text)
			text := normalizedMathSource(combined.String())
			if text == "" {
				continue
			}
			if text == source {
				for duplicate := index + 1; duplicate <= candidate; duplicate++ {
					remove[duplicate] = true
				}
				break
			}
			if !strings.HasPrefix(source, text) {
				break
			}
		}
	}
	output := make([]docxRun, 0, len(runs))
	for index, run := range runs {
		if !remove[index] {
			output = append(output, run)
		}
	}
	return output
}

func normalizedMathSource(source string) string {
	source = strings.TrimSpace(source)
	switch {
	case strings.HasPrefix(source, "$$") && strings.HasSuffix(source, "$$") && len(source) >= 4:
		source = source[2 : len(source)-2]
	case strings.HasPrefix(source, "\\(") && strings.HasSuffix(source, "\\)") && len(source) >= 4:
		source = source[2 : len(source)-2]
	case strings.HasPrefix(source, "\\[") && strings.HasSuffix(source, "\\]") && len(source) >= 4:
		source = source[2 : len(source)-2]
	case strings.HasPrefix(source, "$") && strings.HasSuffix(source, "$") && len(source) >= 2:
		source = source[1 : len(source)-1]
	}
	return strings.Join(strings.Fields(source), "")
}

func (b *docxBuilder) writeCodeBlock(text string) {
	text = strings.TrimSuffix(strings.ReplaceAll(text, "\r\n", "\n"), "\n")
	runs := make([]docxRun, 0, strings.Count(text, "\n")*2+1)
	for index, line := range strings.Split(text, "\n") {
		if index > 0 {
			runs = append(runs, docxRun{Break: true})
		}
		runs = append(runs, docxRun{Text: line, BlockCode: true})
	}
	if len(runs) == 0 {
		runs = []docxRun{{Text: " ", BlockCode: true}}
	}
	b.body.WriteString(`<w:p><w:pPr><w:pStyle w:val="CodeBlock"/></w:pPr>`)
	for _, run := range runs {
		b.writeRun(run)
	}
	b.body.WriteString(`</w:p>`)
}

func (b *docxBuilder) writeRun(run docxRun) {
	if run.Image != nil {
		b.writeImageRun(*run.Image)
		return
	}
	if run.Break {
		b.body.WriteString(`<w:r><w:br/></w:r>`)
		return
	}
	if run.MathXML != "" {
		b.body.WriteString(`<m:oMath>` + run.MathXML + `</m:oMath>`)
		return
	}
	if run.Text == "" {
		return
	}
	write := func() {
		b.body.WriteString(`<w:r><w:rPr>`)
		if run.Bold {
			b.body.WriteString(`<w:b/><w:bCs/>`)
		}
		if run.Italic {
			b.body.WriteString(`<w:i/><w:iCs/>`)
		}
		if run.Strike {
			b.body.WriteString(`<w:strike/>`)
		}
		if run.Underline || run.Link != "" {
			b.body.WriteString(`<w:u w:val="single"/>`)
		}
		if run.Code || run.BlockCode {
			b.body.WriteString(`<w:rFonts w:ascii="Consolas" w:hAnsi="Consolas" w:eastAsia="Microsoft YaHei"/><w:sz w:val="19"/>`)
		}
		if run.Code {
			b.body.WriteString(`<w:shd w:val="clear" w:fill="EEF3EF"/>`)
		}
		if run.BlockCode {
			b.body.WriteString(`<w:sz w:val="19"/>`)
		}
		if run.Highlight {
			b.body.WriteString(`<w:highlight w:val="yellow"/>`)
		}
		if run.Sup {
			b.body.WriteString(`<w:vertAlign w:val="superscript"/>`)
		}
		if run.Sub {
			b.body.WriteString(`<w:vertAlign w:val="subscript"/>`)
		}
		if run.Color != "" {
			b.body.WriteString(`<w:color w:val="` + xmlAttribute(run.Color) + `"/>`)
		} else if run.Link != "" {
			b.body.WriteString(`<w:color w:val="159A63"/>`)
		}
		b.body.WriteString(`</w:rPr><w:t xml:space="preserve">` + xmlText(run.Text) + `</w:t></w:r>`)
	}
	if run.Link != "" && isExportableLink(run.Link) {
		relID := b.addRelationship("http://schemas.openxmlformats.org/officeDocument/2006/relationships/hyperlink", run.Link, "External")
		b.body.WriteString(`<w:hyperlink r:id="` + relID + `">`)
		write()
		b.body.WriteString(`</w:hyperlink>`)
		return
	}
	write()
}

func (b *docxBuilder) imageRun(node *html.Node) *docxRun {
	source := strings.TrimSpace(htmlAttribute(node, "src"))
	if source == "" {
		return nil
	}
	data, contentType, err := b.loadImage(source)
	if err != nil || len(data) == 0 {
		alt := strings.TrimSpace(htmlAttribute(node, "alt"))
		if alt == "" {
			alt = "[Image]"
		}
		return &docxRun{Text: alt, Italic: true, Color: "68716B"}
	}
	extension := imageExtension(contentType, data)
	if extension == "" {
		return &docxRun{Text: strings.TrimSpace(htmlAttribute(node, "alt")), Italic: true, Color: "68716B"}
	}
	width, height := imageSizeEMU(data)
	relID := b.addRelationship("http://schemas.openxmlformats.org/officeDocument/2006/relationships/image", "media/image"+strconv.Itoa(len(b.images)+1)+"."+extension, "")
	image := docxImage{
		RelID: relID, Name: "image" + strconv.Itoa(len(b.images)+1) + "." + extension,
		ContentType: contentTypeForExtension(extension), Extension: extension, Data: data,
		WidthEMU: width, HeightEMU: height, Alt: htmlAttribute(node, "alt"),
	}
	b.images = append(b.images, image)
	return &docxRun{Image: &b.images[len(b.images)-1]}
}

func (b *docxBuilder) loadImage(source string) ([]byte, string, error) {
	if strings.HasPrefix(strings.ToLower(source), "data:image/") {
		comma := strings.IndexByte(source, ',')
		if comma < 0 || !strings.Contains(strings.ToLower(source[:comma]), ";base64") {
			return nil, "", errors.New("unsupported image data URL")
		}
		contentType := strings.TrimSpace(strings.Split(source[5:comma], ";")[0])
		decoded, err := base64.StdEncoding.DecodeString(source[comma+1:])
		if err != nil || len(decoded) > maxDOCXImageSize {
			return nil, "", errors.New("invalid or oversized image data")
		}
		return decoded, contentType, nil
	}
	parsed, err := url.Parse(source)
	if err == nil && (parsed.Scheme == "http" || parsed.Scheme == "https") {
		request, err := http.NewRequest(http.MethodGet, source, nil)
		if err != nil {
			return nil, "", err
		}
		request.Header.Set("User-Agent", "QuilliteMarkdown/"+appVersion)
		response, err := b.httpClient.Do(request)
		if err != nil {
			return nil, "", err
		}
		defer response.Body.Close()
		if response.StatusCode < 200 || response.StatusCode >= 300 {
			return nil, "", fmt.Errorf("image request returned %s", response.Status)
		}
		data, err := io.ReadAll(io.LimitReader(response.Body, maxDOCXImageSize+1))
		if err != nil || len(data) > maxDOCXImageSize {
			return nil, "", errors.New("image download failed or exceeded the size limit")
		}
		contentType := strings.Split(response.Header.Get("Content-Type"), ";")[0]
		if !strings.HasPrefix(contentType, "image/") {
			contentType = http.DetectContentType(data)
		}
		return data, contentType, nil
	}
	resolved, err := resolveLocalImagePath(source, b.baseDirectory)
	if err != nil {
		return nil, "", err
	}
	info, err := os.Stat(resolved)
	if err != nil || info.IsDir() || info.Size() > maxDOCXImageSize {
		return nil, "", errors.New("local image is unavailable or too large")
	}
	data, err := os.ReadFile(resolved)
	if err != nil {
		return nil, "", err
	}
	contentType := strings.Split(mime.TypeByExtension(strings.ToLower(filepath.Ext(resolved))), ";")[0]
	if contentType == "" {
		contentType = http.DetectContentType(data)
	}
	return data, contentType, nil
}

func (b *docxBuilder) writeImageRun(image docxImage) {
	drawingID := b.nextDrawing
	b.nextDrawing++
	alt := xmlAttribute(image.Alt)
	b.body.WriteString(`<w:r><w:drawing><wp:inline distT="0" distB="0" distL="0" distR="0"><wp:extent cx="` + strconv.Itoa(image.WidthEMU) + `" cy="` + strconv.Itoa(image.HeightEMU) + `"/><wp:effectExtent l="0" t="0" r="0" b="0"/><wp:docPr id="` + strconv.Itoa(drawingID) + `" name="Image ` + strconv.Itoa(drawingID) + `" descr="` + alt + `"/><wp:cNvGraphicFramePr><a:graphicFrameLocks noChangeAspect="1"/></wp:cNvGraphicFramePr><a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:pic><pic:nvPicPr><pic:cNvPr id="0" name="` + xmlAttribute(image.Name) + `"/><pic:cNvPicPr/></pic:nvPicPr><pic:blipFill><a:blip r:embed="` + image.RelID + `"/><a:stretch><a:fillRect/></a:stretch></pic:blipFill><pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="` + strconv.Itoa(image.WidthEMU) + `" cy="` + strconv.Itoa(image.HeightEMU) + `"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></pic:spPr></pic:pic></a:graphicData></a:graphic></wp:inline></w:drawing></w:r>`)
}

func (b *docxBuilder) addRelationship(relType, target, targetMode string) string {
	id := "rId" + strconv.Itoa(b.nextRel)
	b.nextRel++
	b.relationships = append(b.relationships, docxRelationship{ID: id, Type: relType, Target: target, TargetMode: targetMode})
	return id
}

func (b *docxBuilder) packageDOCX(title string) ([]byte, error) {
	var output bytes.Buffer
	archive := zip.NewWriter(&output)
	files := map[string][]byte{
		"[Content_Types].xml":          []byte(b.contentTypesXML()),
		"_rels/.rels":                  []byte(rootRelationshipsXML),
		"word/document.xml":            []byte(documentXMLPrefix + b.body.String() + documentXMLSuffix),
		"word/styles.xml":              []byte(stylesXML),
		"word/numbering.xml":           []byte(b.numberingXML()),
		"word/settings.xml":            []byte(settingsXML),
		"word/_rels/document.xml.rels": []byte(b.documentRelationshipsXML()),
		"docProps/core.xml":            []byte(corePropertiesXML(title)),
	}
	for _, image := range b.images {
		files["word/media/"+image.Name] = image.Data
	}
	for name, data := range files {
		entry, err := archive.Create(name)
		if err != nil {
			return nil, err
		}
		if _, err := entry.Write(data); err != nil {
			return nil, err
		}
	}
	if err := archive.Close(); err != nil {
		return nil, err
	}
	return output.Bytes(), nil
}

func (b *docxBuilder) contentTypesXML() string {
	extensions := map[string]string{}
	for _, image := range b.images {
		extensions[image.Extension] = image.ContentType
	}
	var defaults strings.Builder
	for _, extension := range []string{"png", "jpg", "jpeg", "gif", "bmp", "webp"} {
		if contentType := extensions[extension]; contentType != "" {
			defaults.WriteString(`<Default Extension="` + extension + `" ContentType="` + xmlAttribute(contentType) + `"/>`)
		}
	}
	return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/>` + defaults.String() + `<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/><Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/><Override PartName="/word/numbering.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.numbering+xml"/><Override PartName="/word/settings.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.settings+xml"/><Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/></Types>`
}

func (b *docxBuilder) documentRelationshipsXML() string {
	var relationships strings.Builder
	relationships.WriteString(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/numbering" Target="numbering.xml"/><Relationship Id="rIdSettings" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/settings" Target="settings.xml"/>`)
	for _, relationship := range b.relationships {
		relationships.WriteString(`<Relationship Id="` + xmlAttribute(relationship.ID) + `" Type="` + xmlAttribute(relationship.Type) + `" Target="` + xmlAttribute(relationship.Target) + `"`)
		if relationship.TargetMode != "" {
			relationships.WriteString(` TargetMode="` + xmlAttribute(relationship.TargetMode) + `"`)
		}
		relationships.WriteString(`/>`)
	}
	relationships.WriteString(`</Relationships>`)
	return relationships.String()
}

func corePropertiesXML(title string) string {
	return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"><dc:title>` + xmlText(title) + `</dc:title><dc:creator>Quillite Markdown</dc:creator><cp:lastModifiedBy>Quillite Markdown</cp:lastModifiedBy><dcterms:created xsi:type="dcterms:W3CDTF">` + time.Now().UTC().Format(time.RFC3339) + `</dcterms:created></cp:coreProperties>`
}

func imageSizeEMU(data []byte) (int, int) {
	width, height := 640, 360
	if config, _, err := image.DecodeConfig(bytes.NewReader(data)); err == nil && config.Width > 0 && config.Height > 0 {
		width, height = config.Width, config.Height
	}
	const emuPerPixel = 9525
	const maxWidth = 5669280
	const maxHeight = 7547040
	widthEMU, heightEMU := width*emuPerPixel, height*emuPerPixel
	if widthEMU > maxWidth {
		heightEMU = heightEMU * maxWidth / widthEMU
		widthEMU = maxWidth
	}
	if heightEMU > maxHeight {
		widthEMU = widthEMU * maxHeight / heightEMU
		heightEMU = maxHeight
	}
	return widthEMU, heightEMU
}

func imageExtension(contentType string, data []byte) string {
	contentType = strings.ToLower(strings.TrimSpace(strings.Split(contentType, ";")[0]))
	switch contentType {
	case "image/png":
		return "png"
	case "image/jpeg", "image/jpg":
		return "jpg"
	case "image/gif":
		return "gif"
	case "image/bmp":
		return "bmp"
	case "image/webp":
		return "webp"
	}
	if len(data) > 0 {
		detected := strings.ToLower(strings.TrimSpace(strings.Split(http.DetectContentType(data), ";")[0]))
		if detected != contentType {
			switch detected {
			case "image/png":
				return "png"
			case "image/jpeg":
				return "jpg"
			case "image/gif":
				return "gif"
			case "image/bmp":
				return "bmp"
			case "image/webp":
				return "webp"
			}
		}
	}
	return ""
}

func contentTypeForExtension(extension string) string {
	switch extension {
	case "png":
		return "image/png"
	case "jpg", "jpeg":
		return "image/jpeg"
	case "gif":
		return "image/gif"
	case "bmp":
		return "image/bmp"
	case "webp":
		return "image/webp"
	default:
		return "application/octet-stream"
	}
}

func htmlAttribute(node *html.Node, name string) string {
	for _, attribute := range node.Attr {
		if strings.EqualFold(attribute.Key, name) {
			return attribute.Val
		}
	}
	return ""
}

func htmlAttributePresent(node *html.Node, name string) bool {
	for _, attribute := range node.Attr {
		if strings.EqualFold(attribute.Key, name) {
			return true
		}
	}
	return false
}

func hasHTMLClass(node *html.Node, className string) bool {
	for _, value := range strings.Fields(htmlAttribute(node, "class")) {
		if value == className {
			return true
		}
	}
	return false
}

func mathSource(node *html.Node) string {
	if node == nil {
		return ""
	}
	if encoded := strings.TrimSpace(htmlAttribute(node, "data-math-source")); encoded != "" {
		if decoded, err := url.PathUnescape(encoded); err == nil {
			return strings.TrimSpace(decoded)
		}
		return encoded
	}
	if node.Type == html.ElementNode && strings.EqualFold(node.Data, "annotation") && strings.EqualFold(htmlAttribute(node, "encoding"), "application/x-tex") {
		return strings.TrimSpace(nodeText(node))
	}
	for child := node.FirstChild; child != nil; child = child.NextSibling {
		if source := mathSource(child); source != "" {
			return source
		}
	}
	return ""
}

// mathOMML converts the accessible MathML emitted by KaTeX into native Office
// Math markup. Keeping formulas as OMML makes them visible, scalable and
// editable in Word instead of exporting the hidden LaTeX source as plain text.
func mathOMML(node *html.Node) string {
	math := findFirstElement(node, "math")
	if math == nil {
		return ""
	}
	return mathMLNodeToOMML(math)
}

func mathMLNodeToOMML(node *html.Node) string {
	if node == nil {
		return ""
	}
	if node.Type == html.TextNode {
		if strings.TrimSpace(node.Data) == "" {
			return ""
		}
		return mathTextRun(node.Data, false)
	}
	if node.Type != html.ElementNode {
		return ""
	}
	tag := strings.ToLower(node.Data)
	children := func() string {
		return mathMLChildrenToOMML(node)
	}
	childAt := func(index int) string {
		current := 0
		for child := node.FirstChild; child != nil; child = child.NextSibling {
			if child.Type == html.TextNode && strings.TrimSpace(child.Data) == "" {
				continue
			}
			if current == index {
				return mathMLNodeToOMML(child)
			}
			current++
		}
		return ""
	}
	switch tag {
	case "math":
		return mathMLStructuralChildrenToOMML(node)
	case "mrow", "mstyle", "mpadded", "menclose", "maction":
		return children()
	case "semantics":
		for child := node.FirstChild; child != nil; child = child.NextSibling {
			if child.Type == html.ElementNode && !strings.EqualFold(child.Data, "annotation") && !strings.EqualFold(child.Data, "annotation-xml") {
				return mathMLNodeToOMML(child)
			}
		}
		return ""
	case "annotation", "annotation-xml", "mphantom", "none":
		return ""
	case "mi", "mn", "mo", "mtext", "ms":
		text := nodeText(node)
		italic := tag == "mi" && !strings.EqualFold(htmlAttribute(node, "mathvariant"), "normal") && len([]rune(strings.TrimSpace(text))) == 1
		return mathTextRun(text, italic)
	case "mglyph":
		return mathTextRun(htmlAttribute(node, "alt"), false)
	case "mspace":
		return mathTextRun(" ", false)
	case "msup":
		return `<m:sSup><m:e>` + childAt(0) + `</m:e><m:sup>` + childAt(1) + `</m:sup></m:sSup>`
	case "msub":
		return `<m:sSub><m:e>` + childAt(0) + `</m:e><m:sub>` + childAt(1) + `</m:sub></m:sSub>`
	case "msubsup":
		return `<m:sSubSup><m:e>` + childAt(0) + `</m:e><m:sub>` + childAt(1) + `</m:sub><m:sup>` + childAt(2) + `</m:sup></m:sSubSup>`
	case "mfrac":
		properties := ""
		if thickness := strings.ToLower(strings.TrimSpace(htmlAttribute(node, "linethickness"))); thickness == "0" || thickness == "0px" {
			properties = `<m:fPr><m:type m:val="noBar"/></m:fPr>`
		}
		return `<m:f>` + properties + `<m:num>` + childAt(0) + `</m:num><m:den>` + childAt(1) + `</m:den></m:f>`
	case "msqrt":
		return `<m:rad><m:radPr><m:degHide m:val="1"/></m:radPr><m:deg/><m:e>` + children() + `</m:e></m:rad>`
	case "mroot":
		return `<m:rad><m:deg>` + childAt(1) + `</m:deg><m:e>` + childAt(0) + `</m:e></m:rad>`
	case "munder":
		return `<m:limLow><m:e>` + childAt(0) + `</m:e><m:lim>` + childAt(1) + `</m:lim></m:limLow>`
	case "mover":
		base, over := childAt(0), childAt(1)
		if over == "" {
			return base
		}
		if strings.EqualFold(htmlAttribute(node, "accent"), "true") {
			accent := strings.TrimSpace(nodeText(elementChild(node, 1)))
			if accent == "" {
				return base
			}
			return `<m:acc><m:accPr><m:chr m:val="` + xmlAttribute(accent) + `"/></m:accPr><m:e>` + base + `</m:e></m:acc>`
		}
		return `<m:limUpp><m:e>` + base + `</m:e><m:lim>` + over + `</m:lim></m:limUpp>`
	case "munderover":
		lower := `<m:limLow><m:e>` + childAt(0) + `</m:e><m:lim>` + childAt(1) + `</m:lim></m:limLow>`
		return `<m:limUpp><m:e>` + lower + `</m:e><m:lim>` + childAt(2) + `</m:lim></m:limUpp>`
	case "mfenced":
		open, close := htmlAttribute(node, "open"), htmlAttribute(node, "close")
		if open == "" {
			open = "("
		}
		if close == "" {
			close = ")"
		}
		return `<m:d><m:dPr><m:begChr m:val="` + xmlAttribute(open) + `"/><m:endChr m:val="` + xmlAttribute(close) + `"/></m:dPr><m:e>` + children() + `</m:e></m:d>`
	case "mtable":
		return mathTableOMML(node)
	case "mtr", "mlabeledtr":
		var row strings.Builder
		for child := node.FirstChild; child != nil; child = child.NextSibling {
			if child.Type == html.ElementNode && strings.EqualFold(child.Data, "mtd") {
				row.WriteString(`<m:e>` + mathMLNodeToOMML(child) + `</m:e>`)
			}
		}
		return `<m:mr>` + row.String() + `</m:mr>`
	case "mtd":
		return children()
	default:
		return children()
	}
}

// mathMLStructuralChildrenToOMML ignores flattened KaTeX annotation text when
// a MathML container already has structural element children. This protects
// DOCX exports even when an older frontend sends <math><mrow>...</mrow>latex
// source</math> after sanitization.
func mathMLStructuralChildrenToOMML(node *html.Node) string {
	hasElement := false
	for child := node.FirstChild; child != nil; child = child.NextSibling {
		if child.Type == html.ElementNode && !strings.EqualFold(child.Data, "annotation") && !strings.EqualFold(child.Data, "annotation-xml") {
			hasElement = true
			break
		}
	}
	if !hasElement {
		return mathMLChildrenToOMML(node)
	}
	var output strings.Builder
	for child := node.FirstChild; child != nil; child = child.NextSibling {
		if child.Type != html.ElementNode || strings.EqualFold(child.Data, "annotation") || strings.EqualFold(child.Data, "annotation-xml") {
			continue
		}
		output.WriteString(mathMLNodeToOMML(child))
	}
	return output.String()
}

func mathMLChildrenToOMML(node *html.Node) string {
	var output strings.Builder
	for child := node.FirstChild; child != nil; {
		if child.Type == html.TextNode && strings.TrimSpace(child.Data) == "" {
			child = child.NextSibling
			continue
		}
		next := nextMathSibling(child.NextSibling)
		if next != nil && next.Type == html.ElementNode && mathMLNodeToOMML(elementChild(next, 0)) == "" {
			base := mathMLNodeToOMML(child)
			switch strings.ToLower(next.Data) {
			case "msub":
				output.WriteString(`<m:sSub><m:e>` + base + `</m:e><m:sub>` + mathMLNodeToOMML(elementChild(next, 1)) + `</m:sub></m:sSub>`)
				child = next.NextSibling
				continue
			case "msup":
				output.WriteString(`<m:sSup><m:e>` + base + `</m:e><m:sup>` + mathMLNodeToOMML(elementChild(next, 1)) + `</m:sup></m:sSup>`)
				child = next.NextSibling
				continue
			case "msubsup":
				output.WriteString(`<m:sSubSup><m:e>` + base + `</m:e><m:sub>` + mathMLNodeToOMML(elementChild(next, 1)) + `</m:sub><m:sup>` + mathMLNodeToOMML(elementChild(next, 2)) + `</m:sup></m:sSubSup>`)
				child = next.NextSibling
				continue
			}
		}
		output.WriteString(mathMLNodeToOMML(child))
		child = child.NextSibling
	}
	return output.String()
}

func nextMathSibling(node *html.Node) *html.Node {
	for current := node; current != nil; current = current.NextSibling {
		if current.Type != html.TextNode || strings.TrimSpace(current.Data) != "" {
			return current
		}
	}
	return nil
}

func mathTextRun(text string, italic bool) string {
	if text == "" {
		return ""
	}
	style := `<m:rPr><m:sty m:val="p"/></m:rPr>`
	if italic {
		style = `<m:rPr><m:sty m:val="i"/></m:rPr>`
	}
	return `<m:r>` + style + `<m:t xml:space="preserve">` + xmlText(text) + `</m:t></m:r>`
}

func mathTableOMML(table *html.Node) string {
	rows := directChildElements(table, "mtr", "mlabeledtr")
	if len(rows) == 0 {
		return ""
	}
	columns := 1
	for _, row := range rows {
		if count := len(directChildElements(row, "mtd")); count > columns {
			columns = count
		}
	}
	return `<m:m><m:mPr><m:mcs><m:mc><m:mcPr><m:count m:val="` + strconv.Itoa(columns) + `"/><m:mcJc m:val="center"/></m:mcPr></m:mc></m:mcs></m:mPr>` + mathChildrenByTag(table, "mtr", "mlabeledtr") + `</m:m>`
}

func mathChildrenByTag(node *html.Node, tags ...string) string {
	allowed := map[string]bool{}
	for _, tag := range tags {
		allowed[strings.ToLower(tag)] = true
	}
	var output strings.Builder
	for child := node.FirstChild; child != nil; child = child.NextSibling {
		if child.Type == html.ElementNode && allowed[strings.ToLower(child.Data)] {
			output.WriteString(mathMLNodeToOMML(child))
		}
	}
	return output.String()
}

func elementChild(node *html.Node, index int) *html.Node {
	current := 0
	for child := node.FirstChild; child != nil; child = child.NextSibling {
		if child.Type != html.ElementNode {
			continue
		}
		if current == index {
			return child
		}
		current++
	}
	return nil
}

func htmlTextColor(node *html.Node) string {
	style := htmlAttribute(node, "style")
	match := cssColorPattern.FindStringSubmatch(style)
	if len(match) == 2 {
		return strings.ToUpper(match[1])
	}
	return ""
}

func nodeText(node *html.Node) string {
	var value strings.Builder
	var walk func(*html.Node)
	walk = func(current *html.Node) {
		if current.Type == html.TextNode {
			value.WriteString(current.Data)
		}
		if current.Type == html.ElementNode && strings.EqualFold(current.Data, "br") {
			value.WriteByte('\n')
		}
		for child := current.FirstChild; child != nil; child = child.NextSibling {
			walk(child)
		}
	}
	walk(node)
	return value.String()
}

func findFirstElement(node *html.Node, tag string) *html.Node {
	if node.Type == html.ElementNode && strings.EqualFold(node.Data, tag) {
		return node
	}
	for child := node.FirstChild; child != nil; child = child.NextSibling {
		if found := findFirstElement(child, tag); found != nil {
			return found
		}
	}
	return nil
}

func collectElements(node *html.Node, tag string) []*html.Node {
	var result []*html.Node
	var walk func(*html.Node)
	walk = func(current *html.Node) {
		if current.Type == html.ElementNode && strings.EqualFold(current.Data, tag) {
			result = append(result, current)
		}
		for child := current.FirstChild; child != nil; child = child.NextSibling {
			walk(child)
		}
	}
	walk(node)
	return result
}

func directChildElements(node *html.Node, tags ...string) []*html.Node {
	allowed := map[string]bool{}
	for _, tag := range tags {
		allowed[strings.ToLower(tag)] = true
	}
	var result []*html.Node
	for child := node.FirstChild; child != nil; child = child.NextSibling {
		if child.Type == html.ElementNode && allowed[strings.ToLower(child.Data)] {
			result = append(result, child)
		}
	}
	return result
}

func tableColumnWidths(rows []*html.Node, totalWidth int) []int {
	columnCount := 0
	for _, row := range rows {
		if count := len(directChildElements(row, "th", "td")); count > columnCount {
			columnCount = count
		}
	}
	if columnCount == 0 {
		return nil
	}
	weights := make([]int, columnCount)
	for _, row := range rows {
		for columnIndex, cell := range directChildElements(row, "th", "td") {
			length := len([]rune(strings.TrimSpace(nodeText(cell))))
			if length < 6 {
				length = 6
			}
			if length > 32 {
				length = 32
			}
			if length > weights[columnIndex] {
				weights[columnIndex] = length
			}
		}
	}
	minimum := 900
	if minimum*columnCount > totalWidth {
		minimum = totalWidth / columnCount / 2
	}
	remaining := totalWidth - minimum*columnCount
	weightTotal := 0
	for _, weight := range weights {
		weightTotal += weight
	}
	widths := make([]int, columnCount)
	assigned := 0
	for columnIndex, weight := range weights {
		widths[columnIndex] = minimum
		if weightTotal > 0 {
			widths[columnIndex] += remaining * weight / weightTotal
		}
		assigned += widths[columnIndex]
	}
	widths[len(widths)-1] += totalWidth - assigned
	return widths
}

func containsBlockElement(node *html.Node) bool {
	blocks := map[string]bool{"address": true, "article": true, "aside": true, "blockquote": true, "div": true, "dl": true, "fieldset": true, "figure": true, "footer": true, "form": true, "h1": true, "h2": true, "h3": true, "h4": true, "h5": true, "h6": true, "header": true, "hr": true, "main": true, "nav": true, "ol": true, "p": true, "pre": true, "section": true, "table": true, "ul": true}
	for child := node.FirstChild; child != nil; child = child.NextSibling {
		if child.Type == html.ElementNode && blocks[strings.ToLower(child.Data)] {
			return true
		}
	}
	return false
}

func runsHaveContent(runs []docxRun) bool {
	for _, run := range runs {
		if run.Image != nil || run.Break || run.MathXML != "" || strings.TrimSpace(run.Text) != "" {
			return true
		}
	}
	return false
}

func isExportableLink(link string) bool {
	parsed, err := url.Parse(strings.TrimSpace(link))
	return err == nil && (parsed.Scheme == "http" || parsed.Scheme == "https" || parsed.Scheme == "mailto")
}

func xmlText(value string) string {
	var output bytes.Buffer
	_ = xml.EscapeText(&output, []byte(value))
	return output.String()
}

func xmlAttribute(value string) string {
	return strings.ReplaceAll(strings.ReplaceAll(strings.ReplaceAll(strings.ReplaceAll(strings.ReplaceAll(value, "&", "&amp;"), "<", "&lt;"), ">", "&gt;"), `"`, "&quot;"), "'", "&apos;")
}

const rootRelationshipsXML = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/></Relationships>`

const documentXMLPrefix = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:m="http://schemas.openxmlformats.org/officeDocument/2006/math" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture"><w:body>`

const documentXMLSuffix = `<w:sectPr><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="1134" w:right="1134" w:bottom="1134" w:left="1134" w:header="708" w:footer="708" w:gutter="0"/></w:sectPr></w:body></w:document>`

const stylesXML = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:docDefaults><w:rPrDefault><w:rPr><w:rFonts w:ascii="Aptos" w:hAnsi="Aptos" w:cs="Aptos" w:eastAsia="Microsoft YaHei"/><w:sz w:val="22"/><w:szCs w:val="22"/><w:color w:val="242925"/><w:lang w:val="en-US" w:eastAsia="zh-CN"/></w:rPr></w:rPrDefault><w:pPrDefault><w:pPr><w:widowControl/><w:spacing w:after="120" w:line="300" w:lineRule="auto"/></w:pPr></w:pPrDefault></w:docDefaults><w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/><w:qFormat/><w:pPr><w:widowControl/><w:spacing w:after="120" w:line="300" w:lineRule="auto"/></w:pPr><w:rPr><w:rFonts w:ascii="Aptos" w:hAnsi="Aptos" w:cs="Aptos" w:eastAsia="Microsoft YaHei"/><w:sz w:val="22"/><w:szCs w:val="22"/><w:color w:val="242925"/></w:rPr></w:style><w:style w:type="paragraph" w:styleId="Heading1"><w:name w:val="heading 1"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/><w:qFormat/><w:pPr><w:keepNext/><w:keepLines/><w:spacing w:before="360" w:after="200" w:line="300" w:lineRule="auto"/><w:outlineLvl w:val="0"/></w:pPr><w:rPr><w:b/><w:bCs/><w:sz w:val="44"/><w:szCs w:val="44"/><w:color w:val="17211B"/></w:rPr></w:style><w:style w:type="paragraph" w:styleId="Heading2"><w:name w:val="heading 2"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/><w:qFormat/><w:pPr><w:keepNext/><w:keepLines/><w:spacing w:before="300" w:after="160" w:line="300" w:lineRule="auto"/><w:outlineLvl w:val="1"/></w:pPr><w:rPr><w:b/><w:bCs/><w:sz w:val="34"/><w:szCs w:val="34"/><w:color w:val="17211B"/></w:rPr></w:style><w:style w:type="paragraph" w:styleId="Heading3"><w:name w:val="heading 3"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/><w:qFormat/><w:pPr><w:keepNext/><w:keepLines/><w:spacing w:before="240" w:after="120" w:line="300" w:lineRule="auto"/><w:outlineLvl w:val="2"/></w:pPr><w:rPr><w:b/><w:bCs/><w:sz w:val="28"/><w:szCs w:val="28"/><w:color w:val="0F9F68"/></w:rPr></w:style><w:style w:type="paragraph" w:styleId="Heading4"><w:name w:val="heading 4"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/><w:qFormat/><w:pPr><w:keepNext/><w:spacing w:before="200" w:after="100"/><w:outlineLvl w:val="3"/></w:pPr><w:rPr><w:b/><w:bCs/><w:sz w:val="24"/><w:szCs w:val="24"/></w:rPr></w:style><w:style w:type="paragraph" w:styleId="Heading5"><w:name w:val="heading 5"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/><w:qFormat/><w:pPr><w:keepNext/><w:spacing w:before="160" w:after="80"/><w:outlineLvl w:val="4"/></w:pPr><w:rPr><w:b/><w:bCs/><w:sz w:val="22"/><w:szCs w:val="22"/></w:rPr></w:style><w:style w:type="paragraph" w:styleId="Heading6"><w:name w:val="heading 6"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/><w:qFormat/><w:pPr><w:keepNext/><w:spacing w:before="140" w:after="80"/><w:outlineLvl w:val="5"/></w:pPr><w:rPr><w:b/><w:bCs/><w:i/><w:iCs/><w:sz w:val="21"/><w:szCs w:val="21"/></w:rPr></w:style><w:style w:type="paragraph" w:styleId="ListParagraph"><w:name w:val="List Paragraph"/><w:basedOn w:val="Normal"/><w:qFormat/><w:pPr><w:contextualSpacing/><w:spacing w:after="80" w:line="300" w:lineRule="auto"/></w:pPr></w:style><w:style w:type="paragraph" w:styleId="Quote"><w:name w:val="Quote"/><w:basedOn w:val="Normal"/><w:qFormat/><w:pPr><w:ind w:left="420" w:right="180"/><w:pBdr><w:left w:val="single" w:sz="18" w:space="10" w:color="0F9F68"/></w:pBdr><w:shd w:val="clear" w:fill="EDF8F3"/><w:spacing w:before="120" w:after="160" w:line="300" w:lineRule="auto"/></w:pPr><w:rPr><w:color w:val="4F5B54"/></w:rPr></w:style><w:style w:type="paragraph" w:styleId="CodeBlock"><w:name w:val="Code Block"/><w:basedOn w:val="Normal"/><w:qFormat/><w:pPr><w:ind w:left="240" w:right="240"/><w:pBdr><w:top w:val="single" w:sz="4" w:space="8" w:color="D8DFDA"/><w:left w:val="single" w:sz="4" w:space="8" w:color="D8DFDA"/><w:bottom w:val="single" w:sz="4" w:space="8" w:color="D8DFDA"/><w:right w:val="single" w:sz="4" w:space="8" w:color="D8DFDA"/></w:pBdr><w:shd w:val="clear" w:fill="F2F5F3"/><w:spacing w:before="120" w:after="180" w:line="260" w:lineRule="auto"/></w:pPr><w:rPr><w:rFonts w:ascii="Consolas" w:hAnsi="Consolas" w:cs="Consolas" w:eastAsia="Microsoft YaHei"/><w:sz w:val="19"/><w:szCs w:val="19"/><w:color w:val="223028"/></w:rPr></w:style><w:style w:type="paragraph" w:styleId="TableText"><w:name w:val="Table Text"/><w:basedOn w:val="Normal"/><w:pPr><w:widowControl/><w:spacing w:after="0" w:line="280" w:lineRule="auto"/></w:pPr><w:rPr><w:sz w:val="20"/><w:szCs w:val="20"/></w:rPr></w:style></w:styles>`

func (b *docxBuilder) numberingXML() string {
	var instances strings.Builder
	instances.WriteString(`<w:num w:numId="1"><w:abstractNumId w:val="0"/></w:num>`)
	for _, numID := range b.orderedLists {
		instances.WriteString(`<w:num w:numId="` + strconv.Itoa(numID) + `"><w:abstractNumId w:val="1"/></w:num>`)
	}
	return numberingDefinitionsXML + instances.String() + `</w:numbering>`
}

const numberingDefinitionsXML = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:numbering xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:abstractNum w:abstractNumId="0"><w:multiLevelType w:val="multilevel"/><w:lvl w:ilvl="0"><w:start w:val="1"/><w:numFmt w:val="bullet"/><w:lvlText w:val="•"/><w:lvlJc w:val="left"/><w:pPr><w:tabs><w:tab w:val="num" w:pos="540"/></w:tabs><w:ind w:left="540" w:hanging="270"/></w:pPr></w:lvl><w:lvl w:ilvl="1"><w:start w:val="1"/><w:numFmt w:val="bullet"/><w:lvlText w:val="○"/><w:lvlJc w:val="left"/><w:pPr><w:tabs><w:tab w:val="num" w:pos="900"/></w:tabs><w:ind w:left="900" w:hanging="270"/></w:pPr></w:lvl><w:lvl w:ilvl="2"><w:start w:val="1"/><w:numFmt w:val="bullet"/><w:lvlText w:val="▪"/><w:lvlJc w:val="left"/><w:pPr><w:tabs><w:tab w:val="num" w:pos="1260"/></w:tabs><w:ind w:left="1260" w:hanging="270"/></w:pPr></w:lvl>` + numberingBulletLevels + `</w:abstractNum><w:abstractNum w:abstractNumId="1"><w:multiLevelType w:val="multilevel"/>` + numberingDecimalLevels + `</w:abstractNum>`

const numberingBulletLevels = `<w:lvl w:ilvl="3"><w:start w:val="1"/><w:numFmt w:val="bullet"/><w:lvlText w:val="•"/><w:lvlJc w:val="left"/><w:pPr><w:ind w:left="1620" w:hanging="270"/></w:pPr></w:lvl><w:lvl w:ilvl="4"><w:start w:val="1"/><w:numFmt w:val="bullet"/><w:lvlText w:val="○"/><w:lvlJc w:val="left"/><w:pPr><w:ind w:left="1980" w:hanging="270"/></w:pPr></w:lvl><w:lvl w:ilvl="5"><w:start w:val="1"/><w:numFmt w:val="bullet"/><w:lvlText w:val="▪"/><w:lvlJc w:val="left"/><w:pPr><w:ind w:left="2340" w:hanging="270"/></w:pPr></w:lvl><w:lvl w:ilvl="6"><w:start w:val="1"/><w:numFmt w:val="bullet"/><w:lvlText w:val="•"/><w:lvlJc w:val="left"/><w:pPr><w:ind w:left="2700" w:hanging="270"/></w:pPr></w:lvl><w:lvl w:ilvl="7"><w:start w:val="1"/><w:numFmt w:val="bullet"/><w:lvlText w:val="○"/><w:lvlJc w:val="left"/><w:pPr><w:ind w:left="3060" w:hanging="270"/></w:pPr></w:lvl><w:lvl w:ilvl="8"><w:start w:val="1"/><w:numFmt w:val="bullet"/><w:lvlText w:val="▪"/><w:lvlJc w:val="left"/><w:pPr><w:ind w:left="3420" w:hanging="270"/></w:pPr></w:lvl>`

const numberingDecimalLevels = `<w:lvl w:ilvl="0"><w:start w:val="1"/><w:numFmt w:val="decimal"/><w:lvlText w:val="%1."/><w:lvlJc w:val="left"/><w:pPr><w:tabs><w:tab w:val="num" w:pos="540"/></w:tabs><w:ind w:left="540" w:hanging="270"/></w:pPr></w:lvl><w:lvl w:ilvl="1"><w:start w:val="1"/><w:numFmt w:val="decimal"/><w:lvlText w:val="%1.%2."/><w:lvlJc w:val="left"/><w:pPr><w:ind w:left="900" w:hanging="360"/></w:pPr></w:lvl><w:lvl w:ilvl="2"><w:start w:val="1"/><w:numFmt w:val="decimal"/><w:lvlText w:val="%1.%2.%3."/><w:lvlJc w:val="left"/><w:pPr><w:ind w:left="1260" w:hanging="450"/></w:pPr></w:lvl><w:lvl w:ilvl="3"><w:start w:val="1"/><w:numFmt w:val="decimal"/><w:lvlText w:val="%4."/><w:lvlJc w:val="left"/><w:pPr><w:ind w:left="1620" w:hanging="270"/></w:pPr></w:lvl><w:lvl w:ilvl="4"><w:start w:val="1"/><w:numFmt w:val="decimal"/><w:lvlText w:val="%5."/><w:lvlJc w:val="left"/><w:pPr><w:ind w:left="1980" w:hanging="270"/></w:pPr></w:lvl><w:lvl w:ilvl="5"><w:start w:val="1"/><w:numFmt w:val="decimal"/><w:lvlText w:val="%6."/><w:lvlJc w:val="left"/><w:pPr><w:ind w:left="2340" w:hanging="270"/></w:pPr></w:lvl><w:lvl w:ilvl="6"><w:start w:val="1"/><w:numFmt w:val="decimal"/><w:lvlText w:val="%7."/><w:lvlJc w:val="left"/><w:pPr><w:ind w:left="2700" w:hanging="270"/></w:pPr></w:lvl><w:lvl w:ilvl="7"><w:start w:val="1"/><w:numFmt w:val="decimal"/><w:lvlText w:val="%8."/><w:lvlJc w:val="left"/><w:pPr><w:ind w:left="3060" w:hanging="270"/></w:pPr></w:lvl><w:lvl w:ilvl="8"><w:start w:val="1"/><w:numFmt w:val="decimal"/><w:lvlText w:val="%9."/><w:lvlJc w:val="left"/><w:pPr><w:ind w:left="3420" w:hanging="270"/></w:pPr></w:lvl>`

const settingsXML = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:settings xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:zoom w:percent="100"/><w:defaultTabStop w:val="720"/><w:characterSpacingControl w:val="doNotCompress"/><w:compat><w:compatSetting w:name="compatibilityMode" w:uri="http://schemas.microsoft.com/office/word" w:val="15"/></w:compat></w:settings>`
