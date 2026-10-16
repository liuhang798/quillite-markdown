import test from 'node:test';
import assert from 'node:assert/strict';
import {EditorState,EditorSelection} from '@codemirror/state';
import {history,undo,redo} from '@codemirror/commands';
import {livePreviewField,liveComposition,unwrapLiveInlineBoundary} from '../src/editor-live-preview.js';
import {editableForwardedChange,editableProjectionSync} from '../src/editable-owner.js';
const create=(doc,extra=[])=>EditorState.create({doc,extensions:[livePreviewField,history(),EditorState.allowMultipleSelections.of(true),EditorState.transactionFilter.of(unwrapLiveInlineBoundary),extra]});
for(const[open,close]of [['**','**'],['*','*'],['__','__'],['_','_'],['~~','~~'],['==','=='],['`','`'],['``','``'],['<span data-md-color="spectrum-3-red">','</span>'],...['u','sup','sub','kbd','mark','strong','em','del'].map(t=>[`<${t}>`,`</${t}>`])])test(`hidden ${open} edge deletes both markers in one undo step`,()=>{
 for(const backward of [true,false]){
  const doc='Before\n\n'+open+'ALPHA'+close+'\n\nAfter',start=8,end=start+open.length+5,caret=backward?start+open.length:end;
  let state=create(doc).update({selection:{anchor:caret}}).state;
  state=state.update({changes:{from:backward?start:end,to:backward?caret:end+close.length},selection:{anchor:backward?start:end},userEvent:'delete'}).state;
  assert.equal(state.doc.toString(),'Before\n\nALPHA\n\nAfter');assert.equal(state.selection.main.head,backward?8:13);
  undo({state,dispatch:tr=>state=tr.state});assert.equal(state.doc.toString(),doc);
  redo({state,dispatch:tr=>state=tr.state});assert.equal(state.doc.toString(),'Before\n\nALPHA\n\nAfter');
 }
});
test('nested markers remove only the deleted inner layer',()=>{
 for(const[doc,left,right,size,expected]of [['***ALPHA***',1,8,2,'*ALPHA*'],['**==ALPHA==**',2,9,2,'**ALPHA**'],['<u>**ALPHA**</u>',3,10,2,'<u>ALPHA</u>'],['[**ALPHA**](https://example.com)',1,8,2,'[ALPHA](https://example.com)']])for(const backward of [true,false]){
  const from=backward?left:right,caret=backward?left+size:right;let state=create(doc).update({selection:{anchor:caret}}).state;
  state=state.update({changes:{from,to:from+size},userEvent:'delete'}).state;assert.equal(state.doc.toString(),expected);
 }
});
test('two cursors can remove both markers without duplicate repairs',()=>{
 let state=create('**ALPHA**').update({selection:EditorSelection.create([EditorSelection.cursor(2),EditorSelection.cursor(7)])}).state;
 state=state.update({changes:[{from:0,to:2},{from:7,to:9}],userEvent:'delete'}).state;assert.equal(state.doc.toString(),'ALPHA');
});
test('multi-cursor independent wrappers preserve selection mapping',()=>{
 let state=create('**ALPHA** *OMEGA*').update({selection:EditorSelection.create([EditorSelection.cursor(2),EditorSelection.cursor(16)],1)}).state;
 state=state.update({changes:[{from:0,to:2},{from:16,to:17}],selection:EditorSelection.create([EditorSelection.cursor(0),EditorSelection.cursor(14)],1),userEvent:'delete'}).state;
 assert.equal(state.doc.toString(),'ALPHA OMEGA');assert.deepEqual(state.selection.ranges.map(r=>r.head),[0,11]);assert.equal(state.selection.mainIndex,1);
});
test('source/search/composition/forwarding do not run the visual boundary repair',()=>{
 const doc='**ALPHA**',spec={changes:{from:0,to:2},userEvent:'delete'},expected='ALPHA**',position=s=>s.update({selection:{anchor:2}}).state;
 assert.equal(position(EditorState.create({doc,extensions:EditorState.transactionFilter.of(unwrapLiveInlineBoundary)})).update(spec).newDoc.toString(),expected);
 assert.equal(position(create(doc,[EditorState.readOnly.of(true)])).update(spec).newDoc.toString(),expected);
 assert.equal(position(create(doc)).update({effects:liveComposition.of(true)}).state.update(spec).newDoc.toString(),expected);
 assert.equal(create(doc).update({selection:{anchor:2},userEvent:'select.search'}).state.update(spec).newDoc.toString(),expected);
 for(const annotation of [editableForwardedChange.of(true),editableProjectionSync.of(true)])assert.equal(position(create(doc)).update({...spec,annotations:annotation}).newDoc.toString(),expected);
 assert.equal(create(doc).update({selection:{anchor:0,head:2}}).state.update(spec).newDoc.toString(),expected);
});
