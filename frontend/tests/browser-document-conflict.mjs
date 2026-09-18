// Optional real-browser smoke test. Set PLAYWRIGHT_MODULE to an installed
// playwright module and BROWSER_EXECUTABLE to a local Chromium executable.
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
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(server.resolvedUrls.local[0]);
  await page.waitForFunction(() => window.quilliteMarkdown && document.querySelector('#documentToolsDialog'));
  await page.evaluate(() => {
    window.conflictWrites = [];
    const api = window.quilliteMarkdown;
    api.readDocumentConflict = async () => ({ path: 'New document.md', content: '# 磁盘版本\n外部编辑新增的内容。', revision: 'disk-one' });
    api.saveFile = async (...args) => {
      window.conflictWrites.push(args);
      if (args[2] !== 'disk-one') throw new Error('DOCUMENT_CONFLICT');
      return { path: args[0], name: 'New document.md', content: args[1], revision: 'merged-saved' };
    };
    api.saveConflictCopy = async () => null;
  });
  await page.locator('#newFileButton').click();
  await page.locator('.cm-content').click();
  await page.keyboard.insertText('# 当前编辑\n我正在修改的内容。');
  await page.keyboard.press('Control+s');
  await page.locator('#documentConflictDialog:not(.hidden)').waitFor();
  await page.waitForFunction(() => !document.querySelector('#conflictMerge').disabled);
  assert.match(await page.locator('#documentConflictDisk').inputValue(), /磁盘版本/);
  assert.match(await page.locator('#documentConflictCurrent').inputValue(), /当前编辑/);
  const diskBox = await page.locator('#documentConflictDisk').boundingBox();
  const editBox = await page.locator('#documentConflictCurrent').boundingBox();
  assert.equal(diskBox.y, editBox.y);
  assert.ok(editBox.x > diskBox.x);
  await page.screenshot({ path: join(tmpdir(), 'quillite-conflict-comparison.png'), animations: 'disabled' });
  await page.locator('#conflictKeep').click();
  await page.locator('#saveButton').click();
  await page.waitForFunction(() => !document.querySelector('#conflictMerge').disabled);
  await page.locator('#conflictCopy').click();
  assert.equal(await page.locator('#documentConflictDialog').isVisible(), true);
  await page.locator('#conflictMerge').click();
  await page.locator('#documentConflictMerge').fill('# 合并结果\n保留双方内容。');
  await page.locator('#conflictApply').click();
  assert.equal(await page.locator('#documentConflictDialog').isVisible(), false);
  assert.match(await page.locator('.cm-content').innerText(), /合并结果/);
  assert.equal(await page.evaluate(() => window.conflictWrites.length), 1);
  await page.locator('#saveButton').click();
  await page.locator('#conflictSave:not(.hidden)').waitFor();
  await page.locator('#conflictSave').click();
  await page.locator('#documentConflictDialog.hidden').waitFor({ state: 'attached' });
  await page.waitForFunction(() => document.querySelector('#editorSaveState').textContent === '已保存');
  const writes = await page.evaluate(() => window.conflictWrites);
  assert.equal(writes.length, 2);
  assert.equal(writes[1][2], 'disk-one');
  assert.match(writes[1][1], /合并结果/);
  // Choosing disk is an editor-only, undoable action, even on a narrow screen.
  await page.setViewportSize({ width: 620, height: 760 });
  await page.locator('.cm-content').click();
  await page.keyboard.press('Control+End');
  await page.keyboard.insertText('\n保留这段可撤回内容。');
  await page.keyboard.press('Control+s');
  await page.waitForFunction(() => !document.querySelector('#conflictDisk').disabled);
  assert.equal(await page.locator('#documentConflictDialog').isVisible(), true);
  const panel = await page.locator('.document-conflict-dialog').boundingBox();
  assert.ok(panel.x >= 0 && panel.x + panel.width <= 620);
  page.once('dialog', dialog => dialog.accept());
  await page.locator('#conflictDisk').click();
  assert.match(await page.locator('.cm-content').innerText(), /磁盘版本/);
  assert.equal(await page.evaluate(() => window.conflictWrites.length), 3);
  await page.locator('.cm-content').click();
  await page.keyboard.press('Control+z');
  assert.match(await page.locator('.cm-content').innerText(), /保留这段可撤回内容/);
  assert.deepEqual(errors, []);
  const reader = await browser.newPage();
  await reader.goto(server.resolvedUrls.local[0]);
  await reader.waitForFunction(() => window.quilliteMarkdown && document.querySelector('#documentToolsDialog'));
  await reader.evaluate(() => {
    window.quilliteMarkdown.openFile = async () => ({ path: '/reader.md', name: 'reader.md', content: 'ORIGINAL READER', revision: 'a'.repeat(64) });
    window.quilliteMarkdown.saveFile = async () => { throw new Error('DOCUMENT_CONFLICT'); };
    window.quilliteMarkdown.readDocumentConflict = async () => ({ path: '/reader.md', content: 'EXTERNAL DISK', revision: 'b'.repeat(64) });
  });
  await reader.locator('#openFileButton').click();
  await reader.locator('#saveButton').click();
  await reader.waitForFunction(() => !document.querySelector('#conflictMerge').disabled && sessionStorage.getItem('quilliteDocumentRecovery'));
  assert.equal(await reader.locator('.cm-content').count(), 0);
  await reader.locator('#conflictMerge').click();
  await reader.locator('#documentConflictMerge').fill('NEW READER MERGE');
  await reader.locator('#conflictApply').click();
  await reader.waitForFunction(() => JSON.parse(sessionStorage.getItem('quilliteDocumentRecovery')).content === 'NEW READER MERGE');
  await reader.reload();
  await reader.locator('#restoreRecovery').waitFor({ state: 'visible' });
  await reader.evaluate(() => {
    const disk = { path: '/reader.md', name: 'reader.md', content: 'EXTERNAL DISK', revision: 'b'.repeat(64) };
    window.quilliteMarkdown.readFile = async () => disk;
    window.quilliteMarkdown.readDocumentConflict = async () => disk;
  });
  await reader.locator('#restoreRecovery').click();
  await reader.locator('#documentConflictDialog:not(.hidden)').waitFor();
  assert.equal(await reader.locator('#documentConflictCurrent').inputValue(), 'NEW READER MERGE');
  await reader.close();
  console.log('Reader-only merge backup and restart recovery: PASS');
  // Crash recovery must not turn an unconfirmed conflict into autosave authority.
  for (const metadata of [{}, { baseRevision: 'a'.repeat(64), conflict: true }]) {
    const restored = await browser.newPage();
    await restored.goto(server.resolvedUrls.local[0]);
    await restored.waitForFunction(() => window.quilliteMarkdown && document.querySelector('#documentToolsDialog'));
    await restored.evaluate(meta => sessionStorage.setItem('quilliteDocumentRecovery', JSON.stringify({
      path: '/conflict.md', name: 'conflict.md', content: 'UNCONFIRMED LOCAL', updatedAt: new Date().toISOString(), ...meta,
    })), metadata);
    await restored.reload();
    await restored.locator('#restoreRecovery').waitFor({ state: 'visible' });
    await restored.evaluate(() => {
      window.auditWrites = [];
      const disk = { path: '/conflict.md', name: 'conflict.md', content: 'EXTERNAL DISK', revision: 'b'.repeat(64) };
      window.quilliteMarkdown.readFile = async () => disk;
      window.quilliteMarkdown.readDocumentConflict = async () => disk;
      window.quilliteMarkdown.saveFile = async (...args) => { window.auditWrites.push(args); return disk; };
    });
    await restored.locator('#restoreRecovery').click();
    await restored.locator('#documentConflictDialog:not(.hidden)').waitFor();
    await restored.locator('#conflictKeep').click();
    await restored.waitForTimeout(11000); // Cross the actual ten-second autosave interval.
    assert.deepEqual(await restored.evaluate(() => window.auditWrites), []);
    assert.match(await restored.locator('.cm-content').innerText(), /UNCONFIRMED LOCAL/);
    const backup = await restored.evaluate(() => JSON.parse(sessionStorage.getItem('quilliteDocumentRecovery')));
    assert.equal(backup.conflict, true);
    assert.equal(backup.baseRevision, metadata.baseRevision || '');
    await restored.close();
  }
  console.log('Legacy and conflicted crash recovery across autosave interval: PASS');
  console.log('Browser conflict comparison / keep / cancelled copy / merge / explicit save: PASS');
  console.log(join(tmpdir(), 'quillite-conflict-comparison.png'));
} finally {
  await browser.close();
  await server.close();
}
