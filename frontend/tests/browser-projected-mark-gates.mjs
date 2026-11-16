// Measure DOM walks only after projected search/spelling marks are inactive.
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';

const pw = createRequire(import.meta.url)(process.env.PLAYWRIGHT_MODULE || 'playwright');
const engine = process.env.PROJECTED_MARKS_BROWSER || 'chromium';
const server = await createServer({
  root: fileURLToPath(new URL('..', import.meta.url)),
  server: { host: '127.0.0.1', port: 0, watch: null, hmr: false },
  logLevel: 'error'
});
const source = [
  'A note[^n]', '', '[^n]: Intro', '    ',
  '    <details open>', '    <summary>Details</summary>', '    ',
  '    | First | Second |', '    | --- | --- |', '    | wurld | Other |',
  '    ', '    </details>', '', 'After the note.'
].join('\n');
let browser;
try {
  await server.listen();
  browser = await pw[engine].launch({ headless: true,
    ...(engine === 'chromium' && process.env.BROWSER_EXECUTABLE ? { executablePath: process.env.BROWSER_EXECUTABLE } : {}) });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
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
  await page.evaluate(content => Object.assign(window.quilliteMarkdown, {
    openFile: async () => ({ path: '/projection-marks.md', name: 'projection-marks.md', directory: '/', content, revision: 'a'.repeat(64) }),
    canEditFile: async () => true,
    reportErrorLog: async () => {}
  }), source);
  await page.locator('#openFileButton').click();
  await page.locator('#editButton').click();

  const editor = page.locator('#markdownEditor > .cm-editor');
  const cell = editor.locator('.cm-live-footnote-definition .cm-live-details table td .cm-content').first();
  await cell.waitFor();
  const measureIdleWalks = () => editor.evaluate(async dom => {
    const { EditorView } = await import('/node_modules/@codemirror/view/dist/index.js');
    const { syncEditableSearch, syncEditableSpelling } = await import('/src/live-editable-block.js');
    const view = EditorView.findFromDOM(dom);
    const original = dom.querySelectorAll;
    let walks = 0;
    dom.querySelectorAll = function (selector) {
      if (selector === '.cm-editor' || selector === '.cm-live-editable-block') walks++;
      return original.call(this, selector);
    };
    try {
      syncEditableSearch(view);
      syncEditableSpelling(view);
      return walks;
    } finally { delete dom.querySelectorAll; }
  });
  assert.equal(await measureIdleWalks(), 0, 'inactive marks do not walk mounted editors');

  const setSpelling = enabled => editor.evaluate(async (dom, enabled) => {
    const { Decoration, EditorView } = await import('/node_modules/@codemirror/view/dist/index.js');
    const { setSpellingDecorations } = await import('/src/spelling-decorations.js');
    const view = EditorView.findFromDOM(dom);
    const from = view.state.doc.toString().indexOf('wurld');
    const ranges = enabled ? Decoration.set([Decoration.mark({ class: 'cm-spelling-error' }).range(from, from + 5)]) : Decoration.none;
    view.dispatch({ effects: setSpellingDecorations.of(ranges) });
  }, enabled);
  await setSpelling(true);
  await cell.locator('.cm-spelling-error').waitFor();
  await setSpelling(false);
  await cell.locator('.cm-spelling-error').waitFor({ state: 'detached' });

  await cell.click();
  const mod = await page.evaluate(() => /Mac/.test(navigator.platform) ? 'Meta' : 'Control');
  await page.keyboard.press(`${mod}+f`);
  const panel = editor.locator(':scope > .cm-panels .cm-search');
  const search = panel.locator('input[name="search"]');
  const projected = cell.locator('.cm-searchMatch');
  const query = async value => { await search.fill(value); await search.press('End'); };
  await query('wurld');
  await projected.waitFor();
  await query('');
  await projected.waitFor({ state: 'detached' });
  await query('wurld');
  await projected.waitFor();
  await panel.locator('button[name="close"]').click();
  await projected.waitFor({ state: 'detached' });
  assert.equal(await measureIdleWalks(), 0, 'after clearing marks, updates no longer walk mounted editors');
  assert.deepEqual(errors, []);
  console.log(`PASS ${engine}: nested marks project and clear; inactive search/spelling perform zero DOM walks`);
} finally {
  await browser?.close();
  server.httpServer.closeAllConnections?.();
  await server.close();
}
