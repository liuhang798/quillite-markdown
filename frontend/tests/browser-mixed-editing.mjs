// Explicitly authorized isolated browser and synthetic clipboard/documents.
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import {createServer} from 'vite';
const{chromium}=createRequire(import.meta.url)(process.env.PLAYWRIGHT_MODULE||'playwright');
const server=await createServer({root:fileURLToPath(new URL('..',import.meta.url)),server:{host:'127.0.0.1',port:0,watch:null,hmr:false},logLevel:'error'});
const pieces=[['prose','needle'],['inline','`needle`'],['code','```text\nneedle\n```'],['table','| Head | Other |\n| --- | --- |\n| needle | `needle` |'],['details','<details open>\n<summary>needle</summary>\n\nneedle `needle`\n\n</details>'],['comment','<!-- needle -->'],['footnote','Note[^n]\n\n[^n]: needle `needle`']];
let browser,page;
try{
 await server.listen();browser=await chromium.launch({headless:true,executablePath:process.env.BROWSER_EXECUTABLE||undefined});page=await browser.newPage({viewport:{width:1500,height:1200}});page.setDefaultTimeout(10000);const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto(server.resolvedUrls.local[0]+'tests/fixtures/app-drag-audit.html');const app=page.frameLocator('iframe');await app.locator('#newFileButton').click();await app.locator('#hideLivePreviewButton').click();const editor=app.locator('#markdownEditor > .cm-editor'),content=editor.locator('> .cm-scroller > .cm-content');
 const clipboardSamples=[];page.on('console',msg=>{if(msg.text().startsWith('AUDIT PASTE '))clipboardSamples.push(JSON.parse(msg.text().slice(12)));});
 await editor.evaluate(el=>el.addEventListener('paste',e=>console.log('AUDIT PASTE '+JSON.stringify({html:e.clipboardData.getData('text/html'),text:e.clipboardData.getData('text/plain')})),true));
 const read=()=>editor.evaluate(async el=>{const{EditorView}=await import('/node_modules/@codemirror/view/dist/index.js');const s=EditorView.findFromDOM(el).state;return{doc:s.doc.toString(),ranges:s.selection.ranges.map(r=>[r.from,r.to])};});
 const shot=async name=>{if(process.env.AUDIT_OUTPUT)await page.screenshot({path:`${process.env.AUDIT_OUTPUT}/${name}.png`});};
 const reset=async(doc,mode='live')=>{await app.locator('[data-editor-presentation="source"]').click();await content.focus();await page.keyboard.press('Control+a');await page.keyboard.insertText(doc);await page.keyboard.press('Control+Home');if(mode==='live')await app.locator('[data-editor-presentation="live"]').click();await content.focus();await page.keyboard.press('Control+f');const panel=editor.locator(':scope > .cm-panels .cm-search');await panel.locator('input[name="search"]').fill('needle');await panel.locator('button[name="select"]').click();await page.keyboard.press('Escape');await page.waitForTimeout(150);};
 for(const mode of process.env.AUDIT_ONLY_BOUNDARY?[]:['live','source'])for(const order of ['forward','reverse','code-first','summary-first']){
  const first=order==='code-first'?'code':order==='summary-first'?'details':null;
  const ordered=order==='reverse'?[...pieces].reverse():first?[...pieces.filter(p=>p[0]===first),...pieces.filter(p=>p[0]!==first)]:pieces,doc='Before\n\n'+ordered.map(p=>p[1]).join('\n\n')+'\n\nAfter',name=`${mode}-${order}`;
  const clip=page.getByLabel('隔离富文本');await clip.fill('PASTE');await clip.focus();await page.keyboard.press('Control+a');await page.keyboard.press('Control+c');
 await reset(doc,mode);await shot(name+'-01-selected');assert.equal((await read()).ranges.length,[...doc.matchAll(/needle/g)].length);assert.equal((await read()).doc,doc);
  await page.keyboard.press('Control+v');await page.waitForTimeout(150);const result=await read();await shot(name+'-02-pasted');assert.equal(clipboardSamples.at(-1)?.text,'PASTE','synthetic clipboard reached paste event');
  const expected='Before\n\n'+ordered.map(([kind,text])=>{
   if(kind==='details')return text.replace('needle','PASTE').replace('needle','**PASTE**').replace('needle','PASTE');
   if(['table','footnote'].includes(kind))return text.replace('needle','**PASTE**').replace('needle','PASTE');
   return text.replaceAll('needle',['inline','code','comment'].includes(kind)?'PASTE':'**PASTE**');
  }).join('\n\n')+'\n\nAfter';
  console.log('PASTE',name,JSON.stringify({actual:result.doc,expected,ranges:result.ranges}));
  if(!process.env.AUDIT_BASELINE)assert.equal(result.doc,expected);
  await page.keyboard.press('Control+z');assert.equal((await read()).doc,doc);await page.keyboard.press('Control+y');assert.equal((await read()).doc,result.doc);
 }
 for(const [kind,body]of [['table','| Head | Other |\n| --- | --- |\n| needle | needle |'],['code','```text\nneedle\n```'],['footnote','Note[^n]\n\n[^n]: needle']])for(const key of ['Backspace','Delete']){
  const doc='Before\n\n'+(kind==='table'?body:body.replace('needle','needle needle'))+'\n\nAfter',name=`boundary-${kind}-${key}`;await reset(doc);await shot(name+'-01-selected');
  await page.keyboard.press(key);const cleared=await read();
  for(let i=0;i<8;i++)await page.keyboard.press(key);
  const result=await read();await shot(name+'-02-deleted');console.log('BOUNDARY',name,JSON.stringify({cleared,result}));
  if(!process.env.AUDIT_BASELINE){
   if(kind==='code')assert.match(result.doc,/^Before\n\n```text\n\n?```\n\nAfter$/);
   else assert.equal(result.doc,cleared.doc,'empty field must not delete its skeleton or following prose');
   await page.waitForTimeout(600);await page.keyboard.insertText('Z');const after=await read();console.log('TYPE',name,JSON.stringify(after));assert.ok(after.doc.endsWith('\n\nAfter'));assert.equal((after.doc.match(/Z/g)||[]).length,result.ranges.length);
   await page.keyboard.press('Control+z');assert.equal((await read()).doc,result.doc);
   // No-op boundary keys create no history entries; undo restores all deleted text.
   for(let i=0;i<12&&(await read()).doc!==doc;i++)await page.keyboard.press('Control+z');
   assert.equal((await read()).doc,doc);
  }
 }
 assert.deepEqual(errors,[]);console.log('PASS: mixed clipboard and deletion audit');
}catch(e){if(page&&process.env.AUDIT_OUTPUT)await page.screenshot({path:`${process.env.AUDIT_OUTPUT}/failure.png`});throw e;}finally{await browser?.close();await server.close();}
