// Real mode buttons and editor; synthetic DOM composition, not native IME proof.
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';

const pw = createRequire(import.meta.url)(process.env.PLAYWRIGHT_MODULE || 'playwright');
const engine = process.env.EDITOR_PRESENTATION_BROWSER || 'chromium';
const server = await createServer({
  root: fileURLToPath(new URL('..', import.meta.url)),
  server: { host: '127.0.0.1', port: 0, watch: null, hmr: false },
  logLevel: 'error'
});
let browser;
try {
  await server.listen();
  browser = await pw[engine].launch({
    headless: true,
    ...(engine === 'chromium' && process.env.BROWSER_EXECUTABLE ? { executablePath: process.env.BROWSER_EXECUTABLE } : {})
  });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.route('**/*', route => new URL(route.request().url()).hostname === '127.0.0.1' ? route.continue() : route.abort());
  await page.addInitScript(() => {
    // Exercise CodeMirror's contenteditable composition path consistently.
    window.EditContext = undefined;
    localStorage.setItem('editorPresentation', 'source');
    localStorage.setItem('editorLayout', 'editor-left');
  });
  await page.goto(server.resolvedUrls.local[0]);
  await page.waitForFunction(() => window.quilliteMarkdown && document.querySelector('#fileList')?.childElementCount);
  const source = [
    '<!-- quillite-table-widths: 220, 220, 220, 220 -->',
    '| 第 1 列 | 第 2 列 | 第 3 列 | 第 4 列 |',
    '| :--- | :--- | :--- | :--- |',
    '| 保留 | 单独 | 修改 | |',
    '| | | | |',
    '| 最后 | | | |',
    ''
  ].join('\n');
  await page.evaluate(content => Object.assign(window.quilliteMarkdown, {
    openFile: async () => ({ path: '/small-table.md', name: 'small-table.md', directory: '/', content, revision: 'a'.repeat(64) }),
    canEditFile: async () => true,
    reportErrorLog: async () => {}
  }), source);
  await page.locator('#openFileButton').click();
  await page.locator('#editButton').click();

  const editor = page.locator('#markdownEditor > .cm-editor');
  const content = editor.locator('> .cm-scroller > .cm-content');
  const table = editor.locator('table');
  const liveButton = page.locator('[data-editor-presentation="live"]');
  const sourceButton = page.locator('[data-editor-presentation="source"]');
  const readSource = () => editor.evaluate(async dom => {
    const { EditorView } = await import('/node_modules/@codemirror/view/dist/index.js');
    return EditorView.findFromDOM(dom).state.doc.toString();
  });

  assert.equal(await sourceButton.getAttribute('aria-pressed'), 'true');
  assert.equal(await readSource(), source);
  await liveButton.click();
  assert.equal(await liveButton.getAttribute('aria-pressed'), 'true');
  await table.waitFor();
  assert.equal(await table.locator('th, td').count(), 16);
  assert.equal(await readSource(), source);
  await sourceButton.click();
  assert.equal(await sourceButton.getAttribute('aria-pressed'), 'true');
  assert.equal(await table.count(), 0);
  assert.equal(await readSource(), source);

  await content.focus();
  await content.dispatchEvent('compositionstart');
  await liveButton.click();
  assert.equal(await liveButton.getAttribute('aria-pressed'), 'false', 'do not switch during active composition');
  assert.equal(await sourceButton.getAttribute('aria-pressed'), 'true');
  assert.equal(await table.count(), 0);
  await content.dispatchEvent('compositionend');
  await page.locator('[data-editor-presentation="live"][aria-pressed="true"]').waitFor({ timeout: 5000 });
  await table.waitFor();
  assert.equal(await table.locator('th, td').count(), 16);
  assert.equal(await readSource(), source, 'mode switches must preserve exact Markdown');
  assert.deepEqual(errors, []);
  console.log(`PASS ${engine}: small table switches on click; composition defers the switch without losing it or changing source`);
} finally {
  await browser?.close();
  server.httpServer.closeAllConnections?.();
  await server.close();
}
