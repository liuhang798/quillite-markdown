// Isolated synthetic documents; no real profile or files. UI-only writes.
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import {createServer} from 'vite';
const {chromium}=createRequire(import.meta.url)(process.env.PLAYWRIGHT_MODULE||'playwright');
const server=await createServer({root:fileURLToPath(new URL('..',import.meta.url)),server:{host:'127.0.0.1',port:0,watch:null,hmr:false},logLevel:'error'});
const cases=[
 ['table','| Head | Other |\n| --- | --- |\n| needle | cell |','td .cm-content'],
 ['code','```text\nneedle\n```','.cm-live-code .cm-content'],
 ['details','<details open>\n<summary>Section</summary>\n\nneedle\n\n</details>','.cm-live-prose .cm-content'],
 ['html','<div>\n\nneedle\n\n</div>','.cm-live-prose .cm-content'],
 ['footnote','Note[^n]\n\n[^n]: needle','.cm-live-prose .cm-content'],
 ['nested-code','<details open>\n<summary>Section</summary>\n\n```text\nneedle\n```\n\n</details>','.cm-live-code .cm-content'],
 ['summary','<details open>\n<summary>needle</summary>\n\nBody\n\n</details>','.cm-live-details-title .cm-content'],
 ['comment','<!-- needle -->','.cm-live-comment .cm-content'],
 ['deep-table','Note[^n]\n\n[^n]: Intro\n    \n    <details open>\n    <summary>Section</summary>\n    \n    | Head | Other |\n    | --- | --- |\n    | needle | cell |\n    \n    </details>','td .cm-content'],
];
let browser,page;
try {
 await server.listen();browser=await chromium.launch({headless:true,executablePath:process.env.BROWSER_EXECUTABLE||undefined});page=await browser.newPage({viewport:{width:1500,height:1000}});page.setDefaultTimeout(10000);
 const errors=[];page.on('pageerror',e=>errors.push(e.message));await page.route('**/*',route=>new URL(route.request().url()).hostname==='127.0.0.1'?route.continue():route.abort());await page.goto(server.resolvedUrls.local[0]+'tests/fixtures/app-drag-audit.html');const app=page.frameLocator('iframe');await app.locator('#newFileButton').evaluate(async()=>{await import('/src/main.js');});
 await app.locator('#newFileButton').click();await app.locator('#hideLivePreviewButton').click();const editor=app.locator('#markdownEditor > .cm-editor'),content=editor.locator('> .cm-scroller > .cm-content');
 const read=()=>editor.evaluate(async el=>{const{EditorView}=await import('/node_modules/@codemirror/view/dist/index.js');const s=EditorView.findFromDOM(el).state,r=s.selection.main;return{doc:s.doc.toString(),from:r.from,to:r.to,text:s.sliceDoc(r.from,r.to)};});
 const shot=async name=>{if(process.env.AUDIT_OUTPUT)await page.screenshot({path:`${process.env.AUDIT_OUTPUT}/${name}.png`});};
 for(const[kind,block,selector]of cases){
  console.log('START',kind);const doc='Before needle\n\n'+block+'\n\nAfter needle';
  await app.locator('[data-editor-presentation="source"]').click();await content.focus();await page.keyboard.press('Control+a');await page.keyboard.insertText(doc);await page.keyboard.press('Control+Home');await app.locator('[data-editor-presentation="live"]').click();
  const inner=editor.locator(selector).filter({hasText:'needle'}).last();await inner.click();await shot(kind+'-01-entry');await page.keyboard.press('Control+f');await page.waitForTimeout(100);await shot(kind+'-02-shortcut');
  const panel=editor.locator(':scope > .cm-panels .cm-search');assert.equal(await panel.count(),1,kind+': Ctrl+F must open the root document search');
  assert.equal(await panel.locator('input[name="search"]').evaluate(el=>el===el.ownerDocument.activeElement),true,kind+': keyboard focus must enter search');
  await panel.locator('input[name="search"]').fill('needle');
  const found=new Set();for(let i=0;i<3;i++){await panel.locator('button[name="next"]').click();const s=await read();assert.equal(s.text,'needle');found.add(s.from);assert.equal(s.doc,doc);}
  assert.deepEqual([...found].sort((a,b)=>a-b),[...doc.matchAll(/needle/g)].map(m=>m.index));
  await panel.locator('button[name="close"]').click();
  for(const key of ['F3','Shift+F3','Control+g','Control+Shift+g']) {
   await inner.click();const before=await read();await page.keyboard.press(key);const next=await read();assert.equal(next.text,'needle',kind+': '+key+' navigates document matches');assert.notEqual(next.from,next.to);assert.equal(before.from,before.to);
   const focused=await editor.evaluate(async el=>{const{EditorView}=await import('/node_modules/@codemirror/view/dist/index.js');const{resolveEditableOwner}=await import('/src/editable-owner.js');const active=el.ownerDocument.activeElement;if(!el.contains(active))return null;const view=EditorView.findFromDOM(active.closest('.cm-editor')),owner=view&&resolveEditableOwner(view);return owner&&{from:owner.from,to:owner.to};});
   assert.deepEqual(focused,{from:next.from,to:next.to},kind+': '+key+' keyboard focus must match the selected result');
   await page.keyboard.insertText('MATCH');assert.equal((await read()).doc,doc.slice(0,next.from)+'MATCH'+doc.slice(next.to));
   await page.keyboard.press('Control+z');assert.equal((await read()).doc,doc);
  }
  await shot(kind+'-03-navigation');assert.equal((await read()).doc,doc);console.log('PASS',kind);
 }
 for(const[kind,block,selector]of [
  ['root-link','[Site](https://example.com/needle)',null],
  ['table-link','| Head | Other |\n| --- | --- |\n| [Site](https://example.com/needle) | cell |','td .cm-content'],
  ['details-link','<details open>\n<summary>Section</summary>\n\n[Site](https://example.com/needle)\n\n</details>','.cm-live-prose .cm-content'],
 ]) {
  const doc='Before\n\n'+block+'\n\nAfter';await app.locator('[data-editor-presentation="source"]').click();await content.focus();await page.keyboard.press('Control+a');await page.keyboard.insertText(doc);await page.keyboard.press('Control+Home');await app.locator('[data-editor-presentation="live"]').click();await content.focus();await page.keyboard.press('Control+f');
  const panel=editor.locator(':scope > .cm-panels .cm-search');await panel.locator('input[name="search"]').fill('needle');await panel.locator('button[name="close"]').click();
  if(selector)await editor.locator(selector).filter({hasText:'Site'}).last().click();else{await content.focus();await page.keyboard.press('Control+Home');}
  await page.keyboard.press('F3');await page.waitForTimeout(100);await shot(kind+'-04-closed-panel');assert.equal((await read()).text,'needle');assert.ok((await content.innerText()).includes('/needle'),kind+': closed-panel F3 reveals hidden destination');assert.equal((await read()).doc,doc);
  await page.keyboard.insertText('updated');assert.equal((await read()).doc,doc.replace('/needle','/updated'));await page.keyboard.press('Control+z');assert.equal((await read()).doc,doc);
  await content.locator('> .cm-line').filter({hasText:'After'}).click();await page.waitForTimeout(100);assert.ok(!(await content.innerText()).includes('/needle'),kind+': ordinary pointer placement restores hidden syntax');await shot(kind+'-05-restored');
 }
 assert.deepEqual(errors,[]);console.log(JSON.stringify({PASS:cases.length,closedPanelHidden:3,pageErrors:errors}));
}catch(e){if(page&&process.env.AUDIT_OUTPUT)await page.screenshot({path:`${process.env.AUDIT_OUTPUT}/failure.png`});throw e;}finally{await browser?.close();await server.close();}
