import test from 'node:test';
import assert from 'node:assert/strict';
import {EditorState, EditorSelection} from '@codemirror/state';
import {history, undo} from '@codemirror/commands';
import {codeInputScrollIntent, trackCodeInputScroll, setCodeInputScroll, holdsCodeInputScroll, handleCodeTextInput, captureNativeCodeInputScroll, finishNativeCodeInputScroll, clearNativeCodeInputScroll} from '../src/code-input-scroll.js';
import {registerEditableOwner} from '../src/editable-owner.js';

const state=EditorState.create({doc:'abc'});
test('code input, deletion and pointer placement suppress automatic nearest scrolling',()=>{
  for(const userEvent of ['input.type','input.type.compose','input.paste','input.indent','delete.backward','select.pointer']) {
    const tr=state.update({selection:{anchor:1},scrollIntoView:true,userEvent});
    assert.equal(codeInputScrollIntent(false,[tr]),true,userEvent);
  }
});
test('keyboard navigation, history and explicit scroll requests release the input guard',()=>{
  for(const userEvent of ['select','select.search','select.keyboard','undo','redo',undefined]) {
    const tr=state.update({selection:{anchor:2},scrollIntoView:true,userEvent});
    assert.equal(codeInputScrollIntent(true,[tr]),false,String(userEvent));
  }
  assert.equal(codeInputScrollIntent(true,[state.update({})]),true);
});
test('scroll guards are per editor, require focus and leave explicit alignment available',()=>{
  const view={hasFocus:true},other={hasFocus:true};
  trackCodeInputScroll(view,[state.update({changes:{from:1,insert:'x'},userEvent:'input.type'})]);
  assert.equal(holdsCodeInputScroll(view,{x:'nearest',y:'nearest'}),true);
  assert.equal(holdsCodeInputScroll(other),false);
  assert.equal(holdsCodeInputScroll(view,{y:'center'}),false);
  assert.equal(holdsCodeInputScroll(view,{x:'start'}),false);
  view.hasFocus=false;assert.equal(holdsCodeInputScroll(view),false);
  view.hasFocus=true;setCodeInputScroll(view,false);assert.equal(holdsCodeInputScroll(view),false);
});
test('ordinary beforeinput retains literal code, multicarets and shared undo with a guarded scroll target',()=>{
  const original='ab\ncd';let prevented=false,request;
  const view={composing:false,state:EditorState.create({doc:original,selection:EditorSelection.create([EditorSelection.cursor(1),EditorSelection.cursor(4)]),extensions:[history(),EditorState.allowMultipleSelections.of(true)]}),dispatch(spec){request=spec;this.state=this.state.update(spec).state;}};
  assert.equal(handleCodeTextInput({cancelable:true,inputType:'insertText',data:'`X\n',preventDefault(){prevented=true;}},view),true);
  assert.equal(prevented,true);assert.equal(view.state.doc.toString(),'a`X\nb\nc`X\nd');assert.equal(request.scrollIntoView,true);
  undo({state:view.state,dispatch:tr=>{view.state=tr.state;}});assert.equal(view.state.doc.toString(),original);
});
test('read-only, IME and unsupported native input events are not intercepted',()=>{
  for(const scenario of [{readOnly:true},{composing:true},{isComposing:true},{cancelable:false},{inputType:'insertCompositionText'},{inputType:'insertReplacementText'},{data:null}]){
    const view={state:EditorState.create({doc:'abc',extensions:scenario.readOnly?[EditorState.readOnly.of(true)]:[]}),composing:!!scenario.composing,dispatch(){assert.fail('must not dispatch');}};
    const event={inputType:'insertText',data:'中',cancelable:true,...scenario,preventDefault(){assert.fail('must retain native input');}};
    assert.equal(handleCodeTextInput(event,view),false);
  }
});
function nativeFixture(){
  const frames=new Map();let id=0;
  const doc=new EventTarget();doc.defaultView={requestAnimationFrame(fn){frames.set(++id,fn);return id;},cancelAnimationFrame(id){frames.delete(id);}};
  const scroller=Object.assign(new EventTarget(),{scrollTop:100,scrollLeft:20});
  const root={state,dom:{ownerDocument:doc},scrollDOM:scroller};const inner={state,hasFocus:true};
  registerEditableOwner(inner,root,()=>({from:0,to:3}),()=>true);
  return{inner,root,doc,scroller,frame(){const callbacks=[...frames.values()];frames.clear();callbacks.forEach(fn=>fn());}};
}
test('native composition scroll is contained before paint and releases after the commit frame',()=>{
  const f=nativeFixture();captureNativeCodeInputScroll({type:'compositionstart'},f.inner);
  f.scroller.scrollTop=140;f.scroller.dispatchEvent(new Event('scroll'));assert.equal(f.scroller.scrollTop,100);
  f.frame();f.scroller.scrollLeft=35;finishNativeCodeInputScroll(f.inner);assert.equal(f.scroller.scrollLeft,20);
  f.frame();f.scroller.scrollTop=160;f.scroller.dispatchEvent(new Event('scroll'));assert.equal(f.scroller.scrollTop,160);
});
test('native composition containment never fights new user intent, lost focus or destroyed editors',()=>{
  for(const action of ['wheel','pointerdown','keydown','touchstart','blur','destroy','clear']){
    const f=nativeFixture();captureNativeCodeInputScroll({inputType:'insertCompositionText'},f.inner);
    if(action==='blur')f.inner.hasFocus=false;else if(action==='destroy')f.inner.destroyed=true;else if(action==='clear')clearNativeCodeInputScroll(f.inner);else f.doc.dispatchEvent(new Event(action));
    f.scroller.scrollTop=170;f.scroller.dispatchEvent(new Event('scroll'));assert.equal(f.scroller.scrollTop,170,action);
    f.frame();f.frame();
  }
});
