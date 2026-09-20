package main

import (
	"archive/zip"
	"bytes"
	"encoding/base64"
	"encoding/xml"
	"errors"
	"image"
	"image/png"
	"io"
	"os"
	"strings"
	"syscall"
	"testing"
)

func TestRenderedExportLimitAllowsSupportedLargeDocumentsToExpand(t *testing.T) {
	if maxRenderedExportHTMLSize != 96*1024*1024 {
		t.Fatalf("rendered export limit = %d, want 96 MiB", maxRenderedExportHTMLSize)
	}
	if maxRenderedExportHTMLSize <= maxSupportedDocumentBytes {
		t.Fatalf("rendered export limit %d must exceed source document limit %d", maxRenderedExportHTMLSize, maxSupportedDocumentBytes)
	}
	if maxPandocSourceSize != maxSupportedDocumentBytes {
		t.Fatalf("Pandoc source limit = %d, want document limit %d", maxPandocSourceSize, maxSupportedDocumentBytes)
	}
	if exportSourceTooLargeErrorMarker == exportTooLargeErrorMarker {
		t.Fatal("source and rendered export limits must have distinct error markers")
	}
	if err := validateRenderedExportHTMLSize(maxRenderedExportHTMLSize); err != nil {
		t.Fatalf("exact rendered export limit was rejected: %v", err)
	}
	if err := validateRenderedExportHTMLSize(maxRenderedExportHTMLSize + 1); err == nil || !strings.Contains(err.Error(), exportTooLargeErrorMarker) {
		t.Fatalf("oversized rendered export did not return the stable marker: %v", err)
	}
}

func TestBuildDOCXExportsRenderedDocumentAboveLegacyLimit(t *testing.T) {
	if testing.Short() {
		t.Skip("large export regression test")
	}
	// This exercises the real HTML parser and DOCX writer above the former
	// 24 MiB ceiling instead of merely asserting the new constant.
	rendered := "<p>" + strings.Repeat("large document text ", 1400000) + "</p>"
	if len(rendered) <= 24*1024*1024 || len(rendered) >= maxRenderedExportHTMLSize {
		t.Fatalf("large rendered fixture has unexpected size: %d", len(rendered))
	}
	document, err := buildDOCX(rendered, "Large document", "")
	if err != nil {
		t.Fatal(err)
	}
	if len(document) == 0 {
		t.Fatal("large DOCX export returned no data")
	}
	if _, err := zip.NewReader(bytes.NewReader(document), int64(len(document))); err != nil {
		t.Fatalf("large DOCX export is not a valid ZIP package: %v", err)
	}
}

func TestImageSizeEMUPreservesWideChartAspectRatio(t *testing.T) {
	var data bytes.Buffer
	if err := png.Encode(&data, image.NewRGBA(image.Rect(0, 0, 2000, 840))); err != nil {
		t.Fatalf("encode chart PNG: %v", err)
	}
	width, height := imageSizeEMU(data.Bytes())
	if width != 5669280 {
		t.Fatalf("wide chart should be constrained to the Word content width: %d", width)
	}
	wantRatio := 2000.0 / 840.0
	gotRatio := float64(width) / float64(height)
	if delta := gotRatio - wantRatio; delta < -0.01 || delta > 0.01 {
		t.Fatalf("chart aspect ratio changed during Word sizing: got %.4f want %.4f", gotRatio, wantRatio)
	}
}

func TestClassifyExportWriteErrorRecognizesWindowsFileLocks(t *testing.T) {
	for _, errno := range []syscall.Errno{syscall.Errno(32), syscall.Errno(33)} {
		original := &os.PathError{Op: "remove", Path: "open-document.docx", Err: errno}
		classified := classifyExportWriteError("windows", original)
		if !strings.Contains(classified.Error(), exportFileInUseErrorMarker) {
			t.Fatalf("Windows lock error %d was not classified: %v", errno, classified)
		}
		if !errors.Is(classified, original) {
			t.Fatalf("classified error no longer wraps the original error: %v", classified)
		}
	}
}

