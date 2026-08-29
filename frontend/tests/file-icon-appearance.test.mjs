import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const styles = await readFile(new URL('../src/styles.css', import.meta.url), 'utf8');

test('document icons have no background tiles and use theme-colored outlines', () => {
  const icon = styles.match(/\n\.file-icon \{([^}]+)\}/)?.[1];
  const svg = styles.match(/\n\.file-icon svg \{([^}]+)\}/)?.[1];
  assert.ok(icon);
  assert.ok(svg);
  assert.match(icon, /background: transparent;/);
  assert.match(icon, /box-shadow: none;/);
  assert.match(icon, /border: 0;/);
  assert.match(icon, /width: 24px;/);
  assert.match(icon, /color: var\(--accent-strong\);/);
  assert.match(svg, /fill: none;/);
  assert.match(svg, /stroke: currentColor;/);
});

test('missing document icons keep the flat style and remain visually distinct', () => {
  const missing = styles.match(/\n\.file-row\.missing \.file-icon \{([^}]+)\}/)?.[1];
  assert.ok(missing);
  assert.match(missing, /color: var\(--faint\);/);
  assert.doesNotMatch(missing, /background|box-shadow/);
});
