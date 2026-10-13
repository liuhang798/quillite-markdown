import assert from 'node:assert/strict';
import test from 'node:test';
import { createRuntimeDiagnostics } from '../src/runtime-diagnostics.js';

test('diagnostics records an asset fingerprint and fixed failure context only', () => {
  const diagnostics = createRuntimeDiagnostics('http://wails.localhost/assets/renderer-CBsIfnHh.js?secret=private');
  const error = Object.freeze(new Error('private document text'));
  diagnostics.capture(error, 'view', 'normal');
  assert.equal(diagnostics.format(error), '[diagnostics-v1 asset=renderer-CBsIfnHh.js stage=view mode=normal]');
  diagnostics.capture(error, 'plugin', 'source-fallback');
  assert.match(diagnostics.format(error), /stage=view mode=normal/);
  assert.equal(diagnostics.format(new Error('other')), '[diagnostics-v1 asset=renderer-CBsIfnHh.js]');
});

test('unknown fields, URLs and primitive errors never leak into diagnostics', () => {
  for (const url of ['file:///C:/Users/private/note.md', 'http://secret.example/assets/renderer-secret.js', 'http://wails.localhost/private/note.md', 'invalid']) {
    const diagnostics = createRuntimeDiagnostics(url);
    const error = {};
    diagnostics.capture(error, 'private text', 'C:\\secret');
    assert.equal(diagnostics.format(error), '[diagnostics-v1 asset=unbundled stage=unknown mode=unknown]');
    diagnostics.capture('private', 'view', 'normal');
    assert.equal(diagnostics.format('private'), '[diagnostics-v1 asset=unbundled]');
  }
});

test('macOS Wails assets retain their fingerprint too', () => {
  assert.equal(createRuntimeDiagnostics('wails://wails/assets/renderer-CBsIfnHh.js').format(null), '[diagnostics-v1 asset=renderer-CBsIfnHh.js]');
});
