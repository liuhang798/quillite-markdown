// Actual renderer/editor with isolated bridge fixtures. Every nonlocal request
// is aborted and counted: tests must never contact document-controlled servers.
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import {createServer} from 'vite';
const playwright = createRequire(import.meta.url)(process.env.PLAYWRIGHT_MODULE || 'playwright');
const engine = process.env.AUDIT_BROWSER || 'chromium';
const server = await createServer({root: fileURLToPath(new URL('..', import.meta.url)),
  server: {host:'127.0.0.1', port:Number(process.env.AUDIT_PORT) || 41748, watch:null, hmr:false}, logLevel:'error',
  plugins:[{name:'save-outline-audit-only', enforce:'pre', transform(code,id) {
    if (!id.replaceAll('\\','/').endsWith('/src/renderer.js')) return;
    return code + '\nwindow.saveOutlineAudit={state,headings:currentEditorHeadings,renderToc,allow:loadImportedNetworkImages,'
      + 'replace:text=>codeEditor.dispatch({changes:{from:0,to:codeEditor.state.doc.length,insert:text},selection:{anchor:0}})};';
  }}]});
let browser;
try {
  await server.listen();
  browser = await playwright[engine].launch({headless:true,...(engine==='chromium' && process.env.BROWSER_EXECUTABLE ? {executablePath:process.env.BROWSER_EXECUTABLE} : {})});
  for (const name of ['blocked-outline-source','blocked-outline-live','txt-save-format','ordinary-save-cancel']) {
    const page = await browser.newPage({viewport:{width:980,height:760}}), remote=[], errors=[], confirmations=[];
    let acceptConsent = false;
    page.on('pageerror', error => errors.push(error.message));
    page.on('dialog', dialog => { confirmations.push(dialog.message()); return acceptConsent ? dialog.accept() : dialog.dismiss(); });
    await page.route('**/*', route => {
      if (new URL(route.request().url()).hostname === '127.0.0.1') return route.continue();
      remote.push(route.request().url()); return route.abort();
    });
    await page.addInitScript(mode => {
      localStorage.setItem('language','zh-CN'); localStorage.setItem('editorPresentation',mode);
      localStorage.setItem('editorLayout','editor-only');
    }, name.endsWith('live') ? 'live' : 'source');
    await page.goto(server.resolvedUrls.local[0]);
    await page.waitForFunction(() => window.saveOutlineAudit && window.quilliteMarkdown && document.querySelector('#fileList')?.childElementCount);
    await page.evaluate(name => {
      const network = '# <img src="https://blocked.invalid/eager.png" loading="eager"> **Heading** $x^2$\n\n[TOC]\n\n'
        + '## [Linked](https://blocked.invalid/not-navigation) <picture><source srcset="https://blocked.invalid/candidate.png 2x"><img src="https://blocked.invalid/second.png" loading="eager"></picture>\n\n'
        + '### <svg><image href="https://blocked.invalid/vector.png" /></svg> $\\frac{a}{b}$\n\nBody';
      const packaged = name.startsWith('blocked');
      const txt = name === 'txt-save-format';
      const path = packaged ? '/origin/safe.textpack' : txt ? '/same/notes.txt' : '/same/notes.md';
      const content = packaged ? network : '# Literal\n\n![missing](assets/not-read.png)\n<img srcset="not-read.png 2x">';
      window.saveOutlineFixture = {path, content, copies:[]};
      Object.assign(window.quilliteMarkdown, {
        openFile:async () => ({path,name:path.split('/').pop(),directory:packaged?'/owned/session':'/same',content,revision:'a'.repeat(64),
          ...(packaged ? {bundleKind:'textpack',bundleSessionId:'session-a',resourcePath:'/owned/session/text.md',packageDirectory:'/origin'} : {})}),
        canEditFile:async () => true, reportErrorLog:async () => {}, readImageData:async () => {throw Error('unexpected local read');},
        saveDocumentAsFormat:async (...args) => { saveOutlineFixture.copies.push(args); return null; }
      });
    }, name);
    await page.locator('#openFileButton').click();
    await page.waitForFunction(() => Boolean(saveOutlineAudit.state.currentFile));
    await page.waitForTimeout(200);
    assert.deepEqual(remote,[], 'reading packages or literal TXT must not activate heading resources');
    await page.locator('#editButton').click();
    await page.locator('#markdownEditor > .cm-editor').waitFor();
    if (name.startsWith('blocked')) {
      await page.evaluate(() => saveOutlineAudit.renderToc());
      await page.waitForTimeout(250);
      assert.equal(await page.evaluate(() => saveOutlineAudit.state.blockImportedRemoteImages),true);
      assert.deepEqual(remote,[], 'editor outline/live TOC must not activate resources before consent');
      const headings = await page.evaluate(() => saveOutlineAudit.headings().map(h => ({title:h.tocTitle.text,math:h.tocTitle.hasMath})));
      assert.equal(headings.length,3);
      assert.equal(headings[0].title.trim(),'Heading x^2'); assert.equal(headings[0].math,true);
      assert.equal(headings[2].math,true);
      if (name.endsWith('live')) {
        const toc = page.locator('.cm-live-toc'); await toc.waitFor();
        assert.equal(await toc.locator('.katex').count(),2,'live TOC retains one rendering per formula');
        assert.equal(await toc.locator('img, svg image, a').count(),0,'TOC copies semantic text/math, never active document markup');
      }
      // Cancellation keeps the exact same guard, and opening/editing again is
      // not consent. Explicit acceptance is the only path to remote attempts.
      await page.evaluate(() => saveOutlineAudit.allow());
      await page.waitForTimeout(100);
      assert.equal(confirmations.length,1); assert.deepEqual(remote,[]);
      assert.equal(await page.evaluate(() => saveOutlineAudit.state.blockImportedRemoteImages),true);
      acceptConsent = true;
      await page.evaluate(() => saveOutlineAudit.allow());
      await page.waitForFunction(() => !saveOutlineAudit.state.blockImportedRemoteImages);
      await page.waitForTimeout(250);
      assert.ok(remote.some(url => url.includes('/eager.png')), 'explicit acceptance activates real image requests (still intercepted by this test)');
    } else {
      await page.evaluate(() => saveOutlineAudit.replace(saveOutlineFixture.content + '\nUNSAVED'));
      await page.locator('#saveAsButton').click();
      const dialog = page.locator('#documentSaveFormatDialog'); await dialog.waitFor({state:'visible'});
      const selected = page.locator('#documentSaveFormats [aria-checked="true"]');
      assert.equal(await selected.getAttribute('data-save-format'),name==='txt-save-format'?'text':'markdown');
      assert.equal(await page.locator('[data-save-format="text"]').isVisible(),name==='txt-save-format');
      // Arrow navigation must never land on the hidden TXT option in package/MD.
      await page.keyboard.press('ArrowLeft');
      assert.equal(await selected.getAttribute('data-save-format'),'textpack');
      await page.keyboard.press('Escape');
      await page.waitForFunction(() => !saveOutlineAudit.state.saving);
      await page.waitForFunction(() => document.activeElement.id === 'saveAsButton');
      assert.equal(await page.evaluate(() => saveOutlineFixture.copies.length),0);
      assert.equal(await page.evaluate(() => saveOutlineAudit.state.dirty),true);
      assert.equal(await page.evaluate(() => saveOutlineAudit.state.currentFile.path),name==='txt-save-format'?'/same/notes.txt':'/same/notes.md');
      if (name==='txt-save-format') {
        await page.locator('#saveAsButton').click(); await dialog.waitFor({state:'visible'});
        await page.locator('#confirmDocumentSaveFormat').click();
        await page.waitForFunction(() => !saveOutlineAudit.state.saving);
        const [copy] = await page.evaluate(() => saveOutlineFixture.copies);
        assert.equal(copy[3],'text'); assert.match(copy[1],/not-read\.png/);
        assert.equal(await page.evaluate(() => saveOutlineAudit.state.dirty),true,'cancelled native chooser retains edits');
      }
    }
    assert.deepEqual(errors,[],name + ' browser errors');
    console.log(engine + ' PASS ' + name);
    await page.close();
  }
} finally { await browser?.close(); await server.close(); }
