import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const styles = await readFile(new URL('../src/styles.css', import.meta.url), 'utf8');
const rule = selector => {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = styles.match(new RegExp(`(?:^|\\n)${escaped} \\{([^}]+)\\}`));
  assert.ok(match, `Missing CSS rule: ${selector}`);
  return match[1];
};

test('home illustration, sections and keycaps use flat, theme-aware surfaces', () => {
  for (const selector of ['.paper', '.welcome-section', '.welcome kbd']) {
    assert.match(rule(selector), /box-shadow: none;/);
    assert.match(rule(selector), /border: 1px solid var\(--line\);/);
  }
  for (const selector of ['.welcome', '.welcome-section', '.welcome-shortcut-card', '.shortcut-row kbd']) {
    assert.doesNotMatch(rule(selector), /gradient\(/);
  }
  assert.doesNotMatch(rule('.welcome kbd'), /border-bottom-width:/);
});

test('flat reference cards retain visible keyboard focus without hover movement', () => {
  assert.match(rule('.welcome-reference-card:focus-visible'), /outline: 2px solid var\(--accent\);/);
  assert.doesNotMatch(rule('.welcome-reference-card:hover'), /transform:/);
});
