import test from 'node:test';
import assert from 'node:assert/strict';
import { createImageLoadSession, loadPreviewImages, waitForPreviewImageReads } from '../src/image-load-session.js';

test('export retries only failed local reads and recovers a restored attachment', async () => {
  const calls = [], good = 'data:image/png;base64,AA==';
  const images = ['missing.png','ok.png'].map(ref => ({
    isConnected:true, dataset:{markdownSrc:ref}, removeAttribute(){}, classList:{add(){}, remove(){}}
  }));
  const container = {querySelectorAll:()=>images, contains:img=>images.includes(img)};
  let restored = false;
  loadPreviewImages(container, {readImageData: async ref => {
    calls.push(ref);
    if (!restored && ref === 'missing.png') throw new Error('ENOENT');
    return good;
  }});
  await new Promise(setImmediate);
  await assert.rejects(waitForPreviewImageReads(container), /local image unavailable/);
  restored = true;
  await waitForPreviewImageReads(container);
  await waitForPreviewImageReads(container);
  assert.deepEqual(calls, ['missing.png','ok.png','missing.png','missing.png']);
  assert.equal(images[0].src, good);
});

test('explicit export retry never reads images blocked by an imported session', async () => {
  const good = 'data:image/png;base64,AA==', calls = [];
  const local = {isConnected:true, dataset:{markdownSrc:'missing.png'}, removeAttribute(){}, classList:{add(){}, remove(){}}};
  const remote = {isConnected:true, dataset:{markdownSrc:'https://image.invalid/blocked.png',remoteImageBlocked:'true'},
    removeAttribute(){throw new Error('blocked remote must remain untouched');}, classList:{add(){}, remove(){}}};
  const images = [local, remote];
  const container = {querySelectorAll:()=>images, contains:img=>images.includes(img)};
  let restored = false;
  loadPreviewImages(container, {readImageData: async ref => {
    calls.push(ref);
    if (!restored) throw new Error('ENOENT');
    return good;
  }});
  await new Promise(setImmediate);
  restored = true;
  await waitForPreviewImageReads(container);
  await waitForPreviewImageReads(container);
  assert.deepEqual(calls, ['missing.png','missing.png']);
  assert.equal(local.src, good);
  assert.equal(remote.src, undefined);
});
const image = 'data:image/png;base64,YQ==';
const tick = () => new Promise(resolve => setImmediate(resolve));

test('image reads are bounded, duplicates share work and settled data is not cached', async () => {
  const requests = [];
  const session = createImageLoadSession({ directory: 'doc', readImageData(ref, directory) {
    assert.equal(directory, 'doc');
    return new Promise(resolve => requests.push({ ref, resolve }));
  } });
  const first = session.load('0');
  assert.equal(session.load('0'), first);
  const all = [first, ...Array.from({length: 9}, (_, i) => session.load(String(i + 1)))];
  await tick(); assert.equal(requests.length, 4);
  requests.slice(0, 4).forEach(item => item.resolve(image));
  await tick(); assert.equal(requests.length, 8);
  requests.slice(4, 8).forEach(item => item.resolve(image));
  await tick(); assert.equal(requests.length, 10);
  requests.slice(8).forEach(item => item.resolve(image));
  assert.deepEqual(await Promise.all(all), Array(10).fill(image));
  await tick();
  const again = session.load('0'); await tick();
  assert.equal(requests.length, 11); requests.at(-1).resolve(image); await again;
});

test('closing drops queued reads and rejects late results without starting more work', async () => {
  const requests = [];
  const session = createImageLoadSession({readImageData: () => new Promise(resolve => requests.push(resolve))});
  const settled = Promise.allSettled(Array.from({length: 100}, (_, i) => session.load(String(i))));
  await tick(); assert.equal(requests.length, 4);
  session.dispose(); requests.forEach(resolve => resolve(image));
  const results = await settled;
  assert.ok(results.every(item => item.status === 'rejected' && item.reason.message === 'IMAGE_SESSION_CLOSED'));
  await tick(); assert.equal(requests.length, 4);
  await assert.rejects(session.load('new'), /IMAGE_SESSION_CLOSED/);
});

test('failed reads release their slot and can be retried', async () => {
  let reads = 0;
  const session = createImageLoadSession({readImageData: async () => ++reads === 1 ? 'file:///unsafe' : image}, 1);
  await assert.rejects(session.load('bad'), /IMAGE_UNAVAILABLE/);
  assert.equal(await session.load('next'), image);
  await tick(); assert.equal(await session.load('bad'), image);
});