func TestClassifyExportWriteErrorLeavesOtherFailuresUnchanged(t *testing.T) {
	permission := &os.PathError{Op: "remove", Path: "protected.docx", Err: syscall.Errno(5)}
	if classified := classifyExportWriteError("windows", permission); classified != permission {
		t.Fatalf("permission error should stay unchanged: %v", classified)
	}
	sharing := &os.PathError{Op: "remove", Path: "open-document.docx", Err: syscall.Errno(32)}
	if classified := classifyExportWriteError("darwin", sharing); classified != sharing {
		t.Fatalf("non-Windows error should stay unchanged: %v", classified)
	}
	if classified := classifyExportWriteError("windows", nil); classified != nil {
		t.Fatalf("nil error should remain nil: %v", classified)
	}
}

func TestBuildDOCXCreatesValidOfficePackage(t *testing.T) {
	pixelPNG := "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII="
	html := `<h1>导出测试</h1><p>普通 <strong>加粗</strong>、<em>斜体</em>和<a href="https://example.com/?a=1&amp;b=2">链接</a>。</p>` +
		`<blockquote><p>引用内容</p></blockquote><ul><li>列表一</li><li>列表二</li></ul>` +
		`<table><thead><tr><th>项目</th><th>值</th></tr></thead><tbody><tr><td>版本</td><td>2.4.4</td></tr></tbody></table>` +
		`<div class="code-block"><div class="code-header"><span>go</span><button>复制</button></div><pre><code>fmt.Println(&quot;ok&quot;)</code></pre></div>` +
		`<p><img src="data:image/png;base64,` + pixelPNG + `" alt="示例图片"></p>`

	data, err := buildDOCX(html, "示例文档", t.TempDir())
	if err != nil {
		t.Fatalf("build DOCX: %v", err)
	}
	files := readDOCXFiles(t, data)
	for _, required := range []string{"[Content_Types].xml", "_rels/.rels", "word/document.xml", "word/styles.xml", "word/numbering.xml", "word/settings.xml", "word/_rels/document.xml.rels", "docProps/core.xml", "word/media/image1.png"} {
		if _, ok := files[required]; !ok {
			t.Fatalf("DOCX missing %s", required)
		}
	}

	document := string(files["word/document.xml"])
	for _, expected := range []string{"导出测试", "加粗", "引用内容", "列表一", "<w:tbl>", "fmt.Println", "<w:drawing>"} {
		if !strings.Contains(document, expected) {
			t.Fatalf("document.xml missing %q", expected)
		}
	}
	if strings.Contains(document, "复制") {
		t.Fatal("preview-only code copy control leaked into DOCX")
	}
	if !strings.Contains(document, `<w:numId w:val="1"/>`) {
		t.Fatal("unordered list is not backed by Word numbering")
	}
	if !strings.Contains(document, `<w:tblLayout w:type="fixed"/>`) || !strings.Contains(document, `<w:tblGrid>`) {
		t.Fatal("table does not carry fixed Word geometry")
	}
	if strings.Contains(document, `<w:pStyle w:val="Heading1"/><w:spacing`) {
		t.Fatal("heading spacing is unexpectedly overridden by direct formatting")
	}
	assertWellFormedXML(t, files["word/document.xml"])
	assertWellFormedXML(t, files["word/styles.xml"])
	assertWellFormedXML(t, files["word/numbering.xml"])
	assertWellFormedXML(t, files["word/settings.xml"])
	assertWellFormedXML(t, files["word/_rels/document.xml.rels"])
	assertWellFormedXML(t, files["[Content_Types].xml"])
	if !strings.Contains(string(files["word/_rels/document.xml.rels"]), `TargetMode="External"`) {
		t.Fatal("hyperlink relationship was not exported")
	}
	if !strings.Contains(string(files["docProps/core.xml"]), "示例文档") {
		t.Fatal("document title was not written to core properties")
	}

	decoded, _ := base64.StdEncoding.DecodeString(pixelPNG)
	if !bytes.Equal(files["word/media/image1.png"], decoded) {
		t.Fatal("embedded image differs from source")
	}
}

func TestBuildDOCXEscapesTextAndPreservesLineBreaks(t *testing.T) {
	data, err := buildDOCX(`<p>A &amp; B &lt; C<br>下一行</p><div class="plain-text">line 1
line 2</div>`, "Escape", t.TempDir())
	if err != nil {
		t.Fatal(err)
	}
	files := readDOCXFiles(t, data)
	document := string(files["word/document.xml"])
	if !strings.Contains(document, `A &amp; B &lt; C`) {
		t.Fatalf("escaped text missing from document: %s", document)
	}
	if strings.Count(document, `<w:br/>`) < 2 {
		t.Fatal("HTML and plain-text line breaks were not preserved")
	}
	assertWellFormedXML(t, files["word/document.xml"])
}

