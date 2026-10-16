// Run only with explicit user authorization for isolated browser automation.
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const server = await createServer({ root: fileURLToPath(new URL('..', import.meta.url)), server: { host: '127.0.0.1', port: 0, watch: null, hmr: false }, logLevel: 'error' });
await server.listen();
const browser = await chromium.launch({ headless: true, executablePath: process.env.BROWSER_EXECUTABLE || undefined });
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.route('**/*', route => new URL(route.request().url()).hostname === '127.0.0.1' ? route.continue() : route.abort());
  await page.goto(server.resolvedUrls.local[0] + 'tests/fixtures/live-editing-audit.html');
  await page.getByRole('button', { name: '加载跨块选择样例' }).click();
  const source = await page.getByLabel('当前源码', { exact: true }).textContent();
  const characterPoint = (locator, offset) => locator.evaluate((el, index) => {
    const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
    let node;
    while ((node = walker.nextNode())) {
      if (index <= node.textContent.length) {
        const range = document.createRange(); range.setStart(node, index); range.collapse(true);
        const rect = range.getBoundingClientRect(); return { x: rect.x, y: rect.y + rect.height / 2 };
      }
      index -= node.textContent.length;
    }
    throw new Error('Missing visible text offset');
  }, offset);
  const code = page.getByRole('textbox', { name: 'Code content', exact: true });
  await code.scrollIntoViewIfNeeded();
  const start = await characterPoint(code.getByText('DEF', { exact: true }), 2);
  const end = await characterPoint(page.getByText('后文', { exact: true }), 2);
  await page.mouse.move(start.x, start.y); await page.mouse.down();
  await page.mouse.move(end.x, end.y, { steps: 20 }); await page.mouse.up();
  // Two animation frames allow the editor's measured selection layer to settle.
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  const selection = JSON.parse(await page.getByLabel('选区状态', { exact: true }).textContent());
  console.log(JSON.stringify({ stage: 'drag-code-to-prose', selection }));
  if (process.env.AUDIT_OUTPUT) await page.screenshot({ path: `${process.env.AUDIT_OUTPUT}/10-drag-selection.png` });
  assert.equal(selection.anchor, source.indexOf('F'));
  assert.equal(selection.head, source.indexOf('后文') + 2);
  assert.equal(selection.cross, true);
  await page.keyboard.type('x');
  assert.equal(await page.getByLabel('当前源码', { exact: true }).textContent(), source.replace('DEF', 'DEx').replace('后文\n\n', ''));
  await page.keyboard.press('Control+z');
  assert.equal(await page.getByLabel('当前源码', { exact: true }).textContent(), source);
  const drag = async (from, fromOffset, to, toOffset) => {
    const a = await characterPoint(from, fromOffset), b = await characterPoint(to, toOffset);
    await page.mouse.move(a.x, a.y); await page.mouse.down();
    await page.mouse.move(b.x, b.y, { steps: 25 }); await page.mouse.up();
    await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    return JSON.parse(await page.getByLabel('选区状态', { exact: true }).textContent());
  };
  const read = () => page.getByLabel('当前源码', { exact: true }).textContent();
  // Reset explicitly so the previous undo selection is not a text drag source.
  await page.getByRole('button', { name: '加载跨块选择样例' }).click();
  let next = await drag(page.getByText('后文', { exact: true }), 2, code.getByText('ABC', { exact: true }), 1);
  assert.equal(next.anchor, source.indexOf('后文') + 2); assert.equal(next.head, source.indexOf('ABC') + 1);
  await page.keyboard.type('x');
  assert.equal(await read(), '前文\n\n```text\nAx\n```\n\n结束');
  await page.keyboard.press('Control+z'); assert.equal(await read(), source);
  console.log('Reverse prose-to-code drag, typing and undo passed.');

  await page.getByRole('button', { name: '加载跨块选择样例' }).click();
  next = await drag(code.getByText('ABC', { exact: true }), 1, code.getByText('DEF', { exact: true }), 2);
  assert.equal(next.anchor, source.indexOf('ABC') + 1); assert.equal(next.head, source.indexOf('DEF') + 2);
  await page.keyboard.type('x'); assert.equal(await read(), source.replace('ABC\nDEF', 'AxF'));
  await page.keyboard.press('Control+z'); assert.equal(await read(), source);
  console.log('Same-code native drag, typing and undo passed.');

  await page.reload();
  const tableSource = await read();
  const firstCell = page.getByRole('textbox', { name: 'Table cell 2, 1', exact: true });
  const secondCell = page.getByRole('textbox', { name: 'Table cell 2, 2', exact: true });
  await firstCell.scrollIntoViewIfNeeded();
  next = await drag(firstCell.getByText('中文', { exact: true }), 1, secondCell.getByText('2', { exact: true }), 1);
  assert.equal(next.anchor, tableSource.indexOf('中文') + 1); assert.equal(next.head, tableSource.indexOf('| 中文 | 2 |') + 8);
  await page.keyboard.type('x'); assert.equal(await read(), tableSource.replace('| 中文 | 2 |', '| 中x |  |'));
  await page.keyboard.press('Control+z'); assert.equal(await read(), tableSource);
  console.log('Cross-cell drag, typing and undo passed.');

  await page.getByRole('button', { name: '加载嵌套选择样例' }).click();
  const nestedSource = await read();
  await code.scrollIntoViewIfNeeded();
  next = await drag(code.getByText('DEF', { exact: true }), 2, page.getByText('后文', { exact: true }), 2);
  assert.equal(next.anchor, nestedSource.indexOf('F')); assert.equal(next.head, nestedSource.lastIndexOf('后文') + 2);
  if (process.env.AUDIT_OUTPUT) await page.screenshot({ path: `${process.env.AUDIT_OUTPUT}/11-nested-drag.png` });
  await page.keyboard.type('x');
  assert.equal(await read(), '前文\n\n<details open>\n<summary>混合</summary>\n\n```text\nABC\nDEx\n```\n\n</details>\n\n结束');
  await page.keyboard.press('Control+z'); assert.equal(await read(), nestedSource);
  console.log('Nested code-to-prose drag, typing and undo passed.');
  assert.deepEqual(errors, []);
  console.log('Cross-block drag, typing and undo passed.');
} finally { await browser.close(); await server.close(); }
