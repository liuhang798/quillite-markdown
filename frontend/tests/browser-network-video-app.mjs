// Full application privacy/export smoke test. All remote requests are mocked;
// the URL, signed query, and documents below are synthetic.
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';

// This request/header assertion uses Chromium's reliable media interception.
// WebKit's native media pipeline is covered by separate DOM/lifecycle tests.
const { chromium } = createRequire(import.meta.url)(process.env.PLAYWRIGHT_MODULE || 'playwright');
const remote = 'https://video.mockcdn.example.com/clip?sig=synth%2Fprivate&view=A%26B';
const poster = 'https://video.mockcdn.example.com/unwanted-poster.png';
const fallback = 'https://video.mockcdn.example.com/unwanted-fallback.mp4';
const media = `<video controls autoplay preload="auto" poster="${poster}" src="${remote.replaceAll('&', '&amp;')}"><source src="${fallback}"></video>`;
const fixture = { path: '/network-video-fixture.md', name: 'network-video-fixture.md', directory: '/',
  content: `# Network fixture\n\n${media}\n\n[Ordinary link](https://example.com/watch)\n`, revision: 'a'.repeat(64) };
const packageFixture = { ...fixture, path: '/network-package-fixture.textpack', name: 'network-package-fixture.textpack',
  content: `# Network package fixture\n\n${media}\n`, bundleKind: 'textpack', bundleSessionId: 'mock-package',
  directory: '/packaged-workspace', resourcePath: '/packaged-workspace/text.md' };

const server = await createServer({
  root: fileURLToPath(new URL('..', import.meta.url)),
  plugins: [{
    name: 'network-video-export-test',
    transform(code, id) {
      if (id.replaceAll('\\', '/').endsWith('/src/renderer.js')) {
        return { code: code + '\nwindow.fixtureExportHTML = () => renderedHTMLForExport();', map: null };
      }
    }
  }],
  server: { host: '127.0.0.1', port: 0, watch: null, hmr: false },
  logLevel: 'error'
});
let browser;
const held = new Set();
try {
  await server.listen();
  const origin = new URL(server.resolvedUrls.local[0]).origin;
  browser = await chromium.launch({ headless: true, executablePath: process.env.BROWSER_EXECUTABLE || undefined });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const errors = [], observed = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.route('**/*', route => {
    const url = new URL(route.request().url());
    if (url.origin === origin) return route.continue();
    if (url.hostname === 'video.mockcdn.example.com') {
      observed.push(route.request().url());
      // Leave approved data pending while testing the rendered export. An
      // unauthorized request is recorded and blocked, not sent to the network.
      if (route.request().url() === remote) { held.add(route); return; }
    }
    return route.abort();
  });
  await page.goto(origin);
  await page.waitForFunction(() => window.quilliteMarkdown && window.fixtureExportHTML);
  await page.evaluate(({ fixture, packageFixture }) => {
    const docs = [fixture, packageFixture], calls = window.mediaBridgeCalls = [];
    Object.assign(window.quilliteMarkdown, {
      openFile: async () => ({ ...docs.shift() }),
      readFile: async path => ({ ...(path === fixture.path ? fixture : packageFixture) }),
      reportErrorLog: async () => {},
      beginLocalVideo: async () => { calls.push('beginLocalVideo'); throw new Error('unexpected local playback'); },
      endLocalVideo: async () => calls.push('endLocalVideo'),
      openExternal: async () => calls.push('openExternal'),
      detectPandoc: async () => ({ available: true, path: '/fixture/pandoc', version: 'fixture' }),
      exportWithPandoc: async () => calls.push('exportWithPandoc')
    });
  }, { fixture, packageFixture });
  await page.locator('#openFileButton').click();
  const reader = page.locator('#markdownContent');
  const card = reader.locator('.qm-local-video--network');
  await card.waitFor();
  assert.equal(await card.locator('.qm-local-video__title').textContent(), 'video.mockcdn.example.com');
  assert.equal(await reader.locator('video,source,[poster]').count(), 0, 'authored media must not reach the live document');
  assert.equal(await reader.getByRole('link', { name: 'Ordinary link' }).count(), 1);
  assert.ok(!(await reader.innerHTML()).includes('synth%2Fprivate'), 'signed query not exposed in the inert DOM');
  const load = card.locator('.qm-local-video__action').first();
  await load.evaluate(button => button.click());
  await page.waitForTimeout(180);
  assert.deepEqual(observed, [], 'open or an untrusted click must not contact the host');
  assert.equal(await reader.locator('video').count(), 0);

  const requestPromise = page.waitForRequest(request => request.url() === remote);
  await load.click();
  const request = await requestPromise;
  assert.equal((await request.allHeaders()).referer, undefined, 'external playback must omit the app referrer');
  const player = card.locator('.qm-local-video__player');
  await player.waitFor();
  assert.equal(await player.getAttribute('src'), remote, 'signed URL was not rewritten');
  assert.equal(await player.getAttribute('poster'), null);
  assert.deepEqual(await page.evaluate(() => mediaBridgeCalls), [], 'online playback uses no local or external-launch bridge');
  const html = await page.evaluate(() => fixtureExportHTML());
  assert.match(html, /qm-video-static/);
  assert.match(html, /video\.mockcdn\.example\.com/);
  assert.doesNotMatch(html, /<video\b|<source\b|\bposter=|synth%2Fprivate|__quillite_video/i);
  assert.equal(await player.count(), 1, 'static export must not interrupt the live player');
  assert.ok(observed.every(url => url === remote), JSON.stringify(observed));

  await page.locator('#documentExportButton').click();
  await page.locator('#exportAdvancedFormats > summary').click();
  await page.locator('[data-export-format="epub"]').click();
  await page.locator('#confirmExportCenter').click();
  await page.locator('#toastMessage').filter({ hasText: /含视频的文档请用内置导出格式|use a built-in export format/i }).waitFor();
  assert.deepEqual(await page.evaluate(() => mediaBridgeCalls), [], 'raw video Markdown is not sent to Pandoc');
  await page.locator('#closeExportCenter').click();

  await page.locator('#closePreviewButton').click();
  assert.equal(await reader.locator('video').count(), 0);
  const previousRequests = observed.length;
  await page.locator('#openFileButton').click();
  await reader.getByRole('heading', { name: 'Network package fixture' }).waitFor();
  await page.waitForTimeout(180);
  assert.equal(await reader.locator('video, .qm-local-video__action').count(), 0, 'untrusted document packages do not offer media playback');
  assert.equal(observed.length, previousRequests, 'opening a package must not contact its video source');
  assert.deepEqual(errors, []);
  console.log('PASS chromium: trusted network-video click only, exact URL with no referrer, static export, no Pandoc dispatch, inert package');
} finally {
  await Promise.allSettled([...held].map(route => route.abort()));
  await browser?.close();
  server.httpServer.closeAllConnections?.();
  await server.close();
}
