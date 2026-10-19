// User-authorized isolated browser; only synthetic documents and bridge responses.
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import {createServer} from 'vite';
const {chromium}=createRequire(import.meta.url)(process.env.PLAYWRIGHT_MODULE||'playwright');
const output=process.env.AUDIT_OUTPUT;if(!output)throw Error('AUDIT_OUTPUT required');
const cases=['restore-history','selection-pending','stale-selection-error','reopen-list','reopen-list-error','reopen-version','switch-document','closed-response','list-error-retry','read-error','invalid-version','wrong-path-version','wrong-id-version','invalid-content-version'];
const server=await createServer({root:fileURLToPath(new URL('..',import.meta.url)),server:{host:'127.0.0.1',port:0,watch:null,hmr:false},logLevel:'error'});
let browser,page;const failures=[];
try{
 await server.listen();browser=await chromium.launch({headless:true,executablePath:process.env.BROWSER_EXECUTABLE||undefined});
 for(const name of cases){
  page=await browser.newPage({viewport:{width:Number(process.env.AUDIT_WIDTH||1440),height:950}});page.setDefaultTimeout(8000);
  await page.addInitScript(language=>localStorage.setItem('language',language),process.env.AUDIT_LANGUAGE||'zh-CN');
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.route('**/*',r=>new URL(r.request().url()).hostname==='127.0.0.1'?r.continue():r.abort());
  const shot=suffix=>page.screenshot({path:`${output}/${name}-${suffix}.png`,animations:'disabled'});
  try{
   await page.goto(server.resolvedUrls.local[0]);await page.evaluate(async()=>{await import('/src/main.js');});
   await page.evaluate(name=>{
    const b=window.quilliteMarkdown,gates={},calls=[];let lists=0,reads=0;
    const wait=key=>new Promise((resolve,reject)=>gates[key]={resolve,reject});
    const row=id=>({id,createdAt:'2026-10-15T00:00:00Z',size:32});
    window.historyAudit={calls,release:(key,fail=false)=>fail?gates[key].reject(Error('SYNTHETIC HISTORY ERROR')):gates[key].resolve(),writes:[]};
    b.openFile=async()=>({path:'A.md',name:'A.md',directory:'.',content:'CURRENT BODY',revision:'a'.repeat(64)});
    b.saveFile=async(...args)=>{historyAudit.writes.push(args);return null;};
    b.listDocumentVersions=async()=>{lists++;const n=lists;calls.push('list'+n);if(name.startsWith('reopen-list')&&n===1)await wait('list1');if(name==='list-error-retry'&&n===1)throw Error('SYNTHETIC LIST ERROR');return n>1?[row('v3')]:[row('v1'),row('v2'),row('v3')];};
    b.getDocumentVersion=async(path,id)=>{reads++;const n=reads;calls.push('read-'+id+'-'+n);if(['reopen-version','closed-response','switch-document'].includes(name)&&n===1)await wait('read1');if(['selection-pending','stale-selection-error'].includes(name)&&id==='v2')await wait('v2');if(name==='read-error'&&id==='v2')throw Error('SYNTHETIC READ ERROR');if(name==='invalid-version'&&id==='v2')return null;return{path:name==='wrong-path-version'&&id==='v2'?'Other.md':path,id:name==='wrong-id-version'&&id==='v2'?'wrong':id,content:name==='invalid-content-version'&&id==='v2'?null:'HISTORY '+id,createdAt:'2026-10-15T00:00:00Z',size:32};};
   },name);
   await page.locator('#openFileButton').click();await page.locator('#editButton').click();
   const editor=page.locator('#markdownEditor > .cm-editor'),content=editor.locator('> .cm-scroller > .cm-content');
   const read=()=>editor.evaluate(async el=>{const{EditorView}=await import('/node_modules/@codemirror/view/dist/index.js');return EditorView.findFromDOM(el).state.doc.toString();});
   const open=()=>page.locator('#documentHistoryButton').click(),close=()=>page.locator('#closeDocumentHistory').click();
   const restore=page.locator('#restoreDocumentHistory'),preview=page.locator('#documentHistoryPreview'),status=page.locator('#documentHistoryStatus');
   const pick=id=>page.locator(`[data-document-version-id="${id}"]`).click();
   const waitText=text=>page.waitForFunction(t=>document.querySelector('#documentHistoryPreview').textContent.includes(t),text);
   const release=(key,fail=false)=>page.evaluate(({key,fail})=>historyAudit.release(key,fail),{key,fail});
   const settle=()=>page.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));
   await open();
   if(name.startsWith('reopen-')||name==='closed-response'||name==='switch-document'){
    await page.waitForFunction(key=>historyAudit.calls.includes(key),name.startsWith('reopen-list')?'list1':'read-v1-1');await shot('01-pending');await close();
    if(name==='switch-document'){
     await page.evaluate(()=>{window.quilliteMarkdown.openFile=async()=>({path:'B.md',name:'B.md',directory:'.',content:'SECOND DOCUMENT',revision:'b'.repeat(64)});});
     await page.locator('#openFileButton').click();await page.locator('#editButton').click();assert.equal(await read(),'SECOND DOCUMENT');
    }
    if(name==='closed-response'){await release('read1');await settle();assert.equal(await restore.isEnabled(),false,'closed history must stay non-restorable');}
    await open();await waitText('HISTORY v3');
    if(name!=='closed-response')await release(name.startsWith('reopen-list')?'list1':'read1',name==='reopen-list-error');
    await settle();await shot('02-reopened');assert.match(await preview.innerText(),/HISTORY v3/);assert.doesNotMatch(await preview.innerText(),/HISTORY v1/);assert.equal(await page.locator('[data-document-version-id="v1"]').count(),0);await restore.click();assert.equal(await read(),'HISTORY v3');
   }else if(name==='list-error-retry'){
    await page.waitForFunction(()=>document.querySelector('#documentHistoryStatus').textContent.includes('SYNTHETIC LIST ERROR'));assert.equal(await restore.isDisabled(),true);await shot('01-error');await close();await open();await waitText('HISTORY v3');assert.equal(await status.innerText(),'');await restore.click();assert.equal(await read(),'HISTORY v3');
   }else{
    await waitText('HISTORY v1');await shot('01-preview');const enabledBackground=await restore.evaluate(el=>getComputedStyle(el).backgroundColor);
    if(name==='restore-history'){
     await restore.click();assert.equal(await read(),'HISTORY v1');assert.deepEqual(await page.evaluate(()=>historyAudit.writes),[]);await content.focus();await page.keyboard.press('Control+z');assert.equal(await read(),'CURRENT BODY');await page.keyboard.press('Control+y');assert.equal(await read(),'HISTORY v1');await page.keyboard.press('Control+End');await page.keyboard.insertText(' MORE');assert.equal(await read(),'HISTORY v1 MORE');
    }else if(name==='read-error'||name.endsWith('-version')){
     await pick('v2');await page.waitForFunction(()=>document.querySelector('#documentHistoryStatus').textContent.length>0);await shot('02-error');assert.equal(await restore.isDisabled(),true,'failed selection must not leave previous version restorable');assert.doesNotMatch(await preview.innerText(),/正在读取|Loading version history/);assert.equal(await read(),'CURRENT BODY');
    }else{
     await pick('v2');await page.waitForFunction(()=>historyAudit.calls.some(c=>c.startsWith('read-v2')));await shot('02-pending');
     if(name==='selection-pending'){
      assert.equal(await restore.isDisabled(),true,'pending selection must disable restoring the previous version');
      assert.equal(await restore.evaluate(el=>getComputedStyle(el).cursor),'not-allowed');
      assert.notEqual(await restore.evaluate(el=>getComputedStyle(el).backgroundColor),enabledBackground,'disabled restore must look different from enabled');
      assert.equal(await page.locator('[data-document-version-id="v2"]').getAttribute('aria-pressed'),'true');
      assert.equal(await page.locator('[data-document-version-id="v1"]').getAttribute('aria-pressed'),'false');
     }
     await pick('v3');await waitText('HISTORY v3');assert.equal(await page.locator('[data-document-version-id="v3"]').evaluate(el=>el===document.activeElement),true,'selection keeps keyboard focus after list refresh');await release('v2',name==='stale-selection-error');await settle();await shot('03-selected');assert.match(await preview.innerText(),/HISTORY v3/);assert.equal(await status.innerText(),'','stale selection failure must not replace current success');await restore.click();assert.equal(await read(),'HISTORY v3');
    }
   }
   await shot('04-result');assert.deepEqual(errors,[]);console.log('PASS',name);
  }catch(e){console.error('FAIL',name,e.stack);failures.push(name);try{await shot('failure');}catch{}}
  await page.close();page=null;
 }
 console.log(JSON.stringify({PASS:cases.length-failures.length,total:cases.length,failures}));assert.deepEqual(failures,[]);
}finally{await browser?.close();await server.close();}
