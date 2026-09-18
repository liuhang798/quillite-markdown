import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';

const source = readFileSync(new URL('../src/renderer.js', import.meta.url), 'utf8');
const conflictSource = source.slice(source.indexOf('function resetDocumentConflict('), source.indexOf('function exportPreviewContainer('));
function deferred() {
  let resolve, reject;
  const promise = new Promise((a, b) => { resolve = a; reject = b; });
  return { promise, resolve, reject };
}
function harness() {
  const nodes = new Map();
  const $ = id => {
    if (!nodes.has(id)) {
      const classes = new Set(['hidden']);
      nodes.set(id, { value: '', textContent: '', disabled: false, focus() {}, classList: {
        add: name => classes.add(name), remove: name => classes.delete(name), contains: name => classes.has(name),
        toggle: (name, yes) => yes ? classes.add(name) : classes.delete(name),
      } });
    }
    return nodes.get(id);
  };
  const state = { documentSession: 1, currentFile: { path: '/a.md', content: 'local', revision: 'original' }, editing: true, dirty: true, saveAsRequired: true, recentFiles: [] };
  state.documentConflict = { session: 1, disk: null, mergedRevision: '', draft: null };
  const calls = [];
  const api = {
    readDocumentConflict: async () => ({ path: '/a.md', content: 'disk', revision: 'disk-revision' }),
    saveFile: async (...args) => { calls.push(['write', ...args]); return { path: '/a.md', name: 'a.md', content: args[1], revision: 'saved' }; },
    saveAs: async () => { throw new Error('unsafe save-as called'); },
    saveConflictCopy: async (...args) => { calls.push(['copy', ...args]); return null; },
  };
  const context = vm.createContext({
    state, $, document: { body: { classList: $('#body').classList }, querySelector: () => null },
    window: { quilliteMarkdown: api, confirm: () => true },
    els: { editorFileName: {}, editorSaveState: {} },
    editorContent: () => state.currentFile.content,
    codeEditor: { state: { doc: { length: 5 } }, dispatch: tx => calls.push(['edit', tx.changes.insert]) },
    focusCodeEditor() {}, renderEditorPreview() {}, renderCurrentDocument() {},
    setDirty: value => { state.dirty = value; }, t: key => key, showToast: key => calls.push(['toast', key]),
    clearRecoverySnapshot: async () => {}, cancelScheduledRecoverySnapshot() {},
    scheduleRecoverySnapshot: () => calls.push(['backup']),
    syncDocumentAccessControls() {}, addRecentDocument() {}, renderFileList() {},
    refreshLibraryAfterReplacement: async () => {}, pathIsInsideRoot: () => false,
    reportSilentError() {}, console: { error() {} }, setTimeout() {}, clearTimeout() {},
  });
  vm.runInContext(conflictSource, context);
  return { context, state, calls, $, api };
}

test('comparison reads both versions without acknowledging the disk revision or writing', async () => {
  const { context: c, state, calls, $ } = harness();
  await c.openDocumentConflict();
  assert.equal($('#documentConflictDisk').value, 'disk');
  assert.equal($('#documentConflictCurrent').value, 'local');
  assert.equal(state.currentFile.revision, 'original');
  assert.deepEqual(calls, []);
  c.closeDocumentConflict();
  await c.saveDocument(false, { auto: true });
  assert.deepEqual(calls, []);
  assert.equal(state.currentFile.content, 'local');
  assert.equal(state.dirty, true);
});

test('manual save reopens comparison, not Save As or overwrite', async () => {
  const { context: c, calls, $ } = harness();
  await c.saveDocument();
  assert.equal($('#documentConflictDialog').classList.contains('hidden'), false);
  assert.deepEqual(calls, []);
});