func TestBuildDOCXExportsMathAsNativeOfficeMath(t *testing.T) {
	html := `<p>Inline <span class="math-inline" data-math-source="E%20%3D%20mc%5E2"><span class="katex-mathml"><math><semantics><mrow><mi>E</mi><mo>=</mo><msup><mi>m</mi><mn>2</mn></msup></mrow><annotation encoding="application/x-tex">E = mc^2</annotation></semantics></math></span><span class="katex-html">visual duplicate</span></span></p>` +
		`<div class="math-block"><span class="katex-mathml"><math><semantics><mrow><mfrac><mi>a</mi><mi>b</mi></mfrac><mo>+</mo><msqrt><mi>x</mi></msqrt><mo>+</mo><munderover><mo>∑</mo><mrow><mi>i</mi><mo>=</mo><mn>1</mn></mrow><mi>n</mi></munderover></mrow><annotation encoding="application/x-tex">\\frac{a}{b}+\\sqrt{x}+\\sum_{i=1}^{n}</annotation></semantics></math></span></div>` +
		`<div class="math-block"><span class="katex-mathml"><math><semantics><mrow><mn>2</mn><mtext> </mtext><mi mathvariant="normal">H</mi><msub><mpadded width="0px"><mphantom><mi>X</mi></mphantom></mpadded><mpadded height="0px"><mn>2</mn></mpadded></msub><mo>+</mo><mi mathvariant="normal">O</mi><msub><mpadded width="0px"><mphantom><mi>X</mi></mphantom></mpadded><mpadded height="0px"><mn>2</mn></mpadded></msub><mover><mo>→</mo><mpadded><mrow></mrow></mpadded></mover><mn>2</mn><mtext> </mtext><mi mathvariant="normal">H</mi><msub><mpadded width="0px"><mphantom><mi>X</mi></mphantom></mpadded><mpadded height="0px"><mn>2</mn></mpadded></msub><mi mathvariant="normal">O</mi></mrow><annotation encoding="application/x-tex">\\ce{2H2 + O2 -&gt; 2H2O}</annotation></semantics></math></span></div>`
	data, err := buildDOCX(html, "Math", t.TempDir())
	if err != nil {
		t.Fatal(err)
	}
	document := string(readDOCXFiles(t, data)["word/document.xml"])
	for _, expected := range []string{`<m:oMath>`, `<m:sSup>`, `<m:f>`, `<m:rad>`, `<m:limLow>`, `<m:sSub>`, `→`} {
		if !strings.Contains(document, expected) {
			t.Fatalf("native Office Math is missing %q: %s", expected, document)
		}
	}
	if !strings.Contains(document, `<m:sSub><m:e><m:r><m:rPr><m:sty m:val="p"/></m:rPr><m:t xml:space="preserve">H</m:t></m:r></m:e><m:sub>`) {
		t.Fatal("mhchem phantom-base subscript was not attached to its chemical element")
	}
	if strings.Contains(document, "visual duplicate") || strings.Contains(document, `\\frac{a}{b}`) {
		t.Fatal("KaTeX visual duplicate or raw LaTeX leaked into native Office Math output")
	}
	assertWellFormedXML(t, []byte(document))
}

func TestBuildDOCXIgnoresFlattenedKatexSourceInsideMathML(t *testing.T) {
	html := `<p>分数：</p><div class="math-block" data-math-source="y%3D%5Cfrac%7Bx%2B1%7D%7Bx-1%7D"><math display="block"><mrow><mi>y</mi><mo>=</mo><mfrac><mrow><mi>x</mi><mo>+</mo><mn>1</mn></mrow><mrow><mi>x</mi><mo>-</mo><mn>1</mn></mrow></mfrac></mrow>y=\frac{x+1}{x-1}</math></div>`
	data, err := buildDOCX(html, "Flattened KaTeX", t.TempDir())
	if err != nil {
		t.Fatal(err)
	}
	document := string(readDOCXFiles(t, data)["word/document.xml"])
	if !strings.Contains(document, `<m:oMath>`) || !strings.Contains(document, `<m:f>`) {
		t.Fatalf("native Word equation is missing: %s", document)
	}
	if strings.Contains(document, `y=\frac{x+1}{x-1}`) {
		t.Fatalf("flattened raw LaTeX leaked into DOCX: %s", document)
	}
	assertWellFormedXML(t, []byte(document))
}

