import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import {createServer} from 'vite';
const {chromium}=createRequire(import.meta.url)(process.env.PLAYWRIGHT_MODULE||'playwright');
const server=await createServer({root:fileURLToPath(new URL('..',import.meta.url)),server:{host:'127.0.0.1',port:0,watch:null,hmr:false},logLevel:'error'});
let browser;
try {
  await server.listen();browser=await chromium.launch({headless:true,executablePath:process.env.BROWSER_EXECUTABLE||undefined});
  const page=await browser.newPage({viewport:{width:1450,height:950}}),errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  await page.route('**/*',r=>new URL(r.request().url()).hostname==='127.0.0.1'?r.continue():r.abort());
  await page.goto(server.resolvedUrls.local[0]+'tests/fixtures/multiline-edit-audit.html');
  const frame=page.frames().find(f=>f.parentFrame());await frame.evaluate(async()=>{await import('/src/main.js');});
  const app=page.frameLocator('iframe');await app.locator('#newFileButton').click();
  const editor=app.locator('#markdownEditor > .cm-editor'),content=editor.locator('> .cm-scroller > .cm-content');
  const read=()=>editor.evaluate(async el=>{const {EditorView}=await import('/node_modules/@codemirror/view/dist/index.js');return EditorView.findFromDOM(el).state.doc.toString();});
  const png='data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a9f8AAAAASUVORK5CYII=';
  const image=`<img src="${png}" alt="图片" style="display:block;margin-left:0;margin-right:auto" width="50">`;
  let count=0;
  for(const theme of ['light','dark']) {
    if(theme==='dark')await app.locator('#colorModeButton').click();
    for(const gap of ['\n','\n\n']) for(const level of [1,2,3,4,5,6]) {
      const doc=image+gap+'图片后文字\n\n下面文字';
      await app.locator('[data-editor-presentation="source"]').click();await content.fill(doc);
      await app.locator('[data-editor-presentation="live"]').click();
      await editor.locator('.cm-line').filter({hasText:'图片后文字'}).click();
      await app.locator('#headingSelect').click();await app.locator('#textStyleMenu button').nth(level).click();
      const expected=image+'\n\n'+'#'.repeat(level)+' 图片后文字\n\n下面文字';
      assert.equal(await read(),expected);
      await editor.locator('.cm-live-h'+level).filter({hasText:'图片后文字'}).waitFor();
      await app.locator('#editorPreviewContent h'+level).filter({hasText:'图片后文字'}).waitFor();
      assert.equal(await editor.locator('.cm-embedded-image').count(),1);
      await page.keyboard.press('Control+z');assert.equal(await read(),doc);
      await page.keyboard.press('Control+Shift+KeyZ');assert.equal(await read(),expected);
      // The next paragraph must still format independently after image repair.
      await editor.locator('.cm-line').filter({hasText:'下面文字'}).click();
      await app.locator('#headingSelect').click();await app.locator('#textStyleMenu button').nth(1).click();
      assert.equal(await read(),expected.replace('下面文字','# 下面文字'));
      await app.locator('#editorPreviewContent h1').filter({hasText:'下面文字'}).waitFor();
      count++;
      if(level===1&&gap==='\n'&&process.env.AUDIT_OUTPUT)await page.screenshot({path:process.env.AUDIT_OUTPUT+'/image-heading-'+theme+'.png'});
    }
  }
  assert.deepEqual(errors,[]);console.log(`PASS ${count} image-adjacent heading cases: both themes, six headings, existing/missing blank line, next paragraph, undo/redo`);
} finally {await browser?.close();await server.close();}
