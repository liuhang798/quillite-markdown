package main

import (
	"strings"
	"testing"
)

func TestBuildPDFHTMLKeepsHeadingsAndCreatesRunningContent(t *testing.T) {
	document, err := buildPDFHTML(`<h1 id="intro">Intro</h1><nav class="markdown-dynamic-toc"><a href="#intro">Intro</a></nav><div class="code-block"><pre><code>Data Source=an-extremely-long-server-name.example.com;Persist Security Info=True</code></pre></div><div class="markdown-table-scroll"><table><tr><td>Long value</td></tr></table></div>`, "Guide", "en", "{title}", "Page {page}")
	if err != nil {
		t.Fatal(err)
	}
	html := string(document)
	for _, expected := range []string{`<h1 id="intro">Intro</h1>`, `href="#intro"`, `@top-center`, `Guide`, `@bottom-center`, `counter(page)`, `white-space:pre-wrap!important`, `overflow-wrap:anywhere`, `table-layout:fixed`} {
		if !strings.Contains(html, expected) {
			t.Fatalf("PDF HTML does not contain %q", expected)
		}
	}
}

func TestPDFBrowserArgumentsRequestHeadingOutline(t *testing.T) {
	arguments := pdfBrowserArguments("profile", "document.pdf", "document.html")
	joined := strings.Join(arguments, "\n")
	for _, expected := range []string{"--generate-pdf-document-outline", "--print-to-pdf=document.pdf", "file:"} {
		if !strings.Contains(joined, expected) {
			t.Fatalf("browser arguments do not contain %q: %#v", expected, arguments)
		}
	}
}

func TestPDFMarginBoxEscapesTextAndKeepsPageToken(t *testing.T) {
	content := pdfMarginBoxContent(`"unsafe\path" {page}`, "Guide")
	if !strings.Contains(content, `\"unsafe\\path\" `) || !strings.Contains(content, `counter(page)`) {
		t.Fatalf("unexpected margin-box content: %s", content)
	}
}
