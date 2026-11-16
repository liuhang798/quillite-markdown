// Exercise the real reader and editor against an isolated synthetic document.
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';

const pw = createRequire(import.meta.url)(process.env.PLAYWRIGHT_MODULE || 'playwright');
const engine = process.env.ISSUE21_BROWSER || 'chromium';
const server = await createServer({
  root: fileURLToPath(new URL('..', import.meta.url)),
  server: { host: '127.0.0.1', port: 0, watch: null, hmr: false },
  logLevel: 'error'
});

const plain = '另一行（列）';
const issue = `**${plain}**的加粗不知道为什么没渲染，其他地方的加粗都渲染了`;
const formula = String.raw`\text{**公式（列）**的}+x_1`;
const source = [
  '# **标题（列）**的说明', '',
  issue, '',
  '英文：**word)**suffix；普通加粗：**English**。', '',
  '行内代码：`**行内代码（列）**的`；原始标签：<code>**标签（列）**的</code>。', '',
  `行内公式：$${formula}$。`, '',
  '```text', '**围栏代码（列）**的', '```', '',
  '| 名称 | 内容 |', '| --- | --- |', '| **表格（列）**的内容 | 第 1 行 |',
  ...Array.from({ length: 21 }, (_, i) => `| 普通字段 | 第 ${i + 2} 行 |`),
  ''
].join('\n');

let browser;
try {
  await server.listen();
  browser = await pw[engine].launch({ headless: true,
    ...(engine === 'chromium' && process.env.BROWSER_EXECUTABLE ? { executablePath: process.env.BROWSER_EXECUTABLE } : {}) });
  const page = await browser.newPage({ viewport: { width: 1550, height: 1100 } });
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.route('**/*', route => new URL(route.request().url()).hostname === '127.0.0.1' ? route.continue() : route.abort());
  await page.addInitScript(() => {
    localStorage.setItem('language', 'en');
    localStorage.setItem('editorPresentation', 'live');
    localStorage.setItem('editorLayout', 'editor-only');
    localStorage.setItem('lastSplitLayout', 'editor-left');
  });
  await page.goto(server.resolvedUrls.local[0]);
  await page.waitForFunction(() => window.quilliteMarkdown && document.querySelector('#fileList')?.childElementCount);
  await page.evaluate(content => Object.assign(window.quilliteMarkdown, {
    openFile: async () => ({ path: '/issue21.md', name: 'issue21.md', directory: '/', content, revision: 'a'.repeat(64) }),
    canEditFile: async () => true,
    reportErrorLog: async () => {}
  }), source);
  await page.locator('#openFileButton').click();

  const boldText = (loc, text) => loc.locator('strong').filter({ hasText: new RegExp(`^${text}$`, 'u') });
  const checkPreview = async preview => {
    await boldText(preview.locator('h1'), '标题（列）').waitFor();
    assert.equal(await boldText(preview, plain).count(), 1);
    assert.equal(await boldText(preview, 'English').count(), 1);
    assert.equal(await boldText(preview.locator('table'), '表格（列）').count(), 1);
    assert.ok((await preview.innerText()).includes('**word)**suffix'));
    for (const text of ['**行内代码（列）**的', '**标签（列）**的', '**围栏代码（列）**的']) {
      assert.equal(await preview.getByText(text, { exact: true }).count(), 1, 'leave literal code unchanged');
    }
    const math = preview.locator('.math-inline');
    assert.equal(await math.count(), 1);
    assert.equal(decodeURIComponent(await math.getAttribute('data-math-source')), formula, 'formula source stays exact');
    assert.equal(await math.locator('.katex-error').count(), 0);
  };
  await checkPreview(page.locator('#markdownContent'));

  await page.locator('#editButton').click();
  const editor = page.locator('#markdownEditor > .cm-editor');
  const content = editor.locator('> .cm-scroller > .cm-content');
  const renderedStrong = text => content.locator('.cm-live-strong').filter({ hasText: new RegExp(`^${text}$`, 'u') });
  const readSource = () => editor.evaluate(async dom => {
    const { EditorView } = await import('/node_modules/@codemirror/view/dist/index.js');
    return EditorView.findFromDOM(dom).state.doc.toString();
  });
  const strong = renderedStrong(plain);
  await strong.waitFor();
  assert.equal(await renderedStrong('标题（列）').count(), 1);
  assert.equal(await renderedStrong('English').count(), 1);
  assert.equal(await renderedStrong('标签（列）').count(), 0);
  assert.ok((await content.innerText()).includes('**word)**suffix'));
  assert.equal(await content.locator('.cm-live-inline-code').filter({ hasText: '**行内代码（列）**的' }).count(), 1);
  await boldText(content.locator('.cm-live-table-lightweight'), '表格（列）').waitFor();
  assert.equal(await readSource(), source, 'reading and live rendering must not rewrite the document');

  await strong.scrollIntoViewIfNeeded();
  const point = await strong.evaluate(node => {
    // The mark can contain nested decoration spans; hit the actual glyph
    // rather than a zero-width replacement or a wrapper boundary.
    const walker = document.createTreeWalker(node, NodeFilter.SHOW_TEXT);
    let text;
    while ((text = walker.nextNode()) && !text.data.startsWith('另')) {}
    if (!text) throw new Error('No matching rendered text node');
    const range = document.createRange();
    range.setStart(text, 0);
    range.setEnd(text, 1);
    const rect = range.getBoundingClientRect();
    if (!(rect.width > 0 && rect.height > 0)) throw new Error('Rendered glyph has no measurable bounds');
    return { x: rect.right - rect.width / 4, y: (rect.top + rect.bottom) / 2 };
  });
  await page.mouse.click(point.x, point.y);
  const caret = await editor.evaluate(async dom => {
    const { EditorView } = await import('/node_modules/@codemirror/view/dist/index.js');
    return EditorView.findFromDOM(dom).state.selection.main.head;
  });
  assert.equal(caret, source.indexOf(plain) + 1, 'the clicked word has an exact source position');
  await page.keyboard.insertText('甲');
  const after = source.replace(`**${plain}**`, '**另甲一行（列）**');
  assert.equal(await readSource(), after, 'caret inside live bold edits the source text, not the delimiters');
  await renderedStrong('另甲一行（列）').waitFor();
  const mod = await page.evaluate(() => /Mac/.test(navigator.platform) ? 'Meta' : 'Control');
  await page.keyboard.press(`${mod}+z`);
  assert.equal(await readSource(), source, 'undo restores exact Markdown');

  await page.locator('[data-editor-presentation="source"]').click();
  await checkPreview(page.locator('#editorPreviewContent'));
  assert.ok((await content.innerText()).includes(`**${plain}**`), 'the actual delimiters are visible in source mode');
  assert.equal(await readSource(), source, 'mode switches must not rewrite the document');
  assert.deepEqual(errors, []);
  console.log(`PASS ${engine}: Issue #21 reader, live editing, split preview, headings, large tables and literal guards`);
} finally {
  await browser?.close();
  server.httpServer.closeAllConnections?.();
  await server.close();
}
