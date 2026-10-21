import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import test from 'node:test';

const source = await readFile(new URL('../src/renderer.js', import.meta.url), 'utf8');
const html = await readFile(new URL('../index.html', import.meta.url), 'utf8');
const css = await readFile(new URL('../src/styles.css', import.meta.url), 'utf8');

test('editor header reflows whole controls instead of compressing their labels', () => {
  assert.match(css, /\.editor-header\s*\{[^}]*flex:\s*0 0 auto;[^}]*flex-wrap:\s*wrap;/);
  assert.match(css, /\.editor-header > div:first-child\s*\{[^}]*flex:\s*1 1 200px;[^}]*max-width:\s*100%;/);
  assert.match(css, /\.editor-status\s*\{[^}]*flex-wrap:\s*wrap;[^}]*max-width:\s*100%;/);
  assert.match(css, /\.editor-status > \*\s*\{[^}]*flex-shrink:\s*0;[^}]*white-space:\s*nowrap;/);
  assert.match(css, /\.editor-header \.document-location-button\s*\{[^}]*max-width:\s*100%;/);
});

test('all split resize paths use fitted bounds and preserve window-independent preference', () => {
  assert.match(source, /paneResizeObserver\.observe\(els.editorView\)/);
  assert.match(source, /const startPercent = currentEditorPreviewPercent\(\)/);
  assert.match(source, /setEditorPreviewWidth\(currentEditorPreviewPercent\(\) \+ change, true\)/);
  assert.match(source, /userResize \? \(effectiveChanged \? fitted.percent : state.editorPreviewWidth\) : percent/);
  assert.match(source, /contentMinimum = state.editing \? \(state.editorLayout === 'editor-only' \? 360 : 547\) : 240/);
  for (const name of ['aria-valuemin','aria-valuemax','aria-valuenow']) assert.ok(source.includes(`setAttribute('${name}'`));
});

test('diagram search uses the same panel gutter as category buttons and templates', () => {
  assert.match(css, /\.formula-template-panel\s*\{[^}]*padding:\s*14px/);
  assert.match(css, /\.diagram-search\s*\{[^}]*min-width:\s*0;\s*padding:\s*0 0 10px;/);
  assert.match(css, /\.diagram-search input,[^{]*\{[^}]*width:\s*100%;[^}]*box-sizing:\s*border-box/);
  assert.match(html, /class="diagram-search"[\s\S]*?id="diagramCategoryTabs"/);
});
const functions = source.slice(source.indexOf('function normalizeEditorLayout('), source.indexOf('function syncDocumentWidthOptions('));

function harness(saved = null) {
  const storage = new Map(saved ? [['editorLayout', saved]] : []);
  const current = {};
  const buttons = ['preview-left', 'editor-left', 'editor-only'].map(editorLayout => ({
    dataset: { editorLayout }, classList: { toggle() {} },
    setAttribute(name, value) { this[name] = value; },
  }));
  const editor = { state: { field() { return null; } }, requestMeasure() {}, dispatch() {}, focus() {}, content: '# Draft', selection: [2, 5], undo: ['# Original'] };
  const context = vm.createContext({
    state: { editorPreviewWidth: 47, dirty: true, reviewResults: ['suggestion'] },
    document: { body: { dataset: {} }, querySelectorAll: selector => selector === '[data-editor-presentation]' ? [] : buttons },
    localStorage: { setItem: (key, value) => storage.set(key, value) },
    $: () => current, t: key => key, showToast() {},
    codeEditor: editor, scheduleFormatToolbarLayout() {}, schedulePaneWidthRefresh() {},
    updatePaneResizerVisibility() {}, suspendEditorPreview() {}, renderEditorPreview() {}, editorContent: () => editor.content,
    editorPresentation: { reconfigure: extensions => extensions }, editorPresentationExtensions: () => [],
    editorFormulaField: {}, editorHasComposition: view => !!(view?.compositionStarted || view?.composing),
  });
  vm.runInContext(functions, context);
  context.setEditorLayout(context.normalizeEditorLayout(storage.get('editorLayout')), true);
  return { context, storage, buttons, editor, current };
}

