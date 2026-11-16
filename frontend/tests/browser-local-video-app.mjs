// Uses a local MP4 or WebM fixture; no real documents, system dialogs, or uploads.
import assert from 'node:assert/strict';
import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';

const fixture = process.env.LOCAL_VIDEO_TEST_FILE;
const format = fixture?.split('.').at(-1).toLowerCase();
if (!['mp4', 'webm'].includes(format)) throw new Error('Set LOCAL_VIDEO_TEST_FILE to a playable local MP4 or WebM fixture');
const screenshotFolder = process.env.VIDEO_DIALOG_SCREENSHOTS;
const size = (await stat(fixture)).size, requests = [];
const mediaPath = '/__quillite_video/' + 'a'.repeat(64) + '.' + format;
function serveMedia(request, response, next) {
  if (request.url !== mediaPath) return next();
  const range = /^bytes=(\d+)-(\d*)$/.exec(request.headers.range || '');
  const start = range ? Number(range[1]) : 0;
  const end = range?.[2] ? Math.min(size - 1, Number(range[2])) : size - 1;
  if (start > end) { response.writeHead(416, { 'Content-Range': `bytes */${size}` }).end(); return; }
  requests.push({ start, end, range: Boolean(range) });
  response.writeHead(range ? 206 : 200, { 'Content-Type': 'video/' + format, 'Accept-Ranges': 'bytes',
    'Content-Length': end - start + 1, ...(range ? { 'Content-Range': `bytes ${start}-${end}/${size}` } : {}) });
  const stream = createReadStream(fixture, { start, end });
  response.on('close', () => stream.destroy());
  stream.on('error', () => response.destroy());
  stream.pipe(response);
}
const server = await createServer({
  root: fileURLToPath(new URL('..', import.meta.url)),
  plugins: [{name:'local-video-fixture', configureServer(server) { server.middlewares.use(serveMedia); }}],
  server: { host: '127.0.0.1', port: 0, watch: null, hmr: false }, logLevel: 'error'
});
const pw = createRequire(import.meta.url)(process.env.PLAYWRIGHT_MODULE || 'playwright');
let browser;
try {
  await server.listen();
  const stream = mediaPath;
  const origin = new URL(server.resolvedUrls.local[0]).origin;
  const engine = process.env.LOCAL_VIDEO_BROWSER || 'chromium';
  browser = await pw[engine].launch({ headless: true,
    ...(engine === 'chromium' && process.env.BROWSER_EXECUTABLE ? { executablePath: process.env.BROWSER_EXECUTABLE } : {}) });
  const page = await browser.newPage({ viewport: { width: 1920, height: 900 } });
  const pageErrors = [];
  page.on('pageerror', error => pageErrors.push(error.message));
  await page.route('**/*', route => {
    const url = new URL(route.request().url());
    return url.origin === origin ? route.continue() : route.abort();
  });
  await page.addInitScript(() => {
    localStorage.setItem('editorPresentation', 'live');
    localStorage.setItem('editorLayout', 'editor-left');
  });
  await page.goto(origin);
  await page.waitForFunction(() => window.quilliteMarkdown && document.querySelector('#fileList')?.childElementCount);
  const source = `<video src="assets/视频.${format}" />\n\n# Heading after Typora markup\n\nLast paragraph.`;
  await page.evaluate(({ stream, source, format }) => {
    const file = { path: '/video-fixture/demo.md', name: 'demo.md', directory: '/video-fixture', content: source, revision: 'a'.repeat(64) };
    const controls = window.localVideoApp = { begin: [], end: [], picks: [], copies: [], dropped: [], saves: [] };
    Object.assign(window.quilliteMarkdown, {
      openFile: async () => ({ ...file }),
      readFile: async () => ({ ...file }),
      canEditFile: async () => true,
      saveFile: async (_path, content) => { controls.saves.push(content); return { ...file, content }; },
      reportErrorLog: async () => {},
      beginLocalVideo: async (...args) => { controls.begin.push(args); return stream; },
      endLocalVideo: async url => { controls.end.push(url); },
      selectLocalVideo: async () => {
        const selection = controls.picks.shift();
        if (selection?.error) throw new Error(selection.error);
        return selection;
      },
      copyLocalVideoToAssets: async (...args) => { controls.copies.push(args); return 'assets/copied.' + format; },
      pathForFile: file => '/video-fixture/' + file.name,
      describeDroppedLocalVideo: async (...args) => {
        controls.dropped.push(args);
        const name = args[1].split('/').at(-1);
        return {reference: 'assets/' + name, name, size: 8000};
      },
    });
  }, { stream, source, format });

  await page.locator('#openFileButton').click();
  const reader = page.locator('#markdownContent');
  await reader.getByRole('heading', { name: 'Heading after Typora markup' }).waitFor();
  const load = reader.locator('.qm-local-video__action').first();
  await load.waitFor();
  assert.equal(requests.length, 0, 'document opening must not read any media');
  await load.click();
  const player = reader.locator('video');
  await page.waitForFunction(() => document.querySelector('#markdownContent video')?.readyState >= 2);
  const position = await player.evaluate(async video => {
    video.pause();
    if (!video.videoWidth || !video.videoHeight) throw new Error('Video decoded no picture');
    assertMedia(video.duration);
    function assertMedia(duration) { if (!Number.isFinite(duration) || duration < 0.2) throw new Error('Test video must have a seekable duration'); }
    const target = video.duration * 0.7;
    await new Promise(resolve => { video.addEventListener('seeked', resolve, {once: true}); video.currentTime = target; });
    return { target, current: video.currentTime };
  });
  assert.ok(Math.abs(position.current - position.target) < 0.25, 'actual media decoder must seek');
  assert.ok(requests.some(request => request.range), 'WebView-compatible player requests bytes through Range');
  assert.deepEqual(await page.evaluate(() => localVideoApp.begin), [['/video-fixture/demo.md', 'assets/视频.' + format]]);

  await page.locator('#editButton').click();
  await page.waitForFunction(() => localVideoApp.end.length === 1);
  const editor = page.locator('#markdownEditor > .cm-editor > .cm-scroller > .cm-content');
  const preview = page.locator('#editorPreviewContent');
  await preview.locator('.qm-local-video').waitFor();
  const videoButton = page.locator('#editorFormatBar [data-format="local-video"]');
  const moreButton = page.locator('#moreFormatButton');
  const overflowVideo = page.locator('#overflowFormatOptions [data-format-command="local-video"]');
  await page.locator('#hideLivePreviewButton').click();
  await videoButton.waitFor({state: 'visible'});
  await moreButton.waitFor({state: 'hidden'});
  assert.equal(await videoButton.evaluate(button => button.previousElementSibling.dataset.format), 'image');
  assert.match(await videoButton.getAttribute('aria-label'), /插入视频|Insert video/);
  assert.equal(await overflowVideo.count(), 0, 'wide toolbar must not duplicate the video command');
  await page.locator('#restoreLivePreviewButton').click();
  await videoButton.waitFor({state: 'visible'});
  const dialog = page.locator('#videoInsertDialog');
  const confirm = page.locator('#confirmVideoInsert');
  const pick = page.locator('#pickLocalVideo');
  const localTab = page.locator('#videoLocalTab');
  const networkTab = page.locator('#videoNetworkTab');
  const openInsert = async () => {
    await editor.focus();
    await page.keyboard.press('Control+End');
    await videoButton.click();
    await dialog.waitFor({state:'visible'});
    assert.equal(await localTab.getAttribute('aria-selected'), 'true');
    assert.equal(await page.locator('#networkVideoUrl').isVisible(), false);
    assert.equal(await confirm.isEnabled(), false);
  };
  const queue = (name, external = false) => page.evaluate(({ name, external }) => localVideoApp.picks.push({
    reference:(external ? 'C:/other/' : 'assets/') + name, name, size:external ? 220000000 : 8000, external
  }), {name, external});
  const drop = (target, name) => target.evaluate((element, name) => {
    const transfer = new DataTransfer();
    transfer.items.add(new File([''], name));
    element.dispatchEvent(new DragEvent('drop', {bubbles:true, cancelable:true, dataTransfer:transfer, clientX:-1, clientY:-1}));
  }, name);
  const waitSelected = name => dialog.getByText(name + ' · ', {exact:false}).waitFor({state:'visible'});
  const capture = name => screenshotFolder && dialog.screenshot({path:`${screenshotFolder}/${name}.png`});

  await openInsert();
  await capture('01-local');
  await page.evaluate(() => localVideoApp.picks.push({error:'LOCAL_VIDEO_UNSUPPORTED_FORMAT'}));
  await pick.click();
  await page.locator('#videoLocalError').waitFor({state:'visible'});
  assert.equal(await confirm.isEnabled(), false, 'invalid files cannot be inserted');
  await queue('cancelled.' + format, true);
  await pick.click();
  await waitSelected('cancelled.' + format);
  assert.equal(await confirm.isEnabled(), true);
  assert.equal(await page.locator('#localVideoChoice').isVisible(), false, 'file selection must not start the insert flow');
  await page.keyboard.press('Escape');
  await dialog.waitFor({state:'hidden'});
  assert.equal(await preview.getByText('cancelled.' + format, {exact:true}).count(), 0, 'cancel leaves the document unchanged');
  assert.deepEqual(await page.evaluate(() => localVideoApp.copies), [], 'cancel never writes an asset');

  await openInsert();
  await drop(pick, 'modal.' + format);
  await waitSelected('modal.' + format);
  await capture('02-selected');
  assert.equal(await preview.getByText('modal.' + format, {exact:true}).count(), 0, 'drop on the modal selects without inserting');
  await queue('chosen.' + format);
  await pick.click();
  await waitSelected('chosen.' + format);
  await confirm.click();
  await preview.getByText('chosen.' + format, {exact: true}).last().waitFor();

  await openInsert();
  await queue('clip.' + format, true);
  await pick.click();
  await waitSelected('clip.' + format);
  await confirm.click();
  await page.locator('#localVideoChoice button[value=copy]').click();
  await preview.getByText('copied.' + format, {exact: true}).last().waitFor();
  assert.deepEqual(await page.evaluate(() => localVideoApp.copies), [['/video-fixture/demo.md', 'C:/other/clip.' + format]]);
  await editor.focus();
  await page.keyboard.press('Control+End');
  await drop(editor, 'dropped.' + format);
  await preview.getByText('dropped.' + format, {exact: true}).last().waitFor();
  assert.deepEqual(await page.evaluate(() => localVideoApp.dropped), [
    ['/video-fixture/demo.md', '/video-fixture/modal.' + format],
    ['/video-fixture/demo.md', '/video-fixture/dropped.' + format]
  ]);
  assert.equal(await preview.locator('video').count(), 0, 'inserting must not start playback in split preview');
  await preview.locator('.qm-local-video__action').filter({hasText: /加载并播放|Load and play/}).last().click();
  await page.waitForFunction(() => document.querySelector('#editorPreviewContent video')?.readyState >= 2);
  const playback = await preview.locator('video').evaluate(video => {
    window.originalPreviewVideo = video;
    video.pause();
    video.volume = 0.42;
    return {time: video.currentTime, volume: video.volume};
  });
  await editor.focus();
  await page.keyboard.press('Control+End');
  await page.keyboard.insertText('Notes typed during video preview.');
  await preview.getByText('Notes typed during video preview.', {exact: true}).waitFor();
  const preserved = await preview.locator('video').evaluate(video => ({
    same: video === window.originalPreviewVideo, time: video.currentTime, volume: video.volume, paused: video.paused
  }));
  assert.deepEqual(preserved, {...playback, same: true, paused: true}, 'unrelated text edits preserve the connected player and its state');
  assert.equal(await page.evaluate(() => localVideoApp.end.length), 1, 'the active local authorization survives unrelated editing');
  const saveCount = await page.evaluate(() => localVideoApp.saves.length);
  await editor.focus();
  await page.keyboard.press('Control+s');
  await page.waitForFunction(previous => localVideoApp.saves.length > previous, saveCount);
  await page.waitForTimeout(180);
  assert.equal(await preview.locator('video').count(), 1, 'saving unchanged content must not stop the split player');
  await page.locator('#hideLivePreviewButton').click();
  await page.waitForFunction(() => localVideoApp.end.length === 2);
  await page.locator('#restoreLivePreviewButton').click();
  await page.setViewportSize({width: 850, height: 900});
  await videoButton.waitFor({state: 'hidden'});
  await moreButton.waitFor({state: 'visible'});
  await editor.focus();
  await page.keyboard.press('Control+End');
  await moreButton.click();
  await overflowVideo.click();
  await localTab.focus();
  await page.keyboard.press('ArrowRight');
  assert.equal(await networkTab.getAttribute('aria-selected'), 'true');
  assert.equal(await pick.isVisible(), false);
  await capture('03-network');
  const urlInput = page.locator('#networkVideoUrl');
  await urlInput.fill('http://video.example.com/unsafe.mp4');
  await urlInput.press('Tab');
  assert.equal(await confirm.isEnabled(), false);
  assert.equal(await urlInput.getAttribute('aria-invalid'), 'true', 'non-HTTPS inputs stay in the dialog');
  await urlInput.fill('https://video.example.com/clip?token=fixture%2Fvideo&quality=720');
  await confirm.click();
  await preview.locator('.qm-local-video--network', {hasText:'video.example.com'}).waitFor();
  assert.equal(await preview.locator('video').count(), 0, 'adding a link must not contact the host');
  await page.setViewportSize({width: 1920, height: 900});
  await videoButton.waitFor({state: 'visible'});
  assert.equal(await overflowVideo.count(), 0, 'widening the toolbar removes the overflow entry');
  assert.deepEqual(pageErrors, []);
  console.log(`PASS ${engine}: real ${format} picture and seek, tabbed confirm/cancel, picker/copy/drop, toolbar overflow, preserve on edit and release on hide`);
} finally {
  await browser?.close();
  server.httpServer.closeAllConnections?.();
  await server.close();
}