func TestBuildDOCXRemovesDuplicateMathSourceBesideNativeEquation(t *testing.T) {
	html := `<ol>` +
		`<li><span class="math-inline" data-math-source="y%20%3D%20ax%20%2B%20b"><math><semantics><mrow><mi>y</mi><mo>=</mo><mi>a</mi><mi>x</mi><mo>+</mo><mi>b</mi></mrow></semantics></math></span><code>y = ax + b</code></li>` +
		`<li><span class="math-inline" data-math-source="x%20%3D%20%5Cfrac%7B-b%20%5Cpm%20%5Csqrt%7Bb%5E2-4ac%7D%7D%7B2a%7D"><math><semantics><mrow><mi>x</mi><mo>=</mo><mfrac><mrow><mo>-</mo><mi>b</mi><mo>±</mo><msqrt><mrow><msup><mi>b</mi><mn>2</mn></msup><mo>-</mo><mn>4</mn><mi>a</mi><mi>c</mi></mrow></msqrt></mrow><mrow><mn>2</mn><mi>a</mi></mrow></mfrac></mrow></semantics></math></span><code>x = \frac{-b \pm \sqrt{b^2-4ac}}{2a}</code></li>` +
		`<li><span class="math-inline" data-math-source="%5Cbar%7Bx%7D%3D%5Cfrac%7B1%7D%7Bn%7D%5Csum_%7Bi%3D1%7D%5E%7Bn%7Dx_i"><math><semantics><mrow><mover accent="true"><mi>x</mi><mo>¯</mo></mover><mo>=</mo><mfrac><mn>1</mn><mi>n</mi></mfrac><munderover><mo>∑</mo><mrow><mi>i</mi><mo>=</mo><mn>1</mn></mrow><mi>n</mi></munderover><msub><mi>x</mi><mi>i</mi></msub></mrow></semantics></math></span><code>\bar{x}=\frac{1}{n}\sum_{i=1}^{n}x_i</code></li>` +
		`</ol>`
	data, err := buildDOCX(html, "WPS math", t.TempDir())
	if err != nil {
		t.Fatal(err)
	}
	document := string(readDOCXFiles(t, data)["word/document.xml"])
	if strings.Count(document, `<m:oMath>`) != 3 {
		t.Fatalf("expected three native equations: %s", document)
	}
	for _, source := range []string{`y = ax + b`, `x = \frac{-b \pm \sqrt{b^2-4ac}}{2a}`, `\bar{x}=\frac{1}{n}\sum_{i=1}^{n}x_i`} {
		if strings.Contains(document, source) {
			t.Fatalf("duplicate formula source leaked into DOCX: %q in %s", source, document)
		}
	}
	assertWellFormedXML(t, []byte(document))
}

func TestBuildDOCXRemovesSplitAndSpacedMathSourceBesideNativeEquation(t *testing.T) {
	html := `<p><span class="math-inline" data-math-source="x%20%3D%20%5Cfrac%7B-b%20%5Cpm%20%5Csqrt%7Bb%5E2-4ac%7D%7D%7B2a%7D"><math><mrow><mi>x</mi><mo>=</mo><mfrac><mrow><mo>-</mo><mi>b</mi><mo>±</mo><msqrt><mrow><msup><mi>b</mi><mn>2</mn></msup><mo>-</mo><mn>4</mn><mi>a</mi><mi>c</mi></mrow></msqrt></mrow><mrow><mn>2</mn><mi>a</mi></mrow></mfrac></mrow></math></span>` +
		` <span>x = </span><code>\frac{-b \pm </code><span>\sqrt{b^2-4ac}</span><code>}{2a}</code><span>，其中 a 不为 0</span></p>`
	data, err := buildDOCX(html, "WPS split math", t.TempDir())
	if err != nil {
		t.Fatal(err)
	}
	document := string(readDOCXFiles(t, data)["word/document.xml"])
	if strings.Contains(document, `\frac`) || strings.Contains(document, `\sqrt`) {
		t.Fatalf("split raw LaTeX duplicate leaked into DOCX: %s", document)
	}
	if !strings.Contains(document, `，其中 a 不为 0`) {
		t.Fatalf("text following the duplicate formula was removed: %s", document)
	}
	if strings.Count(document, `<m:oMath>`) != 1 {
		t.Fatalf("expected one native equation: %s", document)
	}
}

