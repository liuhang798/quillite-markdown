import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
const source=readFileSync(new URL('../src/renderer.js',import.meta.url),'utf8');
function fixture(){
 const state={picGoCLIReady:false,imageUploadMode:'local'},calls=[],toasts=[];
 const input={mode:'picgo-cli',cliPath:'C:/cli.cjs',cliConfigPath:'C:/config.json',cliAllowHttp:true};
 const fields={'#picGoCLIUploadStatus':{textContent:'',classList:{remove(){}}}};
 let visible=true;
 const c=vm.createContext({state,els:{imageUploadSettingsDialog:{classList:{contains:()=>!visible}}},$:s=>fields[s],t:k=>k,console:{warn(){}},setImageUploadSettingsStatus(){},selectedImageUploadMode:()=>input.mode,currentImageUploadSettingsInput:()=>({...input}),beginImageSettingsMutation:()=>1,finishImageSettingsMutation(){},imageSettingsResponseCurrent:()=>visible,closeImageUploadSettings:()=>{visible=false;},showToast:t=>toasts.push(t),picGoCLISetupError:()=> 'error',applyImageUploadSettings:settings=>Object.assign(state,{imageUploadMode:settings.mode,picGoCLIDraft:settings.cliDraft}),window:{quilliteMarkdown:{savePicGoCLIDraft:async draft=>{calls.push(['draft',draft]);return draft;},setImageUploadSettings:async active=>{calls.push(['enable',active]);return {...active,cliDraft:null};}}}});
 vm.runInContext(source.slice(source.indexOf('async function saveImageUploadSettings('),source.indexOf('\nasync function uploadedOrLocalImagePath(')),c);
 return {c,state,calls,toasts,fields,visible:()=>visible};
}
test('HTTP draft can save offline without readiness or active setting changes',async()=>{
 const f=fixture();await f.c.saveImageUploadSettings();
 assert.equal(f.calls.length,1);assert.equal(f.calls[0][0],'draft');assert.equal(f.state.picGoCLIDraft.cliAllowHttp,true);
 assert.equal(f.state.imageUploadMode,'local');assert.equal(f.visible(),false);assert.equal(f.toasts[0],'picGoCLIDraftSaved');
});
test('even verified settings use draft save unless enable is explicitly requested',async()=>{
 const f=fixture();f.state.picGoCLIReady=true;await f.c.saveImageUploadSettings(false);assert.equal(f.calls[0][0],'draft');
 const g=fixture();g.state.picGoCLIReady=true;await g.c.saveImageUploadSettings(true);assert.equal(g.calls[0][0],'enable');assert.equal(g.state.imageUploadMode,'picgo-cli');assert.equal(g.state.picGoCLIDraft,null);
});
test('unverified explicit enable stays blocked',async()=>{
 const f=fixture();await f.c.saveImageUploadSettings(true);assert.equal(f.calls.length,0);assert.equal(f.visible(),true);
});
test('draft persistence failure keeps form and active settings unchanged',async()=>{
 const f=fixture();f.c.window.quilliteMarkdown.savePicGoCLIDraft=async()=>{throw Error('disk failure');};await f.c.saveImageUploadSettings();
 assert.equal(f.visible(),true);assert.equal(f.state.imageUploadMode,'local');assert.equal(f.state.picGoCLIDraft,undefined);assert.equal(f.fields['#picGoCLIUploadStatus'].textContent,'picGoCLIDraftSaveFailed');
});
test('click handlers do not treat a DOM event as permission to enable',()=>{
 assert.match(source,/saveImageUploadSettings'\)\.addEventListener\('click', \(\) => saveImageUploadSettings\(false\)\)/);
 assert.match(source,/enableVerifiedPicGoCLI'\)\.addEventListener\('click', \(\) => saveImageUploadSettings\(true\)\)/);
});
