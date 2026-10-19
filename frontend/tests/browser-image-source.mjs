import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const server = await createServer({ root: fileURLToPath(new URL('..', import.meta.url)), server: { host: '127.0.0.1', port: 0, watch: null, hmr: false }, logLevel: 'error' });
await server.listen();
const browser = await chromium.launch({ headless: true, executablePath: process.env.BROWSER_EXECUTABLE || undefined });
let auditPage;
try {
  const page = await browser.newPage({ viewport: { width: 1400, height: 1000 } }), errors = [];
  auditPage=page;
  page.on('pageerror', error => errors.push(error.message));
  await page.route('**/*', route => new URL(route.request().url()).hostname === '127.0.0.1' ? route.continue() : route.abort());
  await page.goto(server.resolvedUrls.local[0] + 'tests/fixtures/embedded-image-audit.html');
  await page.waitForFunction(() => !!window.imageAudit);
  for (const sample of ['sample', 'mixed', 'row', 'large', 'formula-large', 'html']) {
    if (sample === 'html') {
      await page.evaluate(() => {
        const { view, imagePreviewField } = imageAudit, ref = view.state.field(imagePreviewField).items[0].images[0].ref;
        view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: '$y=ax+b$\n\n<img\n src="' + ref + '" width="200" alt="多行 HTML 图片">\n\n图片下方正文' }, selection: { anchor: 0 } });
      });
      await page.waitForFunction(() => imageAudit.view.state.field(imageAudit.imagePreviewField).items.length === 1);
    } else await page.locator('#' + sample).click();
    const before = await page.evaluate(() => ({ doc: imageAudit.view.state.doc.toString(), undo: imageAudit.undoDepth(imageAudit.view.state) }));
    const root = page.locator('.cm-embedded-image').first();
    for (let cycle = 0; cycle < 2; cycle++) {
      await page.setViewportSize({ width: 1400, height: 1000 });
      await root.hover();
      await root.locator('[data-image-action="source"]').click();
      if (sample === 'html') await page.setViewportSize({ width: 820, height: 1000 });
      await page.mouse.move(5, 5);
      const header = await root.evaluate(el => {
        const b = el.querySelector('[data-image-action="source"]'), r = el.getBoundingClientRect(), br = b.getBoundingClientRect(), s = getComputedStyle(b.parentElement);
        return { visible: s.visibility, opacity: s.opacity, pointer: s.pointerEvents, inside: br.top >= r.top && br.bottom <= r.bottom, text: b.textContent };
      });
      assert.equal(header.visible, 'visible', `${sample}: source header stays visible away from hover`);
      assert.equal(header.opacity, '1');
      assert.equal(header.pointer, 'auto');
      assert.equal(header.inside, true, `${sample}: return control must not be clipped`);
      assert.equal(header.text, '收起源码');
      if (cycle === 0) await root.locator('[data-image-action="source"]').click();
      else await root.locator('[data-image-action="source"]').press('Enter');
      await page.waitForFunction(() => !imageAudit.view.state.field(imageAudit.imagePreviewField).items[0].open);
      assert.equal(await root.locator('.cm-image-cards').isVisible(), true);
      const after = await page.evaluate(() => ({ doc: imageAudit.view.state.doc.toString(), undo: imageAudit.undoDepth(imageAudit.view.state) }));
      assert.deepEqual(after, before, `${sample}: toggle must not change Markdown or undo`);
    }
  }
  // Exercise the same controls inside the actual app's live-editing layout.
  const appSource = await page.evaluate(() => imageAudit.view.state.doc.toString());
  await page.setViewportSize({ width: 1400, height: 1000 });
  await page.goto(server.resolvedUrls.local[0]);
  await page.evaluate(() => import('/src/main.js'));
  await page.waitForFunction(() => window.quilliteMarkdown && document.querySelector('#fileList')?.childElementCount);
  await page.evaluate(source => Object.assign(window.quilliteMarkdown, {
    openFile: async () => ({ path: '/image-source.md', name: 'image-source.md', directory: '/', content: source, revision: 'a'.repeat(64) }),
    canEditFile: async () => true,
    saveFile: async (path, content) => ({ path, name: 'image-source.md', directory: '/', content, revision: 'b'.repeat(64) }),
  }), appSource);
  await page.locator('#openFileButton').click(); await page.locator('#editButton').click();
  const appImage = page.locator('#markdownEditor .cm-embedded-image').first();
  await appImage.hover(); await appImage.locator('[data-image-action="source"]').click();
  await page.mouse.move(5, 5);
  assert.equal(await appImage.locator('[data-image-action="source"]').getAttribute('aria-expanded'), 'true');
  if(process.env.AUDIT_OUTPUT) await page.screenshot({path:`${process.env.AUDIT_OUTPUT}/01-source-return-control.png`});
  await appImage.locator('[data-image-action="source"]').click();
  assert.equal(await appImage.locator('.cm-image-cards').isVisible(), true);
  if(process.env.AUDIT_OUTPUT) await page.screenshot({path:`${process.env.AUDIT_OUTPUT}/02-image-restored.png`});
  const appDoc = await page.evaluate(async () => {
    const { EditorView } = await import('/node_modules/@codemirror/view/dist/index.js');
    return EditorView.findFromDOM(document.querySelector('#markdownEditor > .cm-editor')).state.doc.toString();
  });
  assert.equal(appDoc, appSource);
  assert.deepEqual(errors, []);
  console.log('PASS: source/preview round trips for embedded, local, remote, grouped, large and multiline HTML images; narrow layout, actual app, mouse/keyboard, unchanged content/history');
} catch(error) {
  if(process.env.AUDIT_OUTPUT && auditPage) await auditPage.screenshot({path:`${process.env.AUDIT_OUTPUT}/image-source-failure.png`});
  throw error;
} finally { await browser.close(); await server.close(); }
