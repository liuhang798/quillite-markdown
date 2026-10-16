import test from 'node:test';
import assert from 'node:assert/strict';
import {EditorState} from '@codemirror/state';
import {history,undo,redo} from '@codemirror/commands';
import {marked} from 'marked';
import {livePreviewField,unwrapLiveInlineBoundary} from '../src/editor-live-preview.js';
const create=doc=>EditorState.create({doc,extensions:[livePreviewField,history(),EditorState.transactionFilter.of(unwrapLiveInlineBoundary)]});
for(const body of ['`ALPHA','**bold**','[link](https://example.com)','<img src=x>','&copy;','A\\B','==mark=='])test('code edge deletion retains literal '+body,()=>{
 const raw='``` '+body+' ```',from=4,to=from+body.length;
 for(const opening of [true,false]){
  let state=create(raw).update({selection:{anchor:opening?from:to}}).state;
  state=state.update({changes:opening?{from:0,to:from}:{from:to,to:raw.length},userEvent:opening?'delete.backward':'delete.forward'}).state;
  const text=state.doc.toString();assert.equal(text,body.replace(/[!-/:-@\[-`{-~]/g,'\\$&'));
  assert.ok(!marked.parse(text).includes('<img'));const saved=text;
  undo({state,dispatch:tr=>state=tr.state});assert.equal(state.doc.toString(),raw);redo({state,dispatch:tr=>state=tr.state});assert.equal(state.doc.toString(),saved);
 }
});
test('boundary removal preserves quoted continuation markers and unrelated code',()=>{
 const doc='> ``ALPHA\n> BE`TA``\n\n`OTHER`',from=4;
 const state=create(doc).update({selection:{anchor:from}}).state;
 const next=state.update({changes:{from:2,to:4},userEvent:'delete.backward'}).newDoc.toString();
 assert.equal(next,'> ALPHA\n> BE\\`TA\n\n`OTHER`');
});
