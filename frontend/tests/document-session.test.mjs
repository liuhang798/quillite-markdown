import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';

const source = readFileSync(new URL('../src/renderer.js', import.meta.url), 'utf8');
const saveSource = source.slice(source.indexOf('async function saveDocument('), source.indexOf('function exportPreviewContainer('));
function deferred() {
  let resolve, reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
function harness() {
  const write = deferred();
  const state = { documentSession: 1, currentFile: { path: '/a.md', content: 'old' }, editing: true, dirty: true, recentFiles: [] };
  const calls = [];
  const context = vm.createContext({
    state, els: { editorFileName: {}, editorSaveState: {} },
    window: { quilliteMarkdown: { saveFile: () => write.promise, saveAs: () => { calls.push('saveAs'); return write.promise; } } },
    editorContent: () => state.currentFile.content,
    addRecentDocument: () => calls.push('recent'), refreshLibraryAfterReplacement: async () => {},
    syncDocumentAccessControls() {}, renderCurrentDocument() {},
    renderEditorPreview: content => calls.push(['preview', content]), renderFileList() {},
    setDirty: value => { state.dirty = value; }, pathIsInsideRoot: () => false,
    t: key => key, showToast: key => calls.push(key), reportSilentError() {}, console: { error() {} },
    setTimeout: callback => { context.timer = callback; }, clearTimeout() {},
  });
  vm.runInContext(saveSource, context);
  return { write, state, context, calls };
}

test('late save never replaces a new document, including reopening the same path', async () => {
  for (const path of ['/b.md', '/a.md']) {
    const { context, state, write, calls } = harness();
    const saving = context.saveDocument();
    state.documentSession++;
    state.currentFile = { path, content: 'new unsaved document' };
    write.resolve({ path: '/a.md', content: 'old', name: 'a.md' });
    await saving;
    assert.equal(state.currentFile.content, 'new unsaved document');
    assert.equal(state.dirty, true);
    assert.equal(state.saving, false);
    assert.deepEqual(calls, []);
  }
});

test('late save cannot reopen a closed preview or show save-as prompts for another document', async () => {
  for (const fail of [false, true]) {
    const { context, state, write, calls } = harness();
    const saving = context.saveDocument();
    state.documentSession++;
    state.currentFile = null;
    state.dirty = false;
    if (fail) write.reject(new Error('write denied'));
    else write.resolve({ path: '/a.md', content: 'old' });
    await saving;
    assert.equal(state.currentFile, null);
    assert.equal(state.dirty, false);
    assert.equal(state.saveAsRequired, undefined);
    assert.deepEqual(calls, []);
  }
});

test('edits during save remain dirty after leaving edit mode', async () => {
  const { context, state, write } = harness();
  const saving = context.saveDocument();
  state.currentFile.content = 'new text';
  state.editing = false;
  write.resolve({ path: '/a.md', content: 'old', name: 'a.md' });
  await saving;
  assert.equal(state.currentFile.content, 'new text');
  assert.equal(state.savedContent, 'old');
  assert.equal(state.dirty, true);
});

test('a successful unchanged save acknowledges its snapshot', async () => {
  const { context, state, write } = harness();
  const saving = context.saveDocument();
  write.resolve({ path: '/a.md', content: 'old', name: 'a.md' });
  await saving;
  assert.equal(state.savedContent, 'old');
  assert.equal(state.dirty, false);
});

test('library refresh cannot overwrite edits or the next document save status', async () => {
  const { context, state, write } = harness();
  const refresh = deferred();
  context.refreshLibraryAfterReplacement = () => refresh.promise;
  const saving = context.saveDocument(false, { auto: true });
  write.resolve({ path: '/a.md', content: 'old', name: 'a.md' });
  await Promise.resolve();
  await Promise.resolve();
  state.documentSession++;
  state.currentFile = { path: '/b.md', content: 'new' };
  state.dirty = true;
  context.els.editorSaveState.textContent = 'unsaved';
  refresh.resolve();
  await saving;
  assert.equal(state.currentFile.path, '/b.md');
  assert.equal(state.dirty, true);
  assert.equal(context.els.editorSaveState.textContent, 'unsaved');
});

test('delayed auto-saved label stays within its document session', async () => {
  const { context, state, write } = harness();
  const saving = context.saveDocument(false, { auto: true });
  write.resolve({ path: '/a.md', content: 'old', name: 'a.md' });
  await saving;
  assert.equal(context.els.editorSaveState.textContent, 'autoSaved');
  state.documentSession++;
  context.els.editorSaveState.textContent = 'different document';
  context.timer();
  assert.equal(context.els.editorSaveState.textContent, 'different document');
});

test('AI replacement rejects matching text from another document session', () => {
  let applied = false;
  const context = vm.createContext({
    state: { documentSession: 2, editing: true },
    aiRewriteSelection: { documentSession: 1, from: 0, to: 3, markdown: 'old', mode: 'replace' },
    codeEditor: { state: { doc: { sliceString: () => 'old', length: 3 } }, dispatch: () => { applied = true; } },
    els: { aiRewriteStatus: {}, aiResultText: { value: 'new' } }, t: key => key,
  });
  vm.runInContext(source.slice(source.indexOf('function replaceWithAIResult('), source.indexOf('function aiReviewCategoryLabel(')), context);
  context.replaceWithAIResult();
  assert.equal(applied, false);
  assert.equal(context.els.aiRewriteStatus.textContent, 'aiSelectionChanged');
});

test('AI generation inserts its result at the captured cursor position', () => {
  let transaction;
  let closed = false;
  let toast;
  const context = vm.createContext({
    state: { documentSession: 3, editing: true },
    aiRewriteSelection: { documentSession: 3, from: 5, to: 5, markdown: '', mode: 'insert' },
    aiRewriteDiffSegments: [],
    codeEditor: { state: { doc: { sliceString: () => '', length: 10 } }, dispatch: value => { transaction = value; } },
    els: { aiRewriteStatus: {}, aiResultText: { value: 'generated text' } },
    changedAITextSegments: () => [], applyAITextDiff: () => '',
    closeAIRewrite: () => { closed = true; },
    showToast: (...args) => { toast = args; },
    t: key => key,
  });
  vm.runInContext(source.slice(source.indexOf('function replaceWithAIResult('), source.indexOf('function aiReviewCategoryLabel(')), context);
  context.replaceWithAIResult();
  assert.deepEqual(JSON.parse(JSON.stringify(transaction.changes)), { from: 5, to: 5, insert: 'generated text' });
  assert.deepEqual(JSON.parse(JSON.stringify(transaction.selection)), { anchor: 19 });
  assert.equal(transaction.userEvent, 'input.ai');
  assert.equal(closed, true);
  assert.deepEqual(JSON.parse(JSON.stringify(toast)), ['aiContentInserted', 'success', 3600]);
});

test('each AI toolbar command selects one dedicated workflow without an action picker', async () => {
  const calls = [];
  const context = vm.createContext({
    state: { documentSession: 7, editing: true },
    codeEditor: {
      state: {
        selection: { main: { head: 8 } },
        doc: { sliceString: () => 'context' }
      }
    },
    closeAIToolbarMenu: () => calls.push(['close']),
    openAIDocumentReview: async () => calls.push(['proofread']),
    openAIRewrite: async (...args) => calls.push(['rewrite', ...args]),
    currentAIEditContext: () => ({ documentSession: 7, from: 1, to: 5, markdown: 'text', mode: 'replace' }),
    showToast: (...args) => calls.push(['toast', ...args]),
    focusCodeEditor: () => calls.push(['focus']),
    t: key => key,
  });
  vm.runInContext(source.slice(source.indexOf('async function runAIToolbarAction('), source.indexOf('async function openAIDocumentSummary(')), context);

  await context.runAIToolbarAction('proofread');
  assert.deepEqual(calls.splice(0).map(item => JSON.parse(JSON.stringify(item))), [['close'], ['proofread']]);

  await context.runAIToolbarAction('generate');
  let call = calls.splice(0).map(item => JSON.parse(JSON.stringify(item)));
  assert.equal(call[1][0], 'rewrite');
  assert.deepEqual(call[1][1], { documentSession: 7, from: 8, to: 8, markdown: '', dialogTitleKey: 'aiGenerateDialogTitle', tool: 'generate', mode: 'insert' });
  assert.equal(call[1][2], 'custom');

  await context.runAIToolbarAction('continue');
  call = calls.splice(0).map(item => JSON.parse(JSON.stringify(item)));
  assert.deepEqual(call[1][1], { documentSession: 7, from: 8, to: 8, markdown: '', promptText: 'context', dialogTitleKey: 'aiContinueDialogTitle', tool: 'continue', mode: 'insert' });
  assert.equal(call[1][2], 'custom');
  assert.equal(call[1][3], 'aiContinueInstruction');

  const expected = {
    edit: ['polish', 'aiRewriteTitle'],
    translate: ['translate', 'aiTranslateDialogTitle'],
    concise: ['concise', 'aiConciseDialogTitle'],
    expand: ['expand', 'aiExpandDialogTitle'],
    custom: ['custom', 'aiCustomDialogTitle'],
  };
  for (const [tool, [action, titleKey]] of Object.entries(expected)) {
    await context.runAIToolbarAction(tool);
    call = calls.splice(0).map(item => JSON.parse(JSON.stringify(item)));
    assert.equal(call[1][0], 'rewrite');
    assert.equal(call[1][1].tool, tool);
    assert.equal(call[1][1].dialogTitleKey, titleKey);
    assert.equal(call[1][1].mode, 'replace');
    assert.equal(call[1][2], action);
  }
});

test('selection-based AI tools do not silently become document generators', async () => {
  const calls = [];
  const context = vm.createContext({
    state: { documentSession: 2, editing: true },
    codeEditor: { state: { selection: { main: { head: 0 } }, doc: { sliceString: () => '' } } },
    closeAIToolbarMenu() {}, openAIDocumentReview: async () => {}, openAIRewrite: async () => calls.push('rewrite'),
    currentAIEditContext: () => ({ documentSession: 2, from: 0, to: 0, markdown: '', mode: 'insert' }),
    showToast: key => calls.push(key), focusCodeEditor: () => calls.push('focus'), t: key => key,
  });
  vm.runInContext(source.slice(source.indexOf('async function runAIToolbarAction('), source.indexOf('async function openAIDocumentSummary(')), context);
  for (const tool of ['edit', 'translate', 'concise', 'expand', 'custom']) {
    calls.length = 0;
    await context.runAIToolbarAction(tool);
    assert.deepEqual(calls, ['aiNeedSelection', 'focus']);
  }
});

test('saving a reference copy restores editable controls and its visible path', async () => {
  const { context, state, write } = harness();
  state.editing = false;
  state.currentFile.readOnly = true;
  const classes = new Set(['reference-document']);
  context.els.documentView = { classList: { toggle: (name, on) => on ? classes.add(name) : classes.delete(name) } };
  context.els.editButton = {};
  context.els.saveButton = {};
  let renderedPath;
  context.renderCurrentDocument = () => { renderedPath = state.currentFile.path; };
  vm.runInContext(source.slice(source.indexOf('function syncDocumentAccessControls('), source.indexOf('function displayDocument(')), context);
  const saving = context.saveDocument(true);
  write.resolve({ path: '/copy.md', name: 'copy.md', content: 'old' });
  await saving;
  assert.equal(context.els.editButton.disabled, false);
  assert.equal(context.els.saveButton.disabled, false);
  assert.equal(classes.has('reference-document'), false);
  assert.equal(renderedPath, '/copy.md');
});

test('a late write permission result cannot open a dialog on another document', async () => {
  const permission = deferred();
  let opened = false;
  const context = vm.createContext({
    state: { currentFile: { path: '/a.md' }, editing: false, documentSession: 1 },
    editorModeSwitching: false,
    els: { editButton: {}, editorSaveState: {} },
    window: { quilliteMarkdown: { canEditFile: () => permission.promise } },
    openEditPermissionDialog: () => { opened = true; },
    t: key => key,
  });
  vm.runInContext(source.slice(source.indexOf('async function toggleEditor('), source.indexOf('async function saveDocument(')), context);
  const opening = context.toggleEditor(true);
  context.state.documentSession++;
  context.state.currentFile = { path: '/b.md' };
  permission.resolve(false);
  await opening;
  assert.equal(opened, false);
  assert.equal(context.state.saveAsRequired, undefined);
  assert.equal(context.state.editing, false);
});

test('document opening follows the latest request and rechecks newly typed content', () => {
  let confirmed = 0;
  const context = vm.createContext({
    state: { documentOpenRequest: 0, documentSession: 1, currentFile: { content: 'original' } },
    maybeDiscardChanges: () => { confirmed++; return false; },
  });
  vm.runInContext(source.slice(source.indexOf('function beginDocumentOpen('), source.indexOf('function syncDocumentAccessControls(')), context);
  const first = context.beginDocumentOpen();
  const second = context.beginDocumentOpen();
  assert.equal(context.canApplyDocumentOpen(first), false);
  assert.equal(context.canApplyDocumentOpen(second), true);
  context.state.currentFile.content = 'new edits';
  assert.equal(context.canApplyDocumentOpen(second), false);
  assert.equal(confirmed, 1);
  context.state.documentSession++;
  assert.equal(context.canApplyDocumentOpen(second), false);
  assert.equal(confirmed, 1);
});
