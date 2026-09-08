import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { patchSankeyUnicode } from '../scripts/mermaid-sankey-unicode.mjs';

test('Sankey vendor patch accepts Unicode without changing CSV delimiters', async () => {
  const bundle = await readFile(new URL('../node_modules/mermaid/dist/mermaid.min.js', import.meta.url), 'utf8');
  const patched = patchSankeyUnicode(bundle);
  const classes = patched.match(/\[\\u0020-\\u0021[^\]]+\\uFFFF\]/gu);
  assert.equal(classes.length, 2);
  const text = new RegExp(`^${classes[0]}+$`, 'i');
  assert.ok(text.test('文档 中文 📖 Parser'));
  for (const value of [',', '"', '\r', '\n']) assert.equal(text.test(value), false);
  assert.throws(() => patchSankeyUnicode('different vendor code'), /lexer changed/);
});
