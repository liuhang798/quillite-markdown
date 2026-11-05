import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { prepareTextPackExport } from '../src/textpack.js';

const source = readFileSync(new URL('../src/renderer.js', import.meta.url), 'utf8');
const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const bridge = readFileSync(new URL('../src/main.js', import.meta.url), 'utf8');
const section = (start, end) => source.slice(source.indexOf(start), source.indexOf(end));
const revision = 'a'.repeat(64), diskRevision = 'b'.repeat(64);
const document = (changes = {}) => ({
  path: '/notes.textpack', name: 'notes.textpack', content: 'local',
  directory: '/owned/session-a', resourcePath: '/owned/session-a/text.md',
  packageDirectory: '/', bundleKind: 'textpack', bundleSessionId: 'session-a',
  bundleTextPath: 'text.md', revision, ...changes
});
function deferred() {
  let resolve, reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
function harness() {
  const nodes = new Map(), calls = [];
  const $ = id => {
    if (!nodes.has(id)) {
      const classes = new Set();
      nodes.set(id, { value: '', textContent: '', disabled: false, focus() {},
        classList: { add: x => classes.add(x), remove: x => classes.delete(x),
          contains: x => classes.has(x), toggle: (x, yes) => yes ? classes.add(x) : classes.delete(x) } });
    }
    return nodes.get(id);
  };
  const state = { documentSession: 1, documentOpenRequest: 0, currentFile: document(), editing: true,
    dirty: true, savedContent: 'baseline', saving: false, saveAsRequired: false, recentFiles: [] };
  const api = {
    saveDocumentAsFormat: (...args) => api.saveBundleCopy(...args.slice(0, 3)),
    saveFile: async () => { throw Error('ordinary Markdown save called'); },
    saveAs: async () => { throw Error('ordinary Markdown copy called'); },
    saveConflictCopy: async () => { throw Error('ordinary Markdown conflict copy called'); },
    saveBundleDocument: async (...args) => {
      calls.push(['write-package', ...args]);
      return document({ content: args[1], revision: 'c'.repeat(64) });
    },
    saveBundleCopy: async (...args) => {
      calls.push(['copy-package', ...args]);
      return document({ path: '/copy.textpack', name: 'copy.textpack', content: args[1], bundleSessionId: 'copy-session' });
    },
    readDocumentConflict: async () => document({ content: 'disk', revision: diskRevision,
      directory: '/owned/disk', resourcePath: '/owned/disk/text.md', bundleSessionId: 'disk-session' }),
    rebaseBundleDocument: async (...args) => {
      calls.push(['rebase-package', ...args]);
      return document({ content: 'disk', revision: diskRevision,
        directory: '/owned/rebased', resourcePath: '/owned/rebased/text.md', bundleSessionId: 'rebased-session' });
    }
  };
  const c = vm.createContext({
    state, $, window: { quilliteMarkdown: api, confirm: () => true },
    document: { body: { classList: $('#body').classList }, querySelector: () => null },
    els: { editorFileName: {}, editorSaveState: {} }, codeEditor: null,
    editorContent: () => state.currentFile.content, focusCodeEditor() {},
    setDirty: x => { state.dirty = Boolean(x); },
    t: key => key, showToast: (...args) => calls.push(['toast', ...args]),
    reportSilentError() {}, console: { error() {} }, setTimeout() {}, clearTimeout() {},
    renderEditorPreview() {}, renderCurrentDocument() {}, renderFileList() {}, syncDocumentIdentity() {},
    addRecentDocument() {}, syncDocumentAccessControls() {}, refreshLibraryAfterReplacement: async () => {},
    pathIsInsideRoot: () => false, sameDocumentPath: (a, b) => a === b,
    isMissingDocumentError: () => false, scheduleRecoverySnapshot: () => calls.push(['backup']),
    clearRecoverySnapshot: async () => calls.push(['clear-backup']), cancelScheduledRecoverySnapshot() {},
    documentPerformanceProfile: () => ({}), documentHasDiagrams: () => false
  });
  c.flushBundleRecoverySnapshot = async (snapshot, session) => { calls.push(['flush-package', snapshot.content, snapshot.bundleSessionId, session]); return true; };
  vm.runInContext(section('function resetDocumentConflict(', 'function exportPreviewContainer('), c);
  c.chooseSaveDocumentFormat = async () => 'textpack';
  return { c, state, api, calls, $ };
}

test('packages share ordinary opening and Save As offers storage formats, not editing modes', () => {
  assert.doesNotMatch(html, /data-action="(?:open-editable-bundle|import-textbundle)"/);
  assert.doesNotMatch(html, /id="(?:editableBundleDialog|textBundleImportDialog)"/);
  assert.match(html, /data-export-format="markdown-assets"/);
  for (const format of ['markdown', 'textbundle', 'textpack']) assert.ok(html.includes(`data-save-format="${format}"`));
  for (const api of ['OpenFile', 'SaveDocumentAsFormat', 'SaveBundleDocument', 'ResumeBundleDocument', 'RebaseBundleDocument']) {
    assert.ok(bridge.includes('Backend.' + api), api);
  }
  assert.match(source, /bundleKind: state\.currentFile\.bundleKind/);
  assert.match(source, /bundleSessionId: state\.currentFile\.bundleSessionId/);
});

test('manual and automatic package saves use the original path, exact revision and opaque session', async () => {
  for (const auto of [false, true]) {
    const { c, state, calls } = harness();
    await c.saveDocument(false, { auto });
    assert.deepEqual(calls.find(x => x[0] === 'write-package'), ['write-package', '/notes.textpack', 'local', revision, 'session-a']);
    assert.equal(state.currentFile.bundleKind, 'textpack');
    assert.equal(state.currentFile.path, '/notes.textpack');
    assert.equal(state.dirty, false);
  }
});

test('format bridge preserves opaque package contents and validates conversion receipts', async () => {
  const calls = [];
  const c = vm.createContext({desktopRuntime: true, prepareTextPackExport, crypto: {randomUUID: () => 'test-id'},
    Backend: {SaveDocumentAsFormat: async (...args) => {calls.push(args); return {path:'/copy.'+args[3], content:args[5]};}}});
  vm.runInContext(bridge.slice(bridge.indexOf('async function saveDocumentAsFormat('), bridge.indexOf('window.quilliteMarkdown =')), c);
  const complex = '<picture><source srcset="assets/a.png 2x"><img src="assets/a.png"></picture>';
  const packed = await c.saveDocumentAsFormat('/original.textpack', complex, 'session-a', 'textbundle');
  assert.equal(packed.content, complex);
  assert.equal(calls[0][2], 'session-a');
  assert.equal(calls[0][3], 'textbundle');
  assert.equal(calls[0][4].length, 0, 'complete package copies do not rescan or discard opaque resources');
  const source = '![photo](original.png)';
  const markdown = await c.saveDocumentAsFormat('/ordinary.txt', source, '', 'markdown');
  assert.equal(markdown.sourceContent, source);
  assert.match(markdown.content, /assets\/quillite-test-id\/image-001.png/);
  assert.equal(markdown.rebaseContent(source), markdown.content);
  assert.throws(() => markdown.rebaseContent(source+' edited'), error => error.copyPath === '/copy.markdown');
  const writes = calls.length;
  await assert.rejects(c.saveDocumentAsFormat('/ordinary.txt', '![x](smb://host/private.png)', '', 'markdown'), /CONVERSION_INCOMPLETE/);
  assert.equal(calls.length, writes, 'unsafe conversion stops before writing a broken placeholder copy');
  c.Backend.SaveDocumentAsFormat = async () => ({path:'/unexpected.md',content:'external text'});
  await assert.rejects(c.saveDocumentAsFormat('/ordinary.txt', source, '', 'markdown'), /receipt mismatch/);
});

test('format-copy cancellation and late-copy adoption preserve the active unsaved document', async () => {
  const h = harness();
  h.c.chooseSaveDocumentFormat = async () => null;
  await h.c.saveDocument(true);
  assert.equal(h.state.currentFile.path, '/notes.textpack');
  assert.equal(h.state.dirty, true);
  assert.ok(!h.calls.some(x => x[0] === 'copy-package'));
  h.c.chooseSaveDocumentFormat = async () => 'markdown';
  h.api.saveDocumentAsFormat = async () => { const error = Error('DOCUMENT_COPY_EDITOR_CHANGED');error.copyPath='/safe/copy.md';throw error; };
  await h.c.saveDocument(true);
  assert.equal(h.state.currentFile.content, 'local');
  assert.equal(h.state.dirty, true);
  assert.ok(h.calls.some(x => x[0] === 'toast' && x[1] === 'documentCopyRetained'));
});

test('conversion failures report retained copies without pausing or marking the untouched source dirty', async () => {
  for (const [error, key] of [
    ['TEXTPACK_COPY_FAILED: incomplete copy retained at /copies/incomplete.md', 'documentPartialCopy'],
    ['BUNDLE_COPY_SAVED: complete copy retained at /copies/complete.textpack', 'documentCopyOpenFailed'],
    ['DOCUMENT_FORMAT_EXTENSION', 'documentFormatExtension'],
    ['TEXTPACK_CONVERSION_INCOMPLETE: MISSING_IMAGE', 'documentConversionIncomplete'],
    ['TEXTPACK_EXISTS', 'copyExists']
  ]) {
    const h = harness(); h.state.dirty = false;
    h.api.saveDocumentAsFormat = async () => {throw Error(error);};
    await h.c.saveDocument(true);
    assert.equal(h.state.currentFile.path, '/notes.textpack');
    assert.equal(h.state.dirty, false);
    assert.equal(h.state.saveAsRequired, false);
    assert.ok(h.calls.some(call => call[0] === 'toast' && call[1] === key));
    assert.ok(!h.state.documentConflict);
  }
});

test('new text typed during a package save retains dirty state and recovery scheduling', async () => {
  const { c, state, api, calls } = harness(), pending = deferred(), started = deferred();
  api.saveBundleDocument = () => { started.resolve(); return pending.promise; };
  const saving = c.saveDocument();
  await started.promise;
  state.currentFile.content = 'typed during save';
  pending.resolve(document({ content: 'local', revision: diskRevision }));
  await saving;
  assert.equal(state.currentFile.content, 'typed during save');
  assert.equal(state.savedContent, 'local');
  assert.equal(state.dirty, true);
  assert.ok(calls.some(x => x[0] === 'backup'));
});

test('package failures pause autosave without falling back to an ordinary Markdown copy', async () => {
  const { c, state, api, calls } = harness();
  let attempts = 0;
  api.saveBundleDocument = async (...args) => {
    if (++attempts === 1) throw Error('TEXTBUNDLE_SAVE_FAILED');
    return document({ content: args[1] });
  };
  await c.saveDocument(false, { auto: true });
  assert.equal(state.saveAsRequired, true);
  assert.equal(state.dirty, true);
  await c.saveDocument(false, { auto: true });
  assert.equal(attempts, 1);
  await c.saveDocument();
  assert.equal(attempts, 2, 'explicit Save retries the package, not Save As');
  assert.equal(state.saveAsRequired, false);
  assert.ok(calls.some(x => x[0] === 'toast' && x[1] === 'bundleSaveFailed'));
});

test('Save As and conflict copies preserve the package session instead of rebasing Markdown assets', async () => {
  for (const conflict of [false, true]) {
    const { c, state, calls } = harness();
    if (conflict) state.documentConflict = { session: 1 };
    await c.saveDocument(true);
    assert.deepEqual(calls.find(x => x[0] === 'copy-package'), ['copy-package', '/notes.textpack', 'local', 'session-a']);
    assert.equal(state.currentFile.path, '/copy.textpack');
    assert.equal(state.currentFile.bundleSessionId, 'copy-session');
  }
});

test('late package receipts cannot replace another session, even after reopening the same path', async () => {
  const { c, state, api } = harness(), pending = deferred();
  api.saveBundleDocument = () => pending.promise;
  const saving = c.saveDocument();
  state.documentSession++;
  state.currentFile = document({ content: 'reopened text', bundleSessionId: 'reopened-session' });
  pending.resolve(document({ content: 'local', bundleSessionId: 'old-write-session' }));
  await saving;
  assert.equal(state.currentFile.content, 'reopened text');
  assert.equal(state.currentFile.bundleSessionId, 'reopened-session');
  assert.equal(state.dirty, true);
});

test('package revision conflicts retain the buffer and prohibit automatic writes', async () => {
  const { c, state, api } = harness();
  let writes = 0;
  api.saveBundleDocument = async () => { writes++; throw Error('DOCUMENT_CONFLICT: package metadata changed'); };
  await c.saveDocument(false, { auto: true });
  assert.equal(state.currentFile.content, 'local');
  assert.ok(state.documentConflict);
  await c.saveDocument(false, { auto: true });
  assert.equal(writes, 1);
});

test('choosing disk adopts its whole package workspace and network policy, not only Markdown/revision', async () => {
  const { c, state } = harness();
  state.documentConflict = { session: 1, draft: null };
  await c.openDocumentConflict();
  c.useConflictDisk();
  assert.equal(state.currentFile.content, 'disk');
  assert.equal(state.currentFile.bundleSessionId, 'disk-session');
  assert.equal(state.currentFile.directory, '/owned/disk');
  assert.equal(state.currentFile.resourcePath, '/owned/disk/text.md');
  assert.equal(state.currentFile.revision, diskRevision);
  assert.equal(state.blockImportedRemoteImages, true);
  assert.equal(state.dirty, false);
});

test('a manual package merge adopts a verified merged asset baseline before allowing original-package Save', async () => {
  const { c, state, calls, $ } = harness();
  state.documentConflict = { session: 1, draft: null };
  await c.openDocumentConflict(); c.startConflictMerge();
  $('#documentConflictMerge').value = 'manual merge';
  await c.applyConflictMerge();
  assert.deepEqual(calls.find(x => x[0] === 'rebase-package'), ['rebase-package', 'session-a', 'disk-session', diskRevision]);
  assert.equal(state.currentFile.content, 'manual merge');
  assert.equal(state.currentFile.bundleSessionId, 'rebased-session');
  assert.equal(state.currentFile.directory, '/owned/rebased');
  assert.equal(state.documentConflict.mergedRevision, diskRevision);
  await c.openDocumentConflict(); // The UI reopens comparison before offering Save merged version.
  await c.saveConflictMerge();
  assert.deepEqual(calls.find(x => x[0] === 'write-package'), ['write-package', '/notes.textpack', 'manual merge', diskRevision, 'rebased-session']);
});

test('a stale asynchronous package rebase cannot overwrite new text or approve an old merge', async () => {
  const { c, state, api, $ } = harness(), pending = deferred();
  state.documentConflict = { session: 1, draft: null };
  await c.openDocumentConflict(); c.startConflictMerge();
  $('#documentConflictMerge').value = 'obsolete merge';
  api.rebaseBundleDocument = () => pending.promise;
  const merging = c.applyConflictMerge();
  state.currentFile.content = 'new text during rebase';
  pending.resolve(document({ revision: diskRevision, bundleSessionId: 'unused-session' }));
  await merging;
  assert.equal(state.currentFile.content, 'new text during rebase');
  assert.equal(state.currentFile.bundleSessionId, 'session-a');
  assert.notEqual(state.documentConflict.mergedRevision, diskRevision);
});

function recoveryHarness(snapshot, result) {
  const { c, state, api, calls } = harness();
  state.currentFile = null; state.dirty = false; state.editing = false;
  Object.assign(c, {
    pendingRecoverySnapshot: snapshot, recoveryRestoreRequest: 0, lastRecoveryContent: '', lastRecoveryContext: '',
    beginDocumentOpen: () => ({ id: ++state.documentOpenRequest, session: state.documentSession, content: state.currentFile?.content }),
    setRecoveryBusy() {}, closeRecoveryDialog() {},
    displayDocument: doc => { state.currentFile = doc; state.documentSession++; },
    toggleEditor: async () => { state.editing = true; }
  });
  api.readFile = async () => { throw Error('ordinary source read must not recover a package workspace'); };
  api.newFile = async () => { calls.push(['ordinary-draft']); throw Error('must not create a text-only draft'); };
  api.resumeBundleDocument = async (...args) => {
    calls.push(['resume-package', ...args]);
    if (result instanceof Error) throw result;
    return result;
  };
  vm.runInContext(section('async function restoreRecoverySnapshot(', 'function closeDocumentHistory('), c);
  return { c, state, api, calls };
}

test('package crash recovery resumes its trusted persisted workspace and preserves source revision/conflict', async () => {
  for (const conflict of [false, true]) {
    const snapshot = { path: '/notes.textpack', content: 'crash buffer with new image', baseRevision: revision,
      bundleKind: 'textpack', bundleSessionId: 'session-a' };
    const h = recoveryHarness(snapshot, document({ content: 'baseline', bundleConflict: conflict }));
    await h.c.restoreRecoverySnapshot();
    assert.deepEqual(h.calls.find(x => x[0] === 'resume-package'), ['resume-package', snapshot.path, 'session-a', revision]);
    assert.equal(h.state.currentFile.content, snapshot.content);
    assert.equal(h.state.currentFile.bundleSessionId, 'session-a');
    assert.equal(h.state.currentFile.resourcePath, '/owned/session-a/text.md');
    assert.equal(h.state.currentFile.revision, revision);
    assert.equal(Boolean(h.state.documentConflict), conflict);
    assert.equal(h.state.dirty, true);
    assert.ok(!h.calls.some(x => x[0] === 'ordinary-draft'));
  }
});

test('missing or legacy package recovery state fails closed without dropping assets into an ordinary draft', async () => {
  for (const snapshot of [
    { path: '/notes.textpack', content: 'legacy buffer', baseRevision: revision },
    { path: '/notes.textbundle', content: 'crash buffer', baseRevision: revision, bundleKind: 'textbundle', bundleSessionId: 'missing-session' }
  ]) {
    const h = recoveryHarness(snapshot, Error('BUNDLE_SESSION_MISSING'));
    await h.c.restoreRecoverySnapshot();
    assert.equal(h.state.currentFile, null);
    assert.equal(h.c.pendingRecoverySnapshot, snapshot);
    assert.ok(!h.calls.some(x => x[0] === 'ordinary-draft' || x[0] === 'clear-backup'));
    assert.ok(h.calls.some(x => x[0] === 'toast' && x[1] === 'bundleRecoveryFailed'));
  }
});

function queueHarness() {
  const h = harness();
  Object.assign(h.c, { lastRecoveryContent: '', lastRecoveryContext: '' });
  vm.runInContext(section('function cancelScheduledRecoverySnapshot(', 'function maybeDiscardChanges('), h.c);
  return h;
}

test('package Save is blocked when its pre-save recovery snapshot fails', async () => {
  const { c, state, calls } = harness();
  c.flushBundleRecoverySnapshot = async () => { throw Error('recovery disk full'); };
  await c.saveDocument();
  assert.ok(!calls.some(x => x[0] === 'write-package' || x[0] === 'copy-package'));
  assert.equal(state.dirty, true);
  assert.equal(state.saveAsRequired, true);
});

test('a changed editor buffer during pre-save recovery flush never commits an obsolete package snapshot', async () => {
  const { c, state, calls } = harness(), pending = deferred();
  c.flushBundleRecoverySnapshot = () => pending.promise;
  const saving = c.saveDocument();
  state.currentFile.content = 'new buffer during recovery flush';
  pending.resolve(true);
  await saving;
  assert.ok(!calls.some(x => x[0] === 'write-package' || x[0] === 'copy-package'));
  assert.equal(state.currentFile.content, 'new buffer during recovery flush');
  assert.equal(state.dirty, true);
});

test('recovery writes serialize and skip obsolete queued buffers rather than overwriting newer recovery', async () => {
  const { c, state, api } = queueHarness(), first = deferred(), writes = [];
  api.saveRecoverySnapshot = async snapshot => {
    writes.push(snapshot.content);
    if (snapshot.content === 'local') await first.promise;
  };
  const snapshot = content => ({ path: state.currentFile.path, content, baseRevision: revision,
    conflict: false, bundleKind: 'textpack', bundleSessionId: 'session-a' });
  const a = c.persistCurrentRecoverySnapshot(snapshot('local'), state.documentSession);
  await Promise.resolve();
  state.currentFile.content = 'obsolete queued buffer';
  const b = c.persistCurrentRecoverySnapshot(snapshot(state.currentFile.content), state.documentSession);
  state.currentFile.content = 'latest buffer';
  const latest = c.persistCurrentRecoverySnapshot(snapshot(state.currentFile.content), state.documentSession);
  first.resolve();
  assert.equal(await a, true);
  assert.equal(await b, false);
  assert.equal(await latest, true);
  assert.deepEqual(writes, ['local', 'latest buffer']);
});

test('partial directory saves report changed attachments and pause automatic saving without clearing recovery', async () => {
  const { c, state, api, calls } = harness();
  api.saveBundleDocument = async () => { throw Error('BUNDLE_PARTIAL_SAVE: DOCUMENT_CONFLICT before Markdown commit'); };
  await c.saveDocument(false, { auto: true });
  assert.equal(state.currentFile.content, 'local');
  assert.equal(state.dirty, true);
  assert.equal(state.saveAsRequired, true);
  assert.ok(state.documentConflict);
  assert.equal(state.documentConflict.disk, null, 'partial-save reporting must precede generic conflict handling');
  assert.ok(calls.some(x => x[0] === 'toast' && x[1] === 'bundlePartialSave'));
  assert.ok(!calls.some(x => x[0] === 'clear-backup'));
});

test('a successful write with failed session persistence warns even for autosave and retains recovery', async () => {
  const { c, state, api, calls } = harness();
  let writes = 0;
  api.saveBundleDocument = async (...args) => {
    writes++;
    return document({ content: args[1], revision: diskRevision, warning: 'BUNDLE_SESSION_PERSIST_WARNING' });
  };
  const saved = await c.saveDocument(false, { auto: true });
  assert.equal(saved.content, 'local');
  assert.equal(state.savedContent, 'local');
  assert.equal(state.currentFile.revision, diskRevision);
  assert.equal(state.dirty, false, 'confirmed committed text must not be falsely reported as unsaved');
  assert.equal(state.saveAsRequired, true);
  assert.ok(calls.some(x => x[0] === 'toast' && x[1] === 'bundleSessionPersistWarning'));
  assert.ok(!calls.some(x => x[0] === 'clear-backup'));
  await c.saveDocument();
  await c.saveDocument(false, { auto: true });
  assert.equal(writes, 1, 'reopen is required before another write to the original package');
  await c.saveDocument(true);
  assert.equal(state.currentFile.path, '/copy.textpack', 'a complete copy is still available for recovery');
});

test('an old recovery write completion cannot clear a successful-write session-warning backup', async () => {
  const { c, state, api } = queueHarness(), pending = deferred(), started = deferred();
  let timer, clears = 0;
  c.setTimeout = callback => { timer = callback; return 1; };
  api.saveRecoverySnapshot = async () => { started.resolve(); await pending.promise; };
  api.clearRecoverySnapshot = async () => { clears++; };
  c.scheduleRecoverySnapshot({ recoveryDelay: 0 });
  const saving = timer();
  await started.promise;
  state.currentFile = document({ revision: diskRevision, warning: 'BUNDLE_SESSION_PERSIST_WARNING' });
  state.savedContent = 'local'; state.dirty = false;
  pending.resolve();
  await saving;
  assert.equal(clears, 0);
  assert.equal(c.lastRecoveryContent, '', 'old completion must not acknowledge an outdated baseline');
});

test('original-package Pandoc formats are blocked before permission prompts while ordinary Markdown remains supported', async () => {
  for (const format of ['epub', 'rtf', 'odt', 'latex', 'mediawiki', 'custom']) {
    const h = harness(), messages = [], calls = [];
    Object.assign(h.c, {
      PANDOC_EXPORT_FORMATS: new Set(['epub', 'rtf', 'odt', 'latex', 'mediawiki', 'custom']),
      readExportDraft: () => ({ format }), setExportInProgress: value => { h.state.exportInProgress = value; },
      showToast: (...args) => messages.push(args), closeExportCenter: () => calls.push('close'),
      allowImportedResourcesForRendering: () => { calls.push('permission'); return true; },
      refreshPandocStatus: async () => { calls.push('detect'); }
    });
    h.c.els.exportCenterStatus = {};
    h.state.blockImportedRemoteImages = true;
    h.state.pandocStatus = { available: true, path: '/usr/bin/pandoc' };
    h.api.exportWithPandoc = async input => { calls.push(input); return '/output.epub'; };
    vm.runInContext(section('async function performExportCenter(', 'function openPDFTutorial('), h.c);
    await h.c.performExportCenter();
    assert.deepEqual(calls, []);
    assert.equal(messages[0][0], 'bundlePandocUnsupported');
    assert.equal(h.state.exportInProgress, false);
    h.state.currentFile = { path: '/ordinary.md', name: 'ordinary.md', content: 'ordinary' };
    h.state.blockImportedRemoteImages = false;
    await h.c.performExportCenter();
    assert.equal(calls[0].sourcePath, '/ordinary.md');
    assert.equal(calls[0].format, format);
    assert.ok(calls.includes('close'));
  }
});
