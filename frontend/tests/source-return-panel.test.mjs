import test from 'node:test';
import assert from 'node:assert/strict';
import {EditorState,EditorSelection} from '@codemirror/state';
import {history,undoDepth,undo} from '@codemirror/commands';
import {livePreviewField,liveSourceBlock,activeSourceItem,returnSourceToRendered} from '../src/editor-live-preview.js';
import {sourceReturnScrollDelta} from '../src/source-return-panel.js';

const source='Before\n\n```text\nALPHA\nBETA\n```\n\nAfter';
test('source return scrolls only enough to reveal a caret outside the viewport',()=>{
 const viewport={top:100,bottom:500};
 assert.equal(sourceReturnScrollDelta({top:200,bottom:220},viewport),0);
 assert.equal(sourceReturnScrollDelta({top:90,bottom:110},viewport),-22);
 assert.equal(sourceReturnScrollDelta({top:500,bottom:520},viewport),32);
 assert.equal(sourceReturnScrollDelta(null,viewport),0);
 assert.equal(sourceReturnScrollDelta({top:200,bottom:220},{top:100,bottom:100}),0);
});
function harness(anchor=source.indexOf('BETA')+2) {
 const view={state:EditorState.create({doc:source,extensions:[livePreviewField,history(),EditorState.allowMultipleSelections.of(true)]}),dom:{querySelectorAll:()=>[]},focuses:0,focus(){this.focuses++;},dispatch(tr){this.state=this.state.update(tr).state;}};
 view.dispatch=view.dispatch.bind(view);
 view.dispatch({selection:{anchor},effects:liveSourceBlock.of(source.indexOf('```'))});return view;
}
test('returning to rendered editing preserves text caret and is history-neutral',()=>{
 const view=harness();const anchor=view.state.selection.main.head;
 assert.ok(activeSourceItem(view));assert.equal(returnSourceToRendered(view),true);
 assert.equal(view.state.doc.toString(),source);assert.equal(view.state.selection.main.head,anchor);assert.equal(undoDepth(view.state),0);assert.equal(activeSourceItem(view),null);assert.equal(view.focuses,1);
});
test('returning after source edits uses current ranges and preserves the edit undo',()=>{
 const view=harness();const at=view.state.selection.main.head;
 view.dispatch({changes:{from:at,insert:'NEW'},selection:{anchor:at+3},userEvent:'input.type'});
 assert.equal(returnSourceToRendered(view),true);assert.equal(view.state.selection.main.head,at+3);assert.equal(undoDepth(view.state),1);
 undo(view);assert.equal(view.state.doc.toString(),source);
});
test('returning from delimiters chooses the nearest editable field instead of hidden syntax',()=>{
 for(const anchor of [source.indexOf('```'),source.lastIndexOf('```')+2]) {
  const view=harness(anchor),item=activeSourceItem(view);assert.ok(item);
  returnSourceToRendered(view);assert.ok(view.state.selection.main.head>=item.contentFrom&&view.state.selection.main.head<=item.contentTo);
 }
});
test('source return keeps multiple ranges and selection direction',()=>{
 const view=harness(),at=source.indexOf('ALPHA');
 const selection=EditorSelection.create([EditorSelection.range(at+4,at+1),EditorSelection.cursor(at+7)],0);
 view.dispatch({selection});assert.ok(activeSourceItem(view));returnSourceToRendered(view);assert.ok(view.state.selection.eq(selection));
});
test('inactive, destroyed and read-only views cannot run a source return action',()=>{
 for(const kind of ['inactive','destroyed','readOnly']) {
  const view=harness();
  if(kind==='inactive')view.dispatch({effects:liveSourceBlock.of(null)});
  if(kind==='destroyed')view.destroyed=true;
  if(kind==='readOnly')view.state=EditorState.create({doc:source,extensions:[livePreviewField,EditorState.readOnly.of(true)]});
  assert.equal(returnSourceToRendered(view),false);assert.equal(view.focuses,0);
 }
});
