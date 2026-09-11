import assert from 'node:assert/strict';
import test from 'node:test';
import { documentVersionLineDifference, historyPreviewText } from '../src/version-history.js';

test('version history summarizes the changed middle without scanning a quadratic matrix', () => {
  assert.deepEqual(documentVersionLineDifference('same\nold\nend', 'same\nnew one\nnew two\nend'), { removed: 1, added: 2 });
});

test('history preview caps huge versions without changing the stored content', () => {
  assert.deepEqual(historyPreviewText('abcdef', 4), { text: 'abcd', truncated: true });
  assert.deepEqual(historyPreviewText('abc', 4), { text: 'abc', truncated: false });
});
