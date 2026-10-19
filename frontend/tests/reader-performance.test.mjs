import test from 'node:test';
import assert from 'node:assert/strict';
import { createReaderCache, highlightReaderCode, READER_DEFER_THRESHOLD } from '../src/reader-performance.js';

test('reader cache checks exact content and removes obsolete revisions', () => {
  const cache = createReaderCache();
  cache.set('path/en/light', 'old', '<p>old</p>');
  assert.equal(cache.get('path/en/light', 'old'), '<p>old</p>');
  assert.equal(cache.get('path/en/light', 'new'), null);
  assert.equal(cache.size, 0);
  assert.equal(cache.bytes, 0);
  cache.set('path/en/light', 'new', '<p>new</p>');
  assert.equal(cache.get('path/zh/dark', 'new'), null);
});
test('reader cache enforces LRU and total byte bounds, skips oversized content', () => {
  const cache = createReaderCache({ maxEntries: 2, maxBytes: 40 });
  cache.set('a', 'a', 'a'); cache.set('b', 'b', 'b');
  cache.get('a', 'a'); cache.set('c', 'c', 'c');
  assert.equal(cache.get('b', 'b'), null);
  assert.equal(cache.get('a', 'a'), 'a');
  cache.set('large', 'x'.repeat(100), 'x');
  assert.equal(cache.size, 2);
  cache.set('a', 'new', 'x'.repeat(100));
  assert.equal(cache.get('a', 'a'), null);
  assert.ok(cache.bytes <= 40);
  const bytesOnly = createReaderCache({ maxEntries: 10, maxBytes: 12 });
  for (const key of ['a','b','c']) bytesOnly.set(key,key,key);
  assert.equal(bytesOnly.size, 2);
});
test('highlight failure and oversized blocks keep complete copyable source', () => {
  const code = text => ({ textContent: text, pending: true,
    hasAttribute() { return this.pending; }, getAttribute() { return 'js'; },
    removeAttribute() { this.pending = false; } });
  const short = code('<script>literal</script>');
  highlightReaderCode(short, () => { throw Error('bad grammar'); });
  assert.equal(short.textContent, '<script>literal</script>');
  assert.equal(short.pending, false);
  const large = code('x'.repeat(READER_DEFER_THRESHOLD + 1));
  highlightReaderCode(large, () => { assert.fail('must not block a frame on huge code'); });
  assert.equal(large.textContent.length, READER_DEFER_THRESHOLD + 1);
});