func TestBuildDOCXKeepsReadableMathFallbackWhenMathMLIsUnavailable(t *testing.T) {
	data, err := buildDOCX(`<p>公式：<span class="math-inline" data-math-source="E%20%3D%20mc%5E2"></span></p>`, "Math fallback", t.TempDir())
	if err != nil {
		t.Fatal(err)
	}
	document := string(readDOCXFiles(t, data)["word/document.xml"])
	if !strings.Contains(document, "E = mc^2") {
		t.Fatalf("encoded formula source fallback is missing: %s", document)
	}
}

func TestBuildDOCXAlignsNumberedFormulaAtTheRightMargin(t *testing.T) {
	html := `<div class="math-block"><math><semantics><mtable width="100%"><mtr><mtd width="50%"></mtd><mtd><mrow><mi>E</mi><mo>=</mo><mi>m</mi><msup><mi>c</mi><mn>2</mn></msup></mrow></mtd><mtd width="50%"></mtd><mtd><mtext>(1)</mtext></mtd></mtr></mtable></semantics></math></div>`
	data, err := buildDOCX(html, "Numbered math", t.TempDir())
	if err != nil {
		t.Fatal(err)
	}
	document := string(readDOCXFiles(t, data)["word/document.xml"])
	if !strings.Contains(document, `<w:tab w:val="center" w:pos="4699"/>`) || !strings.Contains(document, `<w:tab w:val="right" w:pos="9398"/>`) {
		t.Fatalf("numbered formula does not use centered formula and right-aligned label tabs: %s", document)
	}
	if strings.Count(document, `<m:oMath>`) != 2 || !strings.Contains(document, `(1)`) {
		t.Fatalf("numbered formula or label is missing: %s", document)
	}
}

func TestBuildDOCXPreservesBinomialAsAStackWithoutFractionBar(t *testing.T) {
	html := `<div class="math-block"><math><mrow><mo>(</mo><mfrac linethickness="0px"><mi>n</mi><mi>k</mi></mfrac><mo>)</mo></mrow></math></div>`
	data, err := buildDOCX(html, "Binomial", t.TempDir())
	if err != nil {
		t.Fatal(err)
	}
	document := string(readDOCXFiles(t, data)["word/document.xml"])
	if !strings.Contains(document, `<m:fPr><m:type m:val="noBar"/></m:fPr>`) {
		t.Fatalf("binomial coefficient gained an incorrect fraction bar: %s", document)
	}
}

func TestBuildDOCXRestartsSeparateOrderedLists(t *testing.T) {
	data, err := buildDOCX(`<ol><li>第一组</li><li>第二项</li></ol><p>分隔内容</p><ol><li>重新从一开始</li></ol>`, "Lists", t.TempDir())
	if err != nil {
		t.Fatal(err)
	}
	files := readDOCXFiles(t, data)
	document := string(files["word/document.xml"])
	numbering := string(files["word/numbering.xml"])
	if !strings.Contains(document, `<w:numId w:val="2"/>`) || !strings.Contains(document, `<w:numId w:val="3"/>`) {
		t.Fatal("separate ordered lists do not use independent numbering instances")
	}
	if !strings.Contains(numbering, `<w:num w:numId="2"><w:abstractNumId w:val="1"/></w:num>`) || !strings.Contains(numbering, `<w:num w:numId="3"><w:abstractNumId w:val="1"/></w:num>`) {
		t.Fatal("ordered list numbering instances are missing")
	}
}

func readDOCXFiles(t *testing.T, data []byte) map[string][]byte {
	t.Helper()
	reader, err := zip.NewReader(bytes.NewReader(data), int64(len(data)))
	if err != nil {
		t.Fatalf("open DOCX zip: %v", err)
	}
	files := map[string][]byte{}
	for _, entry := range reader.File {
		file, err := entry.Open()
		if err != nil {
			t.Fatalf("open %s: %v", entry.Name, err)
		}
		content, err := io.ReadAll(file)
		file.Close()
		if err != nil {
			t.Fatalf("read %s: %v", entry.Name, err)
		}
		files[entry.Name] = content
	}
	return files
}

func assertWellFormedXML(t *testing.T, data []byte) {
	t.Helper()
	decoder := xml.NewDecoder(bytes.NewReader(data))
	for {
		_, err := decoder.Token()
		if err == io.EOF {
			return
		}
		if err != nil {
			t.Fatalf("invalid XML: %v\n%s", err, data)
		}
	}
}
