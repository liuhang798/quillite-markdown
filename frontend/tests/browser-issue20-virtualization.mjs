// A measured image above the viewport is briefly remounted by CodeMirror
// when editing a distant row of a rendered code block. Replaying the fresh
// image read must not replace the measured height with a small placeholder.
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';

const pw = createRequire(import.meta.url)(process.env.PLAYWRIGHT_MODULE || 'playwright');
const engine = process.env.ISSUE20_BROWSER || 'chromium';
const server = await createServer({
  root: process.env.ISSUE20_FRONTEND_ROOT || fileURLToPath(new URL('..', import.meta.url)),
  server: { host: '127.0.0.1', port: 0, watch: null, hmr: false },
  logLevel: 'error'
});
const source = [
  ...Array.from({ length: 4 }, (_, i) => 'Prelude ' + i + '\n'),
  '![Fixture image](assets/fixture.png)', '', '## Target', '', '```text',
  ...Array.from({ length: 120 }, (_, i) => 'Code line ' + i + ' with extra words'),
  '```', '', ...Array.from({ length: 80 }, (_, i) => 'Trailing paragraph ' + i + '\n')
].join('\n');
const target = source.indexOf('Code line 119');

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
    localStorage.setItem('editorLayout', 'editor-only');
    localStorage.setItem('spellcheckEnabled', 'false');
  });
  await page.goto(server.resolvedUrls.local[0]);
  await page.waitForFunction(() => window.quilliteMarkdown && document.querySelector('#fileList')?.childElementCount);
  await page.evaluate(content => {
    const canvas = document.createElement('canvas');
    canvas.width = 500; canvas.height = 480;
    canvas.getContext('2d').fillRect(0, 0, 500, 480);
    const data = canvas.toDataURL();
    const file = { path: '/issue20-virtualization.md', name: 'issue20-virtualization.md', directory: '/', content, revision: 'a'.repeat(64) };
    window.virtualImageReads = 0;
    Object.assign(window.quilliteMarkdown, {
      openFile: async () => file,
      readFile: async () => file,
      canEditFile: async () => true,
      reportErrorLog: async () => {},
      readImageData: async ref => {
        if (ref !== 'assets/fixture.png') return null;
        window.virtualImageReads++;
        await new Promise(resolve => setTimeout(resolve, 450));
        return data;
      }
    });
  }, source);
  await page.locator('#openFileButton').click();
  await page.locator('#editButton').click();
  const editor = page.locator('#markdownEditor > .cm-editor');
  await page.waitForFunction(() => document.querySelector('#markdownEditor .cm-embedded-image img')?.naturalHeight === 480);
  await editor.evaluate(async (dom, position) => {
    const { EditorView } = await import('/node_modules/@codemirror/view/dist/index.js');
    const view = EditorView.findFromDOM(dom);
    window.virtualEditor = view;
    view.dispatch({ selection: { anchor: position }, effects: EditorView.scrollIntoView(position, { y: 'center' }) });
    view.focus();
  }, target + 5);
  await page.waitForTimeout(750);
  await editor.evaluate(dom => {
    const scroller = virtualEditor.scrollDOM;
    const rect = dom.querySelector('.cm-live-code .cm-content > .cm-line:last-child').getBoundingClientRect();
    // Cancel the asynchronous "restore reading position" lease as a user
    // scroll would; then place the actual last rendered row in the viewport.
    scroller.dispatchEvent(new WheelEvent('wheel', { bubbles: true }));
    scroller.scrollTop += rect.top - scroller.getBoundingClientRect().top - 140;
  });
  await page.waitForTimeout(150);
  const click = await editor.locator('.cm-live-code .cm-content > .cm-line').last().evaluate(node => {
    const rect = node.getBoundingClientRect(), port = virtualEditor.scrollDOM.getBoundingClientRect();
    return { x: rect.left + 49, y: (rect.top + rect.bottom) / 2, visible: rect.top >= port.top && rect.bottom <= port.bottom };
  });
  assert.ok(click.visible, 'test must click the visible last code row');
  await page.mouse.click(click.x, click.y);
  await page.waitForTimeout(100);
  const before = await editor.evaluate(dom => {
    const view = virtualEditor;
    const row = () => dom.querySelector('.cm-live-code .cm-content > .cm-line:last-child');
    const read = () => {
      const port = view.scrollDOM.getBoundingClientRect(), selection = document.getSelection();
      const focused = Boolean(document.activeElement?.closest('.cm-live-code'));
      let caret = null;
      if (focused && selection?.focusNode && document.activeElement.contains(selection.focusNode)) {
        const range = document.createRange();
        range.setStart(selection.focusNode, selection.focusOffset);
        const rect = range.getBoundingClientRect();
        if (rect.height) caret = rect.top - port.top;
      }
      return { row: row().getBoundingClientRect().top - port.top, caret, top: view.scrollDOM.scrollTop,
        head: view.state.selection.main.head, focused, mounted: Boolean(dom.querySelector('.cm-embedded-image')),
        reads: virtualImageReads, height: port.height };
    };
    const first = read(), frames = [];
    let frame;
    const sample = () => { frames.push(read()); frame = requestAnimationFrame(sample); };
    frame = requestAnimationFrame(sample);
    window.stopVirtualImageSample = () => {
      cancelAnimationFrame(frame);
      return { frames: [...frames, read()], currentSource: view.state.doc.toString() };
    };
    return first;
  });
  assert.equal(before.mounted, false, 'previously loaded image must be virtualized out of the DOM');
  assert.ok(before.focused && before.caret > 0 && before.caret < before.height, 'native caret must start in the visible code row');
  assert.ok(before.head >= target, 'the intended code row must own the caret');

  await page.keyboard.insertText('Z');
  await page.waitForFunction(count => virtualImageReads > count, before.reads);
  await page.waitForTimeout(650);
  const { frames, currentSource } = await page.evaluate(() => stopVirtualImageSample());
  assert.ok(frames.length > 1, 'collect frames through the offscreen image remount');
  assert.equal(currentSource, source.slice(0, before.head) + 'Z' + source.slice(before.head));
  const jitter = Math.max(...frames.map(frame => Math.max(
    Math.abs(frame.row - before.row), Math.abs(frame.top - before.top),
    frame.caret === null ? Infinity : Math.abs(frame.caret - before.caret))));
  assert.ok(frames.every(frame => frame.focused) && jitter < 3, `live code caret/row moved ${jitter}px while the offscreen image remounted`);
  assert.deepEqual(errors, []);
  console.log(`PASS ${engine}: ${frames.length} frames, ${jitter.toFixed(2)}px maximum movement during the fresh offscreen image read`);
} finally {
  await browser?.close();
  server.httpServer.closeAllConnections?.();
  await server.close();
}
