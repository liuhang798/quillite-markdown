import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const styles = await readFile(new URL('../src/styles.css', import.meta.url), 'utf8');

test('reading and live inline code share a theme-aware neutral background, excluding code blocks', async () => {
  const rule = styles.match(/\.markdown-body :not\(pre\) > code:not\(\.hljs\)\s*\{([^}]*)\}/s)?.[1];
  const live = await readFile(new URL('../src/editor-live-preview.css', import.meta.url), 'utf8');
  const liveRule = live.match(/^\.cm-editor\.cm-live-preview \.cm-live-inline-code \{([^}]*)\}/m)?.[1];
  for (const value of [rule, liveRule]) {
    assert.ok(value, 'the inline-code style rule should exist');
    assert.match(value, /background: color-mix\(in srgb, var\(--text\) 8%, var\(--paper\)\)/);
    assert.match(value, /color: var\(--text\)/);
    assert.match(value, /padding: 1px 3px/);
    assert.match(value, /box-decoration-break: clone/);
  }
});
