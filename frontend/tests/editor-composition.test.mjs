import test from 'node:test';
import assert from 'node:assert/strict';
import {compositionSession, editorComposing} from '../src/editor-composition.js';
import {EditorState} from '@codemirror/state';
import {editorCompositionState,liveComposition} from '../src/editor-composition.js';
import {editorFormulaField} from '../src/editor-formula-preview.js';
import {focusEditableBlock,syncEditableSelections,syncEditableSearch,syncEditableSpelling} from '../src/live-editable-block.js';

test('the first phonetic key and commit frame remain protected', () => {
 const view={composing:false,compositionStarted:false}, pending=[], events=[];
 const session=compositionSession(view,active=>events.push(active),callback=>pending.push(callback));
 session.start();assert.equal(editorComposing(view),true);
 session.end();assert.equal(editorComposing(view),true);
 pending.shift()();assert.equal(editorComposing(view),false);assert.deepEqual(events,[true,false]);
 session.destroy();
});
test('old compositionend cannot thaw the next candidate session', () => {
 const view={},pending=[],events=[];
 const session=compositionSession(view,active=>events.push(active),callback=>pending.push(callback));
 session.start();session.end();session.start();pending.shift()();
 assert.equal(editorComposing(view),true);assert.deepEqual(events,[true,true]);
 session.end();pending.shift()();assert.equal(editorComposing(view),false);session.destroy();
});
test('destroyed or replaced editor sessions ignore old callbacks', () => {
 const view={},pending=[],events=[];
 const session=compositionSession(view,active=>events.push(active),callback=>pending.push(callback));
 session.start();session.end();session.destroy();
 const replacement=compositionSession(view,active=>events.push(active),callback=>pending.push(callback));
 replacement.start();pending.shift()();assert.deepEqual(events,[true,true]);assert.equal(editorComposing(view),true);
 replacement.end();view.destroyed=true;pending.shift()();assert.deepEqual(events,[true,true]);replacement.destroy();
});
test('native composition before its first document change is protected',()=>{
 assert.equal(editorComposing({composing:false,compositionStarted:true}),true);
 assert.equal(editorComposing({composing:true}),true);
 assert.equal(editorComposing({}),false);
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