test('mode switching leaves the first native composition key untouched',()=>{
 const h=harness();h.editor.compositionStarted=true;
 const before=JSON.stringify(h.context.state);
 h.context.setEditorPresentation('source');assert.equal(JSON.stringify(h.context.state),before);
 assert.equal(h.storage.has('editorPresentation'),false);
});

test('editor layout defaults safely and restores the saved orientation', () => {
  for (const value of [undefined, null, '', 'invalid', 'preview-left']) {
    assert.equal(harness(value).context.state.editorLayout, 'preview-left');
  }
  assert.equal(harness('editor-left').context.document.body.dataset.editorLayout, 'editor-left');
  assert.match(source, /editorLayout: normalizeEditorLayout\(localStorage.getItem\('editorLayout'\)\)/);
  assert.match(source, /setEditorLayout\(state.editorLayout, true\)/);
});

test('swapping persists selection without changing the document or editor session', () => {
  const { context, storage, buttons, editor, current } = harness();
  const before = JSON.stringify(editor);
  context.setEditorLayout('editor-left');
  assert.equal(storage.get('editorLayout'), 'editor-left');
  assert.equal(buttons[1]['aria-checked'], 'true');
  assert.equal(buttons[0]['aria-checked'], 'false');
  assert.equal(current.textContent, 'editorOnLeft');
  assert.equal(JSON.stringify(editor), before);
  assert.equal(context.state.editorPreviewWidth, 47);
  assert.equal(context.state.dirty, true);
  assert.deepEqual(context.state.reviewResults, ['suggestion']);
  context.setEditorLayout('preview-left');
  assert.equal(buttons[0]['aria-checked'], 'true');
});

test('divider movement follows the physical direction in both layouts', () => {
  const { context } = harness();
  assert.equal(context.editorResizeDirection(), 1);
  context.setEditorLayout('editor-left');
  assert.equal(context.editorResizeDirection(), -1);
  assert.match(source, /deltaPercent = .*editorResizeDirection\(\)/);
  assert.match(source, /const change = \(event.key === 'ArrowRight' \? 2 : -2\) \* editorResizeDirection\(\)/);
});

test('editor-only persists, suspends preview and restores fresh split content without resetting edits', () => {
  const { context, storage, buttons, editor, current } = harness();
  context.state.editing = true; context.state.currentFile = { path: 'draft.md' };
  const calls = [];
  context.suspendEditorPreview = () => calls.push('pause');
  context.renderEditorPreview = text => calls.push(text);
  const before = JSON.stringify(editor);
  context.setEditorLayout('editor-only');
  assert.equal(storage.get('editorLayout'), 'editor-only');
  assert.equal(buttons[2]['aria-checked'], 'true');
  assert.equal(current.textContent, 'editorOnly');
  context.setEditorLayout('editor-left');
  assert.deepEqual(calls, ['pause', '# Draft']);
  assert.equal(JSON.stringify(editor), before);
  assert.equal(harness('editor-only').context.state.editorLayout, 'editor-only');
});

