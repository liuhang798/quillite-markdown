import test from 'node:test';
import assert from 'node:assert/strict';
import { EditorState, EditorSelection } from '@codemirror/state';
import { history, undo, redo } from '@codemirror/commands';
import { editorLivePreview, liveSourceBlock, buildLivePlan, handleCrossBlockTextInput } from '../src/editor-live-preview.js';
import { crossSelectionField } from '../src/editable-cross-selection.js';
import { extendEditableSelection, extendPointerSelection } from '../src/live-editable-block.js';
import { editableForwardedChange, registerEditableOwner } from '../src/editable-owner.js';
import {findMarkdownTables} from '../src/table-designer.js';

const source = '前文\n\n```text\nABC\nDEF\n```\n\n后文\n\n结束';
const create = (doc, anchor, head) => EditorState.create({ doc, selection: { anchor, head }, extensions: [history(), editorLivePreview] });
const replace = (state, insert = '', extra = {}) => state.update({ changes: { from: state.selection.main.from, to: state.selection.main.to, insert }, userEvent: insert ? 'input.type' : 'delete.selection', ...extra });

test('forward partial code deletion retains closing fence without adding blank lines', () => {
  const state = create(source, source.indexOf('F'), source.indexOf('后文') + 2);
  const next = replace(state).state;
  assert.equal(next.doc.toString(), source.replace('DEF', 'DE').replace('后文\n\n', ''));
  assert.equal(buildLivePlan(next.doc.toString()).widgets.filter(item => item.kind === 'code').length, 1);
});
test('reverse partial code selection preserves opening fence and paragraph separation', () => {
  const state = create(source, source.indexOf('B'), 1), next = replace(state).state;
  assert.equal(next.doc.toString(), '前\n\n```text\nBC\nDEF\n```\n\n后文\n\n结束');
});
test('typing into a cross-block selection replaces only selected content', () => {
  const next = replace(create(source, source.indexOf('F'), source.indexOf('后文') + 1), '新').state;
  assert.equal(next.doc.toString(), '前文\n\n```text\nABC\nDE新\n```\n\n文\n\n结束');
  assert.equal(next.selection.main.head, source.indexOf('F') + 1);
});
test('fully selected blocks and whole documents are removable', () => {
  const item = buildLivePlan(source).widgets.find(item => item.kind === 'code');
  assert.equal(replace(create(source, item.from, item.to)).state.doc.toString(), source.slice(0, item.from) + source.slice(item.to));
  assert.equal(replace(create(source, 0, source.length)).state.doc.length, 0);
});
test('cross-cell deletion clears text while retaining table syntax', () => {
  const doc = '| 名称 | 数量 |\n| --- | --- |\n| 中文 | 20 |\n\n后文';
  const next = replace(create(doc, doc.indexOf('文'), doc.indexOf('20') + 1)).state.doc.toString();
  assert.equal(next, doc.replace('中文 | 20', '中 | 0'));
  assert.equal(buildLivePlan(next).widgets[0].kind, 'table');
});

test('partial table deletion retains owned widths, exact cell offsets and shared undo',()=>{
  for(const [intro,prefix] of [['',''],['','> '],['- item\n\n','  '],['> - item\n>\n','>   ']]) {
    const doc='before\n\n'+intro+['<!-- quillite-table-widths: 310, 190 -->','| A | B |','| --- | --- |','| Cell | D |'].map(line=>prefix+line).join('\n')+'\n\nafter';
    const item=buildLivePlan(doc).widgets.find(w=>w.kind==='table');
    assert.equal(item.from,doc.indexOf('<!--'));assert.equal(item.raw,doc.slice(item.from,item.to));
    assert.deepEqual(item.cells.map(c=>doc.slice(c.from,c.to)),['A','B','Cell','D']);
    for(const reverse of [false,true]) {
      const at=doc.indexOf('Cell')+1;
      const view={state:create(doc,reverse?at:0,reverse?0:at)};
      view.dispatch=tr=>{view.state=tr.state||view.state.update(tr).state;};
      view.dispatch(replace(view.state));const next=view.state.doc.toString();
      const table=findMarkdownTables(next)[0];assert.equal(table.hasWidthMetadata,true);assert.deepEqual(table.model.widths,[310,190]);
      assert.deepEqual(table.model.cells,[['',''],['ell','D']]);
      assert.ok(undo(view));assert.equal(view.state.doc.toString(),doc);
      assert.ok(redo(view));assert.equal(view.state.doc.toString(),next);
    }
  }
});

