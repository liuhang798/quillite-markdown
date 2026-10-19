import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import {createServer} from 'vite';
import {findMarkdownTables} from '../src/table-designer.js';
const {chromium}=createRequire(import.meta.url)(process.env.PLAYWRIGHT_MODULE||'playwright');
const server=await createServer({root:fileURLToPath(new URL('..',import.meta.url)),server:{host:'127.0.0.1',port:0,watch:null,hmr:false},logLevel:'error'});
const table='<!-- quillite-table-widths: 220, 220, 220 -->\n| A | B | C |\n| :--- | :--- | :--- |\n| a | b | c |\n| d | e | f |';
let browser;
try{
 await server.listen();browser=await chromium.launch({headless:true,executablePath:process.env.BROWSER_EXECUTABLE||undefined});
 const page=await browser.newPage({viewport:{width:1500,height:950}}),errors=[];page.setDefaultTimeout(10000);
 page.on('pageerror',e=>errors.push(e.message));
 await page.route('**/*',r=>new URL(r.request().url()).hostname==='127.0.0.1'?r.continue():r.abort());
 await page.goto(server.resolvedUrls.local[0]+'tests/fixtures/multiline-edit-audit.html');
 const frame=page.frames().find(f=>f.parentFrame());await frame.evaluate(async()=>{await import('/src/main.js');});
 const app=page.frameLocator('iframe');await app.locator('#newFileButton').click();
 const editor=app.locator('#markdownEditor > .cm-editor'),content=editor.locator('> .cm-scroller > .cm-content');
 const read=()=>editor.evaluate(async el=>{const{EditorView}=await import('/node_modules/@codemirror/view/dist/index.js');return EditorView.findFromDOM(el).state.doc.toString();});
 const image=server.resolvedUrls.local[0]+'tests/fixtures/sample-image.svg';
 const openImage=async()=>{
  const button=app.locator('[data-format="image"]');
  if(await button.isVisible())await button.click();
  else{await app.locator('#moreFormatButton').click();await app.locator('#moreFormatMenu [data-format-command="image"]').click();}
 };
 let passed=0;
 for(const dark of [false,true]){
  if(dark)await app.locator('#colorModeButton').click();
  for(const gap of ['', '\n', '\n\n'])for(const width of [100,50]){
   console.log('CASE',dark,JSON.stringify(gap),width);
   const source='Before\n\n'+table+gap;
   await app.locator('[data-editor-presentation="source"]').click();await content.fill(source);await content.press('Control+End');
   await app.locator('[data-editor-presentation="live"]').click();
   await app.locator('#restoreLivePreviewButton').click();
   await editor.locator('.cm-live-table').waitFor({state:'visible'});
   await openImage();await app.locator('#imageUrl').fill(image);
   await app.locator('#imageWidth').focus();await page.keyboard.press('End');
   if(width===50)for(let i=0;i<10;i++)await page.keyboard.press('ArrowLeft');
   await app.locator('#confirmImage').click();
   const changed=await read();
   assert.deepEqual(findMarkdownTables(changed)[0]?.model,findMarkdownTables(source)[0].model);
   await editor.locator('.cm-live-table').waitFor({state:'visible'});
   assert.equal(await editor.locator('.cm-live-comment').count(),0,'Width metadata stays hidden');
   await editor.locator('.cm-embedded-image img').waitFor({state:'visible'});
   await app.locator('#editorPreviewContent table').waitFor({state:'visible'});
   await content.focus();await page.keyboard.press('Control+z');assert.equal(await read(),source);
   await page.keyboard.press('Control+Shift+KeyZ');assert.equal(await read(),changed);
   passed++;
  }
  if(process.env.AUDIT_OUTPUT)await page.screenshot({path:process.env.AUDIT_OUTPUT+'/image-table-'+(dark?'dark':'light')+'.png'});
 }
 // Real large PNG data (no user file); mock only the native picker result.
 const data=await frame.evaluate(()=>{
  const canvas=document.createElement('canvas');canvas.width=320;canvas.height=280;
  const ctx=canvas.getContext('2d'),pixels=ctx.createImageData(320,280);let seed=42;
  for(let i=0;i<pixels.data.length;i++)pixels.data[i]=i%4===3?255:((seed=(Math.imul(seed,1664525)+1013904223)>>>0)>>>24);
  ctx.putImageData(pixels,0,0);const data=canvas.toDataURL('image/png');
  window.quilliteMarkdown.selectImage=async()=>data;return data;
 });
 assert.ok(data.length>300000);
 for(const gap of ['', '\n']){
  const source=table+gap;
  await app.locator('[data-editor-presentation="source"]').click();await content.fill(source);await content.press('Control+End');
  await app.locator('[data-editor-presentation="live"]').click();await openImage();await app.locator('#pickLocalImage').click();
  await editor.locator('.cm-embedded-image img').waitFor({state:'visible'});
  const changed=await read();assert.ok(changed.includes(data));
  assert.deepEqual(findMarkdownTables(changed)[0]?.model,findMarkdownTables(source)[0].model);
  await editor.locator('.cm-live-table').waitFor({state:'visible'});
  await content.focus();await page.keyboard.press('Control+z');assert.equal(await read(),source);
  await page.keyboard.press('Control+Shift+KeyZ');assert.equal(await read(),changed);
 }
 // Inserting inside a real cell must remain in the cell, not become a block.
 await app.locator('[data-editor-presentation="source"]').click();await content.fill(table);await content.press('Control+Home');
 await app.locator('[data-editor-presentation="live"]').click();
 await editor.locator('.cm-live-table .cm-line').filter({hasText:/^a$/}).click();await page.keyboard.press('End');
 await openImage();await app.locator('#imageUrl').fill(image);await app.locator('#confirmImage').click();
 const cellDoc=await read(),model=findMarkdownTables(cellDoc)[0].model;
 assert.equal(model.cells.length,3);assert.ok(model.cells[1][0].includes('<img'));assert.equal(model.cells[1][1],'b');
 await editor.locator('.cm-live-table .cm-embedded-image img').waitFor({state:'visible'});
 assert.deepEqual(errors,[]);console.log(JSON.stringify({passed,embedded:2,cell:true,history:true,errors}));
}finally{await browser?.close();await server.close();}
