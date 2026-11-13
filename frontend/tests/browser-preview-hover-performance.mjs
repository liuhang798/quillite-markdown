// Isolated local Chromium/WebKit fixture; no real documents or clipboard.
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';

const pw = createRequire(import.meta.url)(process.env.PLAYWRIGHT_MODULE || 'playwright');
const engine = process.env.PREVIEW_HOVER_BROWSER || 'chromium';
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
  const page = await browser.newPage({ viewport: { width: 1440, height: 950 } });
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.route('**/*', route => new URL(route.request().url()).hostname === '127.0.0.1' ? route.continue() : route.abort());
  await page.addInitScript(() => {
    localStorage.setItem('editorPresentation', 'source');
    localStorage.setItem('editorLayout', 'editor-left');
    localStorage.setItem('language', 'en');
  });
  await page.goto(server.resolvedUrls.local[0]);
  await page.waitForFunction(() => window.quilliteMarkdown && document.querySelector('#fileList')?.childElementCount);
  const source = Array.from({ length: 1000 }, (_, i) => `Paragraph ${i + 1}. **bold** _italic_ \`code\``).join('\n\n');
  await page.evaluate(content => Object.assign(window.quilliteMarkdown, {
    openFile: async () => ({ path: '/probe.md', directory: '/', name: 'probe.md', content, revision: 'a'.repeat(64) }),
    canEditFile: async () => true,
    reportErrorLog: async () => {}
  }), source);
  await page.locator('#openFileButton').click();
  await page.locator('#editButton').click();
  await page.waitForFunction(() => document.querySelectorAll('#editorPreviewContent [data-line]').length > 1000);
  const result = await page.evaluate(async () => {
    const preview = document.querySelector('#editorPreviewContent'), hint = document.querySelector('#previewLocateHint');
    const scroll = preview.closest('.editor-preview-scroll');
    const frame = () => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    // Drain initial editor-entry scroll alignment before counting hover work.
    await frame(); await frame();
    const hit = (target, type = 'pointermove') => target.dispatchEvent(new PointerEvent(type, { bubbles: true, clientX: 500, clientY: 300 }));
    let measurements = 0;
    const original = Element.prototype.getClientRects;
    Element.prototype.getClientRects = function () {
      if (this.hasAttribute('data-line') && preview.contains(this)) measurements++;
      return original.call(this);
    };
    try {
      for (let i = 0; i < 12; i++) hit(preview);
      await frame();
      const margin = { measurements, hidden: hint.classList.contains('hidden') };
      const paragraphs = [...preview.querySelectorAll('p[data-line]')];
      const paragraph = paragraphs[1];
      measurements = 0;
      for (let i = 0; i < 12; i++) hit(paragraphs[i % 2]);
      const beforeFrame = measurements;
      await frame();
      const content = { beforeFrame, measurements, label: hint.textContent };
      hit(paragraph);
      scroll.dispatchEvent(new Event('pointerleave'));
      await frame();
      const afterLeave = hint.classList.contains('hidden');
      return { margin, content, afterLeave };
    } finally {
      Element.prototype.getClientRects = original;
    }
  });
  assert.deepEqual(result.margin, { measurements: 0, hidden: true });
  assert.equal(result.content.beforeFrame, 0, 'pointer events themselves must not force layout');
  assert.ok(result.content.measurements > 0 && result.content.measurements <= 8, JSON.stringify(result.content));
  assert.match(result.content.label, /Line 3/);
  assert.equal(result.afterLeave, true, 'pointerleave cancels pending updates');
  await page.locator('#editorPreviewContent p[data-line="3"] span[data-line]').first().click({ button: 'right' });
  assert.match(await page.locator('#editorPosition').innerText(), /Line 3/);
  assert.deepEqual(errors, []);
  console.log(`PASS ${engine}: 12 margin events -> 0 anchor measurements, 12 paragraph events -> ${result.content.measurements}, right-click stays mapped`);
} finally {
  await browser?.close();
  server.httpServer.closeAllConnections?.();
  await server.close();
}
