import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import {createServer} from 'vite';
const {chromium}=createRequire(import.meta.url)(process.env.PLAYWRIGHT_MODULE||'playwright');
const server=await createServer({root:fileURLToPath(new URL('..',import.meta.url)),server:{host:'127.0.0.1',port:0,watch:null,hmr:false},logLevel:'error'});
let browser;
try {
  await server.listen();browser=await chromium.launch({headless:true,executablePath:process.env.BROWSER_EXECUTABLE||undefined});
  const page=await browser.newPage({viewport:{width:1450,height:900}}),errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  await page.route('**/*',r=>new URL(r.request().url()).hostname==='127.0.0.1'?r.continue():r.abort());
  await page.goto(server.resolvedUrls.local[0]+'tests/fixtures/app-drag-audit.html');
  const app=page.frameLocator('iframe');
  await app.locator('body').evaluate(async()=>{await import('/src/main.js');});
  await app.locator('#newFileButton').click();
  const editor=app.locator('#markdownEditor > .cm-editor'),content=editor.locator('> .cm-scroller > .cm-content');
  const live=app.locator('[data-editor-presentation="live"]'),source=app.locator('[data-editor-presentation="source"]');
  const preview=app.locator('.editor-preview-pane'),restore=app.locator('#restoreLivePreviewButton'),close=app.locator('#hideLivePreviewButton');
  const read=()=>editor.evaluate(async el=>{const {EditorView}=await import('/node_modules/@codemirror/view/dist/index.js');const s=EditorView.findFromDOM(el).state;return {doc:s.doc.toString(),selection:s.selection.toJSON()};});
  const same=async expected=>assert.deepEqual(await read(),expected,'mode/layout must preserve document and selection');
  for(const theme of ['light','dark']) {
    if(theme==='dark')await app.locator('#colorModeButton').click();
    for(const layout of ['editor-left','preview-left']) {
      await source.click();
      if(await app.locator('body').getAttribute('data-editor-layout')!==layout)await app.locator('#swapEditorLayoutButton').click();
      await content.fill('# Heading\n\nBody');await content.press('Control+End');await page.keyboard.insertText('!');
      const before=await read();
      await live.click();assert.equal(await preview.isVisible(),false);await same(before);
      await restore.click();assert.equal(await preview.isVisible(),true);await same(before);
      assert.equal(await live.getAttribute('aria-pressed'),'true');
      assert.equal(await app.locator('body').getAttribute('data-editor-layout'),layout);
      await app.locator('#editorPreviewContent').getByText('Body!',{exact:true}).waitFor();
      await close.click();await same(before);
      await source.click();assert.equal(await preview.isVisible(),true);await same(before);
      await close.click();assert.equal(await source.getAttribute('aria-pressed'),'true');
      await content.press('Control+End');
      await app.locator('body').evaluate(()=>{
        window.modePreviewMutations=0;
        window.modePreviewObserver?.disconnect();
        window.modePreviewObserver=new MutationObserver(items=>window.modePreviewMutations+=items.length);
        window.modePreviewObserver.observe(document.querySelector('#editorPreviewContent'),{subtree:true,childList:true,characterData:true});
      });
      await page.keyboard.insertText('LATEST');await page.waitForTimeout(350);
      assert.equal(await preview.isVisible(),false,'typing must not reopen manually closed source preview');
      assert.equal(await app.locator('body').evaluate(()=>window.modePreviewMutations),0,'hidden preview remains suspended');
      await app.locator('body').evaluate(()=>window.modePreviewObserver.disconnect());
      const typed=await read();assert.equal(typed.doc,before.doc+'LATEST');
      await source.click();assert.equal(await preview.isVisible(),true);await same(typed);
      await app.locator('#editorPreviewContent').getByText('Body!LATEST',{exact:true}).waitFor();
      await page.keyboard.press('Control+z');assert.equal((await read()).doc,before.doc,'mode actions must not reset undo');
      await page.keyboard.press('Control+Shift+KeyZ');assert.equal((await read()).doc,typed.doc);
      await live.click();await restore.click();
      await content.press('Control+End');await page.keyboard.insertText('LIVE');
      await app.locator('#editorPreviewContent').getByText('Body!LATESTLIVE',{exact:true}).waitFor();
      assert.equal(await preview.isVisible(),true,'typing must not close manually restored live preview');
      assert.equal(await live.getAttribute('aria-pressed'),'true');
      const expected=await read();
      await app.locator('#exitEditButton').click();await app.locator('#editButton').click();
      assert.equal(await preview.isVisible(),true,'reenter preserves manual override');
      assert.equal((await read()).doc,expected.doc);
      await source.click();await close.click();
      await app.locator('#exitEditButton').click();await app.locator('#editButton').click();
      assert.equal(await preview.isVisible(),false,'source preview stays manually closed on reenter');
      assert.equal(await source.getAttribute('aria-pressed'),'true');
      await source.click();assert.equal(await preview.isVisible(),true);
      if(process.env.AUDIT_OUTPUT)await page.screenshot({path:`${process.env.AUDIT_OUTPUT}/mode-preview-${theme}-${layout}.png`});
      console.log(`PASS ${theme}/${layout}: automatic visibility, independent overrides, selection, fresh preview, undo/redo, reenter`);
    }
  }
  assert.deepEqual(errors,[]);
}finally{await browser?.close();await server.close();}
