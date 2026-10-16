import test from 'node:test';
import assert from 'node:assert/strict';
import {EditorState,EditorSelection,Transaction} from '@codemirror/state';
import {history,undo,redo,undoDepth,isolateHistory} from '@codemirror/commands';
import {selectionHistory,withSelectionHistory} from '../src/selection-history.js';
import {formatSelectionEdits,inlineFormatEdit} from '../src/inline-format-toggle.js';
import {livePreviewField,liveFormatSelection} from '../src/editor-live-preview.js';
function view(doc,selection){const v={state:EditorState.create({doc,selection,extensions:[history(),selectionHistory,livePreviewField,EditorState.allowMultipleSelections.of(true)]})};v.dispatch=spec=>{v.state=withSelectionHistory([spec.state?spec:v.state.update(spec)]).at(-1).state;};return v;}
test('repeated formatting undo/redo keeps exact multi-range direction and main index',()=>{
 const v=view('alpha one\nalpha two',EditorSelection.create([EditorSelection.range(5,0),EditorSelection.range(10,15)],1)),before=v.state;
 const {formatEnds,...edit}=formatSelectionEdits(v.state,(s,a,b)=>inlineFormatEdit(s,a,b,'**','**'));
 v.dispatch({...edit,effects:liveFormatSelection.of(formatEnds),annotations:isolateHistory.of('full')});const after=v.state;
 assert.ok(after.field(livePreviewField).formatSelection);assert.equal(undoDepth(after),1);
 for(let i=0;i<5;i++){undo(v);assert.ok(v.state.selection.eq(before.selection));assert.equal(v.state.doc.toString(),before.doc.toString());redo(v);assert.ok(v.state.selection.eq(after.selection));assert.equal(v.state.doc.toString(),after.doc.toString());}
});
test('ordinary typing still groups into one history event and restores final caret',()=>{
 const v=view('',{anchor:0});for(const char of 'hello')v.dispatch({...v.state.replaceSelection(char),userEvent:'input.type'});
 assert.equal(undoDepth(v.state),1);const selected=v.state.selection;undo(v);assert.equal(v.state.doc.toString(),'');redo(v);assert.equal(v.state.doc.toString(),'hello');assert.ok(v.state.selection.eq(selected));
});
test('selection replacement and deletion restore actual before/after selections across repeated cycles',()=>{
 for(const insert of ['','new text']){const v=view('before middle after',{anchor:13,head:7}),before=v.state.selection;
 v.dispatch({...v.state.replaceSelection(insert),userEvent:insert?'input.paste':'delete.backward'});const after=v.state.selection;
 for(let i=0;i<3;i++){undo(v);assert.ok(v.state.selection.eq(before));redo(v);assert.ok(v.state.selection.eq(after));}
 }
});
test('composition grouping is unchanged',()=>{
 const v=view('',{anchor:0});v.dispatch({changes:{from:0,insert:'n'},selection:{anchor:1},userEvent:'input.type.compose.start'});
 v.dispatch({changes:{from:0,to:1,insert:'你'},selection:{anchor:1},userEvent:'input.type.compose'});
 assert.equal(undoDepth(v.state),1);undo(v);assert.equal(v.state.doc.toString(),'');redo(v);assert.equal(v.state.doc.toString(),'你');assert.equal(v.state.selection.main.head,1);
});
test('non-history prefix insertion maps retained selections without invalid ranges',()=>{
 const v=view('alpha',{anchor:1,head:4});v.dispatch({changes:{from:0,to:5,insert:'**alpha**'},selection:{anchor:3,head:6}});
 v.dispatch({changes:{from:0,insert:'prefix '},annotations:Transaction.addToHistory.of(false)});
 undo(v);assert.equal(v.state.doc.toString(),'prefix alpha');assert.deepEqual(v.state.selection.toJSON(),{ranges:[{anchor:8,head:11}],main:0});
 redo(v);assert.equal(v.state.doc.toString(),'prefix **alpha**');assert.ok(v.state.selection.ranges.every(r=>r.from<=r.to));
});
test('selection-only transactions add no undo step',()=>{
 const v=view('alpha',{anchor:0});v.dispatch({selection:{anchor:1,head:4}});assert.equal(undoDepth(v.state),0);
});
