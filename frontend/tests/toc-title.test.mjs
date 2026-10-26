import test from 'node:test';
import assert from 'node:assert/strict';
import { createTocTitle, tocTitleHTML } from '../src/toc-title.js';
const text = textContent => ({ nodeType: 3, textContent });
const element = (children, source, tagName = 'SPAN') => ({ nodeType: 1, childNodes: children, tagName, matches: () => source !== undefined, getAttribute: () => source });

test('TOC titles keep one semantic formula instead of KaTeX duplicate text', () => {
  const title = createTocTitle(element([text('改进1：去掉 '), element([text('VBBVBB_{BB}VBB')], encodeURIComponent('VBB_{BB}'))]));
  assert.equal(title.text, '改进1：去掉 VBB_{BB}');
  assert.equal(title.parts.length, 2);
  assert.equal(title.hasMath, true);
  const html = tocTitleHTML(title);
  assert.equal((html.match(/class="katex"/g) || []).length, 1);
  assert.match(html, /class="toc-math"/);
  assert.doesNotMatch(html, /VBBVBB_|data-math-origin|data-math-source/);
});

test('search marks whole formulas and safely escapes ordinary title text', () => {
  const title = createTocTitle(element([text('<img onerror="alert(1)"> '), element([], encodeURIComponent('x^2'))]));
  assert.match(tocTitleHTML(title, 'x'), /<mark><span class="toc-math">/);
  assert.match(tocTitleHTML(title), /&lt;img onerror=&quot;alert\(1\)&quot;&gt;/);
  assert.doesNotMatch(tocTitleHTML(title), /<img/);
  assert.match(tocTitleHTML(createTocTitle(element([text('Alpha beta')])), 'beta'), /Alpha <mark>beta<\/mark>/);
});

test('TOC math cannot introduce active links or executable heading markup', () => {
  const title = createTocTitle(element([element([text('link')], undefined, 'A'), element([], encodeURIComponent('\\href{javascript:alert(1)}{x}'))]));
  const html = tocTitleHTML(title);
  assert.doesNotMatch(html, /<a\b|<script\b|\sonerror=/);
  assert.match(html, /^link/);
});

test('invalid formulas, broken metadata and line breaks remain readable', () => {
  const invalid = createTocTitle(element([element([], encodeURIComponent('\\frac{'))]));
  assert.match(tocTitleHTML(invalid), /katex-error/);
  assert.equal(invalid.text, '\\frac{');
  const malformed = createTocTitle(element([text('A'), element([], undefined, 'BR'), element([text('kept')], '%E0%A4%A')]));
  assert.equal(malformed.text, 'A kept');
  assert.equal(malformed.hasMath, false);
});