test('whole table removal includes owned metadata, while explicit source editing remains literal',()=>{
  const doc='before\n\n<!-- quillite-table-widths: 310, 190 -->\n| A | B |\n| --- | --- |\n| C | D |\n\nafter';
  const item=buildLivePlan(doc).widgets.find(w=>w.kind==='table');
  assert.equal(replace(create(doc,item.from,item.to)).state.doc.toString(),doc.slice(0,item.from)+doc.slice(item.to));
  const from=doc.indexOf('before'),to=doc.indexOf('C |')+1;
  const state=create(doc,from,to).update({effects:liveSourceBlock.of(item.from)}).state;
  assert.equal(replace(state).state.doc.toString(),doc.slice(to));
});
test('cross-cell paste keeps literal pipes and newlines inside the starting cell', () => {
  const doc = '| 名称 | 数量 |\n| --- | --- |\n| 中文 | 20 |\n\n后文';
  const next = replace(create(doc, doc.indexOf('文'), doc.indexOf('20') + 1), 'A|B\nC', { userEvent: 'input.paste' }).state.doc.toString();
  assert.equal(next, doc.replace('中文 | 20', '中A\\|B C | 0'));
  assert.equal(buildLivePlan(next).widgets[0].cells.length, 4);
});
test('summary cross-field replacement encodes tags and keeps the title single-line', () => {
  const doc = '<details>\n<summary>标题</summary>\n\n正文\n\n</details>';
  const next = replace(create(doc, doc.indexOf('题'), doc.indexOf('正文') + 1), '<x>\nY').state.doc.toString();
  assert.equal(next, '<details>\n<summary>标&lt;x&gt; Y</summary>\n\n文\n\n</details>');
});
test('nested code and details retain each partially selected wrapper', () => {
  const doc = '<details open>\n<summary>标题</summary>\n\n```text\nABC\n```\n\n内部后文\n\n</details>\n\n后文';
  const next = replace(create(doc, doc.indexOf('B'), doc.lastIndexOf('后文') + 1)).state.doc.toString();
  assert.equal(next, '<details open>\n<summary>标题</summary>\n\n```text\nA\n```\n\n\n\n</details>\n\n文');
  assert.equal(buildLivePlan(next).widgets[0].kind, 'details');
});
test('comment partial deletion retains comment markers', () => {
  const doc = '<!--备注内容-->\n\n后文';
  assert.equal(replace(create(doc, doc.indexOf('内'), doc.length)).state.doc.toString(), '<!--备注-->\n\n');
});
test('explicit source editing and forwarded inner transactions remain literal', () => {
  const from = source.indexOf('F'), to = source.indexOf('后文') + 1;
  const literal = source.slice(0, from) + source.slice(to);
  let state = create(source, from, to);
  state = state.update({ effects: liveSourceBlock.of(source.indexOf('```')) }).state;
  assert.equal(replace(state).state.doc.toString(), literal);
  assert.equal(replace(create(source, from, to), '', { annotations: editableForwardedChange.of(true) }).state.doc.toString(), literal);
  assert.equal(replace(create(source, from, to), '', { userEvent: 'input.ai-review' }).state.doc.toString(), literal);
});
test('protected replacement remains a single undo/redo step with exact source recovery', () => {
  const view = { state: create(source, source.indexOf('F'), source.indexOf('后文') + 2) };
  view.dispatch = tr => { view.state = tr.state || view.state.update(tr).state; };
  view.dispatch(replace(view.state, '替换'));
  const edited = view.state.doc.toString();
  assert.equal(undo(view), true); assert.equal(view.state.doc.toString(), source);
  assert.equal(view.state.field(crossSelectionField), true);
  assert.equal(redo(view), true); assert.equal(view.state.doc.toString(), edited);
});
test('native DOM selection cannot overwrite the logical cross-block anchor', () => {
  const state = create(source, source.indexOf('F'), source.indexOf('后文') + 2);
  const next = state.update({ selection: { anchor: source.indexOf('```', 6) + 3, head: state.selection.main.head }, userEvent: 'select' }).state;
  assert.equal(next.selection.main.anchor, state.selection.main.anchor);
});
test('keyboard selection commands remain available while a cross-block range is active', () => {
  const state = create(source, source.indexOf('F'), source.indexOf('后文'));
  const next = state.update({ selection: { anchor: state.selection.main.anchor, head: source.length }, userEvent: 'select', scrollIntoView: true }).state;
  assert.equal(next.selection.main.head, source.length);
});
test('native character replacement consumes only actual beforeinput data', () => {
  const view = { state: create(source, source.indexOf('F'), source.indexOf('后文') + 2), composing: false };
  view.dispatch = tr => { view.state = view.state.update(tr).state; };
  let prevented = false;
  assert.equal(handleCrossBlockTextInput({ data: 'x', inputType: 'insertText', cancelable: true, preventDefault() { prevented = true; } }, view), true);
  assert.equal(prevented, true);
  assert.equal(view.state.doc.toString(), source.replace('DEF', 'DEx').replace('后文\n\n', ''));
});
test('composition and uncancelable input are never hijacked by the cross-selection handler', () => {
  for (const extra of [{ isComposing: true }, { compositionStarted: true }, { cancelable: false }, { inputType: 'insertCompositionText' }]) {
    const view = { state: create(source, source.indexOf('F'), source.indexOf('后文') + 2), compositionStarted:!!extra.compositionStarted, dispatch() { assert.fail('must not dispatch'); } };
    assert.equal(handleCrossBlockTextInput({ data: '字', inputType: 'insertText', cancelable: true, ...extra, preventDefault() { assert.fail('must not cancel'); } }, view), false);
  }
});
test('extending at the end of an inner projection falls through to its parent boundary handler', () => {
  const view = { state: create('BODY', 1, 4), dom: { querySelectorAll: () => [] }, moveVertically: cursor => cursor,
    dispatch() { assert.fail('must leave the unchanged boundary for the parent handler'); } };
  assert.equal(extendEditableSelection(view, 1, true), false);
});

