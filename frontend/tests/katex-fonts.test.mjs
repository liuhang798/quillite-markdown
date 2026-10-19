import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import test from 'node:test';
import { woff2OnlyKaTeX } from '../scripts/katex-fonts.mjs';
import config from '../vite.config.js';

test('the build plugin handles the actual minified CSS import', () => {
  const css = readFileSync(new URL('../node_modules/katex/dist/katex.min.css', import.meta.url), 'utf8');
  const plugin = config.plugins.find(plugin => plugin.name === 'katex-woff2-only');
  const result = plugin.transform(css, 'C:/project/node_modules/katex/dist/katex.min.css');
  assert.ok(result);
  assert.doesNotMatch(result.code, /\.(?:ttf|woff)\)/);
  const withoutSources = value => value.replace(/src:\s*[^;}]+;?/g, 'src:FONT');
  assert.equal(withoutSources(result.code), withoutSources(css), 'font optimization must preserve every non-src rule in minified CSS');
  assert.match(result.code, /\.katex\{font:normal 1\.21em KaTeX_Main,Times New Roman,serif;/);
  assert.equal(plugin.transform(css, '/unrelated.css'), null);
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

test('a semicolon-less face cannot swallow the next selector or its font declaration', () => {
  const input = '@font-face{font-family:Math;src:url(m.woff2) format("woff2"),url(m.ttf) format("truetype")}.katex{font:normal 1.21em Math;line-height:1.2}';
  assert.equal(woff2OnlyKaTeX(input), '@font-face{font-family:Math;src: url(m.woff2) format("woff2")}.katex{font:normal 1.21em Math;line-height:1.2}');
});
