import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { setImmediate } from 'node:timers/promises';
import vm from 'node:vm';

const renderer = readFileSync(new URL('../src/renderer.js', import.meta.url), 'utf8');
const helpers = renderer.slice(renderer.indexOf('function updateWindowTitle()'), renderer.indexOf('function cancelScheduledEditorPreview()'));

function harness(send = () => Promise.resolve()) {
  const native = [], writes = [];
  const state = { documentSession: 0, dirty: false, currentFile: { name: 'Original.md' }, language: 'en' };
  function observedProperty(target, key, initial) {
    let value = initial;
    Object.defineProperty(target, key, {
      get: () => value,
      set(next) { value = next; writes.push([key, next]); }
    });
  }
  let dirtyClass = false;
  const editorSaveState = { classList: {
    contains: () => dirtyClass,
    toggle(_key, next) { dirtyClass = next; writes.push(['class', next]); }
  } };
  const document = {};
  observedProperty(document, 'title', '');
  observedProperty(editorSaveState, 'textContent', '');
  observedProperty(editorSaveState, 'title', '');
  const context = vm.createContext({
    state, els: { editorSaveState }, document,
    t: key => state.language + ':' + key,
    window: { quilliteMarkdown: { setDirty(value) { native.push(value); return send(value); } } }
  });
  vm.runInContext(helpers, context);
  return { state, editorSaveState, document, writes, native, setDirty: context.setDirty };
}

test('stable dirty state does not repeat native calls or rewrite window/status DOM', () => {
  const h = harness();
  h.setDirty(false);
  h.setDirty(true);
  h.writes.length = 0;
  for (let i = 0; i < 20; i++) h.setDirty(true);
  assert.deepEqual(h.native, [false, true]);
  assert.deepEqual(h.writes, []);
  h.setDirty(false); // Saved or undone back to its baseline.
  assert.deepEqual(h.native, [false, true, false]);
  assert.equal(h.editorSaveState.textContent, 'en:saved');
  assert.doesNotMatch(h.document.title, /^●/);
});

test('same dirty flag still refreshes document identity, language and conflict label', () => {
  const h = harness();
  h.setDirty(true);
  h.state.documentConflict = {};
  h.setDirty(false);
  assert.equal(h.editorSaveState.textContent, 'en:conflictPaused');
  h.state.language = 'zh-CN';
  h.state.currentFile.name = 'Renamed.md';
  h.setDirty(true);
  assert.equal(h.editorSaveState.textContent, 'zh-CN:conflictPaused');
  assert.match(h.document.title, /Renamed\.md/);
  assert.deepEqual(h.native, [true]);
  h.state.documentSession++;
  h.setDirty(true);
  assert.deepEqual(h.native, [true, true], 'initialize the flag for each document session');
});

test('failed native status is eligible to retry without resetting a newer transition', async () => {
  const rejects = [];
  const h = harness(() => new Promise((_resolve, reject) => rejects.push(reject)));
  h.setDirty(false);
  h.setDirty(true);
  rejects[0](new Error('late failure'));
  await setImmediate();
  h.setDirty(true);
  assert.deepEqual(h.native, [false, true]);
  rejects[1](new Error('current failure'));
  await setImmediate();
  h.setDirty(true);
  assert.deepEqual(h.native, [false, true, true]);
});
