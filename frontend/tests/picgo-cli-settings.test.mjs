import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
const source=readFileSync(new URL('../src/renderer.js',import.meta.url),'utf8');
const section=(a,b)=>source.slice(source.indexOf(a),source.indexOf(b,source.indexOf(a)));
function setup(){
 const state={imageSettingsRevision:1,picGoCLIRun:0,imageSettingsMutation:''},calls=[],fields={'#picGoCLIPath':{value:'C:/中文 path/picgo.cmd'},'#picGoCLIStatus':{textContent:''}};
 let hidden=false,mode='picgo-cli';
 const context=vm.createContext({state,$:key=>fields[key],els:{imageUploadSettingsDialog:{classList:{contains:()=>hidden}}},selectedImageUploadMode:()=>mode,updatePicGoSettingsAvailability(){},t:k=>k,
 window:{quilliteMarkdown:{testPicGoCLI:path=>new Promise((resolve,reject)=>calls.push({path,resolve,reject}))}}});
 vm.runInContext(section('function imageSettingsResponseCurrent(', 'function beginImageSettingsMutation(')+section('async function testPicGoCLIConnection(', 'async function saveImageUploadSettings('),context);
 return {state,calls,fields,context,hide:()=>{hidden=true;context.invalidateImageSettingsResponses();},change:()=>{mode='local';context.invalidateImageSettingsResponses();}};
}
test('CLI version detection never enables uploading without an upload test',async()=>{
 const f=setup(),run=f.context.testPicGoCLIConnection();assert.equal(f.state.picGoCLIChecking,true);assert.equal(f.calls[0].path,'C:/中文 path/picgo.cmd');
 f.calls[0].resolve('3.2.0');await run;assert.equal(f.state.picGoCLIReady,false);assert.equal(f.state.picGoCLIChecking,false);
});
for(const action of ['hide','change'])test(`old CLI detection cannot enable settings after ${action}`,async()=>{
 const f=setup(),run=f.context.testPicGoCLIConnection();f[action]();f.calls[0].resolve('3.2.0');await run;assert.equal(f.state.picGoCLIReady,false);
});
test('latest CLI failure wins over older successful detection',async()=>{
 const f=setup(),old=f.context.testPicGoCLIConnection(),latest=f.context.testPicGoCLIConnection();f.calls[1].reject(Error('failed'));await latest;f.calls[0].resolve('3.2.0');await old;
 assert.equal(f.state.picGoCLIReady,false);assert.equal(f.fields['#picGoCLIStatus'].textContent,'picGoCLIFailed');
});
test('CLI upload routes independently and falls back without retry',async()=>{
 const calls=[],state={imageUploadOperationId:'test'},context=vm.createContext({state,beginImageUploadProgress:()=>1,finishImageUploadProgress(){},console:{warn(){}},window:{quilliteMarkdown:{uploadImageToPicGoCLI:async(...args)=>{calls.push(args);throw Error('timeout');}}}});
 vm.runInContext(section('async function uploadedOrLocalImagePath(', 'function beginImageUploadProgress('),context);
 const result=await context.uploadedOrLocalImagePath('assets/x.png',{path:'doc.md',mode:'picgo-cli'});
 assert.equal(result.path,'assets/x.png');assert.equal(result.fallback,true);assert.equal(calls.length,1);assert.deepEqual(calls[0],['doc.md','assets/x.png','test']);
});

