// Run after npm run build. Uses isolated bridge fixtures, never native printing
// or user documents. ISSUE15_OUTPUT_DIR optionally writes real Chromium PDFs.
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import {mkdir} from 'node:fs/promises';
import {join} from 'node:path';
import {preview} from 'vite';
const playwright = createRequire(import.meta.url)(process.env.PLAYWRIGHT_MODULE || 'playwright');
const engine = process.env.ISSUE15_BROWSER || 'chromium';
const output = process.env.ISSUE15_OUTPUT_DIR;
const server = await preview({root:fileURLToPath(new URL('..', import.meta.url)), preview:{host:'127.0.0.1',port:0}, logLevel:'error'});
let browser;
try {
  if (output) await mkdir(output, {recursive:true});
  browser = await playwright[engine].launch({headless:true, ...(engine === 'chromium' && process.env.BROWSER_EXECUTABLE ? {executablePath:process.env.BROWSER_EXECUTABLE} : {})});
  const page = await browser.newPage({viewport:{width:1440,height:920}});
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.route('**/*', route => new URL(route.request().url()).hostname === '127.0.0.1' ? route.continue() : route.abort());
  await page.addInitScript(() => localStorage.setItem('language', 'zh-CN'));
  await page.goto(server.resolvedUrls.local[0]);
  await page.waitForFunction(() => window.quilliteMarkdown && document.querySelector('#fileList')?.childElementCount);
  const content = '# PDF_EXPORT_BODY_SENTINEL\n\n导出正文校验：这段文字应出现在 PDF 中，不应被导出设置遮挡。\n\n'
    + '<dialog open style="position:static;margin:12px 0">PDF_DOCUMENT_DIALOG_SENTINEL</dialog>\n\n'
    + '<dialog>PDF_CLOSED_DIALOG_SENTINEL</dialog>\n\n'
    + '| 编号 | 内容 |\n| --- | --- |\n'
    + Array.from({length:80}, (_,i) => `| ${i+1} | PDF_TABLE_ROW_${String(i+1).padStart(3,'0')} |`).join('\n')
    + '\n\nPDF_EXPORT_END_SENTINEL\n';
  await page.evaluate(content => {
    window.pdfAudit = {error:'PDF_ENGINE_NOT_FOUND', printCalls:0, nativeCalls:0, html:'', resolvePrint:null};
    Object.assign(window.quilliteMarkdown, {
      openFile:async()=>({path:'/issue15.md',name:'issue15.md',directory:'/',content,revision:'a'.repeat(64)}),
      exportPDF:async(_path,_title,html)=>{pdfAudit.nativeCalls++;pdfAudit.html=html;if(pdfAudit.error)throw Error(pdfAudit.error);return pdfAudit.result;},
      print:()=>{pdfAudit.printCalls++;return new Promise(resolve=>pdfAudit.resolvePrint=resolve);},
      reportErrorLog:async()=>{},
    });
  }, content);
  await page.locator('#openFileButton').click();
  await page.locator('#markdownContent h1').waitFor();
  assert.equal(await page.locator('#markdownContent dialog[open]').isVisible(),true,'fixture HTML dialog must survive Markdown sanitization');
  assert.equal(await page.locator('#markdownContent dialog:not([open])').isVisible(),false);
  const openExport = async () => {
    await page.locator('#documentExportButton').click();
    await page.locator('#exportCenterDialog').waitFor({state:'visible'});
    await page.locator('[data-export-format="pdf"]').click();
  };
  const inspectPrint = async name => {
    await page.waitForFunction(() => !!pdfAudit.resolvePrint);
    await page.emulateMedia({media:'print'});
    // Capture before assertions: on regressions this preserves the incorrect
    // PDF while the export dialog is still open, not after finally closes it.
    if (output && engine === 'chromium') await page.pdf({path:join(output, name+'.pdf'),format:'A4',printBackground:true});
    if (output) await page.screenshot({path:join(output, name+'-'+engine+'.png'),fullPage:true});
    assert.equal(await page.locator('#exportCenterDialog').isVisible(), false, 'export settings must not appear on paper');
    assert.equal(await page.locator('.titlebar').isVisible(), false, 'application titlebar must not print');
    assert.equal(await page.locator('#markdownContent h1').isVisible(), true, 'document body must print');
    assert.equal(await page.locator('#markdownContent dialog[open]').isVisible(),true,'legitimate document HTML dialogs must print');
    assert.equal(await page.locator('#markdownContent dialog:not([open])').isVisible(),false,'closed document dialogs stay closed');
    await page.emulateMedia({media:'screen'});
  };
  for (const error of ['PDF_ENGINE_NOT_FOUND','PDF_EXPORT_TIMEOUT','PDF_EXPORT_FAILED']) {
    await page.evaluate(error=>pdfAudit.error=error,error);
    await openExport();
    await page.locator('#confirmExportCenter').click();
    await inspectPrint(error);
    assert.equal(await page.locator('#exportCenterDialog').isVisible(),true,'print CSS must not discard screen dialog state');
    assert.equal(await page.locator('[data-export-format="pdf"]').getAttribute('aria-checked'),'true');
    const html = await page.evaluate(()=>pdfAudit.html);
    assert.match(html,/PDF_EXPORT_BODY_SENTINEL/);
    assert.match(html,/PDF_EXPORT_END_SENTINEL/);
    assert.match(html,/PDF_DOCUMENT_DIALOG_SENTINEL/);
    assert.doesNotMatch(html,/exportCenterDialog|导出文档|confirmExportCenter/);
    await page.evaluate(()=>{pdfAudit.resolvePrint();pdfAudit.resolvePrint=null;});
    await page.locator('#exportCenterDialog').waitFor({state:'hidden'});
  }
  // Native export success and picker cancellation must never invoke fallback.
  const printCalls = await page.evaluate(()=>pdfAudit.printCalls);
  for (const result of ['/fixture-export.pdf','']) {
    await page.evaluate(result=>{pdfAudit.error=null;pdfAudit.result=result;},result);
    await openExport();await page.locator('#confirmExportCenter').click();
    await page.locator('#exportCenterDialog').waitFor({state:'hidden'});
    assert.equal(await page.evaluate(()=>pdfAudit.printCalls),printCalls);
  }
  // Ordinary printing still works; it must not rely on a PDF fallback flag.
  await page.locator('#printButton').click();
  await page.waitForFunction(() => !!pdfAudit.resolvePrint);
  await page.evaluate(()=>document.querySelector('#linkDialog').showModal());
  await inspectPrint('ordinary-print');
  await page.emulateMedia({media:'print'});
  assert.equal(await page.locator('#linkDialog').isVisible(),false,'native dialogs must not print');
  assert.equal(await page.locator('#linkDialog').evaluate(el=>getComputedStyle(el,'::backdrop').display),'none');
  await page.emulateMedia({media:'screen'});
  assert.equal(await page.locator('#linkDialog').isVisible(),true,'print media must not close native screen dialogs');
  await page.evaluate(()=>document.querySelector('#linkDialog').close());
  await page.evaluate(()=>{pdfAudit.resolvePrint();pdfAudit.resolvePrint=null;});
  assert.deepEqual(errors,[]);
  console.log(`PASS ${engine}: PDF fallback excludes app UI, preserves document HTML dialogs; all three engine failures, native success/cancel and ordinary printing retained`);
} finally {
  await browser?.close();
  await new Promise(resolve=>server.httpServer.close(resolve));
}
