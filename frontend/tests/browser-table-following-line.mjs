// Real pointer hit-testing in the application, using synthetic Markdown only.
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';

const pw = createRequire(import.meta.url)(process.env.PLAYWRIGHT_MODULE || 'playwright');
const engine = process.env.TABLE_FOLLOWING_LINE_BROWSER || 'chromium';
const server = await createServer({
  root: fileURLToPath(new URL('..', import.meta.url)),
  server: { host: '127.0.0.1', port: 0, watch: null, hmr: false },
  logLevel: 'error'
});
const tableSource = [
  '<!-- quillite-table-widths: 220, 220, 220, 220 -->',
  '| A | B | C | D |',
  '| :--- | :--- | :--- | :--- |',
  '| 1 | 2 | 3 | |',
  '| | | | |',
  '| Last | | | End |'
].join('\n');
const prose = 'Next text\n';
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
    localStorage.setItem('editorPresentation', 'live');
    localStorage.setItem('editorLayout', 'editor-only');
  });
  await page.goto(server.resolvedUrls.local[0]);
  await page.waitForFunction(() => window.quilliteMarkdown && document.querySelector('#fileList')?.childElementCount);
  await page.evaluate(text => Object.assign(window.quilliteMarkdown, {
    openFile: async () => ({ path: '/table-following-line.md', name: 'table-following-line.md', directory: '/', content: text, revision: 'a'.repeat(64) }),
    canEditFile: async () => true,
    reportErrorLog: async () => {}
  }), tableSource + '\n\n' + prose);
  await page.locator('#openFileButton').click();
  await page.locator('#editButton').click();

  const editor = page.locator('#markdownEditor > .cm-editor');
  const widget = editor.locator('.cm-live-table');
  const table = widget.locator('table');
  const content = editor.locator('> .cm-scroller > .cm-content');
  const sourceButton = page.locator('[data-editor-presentation="source"]');
  const liveButton = page.locator('[data-editor-presentation="live"]');
  const mod = await page.evaluate(() => /Mac/.test(navigator.platform) ? 'Meta' : 'Control');
  const readState = () => editor.evaluate(async dom => {
    const { EditorView } = await import('/node_modules/@codemirror/view/dist/index.js');
    const { doc, selection } = EditorView.findFromDOM(dom).state;
    return { source: doc.toString(), caret: selection.main.head };
  });
  const read = async () => (await readState()).source;
  const waitForSource = (...expected) => page.waitForFunction(async expected => {
    const { EditorView } = await import('/node_modules/@codemirror/view/dist/index.js');
    const dom = document.querySelector('#markdownEditor > .cm-editor');
    return dom && expected.includes(EditorView.findFromDOM(dom)?.state.doc.toString());
  }, expected, { timeout: 5000 });
  const reset = async text => {
    await sourceButton.click();
    await content.fill(text);
    await content.press(mod === 'Meta' ? 'Meta+ArrowUp' : 'Control+Home');
    await liveButton.click();
    await table.waitFor();
    assert.equal(await read(), text);
  };
  const gapPoint = () => widget.evaluate(element => {
    const blank = element.nextElementSibling;
    if (!blank?.matches('.cm-line') || blank.textContent.trim()) throw new Error('Missing blank editor line below table');
    const row = blank.getBoundingClientRect();
    return { x: row.left + 12, y: row.top + row.height / 2 };
  });
  const footerPoint = () => widget.evaluate(element => {
    const box = element.getBoundingClientRect(), table = element.querySelector('table').getBoundingClientRect();
    if (box.bottom - table.bottom < 4) throw new Error('Missing table footer gap');
    return { x: table.left + 12, y: (box.bottom + table.bottom) / 2 };
  });
  for (const [name, tail, expectedTail, point] of [
    ['blank after table with an existing separator', '\n\n\n' + prose, '\n\nNEW\n' + prose, gapPoint],
    ['blank after table with one separator line', '\n\n' + prose, '\n\nNEW\n' + prose, gapPoint],
    ['inside the empty table footer', '\n\n' + prose, '\n\nNEW\n' + prose, footerPoint],
    ['blank at end of document', '\n', '\n\nNEW', gapPoint]
  ]) {
    const original = tableSource + tail;
    await reset(original);
    const { x, y } = await point();
    await page.mouse.click(x, y);
    assert.equal(await read(), original, 'pointing below the table must not modify Markdown');
    await page.keyboard.insertText('NEW');
    const state = await readState();
    assert.equal(state.source, tableSource + expectedTail, name);
    assert.equal(state.caret, tableSource.length + '\n\nNEW'.length, 'subsequent typing continues after the inserted text');
    assert.equal(await table.locator('th, td').count(), 16, name);
    await page.keyboard.press(`${mod}+z`);
    assert.equal(await read(), original, 'undo restores exact table and blank lines');
  }

  if (engine === 'chromium') {
    const cdp = await page.context().newCDPSession(page);
    for (const [name, tail, followingProse] of [
      ['single separator', '\n\n' + prose, '\n' + prose],
      ['end of document', '\n', '']
    ]) {
      const original = tableSource + tail;
      await reset(original);
      const point = await gapPoint();
      await page.mouse.click(point.x, point.y);
      for (const candidate of ['n', 'ni', 'nih', 'nihao']) {
        await cdp.send('Input.imeSetComposition', { text: candidate, selectionStart: candidate.length, selectionEnd: candidate.length });
        await waitForSource(tableSource + '\n' + candidate + followingProse, tableSource + '\n\n' + candidate + followingProse);
        assert.equal(await table.locator('th, td').count(), 16, `${name}: table stays rendered while choosing a candidate`);
      }
      await cdp.send('Input.insertText', { text: '你好' });
      const expected = tableSource + '\n\n你好' + followingProse;
      await waitForSource(expected);
      assert.equal((await readState()).caret, tableSource.length + '\n\n你好'.length, `${name}: composition ends at the committed text`);
      assert.equal(await table.locator('th, td').count(), 16);
      await page.keyboard.press(`${mod}+z`);
      assert.equal(await read(), original, `${name}: one undo restores the original Markdown`);
      const cancelPoint = await gapPoint();
      await page.mouse.click(cancelPoint.x, cancelPoint.y);
      await cdp.send('Input.imeSetComposition', { text: 'cancel', selectionStart: 6, selectionEnd: 6 });
      await cdp.send('Input.imeSetComposition', { text: '', selectionStart: 0, selectionEnd: 0 });
      await waitForSource(original);
      assert.equal(await table.locator('th, td').count(), 16, `${name}: cancelling retains the table without adding a separator`);
    }
    await cdp.detach();
  }

  await reset(tableSource + '\n\n' + prose);
  await table.locator('td').last().locator('.cm-content').click();
  await page.keyboard.press('End');
  await page.keyboard.insertText('!');
  assert.equal(await read(), tableSource.replace('End |', 'End! |') + '\n\n' + prose, 'last table cell remains directly editable');
  assert.equal(await table.locator('th, td').count(), 16);
  assert.deepEqual(errors, []);
  console.log(`PASS ${engine}: table footer and following blank line insert below the table; last cell is still editable`);
} finally {
  await browser?.close();
  server.httpServer.closeAllConnections?.();
  await server.close();
}
