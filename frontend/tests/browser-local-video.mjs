import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';

const pw = createRequire(import.meta.url)(process.env.PLAYWRIGHT_MODULE || 'playwright');
const engine = process.env.LOCAL_VIDEO_BROWSER || 'chromium';
const server = await createServer({ root: fileURLToPath(new URL('..', import.meta.url)),
  server: { host: '127.0.0.1', port: 0, watch: null, hmr: false }, logLevel: 'error' });
let browser;
try {
  await server.listen();
  const origin = new URL(server.resolvedUrls.local[0]).origin;
  const stream = '/__quillite_video/' + 'a'.repeat(64) + '.mp4';
  const webmStream = '/__quillite_video/' + 'b'.repeat(64) + '.webm';
  const signed = 'https://media.example.com/clip/%2f?signature=a%2B%3D&flag=%20';
  browser = await pw[engine].launch({ headless: true,
    ...(engine === 'chromium' && process.env.BROWSER_EXECUTABLE ? { executablePath: process.env.BROWSER_EXECUTABLE } : {}) });
  const page = await browser.newPage();
  const requested = [], outstanding = [];
  await page.route('**/*', route => {
    const url = new URL(route.request().url());
    if (url.pathname === '/video-fixture') return route.fulfill({ contentType: 'text/html',
      body: '<meta name="referrer" content="no-referrer"><article id="markdownContent"></article>' });
    if (url.href === origin + stream || url.href === origin + webmStream || url.href === signed) {
      requested.push(url.href); outstanding.push(route); return;
    }
    if (url.origin !== origin) { requested.push(url.href); return route.abort(); }
    return route.continue();
  });
  await page.goto(origin + '/video-fixture');
  await page.evaluate(async emulateNetworkMedia => {
    const { findRetainedVideoCard, prepareDocumentVideos, releaseLocalVideos, flattenDocumentVideos, localVideoMarkdownExtensions } = await import('/src/local-video.js');
    const { Marked } = await import('/node_modules/marked/lib/marked.esm.js');
    const { default: DOMPurify } = await import('/node_modules/dompurify/dist/purify.es.mjs');
    const doc = new Marked({ extensions: localVideoMarkdownExtensions });
    const host = document.querySelector('#markdownContent');
    // WebKit may delegate HTTPS media loading to a system process, outside
    // Playwright's request interception. Do not make a real CDN request from
    // the fixture there: record the exact assigned source at the DOM boundary.
    if (emulateNetworkMedia) {
      const native = Object.getOwnPropertyDescriptor(HTMLMediaElement.prototype, 'src');
      const nativePlay = HTMLMediaElement.prototype.play;
      Object.defineProperty(HTMLMediaElement.prototype, 'src', {
        ...native, set(url) {
          if (String(url).startsWith('https:')) this.fixtureNetworkSource = url;
          else native.set.call(this, url);
        }
      });
      HTMLMediaElement.prototype.play = function () {
        return this.fixtureNetworkSource ? Promise.resolve() : nativePlay.call(this);
      };
    }
    const begin = [], end = [], external = [], externalNetwork = [], pending = [];
    const bridge = {
      beginLocalVideo(path, ref) { begin.push([path, ref]); return new Promise(resolve => pending.push(resolve)); },
      endLocalVideo(url) { end.push(url); },
      openLocalVideoExternally(path, ref) { external.push([path, ref]); },
      openExternal(url) { externalNetwork.push(url); }
    };
    const fragment = (markdown, enabled = true, session = 41) => {
      const template = document.createElement('template');
      template.innerHTML = DOMPurify.sanitize(doc.parse(markdown));
      return prepareDocumentVideos(template.content, {
        enabled, documentPath: 'C:/docs/test.md', session, bridge, t: value => value
      });
    };
    const mount = (markdown, enabled = true, session = 41) => {
      releaseLocalVideos(host);
      host.replaceChildren(fragment(markdown, enabled, session));
    };
    window.videoFixture = { begin, end, external, externalNetwork, pending, mount,
      retaining: (markdown, enabled, session) => Boolean(findRetainedVideoCard(host, fragment(markdown, enabled, session))),
      flatten: () => {
      const clone = host.cloneNode(true);
      return flattenDocumentVideos(clone, value => value).innerHTML;
    } };
  }, engine === 'webkit');

  await page.evaluate(() => videoFixture.mount([
    '<video controls autoplay poster="https://outside.invalid/poster.png" src="assets/演示.mp4" />',
    '# Following',
    '',
    '<video src="http://127.0.0.1:36666/remote.mp4"></video>',
    '',
    '<audio autoplay src="http://127.0.0.1:36666/sound.mp3"></audio>',
    '',
    '<video><source src="https://outside.invalid/remote.mp4"></video>',
    '',
    '<video src="C:/NUL.mp4"></video>',
    '',
    '<div class="qm-local-video"><button>localVideoLoad</button></div>'
  ].join('\n')));
  const host = page.locator('#markdownContent');
  await host.getByRole('heading', { name: 'Following' }).waitFor();
  assert.equal(await host.locator('video, audio, source, track').count(), 0);
  const load = host.locator('.qm-local-video__action').filter({ hasText: 'localVideoLoad' });
  assert.equal(await load.count(), 1, 'only the authorized video shape has a load action');
  await load.evaluate(button => button.click());
  assert.equal(await page.evaluate(() => videoFixture.begin.length), 0, 'synthetic click must not request a capability');
  assert.deepEqual(requested, [], 'nothing from document-specified media was requested before a gesture');
  await load.click();
  assert.deepEqual(await page.evaluate(() => videoFixture.begin), [['C:/docs/test.md','assets/演示.mp4']]);
  // Changing documents/preview while a native call is pending must revoke the
  // late capability even though no player was ever created.
  await page.evaluate(() => videoFixture.mount('Replacement document'));
  await page.evaluate(url => videoFixture.pending.shift()(url), stream);
  await page.waitForFunction(() => videoFixture.end.length === 1);
  assert.deepEqual(await page.evaluate(() => videoFixture.end), [stream]);
  assert.deepEqual(requested, []);

  await page.evaluate(() => videoFixture.mount('<video src="assets/hidden.mp4" />', false));
  assert.equal(await load.count(), 0, 'a disallowed package never acquires a player');
  await page.evaluate(() => videoFixture.mount('<video src="C:/docs/assets/next.WeBm" />'));
  for (const malformed of [origin + webmStream, '//localhost' + webmStream, webmStream + '?query=1',
    '%2f' + webmStream, 'http://127.0.0.1:24444/media/abcdef', stream]) {
    await load.click();
    await page.evaluate(url => videoFixture.pending.shift()(url), malformed);
    await host.getByText('localVideoUnavailable').waitFor();
    assert.equal(await host.locator('video').count(), 0, 'invalid capability never becomes a source');
  }
  assert.deepEqual(await page.evaluate(() => videoFixture.end), [stream,stream],
    'a genuine lease with the wrong format is revoked without mounting a player');
  assert.deepEqual(requested, [], 'rejected capability URLs never reached the browser');
  await load.click();
  await page.evaluate(url => videoFixture.pending.shift()(url), webmStream);
  const player = host.locator('video.qm-local-video__player');
  await player.waitFor();
  assert.equal(await player.getAttribute('src'), webmStream);
  assert.equal(await player.evaluate(video => video.controls && !video.autoplay), true);
  const html = await page.evaluate(() => videoFixture.flatten());
  assert.match(html, /next\.WeBm/);
  assert.doesNotMatch(html, /<video|__quillite_video|127\.0\.0\.1|C:\/docs|<button/i);
  await host.locator('.qm-local-video__action').filter({ hasText: 'localVideoClose' }).click();
  await page.waitForFunction(() => videoFixture.end.length === 3);
  assert.equal(await player.count(), 0);
  await host.locator('.qm-local-video__action').filter({ hasText: 'localVideoOpenExternally' }).click();
  assert.deepEqual(await page.evaluate(() => videoFixture.external), [['C:/docs/test.md','C%3A/docs/assets/next.WeBm']]);

  const networkMarkup = `<video autoplay poster="https://cdn.example.com/dont-request.png" src="${signed.replaceAll('&','&amp;')}" />\n\n` +
    '[Platform webpage](https://www.youtube.com/watch?v=example)';
  const legacy = `<div><video src="${signed.replaceAll('&','&amp;')}" />` +
    '<img src="https://cdn.example.com/fallback.png">' +
    '<style>p { background-image: url(https://cdn.example.com/style.png) }</style>' +
    '<p style="background-image: url(https://cdn.example.com/inline-style.png)">Trailing <strong>prose</strong></p>' +
    '<picture><source srcset="https://cdn.example.com/fallback.webp"><img src="https://cdn.example.com/picture.png"></picture></div>';
  await page.evaluate(markup => videoFixture.mount(markup), legacy);
  assert.equal(await host.locator('video, img, source, picture, style, [style]').count(), 0, 'video fallback has only inert text/formatting');
  assert.equal(await host.getByText('Trailing prose').count(), 1, 'ordinary text after nested Typora shorthand is preserved');
  assert.equal(await host.locator('strong').textContent(), 'prose');
  assert.ok(!requested.some(url => url.startsWith('https://')), 'fallback images and CSS never request remote data');
  await page.evaluate(markup => videoFixture.mount(markup), networkMarkup);
  const network = host.locator('.qm-local-video--network');
  const networkLoad = network.getByRole('button', { name: 'networkVideoLoad' });
  assert.equal(await network.locator('.qm-local-video__title').textContent(), 'media.example.com');
  assert.match(await network.textContent(), /networkVideoNotice/);
  assert.ok(!requested.includes(signed), 'body rendering must not fetch the direct video');
  assert.doesNotMatch(await network.evaluate(el => el.outerHTML), /signature|cdn\.example|<video/i);
  assert.equal(await host.getByRole('link', { name: 'Platform webpage' }).count(), 1);
  await networkLoad.evaluate(button => button.click());
  assert.equal(await network.locator('video').count(), 0, 'network also requires a trusted click');
  const nextRequest = engine === 'webkit' ? null : page.waitForRequest(req => req.url() === signed);
  await networkLoad.click();
  if (nextRequest) assert.equal((await nextRequest).headers().referer, undefined);
  assert.equal(await network.locator('video').evaluate(video => video.fixtureNetworkSource || video.getAttribute('src')), signed);
  assert.equal(await network.locator('video').getAttribute('autoplay'), null);
  const seekNotice = network.getByText('networkVideoSeekLimited');
  assert.equal(await seekNotice.isVisible(), false, 'unloaded streams must not infer a seeking restriction');
  await network.locator('video').evaluate(video => {
    const ranges = end => ({length: 1, start: () => 0, end: () => end});
    Object.defineProperties(video, {
      readyState: {value: 2, configurable: true}, duration: {value: 60, configurable: true},
      buffered: {value: ranges(5), configurable: true}, seekable: {value: ranges(5), configurable: true}
    });
    video.dispatchEvent(new Event('progress'));
  });
  assert.equal(await seekNotice.isVisible(), true, 'limited loaded range gets a nonterminal hint');
  await network.locator('video').evaluate(video => {
    Object.defineProperty(video, 'seekable', {value: {length: 1, start: () => 0, end: () => 60}, configurable: true});
    video.dispatchEvent(new Event('progress'));
  });
  assert.equal(await seekNotice.isVisible(), false, 'later seekable ranges clear the hint');
  assert.match(await page.evaluate(() => videoFixture.flatten()), /media\.example\.com/);
  assert.doesNotMatch(await page.evaluate(() => videoFixture.flatten()), /signature|<video|src=/);
  assert.deepEqual(await page.evaluate(([same, different]) => [
    videoFixture.retaining(same + '\n\nEdited paragraph', true, 41),
    videoFixture.retaining(same, true, 42),
    videoFixture.retaining(same, false, 41),
    videoFixture.retaining(different, true, 41),
    videoFixture.retaining(same + '\n\n' + same, true, 41)
  ], [networkMarkup, networkMarkup.replace('signature=a', 'signature=b')]), [true,false,false,false,false]);
  await network.getByRole('button', { name: 'networkVideoOpenExternally' }).click();
  assert.deepEqual(await page.evaluate(() => videoFixture.externalNetwork), [signed]);
  await network.getByRole('button', { name: 'localVideoClose' }).click();
  assert.equal(await player.count(), 0);
  assert.equal(await page.evaluate(() => videoFixture.end.length), 3, 'online release never revokes a local lease');
  await Promise.allSettled(outstanding.map(route => route.abort()));
  console.log(`PASS ${engine}: local and HTTPS playback require a trusted gesture; stale capability revoked; export is static`);
} finally {
  await browser?.close();
  server.httpServer.closeAllConnections?.();
  await server.close();
}
