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
  const page = await browser.newPage({ viewport: { width: 1280, height: 950 } }), errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(server.resolvedUrls.local[0]);
  await page.waitForFunction(() => window.quilliteMarkdown && document.querySelector('#fileList')?.childElementCount);
  await page.evaluate(() => Object.assign(window.quilliteMarkdown, {
    openFile: async () => ({ path: '/newline.md', name: 'newline.md', directory: '/', content: '# 我是标题\n我是正文\n**我要加粗**\n*我要斜*\n~~我要中划线~~', revision: 'a'.repeat(64) }),
    canEditFile: async () => true,
    saveFile: async (path, content) => ({ path, name: 'newline.md', directory: '/', content, revision: 'b'.repeat(64) }),
  }));
  await page.locator('#openFileButton').click(); await page.locator('#editButton').click();
  await page.locator('#hideLivePreviewButton').click();
  await page.evaluate(async () => {
    const { EditorView } = await import('/node_modules/@codemirror/view/dist/index.js');
    window.newlineAudit = EditorView.findFromDOM(document.querySelector('#markdownEditor > .cm-editor'));
  });
  const formats = [ ['~~', '~~'], ['**', '**'], ['*', '*'], ['***', '***'], ['==', '=='], ['`', '`'], ['<u>', '</u>'], ['[', '](https://example.com)'], ['**~~', '~~**'], ['<span data-md-color="spectrum-3-red">', '</span>'] ];
  // The reported case has several soft-broken lines in the same paragraph.
  // A stray == line turns that entire paragraph into a Setext heading.
  const screenshotPrefix = '# 我是标题\n我是正文\n**我要加粗**\n*我要斜*\n~~我要中划线~~ \n';
  for (const suffix of ['', '\n<span data-md-color="spectrum-3-red">我要颜色</span>\n\n']) {
  for (const finish of ['direct', 'click', 'ArrowRight', 'End']) {
    await page.evaluate(({ prefix, suffix }) => {
      const v = newlineAudit;
      v.dispatch({ changes: { from: 0, to: v.state.doc.length, insert: prefix + '我要底色' + suffix }, selection: { anchor: prefix.length, head: prefix.length + 4 } }); v.focus();
    }, { prefix: screenshotPrefix, suffix });
    await page.locator('[data-format="highlight"]').first().click();
    await page.waitForFunction(({ prefix, suffix }) => newlineAudit.state.doc.toString() === prefix + '==我要底色==' + suffix, { prefix: screenshotPrefix, suffix });
    if (finish === 'click') {
      await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
      const p = await page.evaluate(pos => { const r = newlineAudit.coordsAtPos(pos); return { x: r.left + .2, y: (r.top + r.bottom) / 2 }; }, screenshotPrefix.length + 6);
      await page.mouse.click(p.x, p.y);
    } else if (finish !== 'direct') await page.keyboard.press(finish);
    await page.keyboard.press('Enter');
    assert.equal(await page.evaluate(() => newlineAudit.state.doc.toString()), screenshotPrefix + '==我要底色==\n' + suffix, `multi-line highlight ${finish}`);
    assert.equal(await page.locator('#markdownEditor .cm-live-heading').count(), 1, 'only the original title stays a heading');
    assert.equal(await page.locator('#markdownEditor .cm-live-highlight').innerText(), '我要底色');
  }
  }
  // No click/arrow after formatting: Enter must not replace the toolbar's
  // retained selection with a newline and leave orphan == / ** delimiters.
  for (const [command, open, close] of [['bold', '**', '**'], ['italic', '*', '*'], ['strikethrough', '~~', '~~'], ['highlight', '==', '=='], ['highlight-bold', '==**', '**=='], ['inline-code', '`', '`'], ['color', '<span data-md-color="spectrum-3-red">', '</span>']]) {
    const prefix = screenshotPrefix + '==阿萨德发啊==\n==ASdaS==\n';
    await page.evaluate(prefix => { const v = newlineAudit; v.dispatch({ changes: { from: 0, to: v.state.doc.length, insert: prefix + 'SADFAS' }, selection: { anchor: prefix.length, head: prefix.length + 6 } }); v.focus(); }, prefix);
    if (command === 'color') {
      await page.locator('#textColorButton').click();
      await page.locator('[data-text-color="spectrum-3-red"]').click();
    } else if (command === 'highlight-bold') {
      await page.locator('[data-format="highlight"]').first().click();
      await page.locator('[data-format="bold"]').first().click();
    } else await page.locator(`[data-format="${command}"]`).first().click();
    await page.keyboard.press('Enter');
    const formatted = prefix + open + 'SADFAS' + close;
    assert.equal(await page.evaluate(() => newlineAudit.state.doc.toString()), formatted + '\n', `${command} immediate Enter keeps selected content`);
    assert.equal(await page.locator('#markdownEditor .cm-live-heading').count(), 1);
    await page.keyboard.press('Control+z');
    assert.equal(await page.evaluate(() => newlineAudit.state.doc.toString()), formatted);
    await page.keyboard.press('Control+y');
    assert.equal(await page.evaluate(() => newlineAudit.state.doc.toString()), formatted + '\n');
  }
  for (const [open, close] of formats) {
    for (const prefix of ['', '### ', '- ', '> ']) {
      const source = prefix + open + '格式文字' + close;
      await page.evaluate(source => { const v = newlineAudit; v.dispatch({ changes: { from: 0, to: v.state.doc.length, insert: source }, selection: { anchor: 0 } }); }, source);
      await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
      const point = await page.evaluate(pos => { const r = newlineAudit.coordsAtPos(pos); return { x: r.left + .2, y: (r.top + r.bottom) / 2 }; }, prefix.length + open.length + 4);
      await page.mouse.click(point.x, point.y);
      await page.keyboard.press('Enter');
      const continuation = prefix === '- ' ? '- ' : prefix === '> ' ? '> ' : '';
      assert.equal(await page.evaluate(() => newlineAudit.state.doc.toString()), source + '\n' + continuation, `${open}: ${prefix} Enter`);
      await page.keyboard.insertText('新行');
      assert.equal(await page.evaluate(() => newlineAudit.state.doc.toString()), source + '\n' + continuation + '新行');
      await page.keyboard.press('Control+z');
      assert.equal(await page.evaluate(() => newlineAudit.state.doc.toString()), source + '\n' + continuation, 'typing undo does not remove newline');
      await page.keyboard.press('Control+z');
      assert.equal(await page.evaluate(() => newlineAudit.state.doc.toString()), source, 'newline undoes in one step');
      await page.keyboard.press('Control+y');
      assert.equal(await page.evaluate(() => newlineAudit.state.doc.toString()), source + '\n' + continuation);
    }
  }
  // Reproduce toolbar -> click visible end -> Enter, not only preloaded Markdown.
  await page.evaluate(() => { const v = newlineAudit; v.dispatch({ changes: { from: 0, to: v.state.doc.length, insert: '我要中划线' }, selection: { anchor: 0, head: 5 } }); v.focus(); });
  await page.locator('[data-format="strikethrough"]').first().click();
  await page.waitForFunction(() => newlineAudit.state.doc.toString() === '~~我要中划线~~');
  const end = await page.evaluate(() => { const r = newlineAudit.coordsAtPos(7); return { x: r.left + .2, y: (r.top + r.bottom) / 2 }; });
  await page.mouse.click(end.x, end.y); await page.keyboard.press('Enter');
  assert.equal(await page.evaluate(() => newlineAudit.state.doc.toString()), '~~我要中划线~~\n');
  await page.keyboard.insertText('下一行');
  assert.equal(await page.locator('.cm-live-strike').innerText(), '我要中划线');
  for (const label of ['我要颜色', '**我要颜色**', '==我要颜色==']) {
    const prefix = screenshotPrefix + '==我要底色==\n';
    await page.evaluate(({ prefix, label }) => { const v = newlineAudit; v.dispatch({ changes: { from: 0, to: v.state.doc.length, insert: prefix + label }, selection: { anchor: prefix.length, head: prefix.length + label.length } }); v.focus(); }, { prefix, label });
    await page.locator('#textColorButton').click();
    await page.locator('[data-text-color="spectrum-3-red"]').click();
    const colored = '<span data-md-color="spectrum-3-red">' + label + '</span>';
    await page.waitForFunction(source => newlineAudit.state.doc.toString() === source, prefix + colored);
    const colorText = page.locator('#markdownEditor .cm-live-color');
    assert.equal(await colorText.innerText(), '我要颜色');
    assert.ok(!(await page.locator('#markdownEditor > .cm-editor .cm-content').innerText()).includes('data-md-color'));
    const colors = await colorText.evaluate(el => [el, ...el.querySelectorAll('span')].map(span => getComputedStyle(span).color));
    assert.ok(colors.every(color => color === 'rgb(197, 27, 27)'), JSON.stringify(colors));
    await page.keyboard.press('ArrowRight');
    await page.keyboard.insertText('字');
    assert.equal(await page.evaluate(() => newlineAudit.state.doc.toString()), prefix + colored.replace('</span>', '字</span>'));
    await page.keyboard.press('Control+z');
    assert.equal(await page.evaluate(() => newlineAudit.state.doc.toString()), prefix + colored);
    await page.keyboard.press('Enter');
    assert.equal(await page.evaluate(() => newlineAudit.state.doc.toString()), prefix + colored + '\n');
    await page.keyboard.insertText('正常换行');
    assert.equal(await page.evaluate(() => newlineAudit.state.doc.toString()), prefix + colored + '\n正常换行');
    await page.keyboard.press('Control+z'); await page.keyboard.press('Control+z');
    assert.equal(await page.evaluate(() => newlineAudit.state.doc.toString()), prefix + colored);
  }
  if (process.env.COLOR_SCREENSHOT) await page.screenshot({ path: process.env.COLOR_SCREENSHOT });
  await page.locator('[data-editor-presentation="source"]').click();
  await page.evaluate(() => { const v = newlineAudit; v.dispatch({ changes: { from: 0, to: v.state.doc.length, insert: '~~内容~~' }, selection: { anchor: 4 } }); v.focus(); });
  await page.keyboard.press('Enter');
  assert.equal(await page.evaluate(() => newlineAudit.state.doc.toString()), '~~内容\n~~', 'source mode retains literal behavior');
  assert.deepEqual(errors, []);
  console.log('PASS: 7 immediate-toolbar-Enter cases, 8 multi-line highlight cases, 40 live-format/newline combinations, text colors, list/quote continuation, undo/redo and source mode');
} finally { await browser.close(); await server.close(); }
