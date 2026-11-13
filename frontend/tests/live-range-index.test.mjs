import test from 'node:test';
import assert from 'node:assert/strict';
import {liveRangeIndex} from '../src/live-range-index.js';
import {buildLivePlan} from '../src/editor-live-preview.js';
import {EditorState} from '@codemirror/state';
import {editorLivePreview} from '../src/editor-live-preview.js';

test('live range index agrees with the old overlap test at nested, touching and zero-length ranges', () => {
  const ranges = [
    {from:15,to:18}, {from:1,to:16}, {from:1,to:4}, {from:5,to:6},
    {from:5,to:8,skip:true}, {from:11,to:11}, {from:23,to:26}
  ];
  const query = liveRangeIndex(ranges);
  for (let from = 0; from <= 27; from++) for (let to = from; to <= 28; to++) {
    for (const accept of [undefined, item => !item.skip, item => item.skip]) {
      assert.equal(query(from, to, accept), ranges.some(item => from < item.to && item.from < to && (!accept || accept(item))));
    }
  }
});

test('dense formulas keep surrounding inline formatting and source across live edits', () => {
  const rows = Array.from({length:600}, (_, i) => '- **Term '+i+'** $x_'+i+'=1$ and _text_.');
  const source = rows.join('\n\n');
  const plan = buildLivePlan(source);
  assert.equal(plan.marks.filter(mark => mark.className === 'cm-live-strong').length, rows.length);
  assert.equal(plan.marks.filter(mark => mark.className === 'cm-live-em').length, rows.length);
  assert.ok(!plan.marks.some(mark => source.slice(mark.from, mark.to).includes('$x_')));
  const state = EditorState.create({doc: source, extensions: editorLivePreview});
  assert.equal(state.update({changes: {from: 0, insert: 'intro\n\n'}}).newDoc.toString(), 'intro\n\n' + source);
});

test('many fenced blocks inside a list keep exact source and continuation prefixes', () => {
  const rows = Array.from({length:220}, (_, i) => '- Example '+i+'\n\n  ```text\n  alpha\n  ```');
  const source = rows.join('\n\n');
  const code = buildLivePlan(source).widgets.filter(item => item.kind === 'code');
  assert.equal(code.length, rows.length);
  for (const item of code) {
    assert.equal(item.projection.prefix, '  ');
    assert.equal(item.text, 'alpha');
    assert.equal(source.slice(item.from, item.to), item.raw);
  }
});
