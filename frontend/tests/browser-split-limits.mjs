// Real input against an isolated app and synthetic document only.
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import {createServer} from 'vite';
const {chromium}=createRequire(import.meta.url)(process.env.PLAYWRIGHT_MODULE||'playwright');
const server=await createServer({root:fileURLToPath(new URL('..',import.meta.url)),server:{host:'127.0.0.1',port:0,watch:null,hmr:false},logLevel:'error'});
let browser,page;
try{
 await server.listen();browser=await chromium.launch({headless:true,executablePath:process.env.BROWSER_EXECUTABLE||undefined});
 page=await browser.newPage({viewport:{width:1100,height:1000}});page.setDefaultTimeout(10000);const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.route('**/*',route=>new URL(route.request().url()).hostname==='127.0.0.1'?route.continue():route.abort());
 await page.goto(server.resolvedUrls.local[0]+'tests/fixtures/app-drag-audit.html');const app=page.frameLocator('iframe');
 await app.locator('body').evaluate(async()=>{await import('/src/main.js');});
 await app.locator('#newFileButton').click();
 const editor=app.locator('#markdownEditor > .cm-editor'),content=editor.locator('> .cm-scroller > .cm-content');
 const source='# Heading\n\nBODY\n\n```text\nCODE\n```';
 await app.locator('[data-editor-presentation="source"]').click();await content.focus();await page.keyboard.insertText(source);await app.locator('[data-editor-presentation="live"]').click();
 await app.locator('#restoreLivePreviewButton').click();
 const read=()=>editor.evaluate(async el=>{const{EditorView}=await import('/node_modules/@codemirror/view/dist/index.js');return EditorView.findFromDOM(el).state.doc.toString();});
 const shot=async name=>{if(process.env.AUDIT_OUTPUT){await page.waitForTimeout(250);await page.screenshot({path:`${process.env.AUDIT_OUTPUT}/${name}.png`});}};
 const check=async label=>{
  await page.waitForTimeout(180);await shot(label);
  const issues=await app.locator('#editorView').evaluate(view=>{
   const editor=view.querySelector('.editor-workspace'),bounds=editor.getBoundingClientRect(),issues=[];
   if(bounds.width<359.5)issues.push('editor width '+bounds.width);
   const preview=view.querySelector('.editor-preview-pane').getBoundingClientRect();if(preview.width<179.5)issues.push('preview width '+preview.width);
   const handle=view.querySelector('#editorResizer'),now=Number(handle.getAttribute('aria-valuenow')),minimum=Number(handle.getAttribute('aria-valuemin')),maximum=Number(handle.getAttribute('aria-valuemax'));
   if(!(Number.isFinite(now)&&minimum<=now&&now<=maximum))issues.push('invalid accessible range');
   for(const button of editor.querySelectorAll('.editor-header button,#moreFormatButton')){
    const r=button.getBoundingClientRect();if(!r.width||!r.height)continue;
    if(r.left<bounds.left-.5||r.right>bounds.right+.5||r.top<bounds.top||r.bottom>bounds.bottom)issues.push((button.id||button.textContent)+' outside editor');
    if(!button.contains(document.elementFromPoint(r.x+r.width/2,r.y+r.height/2)))issues.push((button.id||button.textContent)+' obscured');
   }
   return issues;
  });assert.deepEqual(issues,[],label);assert.equal(await read(),source);
 };
 const drag=async right=>{const handle=await app.locator('#editorResizer').boundingBox(),view=await app.locator('#editorView').boundingBox();await page.mouse.move(handle.x+handle.width/2,handle.y+180);await page.mouse.down();await page.mouse.move(right?view.x+view.width-2:view.x+2,handle.y+180,{steps:18});await page.mouse.up();};
 await drag(true);await check('01-right-limit');
 if(process.env.AUDIT_BASELINE)throw Error('Baseline unexpectedly passed');
 for(const width of [920,1100,1500]){
  await page.setViewportSize({width,height:1000});
  for(const layout of ['preview-left','editor-left']){
   if(layout==='editor-left')await app.locator('#swapEditorLayoutButton').click();
   for(const right of [true,false]){
    await drag(right);const label=`${width}-${layout}-${right?'right':'left'}`;await check(label);
    const cell=editor.locator('.cm-live-code .cm-content');await cell.click();await page.keyboard.press('End');await page.keyboard.insertText('X');assert.equal(await read(),source.replace('CODE','CODEX'));await page.keyboard.press('Control+z');assert.equal(await read(),source);
    const block=editor.locator('.cm-live-code');await block.hover();await block.locator('> .cm-live-block-actions button').click();const back=editor.getByRole('button',{name:'返回渲染',exact:true});await back.click();assert.equal(await read(),source);
    await app.locator('#moreFormatButton').click();assert.equal(await app.locator('#moreFormatButton').getAttribute('aria-expanded'),'true');await page.keyboard.press('Escape');
    console.log(label+': pointer limits, code editing/undo, source return and format menu passed');
   }
   const handle=app.locator('#editorResizer');await handle.focus();for(let i=0;i<60;i++)await page.keyboard.press('ArrowRight');await check(`${width}-${layout}-keyboard-right`);for(let i=0;i<60;i++)await page.keyboard.press('ArrowLeft');await check(`${width}-${layout}-keyboard-left`);
  }
  await app.locator('#swapEditorLayoutButton').click();
 }
 // A constrained small window must not replace the user's wide-window preference.
 await page.setViewportSize({width:1920,height:1000});await drag(true);await page.waitForTimeout(180);const preference=await app.locator('body').evaluate(()=>localStorage.getItem('editorPreviewWidth')),wide=await app.locator('#editorResizer').boundingBox();
 await page.setViewportSize({width:920,height:1000});await check('02-window-shrink');assert.equal(await app.locator('body').evaluate(()=>localStorage.getItem('editorPreviewWidth')),preference);
 await app.locator('#editorResizer').focus();await page.keyboard.press('ArrowRight');assert.equal(await app.locator('body').evaluate(()=>localStorage.getItem('editorPreviewWidth')),preference,'blocked key preserves preferred width');
 const constrained=await app.locator('#editorResizer').boundingBox();await page.mouse.move(constrained.x+constrained.width/2,constrained.y+180);await page.mouse.down();await page.mouse.move(constrained.x-20,constrained.y+180,{steps:5});await page.mouse.move(constrained.x+constrained.width/2,constrained.y+180,{steps:5});await page.mouse.up();assert.equal(await app.locator('body').evaluate(()=>localStorage.getItem('editorPreviewWidth')),preference,'round-trip drag preserves preferred width');
 await page.setViewportSize({width:1920,height:1000});await check('03-window-restore');assert.equal(await app.locator('body').evaluate(()=>localStorage.getItem('editorPreviewWidth')),preference);assert.ok(Math.abs((await app.locator('#editorResizer').boundingBox()).x-wide.x)<1,'restored physical divider');
 await page.setViewportSize({width:920,height:1000});await page.waitForTimeout(180);const sidebar=await app.locator('#sidebarResizer').boundingBox();await page.mouse.move(sidebar.x+sidebar.width/2,sidebar.y+180);await page.mouse.down();await page.mouse.move(910,sidebar.y+180,{steps:18});await page.mouse.up();await check('04-sidebar-limit');
 console.log('keyboard limits, window shrink/restore and sidebar limit passed');assert.deepEqual(errors,[]);
}catch(error){if(page&&process.env.AUDIT_OUTPUT)await page.screenshot({path:`${process.env.AUDIT_OUTPUT}/failure.png`});throw error;}
finally{await browser?.close();await server.close();}
