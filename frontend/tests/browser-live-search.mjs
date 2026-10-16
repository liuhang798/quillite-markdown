// Isolated synthetic documents; all writes use the visible UI and keyboard.
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import {createServer} from 'vite';
const {chromium}=createRequire(import.meta.url)(process.env.PLAYWRIGHT_MODULE||'playwright');
const server=await createServer({root:fileURLToPath(new URL('..',import.meta.url)),server:{host:'127.0.0.1',port:0,watch:null,hmr:false},logLevel:'error'});
const cases=[['heading','# Heading needle'],['bold','Text **needle** end'],['table','| Name | Value |\n| --- | --- |\n| needle | cell |'],['code','```text\nneedle\n```'],['formula','$$\n\\text{needle}+x\n$$'],['diagram','```mermaid\nflowchart LR\nA[needle] --> B[Done]\n```'],['image','![needle](tests/fixtures/sample-image.svg)'],['link','[Site](https://example.com/needle)'],['details','<details>\n<summary>Closed</summary>\n\nneedle\n\n</details>'],['footnote','Note[^a]\n\n[^a]: needle'],['table-link','| Name | Value |\n| --- | --- |\n| [Site](https://example.com/needle) | cell |'],['details-link','<details>\n<summary>Closed</summary>\n\n[Site](https://example.com/needle)\n\n</details>']];
let browser,page;
try{
 await server.listen();browser=await chromium.launch({headless:true,executablePath:process.env.BROWSER_EXECUTABLE||undefined});
 page=await browser.newPage({viewport:{width:1500,height:1000}});page.setDefaultTimeout(10000);const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.route('**/*',route=>new URL(route.request().url()).hostname==='127.0.0.1'?route.continue():route.abort());await page.goto(server.resolvedUrls.local[0]+'tests/fixtures/app-drag-audit.html');const app=page.frameLocator('iframe');await app.locator('#newFileButton').evaluate(async()=>{await import('/src/main.js');});
 await app.locator('#newFileButton').click();await app.locator('#hideLivePreviewButton').click();
 const editor=app.locator('#markdownEditor > .cm-editor'),content=editor.locator('> .cm-scroller > .cm-content');
 const read=()=>editor.evaluate(async el=>{const{EditorView}=await import('/node_modules/@codemirror/view/dist/index.js');const s=EditorView.findFromDOM(el).state;return{doc:s.doc.toString(),from:s.selection.main.from,to:s.selection.main.to,text:s.sliceDoc(s.selection.main.from,s.selection.main.to)};});
 const shot=async name=>{if(process.env.AUDIT_OUTPUT)await page.screenshot({path:`${process.env.AUDIT_OUTPUT}/${name}.png`});};
 for(const[kind,block]of cases){
  console.log('START',kind);const doc='Before\n\n'+block+'\n\nAfter';
  await app.locator('[data-editor-presentation="source"]').click();await content.focus();await page.keyboard.press('Control+a');await page.keyboard.insertText(doc);await page.keyboard.press('Control+Home');
  await app.locator('[data-editor-presentation="live"]').click();await content.focus();await page.keyboard.press('Control+f');
  const panel=editor.locator('.cm-panel.cm-search');await panel.locator('input[name="search"]').fill('needle');await panel.locator('button[name="next"]').click();
  await page.waitForTimeout(150);const state=await read();assert.equal(state.text,'needle');assert.equal(state.doc,doc);
  await shot(kind+'-01-found');
  const visible=await editor.evaluate(async el=>{
   const root=el.querySelector(':scope > .cm-scroller').getBoundingClientRect(),inside=r=>r.width>4&&r.height>4&&r.bottom>root.top&&r.top<root.bottom&&r.right>root.left&&r.left<root.right;
   if([...el.querySelectorAll('.cm-searchMatch-selected')].some(n=>n.textContent==='needle'&&inside(n.getBoundingClientRect())))return true;
   const selection=el.ownerDocument.getSelection();if(selection?.toString()==='needle'&&selection.rangeCount&&el.contains(selection.anchorNode)&&inside(selection.getRangeAt(0).getBoundingClientRect()))return true;
   const{EditorView}=await import('/node_modules/@codemirror/view/dist/index.js');
   return [...el.querySelectorAll('.cm-editor')].some(n=>{const view=EditorView.findFromDOM(n),s=view?.state,r=s?.selection.main;return r&&!r.empty&&s.sliceDoc(r.from,r.to)==='needle'&&[...n.querySelectorAll('.cm-selectionBackground')].some(p=>inside(p.getBoundingClientRect()));});
  });
  assert.ok(visible,kind+': selected search match must be visibly highlighted');
  await panel.locator('input[name="replace"]').fill('updated');await panel.locator('button[name="replace"]').click();
  const expected=doc.replace('needle','updated');assert.equal((await read()).doc,expected);
  await panel.locator('button[name="close"]').click();
  if(kind.includes('link')) {
   await page.waitForTimeout(100);
   assert.ok(!(await content.innerText()).includes('https://example.com/'),'closing search restores hidden URL syntax: '+kind);
  }
  await content.focus();await page.keyboard.press('Control+z');assert.equal((await read()).doc,doc);
  await page.keyboard.press('Control+y');assert.equal((await read()).doc,expected);await shot(kind+'-02-replaced');console.log('PASS',kind);
 }
 for(const mode of ['live','source']) {
  const doc='needle Needle needles\n\n[Site](https://example.com/needle)\n\nneedle42 needle43';
  await app.locator('[data-editor-presentation="source"]').click();await content.focus();await page.keyboard.press('Control+a');await page.keyboard.insertText(doc);await page.keyboard.press('Control+Home');
  await app.locator(`[data-editor-presentation="${mode}"]`).click();await content.focus();await page.keyboard.press('Control+f');
  const panel=editor.locator('.cm-panel.cm-search'),search=panel.locator('input[name="search"]');
  await search.fill('needle');await panel.locator('input[name="case"]').check();await panel.locator('input[name="word"]').check();
  await panel.locator('button[name="next"]').click();assert.equal((await read()).from,0);
  await panel.locator('button[name="next"]').click();assert.equal((await read()).from,doc.indexOf('/needle')+1);
  await panel.locator('button[name="prev"]').click();assert.equal((await read()).from,0);
  await panel.locator('button[name="select"]').click();
  const ranges=await editor.evaluate(async el=>{const{EditorView}=await import('/node_modules/@codemirror/view/dist/index.js');return EditorView.findFromDOM(el).state.selection.ranges.map(r=>[r.from,r.to]);});
  assert.deepEqual(ranges,[[0,6],[doc.indexOf('/needle')+1,doc.indexOf('/needle')+7]]);
  await panel.locator('input[name="replace"]').fill('MATCH');await panel.locator('button[name="replaceAll"]').click();
  const replaced=doc.replace(/^needle/,'MATCH').replace('/needle)','/MATCH)');assert.equal((await read()).doc,replaced);
  await panel.locator('input[name="word"]').uncheck();await panel.locator('input[name="re"]').check();await search.fill('needle(\\d+)');
  await panel.locator('input[name="replace"]').fill('item$1');await panel.locator('button[name="replaceAll"]').click();
  const regexReplaced=replaced.replace(/needle(\d+)/g,'item$1');assert.equal((await read()).doc,regexReplaced);
  await search.fill('[');await panel.locator('button[name="next"]').click();assert.equal((await read()).doc,regexReplaced);
  await search.fill('no-such-match');await panel.locator('button[name="replaceAll"]').click();assert.equal((await read()).doc,regexReplaced);
  await shot(mode+'-search-options');await panel.locator('button[name="close"]').click();await content.focus();
  await page.keyboard.press('Control+z');assert.equal((await read()).doc,replaced);
  await page.keyboard.press('Control+z');assert.equal((await read()).doc,doc);
  console.log('PASS search options',mode);
 }
 assert.deepEqual(errors,[]);console.log(JSON.stringify({PASS:cases.length,searchOptionModes:2,pageErrors:errors}));
}catch(e){if(page&&process.env.AUDIT_OUTPUT)await page.screenshot({path:`${process.env.AUDIT_OUTPUT}/failure.png`});throw e;}finally{await browser?.close();await server.close();}
