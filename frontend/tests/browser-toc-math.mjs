import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { realpathSync } from 'node:fs';
import { createServer } from 'vite';
const pw = createRequire(import.meta.url)(process.env.PLAYWRIGHT_MODULE || 'playwright');
const engine = process.env.BROWSER_ENGINE || 'chromium';
const root = fileURLToPath(new URL('..', import.meta.url));
const server = await createServer({ root, server: { host: '127.0.0.1', port: 0, watch: null, hmr: false, fs: { allow: [root, realpathSync(join(root, 'node_modules'))] } }, logLevel: 'error', plugins: [{
  name: 'toc-math-test', enforce: 'pre', transform(code, id) {
    if (id.replaceAll('\\', '/').endsWith('/src/renderer.js')) return code + `\nwindow.tocMathAudit = { ready: true, legacy: (text, index) => slugify(text, index), source: () => state.currentFile.content, editorSource: () => codeEditor.state.doc.toString(), editorSelection: () => codeEditor.state.selection.main.from, headings: () => currentEditorHeadings(), replace: text => codeEditor.dispatch({changes:{from:0,to:codeEditor.state.doc.length,insert:text}}), export: () => { const div=document.createElement('div'); renderMarkdownTo(div,state.currentFile,state.currentFile.content); return div.innerHTML; } };`;
  }
}] });
let browser;
const source = '# 目录公式测试\n\n[TOC]\n\n## 改进1：去掉 $VBB_{BB}$\n\n' + '正文段落。\n\n'.repeat(30)
  + '### 分式 $\\frac{a}{b}$ 与 \\(x^2\\)\n\n正文\n\n## 普通 `code` 与 [链接](https://example.org)\n\n## 错误 $\\frac{$\n\n## 安全 $\\href{javascript:alert(1)}{x}$\n\nEND';
try {
  await server.listen();
  browser = await pw[engine].launch({ headless: true, ...(engine === 'chromium' ? { executablePath: process.env.BROWSER_EXECUTABLE || undefined } : {}) });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const errors = []; page.on('pageerror', e => errors.push(e.message));
  await page.route('**/*', r => new URL(r.request().url()).hostname === '127.0.0.1' ? r.continue() : r.abort());
  await page.goto(server.resolvedUrls.local[0]); await page.waitForFunction(() => window.tocMathAudit?.ready);
  await page.evaluate(source => {
    window.quilliteMarkdown.openFile = async () => ({ path: '/toc-math.md', directory: '/', name: 'toc-math.md', content: source, revision: 'a'.repeat(64) });
    window.quilliteMarkdown.canEditFile = async () => true;
  }, source);
  await page.locator('#openFileButton').click();
  await page.waitForFunction(() => document.querySelector('#toc .katex'));
  const bodyHeadings = await page.locator('#markdownContent h1, #markdownContent h2, #markdownContent h3').evaluateAll(nodes => nodes.map((h, i) => ({ id: h.id, legacy: window.tocMathAudit.legacy(h.textContent, i) })));
  assert.ok(bodyHeadings.every(h => h.id === h.legacy), 'existing heading anchors unchanged');
  const first = page.locator('#toc a').filter({ hasText: '改进1' });
  assert.equal(await first.locator('.katex').count(), 1);
  assert.equal(await first.locator('.katex-mathml').evaluate(el => getComputedStyle(el).position), 'absolute');
  assert.equal(await page.locator('#toc a a, #toc img, #toc [data-math-origin]').count(), 0);
  const dynamic = page.locator('#markdownContent [data-dynamic-toc] a').filter({ hasText: '改进1' });
  assert.equal(await dynamic.locator('.katex').count(), 1);
  assert.equal(await dynamic.getAttribute('data-target'), await first.getAttribute('data-target'));
  await page.locator('#tocSearchInput').fill('VBB');
  assert.equal(await page.locator('#toc mark .katex').count(), 1);
  assert.equal(await page.locator('#toc a').count(), 2, 'ancestor retained');
  await page.locator('[data-toc-mode="flat"]').click();
  assert.equal(await page.locator('#toc a').count(), 1);
  await page.locator('#tocSearchInput').fill('');
  await page.locator('[data-toc-mode="tree"]').click();
  await first.click(); await page.waitForTimeout(450);
  assert.ok(await page.locator('.reader-pane').evaluate(el => el.scrollTop > 0));
  await page.locator('#colorModeButton').click();
  await page.evaluate(() => document.fonts.ready);
  assert.ok(await first.locator('.toc-math').evaluate(el => el.scrollWidth <= el.clientWidth), 'short equations must not gain a horizontal scrollbar');
  if (process.env.AUDIT_OUTPUT) await page.screenshot({ path: join(process.env.AUDIT_OUTPUT, `toc-math-${engine}.png`) });
  const exported = await page.evaluate(() => window.tocMathAudit.export());
  assert.match(exported, /toc-math/);
  assert.equal(await page.evaluate(() => window.tocMathAudit.source()), source);
  await page.locator('#editButton').click(); await page.locator('.cm-editor').waitFor();
  await page.locator('#compactTocButton').click();
  assert.equal(await first.locator('.katex').count(), 1, 'editor outline renders formulas');
  await first.click();
  assert.equal(await page.evaluate(() => window.tocMathAudit.editorSelection()), source.indexOf('## 改进1'));
  assert.equal(await page.evaluate(() => window.tocMathAudit.editorSource()), source);
  const liveTocLink = page.locator('.cm-live-toc button').filter({ hasText: '改进1' });
  assert.equal(await liveTocLink.locator('.katex').count(), 1, 'live-editing inline TOC renders math');
  await liveTocLink.click();
  assert.equal(await page.evaluate(() => window.tocMathAudit.editorSelection()), source.indexOf('## 改进1'));
  await page.evaluate(() => window.tocMathAudit.replace('# New $z_1$\n\n## Child $y^2$'));
  await page.locator('#compactTocButton').click();
  assert.equal(await page.locator('#toc a .katex').count(), 2);
  assert.equal(await page.locator('#toc a').filter({ hasText: '改进1' }).count(), 0, 'editor cache refreshes after typing');
  assert.deepEqual(errors, []);
  console.log('PASS', engine, 'reading/editor/dynamic/export TOC math, stable anchors, search, dark theme, safe titles, unchanged document');
} finally { await browser?.close(); await server.close(); }
