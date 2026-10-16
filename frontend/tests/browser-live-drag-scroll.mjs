// Explicit user authorization: standalone browser, isolated fixture only.
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const server = await createServer({ root: fileURLToPath(new URL('..', import.meta.url)), server: { host: '127.0.0.1', port: 0, watch: null, hmr: false }, logLevel: 'error' });
let browser;
try {
  await server.listen();
  browser = await chromium.launch({ headless: true, executablePath: process.env.BROWSER_EXECUTABLE || undefined });
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.goto(server.resolvedUrls.local[0] + 'tests/fixtures/live-editing-audit.html');
  await page.getByRole('button', { name: '加载长文拖选样例' }).click();
  const source = await page.getByLabel('当前源码', { exact: true }).textContent();
  const scroller = page.locator('#editor > .cm-editor > .cm-scroller');
  const measure = () => scroller.evaluate(el => ({ top: el.scrollTop, height: el.clientHeight, total: el.scrollHeight }));
  const selected = async () => JSON.parse(await page.getByLabel('选区状态', { exact: true }).textContent());
  const textPoint = (locator, index) => locator.evaluate((el, offset) => {
    const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
    let node;
    while ((node = walker.nextNode())) {
      if (offset <= node.length) {
        const range = document.createRange(); range.setStart(node, offset); range.collapse(true);
        const rect = range.getBoundingClientRect(); return { x: rect.x, y: rect.y + rect.height / 2 };
      }
      offset -= node.length;
    }
    throw new Error('Missing text position');
  }, index);
  // Deliberately hold the pointer still for a timed auto-scroll observation.
  const hold = () => page.waitForTimeout(600);
  const save = async name => { if (process.env.AUDIT_OUTPUT) await page.screenshot({ path: `${process.env.AUDIT_OUTPUT}/${name}.png` }); };
  const box = await scroller.boundingBox();
  const start = await textPoint(page.getByRole('textbox', { name: 'Code content', exact: true }).getByText('DEF', { exact: true }), 2);
  await save('01-long-start');
  await page.mouse.move(start.x, start.y); await page.mouse.down();
  await page.mouse.move(start.x, box.y + box.height - 4, { steps: 25 });
  const before = await measure(), initialSelection = await selected();
  await hold();
  const after = await measure(), finalSelection = await selected();
  await save('02-drag-held');
  await page.mouse.up();
  console.log(JSON.stringify({ stage:'down-held', before, after, initialSelection, finalSelection }));
  assert.ok(after.top > before.top + 50, 'Holding at bottom edge must continue scrolling');
  assert.ok(finalSelection.head > initialSelection.head, 'Selection must extend while scrolling');
  assert.equal(finalSelection.anchor, source.indexOf('F'));
  assert.equal(await page.getByLabel('当前源码', { exact: true }).textContent(), source);
  const released = await measure(), releasedSelection = await selected();
  await hold();
  assert.equal((await measure()).top, released.top, 'Mouseup stops auto-scroll');
  assert.deepEqual(await selected(), releasedSelection, 'Mouseup stops selection changes');
  console.log('Downward drag, stable anchor, unchanged source and mouseup cancellation passed.');

  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.wheel(0, 20000);
  await page.waitForFunction(() => {
    const el = document.querySelector('#editor > .cm-editor > .cm-scroller');
    return el.scrollTop + el.clientHeight >= el.scrollHeight - 2;
  });
  const bottomStart = await textPoint(page.getByRole('textbox', { name: 'Code content', exact: true }).getByText('UVW', { exact: true }), 2);
  await page.mouse.move(bottomStart.x, bottomStart.y); await page.mouse.down();
  await page.mouse.move(bottomStart.x, box.y + 4, { steps: 25 });
  const upBefore = await measure(), upSelectionBefore = await selected();
  await hold();
  const upAfter = await measure(), upSelectionAfter = await selected();
  await save('03-up-held');
  await page.mouse.up();
  console.log(JSON.stringify({ stage:'up-held', before:upBefore, after:upAfter, initialSelection:upSelectionBefore, finalSelection:upSelectionAfter }));
  assert.ok(upAfter.top < upBefore.top - 50, 'Holding at top edge continues upward scrolling');
  assert.ok(upSelectionAfter.head < upSelectionBefore.head);
  assert.equal(upSelectionAfter.anchor, source.lastIndexOf('W'));
  assert.equal(await page.getByLabel('当前源码', { exact: true }).textContent(), source);
  console.log('Upward drag, stable anchor and unchanged source passed.');

  const startDown = async () => {
    await page.getByRole('button', { name: '加载长文拖选样例' }).click();
    const p = await textPoint(page.getByRole('textbox', { name: 'Code content', exact: true }).getByText('DEF', { exact: true }), 2);
    await page.mouse.move(p.x,p.y); await page.mouse.down();
    // Go beyond the editor edge, but stay inside the browser viewport.
    await page.mouse.move(p.x,box.y + box.height + 15,{steps:25});
    await hold();
  };
  await startDown();
  assert.ok((await measure()).top > 50, 'Dragging outside the editor still scrolls');
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2, {steps:5});
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  const middle = await measure();
  await hold();
  assert.equal((await measure()).top, middle.top, 'Moving away from edge stops scrolling');
  await page.mouse.move(box.x + box.width / 2, box.y + box.height + 15, {steps:5});
  await hold();
  assert.ok((await measure()).top > middle.top + 50, 'Returning to edge resumes scrolling');
  await page.keyboard.press('Escape');
  const escaped = await measure(), escapedSelection = await selected();
  await hold();
  assert.equal((await measure()).top, escaped.top);
  assert.deepEqual(await selected(), escapedSelection);
  await page.mouse.up();
  assert.equal(await page.getByLabel('当前源码', { exact: true }).textContent(), source);
  console.log('Outside-edge scrolling and Escape cancellation passed.');

  await startDown();
  await page.keyboard.type('x');
  // Let pending layout/selection measurement settle before checking for drift.
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  const changed = await page.getByLabel('当前源码', { exact: true }).textContent();
  assert.notEqual(changed, source); assert.ok(changed.includes('DEx\n```'));
  const changedScroll = await measure(), changedSelection = await selected();
  await hold();
  assert.equal((await measure()).top, changedScroll.top);
  assert.deepEqual(await selected(), changedSelection);
  await page.mouse.up();
  await page.keyboard.press('Control+z');
  assert.equal(await page.getByLabel('当前源码', { exact: true }).textContent(), source);
  console.log('Document change cancels pending drag; replacement keeps fence and undo restores source.');
  assert.deepEqual(errors, []);
} finally { await browser?.close(); await server.close(); }
