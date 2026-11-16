// Full app / CodeMirror browser smoke. Real media decode + seek use an
// explicitly supplied synthetic fixture; no native picker or external CDN.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';

const fixture = process.env.LOCAL_VIDEO_TEST_FILE;
const format = fixture?.split('.').at(-1).toLowerCase();
if (!['mp4', 'webm'].includes(format)) throw new Error('Set LOCAL_VIDEO_TEST_FILE to a synthetic playable MP4 or WebM');
const bytes = await readFile(fixture);
const mediaPath = '/__quillite_video/' + 'a'.repeat(64) + '.' + format;
const signed = 'https://media.example.com/clips/%2f?signature=a%2B%3D&flag=%20';
const localRef = 'assets/第一个视频.' + format;
const nextRef = 'assets/更换的视频.' + format;
const finalRef = 'assets/最终的视频.' + format;
const blockedHost = 'unsafe.example.com';
const documentPath = '/inline-video/review.md';
const requested = [];
const startText = [
  '# Inline video test',
  `<video src="${localRef}" />`,
  'Nearby paragraph.',
  `<video src="${signed.replaceAll('&', '&amp;')}" controls></video>`,
  `<div>Raw media <video autoplay poster="https://${blockedHost}/poster.png"><source src="https://${blockedHost}/raw.${format}"><img src="https://${blockedHost}/fallback.png"></video></div>`,
  ['```html', `<video src="assets/example.${format}"></video>`, '```'].join('\n'),
  'Quiet ending.'
].join('\n\n');

