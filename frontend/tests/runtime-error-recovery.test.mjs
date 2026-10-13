import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import vm from 'node:vm';
import { guardFileDropResolver } from '../src/safe-file-drop.js';
import { isMissingDocumentError } from '../src/library-state.js';
import { createRuntimeDiagnostics } from '../src/runtime-diagnostics.js';

const source = await readFile(new URL('../src/renderer.js', import.meta.url), 'utf8');
const between = (start, end) => source.slice(source.indexOf(start), source.indexOf(end, source.indexOf(start)));
const file = name => ({ name, arrayBuffer() {} });

test('native drop filters missing/string items and preserves first real file and coordinates', () => {
  let args;
  const runtime = { ResolveFilePaths(...values) { assert.equal(this, runtime); args = values; } };
  guardFileDropResolver(runtime, () => assert.fail('unavailable'));
  runtime.ResolveFilePaths(12, 34, [undefined, null, 'text', file('real.md'), file('second.md')]);
  assert.equal(args[0], 12); assert.equal(args[1], 34);
  assert.deepEqual(args[2].map(f => f.name), ['real.md']);
  args = null; runtime.ResolveFilePaths(0, 0, [undefined]); assert.equal(args, null);
});

test('virtual File path failure is handled once without inventing a disk path', () => {
  const virtual = file('virtual.png'), error = new TypeError('additional File object is not a file on the disk');
  let failures = 0;
  const runtime = { ResolveFilePaths() { throw error; } };
  guardFileDropResolver(runtime, (input, failure) => { failures++; assert.equal(input, virtual); assert.equal(failure, error); });
  assert.doesNotThrow(() => runtime.ResolveFilePaths(1, 2, [virtual]));
  assert.equal(failures, 1);
  assert.doesNotThrow(() => guardFileDropResolver({}));
});

function documentHarness(bridge) {
  let request = 0;
  const notices = [], displayed = [], edits = [];
  const context = vm.createContext({
    window: { quilliteMarkdown: bridge }, state: { documentSession: 0 },
    beginDocumentOpen: () => ++request, canApplyDocumentOpen: id => id === request,
    maybeDiscardChanges: () => true, setSidebarMode() {},
    displayDocument: doc => { displayed.push(doc); context.state.documentSession++; },
    toggleEditor: mode => edits.push(mode), reportSilentError() {},
    t: key => key, showToast: message => notices.push(message), isMissingDocumentError,
  });
  vm.runInContext(between('async function openFolder()', 'async function openReferenceDocument(')
    + between('async function loadInitialDocument()', 'async function initialize()'), context);
  return { context, notices, displayed, edits, supersede: () => { request++; context.state.documentSession++; } };
}

test('missing startup document is contained; a newer open request wins', async () => {
  const h = documentHarness({ getInitialFile: async () => { throw new Error('open file: The file does not exist.'); } });
  await h.context.loadInitialDocument();
  assert.deepEqual(h.notices, ['recentMissingTitle']); assert.equal(h.displayed.length, 0);
  let resolve;
  h.context.window.quilliteMarkdown.getInitialFile = () => new Promise(r => { resolve = r; });
  const pending = h.context.loadInitialDocument(); h.supersede(); resolve({ path: 'old.md' }); await pending;
  assert.equal(h.displayed.length, 0);
});

test('startup edit mode cannot switch a newer document into editing', async () => {
  let resolve, entered;
  const ready = new Promise(r => { entered = r; });
  const h = documentHarness({ getInitialFile: async () => ({ path: 'first.md' }), getStartupMode: () => new Promise(r => { resolve = r; entered(); }) });
  const pending = h.context.loadInitialDocument(); await ready; h.supersede(); resolve('edit'); await pending;
  assert.equal(h.displayed.length, 1); assert.equal(h.edits.length, 0);
});

test('folder selection and first-file failures do not become unhandled promises', async () => {
  const h = documentHarness({ openFolder: async () => { throw new Error('permission denied'); } });
  await h.context.openFolder(); assert.deepEqual(h.notices, ['folderOpenFailed']);
  h.context.window.quilliteMarkdown = { openFolder: async () => ({ root: 'folder', files: [{ path: 'gone.md' }] }), readFile: async () => { throw new Error('The file does not exist.'); } };
  await h.context.openFolder(); assert.equal(h.notices.at(-1), 'recentMissingTitle'); assert.equal(h.displayed.length, 0);
});

