import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import test from 'node:test';

const source = await readFile(new URL('../src/renderer.js', import.meta.url), 'utf8');
const html = await readFile(new URL('../index.html', import.meta.url), 'utf8');
const css = await readFile(new URL('../src/styles.css', import.meta.url), 'utf8');
const functions = source.slice(source.indexOf('function normalizeEditorLayout('), source.indexOf('function syncDocumentWidthOptions('));

function harness(saved = null) {
  const storage = new Map(saved ? [['editorLayout', saved]] : []);
  const current = {};
  const buttons = ['preview-left', 'editor-left', 'editor-only'].map(editorLayout => ({
    dataset: { editorLayout }, classList: { toggle() {} },
    setAttribute(name, value) { this[name] = value; },
  }));
  const editor = { requestMeasure() {}, content: '# Draft', selection: [2, 5], undo: ['# Original'] };
  const context = vm.createContext({
    state: { editorPreviewWidth: 47, dirty: true, reviewResults: ['suggestion'] },
    document: { body: { dataset: {} }, querySelectorAll: () => buttons },
    localStorage: { setItem: (key, value) => storage.set(key, value) },
    $: () => current, t: key => key, showToast() {},
    codeEditor: editor, scheduleFormatToolbarLayout() {},
    updatePaneResizerVisibility() {}, suspendEditorPreview() {}, renderEditorPreview() {}, editorContent: () => editor.content,
  });
  vm.runInContext(functions, context);
  context.setEditorLayout(context.normalizeEditorLayout(storage.get('editorLayout')), true);
  return { context, storage, buttons, editor, current };
}

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
