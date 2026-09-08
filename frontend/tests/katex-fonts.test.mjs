import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import test from 'node:test';
import { woff2OnlyKaTeX } from '../scripts/katex-fonts.mjs';
import config from '../vite.config.js';

test('the build plugin handles the actual minified CSS import', () => {
  const css = readFileSync(new URL('../node_modules/katex/dist/katex.min.css', import.meta.url), 'utf8');
  const result = config.plugins[0].transform(css, 'C:/project/node_modules/katex/dist/katex.min.css');
  assert.ok(result);
  assert.doesNotMatch(result.code, /\.(?:ttf|woff)\)/);
  assert.equal(config.plugins[0].transform(css, '/unrelated.css'), null);
});

test('font optimization preserves every KaTeX face and its WOFF2 asset', () => {
  const css = readFileSync(new URL('../node_modules/katex/dist/katex.css', import.meta.url), 'utf8');
  const optimized = woff2OnlyKaTeX(css);
  const originalFaces = [...css.matchAll(/@font-face\s*\{[^}]+\}/g)].map(([face]) => face.replace(/src:[^;]+;/, ''));
  const optimizedFaces = [...optimized.matchAll(/@font-face\s*\{[^}]+\}/g)].map(([face]) => face.replace(/src:[^;]+;/, ''));
  assert.ok(originalFaces.length > 10);
  assert.deepEqual(optimizedFaces, originalFaces);
  assert.doesNotMatch(optimized, /\.(?:ttf|woff)\)/);
  const fonts = [...optimized.matchAll(/url\(([^)]+\.woff2)\)/g)];
  assert.equal(fonts.length, originalFaces.length);
  for (const [, file] of fonts) assert.ok(existsSync(new URL(`../node_modules/katex/dist/${file}`, import.meta.url)), file);
  assert.equal(woff2OnlyKaTeX(optimized), optimized);
});

test('a source declaration without WOFF2 is preserved', () => {
  const css = '@font-face { src: url(custom.ttf) format("truetype"); }';
  assert.equal(woff2OnlyKaTeX(css), css);
});
