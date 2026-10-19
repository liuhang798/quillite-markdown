import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { EditorState, EditorSelection, StateEffect } from '@codemirror/state';
import { history, undo, redo, isolateHistory } from '@codemirror/commands';
import { inlineFormatEdit, formatSelectionEdits, textColorEdit } from '../src/inline-format-toggle.js';
import { selectionHistory, withSelectionHistory } from '../src/selection-history.js';

const apply = (source, edit) => source.slice(0, edit.from) + edit.insert + source.slice(edit.to);
const pairs = [['**', '**'], ['*', '*'], ['***', '***'], ['~~', '~~'], ['==', '=='], ['`', '`'], ['<u>', '</u>'], ['<sup>', '</sup>'], ['<sub>', '</sub>'], ['<kbd>', '</kbd>']];
test('code toggles remove long delimiters and semantic padding, preserving literal ticks',()=>{
 for(const[raw,body,pad]of [['``AL`PHA``','AL`PHA',0],['`` `ALPHA ``','`ALPHA',1],['`` ALPHA` ``','ALPHA`',1],['``  ALPHA  ``',' ALPHA ',1],['```A``B```','A``B',0],['``A\\B``','A\\B',0]]){
  const fence=raw.match(/^`+/)[0].length,source='Before '+raw+' After',start=7+fence+pad,end=7+raw.length-fence-pad,expected='Before '+body.replace(/[\\`]/g,'\\$&')+' After';
  for(const[from,to]of [[start,end],[7,7+raw.length],[start,7+raw.length],[7,end]])assert.equal(apply(source,inlineFormatEdit(source,from,to,'`','`')),expected);
 }
});
test('long code toggles inside footnotes map through continuation prefixes',()=>{
 for(const prefix of ['Note[^n]\n\n[^n]: ','Note[^n]\n\n[^n]: Intro\n\n    ']){
  const raw='`` AL`PHA ``',doc=prefix+raw+'\n\nAfter',from=prefix.length+3,to=from+6;
  assert.equal(apply(doc,inlineFormatEdit(doc,from,to,'`','`')),prefix+'AL\\`PHA\n\nAfter');
 }
});
const multiple = (doc, ranges, main = 0) => EditorState.create({ doc,
  selection: EditorSelection.create(ranges.map(([a, h = a]) => EditorSelection.range(a, h)), main),
  extensions: [EditorState.allowMultipleSelections.of(true), history()] });
for (const [open, close] of pairs) {
  test(`multi-selection ${open} preserves reversed ranges, main range, and undo`, () => {
    const original = multiple('one / two / three', [[3, 0], [6, 9], [17, 12]], 1);
    const edit = formatSelectionEdits(original, (s, a, b) => inlineFormatEdit(s, a, b, open, close));
    let state = original.update({ ...edit, annotations: isolateHistory.of('full') }).state;
    assert.equal(state.doc.toString(), ['one', 'two', 'three'].map(word => open + word + close).join(' / '));
    assert.equal(state.selection.mainIndex, 1);
    assert.deepEqual(state.selection.ranges.map(r => r.anchor > r.head), [true, false, true]);
    assert.deepEqual(state.selection.ranges.map(r => state.sliceDoc(r.from, r.to)), ['one', 'two', 'three']);
    assert.deepEqual(edit.formatEnds, state.selection.ranges.map(r => r.to + close.length));
    const formatted = state;
    state = state.update({ ...formatSelectionEdits(state, (s, a, b) => inlineFormatEdit(s, a, b, open, close)), annotations: isolateHistory.of('full') }).state;
    assert.equal(state.doc.toString(), original.doc.toString());
    assert.ok(state.selection.eq(original.selection));
    const view = { get state() { return state; }, dispatch(tr) { state = tr.state; } };
    assert.ok(undo(view)); assert.equal(state.doc.toString(), formatted.doc.toString());
    assert.ok(undo(view)); assert.ok(state.selection.eq(original.selection));
    assert.ok(redo(view)); assert.equal(state.doc.toString(), formatted.doc.toString());
  });
}

test('mixed empty cursors and selections format in one transaction without inventing Enter intent', () => {
  const state = multiple('a b c', [[1], [2, 3], [5]], 2);
  const edit = formatSelectionEdits(state, (s, a, b) => inlineFormatEdit(s, a, b, '==', '==', '新'));
  const next = state.update(edit).state;
  assert.equal(next.doc.toString(), 'a==新== ==b== c==新==');
  assert.equal(next.selection.mainIndex, 2);
  assert.deepEqual(edit.formatEnds, [null, 12, null]);
});

test('colors replace and reset each range, preserving uncolored ranges and safe markup', () => {
  const original = multiple('one two three', [[0, 3], [7, 4], [8, 13]], 1);
  let state = original;
  for (const color of ['spectrum-3-red', 'spectrum-5-blue', 'default']) {
    state = state.update(formatSelectionEdits(state, (s, a, b) => textColorEdit(s, a, b, color))).state;
    assert.equal(state.doc.toString(), color === 'default' ? 'one two three' : ['one', 'two', 'three'].map(w => `<span data-md-color="${color}">${w}</span>`).join(' '));
    assert.equal(state.selection.mainIndex, 1);
    assert.deepEqual(state.selection.ranges.map(r => r.anchor > r.head), [false, true, false]);
  }
  assert.equal(formatSelectionEdits(state, (s, a, b) => textColorEdit(s, a, b, 'default')).changes.empty, true);
  assert.equal(textColorEdit('text', 0, 4, 'red; color: evil'), null);
  const source = '<span data-md-color="red">one</span> / <span data-md-color="blue">two</span>';
  assert.equal(textColorEdit(source, 0, source.length, 'default'), null, 'two sibling spans are not one wrapper');
  assert.equal(apply(source, textColorEdit(source, 0, source.length, 'green')), `<span data-md-color="green">${source}</span>`);
  const mixed = multiple(source + ' plain', [[source.indexOf('one'), source.indexOf('one') + 3], [source.length + 1, source.length + 6]]);
  const edit = formatSelectionEdits(mixed, (s, a, b) => textColorEdit(s, a, b, 'default'));
  const next = mixed.update(edit).state;
  assert.equal(next.doc.toString(), 'one / <span data-md-color="blue">two</span> plain');
  assert.deepEqual(next.selection.ranges.map(r => next.sliceDoc(r.from, r.to)), ['one', 'plain']);
  assert.deepEqual(edit.formatEnds, [3, null]);
});

