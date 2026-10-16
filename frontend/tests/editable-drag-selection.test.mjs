import test from 'node:test';
import assert from 'node:assert/strict';
import { dragScrollStep } from '../src/editable-drag-selection.js';

test('drag scroll is idle inside the safe area and accelerates at both edges', () => {
  assert.equal(dragScrollStep(200, 100, 400), 0);
  assert.equal(dragScrollStep(132, 100, 400), 0);
  assert.equal(dragScrollStep(368, 100, 400), 0);
  assert.equal(dragScrollStep(104, 100, 400), -14);
  assert.equal(dragScrollStep(396, 100, 400), 14);
});

test('drag scroll caps speed beyond either edge and rejects hidden viewports', () => {
  assert.equal(dragScrollStep(-10000, 100, 400), -18);
  assert.equal(dragScrollStep(10000, 100, 400), 18);
  assert.equal(dragScrollStep(100, 100, 100), 0);
  assert.equal(dragScrollStep(100, 200, 100), 0);
  assert.equal(dragScrollStep(NaN, 100, 400), 0);
  assert.equal(dragScrollStep(100, 0, Infinity), 0);
});

test('short viewports retain a neutral middle instead of overlapping edges', () => {
  assert.equal(dragScrollStep(115, 100, 130), 0);
  assert.ok(dragScrollStep(101, 100, 130) < 0);
  assert.ok(dragScrollStep(129, 100, 130) > 0);
});
