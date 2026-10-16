// Authorized isolated browser only: synthetic documents and clipboard.
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import {createServer} from 'vite';
const {chromium}=createRequire(import.meta.url)(process.env.PLAYWRIGHT_MODULE||'playwright');
const server=await createServer({root:fileURLToPath(new URL('..',import.meta.url)),server:{host:'127.0.0.1',port:0,watch:null,hmr:false},logLevel:'error'});
let browser,page;
try {
 await server.listen();browser=await chromium.launch({headless:true,executablePath:process.env.BROWSER_EXECUTABLE||undefined});page=await browser.newPage({viewport:{width:1500,height:1100}});page.setDefaultTimeout(10000);
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto(server.resolvedUrls.local[0]+'tests/fixtures/app-drag-audit.html');const app=page.frameLocator('iframe');await app.locator('#newFileButton').click();await app.locator('#hideLivePreviewButton').click();
 const editor=app.locator('#markdownEditor > .cm-editor'),content=editor.locator('> .cm-scroller > .cm-content');
 const samples=[];page.on('console',m=>{if(m.text().startsWith('AUDIT CLIP '))samples.push(JSON.parse(m.text().slice(11)));});await editor.evaluate(el=>el.addEventListener('paste',e=>console.log('AUDIT CLIP '+JSON.stringify({text:e.clipboardData.getData('text/plain'),html:e.clipboardData.getData('text/html')})),true));
 const read=()=>editor.evaluate(async el=>{const{EditorView}=await import('/node_modules/@codemirror/view/dist/index.js');const v=EditorView.findFromDOM(el);return{doc:v.state.doc.toString(),ranges:v.state.selection.ranges.map(r=>[r.from,r.to])};});
 const shot=async name=>{if(process.env.AUDIT_OUTPUT)await page.screenshot({path:`${process.env.AUDIT_OUTPUT}/${name}.png`});};
 const reset=async doc=>{await app.locator('[data-editor-presentation="source"]').click();await content.focus();await page.keyboard.press('Control+a');await page.keyboard.insertText(doc);await page.keyboard.press('Control+Home');await app.locator('[data-editor-presentation="live"]').click();await page.waitForTimeout(120);};
 const selectAll=async()=>{await content.focus();await page.keyboard.press('Control+f');const panel=editor.locator(':scope > .cm-panels .cm-search');await panel.locator('input[name="search"]').fill('needle');await panel.locator('button[name="select"]').click();await page.keyboard.press('Escape');};
 if(!process.env.AUDIT_CHILD_ONLY)for(const [kind,body]of [['table','| Head | Other |\n| --- | --- |\n| needle | needle |'],['code','```text\nneedle needle\n```'],['footnote','Note[^n]\n\n[^n]: needle needle']])for(const dir of ['Backspace','Delete']){
  const doc='Before\n\n'+body+'\n\nAfter',name=`word-${kind}-${dir}`;await reset(doc);await selectAll();await page.keyboard.press(dir==='Backspace'?'ArrowRight':'ArrowLeft');assert.equal((await read()).ranges.length,2);await shot(name+'-01-carets');
  await page.keyboard.press('Control+'+dir);const first=await read();for(let i=0;i<6;i++)await page.keyboard.press('Control+'+dir);const after=await read();await shot(name+'-02-deleted');console.log(name,JSON.stringify({first,after}));
  if(!process.env.AUDIT_BASELINE){assert.ok(after.doc.startsWith('Before\n\n')&&after.doc.endsWith('\n\nAfter'));assert.ok(!after.doc.includes('needle'));if(kind==='table')assert.equal(after.doc,doc.replaceAll('needle',''));if(kind==='footnote')assert.equal(after.doc,doc.replaceAll('needle',''));if(kind==='code')assert.match(after.doc,/^Before\n\n```text\n\n?```\n\nAfter$/);for(let i=0;i<12&&(await read()).doc!==doc;i++)await page.keyboard.press('Control+z');assert.equal((await read()).doc,doc);}
 }
 if(!process.env.AUDIT_WORD_ONLY)for(const [kind,body]of [['code','```text\nalpha omega\nbeta omega\n```'],['quoted-code','> ```text\n> alpha omega\n> beta omega\n> ```'],['comment','<!-- alpha omega beta omega -->'],['summary','<details open>\n<summary>alpha omega beta omega</summary>\n\nBody\n\n</details>'],['prose','<details open>\n<summary>Title</summary>\n\nalpha omega beta omega\n\n</details>'],['table','| Head |\n| --- |\n| alpha omega beta omega |'],['footnote','Note[^n]\n\n[^n]: alpha omega\n    beta omega']]){
  const doc='Before\n\n'+body+'\n\nAfter',name=`child-${kind}`;
  const clip=page.getByLabel('隔离富文本');await clip.fill('PASTE');await clip.focus();await page.keyboard.press('Control+a');await page.keyboard.press('Control+c');await page.waitForTimeout(200);
  await reset(doc);const inner=editor.locator('.cm-live-inner').filter({hasText:'alpha omega'}).last();await inner.waitFor();
  const points=await inner.evaluate(async el=>{const{EditorView}=await import('/node_modules/@codemirror/view/dist/index.js');const v=EditorView.findFromDOM(el);return [...v.state.doc.toString().matchAll(/omega/g)].map(m=>{const r=v.coordsAtPos(m.index+5);return{x:r.left,y:(r.top+r.bottom)/2};});});assert.equal(points.length,2);
  await page.mouse.click(points[0].x,points[0].y);await page.keyboard.down('Control');await page.mouse.click(points[1].x,points[1].y);await page.keyboard.up('Control');
  const selected=await inner.evaluate(async el=>{const{EditorView}=await import('/node_modules/@codemirror/view/dist/index.js');const v=EditorView.findFromDOM(el);return{doc:v.state.doc.toString(),ranges:v.state.selection.ranges.map(r=>[r.from,r.to])};});await shot(name+'-01-carets');console.log(name+' selection',JSON.stringify(selected));assert.equal(selected.ranges.length,2);
  await page.keyboard.press('Control+v');await page.waitForTimeout(120);const after=await read();await shot(name+'-02-pasted');const expected=doc.replaceAll('omega','omega'+(['prose','table','footnote'].includes(kind)?'**PASTE**':'PASTE'));console.log(name+' paste',JSON.stringify({after,expected,clipboard:samples.at(-1)}));assert.equal(samples.at(-1)?.text,'PASTE');
  if(!process.env.AUDIT_BASELINE){assert.equal(after.doc,expected);assert.equal(after.ranges.length,2,'parent retains all child carets');await page.keyboard.press('Control+z');assert.equal((await read()).doc,doc);await page.keyboard.press('Control+y');assert.equal((await read()).doc,expected);await page.waitForTimeout(600);await page.keyboard.insertText('Z');await shot(name+'-03-follow-up');assert.equal((await read()).doc,expected.replaceAll('PASTE'+(['prose','table','footnote'].includes(kind)?'**':''),'PASTE'+(['prose','table','footnote'].includes(kind)?'**':'')+'Z'));await page.keyboard.press('Control+z');assert.equal((await read()).doc,expected);}
 }
 assert.deepEqual(errors,[]);console.log('PASS: word deletion and child-created multi-caret clipboard');
}catch(e){if(page&&process.env.AUDIT_OUTPUT)await page.screenshot({path:`${process.env.AUDIT_OUTPUT}/failure.png`});throw e;}finally{await browser?.close();await server.close();}
