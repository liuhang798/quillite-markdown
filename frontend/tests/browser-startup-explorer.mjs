// Fresh isolated browser and synthetic bridge responses only.
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import {createServer} from 'vite';
const{chromium}=createRequire(import.meta.url)(process.env.PLAYWRIGHT_MODULE||'playwright');
const server=await createServer({root:fileURLToPath(new URL('..',import.meta.url)),server:{host:'127.0.0.1',port:0,watch:null,hmr:false},logLevel:'error'});
const cases=['prefs-folder','pending-folder','restore-old','restore-same','refresh-mode','refresh-order','refresh-error','recovery-late','recovery-idle'];
let browser,page;
try {
 await server.listen();browser=await chromium.launch({headless:true,executablePath:process.env.BROWSER_EXECUTABLE||undefined});
 for(const name of process.env.AUDIT_CASE?[process.env.AUDIT_CASE]:cases) {
  page=await browser.newPage({viewport:{width:1440,height:950}});page.setDefaultTimeout(10000);const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.route('**/*',route=>new URL(route.request().url()).hostname==='127.0.0.1'?route.continue():route.abort());
  await page.addInitScript(({name})=>{
   localStorage.setItem('sidebarMode','explorer');
   const gates={},calls=[];let lists=0;
   const gate=key=>new Promise((resolve,reject)=>{gates[key]={resolve,reject};});
   const folder=(root,label)=>({root,files:[{path:`${root}/${label}.md`,name:`${label}.md`,directory:root}]});
   window.explorerAudit={calls,done:[],release:(key,fail)=>fail?gates[key]?.reject(Error('synthetic unavailable')):gates[key]?.resolve()};
   Object.defineProperty(window,'quilliteMarkdown',{configurable:true,set(b){
    Object.defineProperty(window,'quilliteMarkdown',{value:b});const prefs=b.getPreferences;
    b.getPreferences=async()=>{calls.push('prefs');const p=await prefs();if(['prefs-folder','pending-folder'].includes(name))await gate('prefs');return{...p,explorerRoot:'Saved'};};
    b.getInitialFile=async()=>null;
    b.getRecoverySnapshot=async()=>{calls.push('recovery');if(name.startsWith('recovery-')){if(name==='recovery-late')await gate('recovery');return{path:'Recovered.md',name:'Recovered.md',content:'RECOVERED BODY',baseRevision:'a'.repeat(64),updatedAt:new Date().toISOString()};}return null;};
    b.clearRecoverySnapshot=async()=>{calls.push('clear');};
    b.saveRecoverySnapshot=async()=>{};
    b.newFile=async()=>({path:'User.md',name:'User.md',directory:'.',content:'',draft:true});
    b.openFolder=async()=>{calls.push('open');if(name==='pending-folder')await gate('open');return folder(name==='restore-same'?'Saved':'Chosen','User-choice');};
    b.readFile=async path=>{calls.push('read');return{path,name:path.split('/').at(-1),directory:path.split('/')[0],content:'USER DOCUMENT',revision:'a'.repeat(64)};};
    b.listFolder=async root=>{const key='list'+(++lists);calls.push(key);if(name.startsWith('restore')||name.startsWith('refresh')&&lists>1)await gate(key);window.explorerAudit.done.push(key);return folder(root,key==='list1'?'Startup-old':key==='list2'?'Stale-refresh':'Fresh-refresh');};
   }});
  },{name});
  await page.goto(server.resolvedUrls.local[0]);
  const call=key=>page.waitForFunction(k=>window.explorerAudit?.calls.includes(k),key);
  const release=(key,fail=false)=>page.evaluate(({key,fail})=>window.explorerAudit.release(key,fail),{key,fail});
  const settle=async()=>{await page.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));};
  const shot=async suffix=>{if(process.env.AUDIT_OUTPUT)await page.screenshot({path:`${process.env.AUDIT_OUTPUT}/${name}-${suffix}.png`});};
  const list=page.locator('#fileList');
  if(name==='recovery-late') {
   await call('recovery');await page.locator('#newFileButton').click();const content=page.locator('#markdownEditor > .cm-editor > .cm-scroller > .cm-content');await content.waitFor();await content.focus();await page.keyboard.insertText('USER TYPED');await shot('01-input');await release('recovery');await settle();await shot('02-late');
   assert.equal(await page.locator('#recoveryDialog').isVisible(),false,'late recovery must not interrupt current input');
   await page.keyboard.insertText(' MORE');
   assert.equal(await content.innerText(),'USER TYPED MORE','typing focus retained');
   await page.locator('#reviewRecovery').click();await page.locator('#restoreRecovery').click();
   assert.equal(await content.innerText(),'USER TYPED MORE');assert.equal(await page.evaluate(()=>explorerAudit.calls.includes('read')),false,'dirty editor must not be replaced');
   await page.locator('#discardRecovery').click();assert.equal(await page.evaluate(()=>explorerAudit.calls.includes('clear')),false,'Later never clears the active recovery slot');
   await page.keyboard.insertText(' LATER');assert.equal(await content.innerText(),'USER TYPED MORE LATER');
  } else if(name==='recovery-idle') {
   await page.locator('#reviewRecovery').waitFor();assert.equal(await page.locator('#recoveryDialog').isVisible(),false);
   await page.locator('#reviewRecovery').click();await page.locator('#discardRecovery').click();await page.locator('#reviewRecovery').click();await shot('01-review');await page.locator('#restoreRecovery').click();
   const content=page.locator('#markdownEditor > .cm-editor > .cm-scroller > .cm-content');await content.waitFor();await page.locator('#recoveryDialog').waitFor({state:'hidden'});assert.equal(await content.innerText(),'RECOVERED BODY');assert.equal(await page.locator('#reviewRecovery').isVisible(),false);
  } else if(name.endsWith('folder')) {
   await call('prefs');await page.locator('#openFolderButton').click();await call('open');
   if(name==='prefs-folder')await list.getByText('User-choice.md',{exact:true}).waitFor();
   await shot('01-choice');await release('prefs');await call('recovery');
   if(name==='pending-folder')await release('open');
   await list.getByText('User-choice.md',{exact:true}).waitFor();await settle();
   assert.equal(await list.getByText('Startup-old.md',{exact:true}).count(),0);
   assert.equal(await page.locator('#libraryName').innerText(),'Chosen');
  } else if(name.startsWith('restore')) {
   await call('list1');await page.locator('#openFolderButton').click();await list.getByText('User-choice.md',{exact:true}).waitFor();await shot('01-choice');await release('list1');await settle();
   assert.match(await list.innerText(),/User-choice.md/,'late restoration must not replace folder selection, even for the same root');
  } else {
   await call('list1');await list.getByText('Startup-old.md',{exact:true}).waitFor();await page.locator('#refreshExplorer').click();await call('list2');
   if(name==='refresh-mode') {
    await page.locator('#favoritesTab').click();await shot('01-choice');await release('list2');await settle();assert.equal(await page.locator('#favoritesTab').getAttribute('aria-selected'),'true');
   } else {
    await page.locator('#refreshExplorer').click();await call('list3');await release('list3');await list.getByText('Fresh-refresh.md',{exact:true}).waitFor();await shot('01-choice');await release('list2',name==='refresh-error');await settle();
    assert.match(await list.innerText(),/Fresh-refresh.md/,'older refresh cannot replace fresh result');
    if(name==='refresh-error')assert.equal(await page.locator('#toast').isVisible(),false,'stale refresh error must not interrupt newer success');
   }
  }
  await shot('02-result');assert.deepEqual(errors,[]);console.log('PASS',name,await page.evaluate(()=>window.explorerAudit.calls));await page.close();page=null;
 }
}catch(error){if(page&&process.env.AUDIT_OUTPUT)await page.screenshot({path:`${process.env.AUDIT_OUTPUT}/failure.png`});throw error;}
finally{await browser?.close();await server.close();}
