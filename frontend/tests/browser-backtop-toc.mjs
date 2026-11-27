// Real application layout with synthetic documents and an isolated bridge.
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import {createServer} from 'vite';

const playwright = createRequire(import.meta.url)(process.env.PLAYWRIGHT_MODULE || 'playwright');
const engine = process.env.BACKTOP_BROWSER || 'chromium';
const baseline = process.env.BACKTOP_BASELINE === '1';
const server = await createServer({
  root: fileURLToPath(new URL('..', import.meta.url)),
  server: {host: '127.0.0.1', port: 0, watch: null, hmr: false}, logLevel: 'error',
  plugins: [{name: 'backtop-toc-test-only', enforce: 'pre', transform(code, id) {
    const path = id.replaceAll('\\', '/');
    if (path.endsWith('/src/renderer.js')) return code + '\nwindow.backtopAudit = {open: displayDocument, width: setPaneWidth};';
    if (baseline && path.endsWith('/src/styles.css')) return code.replaceAll('.toc-panel:is(.hidden, .collapsed)', '.toc-panel.hidden');
  }}]
});
let browser;
try {
  await server.listen();
  browser = await playwright[engine].launch({headless: true,
    ...(engine === 'chromium' ? {ignoreDefaultArgs:['--hide-scrollbars']} : {}),
    ...(engine === 'chromium' && process.env.BROWSER_EXECUTABLE ? {executablePath: process.env.BROWSER_EXECUTABLE} : {})});
  const page = await browser.newPage({viewport: {width: 1500, height: 900}});
  page.setDefaultTimeout(10000);
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.route('**/*', route => new URL(route.request().url()).hostname === '127.0.0.1' ? route.continue() : route.abort());
  await page.addInitScript(() => {
    localStorage.setItem('language', 'en');
    localStorage.setItem('sidebarCollapsed', 'true');
    if (localStorage.getItem('tocPanelCollapsed') === null) localStorage.setItem('tocPanelCollapsed', 'false');
  });
  await page.goto(server.resolvedUrls.local[0]);
  await page.waitForFunction(() => window.backtopAudit && window.quilliteMarkdown && document.querySelector('#fileList')?.childElementCount);
  const source = '# Back-to-top layout\n\n' + Array.from({length: 70}, (_, i) => `## Section ${i}\n\n${'Synthetic reading text. '.repeat(15)}\n\n`).join('');
  const open = async content => page.evaluate(content => {
    window.quilliteMarkdown.reportErrorLog = async () => {};
    return backtopAudit.open({path: '/backtop-test/document.md', name: 'document.md', directory: '/backtop-test', content, revision: 'a'.repeat(64)});
  }, content);
  const scroll = async () => {
    await page.locator('.reader-pane').evaluate(el => { el.scrollTop = 1100; el.dispatchEvent(new Event('scroll')); });
    await page.waitForFunction(() => document.querySelector('#backToTop').classList.contains('visible'));
  };
  const metrics = () => page.evaluate(() => {
    const button = document.querySelector('#backToTop').getBoundingClientRect();
    const panel = document.querySelector('#tocPanel').getBoundingClientRect();
    return {rightGap: innerWidth - button.right, left: button.left, right: button.right,
      panelLeft: panel.left, panelWidth: panel.width,
      tocWidth: parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--toc-width'))};
  });
  const waitGap = async expected => page.waitForFunction(expected => {
    const r = document.querySelector('#backToTop').getBoundingClientRect();
    return Math.abs(innerWidth - r.right - expected) < 1;
  }, expected, {timeout: 5000});
  const checkExpanded = async () => {
    await page.waitForFunction(() => {
      const panel = document.querySelector('#tocPanel');
      return !panel.classList.contains('collapsed') && panel.getBoundingClientRect().width > 100;
    });
    const width = (await metrics()).tocWidth;
    await waitGap(width + 24);
    const m = await metrics();
    assert.ok(Math.abs(m.panelLeft - m.right - 24) < 1, JSON.stringify(m));
    return m;
  };

  await open(source); await scroll();
  const original = await checkExpanded();
  // Reading scrolls the panel itself; editing scrolls only the navigation inside it.
  async function checkThumb(selector, captureLabel) {
    const node = page.locator(selector);
    const stats = () => node.evaluate(el => {
      const thumb = getComputedStyle(el, '::-webkit-scrollbar-thumb');
      const ctx = document.createElement('canvas').getContext('2d');
      ctx.fillStyle = thumb.backgroundColor; ctx.fillRect(0, 0, 1, 1);
      return {alpha: ctx.getImageData(0, 0, 1, 1).data[3]/255,
        rail: parseFloat(getComputedStyle(el, '::-webkit-scrollbar').width),
        border: parseFloat(thumb.borderLeftWidth), width: el.clientWidth,
        top: el.scrollTop, overflowing: el.scrollHeight > el.clientHeight};
    });
    await page.evaluate(() => document.activeElement?.blur());
    await page.mouse.move(30, 25); await page.waitForTimeout(250);
    const idle = await stats();
    assert.ok(idle.overflowing && idle.alpha > 0 && idle.alpha < .15, JSON.stringify(idle));
    assert.equal(idle.rail - 2 * idle.border, 6);
    if (captureLabel && process.env.SCROLLBAR_CAPTURE) await page.locator('#tocPanel').screenshot({path:process.env.SCROLLBAR_CAPTURE+'/'+captureLabel+'-idle.png'});
    await page.locator('#tocPanel').hover(); await page.waitForTimeout(250);
    const hover = await stats();
    assert.ok(hover.alpha > idle.alpha + .4); assert.equal(hover.width, idle.width);
    if (captureLabel && process.env.SCROLLBAR_CAPTURE) await page.locator('#tocPanel').screenshot({path:process.env.SCROLLBAR_CAPTURE+'/'+captureLabel+'-hover.png'});
    await page.mouse.move(30, 25); await page.waitForTimeout(250);
    assert.deepEqual(await stats(), idle);
  }
  if (engine === 'chromium') {
    const oldMode = await page.evaluate(() => document.documentElement.dataset.colorMode);
    for (const mode of ['light','dark']) {
      await page.evaluate(m => document.documentElement.dataset.colorMode = m, mode);
      await checkThumb('#tocPanel','outline-'+mode);
    }
    await page.evaluate(m => {if(m) document.documentElement.dataset.colorMode=m; else delete document.documentElement.dataset.colorMode;},oldMode);
  }
  await page.locator('#closeCompactToc').click();
  await page.waitForFunction(() => document.querySelector('#tocPanel').classList.contains('collapsed'));
  await waitGap(24);
  const collapsed = await metrics();
  assert.ok(collapsed.left > original.left + 100, 'collapsed TOC must move the button toward the right edge');
  await page.locator('#compactTocButton').click();
  await checkExpanded();

  await page.evaluate(() => backtopAudit.width('toc', 320));
  const smaller = await checkExpanded();
  await page.evaluate(() => backtopAudit.width('toc', 440));
  const larger = await checkExpanded();
  assert.ok(larger.panelWidth > smaller.panelWidth + 50, 'fixture must actually resize the TOC');
  assert.ok(Math.abs((smaller.left - larger.left) - (larger.panelWidth - smaller.panelWidth)) < 1, 'expanded button tracks resized TOC width');
  const dragging = await page.evaluate(() => {
    document.body.classList.add('resizing-panes');
    const button = document.querySelector('#backToTop');
    // Flush the drag-state style before changing width, then measure in the
    // same task: a delayed right transition must not lag behind the pane.
    const durations = getComputedStyle(button).transitionDuration.split(',').map(value => parseFloat(value));
    backtopAudit.width('toc', 360);
    const bounds = button.getBoundingClientRect();
    const panel = document.querySelector('#tocPanel').getBoundingClientRect();
    const width = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--toc-width'));
    document.body.classList.remove('resizing-panes');
    return {durations, rightGap: innerWidth - bounds.right, panelGap: panel.left - bounds.right, width};
  });
  assert.ok(dragging.durations.every(duration => duration === 0), 'drag state disables every button transition');
  assert.ok(Math.abs(dragging.rightGap - dragging.width - 24) < 1, 'dragged width moves the button immediately');
  assert.ok(Math.abs(dragging.panelGap - 24) < 1, 'dragged pane and button keep their gap without animation lag');
  await page.emulateMedia({reducedMotion: 'reduce'});
  const reduced = await page.locator('#backToTop').evaluate(el => getComputedStyle(el).transitionDuration.split(',').map(value => {
    const number = parseFloat(value); return value.trim().endsWith('ms') ? number / 1000 : number;
  }));
  assert.ok(reduced.every(duration => duration <= .000011), 'reduced-motion preference removes perceptible button transitions');
  await page.emulateMedia({reducedMotion: 'no-preference'});
  await page.locator('#closeCompactToc').click(); await waitGap(24);
  await page.reload();
  await page.waitForFunction(() => window.backtopAudit && window.quilliteMarkdown && document.querySelector('#fileList')?.childElementCount);
  await open(source); await scroll();
  assert.equal(await page.locator('#tocPanel').evaluate(el => el.classList.contains('collapsed')), true);
  await waitGap(24);

  await page.setViewportSize({width: 980, height: 800});
  await waitGap(24);
  await page.locator('#compactTocButton').click();
  await page.waitForFunction(() => document.querySelector('#tocPanel').classList.contains('compact-open'));
  await waitGap(24);
  const narrow = await metrics();
  if (engine === 'chromium') await checkThumb('#tocPanel');
  assert.ok(narrow.left >= 0 && narrow.right <= 980, 'narrow-layout button stays within the viewport');
  await page.locator('#compactTocButton').click();
  await page.locator('#backToTop').click();
  await page.waitForFunction(() => document.querySelector('.reader-pane').scrollTop < 1);

  await page.setViewportSize({width: 1500, height: 900});
  await open('No headings.\n\n' + 'Synthetic paragraph without headings.\n\n'.repeat(160));
  await scroll();
  assert.equal(await page.locator('#tocPanel').evaluate(el => el.classList.contains('hidden')), true);
  await waitGap(24);
  assert.deepEqual(errors, []);
  if (engine === 'chromium') {
    await page.evaluate(() => {window.quilliteMarkdown.canEditFile = async () => true;});
    await open(source); await page.locator('#editButton').click();
    await page.locator('.editor-outline-mode #markdownEditor > .cm-editor').waitFor();
    await page.locator('#compactTocButton').click();
    await page.waitForFunction(() => document.querySelector('.editor-outline-mode .toc-panel.compact-open'));
    await checkThumb('#toc');
    console.log('PASS 6px outline scrollbar: light/dark, hover/leave, stable geometry, compact reading and editor navigation');
  }
  console.log(`PASS ${engine}: wide collapse/reopen/resize, immediate drag tracking, reduced motion, persisted collapse, compact overlay, hidden TOC, and scroll-to-top; baseline=${baseline}`);
} finally { await browser?.close(); await server.close(); }