test('manual merge is undoable and cannot autosave; explicit confirmation uses compared revision', async () => {
  const { context: c, state, calls, $ } = harness();
  await c.openDocumentConflict();
  c.startConflictMerge();
  $('#documentConflictMerge').value = 'merged';
  c.applyConflictMerge();
  assert.equal(state.currentFile.content, 'merged');
  assert.equal(state.currentFile.revision, 'original');
  assert.equal(state.dirty, true);
  assert.ok(calls.some(call => call[0] === 'edit'));
  await c.saveDocument(false, { auto: true });
  assert.ok(!calls.some(call => call[0] === 'write'));
  await c.saveDocument();
  assert.equal($('#conflictSave').classList.contains('hidden'), false);
  await c.saveConflictMerge();
  assert.deepEqual(calls.find(call => call[0] === 'write'), ['write', '/a.md', 'merged', 'disk-revision']);
  assert.equal(state.documentConflict, null);
  assert.equal(state.dirty, false);
});

test('changed disk disables approval of the previous merge and preserves the merged buffer', async () => {
  const { context: c, state, api, $, calls } = harness();
  await c.openDocumentConflict();
  state.documentConflict.mergedRevision = 'disk-revision';
  api.readDocumentConflict = async () => ({ content: 'new disk', revision: 'new' });
  await c.openDocumentConflict();
  await c.saveConflictMerge();
  assert.equal($('#conflictSave').classList.contains('hidden'), true);
  assert.equal($('#documentConflictStatus').textContent, 'conflictChangedAgain');
  assert.equal(state.currentFile.content, 'local');
  assert.deepEqual(calls, []);
});

test('external change during confirmed save returns to comparison without forced retry', async () => {
  const { context: c, state, api, calls } = harness();
  await c.openDocumentConflict();
  state.documentConflict.mergedRevision = 'disk-revision';
  api.saveFile = async () => { throw new Error('DOCUMENT_CONFLICT'); };
  await c.saveConflictMerge();
  assert.equal(state.documentConflict.mergedRevision, '');
  assert.equal(state.currentFile.content, 'local');
  assert.equal(state.dirty, true);
  assert.ok(!calls.some(call => call[0] === 'copy'));
});

test('using disk requires confirmation, is undoable and never writes', async () => {
  const { context: c, state, calls } = harness();
  await c.openDocumentConflict();
  c.window.confirm = () => false;
  c.useConflictDisk();
  assert.equal(state.currentFile.content, 'local');
  c.window.confirm = () => true;
  c.useConflictDisk();
  assert.equal(state.currentFile.content, 'disk');
  assert.equal(state.currentFile.revision, 'disk-revision');
  assert.equal(state.dirty, false);
  assert.equal(state.documentConflict, null);
  assert.deepEqual(calls, [['edit', 'disk']]);
});

test('unreadable or deleted disk does not become an empty version or enable destructive actions', async () => {
  const { context: c, state, api, $, calls } = harness();
  api.readDocumentConflict = async () => { throw new Error('not found'); };
  await c.openDocumentConflict();
  c.useConflictDisk();
  c.startConflictMerge();
  await c.saveConflictMerge();
  assert.equal(state.currentFile.content, 'local');
  assert.equal($('#conflictDisk').disabled, true);
  assert.equal($('#conflictMerge').disabled, true);
  assert.equal($('#documentConflictStatus').textContent, 'conflictUnavailable');
  assert.deepEqual(calls, []);
});

test('closing or switching document invalidates late disk reads, including reopening the same path', async () => {
  for (const change of ['close', 'switch', 'reset']) {
    const { context: c, state, api, $ } = harness();
    const read = deferred();
    api.readDocumentConflict = () => read.promise;
    const opening = c.openDocumentConflict();
    if (change === 'close') c.closeDocumentConflict();
    else if (change === 'reset') c.resetDocumentConflict();
    else state.documentSession++;
    read.resolve({ content: 'stale', revision: 'stale' });
    await opening;
    assert.equal($('#documentConflictDisk').value, '');
    assert.equal(state.currentFile.content, 'local');
  }
});

