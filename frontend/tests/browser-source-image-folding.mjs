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
  const app=page.frameLocator('iframe');await app.locator('#newFileButton').click();await app.locator('#hideLivePreviewButton').click();
  const editor=app.locator('#markdownEditor > .cm-editor'),content=editor.locator('> .cm-scroller > .cm-content');
  const read=()=>editor.evaluate(async el=>{const {EditorView}=await import('/node_modules/@codemirror/view/dist/index.js');const s=EditorView.findFromDOM(el).state;return {doc:s.doc.toString(),head:s.selection.main.head};});
  // Synthetic payload only. No user image or clipboard is read by this test.
  const uri='data:image/png;base64,'+'ABcd+/09'.repeat(12000)+'==';
  const image=`<img src="${uri}" alt="图片说明" width="50">`;
  let count=0;
  for(const theme of ['light','dark']) {
    if(theme==='dark')await app.locator('#colorModeButton').click();
    for(const block of [image,`![图片说明](${uri})`,`| 图片 | 说明 |\n|---|---|\n| ${image} | 内容 |`]) {
      await app.locator('[data-editor-presentation="source"]').click();
      const doc='Before\n\n'+block+'\n\nAfter';await content.fill(doc);
      const badge=editor.locator('.cm-source-image-summary');await badge.waitFor();
      assert.equal((await read()).doc,doc);assert.equal(await badge.count(),1);
      assert.ok((await content.innerText()).length<300);assert.ok((await badge.boundingBox()).height<40);
      await content.press('Control+End');await page.keyboard.insertText(' 新文字');
      assert.equal((await read()).doc,doc+' 新文字');assert.equal(await badge.count(),1);
      await page.keyboard.press('Control+z');assert.equal((await read()).doc,doc);
      await page.keyboard.press('Control+Shift+KeyZ');assert.equal((await read()).doc,doc+' 新文字');
      await page.keyboard.press('Control+z');
      await content.press('Control+a');
      const copied=await content.evaluate(el=>{const data=new DataTransfer();el.dispatchEvent(new ClipboardEvent('copy',{bubbles:true,cancelable:true,clipboardData:data}));return data.getData('text/plain');});
      assert.equal(copied,doc,'Copy returns original bytes, never the summary label');
      const cut=await content.evaluate(el=>{const data=new DataTransfer();el.dispatchEvent(new ClipboardEvent('cut',{bubbles:true,cancelable:true,clipboardData:data}));return data.getData('text/plain');});
      assert.equal(cut,doc);assert.equal((await read()).doc,'');
      await page.keyboard.press('Control+z');assert.equal((await read()).doc,doc);await badge.waitFor();
      await content.press('Control+End');
      if(block===image) {
        // Keyboard navigation treats the omitted data as one range. Deleting
        // it remains an explicit, undoable edit, not a partially hidden edit.
        await content.press('Control+Home');await content.press('ArrowDown');await content.press('ArrowDown');await content.press('Home');
        for(let n=0;n<10;n++)await content.press('ArrowRight');
        assert.equal((await read()).head,doc.indexOf(uri));
        await content.press('ArrowRight');assert.equal((await read()).head,doc.indexOf(uri)+uri.length);
        await content.press('Backspace');assert.equal((await read()).doc,doc.replace(uri,''));
        await page.keyboard.press('Control+z');assert.equal((await read()).doc,doc);await badge.waitFor();
        await content.press('Control+End');
        if(process.env.AUDIT_OUTPUT)await page.screenshot({path:process.env.AUDIT_OUTPUT+'/source-image-'+theme+'.png'});
        await app.locator('[data-editor-presentation="live"]').click();
        await editor.locator('.cm-embedded-image').hover();await editor.locator('[data-image-action="source"]').click();
        await badge.waitFor();assert.equal((await read()).doc,doc);
        assert.ok((await content.innerText()).length<600,'Image Show source also hides the payload');
        await app.locator('[data-editor-presentation="source"]').click();await badge.waitFor();
        assert.equal((await read()).doc,doc);
      }
      count++;
    }
  }
  await app.locator('#moreButton').click();await app.locator('[data-settings-submenu="language"]').click();await app.locator('[data-language="en"]').click();
  assert.match(await editor.locator('.cm-source-image-summary').innerText(),/Base64 image/);
  assert.deepEqual(errors,[]);console.log(`PASS ${count} cases: source mode, HTML/Markdown/table, light/dark, typing, copy/cut, undo/redo, image Show source, language`);
} finally {await browser?.close();await server.close();}