test('adjacent independently formatted ranges retain their own Enter boundaries', () => {
  const state = multiple('<u>one</u><u>two</u>', [[3, 6], [13, 16]]);
  const edit = formatSelectionEdits(state, (s, a, b) => inlineFormatEdit(s, a, b, '<u>', '</u>'));
  const next = state.update(edit).state;
  assert.equal(next.doc.toString(), 'onetwo');
  assert.deepEqual(edit.formatEnds, [3, 6]);
});
for (const [open, close] of pairs) {
  test(`toggle ${open} restores text, keeps selection, and does not touch neighbouring lines`, () => {
    const original = 'Before\n中文 emoji 😀\nAfter', from = 7, to = original.indexOf('\nAfter');
    const added = inlineFormatEdit(original, from, to, open, close);
    const formatted = apply(original, added);
    const removed = inlineFormatEdit(formatted, added.anchor, added.head, open, close);
    assert.equal(apply(formatted, removed), original);
    assert.equal(original.slice(removed.anchor, removed.head), '中文 emoji 😀');
    const whole = inlineFormatEdit(formatted, added.from, added.from + added.insert.length, open, close);
    assert.equal(apply(formatted, whole), original);
  });
}

test('bold and italic toggle independently, including underscored and mixed nested wrappers', () => {
  for (const [source, marker, expected] of [
    ['**text**', '*', '***text***'], ['*text*', '**', '***text***'],
    ['***text***', '*', '**text**'], ['***text***', '**', '*text*'],
    ['***text***', '***', 'text'], ['**text**', '***', '***text***'],
    ['__text__', '**', 'text'], ['**_text_**', '*', '**text**'],
    ['****text****', '**', 'text'],
  ]) {
    const from = source.indexOf('text'), to = from + 4;
    for (const [a, b] of [[from, to], [0, source.length]]) {
      assert.equal(apply(source, inlineFormatEdit(source, a, b, marker, marker)), expected, `${source} ${marker}`);
    }
  }
});

test('partial, escaped, separate, empty and multiline selections do not remove unrelated markup', () => {
  assert.equal(apply('**word**', inlineFormatEdit('**word**', 3, 5, '**', '**')), '**w**or**d**');
  assert.equal(apply('\\**word**', inlineFormatEdit('\\**word**', 3, 7, '**', '**')), '\\****word****');
  for (const marker of ['**', '~~', '==']) {
    const source = `${marker}one${marker} ${marker}two${marker}`;
    assert.equal(apply(source, inlineFormatEdit(source, 0, source.length, marker, marker)), marker + source + marker);
  }
  const empty = inlineFormatEdit('', 0, 0, '**', '**', 'Bold');
  assert.equal(empty.insert, '**Bold**');
  assert.equal(empty.insert.slice(empty.anchor, empty.head), 'Bold');
  const source = 'one\ntwo';
  const added = inlineFormatEdit(source, 0, source.length, '**', '**');
  assert.equal(apply(added.insert, inlineFormatEdit(added.insert, added.anchor, added.head, '**', '**')), source);
});

test('renderer dispatches format toggles as one undoable change and preserves the Enter boundary', () => {
  const renderer = readFileSync(new URL('../src/renderer.js', import.meta.url), 'utf8');
  const fn = renderer.slice(renderer.indexOf('function wrapSelection('), renderer.indexOf('// 只允许工具栏内置色名'));
  for (const [open, close] of pairs) {
    const view = {
      state: EditorState.create({ doc: '文字', selection: { anchor: 0, head: 2 }, extensions: [history(),selectionHistory] }),
      dispatch(spec) { this.state = withSelectionHistory([spec.state ? spec : this.state.update(spec)]).at(-1).state; }, focus() {},
    };
    view.dispatch = view.dispatch.bind(view);
    const context = vm.createContext({ codeEditor: view, state: { editing: true }, inlineFormatEdit, formatSelectionEdits, isolateHistory, liveFormatSelection: StateEffect.define() });
    vm.runInContext(fn, context);
    assert.equal(context.wrapSelection(open, close, 'placeholder'), true);
    const wrapped = view.state.doc.toString();
    assert.equal(wrapped, open + '文字' + close);
    context.wrapSelection(open, close, 'placeholder');
    assert.equal(view.state.doc.toString(), '文字');
    undo(view); assert.equal(view.state.doc.toString(), wrapped);
    redo(view); assert.equal(view.state.doc.toString(), '文字');
    assert.ok(view.state.selection.main.from <= view.state.selection.main.to);
    assert.equal(view.state.sliceDoc(view.state.selection.main.from, view.state.selection.main.to), '文字');
    context.wrapSelection(open, close, 'placeholder');
    assert.equal(view.state.doc.toString(), wrapped);
    undo(view); assert.equal(view.state.doc.toString(), '文字');
    redo(view); assert.equal(view.state.doc.toString(), wrapped);
  }
});
