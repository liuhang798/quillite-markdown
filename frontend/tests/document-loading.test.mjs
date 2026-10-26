import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import {createDocumentLoading} from '../src/document-loading.js';

function clock() {
  let now=0, serial=0; const timers=new Map(), calls=[];
  const controller=createDocumentLoading({now:()=>now,show:value=>calls.push(value),hide:()=>calls.push('hide'),yieldFrame:async()=>{},
    schedule:(fn,delay)=>{timers.set(++serial,{fn,at:now+delay});return serial;},cancel:id=>timers.delete(id)});
  return {controller,calls,timers,tick(ms){now+=ms;for(const [id,timer]of [...timers])if(timer.at<=now){timers.delete(id);timer.fn();}}};
}
test('under 300ms never flashes; 300ms shows and 3s adds a waiting hint',()=>{
  const c=clock();const fast=c.controller.begin();c.tick(299);assert.deepEqual(c.calls,[]);fast.finish();
  c.tick(5000);assert.deepEqual(c.calls,['hide']);assert.equal(c.timers.size,0);
  c.calls.length=0;const slow=c.controller.begin();c.tick(299);assert.deepEqual(c.calls,[]);
  c.tick(1);assert.deepEqual(c.calls.at(-1),{phase:'opening',long:false});
  slow.phase('processing');c.tick(2700);assert.deepEqual(c.calls.at(-1),{phase:'processing',long:true});
  slow.finish();assert.equal(c.calls.at(-1),'hide');assert.equal(c.timers.size,0);
});
test('a superseded request cannot show, update or hide the current indicator',async()=>{
  const c=clock(),old=c.controller.begin();c.tick(300);const next=c.controller.begin();c.calls.length=0;
  old.phase('displaying');old.finish();await old.yield();assert.deepEqual(c.calls,[]);
  c.tick(300);assert.equal(c.calls.at(-1).phase,'opening');next.finish();assert.equal(c.timers.size,0);
});
const renderer=readFileSync(new URL('../src/renderer.js',import.meta.url),'utf8');
test('deferred large-editor content sync still detects edits during document opening',()=>{
  let prompts=0;
  const state={documentOpenRequest:0,documentSession:1,editorRevision:0,currentFile:{content:'unchanged snapshot'}};
  const context=vm.createContext({state,documentLoading:null,maybeDiscardChanges:()=>{prompts++;return false;}});
  vm.runInContext(renderer.slice(renderer.indexOf('function beginDocumentOpen('),renderer.indexOf('function syncDocumentAccessControls(')),context);
  const request=context.beginDocumentOpen();
  state.editorRevision++; // Editor rope changed but the giant string has not been rebuilt yet.
  assert.equal(context.canApplyDocumentOpen(request),false);assert.equal(prompts,1);
  assert.match(renderer,/state.editorRevision = \(state.editorRevision \|\| 0\) \+ 1/);
});
function openHarness() {
  const calls=[],state={documentOpenRequest:1,documentSession:1,currentFile:{content:'old'}};
  const context=vm.createContext({state,els:{content:{}},documentLoading:{begin:()=>({phase:x=>calls.push(x),yield:async()=>{calls.push('yield');context.onYield?.();},finish:()=>calls.push('finish')})},
    prepareMarkdownPresentation:function*(){calls.push('prepare');yield;calls.push('parse');return {html:'sanitized'};},
    canApplyDocumentOpen:r=>r.id===state.documentOpenRequest&&r.session===state.documentSession&&state.currentFile.content==='old',
    setSidebarMode:x=>calls.push(x),displayDocument:(doc,options)=>{calls.push(['commit',doc,options]);state.documentSession++;state.currentFile=doc;}});
  vm.runInContext(renderer.slice(renderer.indexOf('async function readDocumentForOpen('),renderer.indexOf('function displayDocument(')),context);
  return {calls,state,context,request:{id:1,session:1,content:'old'}};
}
test('opening yields between real preparation stages and commits the complete document once',async()=>{
  const h=openHarness(),doc={path:'a.md',content:'complete'};
  assert.equal(await h.context.readDocumentForOpen(h.request,async()=>doc),doc);
  assert.deepEqual(h.calls.filter(x=>typeof x==='string'),['processing','yield','prepare','yield','parse','displaying','yield','yield','finish']);
  const commits=h.calls.filter(Array.isArray);assert.equal(commits.length,1);assert.equal(commits[0][2].presentation.html,'sanitized');
});
test('read/parse errors and cancelled picker always release loading without committing',async()=>{
  for(const kind of ['read','parse','cancel']){
    const h=openHarness();if(kind==='parse')h.context.prepareMarkdownPresentation=function*(){throw Error('parse failed');};
    const read=async()=>{if(kind==='read')throw Error('read failed');return kind==='cancel'?null:{path:'a.md',content:'new'};};
    if(kind==='cancel')assert.equal(await h.context.readDocumentForOpen(h.request,read),null);
    else await assert.rejects(h.context.readDocumentForOpen(h.request,read),/failed/);
    assert.equal(h.calls.at(-1),'finish');assert.ok(!h.calls.some(Array.isArray));
  }
});
test('new request, closing preview and edits during yielded parsing cannot be overwritten',async()=>{
  for(const kind of ['request','session','edit']){
    const h=openHarness();let yields=0;
    h.context.onYield=()=>{if(++yields!==2)return;if(kind==='request')h.state.documentOpenRequest++;else if(kind==='session')h.state.documentSession++;else h.state.currentFile.content='unsaved';};
    assert.equal(await h.context.readDocumentForOpen(h.request,async()=>({path:'b.md',content:'new'})),null);
    assert.ok(!h.calls.some(Array.isArray));assert.equal(h.calls.at(-1),'finish');
  }
});
