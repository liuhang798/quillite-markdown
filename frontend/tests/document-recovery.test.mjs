import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

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

function recoveryHarness(snapshot, disk) {
  const calls = [];
  const state = { documentSession: 1, currentFile: null, editing: false };
  let timer;
  const context = vm.createContext({
    state, pendingRecoverySnapshot: snapshot, lastRecoveryContent: '', lastRecoveryContext: '',
    $: () => ({}), window: { quilliteMarkdown: {
      readFile: async () => disk,
      saveRecoverySnapshot: async input => calls.push(['backup', input]),
      clearRecoverySnapshot: async () => calls.push(['clear']),
    } },
    displayDocument: doc => { state.currentFile = { ...doc }; state.documentSession++; state.documentConflict = null; state.saveAsRequired = false; },
    toggleEditor: async () => { state.editing = true; },
    editorContent: () => state.currentFile.content,
    setDirty: value => { state.dirty = Boolean(value) || Boolean(state.documentConflict); },
    closeRecoveryDialog() {}, showToast() {}, t: key => key, reportSilentError() {},
    openDocumentConflict: async () => calls.push(['compare']),
    codeEditor: { state: { doc: { length: 10 } } },
    documentPerformanceProfile: () => ({ recoveryDelay: 0 }),
    sameDocumentPath: (a, b) => a === b,
    clearTimeout() {}, setTimeout: callback => { timer = callback; },
  });
  vm.runInContext(renderer.slice(renderer.indexOf('function cancelScheduledRecoverySnapshot('), renderer.indexOf('function maybeDiscardChanges(')), context);
  vm.runInContext(renderer.slice(renderer.indexOf('async function restoreRecoverySnapshot('), renderer.indexOf('function closeDocumentHistory(')), context);
  return { context, state, calls, tick: async () => { if (timer) await timer(); } };
}

test('recovery pauses conflicts, legacy snapshots, invalid revisions and changed baselines', async () => {
  const disk = { path: '/a.md', content: 'disk', revision: 'b'.repeat(64) };
  for (const meta of [{}, { baseRevision: 'invalid' }, { baseRevision: 'a'.repeat(64) }, { baseRevision: disk.revision, conflict: true }]) {
    const h = recoveryHarness({ path: disk.path, content: 'unconfirmed local', ...meta }, disk);
    await h.context.restoreRecoverySnapshot();
    assert.equal(h.state.currentFile.content, 'unconfirmed local');
    assert.ok(h.state.documentConflict);
    assert.equal(h.state.saveAsRequired, true);
    assert.equal(h.state.dirty, true);
    assert.ok(h.calls.some(call => call[0] === 'compare'));
    await h.tick();
    const backup = h.calls.find(call => call[0] === 'backup')[1];
    assert.equal(backup.conflict, true);
    assert.equal(backup.content, 'unconfirmed local');
  }
});

test('unchanged known recovery baseline keeps normal revision-protected saving', async () => {
  const disk = { path: '/a.md', content: 'disk', revision: 'b'.repeat(64) };
  const h = recoveryHarness({ path: disk.path, content: 'local', baseRevision: disk.revision }, disk);
  await h.context.restoreRecoverySnapshot();
  assert.equal(h.state.documentConflict, null);
  assert.equal(h.state.currentFile.revision, disk.revision);
  assert.equal(h.state.dirty, true);
  assert.ok(!h.calls.some(call => call[0] === 'compare'));
});

test('conflicted content equal to original baseline stays backed up, and changed metadata bypasses dedupe', async () => {
  const disk = { path: '/a.md', content: 'original', revision: 'a'.repeat(64) };
  const h = recoveryHarness({ path: disk.path, content: 'original', baseRevision: disk.revision, conflict: true }, disk);
  await h.context.restoreRecoverySnapshot();
  await h.tick();
  assert.equal(h.state.dirty, true);
  assert.ok(!h.calls.some(call => call[0] === 'clear'));
  assert.equal(h.calls.filter(call => call[0] === 'backup').length, 1);
  h.context.scheduleRecoverySnapshot();
  await h.tick();
  assert.equal(h.calls.filter(call => call[0] === 'backup').length, 1);
  h.state.currentFile.revision = 'c'.repeat(64);
  h.context.scheduleRecoverySnapshot();
  await h.tick();
  assert.equal(h.calls.filter(call => call[0] === 'backup').length, 2);
});

test('recovery ignores a late disk read after switching document sessions', async () => {
  const h = recoveryHarness({ path: '/a.md', content: 'old' }, null);
  let resolve;
  h.context.window.quilliteMarkdown.readFile = () => new Promise(done => { resolve = done; });
  const restoring = h.context.restoreRecoverySnapshot();
  h.state.documentSession++;
  h.state.currentFile = { path: '/b.md', content: 'new' };
  resolve({ path: '/a.md', content: 'disk', revision: 'a'.repeat(64) });
  await restoring;
  assert.equal(h.state.currentFile.content, 'new');
  assert.deepEqual(h.calls, []);
});

test('leaving editing mode does not stop unresolved conflict backups', async () => {
  const disk = { path: '/a.md', content: 'external', revision: 'b'.repeat(64) };
  const h = recoveryHarness({ path: disk.path, content: 'local', conflict: true }, disk);
  await h.context.restoreRecoverySnapshot();
  h.state.editing = false;
  h.context.editorContent = () => { throw new Error('hidden editor may be stale'); };
  await h.tick();
  const backup = h.calls.find(call => call[0] === 'backup')[1];
  assert.equal(backup.content, 'local');
  assert.equal(backup.conflict, true);
});