test('pointer and ordinary keyboard cross-field selections activate protected character input', () => {
  for (const userEvent of ['select.pointer', 'select']) {
    const initial = create(source, source.indexOf('F'), source.indexOf('F'));
    const state = initial.update({ selection: { anchor: source.indexOf('F'), head: source.indexOf('后文') + 2 }, userEvent, scrollIntoView: true }).state;
    assert.equal(state.field(crossSelectionField), true);
    const view = { state, dispatch(spec) { view.state = view.state.update(spec).state; } };
    assert.equal(handleCrossBlockTextInput({ data: 'x', inputType: 'insertText', cancelable: true, preventDefault() {} }, view), true);
    assert.equal(view.state.doc.toString(), source.replace('DEF', 'DEx').replace('后文\n\n', ''));
  }
});

test('subsequent pointer selection is not discarded as native observer drift', () => {
  const initial = create(source, source.indexOf('F'), source.indexOf('后文') + 2);
  const next = initial.update({ selection: { anchor: initial.selection.main.anchor, head: 1 }, userEvent: 'select.pointer' }).state;
  assert.equal(next.selection.main.head, 1); assert.equal(next.field(crossSelectionField), true);
});

test('selection contained within a field or explicit source does not activate cross-field input', () => {
  const initial = create(source, 0, 0);
  const local = initial.update({ selection: { anchor: source.indexOf('A'), head: source.indexOf('C') }, userEvent: 'select.pointer' }).state;
  assert.equal(local.field(crossSelectionField), false);
  const block = buildLivePlan(source).widgets.find(item => item.kind === 'code');
  const explicit = initial.update({ effects: liveSourceBlock.of(block.from), selection: { anchor: source.indexOf('F') } }).state.update({
    selection: { anchor: source.indexOf('F'), head: source.length }, userEvent: 'select.pointer' }).state;
  assert.equal(explicit.field(crossSelectionField), false);
});

test('Shift pointer entry maps nested coordinates and preserves the main document anchor', () => {
  const parent = { state: create(source, source.indexOf('后文') + 2, source.indexOf('后文') + 2), focus() {},
    dispatch(spec) { parent.state = parent.state.update(spec).state; } };
  const middle = { state: EditorState.create({ doc: source.slice(5) }) };
  const inner = { state: EditorState.create({ doc: 'ABC\nDEF' }), posAtCoords: () => 2 };
  const unregisterMiddle = registerEditableOwner(middle, parent, () => ({ from: 5, to: source.length }), () => true);
  const start = source.indexOf('ABC');
  const unregisterInner = registerEditableOwner(inner, middle, () => ({ from: start - 5, to: start + 7 - 5 }), () => true);
  let prevented = false;
  assert.equal(extendPointerSelection({ shiftKey: true, button: 0, clientX: 10, clientY: 10, preventDefault() { prevented = true; } }, inner), true);
  assert.ok(prevented); assert.equal(parent.state.selection.main.anchor, source.indexOf('后文') + 2);
  assert.equal(parent.state.selection.main.head, start + 2); assert.equal(parent.state.field(crossSelectionField), true);
  unregisterInner(); unregisterMiddle();
});

test('pointer extension leaves ordinary local selection, composition and invalid coordinates alone', () => {
  const parent = { state: create(source, source.indexOf('A'), source.indexOf('B')), dispatch() { assert.fail('must not dispatch'); } };
  const inner = { state: EditorState.create({ doc: 'ABC\nDEF' }), hasFocus: true, posAtCoords: () => null };
  const from = source.indexOf('ABC'), remove = registerEditableOwner(inner, parent, () => ({ from, to: from + 7 }), () => true);
  const event = { shiftKey: true, button: 0, preventDefault() { assert.fail('must not cancel'); } };
  assert.equal(extendPointerSelection(event, inner), false);
  inner.hasFocus = false;
  assert.equal(extendPointerSelection(event, inner), false);
  inner.composing = true;
  assert.equal(extendPointerSelection(event, inner), false);
  inner.composing = false;
  assert.equal(extendPointerSelection({ ...event, shiftKey: false }, inner), false);
  assert.equal(extendPointerSelection({ ...event, button: 2 }, inner), false);
  remove();
});

test('multi-range character input is not reduced to the main selection', () => {
  const state = EditorState.create({ doc: source, selection: EditorSelection.create([EditorSelection.range(0, 1), EditorSelection.range(3, 4)]),
    extensions: [EditorState.allowMultipleSelections.of(true), editorLivePreview] });
  assert.equal(handleCrossBlockTextInput({ data: 'x', inputType: 'insertText', cancelable: true, preventDefault() { assert.fail('must not cancel'); } },
    { state, dispatch() { assert.fail('must not dispatch'); } }), false);
});
