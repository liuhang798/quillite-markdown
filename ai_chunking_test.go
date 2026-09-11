package main

import (
	"strings"
	"testing"
)

func TestMarkdownAIChunksPreserveSourceAndSectionBoundaries(t *testing.T) {
	first := "# 第一节\n\n" + strings.Repeat("第一段内容。", 2200) + "\n\n"
	second := "# 第二节\n\n" + strings.Repeat("第二段内容。", 2200) + "\n"
	source := first + second
	chunks := markdownAIChunks(source)
	if len(chunks) < 2 {
		t.Fatalf("chunk count = %d; want at least 2", len(chunks))
	}
	var combined strings.Builder
	for index, chunk := range chunks {
		if chunk.Start != combined.Len() {
			t.Fatalf("chunk %d start = %d; want %d", index, chunk.Start, combined.Len())
		}
		combined.WriteString(chunk.Text)
	}
	if combined.String() != source {
		t.Fatal("chunking changed Markdown content")
	}
}

func TestMarkdownAIChunksDoNotSplitFencedBlocks(t *testing.T) {
	fence := "```text\n" + strings.Repeat("large code line\n", 2500) + "```\n"
	source := "# Before\n\nparagraph\n\n" + fence + "\n# After\n"
	chunks := markdownAIChunks(source)
	for _, chunk := range chunks {
		if strings.Contains(chunk.Text, "large code line") && !strings.Contains(chunk.Text, "```text") {
			t.Fatal("fenced block was split from its opening marker")
		}
		if strings.Contains(chunk.Text, "large code line") && !strings.Contains(chunk.Text, "```\n") {
			t.Fatal("fenced block was split from its closing marker")
		}
		if strings.Contains(chunk.Text, "large code line") && !chunk.Skip {
			t.Fatal("fenced code should be retained locally instead of sent to AI")
		}
	}
}

func TestMarkdownAIChunksRespectFenceMarkerAndLength(t *testing.T) {
	code := "````markdown\n# code heading\n```\n~~~\n" + strings.Repeat("nested code line\n", 2500) + "````\n"
	source := "before\n\n" + code + "\nafter\n"
	chunks := markdownAIChunks(source)
	var rebuilt strings.Builder
	fencedChunks := 0
	for _, chunk := range chunks {
		rebuilt.WriteString(chunk.Text)
		if strings.Contains(chunk.Text, "nested code line") {
			fencedChunks++
			if !chunk.Skip || chunk.Text != code {
				t.Fatalf("outer fence was not preserved as one skipped chunk: %#v", chunk)
			}
		}
	}
	if rebuilt.String() != source {
		t.Fatal("mixed or nested fences changed Markdown content")
	}
	if fencedChunks != 1 {
		t.Fatalf("fenced chunk count = %d; want 1", fencedChunks)
	}
}

func TestMarkdownAIChunksPreserveUnclosedFence(t *testing.T) {
	code := "~~~text\n" + strings.Repeat("unfinished code\n", 2500)
	chunks := markdownAIChunks("intro\n\n" + code)
	last := chunks[len(chunks)-1]
	if !last.Skip || last.Text != code {
		t.Fatalf("unclosed fence should stay intact and local: %#v", last)
	}
}

func TestPreserveAIChunkBoundaryWhitespace(t *testing.T) {
	original := "\n\nold paragraph\n\n"
	if got := preserveAIChunkBoundaryWhitespace(original, "new paragraph"); got != "\n\nnew paragraph\n\n" {
		t.Fatalf("boundary whitespace = %q", got)
	}
}

func TestMarkdownAIChunksSplitOversizedParagraphWithoutChangingText(t *testing.T) {
	source := strings.Repeat("长文本", aiChunkTargetCharacters)
	chunks := markdownAIChunks(source)
	if len(chunks) < 2 {
		t.Fatalf("got %d chunk; want an oversized paragraph split", len(chunks))
	}
	var rebuilt strings.Builder
	for _, chunk := range chunks {
		rebuilt.WriteString(chunk.Text)
	}
	if rebuilt.String() != source {
		t.Fatal("oversized paragraph did not round-trip exactly")
	}
}
