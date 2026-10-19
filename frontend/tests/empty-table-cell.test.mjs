import test from 'node:test';
import assert from 'node:assert/strict';
import {EditorSelection,EditorState} from '@codemirror/state';
import {buildLivePlan} from '../src/editor-live-preview.js';
import {emptyTableCellBoundary,retainEditableCellPadding} from '../src/live-editable-block.js';
for(const close of ['', '|'])for(const padding of ['', ' ', '  '])for(const column of [0,1,2]){
 test(`clear column ${column+1}, closing pipe ${!!close}, padding ${padding.length}`,()=>{
  const source='| A | B | C |\n| --- | --- | --- |\n| 甲 | 乙 | 暗'+padding+close;
  const item=buildLivePlan(source).widgets.find(w=>w.kind==='table'),field=item.cells.find(c=>c.row===1&&c.column===column);
  const extra=emptyTableCellBoundary(source,item,field,'');
  assert.equal(Boolean(extra),column===2&&!close);
  const state=EditorState.create({doc:source}).update({changes:[{from:field.from,to:field.to,insert:''},...(extra?[extra]:[])]}).state;
  const result=buildLivePlan(state.doc.toString()).widgets.find(w=>w.kind==='table');
  assert.ok(result);assert.equal(result.cells.length,6);
  const empty=result.cells.find(c=>c.row===1&&c.column===column);
  const retained=retainEditableCellPadding(state.doc,empty,EditorSelection.single(field.from));
  assert.equal(retained.from,field.from);assert.equal(retained.to,field.from);
  assert.equal(state.doc.sliceString(retained.from,retained.to),'');
 });
}
test('nonempty edits and literal code cannot gain table boundaries',()=>{
 const source='| A | B |\n| --- | --- |\n| C | 暗',item=buildLivePlan(source).widgets.find(w=>w.kind==='table'),field=item.cells.at(-1);
 assert.equal(emptyTableCellBoundary(source,item,field,'新内容'),null);
 assert.equal(emptyTableCellBoundary(source,{...item,kind:'code'},field,''),null);
});
