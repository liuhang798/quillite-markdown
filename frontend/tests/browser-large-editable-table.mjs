// Browser regression for a large, privately generated GFM table. All content
// and saves stay in memory; no native dialogs or system clipboard are used.
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';

const pw = createRequire(import.meta.url)(process.env.PLAYWRIGHT_MODULE || 'playwright');
const engine = process.env.TABLE_BROWSER || 'chromium';
const count = 364;
const first = '| Field 1 | remark 1 | keep |';
const last = `| Field ${count} | remark ${count} | keep |`;
const rows = Array.from({ length: count }, (_, i) => `| Field ${i + 1} | remark ${i + 1} | keep |`);
rows[1] = '| Field 2 | $x_1^2$ | ![Reference pixel][shared-image] |';
const source = [
  '# Large table fixture', '', '<!-- quillite-table-widths: 200, 240, 180 -->',
  '| Field | Remark | Action |', '| :--- | :---: | ---: |', ...rows, '',
  'Text outside the large table.', '',
  '| Small | Table |', '| --- | --- |', '| cell A | cell B |', '',
  '[shared-image]: local-fixture.png "Reference title"', '',
].join('\n');
const server = await createServer({
  root: fileURLToPath(new URL('..', import.meta.url)),
  server: { host: '127.0.0.1', port: Number(process.env.TABLE_PORT) || 41749, strictPort: true, watch: null, hmr: false },
  logLevel: 'error',
  plugins: [{
    name: 'large-table-test-only', enforce: 'pre',
    transform(code, id) {
      if (!id.replaceAll('\\','/').endsWith('/src/renderer.js')) return;
      return code + `
window.largeTableTest = {
  text: () => codeEditor?.state.doc.toString(),
  selectedLine: () => codeEditor.state.doc.lineAt(codeEditor.state.selection.main.head).text,
  selectedText: () => codeEditor.state.sliceDoc(codeEditor.state.selection.main.from, codeEditor.state.selection.main.to),
  status: () => ({
    selection: codeEditor.state.selection.ranges.map(({anchor,head}) => [anchor,head]),
    rendered: codeEditor.dom.querySelectorAll('.cm-live-table-lightweight').length,
    sourceLines: codeEditor.dom.querySelectorAll('.cm-live-source-line').length,
    scrollTop: codeEditor.scrollDOM.scrollTop,
  }),
  select: (needle) => {
    const at = codeEditor.state.doc.toString().indexOf(needle);
    if (at < 0) throw new Error('Missing synthetic fixture text');
    codeEditor.dispatch({selection:{anchor:at+needle.length},scrollIntoView:true});
    codeEditor.focus();
  },
};`;
    },
  }],
});

