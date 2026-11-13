// Test actual pointer selection in both editor modes without using user files.
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';

const pw = createRequire(import.meta.url)(process.env.PLAYWRIGHT_MODULE || 'playwright');
const engine = process.env.SELECTION_BROWSER || 'chromium';
const source = ['甲：报废，第一条。', '乙：报废，第二条。', '丙：报废，第三条。', '丁：报废，第四条。'].join('\n\n');
const server = await createServer({
  root: fileURLToPath(new URL('..', import.meta.url)),
  server: { host: '127.0.0.1', port: 0, watch: null, hmr: false }, logLevel: 'error',
  plugins: [{
    name: 'selection-match-test-only', enforce: 'pre',
    transform(code, id) {
      if (!id.replaceAll('\\','/').endsWith('/src/renderer.js')) return;
      return code + `\nwindow.selectionMatchTest = () => {
  const state = codeEditor.state;
  return {text: state.doc.toString(), ranges: state.selection.ranges.map(range => [range.from, range.to])};
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
  for (const mode of ['source', 'live']) {
    const page = await browser.newPage({ viewport: { width: 1300, height: 900 } });
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.route('**/*', route => new URL(route.request().url()).hostname === '127.0.0.1' ? route.continue() : route.abort());
    await page.addInitScript(mode => {
      localStorage.setItem('language', 'zh-CN');
      localStorage.setItem('editorPresentation', mode);
      localStorage.setItem('editorLayout', 'editor-only');
    }, mode);
    await page.goto(server.resolvedUrls.local[0]);
    await page.waitForFunction(() => window.selectionMatchTest && window.quilliteMarkdown && document.querySelector('#fileList')?.childElementCount);
    await page.evaluate(content => Object.assign(window.quilliteMarkdown, {
      openFile: async () => ({ path: '/isolated/selection.md', directory: '/isolated', name: 'selection.md', content, revision: 'a'.repeat(64) }),
      canEditFile: async () => true,
      reportErrorLog: async () => {},
    }), source);
    await page.locator('#openFileButton').click();
    await page.locator('#markdownContent').getByText('丁：报废，第四条。', { exact: true }).waitFor();
    await page.locator('#editButton').click();
    const editor = page.locator('#markdownEditor > .cm-editor');
    const last = editor.locator('.cm-line').getByText('丁：报废，第四条。', { exact: true });
    await last.scrollIntoViewIfNeeded();
    const { left, right, y } = await last.evaluate(node => {
      const walker = document.createTreeWalker(node, NodeFilter.SHOW_TEXT);
      for (let text; (text = walker.nextNode());) {
        const index = text.data.indexOf('报废');
        if (index < 0) continue;
        const range = document.createRange();
        range.setStart(text, index);
        range.setEnd(text, index + 2);
        const bounds = range.getBoundingClientRect();
        return { left: bounds.left + 1, right: bounds.right - 1, y: bounds.top + bounds.height / 2 };
      }
      throw new Error('Missing synthetic final word');
    });
    await page.mouse.move(left, y);
    await page.mouse.down();
    await page.mouse.move(right, y, { steps: 5 });
    await page.mouse.up();
    const matches = editor.locator('.cm-selectionMatch');
    await matches.first().waitFor();
    assert.deepEqual(await page.evaluate(() => selectionMatchTest()), {
      text: source, ranges: [[source.lastIndexOf('报废'), source.lastIndexOf('报废') + 2]],
    }, mode + ': only the pointer-selected occurrence is selected');
    assert.equal(await matches.count(), 3, mode + ': all other occurrences are matches only');
    for (const style of await matches.evaluateAll(nodes => nodes.map(node => {
      const css = getComputedStyle(node);
      return { text: node.textContent, background: css.backgroundColor, underline: css.textDecorationLine,
        border: css.borderBottomStyle, borderWidth: css.borderBottomWidth };
    }))) {
      assert.equal(style.text, '报废');
      assert.match(style.background, /^(?:transparent|rgba\(0, 0, 0, 0\))$/, mode + ': matched words have no background');
      assert.ok(style.underline.includes('underline') || (style.border !== 'none' && parseFloat(style.borderWidth) > 0), mode + ': matches still have a visible underline');
    }
    const selected = await editor.locator('.cm-selectionBackground').evaluateAll(nodes => nodes.some(node => {
      const css = getComputedStyle(node), rect = node.getBoundingClientRect();
      return css.visibility === 'visible' && rect.width > 0 && rect.height > 0
        && css.backgroundColor !== 'rgba(0, 0, 0, 0)' && css.backgroundColor !== 'transparent';
    }));
    assert.equal(selected, true, mode + ': real selection still has its usual background');

    await page.keyboard.press('ArrowRight');
    await matches.first().waitFor({ state: 'detached' });
    await page.keyboard.press(process.platform === 'darwin' ? 'Meta+f' : 'Control+f');
    const panel = editor.locator('.cm-panel.cm-search');
    await panel.locator('input[name="search"]').fill('报废');
    await panel.locator('button[name="next"]').click();
    const search = editor.locator('.cm-searchMatch-selected').first();
    await search.waitFor();
    assert.match(await search.evaluate(node => getComputedStyle(node).backgroundColor), /^rgba\(226, 166, 77, 0\.533\d*\)$/, mode + ': explicit search keeps amber selection');
    assert.deepEqual(errors, []);
    await page.close();
  }
  console.log(`PASS ${engine}: pointer selection is distinct from three underlined matches in source/live; explicit search unchanged`);
} finally {
  await browser?.close();
  server.httpServer.closeAllConnections?.();
  await server.close();
}
