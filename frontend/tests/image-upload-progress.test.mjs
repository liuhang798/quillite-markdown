import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
const renderer=readFileSync(new URL('../src/renderer.js',import.meta.url),'utf8');
function fixture(){
 const classes=new Set(['hidden']),timers=[];let id=0;
 const classList={add:n=>classes.add(n),remove:n=>classes.delete(n),contains:n=>classes.has(n),toggle:(n,v)=>v?classes.add(n):classes.delete(n)};
 const els={imageUploadProgress:{classList},imageUploadProgressTitle:{},imageUploadProgressDetail:{},imageUploadProgressPercent:{},imageUploadProgressBar:{style:{}}};
 const state={imageUploadRun:0,imageUploadMode:'local',imageUploadOperationId:''};
 const c=vm.createContext({state,els,t:k=>k,crypto:{randomUUID:()=>`request-${++id}`},clearTimeout(){},setTimeout:f=>timers.push(f)});
 vm.runInContext(renderer.slice(renderer.indexOf('function beginImageUploadProgress('),renderer.indexOf('\nfunction showImportedImageResult(')),c);
 const progress=(operationId,done,phase='uploading')=>c.updateImageUploadProgress({operationId,phase,done,total:100});
 return{c,els,state,classes,timers,progress};
}
test('progress accepts only the active operation, including after cancellation and restart',()=>{
 const f=fixture();f.c.beginImageUploadProgress('picgo');const old=f.state.imageUploadOperationId;f.progress(old,20);
 f.c.beginImageUploadProgress('picgo-cloud');const current=f.state.imageUploadOperationId;f.progress(current,30);
 for(const id of [old,undefined,'unknown'])f.progress(id,99,'complete');
 assert.equal(f.els.imageUploadProgressPercent.textContent,'30%');
 f.state.imageUploadOperationId='';f.progress(current,90);assert.equal(f.els.imageUploadProgressPercent.textContent,'30%');
 f.c.beginImageUploadProgress('picgo');f.progress(current,99);assert.equal(f.els.imageUploadProgressPercent.textContent,'0%');
});
test('provider wording belongs to the upload snapshot, not newer settings',()=>{
 const f=fixture();f.c.beginImageUploadProgress('picgo-cloud');f.state.imageUploadMode='picgo';f.progress(f.state.imageUploadOperationId,40);
 assert.equal(f.els.imageUploadProgressDetail.textContent,'imageUploadingCloud');
});
test('late completion, post-completion events and old hide timers cannot affect a newer upload',()=>{
 const f=fixture(),first=f.c.beginImageUploadProgress('picgo');const second=f.c.beginImageUploadProgress('picgo');
 f.progress(f.state.imageUploadOperationId,30);f.c.finishImageUploadProgress(first,true);assert.equal(f.els.imageUploadProgressPercent.textContent,'30%');assert.equal(f.timers.length,0);
 const id=f.state.imageUploadOperationId;f.c.finishImageUploadProgress(second,true);f.progress(id,10);assert.equal(f.els.imageUploadProgressPercent.textContent,'100%');
 f.c.beginImageUploadProgress('picgo');f.timers[0]();assert.equal(f.classes.has('hidden'),false);assert.equal(f.els.imageUploadProgressPercent.textContent,'0%');
});