let browser;
try {
  await server.listen();
  browser = await pw[engine].launch({
    headless: true,
    ...(engine === 'chromium' && process.env.BROWSER_EXECUTABLE ? { executablePath: process.env.BROWSER_EXECUTABLE } : {}),
  });
  const page = await browser.newPage({ viewport: { width: 1450, height: 1050 } });
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.route('**/*', route => new URL(route.request().url()).hostname === '127.0.0.1' ? route.continue() : route.abort());
  await page.addInitScript(() => {
    localStorage.setItem('language', 'zh-CN');
    localStorage.setItem('editorPresentation', 'live');
    localStorage.setItem('editorLayout', 'editor-only');
  });
  await page.goto(server.resolvedUrls.local[0]);
  await page.waitForFunction(() => window.largeTableTest && window.quilliteMarkdown && document.querySelector('#fileList')?.childElementCount);
  await page.evaluate(content => Object.assign(window.quilliteMarkdown, {
    openFile: async () => ({ path: '/isolated/large-table.md', directory: '/isolated', name: 'large-table.md', content, revision: 'a'.repeat(64) }),
    canEditFile: async () => true,
    readImageData: async () => 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a9WQAAAAASUVORK5CYII=',
    reportErrorLog: async () => {},
  }), source);
  await page.locator('#openFileButton').click();
  await page.locator('#markdownContent table').first().waitFor();
  await page.locator('#editButton').click();
  const editor = page.locator('#markdownEditor > .cm-editor');
  const big = editor.locator('.cm-live-table').filter({ hasText: `Field ${count}` });
  const editSource = big.getByRole('button', { name: /查看源码|编辑源码|编辑表格源码/, exact: true });
  await big.locator('table').waitFor();
  assert.equal(await big.locator('table tr').count(), count + 1, 'all data and header rows stay rendered');
  assert.equal(await big.locator('table tbody td').count(), count * 3, 'no cell content is dropped');
  assert.equal(await big.locator('.cm-editor').count(), 0, 'large table does not create per-cell CodeMirror instances');
  assert.equal(await page.evaluate(() => largeTableTest.text()), source, 'rendering never changes source');
  await big.locator('td .katex msubsup').waitFor();
  assert.ok(await big.locator('td .katex .katex-html [style]').evaluateAll(nodes =>
    nodes.some(node => [...node.style].some(property => /^(?:height|top|vertical-align|margin-left|margin-right)$/.test(property)
      && /^-?\d*\.?\d+(?:em|px)?$/.test(node.style.getPropertyValue(property))))), 'KaTeX keeps numeric layout styles');
  const image = big.locator('img[alt="Reference pixel"][title="Reference title"]');
  await image.waitFor();
  await page.waitForFunction(() => {
    const img = document.querySelector('#markdownEditor .cm-live-table img[alt="Reference pixel"]');
    return img?.complete && img.naturalWidth > 0 && img.src.startsWith('data:image/png');
  });
  assert.deepEqual(await big.locator('colgroup col').evaluateAll(cols => cols.map(col => col.style.width)), ['200px', '240px', '180px']);
  assert.equal(await big.locator('thead th').nth(1).getAttribute('align'), 'center');
  assert.equal(await big.locator('thead th').nth(2).getAttribute('align'), 'right');

  const undoKey = process.platform === 'darwin' ? 'Meta+z' : 'Control+z';
  const activeCell = big.locator('td:has(.cm-editor)');
  const firstCell = big.locator('tbody tr').first().locator('td').first();
  const caretPoint = async (cell, offset) => {
    await cell.scrollIntoViewIfNeeded();
    return cell.evaluate((node, at) => {
      const walker = document.createTreeWalker(node, NodeFilter.SHOW_TEXT);
      let text = walker.nextNode();
      while (text && at > text.length) { at -= text.length; text = walker.nextNode(); }
      if (!text) throw new Error('No test cell text at the requested offset');
      const range = document.createRange();
      range.setStart(text, at); range.collapse(true);
      const {left, top, height} = range.getBoundingClientRect();
      return {x: left, y: top + height / 2};
    }, offset);
  };
  await big.evaluate(node => { window.largeTableRenderedNode = node; });
  await page.evaluate(() => largeTableTest.select('Large table fixture'));
  await page.keyboard.press('X');
  await page.waitForFunction(expected => largeTableTest.text() === expected, source.replace('Large table fixture', 'Large table fixtureX'));
  assert.equal(await big.locator('table tr').count(), count + 1, 'typing outside the table preserves its rendered rows');
  assert.equal(await big.evaluate(node => node === window.largeTableRenderedNode), true, 'shifting offsets does not remount the unchanged table');
  await page.keyboard.press(undoKey);
  await page.waitForFunction(expected => largeTableTest.text() === expected, source);

  // Click a real glyph boundary, not the center of the cell's padding.
  const middle = await caretPoint(firstCell, 2);
  await page.mouse.click(middle.x, middle.y);
  await activeCell.waitFor();
  assert.equal(await activeCell.count(), 1);
  assert.equal(await editor.locator('.cm-live-source-line').count(), 0, 'click keeps the large table rendered');
  const inlineEdit = source.replace(first, first.replace('Field 1', 'FiXeld 1'));
  await page.keyboard.press('X');
  await page.waitForFunction(expected => largeTableTest.text() === expected, inlineEdit, {timeout:3000}).catch(async cause => {
    const status = await page.evaluate(() => ({...largeTableTest.status(), line:largeTableTest.selectedLine()}));
    throw new Error(`Click did not place caret on glyph boundary: ${JSON.stringify(status)}; ${errors.join('; ')}`, {cause});
  });
  await page.keyboard.press(undoKey);
  await page.waitForFunction(expected => largeTableTest.text() === expected, source);
  await page.keyboard.press('Tab');
  await activeCell.filter({hasText:'remark 1'}).waitFor();
  assert.equal(await activeCell.count(), 1, 'Tab moves the lazy editor, without mounting a second one');
  await page.keyboard.press('Shift+Tab');
  await activeCell.filter({hasText:'Field 1'}).waitFor();
  assert.equal(await activeCell.count(), 1, 'Shift+Tab moves the lazy editor back');

  // A fresh static cell must support drag selection on the very first gesture.
  const dragCell = big.locator('tbody tr').nth(2).locator('td').first();
  const dragStart = await caretPoint(dragCell, 1);
  const dragEnd = await caretPoint(dragCell, 5);
  await page.mouse.move(dragStart.x, dragStart.y);
  await page.mouse.down();
  await page.mouse.move(dragEnd.x, dragEnd.y, {steps: 8});
  await page.mouse.up();
  await activeCell.filter({hasText:'Field 3'}).waitFor();
  assert.equal(await page.evaluate(() => largeTableTest.selectedText()), 'ield', 'the first drag selects the actual cell text');
  assert.equal(await activeCell.count(), 1);

  await big.hover({ position: { x: 20, y: 12 } });
  await editSource.click();
  const back = editor.getByRole('button', { name: '返回渲染', exact: true });
  await back.waitFor();
  assert.equal(await big.count(), 0, 'only the selected large table switches to source');
  await page.evaluate(needle => largeTableTest.select(needle), first.slice(0, first.indexOf(' | remark')));
  await page.keyboard.press('X');
  const edited = source.replace(first, first.replace('Field 1', 'Field 1X'));
  await page.waitForFunction(expected => largeTableTest.text() === expected, edited);
  await page.keyboard.press(undoKey);
  await page.waitForFunction(expected => largeTableTest.text() === expected, source);
  await page.keyboard.press('X');
  await page.waitForFunction(expected => largeTableTest.text() === expected, edited);
  await back.click();
  await big.locator('table').waitFor();
  assert.equal(await big.locator('table tbody tr').count(), count);
  assert.equal(await big.locator('table tbody tr').first().locator('td').first().textContent(), 'Field 1X');
  assert.equal(await big.locator('table tbody tr').last().locator('td').first().textContent(), `Field ${count}`);
  assert.ok((await page.evaluate(() => largeTableTest.text())).includes(last), 'tail source is intact');

  // The last row is far below the initial viewport. Clicking it maps to
  // that source row, not the first row or the previously selected cell.
  const tail = big.locator('table tbody tr').last().locator('td').first();
  const tailCaret = await caretPoint(tail, 2);
  await page.mouse.click(tailCaret.x, tailCaret.y);
  await activeCell.filter({hasText:`Field ${count}`}).waitFor();
  assert.equal(await activeCell.count(), 1);
  assert.equal(await editor.locator('.cm-live-source-line').count(), 0, 'offscreen cell click still edits inline');
  assert.equal(await page.evaluate(() => largeTableTest.selectedLine()), last);

  // Source editing remains explicit, even after navigating deep in the table.
  await editSource.focus();
  await page.keyboard.press('Enter');
  await back.waitFor();
  assert.equal(await page.evaluate(() => largeTableTest.selectedLine()), last);
  await back.click();
  await big.locator('table').waitFor();
  const visibleTail = () => {
    const cell = document.querySelector('#markdownEditor .cm-live-table-lightweight tbody tr:last-child td:first-child');
    const scroll = document.querySelector('#markdownEditor > .cm-editor > .cm-scroller');
    if (!cell || !scroll) return false;
    const rect = cell.getBoundingClientRect(), port = scroll.getBoundingClientRect();
    return rect.bottom > port.top && rect.top < port.bottom;
  };
  await page.waitForFunction(visibleTail, null, { timeout: 3000 }).catch(async cause => {
    const geometry = await tail.evaluate(cell => {
      const scroll = cell.closest('.cm-scroller');
      const rect = cell.getBoundingClientRect(), port = scroll.getBoundingClientRect();
      return { rowTop: rect.top, rowBottom: rect.bottom, portTop: port.top, portBottom: port.bottom,
        scrollTop: scroll.scrollTop, scrollHeight: scroll.scrollHeight, clientHeight: scroll.clientHeight };
    });
    throw new Error(`Returning to the rendered table hid the last row: ${JSON.stringify(geometry)}`, { cause });
  });

  // A search hit inside an otherwise atomic table remains reachable/editable.
  await page.evaluate(() => largeTableTest.select('Large table fixture'));
  await page.keyboard.press(process.platform === 'darwin' ? 'Meta+f' : 'Control+f');
  const search = editor.locator(':scope > .cm-panels .cm-search');
  await search.locator('input[name="search"]').fill(`Field ${count}`);
  await search.locator('button[name="next"]').click();
  assert.equal(await page.evaluate(() => largeTableTest.selectedLine()), last);
  await back.waitFor();
  assert.equal(await big.count(), 0);
  await search.locator('button[name="close"]').click();
  await editor.locator('.cm-live-source-line').filter({ hasText: `Field ${count}` }).hover();
  await back.click();
  await big.locator('table').waitFor({ timeout: 3000 }).catch(async cause => {
    const result = await page.evaluate(() => largeTableTest.status());
    throw new Error(`Search return did not restore the table: ${JSON.stringify(result)}; ${errors.join('; ')}`, { cause });
  });

  await page.evaluate(() => largeTableTest.select('Text outside the large table.'));
  const small = editor.locator('.cm-live-table').filter({ hasText: 'cell A' });
  await small.locator('table').waitFor();
  assert.equal(await small.locator('.cm-editor').count(), 4, 'small tables keep inline editing');
  assert.deepEqual(errors, []);
  console.log(`PASS ${engine}: ${count + 1} rendered large-table rows, single lazy inline cell, exact pointer/drag, Tab/undo, explicit source and return`);
} finally {
  await browser?.close();
  server.httpServer.closeAllConnections?.();
  await server.close();
}
