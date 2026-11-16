import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';

const pw = createRequire(import.meta.url)(process.env.PLAYWRIGHT_MODULE || 'playwright');
const engine = process.env.LOCAL_VIDEO_BROWSER || 'chromium';
const fixture = process.env.LOCAL_VIDEO_TEST_FILE ? await readFile(process.env.LOCAL_VIDEO_TEST_FILE) : null;
const server = await createServer({ root: fileURLToPath(new URL('..', import.meta.url)),
  server: { host: '127.0.0.1', port: 0, watch: null, hmr: false }, logLevel: 'error' });
let browser;
try {
  await server.listen();
  const origin = new URL(server.resolvedUrls.local[0]).origin;
  const stream = '/__quillite_video/' + 'f'.repeat(64) + '.mp4';
  const remote = 'https://media.example.com/play.mp4?token=synthetic%2Btoken&expires=123';
  browser = await pw[engine].launch({ headless: true,
    ...(engine === 'chromium' && process.env.BROWSER_EXECUTABLE ? { executablePath: process.env.BROWSER_EXECUTABLE } : {}) });
  const page = await browser.newPage();
  const requests = [];
  await page.route('**/*', route => {
    const url = new URL(route.request().url());
    if (url.href === origin + '/video-persistence-fixture') {
      return route.fulfill({ contentType: 'text/html', body: '<article id="editorPreviewContent"></article>' });
    }
    if (url.href === origin + stream || url.href === remote) {
      requests.push(url.href);
      if (!fixture) return; // Leave decoding pending; no response or navigation races.
      const range = /^bytes=(\d+)-(\d*)$/.exec(route.request().headers().range || '');
      const start = range ? Number(range[1]) : 0;
      const end = range?.[2] ? Math.min(fixture.length - 1, Number(range[2])) : fixture.length - 1;
      return route.fulfill({
        status: range ? 206 : 200, contentType: 'video/mp4', body: fixture.subarray(start, end + 1),
        headers: { 'accept-ranges': 'bytes', ...(range ? { 'content-range': `bytes ${start}-${end}/${fixture.length}` } : {}) },
      });
    }
    return url.origin === origin ? route.continue() : route.abort();
  });
  await page.goto(origin + '/video-persistence-fixture');
  await page.evaluate(() => {
    const imports = Promise.all([import('/src/local-video.js'),
      import('/src/video-playback-persistence.js'), import('/node_modules/dompurify/dist/purify.es.mjs')]);
    window.videoFixtureReady = imports.then(([videos, playback, {default: purifier}]) => {
      const host = document.querySelector('#editorPreviewContent');
      const begin = [], end = [];
      let resolve;
      const bridge = {
        beginLocalVideo(path, ref) { begin.push([path, ref]); return new Promise(res => { resolve = res; }); },
        endLocalVideo(url) { end.push(url); },
        openExternal() {},
      };
      const mount = (html, {path = '/notes.md', session = 1} = {}) => {
        const template = document.createElement('template');
        template.innerHTML = purifier.sanitize(html);
        videos.prepareDocumentVideos(template.content, { enabled: true, documentPath: path, session, bridge, t: key => key });
        const pair = videos.findRetainedVideoCard(host, template.content);
        if (pair) videos.releaseLocalVideos(host, {except: pair.current});
        const retained = playback.reconcileVideoPlayback(host, template.content, pair);
        if (!retained) {
          videos.releaseLocalVideos(host);
          host.replaceChildren(template.content);
        }
        return retained;
      };
      const track = () => {
        const video = host.querySelector('video');
        const path = new Set();
        for (let node = video; node && node !== host; node = node.parentNode) path.add(node);
        let removals = 0;
        const observer = new MutationObserver(records => {
          for (const record of records) for (const node of record.removedNodes) if (path.has(node)) removals++;
        });
        observer.observe(host, {subtree: true, childList: true});
        return {
          snapshot() {
            return { same: video === host.querySelector('video'), connected: video.isConnected,
              paused: video.paused, currentTime: video.currentTime, volume: video.volume, muted: video.muted, removals };
          },
          disconnect: () => observer.disconnect(),
        };
      };
      Object.assign(window, { videoFixture: { mount, begin, end, track, resolve: url => resolve(url) } });
    });
    return window.videoFixtureReady;
  });
  const host = page.locator('#editorPreviewContent');
  const load = host.getByRole('button', {name: /VideoLoad/i});
  const render = (html, scope) => page.evaluate(({html, scope}) => videoFixture.mount(html, scope), {html, scope});
  const local = '<video src="assets/test.mp4"></video>';
  const row = (html, heading = 'After', anchor = 'source-a') =>
    `<p>Before</p><blockquote><details><summary>Watch</summary><p>Nested text</p>${html.replace('<video ', `<video data-qm-source="${anchor}" `)}</details></blockquote><h2>${heading}</h2>`;

  assert.equal(await render(row(local)), false);
  await host.locator('summary').click();
  await load.click();
  assert.deepEqual(await page.evaluate(() => videoFixture.begin), [['/notes.md', 'assets/test.mp4']]);
  // A same-source text edit may happen while the native capability is pending.
  assert.equal(await render(row(local, 'While waiting', 'source-b')), true);
  await host.getByRole('heading', { name: 'While waiting' }).waitFor();
  assert.equal(await host.locator('details').getAttribute('open'), '');
  await page.evaluate(url => videoFixture.resolve(url), stream);
  await host.locator('video').waitFor();
  if (fixture) await page.waitForFunction(() => document.querySelector('#editorPreviewContent video')?.readyState >= 2);
  const beforeLocal = await page.evaluate(async () => {
    const video = document.querySelector('video');
    video.pause();
    video.volume = 0.42;
    video.muted = true;
    if (video.readyState && Number.isFinite(video.duration) && video.duration > 0) {
      const seeking = new Promise(resolve => video.addEventListener('seeked', resolve, {once: true}));
      video.currentTime = video.duration / 3;
      await seeking;
    }
    window.trackedVideo = videoFixture.track();
    return trackedVideo.snapshot();
  });
  for (const heading of ['Edited', 'Edited again', 'Final']) {
    assert.equal(await render(row(local, heading, 'new-anchor')), true);
    await host.getByRole('heading', {name: heading}).waitFor();
  }
  assert.equal(await host.locator('.qm-local-video').getAttribute('data-qm-source'), 'new-anchor');
  assert.deepEqual(await page.evaluate(() => trackedVideo.snapshot()), beforeLocal,
    'editing surrounding text preserves the actual paused player and its playback state without detaching ancestors');
  await page.evaluate(() => trackedVideo.disconnect());
  assert.deepEqual(await page.evaluate(() => videoFixture.end), []);

  // Changing the source must revoke (not migrate) the local native lease.
  assert.equal(await render(row('<video src="assets/replacement.mp4"></video>')), false);
  await page.waitForFunction(() => videoFixture.end.length === 1);
  assert.deepEqual(await page.evaluate(() => videoFixture.end), [stream]);
  assert.equal(await host.locator('video').count(), 0);

  const online = `<video src="${remote.replaceAll('&', '&amp;')}"></video>`;
  assert.equal(await render(`<p>Before</p>${online}`), false);
  assert.ok(!requests.includes(remote));
  await load.click();
  await host.locator('video').waitFor();
  if (fixture) await page.waitForFunction(() => {
    const player = document.querySelector('#editorPreviewContent video');
    return player && !player.paused && player.currentTime > 0;
  });
  await page.evaluate(() => {
    const video = document.querySelector('video');
    video.volume = 0.3;
    window.trackedVideo = videoFixture.track();
  });
  const beforeOnline = await page.evaluate(() => trackedVideo.snapshot());
  assert.equal(await render(`${online}<h2>Updated order and text</h2>`), true);
  await host.getByRole('heading', {name: 'Updated order and text'}).waitFor();
  const afterOnline = await page.evaluate(() => trackedVideo.snapshot());
  assert.equal(afterOnline.same, true);
  assert.equal(afterOnline.connected, true);
  assert.equal(afterOnline.removals, 0);
  assert.equal(afterOnline.paused, beforeOnline.paused);
  assert.equal(afterOnline.volume, beforeOnline.volume);
  assert.ok(afterOnline.currentTime >= beforeOnline.currentTime, 'playing position does not reset');
  assert.equal(await host.locator('video').getAttribute('src'), remote);
  await page.evaluate(() => trackedVideo.disconnect());
  assert.deepEqual(await page.evaluate(() => videoFixture.begin.length), 1, 'remote playback never asks for a native local lease');

  // Reopening the same filepath creates a new session and no continuation.
  assert.equal(await render(online, {session: 2}), false);
  assert.equal(await host.locator('video').count(), 0);
  await load.click();
  await host.locator('video').waitFor();
  assert.equal(await render('<p>Preview closed or content removed</p>', {session: 2}), false);
  assert.equal(await host.locator('video').count(), 0);
  console.log(`PASS ${engine}: same connected player survives repeated local/online text renders, changed sources/sessions dispose${fixture ? ' (real MP4)' : ''}`);
} finally {
  await browser?.close();
  server.httpServer.closeAllConnections?.();
  await server.close();
}
