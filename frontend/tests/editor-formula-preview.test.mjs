import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { EditorState, Compartment } from '@codemirror/state';
import { history, undo, redo, undoDepth } from '@codemirror/commands';
import { editorFormulaField, formulaPreviewContext, toggleFormulaSource, refreshFormulaPreviews, setFormulaDisplay,
  editSelectedEquation, deleteRenderedEquation, editorFormulaItems, FORMULA_PREVIEW_DOCUMENT_LIMIT, formulaPreviewPhrases } from '../src/editor-formula-preview.js';
const create = (doc, context = {}) => EditorState.create({ doc, extensions: [history(), editorFormulaField, formulaPreviewContext.of(context)] });
function fakeView(state) { const view = { state, focus() {} }; view.dispatch = spec => { view.state = spec.state || view.state.update(spec).state; }; return view; }

test('formula actions stay attached to each equation without the duplicate floating button', async () => {
  const html = await readFile(new URL('../index.html', import.meta.url), 'utf8');
  const renderer = await readFile(new URL('../src/renderer.js', import.meta.url), 'utf8');
  const source = await readFile(new URL('../src/editor-formula-preview.js', import.meta.url), 'utf8');
  const styles = await readFile(new URL('../src/styles.css', import.meta.url), 'utf8');
  assert.doesNotMatch(html + renderer, /editFormulaButton|activeFormulaMatch/);
  assert.match(html, /id="editFlowchartButton"/);
  assert.match(renderer, /if \(!els\.editFlowchartButton \|\| !codeEditor \|\| !state\.editing\)/);
  assert.match(source, /for \(const action of \['edit', 'source'\]\)/);
  assert.match(source, /root\.ondblclick =/);
  assert.match(source, /event\.key === 'Enter'/);
  assert.match(styles, /\.cm-formula-tools \{[^}]*display: none;/);
  assert.match(styles, /\.cm-formula-render:hover \.cm-formula-tools, \.cm-formula-render:focus-within \.cm-formula-tools \{ display: inline-flex;/);
});

test('rendered equations preserve exact Markdown, chemistry and numbering in the editor document', () => {
  const source = 'before $\\ce{H2SO4}$ after\n\n$$\nx^2 \\tag{A}\n$$';
  const state = create(source), field = state.field(editorFormulaField);
  assert.equal(state.doc.toString(), source);
  assert.equal(field.atoms.size, 2);
  assert.equal(field.items[0].templateId, 'chem-custom');
  assert.equal(field.items[1].mode, 'numbered');
  assert.match(field.items[1].html, /katex/);
  assert.equal(undoDepth(state), 0);
});
test('invalid, code, escaped and author HTML equations do not hide their source', () => {
  const source = '$\\frac{$\n\n`$x$`\n\n```tex\n$x$\n```\n\n\\$x$\n\n<span class="math-inline">fake</span>';
  const field = create(source).field(editorFormulaField);
  assert.equal(field.items.length, 1);
  assert.equal(field.atoms.size, 0);
  assert.equal(field.items[0].html, null);
});
test('source toggles, selections and global display preference do not change text or history', () => {
  let state = create('$x$ and $y$');
  state = state.update({ effects: toggleFormulaSource.of({ from: 0, to: 3 }) }).state;
  assert.equal(state.field(editorFormulaField).atoms.size, 1);
  assert.equal(state.doc.toString(), '$x$ and $y$');
  state = state.update({ effects: toggleFormulaSource.of({ from: 0, to: 3 }), selection: { anchor: 1 } }).state;
  assert.equal(state.field(editorFormulaField).items[0].open, true);
  state = state.update({ effects: setFormulaDisplay.of('source') }).state;
  assert.equal(state.field(editorFormulaField).decorations.size, 0);
  state = state.update({ effects: setFormulaDisplay.of('preview'), selection: { anchor: 0 } }).state;
  assert.equal(state.field(editorFormulaField).atoms.size, 2);
  assert.equal(undoDepth(state), 0);
});
test('formula deletion is one undoable change and stale widgets cannot delete other text', () => {
  const view = fakeView(create('before $x$ after')), doc = view.state.doc;
  const item = view.state.field(editorFormulaField).items[0];
  assert.equal(deleteRenderedEquation(view, item, doc), true);
  assert.equal(view.state.doc.toString(), 'before  after');
  assert.equal(deleteRenderedEquation(view, item, doc), false);
  undo(view);
  assert.equal(view.state.doc.toString(), 'before $x$ after');
  assert.equal(view.state.field(editorFormulaField).atoms.size, 1);
  redo(view);
  assert.equal(view.state.doc.toString(), 'before  after');
});
test('Enter opens only an exactly selected rendered formula, never neighboring text', () => {
  const edited = [], view = fakeView(create('before $x$ after', { edit: item => edited.push(item.raw) }));
  assert.equal(editSelectedEquation(view), false);
  view.dispatch({ selection: { anchor: 7, head: 10 } });
  assert.equal(editSelectedEquation(view), true);
  assert.deepEqual(edited, ['$x$']);
  view.dispatch({ selection: { anchor: 6, head: 10 } });
  assert.equal(editSelectedEquation(view), false);
});
test('edits invalidate touched previews; refresh ignores stale documents and maps source-open ranges', () => {
  let state = create('$x$ and $y$'), old = state.doc;
  state = state.update({ effects: toggleFormulaSource.of({ from: 0, to: 3 }) }).state;
  state = state.update({ changes: { from: 2, insert: '^2' } }).state;
  assert.equal(state.field(editorFormulaField).items.length, 1);
  const transaction = state.update({ effects: refreshFormulaPreviews.of({ doc: old, items: editorFormulaItems(old) }) });
  state = transaction.state;
  assert.equal(state.field(editorFormulaField).items.length, 1);
  state = state.update({ effects: refreshFormulaPreviews.of({ doc: state.doc, items: editorFormulaItems(state.doc) }) }).state;
  assert.equal(state.field(editorFormulaField).items[0].open, true);
  assert.equal(state.field(editorFormulaField).items[0].raw, '$x^2$');
  assert.equal(state.doc.toString(), '$x^2$ and $y$');
});
test('language reconfiguration preserves content, open source and undo', () => {
  const language = new Compartment();
  let state = EditorState.create({ doc: '$x$', extensions: [history(), editorFormulaField, language.of(EditorState.phrases.of({})), formulaPreviewContext.of({})] });
  state = state.update({ effects: toggleFormulaSource.of({ from: 0, to: 3 }) }).state;
  state = state.update({ effects: language.reconfigure(EditorState.phrases.of(formulaPreviewPhrases)) }).state;
  assert.equal(state.field(editorFormulaField).items[0].open, true);
  assert.equal(state.doc.toString(), '$x$');
  assert.equal(undoDepth(state), 0);
});
test('readonly, source-only and large documents preserve source and cannot delete widgets', () => {
  const source = 'x'.repeat(FORMULA_PREVIEW_DOCUMENT_LIMIT) + ' $x$';
  assert.equal(create(source).field(editorFormulaField).decorations.size, 0);
  const state = create('$x$', { enabled: false });
  assert.equal(state.field(editorFormulaField).atoms.size, 0);
  const view = fakeView(EditorState.create({ doc: '$x$', extensions: [editorFormulaField, EditorState.readOnly.of(true)] }));
  assert.equal(deleteRenderedEquation(view, view.state.field(editorFormulaField).items[0], view.state.doc), false);
  assert.equal(view.state.doc.toString(), '$x$');
});
test('large embedded images do not disable formulas before or after the image', () => {
  const payload = 'A'.repeat(FORMULA_PREVIEW_DOCUMENT_LIMIT);
  const source = `$x$\n\n![photo](data:image/png;base64,${payload})\n\n$y$`;
  const state = create(source), field = state.field(editorFormulaField);
  assert.equal(field.items.length, 2);
  assert.deepEqual(field.items.map(item => item.raw), ['$x$', '$y$']);
  assert.equal(field.atoms.size, 2);
  for (const item of field.items) assert.equal(state.doc.sliceString(item.from, item.to), item.raw);
  assert.equal(state.doc.toString(), source);
});
test('quote/list/table formulas keep source offsets and bounded previews', () => {
  for (const source of ['> $$\n> x\n> $$', '- $x$\n- $y$', '| $x$ | $y$ |\n| --- | --- |']) {
    const state = create(source);
    for (const item of state.field(editorFormulaField).items) assert.equal(state.doc.sliceString(item.from, item.to), item.raw);
    assert.equal(state.doc.toString(), source);
  }
  assert.equal(create(Array(300).fill('$x$').join(' ')).field(editorFormulaField).items.length, 256);
});

test('deep Markdown initialization, refresh and display toggles retain editable source', () => {
  for (const source of ['> '.repeat(4000) + '$x$', '  '.repeat(4000) + '- $x$']) {
    let state = create(source);
    assert.equal(state.doc.toString(), source);
    assert.equal(state.field(editorFormulaField).items.length, 0);
    state = state.update({ effects: setFormulaDisplay.of('source') }).state;
    state = state.update({ effects: setFormulaDisplay.of('preview') }).state;
    assert.equal(state.doc.toString(), source);
    state = state.update({ changes: { from: state.doc.length, insert: ' tail' } }).state;
    state = state.update({ effects: refreshFormulaPreviews.of({ doc: state.doc, items: editorFormulaItems(state.doc) }) }).state;
    const view = fakeView(state);
    assert.ok(undo(view));
    assert.equal(view.state.doc.toString(), source);
    assert.ok(redo(view));
    assert.equal(view.state.doc.toString(), source + ' tail');
  }
});

test('valid katex-error text and comments render without hiding original source', () => {
  for (const source of ['$\\text{katex-error}$', '$$\nx% katex-error\n+y\n$$']) {
    const state = create(source);
    assert.equal(state.field(editorFormulaField).atoms.size, 1);
    assert.ok(state.field(editorFormulaField).items[0].html);
    assert.equal(state.doc.toString(), source);
  }
});

test('existing invalid inline tags retain source instead of silently rendering as display equations', () => {
  const source = '$x\\tag{A}$';
  const state = create(source), field = state.field(editorFormulaField);
  assert.equal(field.items[0].mode, 'inline');
  assert.equal(field.items[0].previewExpression, 'x\\tag{A}');
  assert.equal(field.items[0].html, null);
  assert.equal(field.atoms.size, 0);
  assert.equal(state.doc.toString(), source);
});
