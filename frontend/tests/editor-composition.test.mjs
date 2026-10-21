import test from 'node:test';
import assert from 'node:assert/strict';
import {compositionSession, editorComposing, afterComposition} from '../src/editor-composition.js';
import {EditorState} from '@codemirror/state';
import {editorCompositionState,liveComposition,stateComposing} from '../src/editor-composition.js';
import {editorLivePreview,livePreviewField} from '../src/editor-live-preview.js';
import {editorFormulaField} from '../src/editor-formula-preview.js';
import {imagePreviewField} from '../src/embedded-image-preview.js';
import {editorDiagramField} from '../src/editor-diagram-preview.js';
import {focusEditableBlock,syncEditableSelections,syncEditableSearch,syncEditableSpelling} from '../src/live-editable-block.js';

test('the first phonetic key and commit frame remain protected', () => {
 const view={composing:false,compositionStarted:false}, pending=[], events=[];
 const session=compositionSession(view,active=>events.push(active),callback=>pending.push(callback));
 session.start();assert.equal(editorComposing(view),true);
 session.end();assert.equal(editorComposing(view),true);
 pending.shift()();assert.equal(editorComposing(view),false);assert.deepEqual(events,[false]);
 session.destroy();
});
test('old compositionend cannot thaw the next candidate session', () => {
 const view={},pending=[],events=[];
 const session=compositionSession(view,active=>events.push(active),callback=>pending.push(callback));
 session.start();session.end();session.start();pending.shift()();
 assert.equal(editorComposing(view),true);assert.deepEqual(events,[]);
 session.end();pending.shift()();assert.equal(editorComposing(view),false);session.destroy();
});
test('destroyed or replaced editor sessions ignore old callbacks', () => {
 const view={},pending=[],events=[];
 const session=compositionSession(view,active=>events.push(active),callback=>pending.push(callback));
 session.start();session.end();session.destroy();
 const replacement=compositionSession(view,active=>events.push(active),callback=>pending.push(callback));
 replacement.start();pending.shift()();assert.deepEqual(events,[]);assert.equal(editorComposing(view),true);
 replacement.end();view.destroyed=true;pending.shift()();assert.deepEqual(events,[]);replacement.destroy();
});
test('native composition before its first document change is protected',()=>{
 assert.equal(editorComposing({composing:false,compositionStarted:true}),true);
 assert.equal(editorComposing({composing:true}),true);
 assert.equal(editorComposing({}),false);
});

test('compositionstart leases state without dispatch and protects the first input transaction',()=>{
 const view={state:EditorState.create({doc:'**text**',selection:{anchor:6},extensions:editorLivePreview})};
 const pending=[],events=[],initial=view.state,plan=initial.field(livePreviewField).plan;
 const session=compositionSession(view,active=>{events.push(active);view.state=view.state.update({effects:liveComposition.of(active)}).state;},callback=>pending.push(callback));
 session.start();assert.deepEqual(events,[]);assert.equal(view.state,initial);assert.equal(stateComposing(view.state),true);
 view.state=view.state.update({changes:{from:6,insert:'n'},selection:{anchor:7},userEvent:'input.type.compose'}).state;
 assert.equal(view.state.doc.toString(),'**textn**');assert.equal(view.state.field(livePreviewField).plan,plan);
 assert.equal(view.state.field(livePreviewField).composing,true);assert.equal(stateComposing(view.state),true);
 view.state=view.state.update({changes:{from:6,to:7,insert:'你好'},selection:{anchor:8},userEvent:'input.type.compose'}).state;
 session.end();pending.shift()();assert.deepEqual(events,[false]);assert.equal(stateComposing(view.state),false);
 assert.equal(view.state.field(livePreviewField).composing,false);assert.equal(view.state.doc.toString(),'**text你好**');session.destroy();
});

