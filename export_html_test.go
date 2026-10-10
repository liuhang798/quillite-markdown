package main

import (
	"strings"
	"testing"
)

func TestStandaloneImageLayoutsUseStrictStyleWhitelist(t *testing.T) {
	fragment := `<table class="quillite-image-row" style="position:fixed;background:url(https://bad)"><tbody><tr><td style="width:50%;font-family:evil"><img src="data:image/png;base64,AAAA" style="display:block;margin-left:0;margin-right:auto;position:fixed;background:url(https://bad)"></td><td style="width:50%"><img src="data:image/png;base64,AAAA" style="display:block;margin-left:auto;margin-right:0"></td></tr></tbody></table><img src="data:image/png;base64,AAAA" style="display:block;margin-left:auto;margin-right:auto"><p style="margin-left:auto;display:block">正文</p>`
	result, err := sanitizeStandaloneHTML(fragment)
	if err != nil {
		t.Fatal(err)
	}
	for _, required := range []string{"margin-left:0;margin-right:auto", "margin-left:auto;margin-right:0", "margin-left:auto;margin-right:auto", "width:50%", "table-layout:fixed", "vertical-align:top", "<p>正文</p>"} {
		if !strings.Contains(result, required) {
			t.Fatalf("missing %q: %s", required, result)
		}
	}
	for _, unsafe := range []string{"position", "url(", "font-family"} {
		if strings.Contains(result, unsafe) {
			t.Fatalf("unsafe style %q survived", unsafe)
		}
	}
	for _, invalid := range []string{"0%", "101%", "NaN%", "-1%", "50%;color:red"} {
		if safeImageRowPercent(invalid) {
			t.Fatalf("unsafe width %q", invalid)
		}
	}
}

func TestBuildStandaloneHTMLPreservesDocumentAndAppearance(t *testing.T) {
	data, err := buildStandaloneHTML(`<h1>公式与代码</h1><p><span class="math-inline"><math><mi>x</mi><mo>=</mo><mn>1</mn></math></span></p><pre><code class="language-go">fmt.Println(&quot;ok&quot;)</code></pre>`, `示例 & 文档`, "zh-CN", "dark", "#075DF3")
	if err != nil {
		t.Fatal(err)
	}
	document := string(data)
	for _, expected := range []string{`<!doctype html>`, `lang="zh-CN"`, `data-color-mode="dark"`, `--accent:#075DF3`, `<title>示例 &amp; 文档</title>`, `<math>`, `fmt.Println`} {
		if !strings.Contains(document, expected) {
			t.Fatalf("standalone HTML missing %q: %s", expected, document)
		}
	}
	for _, printRule := range []string{`white-space:pre-wrap!important`, `overflow-wrap:anywhere`, `table-layout:fixed`} {
		if !strings.Contains(document, printRule) {
			t.Fatalf("standalone HTML print CSS missing %q", printRule)
		}
	}
}

func TestBuildStandaloneHTMLPreservesExplicitImageDimensions(t *testing.T) {
	data, err := buildStandaloneHTML(`<img src="data:image/png;base64,AAAA" width="64%" height="280">`, "Sized image", "en", "light", "#159A63")
	if err != nil {
		t.Fatal(err)
	}
	document := string(data)
	for _, expected := range []string{`width="64%"`, `height="280"`, `img:not([height]){height:auto}`, `.markdown-body img:not([height]),.markdown-body svg{height:auto!important}`} {
		if !strings.Contains(document, expected) {
			t.Fatalf("standalone HTML did not preserve custom image sizing %q", expected)
		}
	}
}

func TestBuildStandaloneHTMLRemovesFlattenedKatexSource(t *testing.T) {
	fragment := `<p>分数：</p><div class="math-block" data-math-source="y%3D%5Cfrac%7Bx%2B1%7D%7Bx-1%7D"><math display="block"><mrow><mi>y</mi><mo>=</mo><mfrac><mrow><mi>x</mi><mo>+</mo><mn>1</mn></mrow><mrow><mi>x</mi><mo>-</mo><mn>1</mn></mrow></mfrac></mrow>y=\frac{x+1}{x-1}</math></div>`
	data, err := buildStandaloneHTML(fragment, "Math", "zh-CN", "light", "#159A63")
	if err != nil {
		t.Fatal(err)
	}
	document := string(data)
	if !strings.Contains(document, `<mfrac>`) || !strings.Contains(document, `data-math-source="y%3D%5Cfrac%7Bx%2B1%7D%7Bx-1%7D"`) {
		t.Fatalf("structural MathML or encoded source metadata was removed: %s", document)
	}
	if strings.Contains(document, `y=\frac{x+1}{x-1}`) {
		t.Fatalf("flattened raw LaTeX leaked into standalone HTML: %s", document)
	}
}

func TestBuildStandaloneHTMLRemovesExecutableContent(t *testing.T) {
	data, err := buildStandaloneHTML(`<p onclick="alert(1)" style="background:url(https://example.com/track)">安全正文</p><script>alert(1)</script><style>body{display:none}</style><iframe src="https://example.com"></iframe><a href="javascript:alert(1)">危险链接</a><img src="data:image/png;base64,AA==" srcset="https://example.com/track 2x" onerror="alert(1)">`, "Safe", "en", "light", "not-a-color")
	if err != nil {
		t.Fatal(err)
	}
	document := string(data)
	for _, unsafe := range []string{`onclick=`, `<script`, `<iframe`, `javascript:`, `onerror=`, `background:url`, `srcset=`, `body{display:none}`} {
		if strings.Contains(strings.ToLower(document), unsafe) {
			t.Fatalf("unsafe HTML survived export: %q in %s", unsafe, document)
		}
	}
	if !strings.Contains(document, `安全正文`) || !strings.Contains(document, `data:image/png;base64,AA==`) {
		t.Fatalf("safe exported content was removed: %s", document)
	}
	if !strings.Contains(document, `--accent:#159A63`) {
		t.Fatalf("invalid accent did not fall back safely: %s", document)
	}
}

func TestSafeStandaloneURLAllowsOnlyExportableSchemes(t *testing.T) {
	for _, value := range []string{"https://example.com", "http://example.com", "mailto:hello@example.com", "#section"} {
		if !safeStandaloneURL(value, false) {
			t.Fatalf("safe link rejected: %s", value)
		}
	}
	for _, value := range []string{"javascript:alert(1)", "file:///tmp/private.txt", "data:text/html,test"} {
		if safeStandaloneURL(value, false) {
			t.Fatalf("unsafe link accepted: %s", value)
		}
	}
	if !safeStandaloneURL("data:image/png;base64,AA==", true) || safeStandaloneURL("data:text/html,test", true) {
		t.Fatal("image data URL policy is incorrect")
	}
}

func TestBuildPlainHTMLHasSemanticContentWithoutThemeCSS(t *testing.T) {
	data, err := buildPlainHTML(`<h1>Title</h1><p>Body</p>`, "Guide", "en", "{title}", "Page {page}")
	if err != nil {
		t.Fatal(err)
	}
	document := string(data)
	for _, expected := range []string{`<header>Guide</header>`, `<main><h1>Title</h1><p>Body</p></main>`, `<footer>Page 1</footer>`} {
		if !strings.Contains(document, expected) {
			t.Fatalf("plain HTML missing %q: %s", expected, document)
		}
	}
	for _, themed := range []string{`<style>`, `--accent`, `markdown-body`, `color-mix`} {
		if strings.Contains(document, themed) {
			t.Fatalf("plain HTML unexpectedly contains theme styling %q", themed)
		}
	}
}
