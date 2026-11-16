// A split preview replaces its HTML after an edit; the fresh, pending local
// image read must not make the preview cursor target disappear or jump.
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';

const pw = createRequire(import.meta.url)(process.env.PLAYWRIGHT_MODULE || 'playwright');
const engine = process.env.SPLIT_IMAGE_BROWSER || 'chromium';
const server = await createServer({
  root: process.env.SPLIT_IMAGE_FRONTEND_ROOT || fileURLToPath(new URL('..', import.meta.url)),
  server: { host: '127.0.0.1', port: 0, watch: null, hmr: false },
  logLevel: 'error'
});
const ref = 'assets/fixture.png', directory = '/split-image-fixture';
const source = [
  ...Array.from({ length: 4 }, (_, i) => 'Prelude ' + i + '\n'),
  `![Fixture image](${ref})`, '', '## Target', '', 'Target words this is the active line.', '',
  ...Array.from({ length: 80 }, (_, i) => 'Trailing paragraph ' + i + '\n')
].join('\n');
const target = source.indexOf('Target words') + 5;

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
    localStorage.setItem('editorPresentation', 'live');
    localStorage.setItem('editorLayout', 'editor-left');
    localStorage.setItem('spellcheckEnabled', 'false');
  });
  await page.goto(server.resolvedUrls.local[0]);
  await page.waitForFunction(() => window.quilliteMarkdown && document.querySelector('#fileList')?.childElementCount);
  await page.evaluate(({ source, directory }) => {
    const canvas = document.createElement('canvas');
    canvas.width = 500; canvas.height = 480;
    canvas.getContext('2d').fillRect(0, 0, 500, 480);
    const data = canvas.toDataURL();
    const file = { path: directory + '/fixture.md', name: 'fixture.md', directory, content: source, revision: 'a'.repeat(64) };
    const controls = window.splitImageFixture = { pauseReads: false, reads: [], releases: [] };
    controls.releaseOldest = () => controls.releases.shift()(data);
    controls.release = allowed => {
      controls.pauseReads = false;
      for (const resolve of controls.releases.splice(0)) resolve(allowed ? data : null);
    };
    Object.assign(window.quilliteMarkdown, {
      openFile: async () => ({ ...file }),
      readFile: async () => ({ ...file }),
      canEditFile: async () => true,
      reportErrorLog: async () => {},
      writeRecoverySnapshot: async () => {},
      readImageData: async (ref, directory) => {
        controls.reads.push({ ref, directory });
        return controls.pauseReads ? new Promise(resolve => controls.releases.push(resolve)) : data;
      }
    });
  }, { source, directory });
  await page.locator('#openFileButton').click();
  await page.locator('#editButton').click();
  const editor = page.locator('#markdownEditor > .cm-editor');
  const preview = page.locator('#editorPreviewContent');
  const image = preview.locator('img');
  await page.waitForFunction(() => document.querySelector('#markdownEditor .cm-embedded-image img')?.naturalHeight === 480
    && document.querySelector('#editorPreviewContent img')?.naturalHeight === 480);
  await editor.evaluate(async (dom, target) => {
    const { EditorView } = await import('/node_modules/@codemirror/view/dist/index.js');
    const view = EditorView.findFromDOM(dom), port = view.scrollDOM;
    const scroller = document.querySelector('.editor-preview-scroll');
    const preview = document.querySelector('#editorPreviewContent');
    const originalScrollTo = scroller.scrollTo.bind(scroller);
    const fixture = window.splitImageFixture;
    fixture.previewScrollWrites = 0;
    scroller.scrollTo = (...args) => { fixture.previewScrollWrites++; originalScrollTo(...args); };
    fixture.read = () => {
      const viewport = port.getBoundingClientRect(), frame = scroller.getBoundingClientRect();
      const selection = document.getSelection();
      const active = document.activeElement === view.contentDOM;
      let caret = null;
      if (active && selection?.focusNode && view.contentDOM.contains(selection.focusNode)) {
        const range = document.createRange();
        range.setStart(selection.focusNode, selection.focusOffset);
        const rect = range.getBoundingClientRect();
        if (rect.height) caret = rect.top - viewport.top;
      }
      const renderedTarget = [...preview.querySelectorAll('p')].find(el => el.textContent.includes('this is the active line.'));
      const current = preview.querySelector('img');
      return { caret, editorHeight: viewport.height, editorTop: port.scrollTop, head: view.state.selection.main.head,
        active, previewTarget: renderedTarget ? renderedTarget.getBoundingClientRect().top - frame.top : null,
        previewHeight: frame.height, previewTop: scroller.scrollTop, renderedImage: current?.naturalHeight || 0,
        pending: current?.classList.contains('local-image-loading') || false };
    };
    fixture.source = () => view.state.doc.toString();
    // Cancel editor-entry restoration just as a user scroll would. Give the
    // real paragraph a visibly interior caret, away from the viewport edge.
    port.dispatchEvent(new WheelEvent('wheel', { bubbles: true }));
    view.dispatch({ selection: { anchor: target }, effects: EditorView.scrollIntoView(target, { y: 'center' }) });
    view.focus();
    view.requestMeasure({ read: () => view.coordsAtPos(target), write: rect => {
      if (rect) port.scrollTop += rect.top - port.getBoundingClientRect().top - 140;
    } });
  }, target);
  await page.waitForFunction(() => {
    const state = splitImageFixture.read();
    return state.active && state.caret > 12 && state.caret < state.editorHeight - 12;
  });
  await page.keyboard.press('ArrowRight');
  await page.keyboard.press('ArrowLeft');
  await page.waitForFunction(() => {
    const state = splitImageFixture.read();
    return state.active && state.previewTop > 100 && state.previewTarget > 0 && state.previewTarget < state.previewHeight - 12;
  });
  const initial = await page.evaluate(() => {
    const fixture = splitImageFixture;
    const before = fixture.read(), frames = [];
    let frame;
    const sample = () => { frames.push(fixture.read()); frame = requestAnimationFrame(sample); };
    frame = requestAnimationFrame(sample);
    fixture.stopSampling = () => { cancelAnimationFrame(frame); return [...frames, fixture.read()]; };
    fixture.pauseReads = true;
    return { before, readCount: fixture.reads.length };
  });
  assert.equal(initial.before.head, target, 'known target owns the editor caret');
  await page.keyboard.insertText('Z');
  await preview.getByText('TargeZt words this is the active line.', { exact: true }).waitFor();
  await preview.locator('img.local-image-loading').waitFor();
  await page.waitForFunction(() => splitImageFixture.releases.length === 1);
  assert.equal(await image.getAttribute('src'), null, 'new image bytes must wait for the fresh bridge check');

  // Another edit can replace the first pending image before it has
  // intrinsic dimensions. The second read is still authoritative.
  await page.keyboard.insertText('Q');
  await preview.getByText('TargeZQt words this is the active line.', { exact: true }).waitFor();
  await page.waitForFunction(() => splitImageFixture.releases.length === 2);
  await page.evaluate(() => splitImageFixture.releaseOldest());
  await page.waitForTimeout(350);
  assert.equal(await image.getAttribute('src'), null, 'a stale generation must not paint the current image');
  assert.equal(await preview.locator('img.local-image-loading').count(), 1);
  await page.evaluate(() => splitImageFixture.release(true));
  await page.waitForFunction(() => document.querySelector('#editorPreviewContent img')?.naturalHeight === 480);
  await page.waitForTimeout(120);
  const checked = await page.evaluate(() => {
    const fixture = splitImageFixture;
    return { frames: fixture.stopSampling(), reads: fixture.reads, source: fixture.source() };
  });
  assert.deepEqual(checked.reads.slice(initial.readCount), [{ ref, directory }, { ref, directory }],
    'both updated previews re-read the image with its document directory');
  assert.ok(checked.frames.some(frame => frame.pending), 'the test must sample a real pending image');
  assert.equal(checked.source, source.slice(0, target) + 'ZQ' + source.slice(target));
  const maxPreviewDrift = Math.max(...checked.frames.map(frame =>
    frame.previewTarget === null ? Infinity : Math.abs(frame.previewTarget - initial.before.previewTarget)));
  assert.ok(maxPreviewDrift <= 5, `preview target moved ${maxPreviewDrift.toFixed(2)}px during local image re-read`);
  assert.ok(checked.frames.every(frame => frame.active && frame.caret !== null
    && Math.abs(frame.caret - initial.before.caret) <= 2 && Math.abs(frame.editorTop - initial.before.editorTop) <= 2),
  'split preview must not move or take focus from the live editor caret');

  // A denied fresh read must not reuse earlier image bytes. Its eventual
  // alignment also must not override manual scrolling of the preview.
  await page.evaluate(() => { splitImageFixture.pauseReads = true; });
  await page.keyboard.insertText('Y');
  await preview.getByText('TargeZQYt words this is the active line.', { exact: true }).waitFor();
  await preview.locator('img.local-image-loading').waitFor();
  const previewScroller = page.locator('.editor-preview-scroll');
  const manualBefore = await previewScroller.evaluate(el => el.scrollTop);
  await previewScroller.hover();
  await page.mouse.wheel(0, 240);
  await page.waitForFunction(top => document.querySelector('.editor-preview-scroll').scrollTop > top + 50, manualBefore);
  const alignmentWrites = await page.evaluate(() => splitImageFixture.previewScrollWrites);
  await page.evaluate(() => splitImageFixture.release(false));
  await preview.locator('img.local-image-error').waitFor();
  assert.equal(await image.getAttribute('src'), null, 'denied fresh read must not expose the previous image');
  await page.waitForTimeout(120);
  assert.equal(await page.evaluate(() => splitImageFixture.previewScrollWrites), alignmentWrites,
    'settling a denied read must not resume preview following after manual scroll');

  await editor.locator(':scope > .cm-scroller > .cm-content').focus();
  await page.evaluate(() => { splitImageFixture.pauseReads = true; });
  await page.keyboard.insertText('X');
  await preview.getByText('TargeZQYXt words this is the active line.', { exact: true }).waitFor();
  await page.waitForFunction(() => splitImageFixture.releases.length === 1);
  await page.locator('#hideLivePreviewButton').click();
  assert.equal(await image.count(), 0, 'hiding the split preview removes its pending content');
  await page.locator('#restoreLivePreviewButton').click();
  await page.waitForFunction(() => splitImageFixture.releases.length === 2);
  await preview.locator('img.local-image-loading').waitFor();
  await page.waitForTimeout(100);
  const reopenedWrites = await page.evaluate(() => splitImageFixture.previewScrollWrites);
  await page.evaluate(() => splitImageFixture.releaseOldest());
  await page.waitForTimeout(120);
  assert.equal(await image.getAttribute('src'), null, 'a hidden layout must not paint a late result into its replacement');
  assert.equal(await page.evaluate(() => splitImageFixture.previewScrollWrites), reopenedWrites,
    'the old layout must not scroll the newly reopened preview');
  await page.evaluate(() => splitImageFixture.release(true));
  await page.waitForFunction(() => document.querySelector('#editorPreviewContent img')?.naturalHeight === 480);
  assert.deepEqual(errors, []);
  console.log(`PASS ${engine}: ${checked.frames.length} frames, ${maxPreviewDrift.toFixed(2)}px maximum preview movement, denial, manual scroll and hide/show invalidation`);
} finally {
  await browser?.close();
  server.httpServer.closeAllConnections?.();
  await server.close();
}
