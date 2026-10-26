import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {mathBlockStart, markdownSourceOptions} from '../src/markdown-performance.js';
import {mathBlockExtension} from '../src/math-rendering.js';
import {stripTableWidthMetadata} from '../src/table-designer.js';
import {replaceDynamicTocMarkers} from '../src/toc-tree.js';

test('formula-free parsing removes only the formula start hook without mutating defaults', () => {
  const other = () => 0, defaults = {extensions:{startBlock:[mathBlockStart,other],renderers:{}}};
  assert.deepEqual(markdownSourceOptions(defaults,'# ordinary').extensions.startBlock,[other]);
  assert.deepEqual(defaults.extensions.startBlock,[mathBlockStart,other]);
  for (const source of ['$$\nx\n$$','text\n  \\[x\\]']) assert.equal(markdownSourceOptions(defaults,source).extensions,defaults.extensions);
  for (const [source, expected] of [['plain',undefined],['a\n  $$ x $$',2],['a\n    $$ x $$',undefined],['\\[x\\]',0]]) assert.equal(mathBlockStart(source),expected);
});
test('bounded block prefix retains every supported formula opening and rejects prose', () => {
  for (const source of ['$$x$$','   $$\nx\n   $$','\\[x\\]','   \\[\nx\n   \\]']) assert.ok(mathBlockExtension.tokenizer(source));
  for (const source of ['ordinary '.repeat(100000),'    $$x$$','\n$$x$$']) assert.equal(mathBlockExtension.tokenizer(source),undefined);
});
test('preparation fast paths preserve multi-megabyte images, tables and literal TOC examples', () => {
  const source='![image](data:image/png;base64,'+'A'.repeat(2*1024*1024)+')\n\n# end';
  assert.equal(replaceDynamicTocMarkers(source),source);
  assert.equal(stripTableWidthMetadata(source),source);
  const table='<!-- QUILLITE-TABLE-WIDTHS: 220 -->\n| A |\n|---|\n| B |';
  assert.ok(!stripTableWidthMetadata(table).includes('QUILLITE'));
  assert.equal(replaceDynamicTocMarkers('```text\n[toc]\n```'),'```text\n[toc]\n```');
  assert.match(replaceDynamicTocMarkers('[ToC]'),/data-dynamic-toc/);
});
test('document size never disables editing, search, print or export', () => {
  const source=readFileSync(new URL('../src/renderer.js',import.meta.url),'utf8');
  assert.doesNotMatch(source,/needsSafeReader|data-safe-reader|largeDocumentReader|safeReaderText/);
  assert.match(source,/replaceEditorContent\(doc.content, true\)/);
  assert.match(source,/els.editButton.disabled = !state.currentFile \|\| readOnly;/);
  assert.doesNotMatch(source,/data-markdown-src="\$\{safeHref\}"/);
  assert.match(source,/image.loading = 'eager'/);
});
