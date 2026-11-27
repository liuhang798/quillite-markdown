// Issue #23: use the real reader, split preview and instant editor, and require
// a decoded image rather than accepting any successful mocked bridge call.
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';

const playwright = createRequire(import.meta.url)(process.env.PLAYWRIGHT_MODULE || 'playwright');
const engine = process.env.BUNDLE_BROWSER || 'chromium';
const server = await createServer({
  root: fileURLToPath(new URL('..', import.meta.url)),
  server: { host: '127.0.0.1', port: 0, watch: null, hmr: false }, logLevel: 'error',
  plugins: [{ name: 'bundle-image-test-only', enforce: 'pre', transform(code, id) {
    if (!id.replaceAll('\\', '/').endsWith('/src/renderer.js')) return;
    return code + '\nwindow.bundleImageUI = {state, open:displayDocument};';
  } }]
});
let browser;
try {
  await server.listen();
  browser = await playwright[engine].launch({ headless: true,
    ...(engine === 'chromium' && process.env.BROWSER_EXECUTABLE ? { executablePath: process.env.BROWSER_EXECUTABLE } : {}) });
  const page = await browser.newPage({ viewport: { width: 1440, height: 2000 } });
  const errors = [], remote = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.route('**/*', route => {
    if (new URL(route.request().url()).hostname === '127.0.0.1') return route.continue();
    remote.push(route.request().url()); return route.abort();
  });
  await page.addInitScript(() => {
    localStorage.setItem('language', 'en');
    localStorage.setItem('editorPresentation', 'instant');
    localStorage.setItem('editorLayout', 'editor-only');
  });
  await page.goto(server.resolvedUrls.local[0]);
  await page.waitForFunction(() => window.quilliteMarkdown && window.bundleImageUI && document.querySelector('#fileList')?.childElementCount);
  await page.evaluate(() => {
    const canvas = document.createElement('canvas'); canvas.width = 3; canvas.height = 2;
    const context = canvas.getContext('2d'); context.fillStyle = '#0a6'; context.fillRect(0, 0, 3, 2);
    const png = canvas.toDataURL('image/png');
    const svg = 'data:image/svg+xml;base64,' + btoa('<svg xmlns="http://www.w3.org/2000/svg" width="3" height="2"><rect width="3" height="2" fill="green"/></svg>');
    const directory = '/owned/bundle-sessions/issue23/work/Document.textbundle';
    const refs = ['assets/local.png', './assets/local.png', 'assets/a%20b.png', 'assets/%E5%9B%BE.png', 'assets/extensionless-svg'];
    const content = '# Package images\n\n' + refs.map((ref, i) => `![local-${i}](${ref})`).join('\n\n')
      + '\n\n<img alt="local-html" src="assets/html.png">\n\n![remote](https://image.invalid/no-request.png)\n';
    const audit = window.bundleImageAudit = { directory, refs: [...refs, 'assets/html.png'], calls: [], content };
    Object.assign(window.quilliteMarkdown, {
      canEditFile: async () => true, reportErrorLog: async () => {},
      readImageData: async (ref, base) => {
        audit.calls.push([ref, base]);
        if (base !== directory || !audit.refs.includes(ref)) throw new Error('IMAGE_OUTSIDE_BUNDLE');
        return ref === 'assets/extensionless-svg' ? svg : png;
      },
      saveRecoverySnapshot: async () => {}, clearRecoverySnapshot: async () => {}
    });
    return bundleImageUI.open({ path: '/origin/Document.textpack', name: 'Document.textpack', directory,
      content, resourcePath: `${directory}/text.md`, packageDirectory: '/origin',
      bundleKind: 'textpack', bundleSessionId: 'issue23', bundleTextPath: 'Document.textbundle/text.md', revision: 'a'.repeat(64) });
  });
  const decoded = async selector => {
    await page.waitForFunction(selector => {
      const images = [...document.querySelectorAll(selector)];
      return images.length === 6 && images.every(img => img.complete && img.naturalWidth === 3 && img.naturalHeight === 2);
    }, selector);
  };
  await decoded('#markdownContent img[alt^="local-"]');
  assert.equal(await page.locator('#markdownContent img[alt="remote"]').getAttribute('src'), null);
  assert.deepEqual(remote, []);
  console.log('PASS ' + engine + ': bundle reader decodes relative, dot-relative, encoded and HTML local images without network consent');
  await page.locator('#editButton').click();
  await page.locator('#markdownEditor > .cm-editor').waitFor();
  // Instant widgets may stay as source while the initial selection is on a
  // block; move to the heading before asserting the remaining image widgets.
  await page.locator('#markdownEditor .cm-content').press('Control+Home');
  await decoded('#markdownEditor img[alt^="local-"]');
  assert.deepEqual(remote, []);
  await page.locator('#restoreLivePreviewButton').click();
  await decoded('#editorPreviewContent img[alt^="local-"]');
  assert.equal(await page.locator('#editorPreviewContent img[alt="remote"]').getAttribute('src'), null);
  assert.deepEqual(remote, []);
  const calls = await page.evaluate(() => bundleImageAudit.calls);
  for (const [ref, directory] of calls) {
    assert.equal(directory, '/owned/bundle-sessions/issue23/work/Document.textbundle');
    assert.ok(['assets/local.png', './assets/local.png', 'assets/a%20b.png', 'assets/%E5%9B%BE.png', 'assets/extensionless-svg', 'assets/html.png'].includes(ref));
  }
  assert.deepEqual(errors, []);
  console.log('PASS ' + engine + ': bundle instant editor and split preview decode package images using the managed resource base');
  // A responsive HTML image still has a safe local fallback. Dropping srcset
  // must not classify that fallback as a blocked remote image.
  await page.evaluate(() => bundleImageUI.open({
    ...bundleImageUI.state.currentFile, path: '/origin/responsive.textpack', name: 'responsive.textpack',
    content: '# Responsive local fallback\n\n<img alt="local-fallback" src="assets/html.png" srcset="https://image.invalid/no-srcset-request.png 2x">\n\n'
      + '<img alt="remote-primary" src="https://image.invalid/no-src-request.png" srcset="assets/html.png 2x">\n\n'
      + '<img alt="srcset-only" srcset="https://image.invalid/no-srcset-only-request.png 2x">\n'
  }));
  await page.waitForFunction(() => {
    const img = document.querySelector('#markdownContent img[alt="local-fallback"]');
    return img?.complete && img.naturalWidth === 3;
  }, null, { timeout: 5000 });
  assert.equal(await page.locator('#markdownContent img[alt="local-fallback"]').getAttribute('srcset'), null);
  assert.equal(await page.locator('#markdownContent img[alt="local-fallback"]').getAttribute('data-remote-image-blocked'), null);
  assert.equal(await page.locator('#markdownContent img[alt="remote-primary"]').getAttribute('src'), null);
  assert.equal(await page.locator('#markdownContent img[alt="remote-primary"]').getAttribute('srcset'), null);
  assert.equal(await page.locator('#markdownContent img[alt="remote-primary"]').getAttribute('data-remote-image-blocked'), 'true');
  assert.equal(await page.locator('#markdownContent img[alt="srcset-only"]').getAttribute('src'), null);
  assert.equal(await page.locator('#markdownContent img[alt="srcset-only"]').getAttribute('srcset'), null);
  assert.equal(await page.evaluate(() => bundleImageUI.state.currentFile.content.includes('https://image.invalid/no-srcset-request.png')), true);
  assert.equal(await page.evaluate(() => bundleImageAudit.calls.some(([ref]) => /^https?:/i.test(ref))), false);
  assert.deepEqual(remote, []);
  assert.deepEqual(errors, []);
  console.log('PASS ' + engine + ': responsive image local fallback decodes while remote srcset remains blocked');
} finally { await browser?.close(); await server.close(); }
