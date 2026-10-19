import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
const source=readFileSync(new URL('../src/renderer.js',import.meta.url),'utf8');
const section=(a,b)=>source.slice(source.indexOf(a),source.indexOf(b,source.indexOf(a)));
function setup(){
 let hidden=false,mode='embedded';const calls=[],applied=[],messages=[];let closed=0;
 const state={imageSettingsRevision:0,imageSettingsMutation:'',picGoCloudDetectionRun:0,picGoDetectionRun:0,picGoCloudConnectionReady:true,picGoConnectionReady:true};
 const context=vm.createContext({state,els:{imageUploadSettingsDialog:{classList:{contains:()=>hidden}}},updatePicGoSettingsAvailability(){},
  selectedImageUploadMode:()=>mode,currentImageUploadSettingsInput:()=>({mode}),setImageUploadSettingsStatus:m=>messages.push(m||''),t:x=>x,
  window:{quilliteMarkdown:{setImageUploadSettings:input=>new Promise((resolve,reject)=>calls.push({input,resolve,reject}))}},
  applyImageUploadSettings:settings=>applied.push(settings),closeImageUploadSettings:()=>{hidden=true;closed++;},showToast(){},console:{warn(){}},
 });
 vm.runInContext(section('function imageSettingsResponseCurrent(', 'function setPicGoWizardStep(')+section('async function saveImageUploadSettings(', 'async function uploadedOrLocalImagePath('),context);
 return{context,state,calls,applied,messages,closed:()=>closed,hidden:value=>{hidden=value;},change:()=>{mode='local';context.invalidateImageSettingsResponses();}};
}
for(const failure of [false,true])for(const reopen of [false,true])test(`late save ${failure?'failure':'success'} after ${reopen?'reopening':'editing'} cannot own current UI`,async()=>{
 const f=setup(),pending=f.context.saveImageUploadSettings();assert.equal(f.state.imageSettingsMutation,'save');
 if(reopen){f.hidden(true);f.context.invalidateImageSettingsResponses();f.hidden(false);f.context.invalidateImageSettingsResponses();}else f.change();
 const second=f.context.saveImageUploadSettings();await second;assert.equal(f.calls.length,1,'writes remain serialized across dialog generations');
 failure?f.calls[0].reject(Error('Synthetic')):f.calls[0].resolve({mode:'embedded'});await pending;
 assert.equal(f.closed(),0);assert.deepEqual(f.messages,['']);assert.equal(f.applied.length,failure?0:1,'successful committed preference is not discarded');assert.equal(f.state.imageSettingsMutation,'');
});
test('hidden dialog cannot start a settings write or credential mutation',async()=>{
 const f=setup();f.hidden(true);await f.context.saveImageUploadSettings();assert.equal(f.calls.length,0);assert.equal(f.context.beginImageSettingsMutation('login'),null);
});
test('a settings write excludes login/logout and invalidates old cloud checks',async()=>{
 const f=setup(),pending=f.context.saveImageUploadSettings();assert.equal(f.state.picGoCloudDetectionRun,1);
 assert.equal(f.context.beginImageSettingsMutation('login'),null);assert.equal(f.context.beginImageSettingsMutation('logout'),null);
 f.calls[0].resolve({mode:'embedded'});await pending;assert.equal(f.closed(),1);assert.equal(f.state.imageSettingsMutation,'');
});