test('explicit mode actions hide or restore preview while manual visibility stays independent', () => {
  for (const layout of ['editor-left', 'preview-left']) {
    const {context, storage, editor} = harness(layout);
    context.state.editing=true; context.state.currentFile={path:'draft.md'};
    const before=JSON.stringify(editor), calls=[];
    context.suspendEditorPreview=()=>calls.push('pause');
    context.renderEditorPreview=text=>calls.push(text);
    context.setEditorPresentation('live');
    assert.equal(context.state.editorLayout,'editor-only');
    assert.equal(context.state.lastSplitLayout,layout);
    assert.equal(storage.get('editorPresentation'),'live');
    assert.equal(storage.get('formulaDisplay'),'preview');
    context.setEditorLayout(layout); // Explicit restore does not change mode.
    assert.equal(context.state.editorPresentation,'live');
    context.syncEditorLayoutOptions();
    assert.equal(context.state.editorLayout,layout);
    context.setEditorPresentation('live'); // Re-click applies its default again.
    assert.equal(context.state.editorLayout,'editor-only');
    context.setEditorPresentation('source');
    assert.equal(context.state.editorLayout,layout);
    context.setEditorLayout('editor-only');
    assert.equal(context.state.editorPresentation,'source');
    context.syncEditorLayoutOptions();
    assert.equal(context.state.editorLayout,'editor-only');
    context.setEditorPresentation('source');
    assert.equal(context.state.editorLayout,layout);
    assert.equal(storage.get('editorLayout'),layout);
    assert.equal(JSON.stringify(editor),before);
    assert.deepEqual(calls,['pause','# Draft','pause','# Draft','pause','# Draft']);
  }
});

test('IME composition blocks both mode and automatic layout changes', () => {
  const {context,storage,editor}=harness('editor-left');
  context.state.editorPresentation='source'; editor.composing=true;
  context.setEditorPresentation('live');
  assert.equal(context.state.editorPresentation,'source');
  assert.equal(context.state.editorLayout,'editor-left');
  assert.equal(storage.has('editorPresentation'),false);
});

test('editor-only guards scheduled, direct and cursor rendering and explicitly refreshes exports', () => {
  for (const name of ['scheduleEditorPreview', 'renderEditorPreview', 'scrollPreviewToCursor']) {
    const start = source.indexOf(`function ${name}(`);
    const body = source.slice(start, source.indexOf('\nfunction ', start + 1));
    assert.match(body, /state\.editorLayout === 'editor-only'/);
  }
  assert.match(source, /cancelMermaidRendering\(els\.editorPreview\)/);
  assert.match(source, /releaseEChartsDiagrams\(els\.editorPreview\)/);
  assert.match(source, /await renderMarkdownTo\(container, state\.currentFile, editorContent\(\)\)/);
  assert.match(html, /id="hideLivePreviewButton"[^>]*data-i18n-aria-label="hideLivePreview"/);
  assert.match(html, /role="menuitemradio" data-editor-layout="editor-only"/);
});

test('restore preview control is editor-only, ordered after Save As, and remembers the split orientation', () => {
  const { context, storage } = harness();
  for (const layout of ['editor-left', 'preview-left']) {
    context.setEditorLayout(layout);
    context.setEditorLayout('editor-only');
    assert.equal(context.state.lastSplitLayout, layout);
    assert.equal(storage.get('lastSplitLayout'), layout);
  }
  assert.match(html, /id="saveAsButton"[^\n]+\n\s*<button id="restoreLivePreviewButton"[^\n]+\n\s*<button id="exitEditButton"/);
  assert.match(css, /#restoreLivePreviewButton \{ display: none; \}/);
  assert.match(css, /body\[data-editor-layout="editor-only"\] #restoreLivePreviewButton \{ display: inline-flex;/);
  assert.match(source, /\$\('#restoreLivePreviewButton'\)\.addEventListener\('click', \(\) => \{\s*setEditorLayout\(state.lastSplitLayout === 'editor-left' \? 'editor-left' : 'preview-left'\);\s*focusCodeEditor\(\);/);
});

test('both controls are accessible and narrow screens retain the editor', () => {
  assert.match(html, /id="swapEditorLayoutButton"[^>]*data-i18n-aria-label="swapEditorLayout"/);
  assert.match(html, /role="menuitemradio" data-editor-layout="editor-left"/);
  assert.match(source, /syncDocumentWidthOptions\(\);\s*syncEditorLayoutOptions\(\);/);
  assert.match(css, /body\[data-editor-layout="editor-left"\] \.editor-view \{ flex-direction: row-reverse; \}/);
  assert.match(css, /\.editor-preview-pane, \.editor-resizer \{ display: none; \}/);
  assert.doesNotMatch(source, /右键定位到右侧编辑器/);
});
