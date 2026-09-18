import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createServer } from 'vite';
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const server = await createServer({ root: fileURLToPath(new URL('..', import.meta.url)), server: { host: '127.0.0.1', port: 0 }, logLevel: 'error' });
await server.listen();
const browser = await chromium.launch({ headless: true, executablePath: process.env.BROWSER_EXECUTABLE || undefined });
try {
  for (const mac of [false, true]) {
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    if (mac) await context.addInitScript(() => Object.defineProperty(navigator, 'platform', { get: () => 'MacIntel' }));
    const page = await context.newPage(), errors = [];
    page.on('pageerror', error => errors.push(error.message));
    const boot = async () => {
      await page.goto(server.resolvedUrls.local[0]);
      await page.waitForSelector('#documentToolsDialog', { state: 'attached' });
      await page.evaluate(() => {
        Object.assign(window.quilliteMarkdown, {
          openFile: async () => ({ path: '/test.md', name: 'test.md', directory: '/', content: '# Doc\n\nalpha beta', revision: 'a'.repeat(64) }),
          canEditFile: async () => true,
          saveFile: async (path, content) => { window.savedText = content; return { path, name: 'test.md', directory: '/', content, revision: 'b'.repeat(64) }; },
          exportHTML: async (_path, _title, html) => { window.exportedHTML = html; return '/test.html'; }
        });
      });
      await page.locator('#openFileButton').click();
      await page.locator('#editButton').click();
      await page.locator('.cm-content').waitFor();
    };
    const choose = async layout => {
      await page.locator('#moreButton').click();
      await page.locator('[data-settings-submenu="editor-layout"]').click();
      await page.locator(`[data-editor-layout="${layout}"]`).click();
    };
    const mod = mac ? 'Meta' : 'Control';
    await boot();
    assert.equal(await page.locator('#restoreLivePreviewButton').isVisible(), false);
    await page.locator('.cm-content').click();
    await page.keyboard.press(mac ? 'Meta+ArrowDown' : 'Control+End');
    for (let i = 0; i < 4; i++) await page.keyboard.press('ArrowLeft');
    await page.locator('#hideLivePreviewButton').click();
    await page.waitForFunction(() => document.activeElement?.classList.contains('cm-content'));
    assert.equal(await page.locator('.editor-preview-pane').isVisible(), false);
    assert.equal(await page.locator('#editorResizer').isVisible(), false);
    assert.equal(await page.locator('#restoreLivePreviewButton').isVisible(), true);
    const workspace = await page.locator('.editor-workspace').boundingBox();
    const editor = await page.locator('#editorView').boundingBox();
    assert.ok(Math.abs(workspace.width - editor.width) < 2);
    await page.evaluate(() => {
      window.previewMutations = 0;
      new MutationObserver(items => window.previewMutations += items.length).observe(document.querySelector('#editorPreviewContent'), { subtree: true, childList: true, characterData: true });
    });
    await page.keyboard.insertText('CURSOR');
    await page.waitForTimeout(900);
    assert.equal(await page.evaluate(() => window.previewMutations), 0);
    assert.equal(await page.locator('#editorPreviewContent').innerText(), '');
    await page.keyboard.press(`${mod}+e`);
    await page.locator('#documentView').waitFor({ state: 'visible' });
    assert.match(await page.locator('#markdownContent').innerText(), /CURSORbeta/);
    await page.keyboard.press(`${mod}+e`);
    await page.locator('#editorView').waitFor({ state: 'visible' });
    await page.waitForFunction(() => document.activeElement?.classList.contains('cm-content'));
    await page.keyboard.insertText('RETURN');
    assert.match(await page.locator('.cm-content').innerText(), /CURSORRETURNbeta/);
    await page.keyboard.press(`${mod}+z`);
    assert.doesNotMatch(await page.locator('.cm-content').innerText(), /RETURN/);
    await page.keyboard.press(mac ? 'Meta+Shift+z' : 'Control+y');
    assert.match(await page.locator('.cm-content').innerText(), /CURSORRETURNbeta/);
    await page.keyboard.press(`${mod}+s`);
    await page.waitForFunction(() => window.savedText?.includes('CURSORRETURNbeta'));
    assert.equal(await page.locator('#editorPreviewContent').innerText(), '');
    await page.keyboard.insertText('EXPORT_LATEST');
    await page.locator('#moreButton').click();
    await page.locator('[data-action="export-center"]').click();
    await page.locator('[data-export-format="html"]').click();
    await page.locator('#confirmExportCenter').click();
    await page.waitForFunction(() => window.exportedHTML?.includes('EXPORT_LATEST'));
    assert.equal(await page.locator('.editor-preview-pane').isVisible(), false);
    await page.locator('#restoreLivePreviewButton').click();
    await page.waitForFunction(() => document.querySelector('#editorPreviewContent').textContent.includes('EXPORT_LATEST'));
    assert.equal(await page.locator('#editorResizer').isVisible(), true);
    assert.equal(await page.locator('#restoreLivePreviewButton').isVisible(), false);
    assert.equal(await page.evaluate(() => localStorage.getItem('editorLayout')), 'preview-left');
    await choose('editor-left');
    await choose('editor-only');
    await page.locator('.cm-content').click();
    await page.keyboard.press(`${mod}+s`);
    await page.waitForFunction(() => window.savedText?.includes('EXPORT_LATEST'));
    await page.screenshot({ path: join(tmpdir(), `editor-only-${mac ? 'mac-keys' : 'windows'}.png`) });
    await boot();
    assert.equal(await page.evaluate(() => localStorage.getItem('editorLayout')), 'editor-only');
    assert.equal(await page.locator('.editor-preview-pane').isVisible(), false);
    assert.equal(await page.locator('#editorPreviewContent').innerText(), '');
    await page.locator('#restoreLivePreviewButton').click();
    assert.equal(await page.evaluate(() => localStorage.getItem('editorLayout')), 'editor-left');
    assert.equal(await page.locator('#restoreLivePreviewButton').isVisible(), false);
    await choose('editor-only');
    // Exercise the deferred large-document preview path, not only small edits.
    if (!mac) {
      await page.evaluate(() => { window.quilliteMarkdown.openFile = async () => ({ path: '/large.md', name: 'large.md', directory: '/', content: '# Large\n\n' + 'Large document line with text.\n\n'.repeat(10000), revision: 'c'.repeat(64) }); });
      await page.locator('#openFileButton').click();
      if (!await page.locator('#editorView').isVisible()) await page.locator('#editButton').click();
      await page.locator('.cm-content').click();
      await page.keyboard.press('Control+Home');
      await page.keyboard.insertText('LARGE_EDIT');
      await page.waitForTimeout(1700);
      assert.equal(await page.locator('#editorPreviewContent').innerHTML(), '');
      await page.keyboard.press('Control+e');
      await page.locator('#documentView').waitFor({ state: 'visible' });
      assert.match(await page.locator('#markdownContent').innerText(), /^LARGE_EDIT/);
      await page.keyboard.press('Control+e');
      assert.equal(await page.locator('.editor-preview-pane').isVisible(), false);
    }
    assert.deepEqual(errors, []);
    await context.close();
  }
  console.log('PASS: editor-only width, persistence, paused rendering, Ctrl/Cmd+E, cursor, save, fresh export, restored split preview.');
} finally { await browser.close(); await server.close(); }
