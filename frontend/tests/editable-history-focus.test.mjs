import test from 'node:test';
import assert from 'node:assert/strict';
import {EditorState,EditorSelection} from '@codemirror/state';
import {registerEditableOwner} from '../src/editable-owner.js';
import {runEditableHistory} from '../src/live-editable-block.js';

function harness() {
  const input={},outside={},body={},doc={body,activeElement:input};
  const root={state:EditorState.create({doc:'before\nbody\nafter'}),dom:{ownerDocument:doc,contains:el=>el===input,querySelectorAll:()=>[]},focuses:0,focus(){this.focuses++;doc.activeElement=input;}};
  const inner={state:EditorState.create({doc:'body'})};
  const remove=registerEditableOwner(inner,root,()=>({from:7,to:11}),()=>true);
  return{input,outside,doc,root,inner,remove};
}

test('nested undo/redo repairs focus lost when a projection is rebuilt',()=>{
  for(const active of ['body','null']){
    const h=harness();let called;
    assert.equal(runEditableHistory(h.inner,target=>{called=target;h.doc.activeElement=active==='body'?h.doc.body:null;return true;}),true);
    assert.equal(called,h.root);assert.equal(h.root.focuses,1);h.remove();
  }
});

test('history focus repair never steals a live control or revives a destroyed view',()=>{
  for(const kind of ['outside-before','outside-after','destroyed','unhandled']){
    const h=harness();if(kind==='outside-before')h.doc.activeElement=h.outside;
    runEditableHistory(h.inner,()=>{
      h.doc.activeElement=kind==='outside-after'?h.outside:kind==='still-focused'?h.input:h.doc.body;
      if(kind==='destroyed')h.root.destroyed=true;
      return kind!=='unhandled';
    });
    assert.equal(h.root.focuses,0,kind);h.remove();
  }
});

test('history reconciles a surviving focused projection with the restored root selection',()=>{
  const h=harness();
  assert.equal(runEditableHistory(h.inner,()=>true),true);
  assert.equal(h.root.focuses,1);h.remove();
});

test('read-only or stale ownership blocks history before it can change content or focus',()=>{
  for(const kind of ['readOnly','stale','destroyed']){
    const h=harness();
    if(kind==='readOnly')h.root.state=EditorState.create({doc:'before\nbody\nafter',extensions:EditorState.readOnly.of(true)});
    else if(kind==='stale')h.inner.state=EditorState.create({doc:'changed'});
    else h.inner.destroyed=true;
    assert.equal(runEditableHistory(h.inner,()=>{throw new Error('History must not run');}),false);assert.equal(h.root.focuses,0);h.remove();
  }
});

test('multi-selection history returns focus to the authoritative root without stealing an outside control',()=>{
 for(const outside of [false,true]){
  const h=harness();
  h.root.state=EditorState.create({doc:'before\nbody\nafter',extensions:EditorState.allowMultipleSelections.of(true),selection:EditorSelection.create([EditorSelection.cursor(8),EditorSelection.cursor(10)])});
  assert.ok(runEditableHistory(h.inner,()=>{if(outside)h.doc.activeElement=h.outside;return true;}));
  assert.equal(h.root.focuses,outside?0:1);h.remove();
 }
});