function hostingSetup() {
 const state={imageSettingsRevision:0,picGoCLIRun:0,imageSettingsMutation:'',picGoCLIReady:false},calls=[],saves=[],prompts=[];
 const fields={'#picGoCLIPath':{value:'C:/runtime/picgo.cmd'},'#picGoCLIConfigPath':{value:'C:/hosting/config.json'},'#picGoCLIAllowHTTP':{checked:false},'#picGoCLIUploadStatus':{textContent:'',classList:{add(){},remove(){}}}};
 let hidden=false,confirmed=true;
 const context=vm.createContext({state,$:key=>fields[key],els:{imageUploadSettingsDialog:{classList:{contains:()=>hidden}}},selectedImageUploadMode:()=> 'picgo-cli',updatePicGoSettingsAvailability(){},t:k=>k,
 setInterval:f=>{context.tick=f;return 1;},clearInterval:()=>{context.tick=null;},
 window:{confirm:()=>confirmed,quilliteMarkdown:{onImageUploadProgress:callback=>{context.uploadProgress=callback;return()=>{context.uploadProgress=null;};},onPicGoCLILoginProgress:callback=>{context.progress=callback;return()=>{context.progress=null;};},cancelPicGoCLILogin:id=>{context.cancelled=id;return Promise.resolve();},testPicGoCLIUpload:(...args)=>new Promise((resolve,reject)=>calls.push({args,resolve,reject})),loginPicGoCLI:async()=> 'C:/separate/config.json',selectPicGoCLIConfig:async()=> 'C:/existing/config.json'}}});
 vm.runInContext(section('function imageSettingsResponseCurrent(', 'function setPicGoWizardStep(')+section('function picGoCLISetupError(', 'async function saveImageUploadSettings('),context);
 context.confirmPicGoCLIEnable=async()=>{prompts.push(true);return false;};
 context.saveImageUploadSettings=async()=>{assert.equal(state.imageSettingsMutation,'');saves.push(true);};
 return {state,fields,calls,context,saves,prompts,deny:()=>{confirmed=false;},hide:()=>{hidden=true;context.invalidateImageSettingsResponses();}};
}
test('hosting login selects a profile but cannot enable upload',async()=>{
 const f=hostingSetup();await f.context.configurePicGoCLIHosting('login');assert.equal(f.fields['#picGoCLIConfigPath'].value,'C:/separate/config.json');assert.equal(f.state.picGoCLIReady,false);assert.equal(f.calls.length,0);
});
test('test upload requires consent and sends only CLI/config paths',async()=>{
 const f=hostingSetup();f.deny();await f.context.configurePicGoCLIHosting('test');assert.equal(f.calls.length,0);
 const g=hostingSetup(),run=g.context.configurePicGoCLIHosting('test');assert.deepEqual(g.calls[0].args.slice(0,4),['C:/runtime/picgo.cmd','C:/hosting/config.json',true,false]);assert.match(g.calls[0].args[4],/^picgo-test-/);g.calls[0].resolve('https://example.org/test.png');await run;assert.equal(g.state.picGoCLIReady,true);
});
test('closing dialog invalidates late successful upload verification',async()=>{
 const f=hostingSetup(),run=f.context.configurePicGoCLIHosting('test');f.hide();assert.equal(f.context.tick,null);assert.equal(f.context.uploadProgress,null);f.calls[0].resolve('https://example.org/test.png');await run;assert.equal(f.state.picGoCLIReady,false);
});

test('upload verification phases reject stale events and clean up without retry',async()=>{
 const f=hostingSetup(),run=f.context.configurePicGoCLIHosting('test'),id=f.calls[0].args[4];
 f.context.uploadProgress({operationId:id,phase:'starting'});assert.match(f.fields['#picGoCLIUploadStatus'].textContent,/cliUploadStarting/);
 f.context.uploadProgress({operationId:'stale',phase:'finalizing'});assert.match(f.fields['#picGoCLIUploadStatus'].textContent,/cliUploadStarting/);
 f.context.uploadProgress({operationId:id,phase:'uploading'});assert.match(f.fields['#picGoCLIUploadStatus'].textContent,/cliUploadRunning/);
 f.calls[0].reject(Error('PICGO_CLI_TIMEOUT'));await run;
 assert.equal(f.context.uploadProgress,null);assert.equal(f.context.tick,null);assert.equal(f.calls.length,1);assert.equal(f.saves.length,0);
});
test('upload auth error stays actionable without enabling settings',async()=>{
 const f=hostingSetup(),run=f.context.configurePicGoCLIHosting('test');f.calls[0].reject(Error('PICGO_CLI_AUTH_REQUIRED'));await run;assert.equal(f.state.picGoCLIReady,false);assert.equal(f.fields['#picGoCLIUploadStatus'].textContent,'picGoCLIAuthRequired');
});
test('successful verification prompts, cancellation never saves or reuploads',async()=>{
 const f=hostingSetup(),run=f.context.configurePicGoCLIHosting('test');f.calls[0].resolve('https://example.org/test.png');await run;
 assert.equal(f.prompts.length,1);assert.equal(f.saves.length,0);assert.equal(f.calls.length,1);assert.equal(f.state.picGoCLIReady,true);
});
test('explicit enable confirmation saves once after releasing busy state',async()=>{
 const f=hostingSetup();f.context.confirmPicGoCLIEnable=async()=>true;
 const run=f.context.configurePicGoCLIHosting('test');await f.context.configurePicGoCLIHosting('test');assert.equal(f.calls.length,1);
 f.calls[0].resolve('https://example.org/test.png');await run;assert.equal(f.saves.length,1);
});
test('stale confirmation cannot save after the settings session changes',async()=>{
 const f=hostingSetup();let accept;f.context.confirmPicGoCLIEnable=()=>new Promise(r=>{accept=r;});
 const run=f.context.configurePicGoCLIHosting('test');f.calls[0].resolve('https://example.org/test.png');await new Promise(setImmediate);f.hide();accept(true);await run;
 assert.equal(f.saves.length,0);
});

