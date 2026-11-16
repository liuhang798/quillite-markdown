import assert from 'node:assert/strict';
import test from 'node:test';
import { Marked } from 'marked';
import { EditorState } from '@codemirror/state';
import { cjkStrongToken } from '../src/cjk-strong.js';
import { markdownParser } from '../src/markdown-parser.js';
import { mathExtensions } from '../src/math-rendering.js';
import { buildLivePlan, editorLivePreview } from '../src/editor-live-preview.js';

const rendered = new Marked({ extensions: [cjkStrongToken, ...mathExtensions] });
const generic = new Marked({ extensions: mathExtensions });
const bolds = html => [...html.matchAll(/<strong>(.*?)<\/strong>/g)].map(match => match[1]);
const planBolds = text => buildLivePlan(text).marks.filter(mark => mark.className === 'cm-live-strong')
  .map(mark => text.slice(mark.from + 2, mark.to - 2));

test('Chinese closing punctuation before a Han suffix renders with exact original offsets', () => {
  for (const [source, expected] of [
    ['**另一行（列）**的', ['另一行（列）']],
    ['😀比较**另一行 (列)**的结果', ['另一行 (列)']],
    ['**甲（乙）**的**丙（丁）**后', ['甲（乙）', '丙（丁）']],
    ['**前**和**另一行（列）**的', ['前', '另一行（列）']],
    ['**前**另一行（列）**的', ['前']],
    ['**另一行（列）**的**再加粗**', ['另一行（列）', '再加粗']],
    ['# **另一行（列）**的标题', ['另一行（列）']],
    ['> - **另一行（列）**的条目', ['另一行（列）']],
    ['[**另一行（列）**的](/example)', ['另一行（列）']],
    ['说明 `<code>` **另一行（列）**的', ['另一行（列）']],
    ['说明 <!-- <code> --> **另一行（列）**的', ['另一行（列）']],
    ['说明 <span title="<code>">文字</span> **另一行（列）**的', ['另一行（列）']],
  ]) {
    assert.deepEqual(bolds(rendered.parse(source)), expected, source);
    assert.deepEqual(planBolds(source), expected, source);
    const spans = [];
    markdownParser.parse(source).iterate({ enter(node) {
      if (node.name !== 'StrongEmphasis') return;
      const marks = node.node.getChildren('EmphasisMark');
      assert.deepEqual(marks.map(mark => source.slice(mark.from, mark.to)), ['**', '**']);
      spans.push(source.slice(marks[0].to, marks[1].from));
    } });
    assert.deepEqual(spans, expected, source);
  }
});

test('code, HTML attributes, math, escaped/triple markers and English retain existing behavior', () => {
  for (const source of [
    '`**另一行（列）**的`', '```md\n**另一行（列）**的\n```', '    **另一行（列）**的',
    '文字 <code title="a > b">**另一行（列）**的</code>', '<span title="**另一行（列）**的">文字</span>',
    '文字 <textarea>**另一行（列）**的</textarea>',
    '$\\text{**另一行（列）**的}$', String.raw`\**另一行（列）**的`,
    '***另一行（列）***的', '**Hello!**world', '**English (word)**的',
    '**另一行（列）**English', '**普通中文**的', '**ASCII** word', '** 另一行（列）**的',
  ]) {
    const clean = html => html.replace(/ data-math-origin="[^"]+"/g, '');
    assert.equal(clean(rendered.parse(source)), clean(generic.parse(source)), source);
    if (!source.includes('普通中文') && !source.startsWith('**ASCII**')) assert.deepEqual(planBolds(source), [], source);
  }
});

test('table and live editing keep source and delimiters byte-for-byte', () => {
  const inline = '**另一行（列）**的';
  const table = `| 名称 | 说明 |\n| --- | --- |\n| ${inline} | 结束 |`;
  assert.match(rendered.parse(table), /<td><strong>另一行（列）<\/strong>的<\/td>/);
  const plan = buildLivePlan(table), cell = plan.widgets.find(item => item.kind === 'table').cells[2];
  assert.equal(table.slice(cell.from, cell.to), inline);
  const state = EditorState.create({ doc: inline, extensions: editorLivePreview });
  const from = inline.indexOf('列');
  const after = state.update({ changes: { from, to: from + 1, insert: '项' }, userEvent: 'input.type' }).state;
  assert.equal(after.doc.toString(), '**另一行（项）**的');
  assert.deepEqual(planBolds(after.doc.toString()), ['另一行（项）']);
});
