// Isolated synthetic recovery responses; never reads or writes user documents.
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import {createServer} from 'vite';
const {chromium}=createRequire(import.meta.url)(process.env.PLAYWRIGHT_MODULE||'playwright');
const server=await createServer({root:fileURLToPath(new URL('..',import.meta.url)),server:{host:'127.0.0.1',port:0,watch:null,hmr:false},logLevel:'error'});
const cases=['keyboard','cancel-read','cancel-create','retry-pending','missing','create-failed','narrow-en'];
let browser,page;
const failures=[];
try {
 await server.listen();browser=await chromium.launch({headless:true,executablePath:process.env.BROWSER_EXECUTABLE||undefined});
 for(const name of process.env.AUDIT_CASE?[process.env.AUDIT_CASE]:cases){
  page=await browser.newPage({viewport:{width:name==='narrow-en'?920:1440,height:name==='narrow-en'?620:950}});page.setDefaultTimeout(5000);
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.route('**/*',route=>new URL(route.request().url()).hostname==='127.0.0.1'?route.continue():route.abort());
  await page.addInitScript(({name})=>{
   localStorage.setItem('language',name==='narrow-en'?'en':'zh-CN');
   const gates={},calls=[];let creations=0,reads=0;
   const gate=key=>new Promise(resolve=>{gates[key]=resolve;});
   window.recoveryAudit={calls,release:key=>gates[key]?.()};
   Object.defineProperty(window,'quilliteMarkdown',{configurable:true,set(b){
    Object.defineProperty(window,'quilliteMarkdown',{value:b});
    b.getInitialFile=async()=>null;
    b.getStartupRecoverySnapshot=async()=>({path:'Old.md',name:'Old.md',content:'RECOVERED BODY',baseRevision:'a'.repeat(64),updatedAt:'2026-10-15T00:00:00Z'});
    b.saveRecoverySnapshot=async()=>{};b.clearRecoverySnapshot=async()=>calls.push('clear');
    b.openFile=async()=>{calls.push('open');return null;};
    b.saveFile=async()=>{calls.push('save');return null;};
    b.readFile=async path=>{calls.push('read');reads++;if(name==='retry-pending')await gate('read'+reads);if(name==='cancel-read')await gate('read');if(['cancel-create','missing','create-failed'].includes(name))throw Error('FILE_NOT_FOUND');return{path,name:path,content:'DISK BODY',revision:'a'.repeat(64)};};
    b.newFile=async()=>{calls.push('new');creations++;if(name==='cancel-create'&&creations===1)await gate('new');if(name==='create-failed'&&creations===1)throw Error('synthetic create failure');return{path:'New'+creations+'.md',name:'New'+creations+'.md',directory:'.',content:'',draft:true,revision:'b'.repeat(64)};};
    b.readDocumentConflict=async()=>({path:'New1.md',content:'',revision:'b'.repeat(64)});
   }});
  },{name});
  const shot=async suffix=>{if(process.env.AUDIT_OUTPUT){await page.waitForTimeout(250);await page.screenshot({path:`${process.env.AUDIT_OUTPUT}/${name}-${suffix}.png`});}};
  try {
   await page.goto(server.resolvedUrls.local[0]);const entry=page.locator('#reviewRecovery'),dialog=page.locator('#recoveryDialog'),restore=page.locator('#restoreRecovery'),later=page.locator('#discardRecovery');
   await entry.waitFor();await shot('01-entry');await entry.click();await restore.focus();await shot('02-review');
   const content=page.locator('#markdownEditor > .cm-editor > .cm-scroller > .cm-content');
   if(name==='keyboard'){
    await page.keyboard.press('Tab');await shot('03-tab');assert.equal(await later.evaluate(el=>el===document.activeElement),true,'Tab must stay inside recovery dialog');
    await page.keyboard.press('Shift+Tab');assert.equal(await restore.evaluate(el=>el===document.activeElement),true);
    for(const key of ['Control+n','Control+o','Control+e','Control+s'])await page.keyboard.press(key);
    assert.deepEqual(await page.evaluate(()=>recoveryAudit.calls),[],'background file shortcuts blocked');
    await page.keyboard.press('Escape');await dialog.waitFor({state:'hidden'});assert.equal(await entry.evaluate(el=>el===document.activeElement),true);
   }else if(name.startsWith('cancel-')){
    await restore.click();const key=name==='cancel-read'?'read':'new';await page.waitForFunction(k=>recoveryAudit.calls.includes(k),key);await shot('03-pending');
    assert.equal(await later.isEnabled(),true,'pending recovery must be cancellable');await page.keyboard.press('Escape');await dialog.waitFor({state:'hidden'});
    await page.locator('#newFileButton').click();await content.waitFor();await content.focus();await page.keyboard.insertText('CURRENT INPUT');
    await page.evaluate(key=>recoveryAudit.release(key),key);await page.waitForTimeout(100);assert.equal(await content.innerText(),'CURRENT INPUT');assert.equal(await entry.isEnabled(),true);assert.equal(await entry.isVisible(),true);
   }else if(name==='retry-pending'){
    await restore.click();await page.waitForFunction(()=>recoveryAudit.calls.filter(c=>c==='read').length===1);await later.click();await entry.click();await restore.click();await page.waitForFunction(()=>recoveryAudit.calls.filter(c=>c==='read').length===2);
    await page.evaluate(()=>recoveryAudit.release('read1'));await page.waitForTimeout(100);assert.equal(await restore.isDisabled(),true,'old finally cannot unlock retry');assert.equal(await dialog.getAttribute('aria-busy'),'true');await shot('03-retry');
    await page.evaluate(()=>recoveryAudit.release('read2'));await dialog.waitFor({state:'hidden'});assert.equal(await content.innerText(),'RECOVERED BODY');
   }else if(name==='missing'||name==='create-failed'){
    await restore.click();
    if(name==='create-failed'){
     await page.waitForFunction(()=>!document.querySelector('#restoreRecovery').disabled);await shot('03-failed');assert.equal(await dialog.isVisible(),true);assert.equal(await page.locator('#toast').isVisible(),true);await restore.click();
    }
    await dialog.waitFor({state:'hidden'});await content.waitFor();assert.equal(await content.innerText(),'RECOVERED BODY');assert.match(await page.locator('#editorFileName').innerText(),/New/);
    assert.equal(await page.locator('#documentConflictDialog').isVisible(),false,'a new independent draft is not a conflict with the missing source');
    assert.equal(await page.evaluate(()=>recoveryAudit.calls.includes('clear')),false);
   }else{
    for(const control of [restore,later])assert.equal(await control.evaluate(el=>{const r=el.getBoundingClientRect();return r.left>=0&&r.top>=0&&r.right<=innerWidth&&r.bottom<=innerHeight;}),true,'controls inside minimum window');
    await later.click();assert.equal(await entry.evaluate(el=>{const r=el.getBoundingClientRect();return r.left>=0&&r.right<=innerWidth&&document.elementFromPoint(r.x+r.width/2,r.y+r.height/2)===el;}),true,'entry reachable at minimum window');
   }
   await shot('04-result');assert.deepEqual(errors,[]);console.log('PASS',name);
  }catch(error){await shot('failure');failures.push(name+': '+error.message);console.error('FAIL',name,error.message);}
  await page.close();page=null;
 }
 assert.deepEqual(failures,[]);
}finally{await browser?.close();await server.close();}
