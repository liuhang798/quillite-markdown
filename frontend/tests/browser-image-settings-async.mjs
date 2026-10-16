// Deferred synthetic transport; all user actions use real isolated browser controls.
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import {createServer} from 'vite';
const {chromium}=createRequire(import.meta.url)(process.env.PLAYWRIGHT_MODULE||'playwright');
const server=await createServer({root:fileURLToPath(new URL('..',import.meta.url)),server:{host:'127.0.0.1',port:0,watch:null,hmr:false},logLevel:'error'});
const scenarios=['save-reopen-success','save-reopen-failure','save-change-success','save-change-failure','save-serialized','save-close-success','cloud-latest-failure','cloud-latest-success','cloud-reopen-failure','login-reopen-failure','login-reopen-success','logout-change','logout-reopen','local-field-change'];
let browser;const results=[];
try{
 await server.listen();browser=await chromium.launch({headless:true,executablePath:process.env.BROWSER_EXECUTABLE||undefined});
 for(const language of ['zh-CN','en'])for(const scenario of scenarios){
  const id=`${language}-${scenario}`,page=await browser.newPage({viewport:{width:1200,height:1000}}),errors=[];
  page.setDefaultTimeout(8000);page.on('pageerror',e=>errors.push(e.message));
  await page.route('**/*',r=>new URL(r.request().url()).hostname==='127.0.0.1'?r.continue():r.abort());
  await page.addInitScript(language=>localStorage.setItem('language',language),language);
  const dialog=page.locator('#imageUploadSettingsDialog'),save=page.locator('#saveImageUploadSettings');
  const shot=async step=>{if(process.env.AUDIT_OUTPUT){await dialog.evaluate(el=>Promise.all(el.getAnimations({subtree:true}).map(a=>a.finished)));await page.screenshot({path:`${process.env.AUDIT_OUTPUT}/${id}-${step}.png`});}};
  const open=async()=>{await page.locator('#moreButton').click();await page.locator('[data-action="image-upload-settings"]').click();await dialog.waitFor({state:'visible'});};
  const close=()=>page.locator('#cancelImageUploadSettings').click();
  const mode=value=>dialog.locator(`[name="imageUploadMode"][value="${value}"]`).check();
  const waitCalls=(kind,n)=>page.waitForFunction(({kind,n})=>storageAsync.calls.filter(c=>c.kind===kind).length===n,{kind,n});
  const complete=(kind,index,fail=false)=>page.evaluate(({kind,index,fail})=>{const call=storageAsync.calls.filter(c=>c.kind===kind)[index];if(!call)throw Error('Missing deferred call');fail?call.reject(Error('Synthetic delayed failure')):call.resolve(kind==='save'?{mode:call.input.mode,serverUrl:call.input.serverUrl,hasCloudToken:storageAsync.token}:kind==='logout'?{mode:'local',hasCloudToken:false}:{connected:true,user:'Synthetic current account'});},{kind,index,fail});
  try{
   await page.goto(server.resolvedUrls.local[0]);await page.evaluate(()=>import('/src/main.js'));await page.locator('#newFileButton').click();
   await page.locator('[data-editor-presentation="source"]').click();const editor=page.locator('#markdownEditor > .cm-editor');await editor.locator('> .cm-scroller > .cm-content').fill('Synthetic async audit\n\nKeep document and undo history');await page.locator('[data-editor-presentation="live"]').click();
   const read=()=>editor.evaluate(async el=>{const{EditorView}=await import('/node_modules/@codemirror/view/dist/index.js');const{undoDepth}=await import('/node_modules/@codemirror/commands/dist/index.js');const view=EditorView.findFromDOM(el);return{doc:view.state.doc.toString(),undo:undoDepth(view.state)};});const before=await read();
   await page.evaluate(()=>{
    window.storageAsync={calls:[],deferLogin:false,token:false};
    const deferred=(kind,input)=>new Promise((resolve,reject)=>storageAsync.calls.push({kind,input,resolve,reject}));
    Object.assign(window.quilliteMarkdown,{
     setImageUploadSettings:input=>deferred('save',input),testPicGo:async()=>({connected:true}),
     loginPicGoCloud:async()=>{const result=storageAsync.deferLogin?await deferred('login'):{connected:true,user:'Synthetic current account'};storageAsync.token=true;return result;},
     testPicGoCloud:()=>deferred('test'),logoutPicGoCloud:async()=>{const result=await deferred('logout');storageAsync.token=false;return result;},
    });
   });
   await open();
   if(scenario.startsWith('save-')){
    await mode('embedded');await save.click();await waitCalls('save',1);
    if(scenario==='save-close-success'){
     await close();await complete('save',0);await page.waitForTimeout(150);await open();assert.equal(await dialog.locator('[name="imageUploadMode"]:checked').inputValue(),'embedded','Completed write must remain the committed preference even when closed');
     assert.deepEqual(await read(),before);await shot('03-committed');await close();results.push({id,passed:true,documentUnchanged:true});console.log(JSON.stringify(results.at(-1)));await page.close();continue;
    }
    if(scenario.includes('reopen')){await close();await open();}
    await mode('local');await shot('01-pending');
    if(scenario==='save-serialized'){
     assert.equal(await save.isDisabled(),true,'A pending write must not allow a second save');
     await mode('picgo-cloud');assert.equal(await page.locator('#loginPicGoCloud').isDisabled(),true,'Saving and credential mutations must not overlap');await mode('local');
    }
    await complete('save',0,scenario.endsWith('failure'));
    await page.waitForTimeout(150);await shot('02-returned');
    assert.equal(await dialog.isVisible(),true,'Old save must not close changed/reopened settings');
    assert.equal(await dialog.locator('[name="imageUploadMode"]:checked').inputValue(),'local');
    assert.equal(await dialog.locator('.error:visible').count(),0,'Old error must not appear on a new choice');
    assert.equal(await save.isEnabled(),true);
    await save.click();await waitCalls('save',2);await complete('save',1);await dialog.waitFor({state:'hidden'});await open();
    assert.equal(await dialog.locator('[name="imageUploadMode"]:checked').inputValue(),'local');
   }else if(scenario.startsWith('cloud-')){
    await mode('picgo-cloud');await page.locator('#loginPicGoCloud').click();await page.waitForFunction(()=>!document.querySelector('#saveImageUploadSettings').disabled);
    if(scenario.includes('reopen')){await save.click();await waitCalls('save',1);await complete('save',0);await dialog.waitFor({state:'hidden'});await open();await waitCalls('test',1);await close();await open();}
    else{await mode('local');await mode('picgo-cloud');await waitCalls('test',1);await mode('local');await mode('picgo-cloud');}
    const latestFails=scenario==='cloud-latest-success';
    await waitCalls('test',2);await complete('test',1,latestFails);await page.waitForTimeout(100);
    await complete('test',0,!latestFails);await page.waitForTimeout(150);await shot('02-old-check-returned');
    assert.equal(await save.isEnabled(),!latestFails,'Old result must not replace the newest connection state');
    assert.equal(await dialog.locator('.error:visible').count(),latestFails?1:0);assert.equal(await page.locator('#picGoCloudAccount').isVisible(),!latestFails);
   }else if(scenario.startsWith('login-reopen-')){
    await page.evaluate(()=>{storageAsync.deferLogin=true;});await mode('picgo-cloud');await page.locator('#loginPicGoCloud').click();await waitCalls('login',1);await close();await open();await mode('picgo-cloud');
    await complete('login',0,scenario.endsWith('failure'));await page.waitForTimeout(150);await shot('02-old-login-returned');
    assert.equal(await dialog.locator('.error:visible').count(),0,'Old login failure must not leak into a reopened dialog');assert.equal(await page.locator('#loginPicGoCloud').isEnabled(),true);
    if(scenario.endsWith('success')){
     assert.equal(await page.locator('#testPicGoCloud').isVisible(),true,'Newly stored credentials must remain available');await page.locator('#testPicGoCloud').click();await waitCalls('test',1);await complete('test',0);await page.waitForFunction(()=>!document.querySelector('#saveImageUploadSettings').disabled);
    }
   }else if(scenario==='local-field-change'){
    await mode('picgo');await page.locator('#picGoInstalledNext').click();await page.waitForFunction(()=>!document.querySelector('#saveImageUploadSettings').disabled);await save.click();await waitCalls('save',1);
    await page.locator('#picGoAdvancedSettings > summary').click();await page.locator('#picGoServerURL').fill('http://127.0.0.1:36678');await complete('save',0);await page.waitForTimeout(150);await shot('02-old-save-returned');
    assert.equal(await dialog.isVisible(),true);assert.equal(await page.locator('#picGoServerURL').inputValue(),'http://127.0.0.1:36678');assert.equal(await save.isDisabled(),true,'Changed server must be tested again');
   }else{
    await mode('picgo-cloud');await page.locator('#loginPicGoCloud').click();await page.waitForFunction(()=>!document.querySelector('#saveImageUploadSettings').disabled);await page.locator('#logoutPicGoCloud').click();await waitCalls('logout',1);
    if(scenario.endsWith('reopen')){await close();await open();}await mode('embedded');await complete('logout',0);await page.waitForTimeout(150);await shot('02-old-logout-returned');
    assert.equal(await dialog.locator('[name="imageUploadMode"]:checked').inputValue(),'embedded','Logout must not replace a newer unsaved mode choice');assert.equal(await save.isEnabled(),true);
   }
   assert.deepEqual(await read(),before,'Settings operations must preserve document and undo history');assert.deepEqual(errors,[]);await shot('03-verified');await close();results.push({id,passed:true,documentUnchanged:true});
  }catch(error){await shot('failure');results.push({id,passed:false,error:error.message,pageErrors:errors});}
  console.log(JSON.stringify(results.at(-1)));await page.close();
 }
 console.log(JSON.stringify({PASS:results.filter(r=>r.passed).length,total:results.length,transport:'synthetic deferred responses only'}));assert.ok(results.every(r=>r.passed),'Image settings async isolation failed');
}finally{await browser?.close();await server.close();}
