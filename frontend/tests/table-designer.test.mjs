import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createTableModel,
  findMarkdownTableAt,
  findMarkdownTables,
  removeTableColumn,
  removeTableRow,
  reorderTableColumn,
  reorderTableRow,
  resizeTableModel,
  serializeMarkdownTable,
  splitMarkdownTableRow,
  stripTableWidthMetadata
} from '../src/table-designer.js';

test('visual table models resize without losing existing cell content', () => {
  const model = createTableModel(3, 2, index => `标题 ${index + 1}`);
  model.cells[1][0] = '保留内容';
  const resized = resizeTableModel(model, 4, 3, index => `标题 ${index + 1}`);
  assert.equal(resized.cells.length, 4);
  assert.equal(resized.cells[0].length, 3);
  assert.equal(resized.cells[1][0], '保留内容');
  assert.equal(resized.cells[0][2], '标题 3');
});

test('rows and columns can be reordered and removed while the header remains fixed', () => {
  const model = createTableModel(4, 3);
  model.cells = [
    ['A', 'B', 'C'],
    ['1A', '1B', '1C'],
    ['2A', '2B', '2C'],
    ['3A', '3B', '3C']
  ];
  model.alignments = ['left', 'center', 'right'];
  model.widths = [110, 160, 220];
  const columnsMoved = reorderTableColumn(model, 2, 0);
  assert.deepEqual(columnsMoved.cells[0], ['C', 'A', 'B']);
  assert.deepEqual(columnsMoved.alignments, ['right', 'left', 'center']);
  assert.deepEqual(columnsMoved.widths, [220, 110, 160]);
  const rowsMoved = reorderTableRow(columnsMoved, 3, 1);
  assert.deepEqual(rowsMoved.cells[0], ['C', 'A', 'B']);
  assert.deepEqual(rowsMoved.cells[1], ['3C', '3A', '3B']);
  assert.equal(removeTableRow(rowsMoved, 1).cells.length, 3);
  assert.equal(removeTableColumn(rowsMoved, 1).alignments.length, 2);
});

test('serialization preserves alignment, escaped pipes and Quillite column widths', () => {
  const model = createTableModel(2, 3);
  model.cells = [['名称', '状态', '备注'], ['轻阅 | Markdown', '`a|b`', '可视化']];
  model.alignments = ['left', 'center', 'right'];
  model.widths = [120, 180, 240];
  const markdown = serializeMarkdownTable(model);
  assert.match(markdown, /^<!-- quillite-table-widths: 170, 180, 240 -->/);
  assert.match(markdown, /\| :--- \| :---: \| ---: \|/);
  assert.match(markdown, /轻阅 \\| Markdown/);
  const parsed = findMarkdownTables(markdown);
  assert.equal(parsed.length, 1);
  assert.equal(parsed[0].hasWidthMetadata, true);
  assert.deepEqual(parsed[0].model.alignments, ['left', 'center', 'right']);
  assert.deepEqual(parsed[0].model.widths, [170, 180, 240]);
  assert.equal(parsed[0].model.cells[1][0], '轻阅 | Markdown');
});

test('an existing Markdown table is detected at the cursor and width metadata is hidden from preview input', () => {
  const source = `介绍\n\n<!-- quillite-table-widths: 140, 200 -->\n| 名称 | 说明 |\n| :--- | ---: |\n| 轻阅 | 快速 |\n\n结尾`;
  const cursor = source.indexOf('快速');
  const table = findMarkdownTableAt(source, cursor);
  assert.ok(table);
  assert.equal(table.line, 4);
  assert.equal(source.slice(table.from, table.to).includes('quillite-table-widths'), true);
  assert.deepEqual(table.model.alignments, ['left', 'right']);
  const previewSource = stripTableWidthMetadata(source);
  assert.equal(previewSource.includes('quillite-table-widths'), false);
  assert.equal(previewSource.split('\n').length, source.split('\n').length);
});

test('table row splitting keeps escaped and inline-code pipes inside their cells', () => {
  assert.deepEqual(splitMarkdownTableRow('| a \\| b | `x|y` | c |'), ['a | b', '`x|y`', 'c']);
});

test('setext headings and fenced table examples are not mistaken for editable tables', () => {
  assert.equal(findMarkdownTables('Heading\n---\n\nText').length, 0);
  const fenced = '```markdown\n<!-- quillite-table-widths: 180 -->\n| Example |\n| :--- |\n| Value |\n```';
  assert.equal(findMarkdownTables(fenced).length, 0);
  assert.equal(stripTableWidthMetadata(fenced), fenced);
});