test('copy cancellation or an existing destination leaves conflict and edits intact', async () => {
  for (const fail of [false, true]) {
    const { context: c, state, api, calls } = harness();
    if (fail) api.saveConflictCopy = async () => { throw new Error('DOCUMENT_COPY_EXISTS'); };
    await c.saveDocument(true);
    assert.ok(state.documentConflict);
    assert.equal(state.currentFile.content, 'local');
    assert.equal(state.dirty, true);
    assert.ok(!calls.some(call => call[0] === 'write'));
    if (fail) assert.ok(calls.some(call => call[1] === 'conflictCopyExists'));
  }
});

test('successful copy opens the copy and leaves source revision out of future saves', async () => {
  const { context: c, state, api } = harness();
  api.saveConflictCopy = async () => ({ path: '/new.md', name: 'new.md', content: 'local', revision: 'copy-revision' });
  await c.saveDocument(true);
  assert.equal(state.currentFile.path, '/new.md');
  assert.equal(state.currentFile.revision, 'copy-revision');
  assert.equal(state.documentConflict, null);
  assert.equal(state.dirty, false);
});

test('background edit invalidates a pending merge or disk selection', async () => {
  const { context: c, state, calls, $ } = harness();
  await c.openDocumentConflict();
  state.currentFile.content = 'new local edits';
  $('#documentConflictMerge').value = 'obsolete merge';
  c.applyConflictMerge();
  assert.equal(state.currentFile.content, 'new local edits');
  assert.ok(!calls.some(call => call[0] === 'edit'));
});

test('outdated merge draft needs explicit discard after editor or disk changes', async () => {
  for (const target of ['editor', 'disk']) {
    const { context: c, state, api, $, calls } = harness();
    await c.openDocumentConflict();
    c.startConflictMerge();
    state.documentConflict.draft = 'old draft';
    c.closeDocumentConflict();
    if (target === 'editor') state.currentFile.content = 'new edits';
    else api.readDocumentConflict = async () => ({ content: 'new disk', revision: 'new revision' });
    await c.openDocumentConflict();
    c.window.confirm = () => false;
    c.startConflictMerge();
    assert.equal(state.documentConflict.draft, 'old draft');
    assert.equal($('#documentConflictMergeField').classList.contains('hidden'), true);
    c.applyConflictMerge();
    assert.ok(!calls.some(call => call[0] === 'edit'));
    c.window.confirm = () => true;
    c.startConflictMerge();
    assert.equal($('#documentConflictMerge').value, state.currentFile.content);
    assert.equal(state.documentConflict.draft, null);
    c.applyConflictMerge();
    assert.ok(calls.some(call => call[0] === 'edit'));
  }
});

test('reader-only manual merge schedules recovery without a CodeMirror instance', async () => {
  const { context: c, state, $, calls } = harness();
  state.editing = false;
  c.codeEditor = null;
  await c.openDocumentConflict();
  c.startConflictMerge();
  $('#documentConflictMerge').value = 'merged from reading view';
  c.applyConflictMerge();
  assert.equal(state.currentFile.content, 'merged from reading view');
  assert.ok(calls.some(call => call[0] === 'backup'));
  assert.equal(state.dirty, true);
  assert.ok(state.documentConflict);
});

test('mismatched save receipt never grants an external revision to the local buffer', async () => {
  for (const copy of [false, true]) {
    const { context: c, state, api, calls } = harness();
    const badReceipt = async () => ({ path: copy ? '/copy.md' : '/a.md', content: 'external content', revision: 'external-revision' });
    if (copy) api.saveConflictCopy = badReceipt;
    else api.saveFile = badReceipt;
    await c.saveDocument(copy, copy ? {} : { conflictRevision: 'disk-revision' });
    assert.equal(state.currentFile.content, 'local');
    assert.equal(state.currentFile.revision, 'original');
    assert.equal(state.currentFile.path, '/a.md');
    assert.equal(state.dirty, true);
    assert.ok(state.documentConflict);
    await c.saveDocument(false, { auto: true });
    assert.ok(!calls.some(call => call[0] === 'write'));
  }
});
