// Real UI/keyboard; synthetic files, authentication and upload responses.
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import {readFileSync} from 'node:fs';
import {createServer} from 'vite';
const {chromium}=createRequire(import.meta.url)(process.env.PLAYWRIGHT_MODULE||'playwright');
const output=process.env.AUDIT_OUTPUT;if(!output)throw Error('AUDIT_OUTPUT required');
const imagePath=fileURLToPath(new URL('../../build/appicon.png',import.meta.url));
const imageData='data:image/png;base64,'+readFileSync(imagePath).toString('base64');
const server=await createServer({root:fileURLToPath(new URL('..',import.meta.url)),server:{host:'127.0.0.1',port:0,watch:null,hmr:false},logLevel:'error'});
let browser;const results=[];
try{
 await server.listen();browser=await chromium.launch({headless:true,executablePath:process.env.BROWSER_EXECUTABLE||undefined});
 for(const mode of ['picgo','picgo-cloud'])for(const scenario of (mode==='picgo'?['same','switch']:['same','switch','relogin']))for(const failure of ['401','timeout','invalid-response']){
  const id=`${mode}-${scenario}-${failure}`,page=await browser.newPage({viewport:{width:1400,height:1000}}),errors=[];
  page.setDefaultTimeout(8000);page.on('pageerror',e=>errors.push(e.message));page.on('dialog',d=>d.accept());
  await page.route('**/*',r=>{const u=new URL(r.request().url());if(u.href==='https://example.test/retry.png')return r.fulfill({path:imagePath,contentType:'image/png'});if(u.hostname!=='127.0.0.1')return r.abort();if(u.pathname.startsWith('/assets/'))return r.fulfill({path:imagePath,contentType:'image/png'});return r.continue();});
  const shot=step=>page.screenshot({path:`${output}/${id}-${step}.png`,animations:'disabled'});
  const editor=page.locator('#markdownEditor > .cm-editor'),content=editor.locator('> .cm-scroller > .cm-content');
  const read=()=>editor.evaluate(async el=>{const{EditorView}=await import('/node_modules/@codemirror/view/dist/index.js');return EditorView.findFromDOM(el).state.doc.toString();});
  const settings=async()=>{await page.locator('#moreButton').click();await page.locator('[data-action="image-upload-settings"]').click();};
  const dismiss=async()=>{if(await page.locator('#closeToast').isVisible())await page.locator('#closeToast').click();};
  try{
   await page.goto(server.resolvedUrls.local[0]);await page.evaluate(()=>import('/src/main.js'));
   await page.evaluate(imageData=>{
    window.failureAudit={calls:[],logins:0,connected:false,next:{path:'A.md',name:'A.md',directory:'.',content:'ALPHA',revision:'a'.repeat(64)}};
    const upload=(path,image,operationId)=>new Promise((resolve,reject)=>failureAudit.calls.push({path,image,operationId,resolve,reject}));
    Object.assign(quilliteMarkdown,{openFile:async()=>({...failureAudit.next}),selectImage:async()=>`assets/${failureAudit.calls.length}.png`,readImageData:async()=>imageData,
     setImageUploadSettings:async input=>({mode:input.mode,serverUrl:input.serverUrl,hasCloudToken:failureAudit.connected}),testPicGo:async()=>({connected:true}),
     loginPicGoCloud:async()=>{failureAudit.connected=true;return{connected:true,user:`Synthetic ${++failureAudit.logins}`};},testPicGoCloud:async()=>({connected:failureAudit.connected,user:`Synthetic ${failureAudit.logins}`}),
     logoutPicGoCloud:async()=>{failureAudit.connected=false;return{mode:'local',hasCloudToken:false};},
     uploadImageToPicGo:upload,uploadImageToPicGoCloud:upload});
   },imageData);
   await page.locator('#openFileButton').click();await page.locator('#editButton').click();
   await settings();await page.locator(`[name="imageUploadMode"][value="${mode}"]`).check();
   if(mode==='picgo')await page.locator('#picGoInstalledNext').click();else await page.locator('#loginPicGoCloud').click();
   await page.locator('#saveImageUploadSettings').click();await page.locator('#imageUploadSettingsDialog').waitFor({state:'hidden'});await dismiss();
   const insert=async()=>{const button=page.locator('[data-format="image"]');if(await button.isVisible())await button.click();else{await page.locator('#moreFormatButton').click();await page.locator('#moreFormatMenu [data-format-command="image"]:visible').click();}await page.locator('#pickLocalImage').click();};
   await content.focus();await page.keyboard.press('Control+End');await insert();await page.waitForFunction(()=>failureAudit.calls.length===1);await shot('01-pending');
   if(scenario==='switch'){
    await page.evaluate(()=>{failureAudit.next={path:'B.md',name:'B.md',directory:'.',content:'BETA',revision:'b'.repeat(64)};});await page.locator('#openFileButton').click();await page.locator('#editButton').click();
   }else if(scenario==='relogin'){
    await settings();await page.locator('#logoutPicGoCloud').click();await page.locator('[name="imageUploadMode"][value="picgo-cloud"]').check();await page.locator('#loginPicGoCloud').click();await page.waitForFunction(()=>failureAudit.logins===2);
    await page.locator('#saveImageUploadSettings').click();await page.locator('#imageUploadSettingsDialog').waitFor({state:'hidden'});await dismiss();
   }
   await page.evaluate(failure=>failureAudit.calls[0].reject(Error(`Synthetic ${failure}`)),failure);
   await page.locator('#imageUploadProgress').waitFor({state:'hidden'});await page.waitForTimeout(200);
   const fallback=await read();
   if(scenario==='switch'){
    assert.equal(fallback,'BETA');assert.equal(await page.locator('#toast').isVisible(),false,'Old upload error must stay out of the new document');
   }else{
    assert.match(fallback,/ALPHA!\[[^\]]*\]\(assets\/0.png\)/);assert.match(await page.locator('#toast').textContent(),/本地/);
    await page.waitForFunction(()=>[...document.querySelectorAll('#markdownEditor img')].some(i=>i.complete&&i.naturalWidth>0));
   }
   await shot('02-failed-return');assert.equal(await page.evaluate(()=>failureAudit.calls.length),1,'No automatic retry');
   if(scenario==='relogin'){
    await dismiss();await settings();await page.locator('#picGoCloudUser').filter({hasText:'Synthetic 2'}).waitFor();await shot('03-new-login-preserved');
    await page.locator('#saveImageUploadSettings').click();await page.locator('#imageUploadSettingsDialog').waitFor({state:'hidden'});
   }
   await dismiss();await content.focus();await page.keyboard.press('Control+End');await insert();await page.waitForFunction(()=>failureAudit.calls.length===2);
   await page.evaluate(()=>failureAudit.calls[1].resolve('https://example.test/retry.png'));
   await page.waitForFunction(()=>[...document.querySelectorAll('#markdownEditor img')].some(i=>i.complete&&i.naturalWidth>0&&i.src==='https://example.test/retry.png'));
   await page.locator('#imageUploadProgress').waitFor({state:'hidden'});const retried=await read();assert.ok(retried.includes('https://example.test/retry.png'));assert.ok(retried.startsWith(scenario==='switch'?'BETA':'ALPHA'));
   await shot('04-manual-retry');await content.focus();await page.keyboard.press('Control+z');assert.equal(await read(),fallback,'Undo only removes the manual retry');await page.keyboard.press('Control+y');assert.equal(await read(),retried);
   assert.deepEqual(errors,[]);results.push({id,passed:true});
  }catch(error){await shot('failure');results.push({id,passed:false,error:error.message,pageErrors:errors});}
  console.log(JSON.stringify(results.at(-1)));await page.close();
 }
 console.log(JSON.stringify({PASS:results.filter(r=>r.passed).length,total:results.length,scope:'UI upload failure/fallback/manual retry; synthetic services, not real authentication'}));assert.ok(results.every(r=>r.passed));
}finally{await browser?.close();await server.close();}
