// Synthetic document only. Hold table-focus animation callbacks to exercise
// the real UI order when another input arrives before the next painted frame.
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import {createServer} from 'vite';
const {chromium}=createRequire(import.meta.url)(process.env.PLAYWRIGHT_MODULE||'playwright');
const server=await createServer({root:fileURLToPath(new URL('..',import.meta.url)),server:{host:'127.0.0.1',port:0,watch:null,hmr:false},logLevel:'error'});
let browser,page;
try {
 await server.listen();browser=await chromium.launch({headless:true,executablePath:process.env.BROWSER_EXECUTABLE||undefined});
 page=await browser.newPage({viewport:{width:1400,height:1000}});page.setDefaultTimeout(10000);
 const errors=[];page.on('pageerror',error=>errors.push(error.message));
 await page.route('**/*',route=>new URL(route.request().url()).hostname==='127.0.0.1'?route.continue():route.abort());
 await page.goto(server.resolvedUrls.local[0]);await page.locator('body').evaluate(()=>import('/src/main.js'));
 await page.locator('#newFileButton').click();
 const editor=page.locator('#markdownEditor > .cm-editor'),content=editor.locator('> .cm-scroller > .cm-content');
 const source='Before\n\n- Outer\n  - Inner\n\n    | A | B |\n    | --- | --- |\n    | C | D |\n\nAfter';
 const read=()=>editor.evaluate(async el=>{const{EditorView}=await import('/node_modules/@codemirror/view/dist/index.js');return EditorView.findFromDOM(el).state.doc.toString();});
 const shot=async name=>{if(process.env.AUDIT_OUTPUT)await page.screenshot({path:`${process.env.AUDIT_OUTPUT}/${name}.png`});};
 await page.evaluate(()=>{
  const original=window.requestAnimationFrame.bind(window);window.tableFocusFrames=[];
  window.requestAnimationFrame=callback=>String(callback).includes('data-table-cell-row')
   ? (window.tableFocusFrames.push(callback),-window.tableFocusFrames.length):original(callback);
  window.flushTableFocusFrames=()=>{const frames=window.tableFocusFrames.splice(0);frames.forEach(callback=>callback(performance.now()));return frames.length;};
 });
 for(const kind of ['open','row','column','reopen']) {
  await page.locator('[data-editor-presentation="source"]').click();await content.fill(source);await content.press('Control+Home');
  await page.locator('[data-editor-presentation="live"]').click();
  const table=editor.locator('.cm-live-table');await table.hover();await table.getByRole('button',{name:'编辑表格',exact:true}).click();
  const dialog=page.locator('#tableDialog');await dialog.waitFor({state:'visible'});
  if(kind!=='open')await page.evaluate(()=>window.flushTableFocusFrames());
  if(kind==='row')await page.locator('#addTableRow').click();
  if(kind==='column')await page.locator('#addTableColumn').click();
  if(kind==='reopen') {
   await page.locator('#addTableColumn').click();await page.locator('#cancelTable').click();
   await table.hover();await table.getByRole('button',{name:'编辑表格',exact:true}).click();
  }
  const target=dialog.locator('[data-table-cell-row="1"][data-table-cell-column="1"]');
  await target.click();await target.press('Control+a');await page.keyboard.insertText('Chosen');
  await shot(kind+'-01-chosen');
  const queued=await page.evaluate(()=>window.flushTableFocusFrames());
  await page.keyboard.insertText(' Z');await shot(kind+'-02-after-frame');
  assert.equal(await target.inputValue(),'Chosen Z',kind+' delayed focus must not redirect typing');
  assert.equal(await target.evaluate(el=>el===document.activeElement),true,kind+' selected cell retains focus');
  assert.equal(await dialog.locator('[data-table-cell-row="0"][data-table-cell-column="0"]').inputValue(),'A');
  await page.locator('#confirmTable').click();await dialog.waitFor({state:'hidden'});
  assert.ok((await read()).includes('Chosen Z'));await content.press('Control+z');assert.equal(await read(),source);
  console.log(JSON.stringify({PASS:kind,queued,history:true}));
 }
 assert.deepEqual(errors,[]);console.log(JSON.stringify({PASS:4,pageErrors:errors}));
}catch(error){if(page&&process.env.AUDIT_OUTPUT)await page.screenshot({path:`${process.env.AUDIT_OUTPUT}/failure.png`});throw error;}
finally{await browser?.close();await server.close();}
