// An image row's layout can change while all its references stay the same.
// A pending reread must not inherit the old, wider slots' heights.
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';

const pw = createRequire(import.meta.url)(process.env.PLAYWRIGHT_MODULE || 'playwright');
const engine = process.env.SPLIT_IMAGE_BROWSER || 'webkit';
const server = await createServer({
  root: process.env.SPLIT_IMAGE_FRONTEND_ROOT || fileURLToPath(new URL('..', import.meta.url)),
  server: { host: '127.0.0.1', port: 0, watch: null, hmr: false },
  logLevel: 'error'
});
const image = '![Fixture image](assets/fixture.png)';
const row = `${image} ${image}`;
const source = [
  ...Array.from({ length: 4 }, (_, i) => `Prelude ${i}\n`), row, '', '## Target', '',
  'Target words this is the active line.', '',
  ...Array.from({ length: 80 }, (_, i) => `Trailing paragraph ${i}\n`)
].join('\n');
const target = source.indexOf('Target words') + 5, rowEnd = source.indexOf(row) + row.length;
const addition = (` ${image}`).repeat(4);

let browser;
try {
  await server.listen();
  browser = await pw[engine].launch({ headless: true,
    ...(engine === 'chromium' && process.env.BROWSER_EXECUTABLE ? { executablePath: process.env.BROWSER_EXECUTABLE } : {}) });
  const page = await browser.newPage({ viewport: { width: 1280, height: 760 } });
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
    canvas.width = 500; canvas.height = 480;
    canvas.getContext('2d').fillRect(0, 0, 500, 480);
    const data = canvas.toDataURL();
    const doc = { path: '/split-row-fixture.md', name: 'split-row-fixture.md', directory: '/', content, revision: 'a'.repeat(64) };
    const fixture = window.splitRowFixture = { hold: false, pending: [], reads: 0, scrollWrites: 0 };
    fixture.release = () => { for (const resolve of fixture.pending.splice(0)) resolve(data); };
    Object.assign(window.quilliteMarkdown, {
      openFile: async () => ({ ...doc }), readFile: async () => ({ ...doc }), canEditFile: async () => true,
      writeRecoverySnapshot: async () => {}, reportErrorLog: async () => {},
      readImageData: async ref => {
        if (ref !== 'assets/fixture.png') return null;
        fixture.reads++;
        return fixture.hold ? new Promise(resolve => fixture.pending.push(resolve)) : data;
      }
    });
  }, source);
  await page.locator('#openFileButton').click();
  await page.locator('#editButton').click();
  const editor = page.locator('#markdownEditor > .cm-editor');
  const preview = page.locator('#editorPreviewContent');
  const scroller = page.locator('.editor-preview-scroll');
  const waitDecoded = count => page.waitForFunction(count => {
    const images = [...document.querySelectorAll('#editorPreviewContent .quillite-image-row img')];
    return images.length === count && images.every(img => img.naturalHeight === 480 && !img.classList.contains('local-image-loading'));
  }, count);
  const settle = () => page.evaluate(() => new Promise(resolve =>
    requestAnimationFrame(() => requestAnimationFrame(() => setTimeout(resolve, 0)))));
  await waitDecoded(2);
  await editor.evaluate(async (dom, position) => {
    const { EditorView } = await import('/node_modules/@codemirror/view/dist/index.js');
    const view = EditorView.findFromDOM(dom), port = view.scrollDOM;
    const preview = document.querySelector('#editorPreviewContent'), scroller = preview.closest('.editor-preview-scroll');
    const fixture = window.splitRowFixture;
    fixture.view = view;
    fixture.measure = () => {
      const img = preview.querySelector('.quillite-image-row img');
      return { y: preview.querySelector('h2').getBoundingClientRect().top - scroller.getBoundingClientRect().top,
        imageHeight: img.offsetHeight, top: scroller.scrollTop, editorTop: port.scrollTop,
        editorHead: view.state.selection.main.head, focused: document.activeElement === view.contentDOM,
        writes: fixture.scrollWrites, reads: fixture.reads };
    };
    const scrollTo = scroller.scrollTo.bind(scroller);
    scroller.scrollTo = (...args) => { fixture.scrollWrites++; scrollTo(...args); };
    port.dispatchEvent(new WheelEvent('wheel', { bubbles: true }));
    view.dispatch({ selection: { anchor: position }, effects: EditorView.scrollIntoView(position, { y: 'center' }) });
    view.focus();
  }, target);
  await settle();
  await editor.evaluate(() => {
    const view = splitRowFixture.view, port = view.scrollDOM;
    const caret = view.coordsAtPos(view.state.selection.main.head);
    port.scrollTop += caret.top - port.getBoundingClientRect().top - 140;
  });
  await settle();
  await page.keyboard.press('ArrowRight');
  await page.keyboard.press('ArrowLeft');
  await page.waitForFunction(() => {
    const { y, top, focused } = splitRowFixture.measure();
    return focused && top > 100 && y > 20 && y < 240;
  });
  const old = await page.evaluate(({ rowEnd, addition }) => {
    const fixture = splitRowFixture, before = fixture.measure();
    fixture.hold = true;
    fixture.view.dispatch({ changes: { from: rowEnd, insert: addition }, userEvent: 'input.type' });
    return before;
  }, { rowEnd, addition });

  await page.waitForFunction(() => splitRowFixture.pending.length === 1 &&
    document.querySelectorAll('#editorPreviewContent .quillite-image-row img.local-image-loading').length === 6);
  assert.equal(await preview.locator('img[src]').count(), 0, 'fresh bridge authorization still pending');
  await settle();
  const top = await scroller.evaluate(node => node.scrollTop);
  await scroller.hover();
  await page.mouse.wheel(0, 32);
  await page.waitForFunction(top => splitRowFixture.measure().top > top + 20, top);
  await settle();
  const pending = await page.evaluate(() => splitRowFixture.measure());
  assert.ok(pending.y > 50 && pending.y < 250, 'manually positioned heading is visibly inside the pane');
  await page.evaluate(() => splitRowFixture.release());
  await waitDecoded(6);
  await settle();
  const result = await page.evaluate(() => ({ ...splitRowFixture.measure(), source: splitRowFixture.view.state.doc.toString() }));
  assert.equal(result.source, source.slice(0, rowEnd) + addition + source.slice(rowEnd));
  assert.equal(result.reads, old.reads + 1, 'one fresh bridge request covers all six identical images');
  assert.equal(result.writes, pending.writes, 'manual preview movement pauses programmatic following');
  assert.ok(result.focused && result.editorHead === pending.editorHead && Math.abs(result.editorTop - pending.editorTop) <= 2);
  assert.ok(old.imageHeight > result.imageHeight * 2, 'fixture must move the same images into much narrower slots');
  const drift = Math.abs(result.y - pending.y);
  // The normal, uncached 72px placeholder can settle to a ~49px image.
  assert.ok(drift < 36, `manually paused heading moved ${drift.toFixed(2)}px on decode (slot height ${pending.imageHeight}→${result.imageHeight})`);
  assert.deepEqual(errors, []);
  console.log(`PASS ${engine}: paused heading moved ${drift.toFixed(2)}px (slot height ${pending.imageHeight}→${result.imageHeight})`);
} finally {
  await browser?.close();
  server.httpServer.closeAllConnections?.();
  await server.close();
}
