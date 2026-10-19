// Actual controls, synthetic backend responses only; never uploads or signs in.
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import {createServer} from 'vite';
const {chromium}=createRequire(import.meta.url)(process.env.PLAYWRIGHT_MODULE||'playwright');
const server=await createServer({root:fileURLToPath(new URL('..',import.meta.url)),server:{host:'127.0.0.1',port:0,watch:null,hmr:false},logLevel:'error'});
let browser,page;
const results=[];
try {
 await server.listen();browser=await chromium.launch({headless:true,executablePath:process.env.BROWSER_EXECUTABLE||undefined});
 for(const language of ['zh-CN','en'])for(const width of [1400,820])for(const mode of ['local','embedded','picgo','picgo-cloud']){
  const id=`${language}-${width}-${mode}`;page=await browser.newPage({viewport:{width,height:1000}});page.setDefaultTimeout(10000);const errors=[];
  page.on('pageerror',e=>errors.push(e.message));await page.route('**/*',r=>new URL(r.request().url()).hostname==='127.0.0.1'?r.continue():r.abort());
  await page.addInitScript(language=>localStorage.setItem('language',language),language);
  const shot=async step=>{if(process.env.AUDIT_OUTPUT){await page.locator('#imageUploadSettingsDialog').evaluate(el=>Promise.all(el.getAnimations({subtree:true}).map(a=>a.finished)));await page.screenshot({path:`${process.env.AUDIT_OUTPUT}/${id}-${step}.png`});}};
  try {
   await page.goto(server.resolvedUrls.local[0]);await page.evaluate(()=>import('/src/main.js'));await page.locator('#newFileButton').click();
   await page.locator('[data-editor-presentation="source"]').click();const editor=page.locator('#markdownEditor > .cm-editor');await editor.locator('> .cm-scroller > .cm-content').fill('Keep this document\n\nUnchanged paragraph');
   await page.locator('[data-editor-presentation="live"]').click();
   const read=()=>editor.evaluate(async el=>{const {EditorView}=await import('/node_modules/@codemirror/view/dist/index.js');const{undoDepth}=await import('/node_modules/@codemirror/commands/dist/index.js');const view=EditorView.findFromDOM(el);return {doc:view.state.doc.toString(),undo:undoDepth(view.state)};});
   const before=await read();
   await page.evaluate(()=>{
    window.storageAudit={fail:true,calls:[],saved:null};
    Object.assign(window.quilliteMarkdown,{
     setImageUploadSettings:async input=>{storageAudit.calls.push({...input});if(storageAudit.fail)throw Error('Synthetic settings failure');storageAudit.saved={mode:input.mode,serverUrl:input.serverUrl,hasSecret:false,hasCloudToken:input.mode==='picgo-cloud'};return storageAudit.saved;},
     testPicGo:async()=>({connected:true}),loginPicGoCloud:async()=>({connected:true,user:'Synthetic test account'}),testPicGoCloud:async()=>({connected:true,user:'Synthetic test account'}),
    });
   });
   const open=async()=>{await page.locator('#moreButton').click();await page.locator('[data-action="image-upload-settings"]').click();await page.locator('#imageUploadSettingsDialog').waitFor({state:'visible'});};
   await open();const dialog=page.locator('#imageUploadSettingsDialog'),save=page.locator('#saveImageUploadSettings');
   await dialog.locator(`[name="imageUploadMode"][value="${mode}"]`).check();
   if(mode==='picgo')await page.locator('#picGoInstalledNext').click();
   if(mode==='picgo-cloud')await page.locator('#loginPicGoCloud').click();
   await page.waitForFunction(()=>!document.querySelector('#saveImageUploadSettings').disabled);
   await save.click();await page.waitForFunction(()=>storageAudit.calls.length===1&&!document.querySelector('#saveImageUploadSettings').disabled);
   await shot('01-save-failed');
   assert.equal(await dialog.isVisible(),true,'Failure must keep settings open');
   const visibleErrors=await dialog.locator('.error:visible').allTextContents();
   assert.ok(visibleErrors.some(t=>t.includes(language==='en'?'Unable to save image hosting settings':'图床设置保存失败')),'Save failure must be visible in '+mode+': '+JSON.stringify(visibleErrors));
   assert.equal(await dialog.locator('input[name="imageUploadMode"]:checked').inputValue(),mode,'Failed save keeps chosen mode');
   assert.deepEqual(await read(),before,'Failed save leaves document/history untouched');
   await page.evaluate(()=>{storageAudit.fail=false;});await save.click();await dialog.waitFor({state:'hidden'});
   assert.equal(await page.evaluate(()=>storageAudit.saved.mode),mode);assert.deepEqual(await read(),before,'Settings retry leaves document/history untouched');
   await open();assert.equal(await dialog.locator('input[name="imageUploadMode"]:checked').inputValue(),mode);
   assert.equal(await dialog.locator('.error:visible').count(),0,'Reopening clears obsolete save failure');await shot('02-reopened');
   await page.locator('#cancelImageUploadSettings').click();assert.deepEqual(await read(),before);assert.deepEqual(errors,[]);
   results.push({id,passed:true,mode,errorVisible:true,retry:true,reopen:true,documentUnchanged:true,pageErrors:errors});
  }catch(error){await shot('failure');results.push({id,passed:false,error:error.message,pageErrors:errors});}
  console.log(JSON.stringify(results.at(-1)));await page.close();page=null;
 }
 console.log(JSON.stringify({PASS:results.filter(r=>r.passed).length,total:results.length,transport:'synthetic only'}));
 assert.ok(results.every(r=>r.passed),'Image storage settings flow failed');
}finally{await browser?.close();await server.close();}
