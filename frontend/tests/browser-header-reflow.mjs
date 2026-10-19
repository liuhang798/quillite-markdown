// Isolated synthetic document; bridge spies only count calls, never write files.
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import {createServer} from 'vite';
const {chromium}=createRequire(import.meta.url)(process.env.PLAYWRIGHT_MODULE||'playwright');
const server=await createServer({root:fileURLToPath(new URL('..',import.meta.url)),server:{host:'127.0.0.1',port:0,watch:null,hmr:false},logLevel:'error'});
let browser,page;
try {
 await server.listen();browser=await chromium.launch({headless:true,executablePath:process.env.BROWSER_EXECUTABLE||undefined});
 page=await browser.newPage({viewport:{width:1100,height:1000}});page.setDefaultTimeout(10000);const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.route('**/*',route=>new URL(route.request().url()).hostname==='127.0.0.1'?route.continue():route.abort());
 await page.goto(server.resolvedUrls.local[0]+'tests/fixtures/app-drag-audit.html');const app=page.frameLocator('iframe');
 await app.locator('body').evaluate(async()=>{await import('/src/main.js');});
 await app.locator('#newFileButton').waitFor();
 await app.locator('body').evaluate(()=>{const bridge=window.quilliteMarkdown,original=bridge.newFile;bridge.newFile=async()=>({...await original(),name:'很长的文档名称 Long Markdown Document for Responsive Editing.md'});window.headerCalls={save:0,history:0};const save=bridge.saveAs,history=bridge.listDocumentVersions;bridge.saveAs=(...args)=>{window.headerCalls.save++;return save(...args);};bridge.listDocumentVersions=(...args)=>{window.headerCalls.history++;return history(...args);};});
 await app.locator('#newFileButton').click();
 const editor=app.locator('#markdownEditor > .cm-editor'),content=editor.locator('> .cm-scroller > .cm-content');
 await app.locator('[data-editor-presentation="source"]').click();await content.focus();await page.keyboard.insertText('# Heading\n\nBODY');await app.locator('[data-editor-presentation="live"]').click();
 const read=()=>editor.evaluate(async el=>{const{EditorView}=await import('/node_modules/@codemirror/view/dist/index.js');return EditorView.findFromDOM(el).state.doc.toString();});
 const shot=async name=>{if(process.env.AUDIT_OUTPUT){await page.waitForTimeout(250);await page.screenshot({path:`${process.env.AUDIT_OUTPUT}/${name}.png`});}};
 const check=async label=>{
  await page.waitForTimeout(100);
  const issues=await app.locator('.editor-header').evaluate(header=>{
   const h=header.getBoundingClientRect(),issues=[];
   for(const el of header.querySelectorAll('button,#editorSaveState')){
    const r=el.getBoundingClientRect();if(!r.width||!r.height)continue;
    if(r.left<h.left||r.right>h.right+.5||r.top<h.top||r.bottom>h.bottom+.5)issues.push(el.id+' outside header');
    if(!el.contains(document.elementFromPoint(r.x+r.width/2,r.y+r.height/2)))issues.push(el.id+' obscured');
    if(el.closest('.editor-status')){
     const range=document.createRange();
     // SVGs can have a different baseline; measure text nodes alone.
     const walker=document.createTreeWalker(el,NodeFilter.SHOW_TEXT),tops=[];while(walker.nextNode()){if(!walker.currentNode.textContent.trim())continue;range.selectNodeContents(walker.currentNode);for(const rect of range.getClientRects())tops.push(Math.round(rect.top));}
     if(new Set(tops).size>1)issues.push((el.id||el.textContent)+' wrapped text');
    }
   }
   return issues;
  });
  await shot(label);assert.deepEqual(issues,[],label);assert.equal(await read(),'# Heading\n\nBODY');
 };
 await check('01-zh-narrow');
 if(process.env.AUDIT_BASELINE)throw Error('Baseline unexpectedly passed');
 for(const language of ['zh-CN','en']){
  await app.locator('#moreButton').click();await app.locator('[data-settings-submenu="language"]').click();await app.locator(`[data-language="${language}"]`).click();
  for(const width of [980,1100,1500,1920]){
   await page.setViewportSize({width,height:1000});
   for(const layout of ['preview-left','editor-left','editor-only']){
    if(layout==='editor-left')await app.locator('#swapEditorLayoutButton').click();
    if(layout==='editor-only')await app.locator('#hideLivePreviewButton').click();
    const label=`${language}-${width}-${layout}`;await check(label);
    await app.locator('[data-editor-presentation="source"]').click();assert.equal(await editor.locator('.cm-live-heading').count(),0);await app.locator('[data-editor-presentation="live"]').click();assert.equal(await read(),'# Heading\n\nBODY');
    const before=await app.locator('body').evaluate(()=>({...window.headerCalls}));await app.locator('#saveAsButton').click();await app.locator('#documentHistoryButton').click();await app.locator('#documentHistoryDialog').waitFor({state:'visible'});if(language==='zh-CN'&&width===1100&&layout==='preview-left')await shot('02-history');await app.locator('#closeDocumentHistory').click();
    const after=await app.locator('body').evaluate(()=>({...window.headerCalls}));assert.equal(after.save,before.save+1);assert.equal(after.history,before.history+1);assert.equal(await read(),'# Heading\n\nBODY');
    await app.locator('#renameDocumentButton').click();await app.locator('#renameDocumentDialog').waitFor({state:'visible'});assert.match(await app.locator('#renameDocumentName').inputValue(),/Long Markdown Document/);if(language==='zh-CN'&&width===1100&&layout==='preview-left')await shot('03-rename');await app.locator('#cancelRenameDocument').click();
    await app.locator('#exitEditButton').click();await app.locator('#editorView').waitFor({state:'hidden'});await app.locator('#editButton').click();await app.locator('#editorView').waitFor({state:'visible'});assert.equal(await read(),'# Heading\n\nBODY');
    // Traverse the actual tab order from metadata into the mode switch.
    await app.locator('#renameDocumentButton').focus();await page.keyboard.press('Tab');assert.equal(await app.locator('#editorDocumentLocation').evaluate(el=>el===document.activeElement),true);await page.keyboard.press('Tab');assert.equal(await app.locator('#saveAsButton').evaluate(el=>el===document.activeElement),true);await app.locator('#documentHistoryButton').focus();await page.keyboard.press('Tab');assert.equal(await app.locator('[data-editor-presentation="live"]').evaluate(el=>el===document.activeElement),true);await page.keyboard.press('Tab');await page.keyboard.press('Enter');assert.equal(await app.locator('[data-editor-presentation="source"]').getAttribute('aria-pressed'),'true');await app.locator('[data-editor-presentation="live"]').click();
    console.log(label+': labels, hit targets, modes, Save As cancel, history, rename cancel, exit/reenter and Tab/Enter passed');
   }
   await app.locator('#restoreLivePreviewButton').click();
   if(await app.locator('body').getAttribute('data-editor-layout')==='editor-left')await app.locator('#swapEditorLayoutButton').click();
  }
 }
 assert.deepEqual(errors,[]);
}catch(error){if(page&&process.env.AUDIT_OUTPUT)await page.screenshot({path:`${process.env.AUDIT_OUTPUT}/failure.png`});throw error;}
finally{await browser?.close();await server.close();}
