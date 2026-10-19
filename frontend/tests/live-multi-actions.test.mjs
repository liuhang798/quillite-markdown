import test from 'node:test';
import assert from 'node:assert/strict';
import {EditorState, EditorSelection} from '@codemirror/state';
import {history, undo, redo} from '@codemirror/commands';
import {livePreviewField, insertLiveNewline, replaceLiveSelections} from '../src/editor-live-preview.js';
import {editableFieldContains, tableCellRanges, insertSingleLineMultiBreak, retainEditableCellPadding} from '../src/live-editable-block.js';

const selected = doc => EditorState.create({doc, selection:EditorSelection.create([...doc.matchAll(/needle/g)].map(m=>EditorSelection.range(m.index,m.index+6))),
  extensions:[history(), livePreviewField, EditorState.allowMultipleSelections.of(true)]});

test('single-line child multi Enter preserves all positions in one undoable edit',()=>{
 let state=EditorState.create({doc:'alpha beta',extensions:[history(),EditorState.allowMultipleSelections.of(true)],selection:EditorSelection.create([EditorSelection.cursor(5),EditorSelection.range(10,6)],0)});
 const view={get state(){return state;},dispatch:spec=>{state=state.update(spec).state;}};
 assert.ok(insertSingleLineMultiBreak(view));assert.equal(state.doc.toString(),'alpha   ');assert.equal(state.selection.ranges.length,2);assert.equal(state.selection.mainIndex,0);
 undo({state,dispatch:tr=>{state=tr.state;}});assert.equal(state.doc.toString(),'alpha beta');
 redo({state,dispatch:tr=>{state=tr.state;}});assert.equal(state.doc.toString(),'alpha   ');
});

test('single-line break keeps native navigation, readonly and composition paths',()=>{
 for(const mode of ['single','readonly','composing']){
  const state=EditorState.create({doc:'alpha beta',extensions:[EditorState.allowMultipleSelections.of(true),EditorState.readOnly.of(mode==='readonly')],selection:mode==='single'?{anchor:5}:EditorSelection.create([EditorSelection.cursor(5),EditorSelection.cursor(10)])});
  assert.equal(insertSingleLineMultiBreak({state,composing:mode==='composing',dispatch(){assert.fail('must not change');}}),false);
 }
});

test('focused table fields retain caret-owned whitespace but never separators or neighboring cells',()=>{
 const source='|  alpha  | beta |\nNext',field={from:3,to:8,row:0,column:0};
 const selected=EditorSelection.create([EditorSelection.cursor(2),EditorSelection.cursor(9),EditorSelection.cursor(14),EditorSelection.cursor(source.length)]);
 assert.deepEqual(retainEditableCellPadding(source,field,selected),{...field,from:2,to:9});
 assert.deepEqual(field,{from:3,to:8,row:0,column:0});
 assert.deepEqual(retainEditableCellPadding(source,field,EditorSelection.single(10,14)),field);
});
for (const [kind, body, newline] of [
 ['table','| A | B |\n| --- | --- |\n| needle needle | needle |',' '],
 ['code','```text\nneedle needle\n```','\n'],
 ['quote-code','> ```text\n> needle needle\n> ```','\n> '],
 ['summary','<details>\n<summary>needle needle</summary>\n\nbody\n\n</details>',' '],
 ['footnote','Note[^n]\n\n[^n]: needle needle','\n    '],
]) test(`multi Enter preserves ${kind}, then undo and redo`,()=>{
 const doc='Before\n\n'+body+'\n\nAfter';let state=selected(doc);
 const view={get state(){return state;},dispatch:tr=>{state=state.update(tr).state;}};
 assert.equal(insertLiveNewline(view),true);const expected=doc.replaceAll('needle',newline);
 assert.equal(state.doc.toString(),expected);
 assert.equal(undo({state,dispatch:tr=>{state=tr.state;}}),true);assert.equal(state.doc.toString(),doc);
 assert.equal(redo({state,dispatch:tr=>{state=tr.state;}}),true);assert.equal(state.doc.toString(),expected);
});
test('cell padding after deletion stays inside its original field, never crosses pipes or lines',()=>{
 const doc='| A | B |\n| --- | --- |\n|   |  |', cells=tableCellRanges(doc), first=cells[2], second=cells[3];
 const pos=doc.lastIndexOf('|   |')+1;
 for(const source of [doc,EditorState.create({doc}).doc]){
  assert.ok(editableFieldContains(source,first,pos,pos,'table'));
  assert.equal(editableFieldContains(source,second,pos,pos,'table'),false);
  assert.equal(editableFieldContains(source,cells[0],pos,pos,'table'),false);
  assert.equal(editableFieldContains(source,first,pos,pos,'code'),false);
 }
 let state=selected(doc.replace('|   |','| needle needle |'));
 state=state.update(replaceLiveSelections(state,'')).state;
 assert.equal(state.update(replaceLiveSelections(state,'|\n')).state.doc.toString(),doc.replace('|   |','| \\|  \\|  |'));
});
test('Windows clipboard line endings do not offset multi-carets beyond inserted text',()=>{
 const doc='needle\n\n```text\nneedle needle\n```';
 const state=selected(doc), tr=state.update(replaceLiveSelections(state,'A|B\r\nC'));
 const expected=doc.replaceAll('needle','A|B\nC');
 assert.equal(tr.newDoc.toString(),expected);
 assert.deepEqual(tr.newSelection.ranges.map(r=>r.head),[...expected.matchAll(/A\|B\nC/g)].map(m=>m.index+m[0].length));
});