const server = await createServer({
  root: fileURLToPath(new URL('..', import.meta.url)),
  plugins: [{ name: 'inline-local-fixture', configureServer(server) { server.middlewares.use((request, response, next) => {
    if (request.url !== mediaPath) return next();
    const range = request.headers.range;
    const responseData = mediaResponse(range);
    requested.push({ url: 'http://' + request.headers.host + mediaPath, range });
    response.writeHead(responseData.status, { ...responseData.headers, 'Content-Type': responseData.contentType });
    response.end(request.method === 'HEAD' ? undefined : responseData.body);
  }); } }],
  server: { host: '127.0.0.1', port: 0, watch: null, hmr: false }, logLevel: 'error'
});
function mediaResponse(header) {
  const range = /^bytes=(\d+)-(\d*)$/.exec(header || '');
  const start = range ? Number(range[1]) : 0;
  const end = range?.[2] ? Math.min(bytes.length - 1, Number(range[2])) : bytes.length - 1;
  if (start > end) return { status: 416, contentType: 'video/' + format, headers: { 'Content-Range': `bytes */${bytes.length}` }, body: '' };
  return {
    status: range ? 206 : 200, contentType: 'video/' + format, body: bytes.subarray(start, end + 1),
    headers: { 'accept-ranges': 'bytes', 'content-length': String(end - start + 1),
      ...(range ? { 'content-range': `bytes ${start}-${end}/${bytes.length}` } : {}) }
  };
}
const pw = createRequire(import.meta.url)(process.env.PLAYWRIGHT_MODULE || 'playwright');
const engine = process.env.LOCAL_VIDEO_BROWSER || 'chromium';
let browser;
try {
  await server.listen();
  const origin = new URL(server.resolvedUrls.local[0]).origin;
  browser = await pw[engine].launch({ headless: true, ...(engine === 'chromium' && process.env.BROWSER_EXECUTABLE
    ? { executablePath: process.env.BROWSER_EXECUTABLE } : {}) });
  const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  if (process.env.INLINE_VIDEO_TRACE) {
    page.on('console', message => console.log('[page]', message.text()));
    page.on('pageerror', error => console.log('[page error]', error));
  }
  const trace = message => { if (process.env.INLINE_VIDEO_TRACE) console.log(message); };
  await page.route('**/*', route => {
    const url = new URL(route.request().url());
    if (url.href === signed) {
      requested.push({ url: url.href, range: route.request().headers().range });
      return route.fulfill(mediaResponse(route.request().headers().range));
    }
    if (url.hostname === blockedHost) { requested.push({ url: url.href }); return route.abort(); }
    return url.origin === origin ? route.continue() : route.abort();
  });
  await page.addInitScript(emulateNetworkMedia => {
    localStorage.setItem('editorPresentation', 'live');
    localStorage.setItem('editorLayout', 'editor-only');
    localStorage.setItem('spellcheckEnabled', 'false');
    if (emulateNetworkMedia) {
      // WebKit may delegate HTTPS requests outside Playwright. Exercise
      // assignment/retention without making a real remote request there.
      const native = Object.getOwnPropertyDescriptor(HTMLMediaElement.prototype, 'src');
      const play = HTMLMediaElement.prototype.play;
      Object.defineProperty(HTMLMediaElement.prototype, 'src', {
        ...native, set(src) {
          if (String(src).startsWith('https:')) this.inlineTestNetworkSource = src;
          else native.set.call(this, src);
        }
      });
      HTMLMediaElement.prototype.play = function () {
        return this.inlineTestNetworkSource ? Promise.resolve() : play.call(this);
      };
    }
  }, engine === 'webkit');
  await page.goto(origin);
  await page.waitForFunction(() => window.quilliteMarkdown && document.querySelector('#fileList')?.childElementCount);
  await page.evaluate(({ source, documentPath, mediaPath }) => {
    const file = { path: documentPath, name: 'review.md', directory: '/inline-video', content: source, revision: 'a'.repeat(64) };
    const log = window.inlineVideoFixture = { begin: [], end: [] };
    Object.assign(window.quilliteMarkdown, {
      openFile: async () => ({ ...file }), readFile: async () => ({ ...file }),
      canEditFile: async () => true, saveFile: async (_path, content) => ({ ...file, content }),
      reportErrorLog: async () => {}, beginLocalVideo: async (...args) => { log.begin.push(args); return mediaPath; },
      endLocalVideo: async url => { log.end.push(url); }
    });
  }, { source: startText, documentPath, mediaPath });

  await page.locator('#openFileButton').click();
  await page.locator('#markdownContent').getByRole('heading', { name: 'Inline video test' }).waitFor();
  await page.locator('#editButton').click();
  trace('entered live editing');
  const editor = page.locator('#markdownEditor > .cm-editor');
  const content = editor.locator('> .cm-scroller > .cm-content');
  const cards = editor.locator('.cm-live-video');
  const nativePlayer = editor.locator('video.qm-local-video__player');
  const activeLocal = name => cards.filter({ hasText: name });
  const online = cards.filter({ hasText: 'media.example.com' });
  await cards.first().waitFor();
  await online.waitFor();
  trace('both inline cards present');
  assert.equal(await cards.count(), 2, 'only top-level supported video blocks become inline widgets');
  assert.equal(await page.locator('#editorPreviewContent').isVisible(), false, 'no split is needed for editing playback');
  assert.deepEqual(await editor.locator('video, audio, iframe, source, img[src*="unsafe.example.com"]')
    .evaluateAll(nodes => nodes.map(node => node.outerHTML)), [], 'unsupported raw HTML cannot mount active media');
  assert.deepEqual(requested, [], 'opening a document and entering live edit must not request media');
  const clickLocal = name => activeLocal(name).getByRole('button', { name: /加载并播放|Load and play/ }).click();
  const log = () => page.evaluate(() => inlineVideoFixture);
  const moveTo = (where = 'end') => editor.evaluate(async (node, where) => {
    const { EditorView } = await import('/node_modules/@codemirror/view/dist/index.js');
    const view = EditorView.findFromDOM(node);
    const anchor = where === 'end' ? view.state.doc.length : view.state.doc.toString().indexOf(where);
    if (anchor < 0) throw new Error('fixture line not found: ' + where);
    view.dispatch({ selection: { anchor }, scrollIntoView: true });
    view.focus();
  }, where);
  const replaceReference = (old, next) => editor.evaluate(async (node, refs) => {
    const { EditorView } = await import('/node_modules/@codemirror/view/dist/index.js');
    const view = EditorView.findFromDOM(node), from = view.state.doc.toString().indexOf(refs.old);
    if (from < 0) throw new Error('original source not found');
    view.dispatch({ changes: { from, to: from + refs.old.length, insert: refs.next } });
  }, { old, next });
  const seek = async target => nativePlayer.evaluate(async (video, target) => {
    video.pause();
    if (!video.videoWidth || !Number.isFinite(video.duration) || video.duration < 0.3) throw new Error('A real finite clip is required');
    const wanted = target ?? video.duration * 0.64;
    await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('seek event timed out')), 7000);
      video.addEventListener('seeked', () => { clearTimeout(timer); resolve(); }, {once: true});
      video.currentTime = wanted;
    });
    return { current: video.currentTime, wanted };
  }, target);
  const waitForVideo = () => page.waitForFunction(() => document.querySelector('#markdownEditor .cm-live-video video')?.readyState >= 2);
  const expectReleased = async count => {
    await page.waitForFunction(count => inlineVideoFixture.end.length === count, count);
    await nativePlayer.waitFor({ state: 'detached' });
  };

  await clickLocal(localRef.split('/').at(-1));
  await waitForVideo();
  trace('local clip decoded');
  const position = await seek();
  assert.ok(Math.abs(position.current - position.wanted) <= 0.3, 'inline player delivers a decoded seekable clip');
  assert.ok(requested.some(request => request.url === origin + mediaPath && request.range));
  assert.deepEqual((await log()).begin, [[documentPath, localRef]]);
  const before = await nativePlayer.evaluate(video => {
    video.volume = 0.37;
    const ancestor = new Set();
    const scope = document.querySelector('#markdownEditor');
    for (let node = video; node && node !== scope; node = node.parentNode) ancestor.add(node);
    const marker = window.inlinePlayerMarker = { video, removed: 0 };
    marker.observer = new MutationObserver(records => {
      for (const record of records) for (const node of record.removedNodes) if (ancestor.has(node)) marker.removed++;
    });
    marker.observer.observe(scope, { childList: true, subtree: true });
    return { time: video.currentTime, volume: video.volume };
  });
  await moveTo('Nearby paragraph.');
  await page.keyboard.insertText('Notes typed during inline playback. ');
  await content.getByText(/Notes typed during inline playback/).waitFor();
  await nativePlayer.waitFor();
  assert.deepEqual(await nativePlayer.evaluate(video => ({
    same: video === inlinePlayerMarker.video, connected: video.isConnected, removed: inlinePlayerMarker.removed,
    time: video.currentTime, volume: video.volume
  })), { same: true, connected: true, removed: 0, ...before });
  assert.deepEqual((await log()).end, [], 'unrelated typing must not revoke the active native lease');
  await page.evaluate(() => inlinePlayerMarker.observer.disconnect());

  // The widget's source action reveals editable HTML and revokes the player.
  await activeLocal(localRef.split('/').at(-1)).locator('.cm-live-video__source').click();
  await expectReleased(1);
  trace('source opened; first lease released');
  await editor.locator('.cm-live-video.is-source-open').waitFor();
  await replaceReference(localRef, nextRef);
  await editor.locator('.cm-live-video.is-source-open .cm-live-video__source').click();
  await activeLocal(nextRef.split('/').at(-1)).waitFor();
  assert.equal(await nativePlayer.count(), 0, 'closing source or changing the reference must not play automatically');
  await clickLocal(nextRef.split('/').at(-1));
  await waitForVideo();
  trace('replacement clip decoded');

  // Source-changing operations (e.g. undo/redo or replace) can also change a
  // reference when the rendered player still owns an active native lease.
  await replaceReference(nextRef, finalRef);
  await expectReleased(2);
  await activeLocal(finalRef.split('/').at(-1)).waitFor();
  await clickLocal(finalRef.split('/').at(-1));
  await waitForVideo();

  // Switching to the network card is an explicit gesture and keeps only one
  // inline stream active. Its exact signed source must be absent before then.
  assert.ok(!requested.some(request => request.url === signed));
  assert.doesNotMatch(await online.evaluate(node => node.outerHTML), /signature|<video/i);
  const requestedNetwork = engine === 'webkit' ? null : page.waitForRequest(request => request.url() === signed);
  await online.getByRole('button', { name: /联网播放|Play online/ }).click();
  if (requestedNetwork) await requestedNetwork;
  trace('online playback explicitly requested');
  await page.waitForFunction(() => inlineVideoFixture.end.length === 3);
  assert.equal(await nativePlayer.count(), 1);
  assert.equal(await nativePlayer.evaluate(video => video.inlineTestNetworkSource || video.getAttribute('src')), signed);
  const beforeToggle = await log();
  assert.deepEqual(beforeToggle.begin, [[documentPath, localRef], [documentPath, nextRef], [documentPath, finalRef]],
    'a changed source uses a new lease; online playback does not request a native lease');
  await page.locator('[data-editor-presentation=source]').click();
  await nativePlayer.waitFor({ state: 'detached' });
  assert.equal(await cards.count(), 0, 'global source editor presents Markdown without player widgets');

  await page.locator('[data-editor-presentation=live]').click();
  await clickLocal(finalRef.split('/').at(-1));
  await waitForVideo();
  await page.locator('#restoreLivePreviewButton').click();
  const split = page.locator('#editorPreviewContent');
  const splitLoad = split.locator('.qm-local-video').filter({ hasText: finalRef.split('/').at(-1) })
    .getByRole('button', { name: /加载并播放|Load and play/ });
  await splitLoad.waitFor();
  assert.equal(await nativePlayer.count(), 1, 'opening split alone retains the playing inline card');
  assert.equal((await log()).end.length, 3);
  await splitLoad.click();
  await expectReleased(4);
  await page.waitForFunction(() => document.querySelector('#editorPreviewContent video')?.readyState >= 2);
  assert.equal(await split.locator('video.qm-local-video__player').count(), 1,
    'split preview and inline editor share a single active playing slot');
  await page.locator('#hideLivePreviewButton').click();
  await page.waitForFunction(() => inlineVideoFixture.end.length === 5);
  await clickLocal(finalRef.split('/').at(-1));
  await waitForVideo();
  await page.locator('#exitEditButton').click();
  await expectReleased(6);
  assert.equal(await page.locator('#markdownContent video').count(), 0, 'reader transition does not auto-play');
  assert.ok(!requested.some(request => request.url.includes(blockedHost)), 'raw HTML must not fetch hidden playback or fallback media');
  assert.deepEqual((await log()).end, Array(6).fill(mediaPath));
  assert.deepEqual(errors, []);
  console.log(`PASS ${engine}: inline ${format} decoded and sought, source/state retained, HTTPS consent and release verified`);
} finally {
  await browser?.close();
  server.httpServer.closeAllConnections?.();
  await server.close();
}
