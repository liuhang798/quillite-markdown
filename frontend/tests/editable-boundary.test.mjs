import test from 'node:test';
import assert from 'node:assert/strict';
import { editableBoundaryTarget } from '../src/editable-boundary.js';

const code = { length: 80, item: { kind: 'code', from: 10, to: 50 }, ranges: [{ from: 18, to: 46 }], index: 0 };
test('code boundaries navigate outside the complete fence, never into delimiters', () => {
  assert.deepEqual(editableBoundaryTarget({ ...code, direction: -1 }), { position: 9 });
  assert.deepEqual(editableBoundaryTarget({ ...code, direction: 1 }), { position: 51 });
});
test('document-edge navigation does not place the cursor inside a delimiter', () => {
  const edge = { ...code, item: { kind: 'code', from: 0, to: 80 } };
  assert.equal(editableBoundaryTarget({ ...edge, direction: -1 }), null);
  assert.equal(editableBoundaryTarget({ ...edge, direction: 1 }), null);
});
const table = { ...code, item: { ...code.item, kind: 'table' }, ranges: [
  { row: 0, column: 0 }, { row: 0, column: 1 }, { row: 1, column: 0 }, { row: 1, column: 1 },
] };
test('horizontal table navigation preserves row order and enters the correct text edge', () => {
  assert.deepEqual(editableBoundaryTarget({ ...table, index: 1, direction: 1 }), { index: 2, after: false });
  assert.deepEqual(editableBoundaryTarget({ ...table, index: 2, direction: -1 }), { index: 1, after: true });
});
test('vertical table navigation stays in the same column', () => {
  assert.deepEqual(editableBoundaryTarget({ ...table, index: 1, direction: 1, vertical: true }), { index: 3, after: false });
  assert.deepEqual(editableBoundaryTarget({ ...table, index: 2, direction: -1, vertical: true }), { index: 0, after: true });
  assert.deepEqual(editableBoundaryTarget({ ...table, index: 2, direction: 1, vertical: true }), { position: 51 });
});
test('details navigation moves between summary/body before leaving the container', () => {
  const details = { ...code, item: { ...code.item, kind: 'details' }, ranges: [{ role: 'summary' }, { role: 'body' }] };
  assert.deepEqual(editableBoundaryTarget({ ...details, direction: 1 }), { index: 1, after: false });
  assert.deepEqual(editableBoundaryTarget({ ...details, index: 1, direction: -1 }), { index: 0, after: true });
});
test('invalid navigation requests do not invent a target', () => {
  assert.equal(editableBoundaryTarget({ ...code, index: 3, direction: 1 }), null);
  assert.equal(editableBoundaryTarget({ ...code, direction: 0 }), null);
});
