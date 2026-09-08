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
  const buttons = ['preview-left', 'editor-left'].map(editorLayout => ({
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

test('both controls are accessible and narrow screens retain the editor', () => {
  assert.match(html, /id="swapEditorLayoutButton"[^>]*data-i18n-aria-label="swapEditorLayout"/);
  assert.match(html, /role="menuitemradio" data-editor-layout="editor-left"/);
  assert.match(source, /syncDocumentWidthOptions\(\);\s*syncEditorLayoutOptions\(\);/);
  assert.match(css, /body\[data-editor-layout="editor-left"\] \.editor-view \{ flex-direction: row-reverse; \}/);
  assert.match(css, /\.editor-preview-pane, \.editor-resizer \{ display: none; \}/);
  assert.doesNotMatch(source, /右键定位到右侧编辑器/);
});
