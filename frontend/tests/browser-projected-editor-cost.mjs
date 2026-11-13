// Browser regression: unchanged cells must not serialize the root document
// or write table layout attributes while another cell is being edited.
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';

const pw = createRequire(import.meta.url)(process.env.PLAYWRIGHT_MODULE || 'playwright');
const engine = process.env.PROJECTION_BROWSER || 'chromium';
const row = cells => '| ' + cells.join(' | ') + ' |';
const source = [
  '<!-- quillite-table-widths: 120, 120, 120, 120, 120, 120, 120, 120 -->',
  row(Array.from({ length: 8 }, (_, i) => 'Title ' + (i + 1))),
  row(Array.from({ length: 8 }, (_, i) => i % 2 ? ':---:' : '---:')),
  ...Array.from({ length: 11 }, (_, i) => row(Array.from({ length: 8 }, (_, j) => `Cell ${i + 1}.${j + 1}`))),
  '', 'Paragraph after the table.', '',
  ...Array.from({ length: 340 }, (_, i) => `Paragraph ${i + 1} ` + 'synthetic fixture '.repeat(17) + '\n')
].join('\n');
const server = await createServer({
  root: fileURLToPath(new URL('..', import.meta.url)),
  server: { host: '127.0.0.1', port: Number(process.env.PROJECTION_PORT) || 41764, strictPort: true, watch: null, hmr: false },
  logLevel: 'error',
  plugins: [{
    name: 'projection-perf-test-only', enforce: 'pre',
    transform(code, id) {
      if (!id.replaceAll('\\', '/').endsWith('/src/renderer.js')) return;
      return code + `
window.projectedPerf = {
  source: () => codeEditor.state.doc.toString(),
  capture: async () => {
    const { Text } = await import('@codemirror/state');
    const table = document.querySelector('#markdownEditor .cm-live-table table');
    const mutations = [];
    const observer = new MutationObserver(records => mutations.push(...records));
    observer.observe(table,{subtree:true,childList:true,attributes:true,attributeFilter:['align','style']});
    let serializations = 0;
    const original = Text.prototype.toString;
    Text.prototype.toString = function(...args) {
      if (this.length > 90000) serializations++;
      return original.apply(this,args);
    };
    const started = performance.now();
    return () => {
      const elapsed = performance.now() - started;
      mutations.push(...observer.takeRecords());
      observer.disconnect();
      Text.prototype.toString = original;
      return { serializations, elapsed,
        alignWrites:mutations.filter(record=>record.attributeName==='align').length,
        widthGroupWrites:mutations.filter(record=>record.type==='childList' && record.target===table &&
          [...record.addedNodes,...record.removedNodes].some(node=>node.nodeName==='COLGROUP')).length };
    };
  },
};`;
    },
  }],
});
let browser;
try {
  await server.listen();
  browser = await pw[engine].launch({ headless: true,
    ...(engine === 'chromium' && process.env.BROWSER_EXECUTABLE ? { executablePath: process.env.BROWSER_EXECUTABLE } : {}) });
  const page = await browser.newPage({ viewport: { width: 1450, height: 1050 } });
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.route('**/*', route => new URL(route.request().url()).hostname === '127.0.0.1' ? route.continue() : route.abort());
  await page.addInitScript(() => {
    localStorage.setItem('language', 'en');
    localStorage.setItem('editorPresentation', 'live');
    localStorage.setItem('editorLayout', 'editor-only');
  });
  await page.goto(server.resolvedUrls.local[0]);
  await page.waitForFunction(() => window.projectedPerf && window.quilliteMarkdown && document.querySelector('#fileList')?.childElementCount);
  await page.evaluate(content => Object.assign(window.quilliteMarkdown, {
    openFile: async () => ({ path:'/isolated/projection-perf.md', directory:'/isolated', name:'projection-perf.md', content, revision:'a'.repeat(64) }),
    canEditFile: async () => true,
    reportErrorLog: async () => {},
  }), source);
  await page.locator('#openFileButton').click();
  await page.locator('#markdownContent table').waitFor();
  await page.locator('#editButton').click();
  const table = page.locator('#markdownEditor .cm-live-table');
  const cell = table.locator('tbody tr').first().locator('td').first().locator('.cm-content');
  await cell.click();
  await page.keyboard.press('End');
  await page.evaluate(async () => { window.finishProjectionPerf = await projectedPerf.capture(); });
  await page.keyboard.insertText('X');
  const expected = source.replace('Cell 1.1 |', 'Cell 1.1X |');
  await page.waitForFunction(expected => projectedPerf.source() === expected, expected);
  const metrics = await page.evaluate(() => finishProjectionPerf());
  console.log(`${engine} single-cell edit ${JSON.stringify(metrics)}`);
  assert.equal(await table.locator('.cm-editor').count(), 96, 'bounded tables retain direct cell editing');
  assert.ok(metrics.serializations < 40, 'do not flatten the root Markdown once per cell');
  assert.equal(metrics.alignWrites, 0, 'unchanged alignment is not reapplied on each key');
  assert.equal(metrics.widthGroupWrites, 0, 'keep the existing width group');
  await page.keyboard.press(process.platform === 'darwin' ? 'Meta+z' : 'Control+z');
  await page.waitForFunction(expected => projectedPerf.source() === expected, source);
  assert.deepEqual(errors, []);
} finally {
  await browser?.close();
  server.httpServer.closeAllConnections?.();
  await new Promise(resolve => server.httpServer.close(resolve));
}
