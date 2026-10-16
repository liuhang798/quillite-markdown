// Actual browser input, synthetic file-dialog/asset responses. No real files/providers.
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import {readFileSync} from 'node:fs';
import {createServer} from 'vite';
const {chromium}=createRequire(import.meta.url)(process.env.PLAYWRIGHT_MODULE||'playwright');
const output=process.env.AUDIT_OUTPUT;if(!output)throw Error('AUDIT_OUTPUT required');
const imageData='data:image/png;base64,'+readFileSync(new URL('../../build/appicon.png',import.meta.url)).toString('base64');
const server=await createServer({root:fileURLToPath(new URL('..',import.meta.url)),server:{host:'127.0.0.1',port:0,watch:null,hmr:false},logLevel:'error'});
const cases=['move-caret','edit-before','edit-target','reopen-dialog','switch-document','reopen-document','late-error','picker-cancel','current-error'];
let browser;const results=[];
try{
 await server.listen();browser=await chromium.launch({headless:true,executablePath:process.env.BROWSER_EXECUTABLE||undefined});
 for(const presentation of ['live','source'])for(const name of cases){
  const id=`${presentation}-${name}`,page=await browser.newPage({viewport:{width:1400,height:1000}}),errors=[];page.setDefaultTimeout(8000);page.on('pageerror',e=>errors.push(e.message));page.on('dialog',d=>d.accept());
  await page.route('**/*',r=>{const u=new URL(r.request().url());if(u.hostname!=='127.0.0.1')return r.abort();if(u.pathname.startsWith('/assets/'))return r.fulfill({path:fileURLToPath(new URL('../../build/appicon.png',import.meta.url)),contentType:'image/png'});return r.continue();});
  const shot=suffix=>page.screenshot({path:`${output}/${id}-${suffix}.png`,animations:'disabled'});
  try{
   await page.goto(server.resolvedUrls.local[0]);await page.evaluate(()=>import('/src/main.js'));
   await page.evaluate(imageData=>{
    const doc=(path,content)=>({path,name:path,directory:'.',content,revision:'a'.repeat(64)});
    window.insertAudit={next:doc('A.md','ALPHA\n\nOMEGA'),calls:[]};Object.assign(window.quilliteMarkdown,{
     openFile:async()=>({...insertAudit.next}),selectImage:path=>new Promise((resolve,reject)=>insertAudit.calls.push({path,resolve,reject})),readImageData:async()=>imageData,
    });
   },imageData);
   await page.locator('#openFileButton').click();await page.locator('#editButton').click();await page.locator(`[data-editor-presentation="${presentation}"]`).click();
   const editor=page.locator('#markdownEditor > .cm-editor'),content=editor.locator('> .cm-scroller > .cm-content');
   const read=()=>editor.evaluate(async el=>{const{EditorView}=await import('/node_modules/@codemirror/view/dist/index.js');const{undoDepth}=await import('/node_modules/@codemirror/commands/dist/index.js');const view=EditorView.findFromDOM(el);return{doc:view.state.doc.toString(),undo:undoDepth(view.state)};});
   const initial=await read();
   await content.click();await page.keyboard.press(name==='edit-before'?'Control+End':'Control+Home');if(name!=='edit-before')await page.keyboard.press(name==='edit-target'?'Shift+End':'End');
   const openImage=async()=>{const button=page.locator('[data-format="image"]');if(await button.isVisible())await button.click();else{await page.locator('#moreFormatButton').click();await page.locator('#moreFormatMenu [data-format-command="image"]:visible').click();}await page.locator('#imageDialog').waitFor({state:'visible'});};
   await openImage();await page.locator('#imageAltInput').fill('Original caption');await page.locator('#imageWidth').focus();await page.keyboard.press('Home');for(let i=0;i<8;i++)await page.keyboard.press('ArrowRight');
   await page.locator('#pickLocalImage').click();await page.waitForFunction(()=>insertAudit.calls.length===1);await shot('01-pending');
   if(name==='move-caret'){await content.click();await page.keyboard.press('Control+End');}
   if(name==='edit-before'){await content.click();await page.keyboard.press('Control+Home');await page.keyboard.insertText('PREFIX ');}
   if(name==='edit-target'){await content.focus();await page.keyboard.press('Control+Home');await page.keyboard.press('Shift+End');await page.keyboard.insertText('REPLACED');}
   if(name==='reopen-dialog'){await openImage();await page.locator('#imageAltInput').fill('Later caption');await page.locator('#imageWidth').focus();await page.keyboard.press('End');await page.locator('#imageUrl').fill('https://example.test/later.png');}
   if(['switch-document','reopen-document','late-error'].includes(name)){
    await page.evaluate(same=>{insertAudit.next={path:same?'A.md':'B.md',name:same?'A.md':'B.md',directory:'.',content:'NEW DOCUMENT',revision:'b'.repeat(64)};},name==='reopen-document');await page.locator('#openFileButton').click();if(!await page.locator('#editorView').isVisible())await page.locator('#editButton').click();
   }
   const beforeComplete=await read();
   await page.evaluate(name=>{const c=insertAudit.calls[0];if(name.endsWith('error'))c.reject(Error('Synthetic image picker failure'));else c.resolve(name==='picker-cancel'?'':'assets/synthetic.png');},name);
   await page.waitForTimeout(250);await shot('02-returned');const after=await read();
   if(['switch-document','reopen-document','late-error','picker-cancel','current-error','edit-target'].includes(name))assert.deepEqual(after,beforeComplete,'Cancelled/obsolete insertion must not change document or history');
   else{
    const markup='<img src="assets/synthetic.png" alt="Original caption" width="50%">';
    const expected=name==='edit-before'?'PREFIX ALPHA\n\nOMEGA'+markup:'ALPHA'+markup+'\n\nOMEGA';
    assert.equal(after.doc,expected,'Insertion must use the original mapped range and captured caption/width');
    if(presentation==='live')await page.waitForFunction(()=>[...document.querySelectorAll('#markdownEditor img')].some(img=>img.complete&&img.naturalWidth>0));
    if(name==='reopen-dialog'){
     assert.equal(await page.locator('#imageDialog').isVisible(),true);assert.equal(await page.locator('#imageAltInput').inputValue(),'Later caption');assert.equal(await page.locator('#imageUrl').evaluate(el=>el===document.activeElement),true,'Old completion must not steal focus from a newer dialog');await page.locator('#cancelImage').click();
    }
    await content.focus();await page.keyboard.press('Control+z');assert.deepEqual((await read()).doc,beforeComplete.doc,'One undo removes only the insertion');
   }
   if(name==='late-error')assert.equal(await page.locator('#toast').isVisible(),false,'Old document must not receive a stale image error');
   if(name==='current-error')assert.equal(await page.locator('#toast').isVisible(),true,'Current failure must remain visible');
   assert.deepEqual(errors,[]);results.push({id,passed:true});
  }catch(error){await shot('failure');results.push({id,passed:false,error:error.message,pageErrors:errors});}
  console.log(JSON.stringify(results.at(-1)));await page.close();
 }
 console.log(JSON.stringify({PASS:results.filter(r=>r.passed).length,total:results.length,transport:'synthetic asset/dialog responses'}));assert.ok(results.every(r=>r.passed));
}finally{await browser?.close();await server.close();}