test('failed editor mount clears the rejection and retries without changing document content', async () => {
  const doc = { content: 'Keep my original document' };
  const failure = new Error('Failed to load editor module');
  let cleanups = 0, mounts = 0;
  class EditorView {
    static exceptionSink = { of() {} };
    static theme() {} static updateListener = { of() {} }; static decorations = { from() {} };
    constructor() { if (++mounts === 1) throw failure; this.contentDOM = { addEventListener() {} }; }
  }
  const context = vm.createContext({
    runtimeDiagnostics: createRuntimeDiagnostics(''),
    codeEditor: null, editorInitializationPromise: null, editorExtensions: null, editorSourceFallback: false,
    loadEditorDependencies: async () => {}, keymap: { of() {} }, EditorView,
    basicSetup: [], spellcheckDecorationField: {}, spellcheckViewPlugin: {}, scrollPastEnd() {}, createEditorState() {},
    els: { editor: { replaceChildren() { cleanups++; }, addEventListener() {} } },
    state: { currentFile: doc }, handleEditorPaste() {}, openEditorClipboardMenu() {},
  });
  vm.runInContext(between('async function initializeCodeEditor()', 'function slugify('), context);
  await assert.rejects(context.initializeCodeEditor(), /Failed to load/);
  assert.match(context.runtimeDiagnostics.format(failure), /stage=view mode=normal/);
  assert.equal(context.editorInitializationPromise, null); assert.equal(cleanups, 1);
  assert.ok(await context.initializeCodeEditor()); assert.equal(mounts, 2);
  assert.equal(doc.content, 'Keep my original document');
  context.codeEditor = null;
  context.editorInitializationPromise = null;
  context.editorSourceFallback = true;
  const dependencyFailure = new Error('dependency failure');
  context.loadEditorDependencies = async () => { throw dependencyFailure; };
  await assert.rejects(context.initializeCodeEditor(), /dependency failure/);
  assert.match(context.runtimeDiagnostics.format(dependencyFailure), /stage=dependencies mode=normal/);
});

test('reported isEmpty mount failure falls back once to source editing without changing preferences or text', async () => {
  const doc = { content: '# Original\n$y=x$' };
  let mounts = 0, recovered = false;
  class EditorView {
    static exceptionSink = { of() {} };
    static theme() {} static updateListener = { of() {} }; static decorations = { from() { return 'spelling-facet'; } };
    constructor() { if (++mounts === 1) throw new TypeError("Cannot read properties of undefined (reading 'isEmpty')"); this.contentDOM = { addEventListener() {} }; }
  }
  const context = vm.createContext({
    runtimeDiagnostics: createRuntimeDiagnostics(''),
    codeEditor: null, editorInitializationPromise: null, editorExtensions: null, editorSourceFallback: false,
    loadEditorDependencies: async () => {}, keymap: { of() {} }, EditorView,
    basicSetup: [], spellcheckDecorationField: 'spelling-field', spellcheckViewPlugin: 'spelling-plugin', scrollPastEnd() {}, createEditorState() {},
    els: { editor: { replaceChildren() {}, addEventListener() {} } },
    state: { currentFile: doc, formulaDisplay: 'preview', diagramDisplay: 'preview' }, handleEditorPaste() {}, openEditorClipboardMenu() {},
    reportSilentError() {}, t: key => key, showToast: message => { recovered = message === 'editorSourceRecovery'; },
  });
  vm.runInContext(between('async function initializeCodeEditor()', 'function slugify('), context);
  assert.ok(await context.initializeCodeEditor()); assert.equal(mounts, 2); assert.ok(recovered);
  assert.equal(context.editorSourceFallback, true);
  assert.ok(!context.editorExtensions.includes('spelling-facet'));
  assert.equal(context.state.formulaDisplay, 'preview'); assert.equal(context.state.diagramDisplay, 'preview');
  assert.equal(doc.content, '# Original\n$y=x$');
  assert.match(source, /const language = editorSourceFallback \|\| isPlainTextFile/);
});
