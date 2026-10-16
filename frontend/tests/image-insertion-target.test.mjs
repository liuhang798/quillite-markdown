import test from 'node:test';
import assert from 'node:assert/strict';
import {EditorState} from '@codemirror/state';
import {createImageInsertionTarget, imageInsertionTargetCurrent, mapImageInsertionTargets} from '../src/image-insertion-target.js';
function fixture(from=2,to=4){
 const editor={state:EditorState.create({doc:'abcdefgh',selection:{anchor:from,head:to}})};
 const target=createImageInsertionTarget(editor,1,'A.md'),targets=new Set([target]);
 const change=changes=>{const old=editor.state,tr=old.update({changes});editor.state=tr.state;mapImageInsertionTargets(targets,{view:editor,startState:old,state:tr.state,changes:tr.changes,docChanged:tr.docChanged});};
 return{editor,target,change,current:()=>imageInsertionTargetCurrent(target,editor,1,'A.md',true)};
}
test('pending target follows edits before it, not the latest caret',()=>{
 const f=fixture();f.change({from:0,insert:'PREFIX'});assert.equal(f.target.from,8);assert.equal(f.target.to,10);assert.equal(f.current(),true);
 f.editor.state=f.editor.state.update({selection:{anchor:0}}).state;assert.equal(f.current(),true);
});
for(const change of [{from:2,to:4,insert:'new'},{from:1,to:3},{from:3,insert:'x'},{from:0,to:8,insert:'other'}])test(`overlapping edit cancels target ${JSON.stringify(change)}`,()=>{
 const f=fixture();f.change(change);assert.equal(f.current(),false);assert.equal(f.target.cancelled,true);
});
test('edits at either boundary preserve the original selected text',()=>{
 const f=fixture();f.change([{from:2,insert:'LEFT'},{from:4,insert:'RIGHT'}]);assert.equal(f.current(),true);assert.equal(f.editor.state.sliceDoc(f.target.from,f.target.to),'cd');
});
test('empty bookmark remains empty while unrelated text and concurrent insertions move it',()=>{
 const f=fixture(4,4);f.change({from:4,insert:'first image'});assert.equal(f.current(),true);assert.equal(f.target.from,f.target.to);assert.equal(f.target.from,15);
});
test('deleting across an empty bookmark invalidates it',()=>{
 const f=fixture(4,4);f.change({from:3,to:6});assert.equal(f.current(),false);
});
test('same-path reopen, different editor, read-only and leaving edit mode reject stale completion',()=>{
 const f=fixture();assert.equal(imageInsertionTargetCurrent(f.target,f.editor,2,'A.md',true),false);
 assert.equal(imageInsertionTargetCurrent(f.target,{state:f.editor.state},1,'A.md',true),false);
 assert.equal(imageInsertionTargetCurrent(f.target,f.editor,1,'B.md',true),false);
 assert.equal(imageInsertionTargetCurrent(f.target,f.editor,1,'A.md',false),false);
 f.editor.state=EditorState.create({doc:'abcdefgh',extensions:EditorState.readOnly.of(true)});assert.equal(f.current(),false);
});
test('replacing state without a mapped transaction cannot reuse an old bookmark',()=>{
 const f=fixture();f.editor.state=EditorState.create({doc:'abcdefgh'});assert.equal(f.current(),false);
});
