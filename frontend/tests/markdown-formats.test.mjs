import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import { marked } from 'marked';
import { escapeMarkdownText, highlightExtension, nextFootnoteNumber, prepareFootnotes, renderFootnoteSection } from '../src/markdown-formats.js';
import { LEGACY_TEXT_COLORS, TEXT_COLOR_PALETTE, TEXT_COLOR_VALUES, textColorValue } from '../src/text-colors.js';

const html = await readFile(new URL('../index.html', import.meta.url), 'utf8');
const renderer = await readFile(new URL('../src/renderer.js', import.meta.url), 'utf8');
const styles = await readFile(new URL('../src/styles.css', import.meta.url), 'utf8');

test('format toolbar exposes all six headings and the missing practical Markdown formats', () => {
  for (const heading of ['# ', '## ', '### ', '#### ', '##### ', '###### ']) {
    assert.ok(html.includes(`value="${heading}"`), heading);
  }
  for (const command of [
    'strikethrough', 'highlight', 'text-color', 'horizontal-rule', 'underline', 'superscript', 'subscript',
    'hard-break', 'footnote', 'reference-link', 'collapsible', 'keyboard-key', 'comment',
    'bold-italic', 'autolink', 'escape', 'html-block'
  ]) {
    assert.match(html, new RegExp(`(?:data-format|data-format-command|value)="${command}"`), command);
    assert.ok(renderer.includes(`command === '${command}'`) || renderer.includes(`runFormatCommand('${command}')`), command);
  }
});

test('text color palette follows highlight and only writes fixed safe color markers', () => {
  const highlightIndex = html.indexOf('data-format="highlight"');
  const textColorIndex = html.indexOf('data-format="text-color"');
  assert.ok(highlightIndex >= 0 && textColorIndex > highlightIndex);
  assert.match(html, /id="textColorMenu"[\s\S]*data-text-color="default"/);
  assert.match(html, /data-text-color="default" aria-checked="true"/);
  assert.doesNotMatch(html.match(/<div class="text-color-options">([\s\S]*?)<\/div>/)?.[1] || '', /class="menu-label"/);
  assert.equal(TEXT_COLOR_PALETTE.length + 1, 48);
  assert.equal(new Set(TEXT_COLOR_PALETTE.map(color => color.id)).size, 47);
  assert.equal(TEXT_COLOR_PALETTE.filter(color => color.id.startsWith('neutral-')).length, 7);
  assert.equal(TEXT_COLOR_PALETTE.filter(color => color.id.startsWith('spectrum-')).length, 40);
  assert.ok(TEXT_COLOR_VALUES.has('default'));
  assert.ok(TEXT_COLOR_VALUES.has('spectrum-3-blue'));
  assert.equal(LEGACY_TEXT_COLORS.size, 7);
  assert.equal(textColorValue('red'), 'var(--md-color-red)');
  assert.equal(textColorValue('not-a-color'), null);
  assert.match(renderer, /function buildTextColorMenu\(\)/);
  assert.match(renderer, /for \(const color of TEXT_COLOR_PALETTE\)/);
  assert.match(renderer, /function applyTextColor\(color\)/);
  assert.match(renderer, /<span data-md-color="\$\{color\}">/);
  assert.match(renderer, /ADD_ATTR: \['target', 'rel', 'data-md-color'\]/);
  assert.match(renderer, /container\.querySelectorAll\('\[data-md-color\]'\)/);
  assert.match(styles, /\.markdown-body \[data-md-color="red"\] \{ color: var\(--md-color-red\); \}/);
  assert.match(styles, /\.text-color-options \{[^}]*grid-template-columns: repeat\(8, 30px\)/);
  assert.match(styles, /\.text-color-swatch \{[^}]*width: 22px;[^}]*height: 22px;[^}]*border-radius: 5px;/);
  assert.match(styles, /:root\[data-color-mode="dark"\][\s\S]*--md-color-red:/);
});

test('format painter button exists and wires copy/apply/clear flow', () => {
  assert.ok(html.includes('id="formatPainterButton"'));
  assert.ok(renderer.includes('function copyFormatFromSelection()'));
  assert.ok(renderer.includes('function applyCopiedFormat()'));
  assert.ok(renderer.includes('function clearCopiedFormat()'));
  assert.ok(renderer.includes('function analyzeFormat('));
  assert.ok(renderer.includes('function scheduleFormatPainterApply()'));
  assert.match(styles, /\.editor-format-bar button\.active\s*\{/);
  assert.ok(renderer.includes("event.key === 'Escape' && copiedFormat"));
});

test('toolbar hides overflow and dynamically mirrors collapsed commands into More Formats', () => {
  assert.match(styles, /\.editor-format-bar\s*\{[^}]*overflow:\s*hidden/s);
  assert.doesNotMatch(styles, /\.editor-format-bar\s*\{[^}]*overflow-x:\s*auto/s);
  assert.match(html, /id="overflowFormatGroup"/);
  assert.match(html, /data-overflow-priority="\d+"/);
  assert.match(renderer, /new ResizeObserver\(scheduleFormatToolbarLayout\)/);
  assert.match(renderer, /bar\.scrollWidth <= bar\.clientWidth \+ 1/);
  assert.match(renderer, /rebuildOverflowFormatOptions\(\)/);
});

test('double equals syntax renders a semantic highlight', () => {
  marked.use({ extensions: [highlightExtension] });
  assert.match(marked.parse('Read ==this **carefully**==.'), /<mark class="markdown-highlight">this <strong>carefully<\/strong><\/mark>/);
  assert.match(styles, /\.markdown-body mark\.markdown-highlight\s*\{/);
});

test('footnotes keep fenced code untouched and render linked notes', () => {
  const prepared = prepareFootnotes('Text[^1].\n\n```md\ninside[^1]\n```\n\n[^1]: **Note**');

  assert.match(prepared.markdown, /id="fnref-1-1"/);
  assert.match(prepared.markdown, /inside\[\^1\]/);
  assert.doesNotMatch(prepared.markdown, /\[\^1\]:/);
  assert.deepEqual(prepared.notes, [{ number: 1, text: '**Note**', referenceCount: 1 }]);
  assert.match(renderFootnoteSection(prepared.notes, text => marked.parseInline(text), 'Footnotes'), /<strong>Note<\/strong>/);
});

test('new footnotes use the next available numeric label', () => {
  assert.equal(nextFootnoteNumber('A[^1] B[^3]\n\n[^1]: one'), 4);
  assert.equal(nextFootnoteNumber('No notes'), 1);
});

test('Markdown punctuation can be escaped without altering ordinary text', () => {
  assert.equal(escapeMarkdownText('*bold* [link](url)'), '\\*bold\\* \\[link\\]\\(url\\)');
  assert.equal(escapeMarkdownText('plain text'), 'plain text');
});
