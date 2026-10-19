import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import {createServer} from 'vite';
const {chromium}=createRequire(import.meta.url)(process.env.PLAYWRIGHT_MODULE||'playwright');
const server=await createServer({root:fileURLToPath(new URL('..',import.meta.url)),server:{host:'127.0.0.1',port:0,watch:null,hmr:false},logLevel:'error'});
let browser;
try {
  await server.listen();
  browser=await chromium.launch({headless:true,executablePath:process.env.BROWSER_EXECUTABLE||undefined});
  const page=await browser.newPage({viewport:{width:1450,height:850}}),errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  await page.route('**/*',r=>new URL(r.request().url()).hostname==='127.0.0.1'?r.continue():r.abort());
  await page.goto(server.resolvedUrls.local[0]+'tests/fixtures/app-drag-audit.html');
  const app=page.frameLocator('iframe');
  await app.locator('body').evaluate(async()=>{await import('/src/main.js');});
  await app.locator('#newFileButton').click();
  const live=app.locator('[data-editor-presentation="live"]'),source=app.locator('[data-editor-presentation="source"]');
  const control=app.locator('.editor-presentation-switch');
  await source.click();
  await app.locator('#markdownEditor > .cm-editor > .cm-scroller > .cm-content').fill('# Heading\n\nSample text');
  await live.click();
  const read=()=>app.locator('#markdownEditor > .cm-editor').evaluate(async el=>{const {EditorView}=await import('/node_modules/@codemirror/view/dist/index.js');return EditorView.findFromDOM(el).state.doc.toString();});
  for(const theme of ['light','dark']) {
    if(theme==='dark')await app.locator('#colorModeButton').click();
    for(const language of ['zh-CN','en']) {
      await app.locator('#moreButton').click();await app.locator('[data-settings-submenu="language"]').click();await app.locator(`[data-language="${language}"]`).click();
      for(const width of [980,1450,1920]) {
        await page.setViewportSize({width,height:850});
        for(const layout of ['preview-left','editor-left','editor-only']) {
          if(layout==='editor-left')await app.locator('#swapEditorLayoutButton').click();
          if(layout==='editor-only')await app.locator('#hideLivePreviewButton').click();
          const label=`${theme}-${language}-${width}-${layout}`;
          await page.waitForTimeout(100);
          const before=await control.boundingBox(),status=await app.locator('.editor-status').boundingBox(),bar=await app.locator('#editorFormatBar').boundingBox();
          assert.ok(before.y>=status.y+status.height,label+' below status');
          assert.ok(before.y+before.height<=bar.y,label+' above toolbar');
          assert.ok(Math.abs(before.x+before.width-status.x-status.width)<2,label+' aligned right');
          const l=await live.boundingBox(),s=await source.boundingBox();
          assert.ok(Math.abs(l.width-s.width)<1,label+' equal segments');
          await source.click();assert.equal(await source.getAttribute('aria-pressed'),'true');
          await page.waitForTimeout(200);
          assert.deepEqual(await control.boundingBox(),before,label+' stable size');
          assert.match(await control.evaluate(el=>getComputedStyle(el,'::before').transform),/^matrix\(1, 0, 0, 1, [1-9]/);
          await source.focus();await page.keyboard.press('ArrowLeft');
          assert.equal(await live.getAttribute('aria-pressed'),'true');
          assert.equal(await live.evaluate(el=>el===document.activeElement),true);
          await page.keyboard.press('ArrowRight');assert.equal(await source.getAttribute('aria-pressed'),'true');
          await page.keyboard.press('Home');assert.equal(await live.getAttribute('aria-pressed'),'true');
          await page.keyboard.press('End');assert.equal(await source.getAttribute('aria-pressed'),'true');
          await live.click();assert.equal(await read(),'# Heading\n\nSample text');
          if(process.env.AUDIT_OUTPUT&&width===1450&&layout==='editor-left'&&language==='zh-CN'){
            await page.waitForTimeout(200);
            await page.screenshot({path:`${process.env.AUDIT_OUTPUT}/switch-${theme}.png`});
            await app.locator('.editor-header-actions').screenshot({path:`${process.env.AUDIT_OUTPUT}/switch-detail-${theme}.png`});
          }
          console.log('PASS '+label);
        }
        await app.locator('#restoreLivePreviewButton').click();await app.locator('#swapEditorLayoutButton').click();
      }
    }
  }
  await page.emulateMedia({reducedMotion:'reduce'});
  assert.equal(await control.evaluate(el=>getComputedStyle(el,'::before').transitionDuration),'0s');
  assert.deepEqual(errors,[]);
} finally {await browser?.close();await server.close();}
