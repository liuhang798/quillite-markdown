import test from 'node:test';
import assert from 'node:assert/strict';
import {EditorState,EditorSelection} from '@codemirror/state';
import {history,undoDepth,undo} from '@codemirror/commands';
import {livePreviewField,liveSourceBlock,activeSourceItem,returnSourceToRendered} from '../src/editor-live-preview.js';
import {sourceReturnScrollDelta,preserveSourceBlockPosition} from '../src/source-return-panel.js';

const source='Before\n\n```text\nALPHA\nBETA\n```\n\nAfter';
test('pointer source anchoring preserves position and stops on input or document changes',async()=>{
 for(const cancel of [null,'wheel','keydown','beforeinput','document']){
  const listeners=new Map(),frames=[],measures=[];
  const view={state:EditorState.create({doc:source}),scrollDOM:{scrollTop:80},
   dom:{classList:{contains:()=>true},addEventListener:(type,fn)=>listeners.set(type,fn),removeEventListener:type=>listeners.delete(type),ownerDocument:{defaultView:{requestAnimationFrame:fn=>frames.push(fn)}}},
   get documentTop(){return -this.scrollDOM.scrollTop;},lineBlockAt:()=>({top:200}),requestMeasure:spec=>measures.push(spec)};
  let opened=0;preserveSourceBlockPosition(view,8,100,()=>opened++);await Promise.resolve();
  assert.equal(opened,1);assert.equal(measures.length,1);
  if(cancel==='document')view.state=EditorState.create({doc:'Other'});else if(cancel)listeners.get(cancel)();
  const measure=measures.shift();measure.write(measure.read());
  assert.equal(view.scrollDOM.scrollTop,cancel?80:100);
  if(!cancel){listeners.get('wheel')();frames.shift()();}
  assert.equal(listeners.size,0);
 }
});
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

test('exposed block source retains a surface on every line and clears on return',()=>{
 const view=harness();
 const surfaces=()=>{
  const result=[];view.state.field(livePreviewField).decorations.between(0,view.state.doc.length,(from,to,value)=>{
   if(value.spec.class?.includes('cm-live-source-line'))result.push({from,classes:value.spec.class});
  });return result;
 };
 assert.equal(surfaces().length,4);
 assert.match(surfaces()[0].classes,/cm-live-source-first/);
 assert.match(surfaces().at(-1).classes,/cm-live-source-last/);
 const at=source.indexOf('BETA');view.dispatch({changes:{from:at,insert:'\n'},selection:{anchor:at+1}});
 assert.equal(surfaces().length,5,'blank lines retain the surface');
 assert.ok(surfaces().every(line=>line.from>=source.indexOf('```')&&line.from<view.state.doc.toString().indexOf('After')));
 returnSourceToRendered(view);assert.equal(surfaces().length,0);
});
test('returning after source edits uses current ranges and preserves the edit undo',()=>{
 const view=harness();const at=view.state.selection.main.head;
 view.dispatch({changes:{from:at,insert:'NEW'},selection:{anchor:at+3},userEvent:'input.type'});
 assert.equal(returnSourceToRendered(view),true);assert.equal(view.state.selection.main.head,at+3);assert.equal(undoDepth(view.state),1);
 undo(view);assert.equal(view.state.doc.toString(),source);
});

test('source surfaces follow each block boundary and do not shade following prose',()=>{
 for(const block of ['```\n\n```','    indented\n    code','| A |\n| --- |\n| B |','<!-- comment -->','<details>\n<summary>Title</summary>\n\nBody\n\n</details>']) {
  const doc='Before\n\n'+block+'\n\nAfter';
  let state=EditorState.create({doc,extensions:[livePreviewField]});
  const item=state.field(livePreviewField).plan.widgets.find(item=>item.from>=8);assert.ok(item,block);
  state=state.update({effects:liveSourceBlock.of(item.from),selection:{anchor:item.from}}).state;
  const positions=[];state.field(livePreviewField).decorations.between(0,doc.length,(from,to,value)=>{if(value.spec.class?.includes('cm-live-source-line'))positions.push(from);});
  assert.equal(positions[0],state.doc.lineAt(item.from).from,block);
  assert.equal(positions.at(-1),state.doc.lineAt(item.to-1).from,block);
  assert.ok(positions.every(from=>from<doc.indexOf('After')),block);
  state=state.update({selection:{anchor:doc.length}}).state;
  assert.equal(state.field(livePreviewField).sourceBlock,null,block);
 }
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
