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
  serializeTableReplacement,
  splitMarkdownTableRow,
  stripTableWidthMetadata
} from '../src/table-designer.js';
import {buildLivePlan} from '../src/editor-live-preview.js';
import {marked} from 'marked';
import {EditorState} from '@codemirror/state';

test('container tables map every cell and survive structural edits with one metadata record',()=>{
  for(const [intro,first,prefix] of [['','> ','> '],['- item\n\n','  ','  '],['','- ','  '],['123. item\n\n','     ','     '],['- outer\n  - inner\n\n','    ','    '],['> - item\n>\n','>   ','>   '],['','> > ','> > ']]) {
    const source='😀 intro\n\n'+intro+['| A | B |','| --- | ---: |','| C | D |'].map((r,i)=>(i?prefix:first)+r).join('\n')+'\n\nend';
    const item=buildLivePlan(source).widgets.find(item=>item.kind==='table');assert.ok(item);
    assert.deepEqual(item.cells.map(c=>source.slice(c.from,c.to)),['A','B','C','D']);
    const table=findMarkdownTableAt(source,source.indexOf('| C |')+2);assert.ok(table);assert.equal(table.prefix,prefix);
    table.model.widths=[250,300];table.model.cells[1][0]='Edited';
    const next=source.slice(0,table.from)+serializeTableReplacement(table.model,table)+source.slice(table.to);
    const saved=findMarkdownTables(next);assert.equal(saved.length,1);assert.equal(saved[0].hasWidthMetadata,true);
    assert.deepEqual(saved[0].model.widths,[250,300]);assert.equal(saved[0].model.cells[1][0],'Edited');
    const again=next.slice(0,saved[0].from)+serializeTableReplacement(saved[0].model,saved[0])+next.slice(saved[0].to);
    assert.equal(again,next);assert.equal(again.match(/quillite-table-widths/g).length,1);
    const stripped=stripTableWidthMetadata(next);assert.equal(stripped.length,next.length);assert.ok(stripped.startsWith('😀 intro'));
    assert.ok(!stripped.includes('quillite-table-widths'));assert.match(marked.parse(stripped),/<table>/);
    assert.ok(!buildLivePlan(next).widgets.some(item=>item.kind==='comment'));
  }
});

test('table syntax in indented/fenced code never opens the structure editor',()=>{
  const table='| A | B |\n| --- | --- |\n| C | D |';
  for(const source of [table.split('\n').map(r=>'    '+r).join('\n'),'> ```\n'+table.split('\n').map(r=>'> '+r).join('\n')+'\n> ```'])assert.equal(findMarkdownTables(source).length,0);
});

test('malformed extra cells cannot be silently discarded by structure serialization',()=>{
  const source='> | A | B |\n> | --- | --- |\n> | C | D | E |';
  assert.equal(findMarkdownTables(source).length,0);
  assert.ok(!buildLivePlan(source).widgets.some(item=>item.kind==='table'));
});

test('metadata separated from a table is not consumed and CRLF cell positions stay exact',()=>{
  const source='> <!-- quillite-table-widths: 310, 320 -->\n>\n> | A | B |\n> | --- | --- |\n> | | D |';
  assert.equal(findMarkdownTables(source)[0].hasWidthMetadata,false);
  const crlf=source.replaceAll('\n','\r\n'),table=findMarkdownTables(crlf)[0];
  assert.deepEqual(table.model.cells,[['A','B'],['','D']]);assert.ok(crlf.slice(table.from,table.to).startsWith('| A |'));
  const doc=EditorState.create({doc:crlf}).doc.toString(),item=buildLivePlan(doc).widgets.find(item=>item.kind==='table');
  assert.deepEqual(item.cells.map(cell=>doc.slice(cell.from,cell.to)),['A','B','','D']);
});

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
