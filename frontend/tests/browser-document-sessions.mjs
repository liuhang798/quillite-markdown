// Real UI input; file dialogs and disk responses are synthetic and isolated.
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import {createServer} from 'vite';
const {chromium}=createRequire(import.meta.url)(process.env.PLAYWRIGHT_MODULE||'playwright');
const output=process.env.AUDIT_OUTPUT;if(!output)throw Error('AUDIT_OUTPUT required');
const cases=['switch-live','switch-source','same-path-reopen','cancel-open','save-during-input','late-save-new','late-save-same','late-save-error','late-save-closed','save-receipt-mismatch','save-as-cancel','draft-manual-save'];
const server=await createServer({root:fileURLToPath(new URL('..',import.meta.url)),server:{host:'127.0.0.1',port:0,watch:null,hmr:false},logLevel:'error'});
let browser,page;const failures=[];
try{
 await server.listen();browser=await chromium.launch({headless:true,executablePath:process.env.BROWSER_EXECUTABLE||undefined});
 for(const name of cases){
  page=await browser.newPage({viewport:{width:1440,height:950}});page.setDefaultTimeout(8000);const errors=[];page.on('pageerror',e=>errors.push(e.message));
  page.on('dialog',d=>name==='cancel-open'?d.dismiss():d.accept());
  await page.route('**/*',r=>new URL(r.request().url()).hostname==='127.0.0.1'?r.continue():r.abort());
  const shot=suffix=>page.screenshot({path:`${output}/${name}-${suffix}.png`,animations:'disabled'});
  try{
   await page.goto(server.resolvedUrls.local[0]);await page.evaluate(async()=>{await import('/src/main.js');});
   await page.evaluate(()=>{
    const doc=(path,content)=>({path,name:path,directory:'.',content,revision:'a'.repeat(64)});
    const audit=window.sessionAudit={next:doc('A.md','ORIGINAL A'),calls:[],pending:null};const b=window.quilliteMarkdown;
    b.openFile=async()=>{audit.calls.push(['open']);return{...audit.next};};
    b.newFile=async()=>({...doc('Draft.md',''),draft:true});
    b.saveFile=(...args)=>{audit.calls.push(['save',...args]);return new Promise((resolve,reject)=>{audit.pending={args,resolve,reject};});};
    b.saveAs=async(...args)=>{audit.calls.push(['save-as',...args]);return null;};
    b.readDocumentConflict=async path=>doc(path,'EXTERNAL DISK');
    audit.resolve=(mode='normal')=>{const p=audit.pending;if(mode==='error')p.reject(Error('SYNTHETIC SAVE FAILURE'));else p.resolve({...doc(p.args[0],mode==='mismatch'?'WRONG RECEIPT':p.args[1]),revision:'b'.repeat(64)});};
   });
   const editor=page.locator('#markdownEditor > .cm-editor'),content=editor.locator('> .cm-scroller > .cm-content');
   const read=()=>editor.evaluate(async el=>{const{EditorView}=await import('/node_modules/@codemirror/view/dist/index.js');return EditorView.findFromDOM(el).state.doc.toString();});
   const enter=async()=>{if(!await page.locator('#editorView').isVisible())await page.locator('#editButton').click();await content.waitFor();};
   const next=async(path,text)=>{await page.evaluate(({path,text})=>sessionAudit.next={path,name:path,directory:'.',content:text,revision:'c'.repeat(64)},{path,text});await page.locator('#openFileButton').click();await enter();};
   const type=async text=>{await content.focus();await page.keyboard.press('Control+End');await page.keyboard.insertText(text);};
   const settle=()=>page.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));
   await page.locator(name==='draft-manual-save'?'#newFileButton':'#openFileButton').click();
   // New opens edit mode asynchronously itself; a second toggle would exit it.
   if(name==='draft-manual-save')await content.waitFor();else await enter();
   if(name==='switch-source')await page.locator('[data-editor-presentation="source"]').click();
   await type(' EDIT');await shot('01-edited');
   if(name.startsWith('switch')||name==='same-path-reopen'){
    await next(name==='same-path-reopen'?'A.md':'B.md','ORIGINAL B');assert.equal(await read(),'ORIGINAL B');
    await content.focus();for(let i=0;i<3;i++)await page.keyboard.press('Control+z');assert.equal(await read(),'ORIGINAL B');await type(' B-EDIT');await page.keyboard.press('Control+z');assert.equal(await read(),'ORIGINAL B');await page.keyboard.press('Control+y');assert.equal(await read(),'ORIGINAL B B-EDIT');
    await next('A.md','ORIGINAL A');await content.focus();for(let i=0;i<3;i++)await page.keyboard.press('Control+z');assert.equal(await read(),'ORIGINAL A');
   }else if(name==='cancel-open'){
    await page.locator('#openFileButton').click();assert.equal(await read(),'ORIGINAL A EDIT');assert.equal(await page.evaluate(()=>sessionAudit.calls.filter(c=>c[0]==='open').length),1);
   }else if(name==='save-as-cancel'||name==='draft-manual-save'){
    await page.locator(name==='save-as-cancel'?'#saveAsButton':'#saveButton').click();await page.waitForFunction(()=>sessionAudit.calls.some(c=>c[0]==='save-as'));
    assert.equal(await read(),name==='draft-manual-save'?' EDIT':'ORIGINAL A EDIT');assert.equal(await page.evaluate(()=>sessionAudit.calls.some(c=>c[0]==='save')),false);assert.match(await page.locator('#editorSaveState').innerText(),/尚未保存/);
   }else{
    await page.locator('#saveButton').click();await page.waitForFunction(()=>sessionAudit.pending);await shot('02-saving');
    if(name==='save-during-input')await type(' LATER');
    else if(name.startsWith('late-save')){
     if(name==='late-save-closed'){await page.locator('#exitEditButton').click();await page.locator('#closePreviewButton').click();}
     else{await next(name==='late-save-same'?'A.md':'B.md','NEW BODY');await type(' NEW EDIT');}
    }
    await page.evaluate(mode=>sessionAudit.resolve(mode),name==='late-save-error'?'error':name==='save-receipt-mismatch'?'mismatch':'normal');await settle();
    if(name==='late-save-closed'){assert.equal(await page.locator('#editorView').isVisible(),false);assert.equal(await page.locator('#documentView').isVisible(),false);}
    else if(name==='save-receipt-mismatch'){await page.locator('#documentConflictDialog').waitFor({state:'visible'});assert.equal(await read(),'ORIGINAL A EDIT');await page.locator('#conflictKeep').click();}
    else{
     assert.equal(await read(),name==='save-during-input'?'ORIGINAL A EDIT LATER':'NEW BODY NEW EDIT');assert.match(await page.locator('#editorSaveState').innerText(),/尚未保存/);
     await page.locator('#saveButton').click();await page.waitForFunction(()=>sessionAudit.calls.filter(c=>c[0]==='save').length===2);
     const calls=await page.evaluate(()=>sessionAudit.calls.filter(c=>c[0]==='save'));assert.equal(calls[1][2],await read());assert.equal(calls[1][3],(name==='save-during-input'?'b':'c').repeat(64));
     await page.evaluate(()=>sessionAudit.resolve());await page.waitForFunction(()=>document.querySelector('#editorSaveState').textContent==='已保存');
    }
   }
   await shot('03-result');assert.deepEqual(errors,[]);console.log('PASS',name);
  }catch(e){console.error('FAIL',name,e.stack);failures.push(name);try{await shot('failure');}catch{}}
  await page.close();page=null;
 }
 console.log(JSON.stringify({PASS:cases.length-failures.length,total:cases.length,failures}));assert.deepEqual(failures,[]);
}finally{await browser?.close();await server.close();}
