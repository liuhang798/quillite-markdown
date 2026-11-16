import assert from 'node:assert/strict';
import test from 'node:test';
import { EditorSelection, EditorState, Text } from '@codemirror/state';
import { buildLivePlan, editorLivePreview, livePreviewField, liveSourceBlock } from '../src/editor-live-preview.js';
import { markdownParser } from '../src/markdown-parser.js';

const table = ['| A | B |', '| --- | --- |', '| first | second |'].join('\n');
const prose = Array.from({ length: 500 }, (_, i) => `## Chapter ${i}\n\nParagraph **${i}** with _formatting_.`).join('\n\n');
const makeState = doc => EditorState.create({ doc, extensions: editorLivePreview });
const live = state => state.field(livePreviewField);

test('caret movement in a long rendered document reuses the decorations', () => {
  let state = makeState(`${table}\n\n${prose}`);
  const { plan, decorations } = live(state);
  for (let i = 0; i < 100; i++) {
    state = state.update({ selection: { anchor: table.length + 2 + i }, userEvent: 'select.pointer' }).state;
    assert.equal(live(state).plan, plan);
    assert.equal(live(state).decorations, decorations);
  }
});

test('caret and search transitions still update visibility and explicit block source', () => {
  const source = `${table}\n\n---\n\nThis **word**.`, rule = source.indexOf('---', table.length), word = source.indexOf('word');
  const entries = (state, from, to) => {
    const items = [];
    live(state).decorations.between(from, to, (_a, _b, value) => items.push(value.spec));
    return items;
  };
  let state = makeState(source);
  assert.ok(entries(state, rule, rule + 3).some(spec => spec.widget?.item.kind === 'rule'));
  state = state.update({ selection: { anchor: rule }, userEvent: 'select.pointer' }).state;
  assert.ok(!entries(state, rule, rule + 3).some(spec => spec.widget?.item.kind === 'rule'));
  state = state.update({ selection: EditorSelection.range(word - 2, word + 4), userEvent: 'select.search' }).state;
  assert.ok(entries(state, rule, rule + 3).some(spec => spec.widget?.item.kind === 'rule'));
  assert.ok(!entries(state, word - 2, word - 1).some(spec => spec.hiddenSyntax));
  state = state.update({ selection: EditorSelection.range(word + 4, word + 6), userEvent: 'select.search' }).state;
  assert.ok(entries(state, word - 2, word - 1).some(spec => spec.hiddenSyntax));
  assert.ok(!entries(state, word + 4, word + 5).some(spec => spec.hiddenSyntax));
  state = state.update({ selection: { anchor: 2 }, effects: liveSourceBlock.of(0) }).state;
  assert.equal(live(state).sourceBlock, 0);
  assert.ok(!entries(state, 0, table.length).some(spec => spec.widget?.item?.kind === 'table'));
  state = state.update({ selection: { anchor: source.length } }).state;
  assert.equal(live(state).sourceBlock, null);
  assert.ok(entries(state, 0, table.length).some(spec => spec.widget?.item.kind === 'table'));
});

test('incremental parse reuses untouched table and prose ranges without changing the resulting plan', () => {
  const document = `${table}\n\n${prose}`;
  let state = makeState(document);
  const parse = markdownParser.parse, fragmentCounts = [];
  markdownParser.parse = function (input, fragments, ...rest) {
    if (input.length > 10000) fragmentCounts.push(fragments?.length ?? 0);
    return parse.call(this, input, fragments, ...rest);
  };
  try {
    const changes = [
      s => ({ from: s.indexOf('second'), to: s.indexOf('second') + 6, insert: '不同字段' }),
      s => ({ from: s.indexOf('Paragraph'), insert: 'Prefix ' }),
      s => ({ from: s.indexOf('## Chapter 211'), insert: '> Quote\n\n' }),
      s => ({ from: s.length, insert: '\n\nMath $x^2$' }),
      s => ({ from: s.indexOf('Prefix'), insert: 'Other ' }),
      s => ({ from: s.indexOf('\n\nMath $x^2$'), to: s.length }),
      s => ({ from: 0, insert: '---\ntitle: Test\n---\n\n' }),
      s => ({ from: s.length, insert: '\n\nNext paragraph' }),
    ];
    const expectedReuse = [true, true, true, false, false, false, false, false];
    for (const [i, change] of changes.entries()) {
      const from = fragmentCounts.length;
      state = state.update({ changes: change(state.doc.toString()), userEvent: 'input.type' }).state;
      assert.equal(fragmentCounts.slice(from).some(Boolean), expectedReuse[i], `edit ${i + 1} parser reuse`);
      assert.deepEqual(live(state).plan, buildLivePlan(state.doc.toString()), `edit ${i + 1} equals a clean parse`);
    }
  } finally { markdownParser.parse = parse; }
});

test('ordinary input without links or inline code avoids their whole-document repairs', () => {
  const state = makeState(`${table}\n\n${prose}`);
  const serialize = Text.prototype.toString;
  let serializations = 0;
  Text.prototype.toString = function () {
    if (this.length === state.doc.length) serializations++;
    return serialize.call(this);
  };
  try {
    const from = state.doc.line(3).from + 2;
    const next = state.update({ changes: { from, insert: 'x' }, userEvent: 'input.type' }).state;
    assert.equal(next.doc.sliceString(from, from + 1), 'x');
    assert.equal(serializations, 0, 'do not serialize the previous document to repair absent syntax');
  } finally { Text.prototype.toString = serialize; }
});
