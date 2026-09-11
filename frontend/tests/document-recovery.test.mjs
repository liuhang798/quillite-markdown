import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const main = readFileSync(new URL('../src/main.js', import.meta.url), 'utf8');
const renderer = readFileSync(new URL('../src/renderer.js', import.meta.url), 'utf8');

test('crash recovery has a restore-or-discard startup flow', () => {
  assert.match(html, /id="recoveryDialog"/);
  assert.match(html, /id="discardRecovery"/);
  assert.match(html, /id="restoreRecovery"/);
  assert.match(main, /saveRecoverySnapshot:\s*input/);
  assert.match(main, /getRecoverySnapshot:/);
  assert.match(main, /clearRecoverySnapshot:/);
  assert.match(renderer, /async function offerRecoverySnapshot\(\)/);
  assert.match(renderer, /async function restoreRecoverySnapshot\(\)/);
  assert.match(renderer, /scheduleRecoverySnapshot\(performance\)/);
});

test('successful saves and explicit discards clear recovery data', () => {
  assert.match(renderer, /if \(unchangedSinceSave\)\s*{\s*if \(typeof clearRecoverySnapshot === 'function'\) await clearRecoverySnapshot/);
  assert.match(renderer, /if \(state\.dirty\) void clearRecoverySnapshot\(\)/);
  assert.match(renderer, /#discardRecovery[^\n]+discardRecoverySnapshot/);
});

test('opening a large document does not render the hidden editor preview twice', () => {
  assert.match(renderer, /documentPerformanceProfile\(doc\.content\.length\)\.level === 'normal'\) renderEditorPreview\(doc\.content\)/);
  assert.match(renderer, /else els\.editorPreview\.replaceChildren\(\)/);
});