test('cancel without text changes releases the start lease and allows the next session',()=>{
 const view={state:EditorState.create({doc:'text',extensions:editorCompositionState})},pending=[];
 const session=compositionSession(view,active=>{view.state=view.state.update({effects:liveComposition.of(active)}).state;},callback=>pending.push(callback));
 session.start();assert.equal(stateComposing(view.state),true);session.end();pending.shift()();assert.equal(stateComposing(view.state),false);
 session.start();assert.equal(stateComposing(view.state),true);session.destroy();assert.equal(stateComposing(view.state),false);
});
test('native first-key composition cannot be focused or synchronized by projections',()=>{
 const view={compositionStarted:true,composing:false};
 assert.equal(focusEditableBlock(view),false);
 for(const sync of [syncEditableSelections,syncEditableSearch,syncEditableSpelling])assert.doesNotThrow(()=>sync(view));
});
test('formula widgets survive adjacent composition until the final commit frame',()=>{
 let state=EditorState.create({doc:'$x$ text',extensions:[editorFormulaField,editorCompositionState]});
 const widget=state.field(editorFormulaField).decorations.iter().value.spec.widget;
 state=state.update({effects:liveComposition.of(true)}).state;
 for(const text of ['n','i','好']){
  state=state.update({changes:{from:state.doc.length,insert:text},userEvent:'input.type.compose'}).state;
  assert.equal(state.field(editorFormulaField).decorations.iter().value.spec.widget,widget);
 }
 state=state.update({effects:liveComposition.of(false)}).state;
 assert.notEqual(state.field(editorFormulaField).decorations.iter().value.spec.widget,widget);
 assert.equal(state.doc.toString(),'$x$ textni好');
});

test('background work waits through the first key and commit frame, then applies once',()=>{
 const view={},frames=[],timers=new Map();let next=0,applied=0;
 const clock={schedule(fn){timers.set(++next,fn);return next;},cancel(id){timers.delete(id);}};
 const tick=()=>{const work=[...timers.values()];timers.clear();work.forEach(fn=>fn());};
 const session=compositionSession(view,()=>{},fn=>frames.push(fn));session.start();
 afterComposition(view,()=>applied++,()=>true,clock);
 tick();tick();assert.equal(applied,0);session.end();tick();assert.equal(applied,0);
 frames.shift()();tick();tick();assert.equal(applied,1);session.destroy();
});

test('background work is discarded on cancellation, disposal or stale identity',()=>{
 for(const kind of ['cancel','destroy','stale']){
  const view={compositionStarted:true},timers=new Map();let next=0,current=true;
  const clock={schedule(fn){timers.set(++next,fn);return next;},cancel(id){timers.delete(id);}};
  const cancel=afterComposition(view,()=>assert.fail(kind),()=>current,clock);
  if(kind==='cancel')cancel();if(kind==='destroy')view.destroyed=true;if(kind==='stale')current=false;
  view.compositionStarted=false;[...timers.values()].forEach(fn=>fn());
 }
});

test('image and diagram widgets retain identity during composition and refresh after commit',()=>{
 for(const [field,doc] of [[imagePreviewField,'![img](image.png)\n\ntext'],[editorDiagramField,'```mermaid\ngraph TD\nA-->B\n```\n\ntext']]){
  let state=EditorState.create({doc,selection:{anchor:doc.length},extensions:[field,editorCompositionState]});
  const widget=state.field(field).decorations.iter().value.spec.widget;
  assert.ok(widget);state=state.update({effects:liveComposition.of(true)}).state;
  for(const text of ['n','i','好']){
   state=state.update({changes:{from:state.doc.length,insert:text},userEvent:'input.type.compose'}).state;
   assert.equal(state.field(field).decorations.iter().value.spec.widget,widget);
  }
  state=state.update({effects:liveComposition.of(false)}).state;
  assert.notEqual(state.field(field).decorations.iter().value.spec.widget,widget);
  assert.equal(state.doc.toString(),doc+'ni好');
 }
});
