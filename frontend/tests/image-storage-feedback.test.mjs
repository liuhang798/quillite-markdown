import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
const source=readFileSync(new URL('../src/renderer.js',import.meta.url),'utf8');
const html=readFileSync(new URL('../index.html',import.meta.url),'utf8');
const section=(begin,end)=>source.slice(source.indexOf(begin),source.indexOf(end,source.indexOf(begin)));
function setup(mode){
 const classes=new Set(['hidden']),status={textContent:'',classList:{toggle:(key,on)=>on?classes.add(key):classes.delete(key)}},button={disabled:false};
 const calls=[],settings={mode,serverUrl:'http://127.0.0.1:36677',secret:'',clearSecret:false};let fail=true,closed=0;
 const context=vm.createContext({state:{picGoConnectionReady:true,picGoCloudConnectionReady:true},els:{imageUploadSettingsDialog:{classList:{contains:()=>false}}},$:id=>id==='#imageUploadSettingsStatus'?status:button,
  beginImageSettingsMutation:()=>0,finishImageSettingsMutation:()=>{button.disabled=false;},imageSettingsResponseCurrent:()=>true,
  selectedImageUploadMode:()=>mode,currentImageUploadSettingsInput:()=>settings,t:x=>x,console:{warn(){}},
  window:{quilliteMarkdown:{setImageUploadSettings:async input=>{calls.push(input);if(fail)throw Error('Synthetic');return{mode};}}},
  applyImageUploadSettings:x=>calls.push({applied:x}),closeImageUploadSettings:()=>{closed++;},showToast(){},
  setPicGoTestStatus(){throw Error('Save failures must not be routed to a mode-specific panel');},
 });
 vm.runInContext(section('function setImageUploadSettingsStatus(', 'function setPicGoTestStatus(')+section('async function saveImageUploadSettings(', 'async function uploadedOrLocalImagePath('),context);
 return{context,status,classes,button,calls,closed:()=>closed,succeed:()=>{fail=false;}};
}
for(const mode of ['local','embedded','picgo','picgo-cloud'])test(`${mode} save failure has shared feedback and retry clears it`,async()=>{
 const f=setup(mode);await f.context.saveImageUploadSettings();assert.equal(f.status.textContent,'imageUploadSettingsSaveFailed');assert.equal(f.classes.has('hidden'),false);assert.equal(f.classes.has('error'),true);assert.equal(f.button.disabled,false);assert.equal(f.closed(),0);assert.equal(f.calls.length,1);
 f.succeed();await f.context.saveImageUploadSettings();assert.equal(f.status.textContent,'');assert.equal(f.classes.has('hidden'),true);assert.equal(f.classes.has('error'),false);assert.equal(f.closed(),1);assert.equal(f.calls.length,3);
});
test('shared image save status is outside mode-specific panels and announces changes',()=>{
 assert.match(html,/<p id="imageUploadSettingsStatus" class="picgo-test-status hidden" role="status" aria-live="polite" aria-atomic="true"><\/p>\s*<div class="image-upload-settings-actions">/);
 assert.match(section('function openImageUploadSettings(', 'function closeImageUploadSettings('),/setImageUploadSettingsStatus\(\)/);
 const handler=section('document.querySelectorAll(\'input[name="imageUploadMode"]\').forEach', '[els.picGoServerURL,');
 assert.match(handler,/setImageUploadSettingsStatus\(\)/);
});
