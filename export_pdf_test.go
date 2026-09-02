package main

import (
	"context"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"
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

func TestWaitForGeneratedPDFHandlesAsynchronousBrowserOutput(t *testing.T) {
	pdfPath := filepath.Join(t.TempDir(), "document.pdf")
	writeResult := make(chan error, 1)
	go func() {
		time.Sleep(60 * time.Millisecond)
		if err := os.WriteFile(pdfPath, []byte("%PDF-1.7\npartial"), 0o600); err != nil {
			writeResult <- err
			return
		}
		time.Sleep(90 * time.Millisecond)
		writeResult <- os.WriteFile(pdfPath, []byte("%PDF-1.7\ncomplete document\n%%EOF\n"), 0o600)
	}()

	ctx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
	defer cancel()
	pdfData, err := waitForGeneratedPDF(ctx, pdfPath)
	if err != nil {
		t.Fatal(err)
	}
	if err := <-writeResult; err != nil {
		t.Fatal(err)
	}
	if !strings.Contains(string(pdfData), "complete document") || !strings.Contains(string(pdfData), "%%EOF") {
		t.Fatalf("wait returned an incomplete PDF: %q", pdfData)
	}
}

func TestValidateGeneratedPDFRejectsIncompleteOutput(t *testing.T) {
	if err := validateGeneratedPDF([]byte("%PDF-1.7\npartial")); err == nil || !strings.Contains(err.Error(), "incomplete") {
		t.Fatalf("expected an incomplete PDF error, got %v", err)
	}
}

func TestPDFMarginBoxEscapesTextAndKeepsPageToken(t *testing.T) {
	content := pdfMarginBoxContent(`"unsafe\path" {page}`, "Guide")
	if !strings.Contains(content, `\"unsafe\\path\" `) || !strings.Contains(content, `counter(page)`) {
		t.Fatalf("unexpected margin-box content: %s", content)
	}
}
