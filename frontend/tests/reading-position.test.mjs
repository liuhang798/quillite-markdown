import test from 'node:test';
import assert from 'node:assert/strict';
import {captureReadingPosition, findReadingAnchor} from '../src/reading-position.js';
const element = (text, top = 0, tagName = 'P') => ({
  textContent: text, tagName, getBoundingClientRect: () => ({top, bottom: top + 80})
});
test('capture retains a bounded descriptor and viewport offset, not DOM references', () => {
  const children = [element('above', -90), element('visible', -10)];
  const position = captureReadingPosition({scrollTop: 2500, getBoundingClientRect: () => ({top: 0})}, {children});
  assert.deepEqual(position, {scrollTop: 2500, index: 1, anchor: {tag: 'P', text: 'visible'}, offset: -10});
  assert.equal(JSON.stringify(captureReadingPosition({scrollTop: 0, getBoundingClientRect: () => ({top: 0})}, {children: [element('a'.repeat(10000))]})).length < 300, true);
});
test('anchor follows unchanged paragraphs when earlier content is inserted', () => {
  const position = {index: 1, anchor: {tag: 'P', text: 'target'}};
  const children = ['new', 'old', 'target', 'after'].map(text => element(text));
  assert.equal(findReadingAnchor(children, position), children[2]);
});
test('duplicate anchors prefer nearest index; edited/deleted paragraphs use bounded index fallback', () => {
  const children = ['same', 'changed', 'same'].map(text => element(text));
  assert.equal(findReadingAnchor(children, {index: 2, anchor: {tag: 'P', text: 'same'}}), children[2]);
  assert.equal(findReadingAnchor(children, {index: 1, anchor: {tag: 'P', text: 'gone'}}), children[1]);
  assert.equal(findReadingAnchor([], {index: 5, anchor: {tag: 'P', text: 'gone'}}), null);
});
