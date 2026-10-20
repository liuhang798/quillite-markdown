// Real application regression; external requests and desktop writes are disabled.
// PLAYWRIGHT_MODULE and BROWSER_EXECUTABLE may point to existing local runtimes.
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';
import assert from 'node:assert/strict';
import { join } from 'node:path';
const { chromium } = createRequire(import.meta.url)(process.env.PLAYWRIGHT_MODULE || 'playwright');
const server = await createServer({
  root: fileURLToPath(new URL('..', import.meta.url)),
  server: { host: '127.0.0.1', port: 0, hmr: false, watch: null }, logLevel: 'error',
  plugins: [{
    name: 'typography-test', enforce: 'pre',
    transform(code, id) {
      if (id.replaceAll('\\', '/').endsWith('/src/renderer.js')) return code + '\nwindow.typographyTest={open:displayDocument,toggle:toggleEditor,settings:openTypographySettings,state,get editor(){return codeEditor}};';
    }
  }]
});
let browser;
try {
  await server.listen();
  browser = await chromium.launch({ headless: true, executablePath: process.env.BROWSER_EXECUTABLE });
  const page = await browser.newPage({ viewport: { width: 1400, height: 950 } });
  await page.route('**/*', route => new URL(route.request().url()).hostname === '127.0.0.1' ? route.continue() : route.abort());
  await page.goto(server.resolvedUrls.local[0] + 'tests/fixtures/app-drag-audit.html');
  const app = page.frameLocator('iframe');
  await app.locator('body').evaluate(async () => {
    await import('/src/main.js');
    window.quilliteMarkdown.canEditFile = async () => true;
    await typographyTest.open({ path: 'C:\\Test\\排版.md', name: '排版.md', directory: 'C:\\Test',
      content: '# 排版测试\n\n普通正文 `inline code` 测试。\n下一行正文。\n\n> 引用正文。\n\n```js\nconst x = 1;\n```\n\n末尾正文。' });
    await typographyTest.toggle();
  });
  await app.locator('.cm-live-inline-code').waitFor();
  if (await app.locator('#restoreLivePreviewButton').isVisible()) await app.locator('#restoreLivePreviewButton').click();
  await app.locator('#editorPreviewContent code').first().waitFor();
  const original = await app.locator('body').evaluate(() => typographyTest.editor.state.doc.toString());
  for (const theme of ['light', 'dark']) {
    const currentMode = await app.locator('html').getAttribute('data-color-mode');
    if (currentMode !== theme) await app.locator('#colorModeButton').click();
    assert.equal(await app.locator('html').getAttribute('data-color-mode'), theme);
    await app.locator('body').evaluate(() => typographyTest.settings());
    for (const [preset, factor] of Object.entries({ compact: 1.5, standard: 1.86, relaxed: 2, loose: 2.25 })) {
      await app.locator('#bodyLineSpacing').selectOption(preset);
      const result = await app.locator('body').evaluate(() => {
        const reader = document.querySelector('#editorPreviewContent');
        const code = reader.querySelector('p code');
        const live = document.querySelector('.cm-live-inline-code');
        const ratio = el => { const s = getComputedStyle(el); return parseFloat(s.lineHeight) / parseFloat(s.fontSize); };
        return {
          reader: ratio(reader), live: ratio(live.closest('.cm-line')),
          readerBg: getComputedStyle(code).backgroundColor, liveBg: getComputedStyle(live).backgroundColor,
          readerColor: getComputedStyle(code).color, liveColor: getComputedStyle(live).color,
          liveChildColors: [...live.querySelectorAll('span')].map(el => getComputedStyle(el).color),
          source: typographyTest.editor.state.doc.toString(),
          saved: typographyTest.state.bodyTypography.lineSpacing
        };
      });
      assert.ok(Math.abs(result.reader - factor) < .01, JSON.stringify(result));
      assert.ok(Math.abs(result.live - factor) < .01, JSON.stringify(result));
      assert.equal(result.readerBg, result.liveBg);
      assert.notEqual(result.readerBg, 'rgba(0, 0, 0, 0)');
      assert.equal(result.readerColor, result.liveColor);
      assert.ok(result.liveChildColors.every(color => color === result.readerColor));
      assert.equal(result.source, original);
      assert.equal(result.saved, 'standard', 'preview must not persist');
    }
    if (process.env.TYPOGRAPHY_SCREENSHOT_DIR) {
      await page.screenshot({ path: join(process.env.TYPOGRAPHY_SCREENSHOT_DIR, `typography-${theme}.png`) });
    }
    await app.locator('#cancelTypography').click();
    assert.equal(await app.locator('html').evaluate(el => el.style.getPropertyValue('--body-line-height')), '1.86');
    console.log(`PASS ${theme}: four spacing presets, inline code colors, no document mutation, cancel restores`);
  }
  await app.locator('body').evaluate(() => typographyTest.settings());
  await app.locator('#bodyLineSpacing').selectOption('relaxed');
  await app.locator('#bodyStyle').selectOption('book');
  await app.locator('#saveTypography').click();
  await app.locator('#typographyDialog').waitFor({ state: 'hidden' });
  const saved = await app.locator('body').evaluate(() => JSON.parse(localStorage.getItem('bodyTypography')));
  assert.equal(saved.lineSpacing, 'relaxed');
  assert.equal(saved.chineseFont, 'songti');
  await page.reload();
  await app.locator('body').evaluate(async () => { await import('/src/main.js'); });
  await app.locator('body').evaluate(() => typographyTest.settings());
  assert.equal(await app.locator('#bodyLineSpacing').inputValue(), 'relaxed');
  console.log('PASS save and reload preserve independent line spacing');
} finally {
  await browser?.close();
  await server.close();
}
