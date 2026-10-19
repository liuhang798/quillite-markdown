import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import {mkdir,writeFile} from 'node:fs/promises';
import {createServer} from 'vite';
const {chromium}=createRequire(import.meta.url)(process.env.PLAYWRIGHT_MODULE||'playwright');
const out=process.env.AUDIT_OUTPUT;await mkdir(out,{recursive:true});
const server=await createServer({root:fileURLToPath(new URL('..',import.meta.url)),server:{host:'127.0.0.1',port:0,watch:null,hmr:false},logLevel:'error'});
await server.listen();const browser=await chromium.launch({headless:true,executablePath:process.env.BROWSER_EXECUTABLE||undefined});const results=[];
try{
 for(const language of ['zh-CN','en']){
  const page=await browser.newPage({viewport:{width:1200,height:1000}});const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.route('**/*',r=>new URL(r.request().url()).hostname==='127.0.0.1'?r.continue():r.abort());
  await page.goto(server.resolvedUrls.local[0]+'tests/fixtures/app-drag-audit.html');const frame=page.frames().find(f=>f.parentFrame());await frame.evaluate(async()=>{await import('/src/main.js');});const app=page.frameLocator('iframe');
  await app.locator('#newFileButton').click();await app.locator('#hideLivePreviewButton').click();
  if(language==='en'){await app.locator('#moreButton').click();await app.locator('[data-settings-submenu="language"]').click();await app.locator('[data-language="en"]').click();}
  const editor=app.locator('#markdownEditor > .cm-editor');
  const read=()=>editor.evaluate(async el=>{const{EditorView}=await import('/node_modules/@codemirror/view/dist/index.js');return EditorView.findFromDOM(el).state.doc.toString();});
  const open=async()=>{await app.locator('[data-format="formula-builder"]').click();await app.locator('#formulaSearch').fill('matrix3');await app.locator('[data-formula-template="matrix3"]').click();};
  const invalid=async()=>{await app.locator('[data-formula-field="row1"]').fill('a,b');await page.keyboard.press('Control+Enter');await app.locator('#toast').waitFor({state:'visible'});assert.equal(await read(),'');};
  await open();await invalid();await page.screenshot({path:out+'/'+language+'-01-invalid.png'});
  await app.locator('[data-formula-field="row1"]').fill('a,b,c');assert.equal(await app.locator('#insertFormula').isEnabled(),true);const correctedWarning=await app.locator('#toast').isVisible();
  await page.screenshot({path:out+'/'+language+'-02-corrected.png'});await app.locator('#insertFormula').click();await editor.locator('.cm-formula-render').waitFor();const savedWarning=await app.locator('#toast').isVisible();assert.ok((await read()).includes('bmatrix'));
  await page.screenshot({path:out+'/'+language+'-03-saved.png'});await editor.locator('> .cm-scroller > .cm-content').focus();await page.keyboard.press('Control+z');assert.equal(await read(),'');
  await open();await invalid();await app.locator('#cancelFormula').click();const cancelledWarning=await app.locator('#toast').isVisible();assert.equal(await read(),'');
  await page.screenshot({path:out+'/'+language+'-04-cancelled.png'});results.push({language,correctedWarning,savedWarning,cancelledWarning,errors});await page.close();
 }
 console.log(JSON.stringify(results));await writeFile(out+'/results.json',JSON.stringify(results,null,2));
 assert.ok(results.every(r=>!r.correctedWarning&&!r.savedWarning&&!r.cancelledWarning&&r.errors.length===0));
}finally{await browser.close();await server.close();}