test('HTTP policy is explicit and protocol refusal does not enable or retry uploading',async()=>{
 const f=hostingSetup();f.fields['#picGoCLIAllowHTTP'].checked=true;
 const run=f.context.configurePicGoCLIHosting('test');assert.equal(f.calls[0].args[3],true);
 f.calls[0].reject(Error('PICGO_CLI_HTTP_NOT_ALLOWED'));await run;
 assert.equal(f.fields['#picGoCLIUploadStatus'].textContent,'picGoCLIHTTPBlocked');
 assert.equal(f.state.picGoCLIReady,false);assert.equal(f.calls.length,1);assert.equal(f.saves.length,0);
 assert.equal(f.context.picGoCLISetupError('PICGO_CLI_OUTPUT_INVALID'),'picGoCLIOutputInvalid');
});

test('login or selecting another hosting configuration resets HTTP consent',async()=>{
 for(const action of ['login','select']){
  const f=hostingSetup();f.fields['#picGoCLIAllowHTTP'].checked=true;
  await f.context.configurePicGoCLIHosting(action);
  assert.equal(f.fields['#picGoCLIAllowHTTP'].checked,false);
 }
});

test('login progress fills pending profile, distinguishes checking, and rejects stale events',async()=>{
 const f=hostingSetup();let resolve;let args;
 f.context.window.quilliteMarkdown.loginPicGoCLI=(...a)=>{args=a;return new Promise(r=>resolve=r);};
 const run=f.context.configurePicGoCLIHosting('login'),id=f.state.picGoCLILoginOperation;
 assert.ok(id);assert.equal(args[3],false);
 f.context.progress({operationId:'stale',phase:'waiting',configPath:'WRONG'});
 assert.notEqual(f.fields['#picGoCLIConfigPath'].value,'WRONG');
 f.context.progress({operationId:id,phase:'waiting',configPath:'C:/pending/config.json'});
 assert.equal(f.fields['#picGoCLIConfigPath'].value,'C:/pending/config.json');
 assert.equal(f.fields['#picGoCLIUploadStatus'].textContent,'picGoCLILoggingIn');
 f.context.progress({operationId:id,phase:'checking',configPath:'C:/pending/config.json'});
 assert.equal(f.fields['#picGoCLIUploadStatus'].textContent,'picGoCLICheckingLogin');
 assert.equal(f.state.picGoCLIReady,false);
 resolve('C:/pending/config.json');await run;
 assert.equal(f.state.picGoCLILoginOperation,'');assert.equal(f.context.progress,null);assert.equal(f.saves.length,0);
});

test('closing settings cancels only its login and keeps the recoverable profile',async()=>{
 const f=hostingSetup();let reject;let force;
 f.context.window.quilliteMarkdown.loginPicGoCLI=(p,c,id,newProfile)=>{force=newProfile;return new Promise((_,r)=>reject=r);};
 const run=f.context.configurePicGoCLIHosting('reauthorize'),id=f.state.picGoCLILoginOperation,progress=f.context.progress;
 assert.equal(force,true);
 progress({operationId:id,phase:'waiting',configPath:'C:/pending/config.json'});
 f.hide();assert.equal(f.context.cancelled,id);
 progress({operationId:id,phase:'complete',configPath:'C:/stale/config.json'});
 reject(Error('PICGO_CLI_LOGIN_CANCELLED'));await run;
 assert.equal(f.state.picGoCLILoginConfigPath,'C:/pending/config.json');assert.equal(f.saves.length,0);
 assert.equal(f.context.progress,null);assert.equal(f.state.imageSettingsMutation,'');
 for(const [code,key] of [['PICGO_CLI_AUTH_CHECK_FAILED','picGoCLIAuthCheckFailed'],['PICGO_CLI_LOGIN_TIMEOUT','picGoCLILoginTimeout'],['PICGO_CLI_LOGIN_CANCELLED','picGoCLILoginCancelled']])assert.equal(f.context.picGoCLISetupError(code),key);
});
