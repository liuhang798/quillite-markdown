// Chromium GC regression: a deferred native read must not retain the already
// loaded image nodes from prior split renders. No real image files or IO.
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';

const { chromium } = createRequire(import.meta.url)(process.env.PLAYWRIGHT_MODULE || 'playwright');
const server = await createServer({
  root: process.env.SPLIT_IMAGE_FRONTEND_ROOT || fileURLToPath(new URL('..', import.meta.url)),
  server: { host: '127.0.0.1', port: 0, watch: null, hmr: false },
  logLevel: 'error'
});
const source = '![Ready](ready.png)\n\n![Held](held.png)\n\nTARGET\n\n' + 'Trailing paragraph.\n\n'.repeat(10);
let browser;
try {
  await server.listen();
  browser = await chromium.launch({ headless: true, executablePath: process.env.BROWSER_EXECUTABLE || undefined });
  const page = await browser.newPage({ viewport: { width: 1400, height: 1000 } });
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.route('**/*', route => new URL(route.request().url()).hostname === '127.0.0.1' ? route.continue() : route.abort());
  await page.addInitScript(() => {
    localStorage.setItem('editorPresentation', 'source');
    localStorage.setItem('editorLayout', 'editor-left');
    localStorage.setItem('spellcheckEnabled', 'false');
  });
  await page.goto(server.resolvedUrls.local[0]);
  await page.waitForFunction(() => window.quilliteMarkdown && document.querySelector('#fileList')?.childElementCount);
  await page.evaluate(content => {
    const canvas = document.createElement('canvas');
    canvas.width = 200; canvas.height = 500;
    const png = canvas.toDataURL();
    const fixture = window.splitReleaseFixture = { held: [], tracked: [] };
    fixture.release = () => { for (const resolve of fixture.held.splice(0)) resolve(png); };
    Object.assign(window.quilliteMarkdown, {
      openFile: async () => ({ path: '/release-fixture/split.md', name: 'split.md', directory: '/release-fixture', content, revision: 'a'.repeat(64) }),
      canEditFile: async () => true,
      reportErrorLog: async () => {},
      readImageData: async ref => ref === 'held.png' ? new Promise(resolve => fixture.held.push(resolve)) : png
    });
  }, source);
  await page.locator('#openFileButton').click();
  await page.locator('#editButton').click();
  const editor = page.locator('#markdownEditor > .cm-editor > .cm-scroller > .cm-content');
  const preview = page.locator('#editorPreviewContent');
  await editor.locator('> .cm-line').filter({ hasText: 'TARGET' }).click();
  await page.keyboard.press('End');

  const cdp = await page.context().newCDPSession(page);
  const inspect = () => page.evaluate(() => ({
    pending: splitReleaseFixture.held.length,
    detached: splitReleaseFixture.tracked.map(reference => {
      const img = reference.deref();
      if (!img) return null;
      return { connected: img.isConnected, decoded: img.naturalWidth > 0, data: img.src.startsWith('data:image/') };
    })
  }));
  const collect = async () => {
    // WeakRef.deref() keeps the target alive until its current JS job exits.
    // Collect in independent browser tasks after Playwright's checks finish.
    await page.evaluate(() => new Promise(resolve => setTimeout(resolve, 0)));
    for (let i = 0; i < 3; i++) {
      await cdp.send('HeapProfiler.collectGarbage');
      await page.evaluate(() => new Promise(resolve => setTimeout(resolve, 0)));
    }
    return inspect();
  };
  const history = [];
  let typed = '';
  for (const char of 'ABC') {
    await page.waitForFunction(() => document.querySelector('#editorPreviewContent img[alt=Ready]')?.naturalWidth === 200);
    const pendingBefore = await page.evaluate(() => {
      const fixture = splitReleaseFixture;
      fixture.tracked.push(new WeakRef(document.querySelector('#editorPreviewContent img[alt=Ready]')));
      return fixture.held.length;
    });
    typed += char;
    await page.keyboard.insertText(char);
    await preview.getByText('TARGET' + typed, { exact: true }).waitFor();
    await page.waitForFunction(pendingBefore => {
      const fixture = splitReleaseFixture;
      const current = document.querySelector('#editorPreviewContent img[alt=Ready]');
      return fixture.held.length > pendingBefore && current && current !== fixture.tracked.at(-1).deref();
    }, pendingBefore);
    history.push(await collect());
  }
  await page.evaluate(() => splitReleaseFixture.release());
  const settled = await collect();
  await cdp.detach();
  assert.deepEqual(settled.detached, [null, null, null], 'the weak references must be collectable after all reads finish');
  assert.ok(history.every((step, index) => step.pending >= index + 2), 'bridge promises remain unresolved during the test');
  assert.deepEqual(history.map(step => step.detached.filter(Boolean).length), [0, 0, 0],
    `each cancelled render must release detached decoded images while unrelated bridge reads are held: ${JSON.stringify(history)}`);
  assert.deepEqual(errors, []);
  console.log('PASS Chromium: zero retained decoded images after each of three preview replacements with bridge reads held');
} finally {
  await browser?.close();
  server.httpServer.closeAllConnections?.();
  await server.close();
}
