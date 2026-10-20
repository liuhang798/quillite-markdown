import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import {createServer} from 'vite';
const {chromium} = createRequire(import.meta.url)(process.env.PLAYWRIGHT_MODULE || 'playwright');
const server = await createServer({
  root: fileURLToPath(new URL('..', import.meta.url)),
  server: {host: '127.0.0.1', port: 0, watch: null, hmr: false}, logLevel: 'error',
  plugins: [{name: 'reading-position-test', enforce: 'pre', transform(code, id) {
    if (id.replaceAll('\\', '/').endsWith('/src/renderer.js'))
      return code + '\nwindow.positionAudit={open:displayDocument,toggle:toggleEditor,presentation:setEditorPresentation,state,heading:scrollReaderToHeading,editor:()=>codeEditor};';
  }}]
});
let browser;
try {
  await server.listen();
  browser = await chromium.launch({headless: true, executablePath: process.env.BROWSER_EXECUTABLE || undefined});
  const page = await browser.newPage({viewport: {width: 1450, height: 900}});
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.route('**/*', route => new URL(route.request().url()).hostname === '127.0.0.1' ? route.continue() : route.abort());
  await page.goto(server.resolvedUrls.local[0] + 'tests/fixtures/app-drag-audit.html');
  const frame = page.frames().find(frame => frame !== page.mainFrame());
  await frame.evaluate(async () => {
    await import('/src/main.js');
    window.quilliteMarkdown.canEditFile = async () => true;
    window.quilliteMarkdown.reportErrorLog = async () => {};
    positionAudit.open({path: 'position.md', name: 'position.md', directory: '.', content:
      Array.from({length: 200}, (_, i) => `## Section ${i}\n\nParagraph ${i}. Reading position content.\n\n`).join('')});
  });
  await page.waitForTimeout(400);
  console.log(await frame.evaluate(() => {const r=document.querySelector('.reader-pane');return {height:r.clientHeight,scrollHeight:r.scrollHeight,body:document.body.scrollHeight};}));
  const read = () => frame.evaluate(() => {
    const r = document.querySelector('.reader-pane');
    const h = [...document.querySelectorAll('#markdownContent h2')].find(e => e.textContent === 'Section 80');
    return {scroll: r.scrollTop, offset: h?.getBoundingClientRect().top - r.getBoundingClientRect().top};
  });
  await frame.evaluate(() => positionAudit.heading([...document.querySelectorAll('#markdownContent h2')].find(e => e.textContent === 'Section 80'), 'instant'));
  const before = await read();
  assert.ok(before.scroll > 2000, JSON.stringify(before));
  for (let i = 0; i < 3; i++) {
    await frame.evaluate(() => positionAudit.toggle(true));
    await frame.evaluate(mode => positionAudit.presentation(mode), i === 1 ? 'source' : 'live');
    if (i === 1) await frame.evaluate(() => positionAudit.editor().dispatch({changes: {from: 0, insert: '# Inserted heading\n\nNew introduction.\n\n'}}));
    await frame.evaluate(() => positionAudit.toggle(false));
    await page.waitForTimeout(250);
    assert.ok(Math.abs((await read()).offset - before.offset) < 3, `cycle ${i}: ${JSON.stringify(await read())}`);
  }
  // Late images/charts above the anchor change height after return.
  await frame.evaluate(() => {
    const box = document.createElement('div'); box.style.height = '300px';
    document.querySelector('#markdownContent').prepend(box);
  });
  await page.waitForTimeout(200);
  // Replacing the first child intentionally invalidates stale work; use a
  // height change within the existing first block for the actual load test.
  await frame.evaluate(() => positionAudit.toggle(true));
  await frame.evaluate(() => positionAudit.toggle(false));
  await page.waitForTimeout(100);
  const stable = await read();
  await frame.evaluate(() => document.querySelector('#markdownContent').firstElementChild.style.paddingBottom = '320px');
  await page.waitForTimeout(200);
  assert.ok(Math.abs((await read()).offset - stable.offset) < 3, 'late resource layout preserves anchor');
  await frame.evaluate(() => {
    const r = document.querySelector('.reader-pane');
    r.dispatchEvent(new WheelEvent('wheel', {bubbles: true, deltaY: 300}));
    r.scrollTo({top: 500, behavior: 'instant'});
    document.querySelector('#markdownContent').firstElementChild.style.paddingBottom = '450px';
  });
  await page.waitForTimeout(200);
  assert.ok((await read()).scroll < 1000, 'user navigation cancels restoration');
  await frame.evaluate(() => positionAudit.open({path:'other.md',name:'other.md',directory:'.',content:'# Other\n\nShort document.'}));
  await page.waitForTimeout(100);
  assert.equal((await read()).scroll, 0, 'new documents still start at top');
  assert.deepEqual(errors, []);
  console.log('PASS reading position: repeated switches, preceding edits, late layout, user cancellation, document isolation');
} finally { await browser?.close(); await server.close(); }
