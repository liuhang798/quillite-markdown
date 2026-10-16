import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { patchMermaidThemeDerivation } from '../scripts/mermaid-theme-derivation.mjs';
import { patchMermaidSVGEntities } from '../scripts/mermaid-svg-entities.mjs';
import { patchSankeyUnicode } from '../scripts/mermaid-sankey-unicode.mjs';

const original = readFileSync(new URL('../node_modules/mermaid/dist/mermaid.min.js', import.meta.url), 'utf8');

test('Mermaid implicit base theme patch fails closed and composes with existing patches', () => {
  const patched = patchMermaidThemeDerivation(patchMermaidSVGEntities(patchSankeyUnicode(original)));
  assert.throws(() => patchMermaidThemeDerivation('changed bundle'), /derivation changed/);
  assert.throws(() => patchMermaidThemeDerivation(original + original), /derivation changed/);
  assert.throws(() => patchMermaidThemeDerivation(patched), /derivation changed/);
  assert.equal(patched.split('"base"){let').length, original.split('"base"){let').length + 1);
});

test('only an inherited base theme with variables gains the derivation branch', () => {
  const patched = patchMermaidThemeDerivation(original);
  const expression = patched.match(/if\(r=ii\(r,n\),([^;]+?)\)\{let i=ii\(\{\},ww\)/)?.[1];
  assert.ok(expression, 'Review upstream local names when upgrading Mermaid');
  const derive = new Function('r', 'n', 'dl', `return Boolean(${expression});`);
  const themes = { base: {}, dark: {}, default: {} };
  assert.equal(derive({theme:'base'}, {themeVariables:{primaryTextColor:'#246399'}}, themes), true);
  assert.equal(derive({theme:'base'}, {}, themes), false);
  assert.equal(derive({theme:'base'}, {themeVariables:null}, themes), false);
  assert.equal(derive({theme:'dark'}, {themeVariables:{primaryTextColor:'#246399'}}, themes), false);
  assert.equal(derive({theme:'base'}, {theme:'unknown',themeVariables:{}}, themes), false);
  for (const theme of Object.keys(themes)) assert.equal(derive({theme}, {theme,themeVariables:{}}, themes), true);
  // No sanitizer, secure config list or merge operation is replaced.
  assert.ok(patched.includes('for(let i of t)iZ(i),n=ii(n,i);'));
  assert.ok(patched.includes('a=ii(i.themeVariables||{},n.themeVariables)'));
});
