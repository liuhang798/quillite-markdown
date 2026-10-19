// Actual UI starts both uploads. Deferred services and progress events are synthetic.
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import {createServer} from 'vite';
const {chromium}=createRequire(import.meta.url)(process.env.PLAYWRIGHT_MODULE||'playwright');
const output=process.env.AUDIT_OUTPUT;if(!output)throw Error('AUDIT_OUTPUT required');
const server=await createServer({root:fileURLToPath(new URL('..',import.meta.url)),server:{host:'127.0.0.1',port:0,watch:null,hmr:false},logLevel:'error'});
let browser;const results=[];
try{
 await server.listen();browser=await chromium.launch({headless:true,executablePath:process.env.BROWSER_EXECUTABLE||undefined});
 for(const mode of ['picgo','picgo-cloud'])for(const scenario of ['concurrent','switch-and-new','settings-change']){
  const page=await browser.newPage({viewport:{width:1400,height:1000}}),errors=[];page.setDefaultTimeout(8000);page.on('pageerror',e=>errors.push(e.message));page.on('dialog',d=>d.accept());
  await page.route('**/*',r=>new URL(r.request().url()).hostname==='127.0.0.1'?r.continue():r.abort());
  await page.addInitScript(()=>{let api;Object.defineProperty(window,'quilliteMarkdown',{get:()=>api,set:value=>{api=value;api.onImageUploadProgress=callback=>{window.progressAuditEvent=callback;return()=>{};};}});});
  const shot=step=>page.screenshot({path:`${output}/${mode}-${scenario}-${step}.png`,animations:'disabled'});
  try{
   await page.goto(server.resolvedUrls.local[0]);await page.evaluate(()=>import('/src/main.js'));
   await page.evaluate(()=>{window.progressAudit={calls:[],next:{path:'A.md',name:'A.md',directory:'.',content:'ALPHA',revision:'a'.repeat(64)}};
    const upload=(path,image,operationId)=>new Promise((resolve,reject)=>progressAudit.calls.push({path,image,operationId,resolve,reject}));
    Object.assign(quilliteMarkdown,{openFile:async()=>({...progressAudit.next}),selectImage:async()=>`assets/${progressAudit.calls.length}.png`,setImageUploadSettings:async input=>({mode:input.mode,serverUrl:input.serverUrl}),testPicGo:async()=>({connected:true}),loginPicGoCloud:async()=>({connected:true,user:'Synthetic account'}),testPicGoCloud:async()=>({connected:true,user:'Synthetic account'}),uploadImageToPicGo:upload,uploadImageToPicGoCloud:upload});});
   await page.locator('#openFileButton').click();await page.locator('#editButton').click();
   await page.locator('#moreButton').click();await page.locator('[data-action="image-upload-settings"]').click();await page.locator(`[name="imageUploadMode"][value="${mode}"]`).check();
   if(mode==='picgo')await page.locator('#picGoInstalledNext').click();else await page.locator('#loginPicGoCloud').click();
   await page.locator('#saveImageUploadSettings').click();await page.locator('#imageUploadSettingsDialog').waitFor({state:'hidden'});await page.locator('#closeToast').click();
   const insert=async()=>{const button=page.locator('[data-format="image"]');if(await button.isVisible())await button.click();else{await page.locator('#moreFormatButton').click();await page.locator('#moreFormatMenu [data-format-command="image"]:visible').click();}await page.locator('#pickLocalImage').click();};
   await insert();await page.waitForFunction(()=>progressAudit.calls.length===1);
   if(scenario==='switch-and-new'){await page.evaluate(()=>{progressAudit.next={path:'B.md',name:'B.md',directory:'.',content:'BETA',revision:'b'.repeat(64)};});await page.locator('#openFileButton').click();await page.locator('#editButton').click();}
   await insert();await page.waitForFunction(()=>progressAudit.calls.length===2);
   const ids=await page.evaluate(()=>progressAudit.calls.map(c=>c.operationId));assert.ok(ids.every(id=>typeof id==='string'&&id.length>0));assert.notEqual(ids[0],ids[1]);
   await page.evaluate(()=>progressAuditEvent({operationId:progressAudit.calls[1].operationId,phase:'uploading',done:30,total:100}));assert.equal(await page.locator('#imageUploadProgressPercent').textContent(),'30%');await shot('01-new-upload');
   if(scenario==='settings-change'){await page.locator('#moreButton').click();await page.locator('[data-action="image-upload-settings"]').click();await page.locator('[name="imageUploadMode"][value="local"]').check();await page.locator('#saveImageUploadSettings').click();await page.locator('#imageUploadSettingsDialog').waitFor({state:'hidden'});}
   await page.evaluate(()=>progressAuditEvent({operationId:progressAudit.calls[0].operationId,phase:'uploading',done:90,total:100}));await shot('02-old-event');
   assert.equal(await page.locator('#imageUploadProgressPercent').textContent(),'30%','An older upload must not overwrite the current upload progress');
   await page.evaluate(()=>progressAuditEvent({phase:'complete',done:100,total:100}));assert.equal(await page.locator('#imageUploadProgressPercent').textContent(),'30%','Untagged events must not affect a tracked operation');
   await page.evaluate(()=>progressAudit.calls[0].resolve('https://example.test/first.png'));await page.waitForTimeout(450);assert.equal(await page.locator('#imageUploadProgress').isVisible(),true);assert.equal(await page.locator('#imageUploadProgressPercent').textContent(),'30%','Old completion must not hide or complete the newer request');
   await page.evaluate(()=>progressAuditEvent({operationId:progressAudit.calls[1].operationId,phase:'uploading',done:60,total:100}));assert.equal(await page.locator('#imageUploadProgressPercent').textContent(),'60%');
   assert.match(await page.locator('#imageUploadProgressDetail').textContent(),mode==='picgo'?/本机 PicGo/:/PicGo Cloud/,'Provider description keeps the request snapshot');
   await page.evaluate(()=>progressAudit.calls[1].resolve('https://example.test/second.png'));await page.waitForTimeout(100);assert.equal(await page.locator('#imageUploadProgressPercent').textContent(),'100%');
   await page.evaluate(()=>progressAuditEvent({operationId:progressAudit.calls[1].operationId,phase:'uploading',done:20,total:100}));assert.equal(await page.locator('#imageUploadProgressPercent').textContent(),'100%','Completed operation cannot regress');await page.locator('#imageUploadProgress').waitFor({state:'hidden'});await shot('03-complete');
   assert.deepEqual(errors,[]);results.push({id:`${mode}-${scenario}`,passed:true});
  }catch(error){await shot('failure');results.push({id:`${mode}-${scenario}`,passed:false,error:error.message,pageErrors:errors});}
  console.log(JSON.stringify(results.at(-1)));await page.close();
 }
 console.log(JSON.stringify({PASS:results.filter(r=>r.passed).length,total:results.length,transport:'synthetic progress events'}));assert.ok(results.every(r=>r.passed));
}finally{await browser?.close();await server.close();}
