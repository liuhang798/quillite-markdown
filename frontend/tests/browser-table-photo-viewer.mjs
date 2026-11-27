import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import {createServer} from 'vite';
const {chromium}=createRequire(import.meta.url)(process.env.PLAYWRIGHT_MODULE||'playwright');
const server=await createServer({root:fileURLToPath(new URL('..',import.meta.url)),server:{host:'127.0.0.1',port:0,hmr:false,watch:null},logLevel:'error',
  plugins:[{name:'photo-test',enforce:'pre',transform(code,id){if(id.replaceAll('\\','/').endsWith('/src/renderer.js'))return code+'\nwindow.photoTest={displayDocument,toggleEditor,state,editorContent};';}}]});
let browser;
try{
  await server.listen();browser=await chromium.launch({headless:true,executablePath:process.env.BROWSER_EXECUTABLE});
  const page=await browser.newPage({viewport:{width:1600,height:950}});page.setDefaultTimeout(9000);
  const errors=[];let reads=0;page.on('pageerror',e=>errors.push(e.message));
  const url=server.resolvedUrls.local[0]+'tests/fixtures/sample-image.svg';
  await page.route(url,async route=>{reads++;await route.fulfill({path:fileURLToPath(new URL('fixtures/sample-image.svg',import.meta.url)),contentType:'image/svg+xml',headers:{'Cache-Control':'no-store'}});});
  const src='# Draft\n\n| Photo | Status |\n| --- | --- |\n| before ![first]('+url+') between ![second]('+url+') after | untouched |\n'+Array.from({length:23},(_,i)=>'| row '+i+' | data |').join('\n');
  await page.goto(server.resolvedUrls.local[0]);await page.waitForFunction(()=>window.photoTest && document.querySelector('#fileList').childElementCount);
  await page.evaluate(src=>{quilliteMarkdown.canEditFile=async()=>true;photoTest.displayDocument({name:'demo.md',path:'/test/demo.md',directory:'/test',revision:'a'.repeat(64),content:src});},src);
  const pic=page.locator('#markdownContent img[alt=second]'),viewer=page.locator('#diagramViewer');
  await page.waitForFunction(()=>document.querySelector('#markdownContent img[alt=second]')?.naturalWidth===240);
  const before=reads;await pic.click();await viewer.getByRole('heading',{name:/图片查看|Image viewer/}).waitFor();
  await viewer.locator('[data-viewer-action=actual]').click();assert.equal(await viewer.locator('output').textContent(),'100%');
  await viewer.locator('[data-viewer-action=plus]').click();assert.notEqual(await viewer.locator('output').textContent(),'100%');
  await page.keyboard.press('Escape');await viewer.waitFor({state:'hidden'});assert.equal(reads,before,'viewing must not fetch the no-store image again');
  // An authored image link keeps its normal click; blocked/unloaded images
  // cannot be opened as a side effect of the viewer's delegated listener.
  const guarded=await pic.evaluate(img=>{
    const link=document.createElement('a');link.href='#draft';img.replaceWith(link);link.append(img);
    let linked=false;link.addEventListener('click',()=>{linked=true;},{once:true});img.click();link.replaceWith(img);
    const missing=document.createElement('img');missing.dataset.remoteImageBlocked='true';img.after(missing);missing.click();missing.remove();
    return linked && !document.querySelector('#diagramViewer').open;
  });assert.equal(guarded,true);
  await page.evaluate(()=>photoTest.toggleEditor(true));
  const table=page.locator('#markdownEditor .cm-live-table-lightweight').first(),wrap=table.locator('.qm-cell-image').nth(1);
  await wrap.hover();await wrap.getByRole('button',{name:/查看大图|View image/}).click();
  await viewer.waitFor();await page.keyboard.press('Escape');await viewer.waitFor({state:'hidden'});
  assert.equal(await table.locator('.cm-live-inner').count(),0,'viewing must not activate the cell');
  await wrap.hover();await wrap.getByRole('button',{name:/调整尺寸|Adjust size/}).click();
  const panel=table.locator('.cm-embedded-image').nth(1),width=panel.locator('[data-image-size=width]');
  await width.waitFor({state:'visible'});assert.equal(await panel.locator('[data-image-keep-ratio]').isChecked(),true);
  await panel.locator('[data-image-size-unit=width]').selectOption('%');await width.fill('50');await panel.locator('[data-image-size-action=apply-size]').click();
  const changed=await page.evaluate(()=>photoTest.editorContent());
  const target='![second]('+url+')',pos=src.indexOf(target);assert.ok(changed.startsWith(src.slice(0,pos)));assert.ok(changed.endsWith(src.slice(pos+target.length)));
  assert.match(changed,/alt="second"[^>]*width="50%"/);
  await page.locator('#editorUndoButton').click();assert.equal(await page.evaluate(()=>photoTest.editorContent()),src);
  assert.deepEqual(errors,[]);console.log('PASS reading/photo zoom, no refetch, static large-table view + targeted resize, exact undo');
}finally{await browser?.close();await server.close();}
