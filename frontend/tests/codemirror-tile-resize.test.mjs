import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {patchCodeMirrorTileBoundaries} from '../scripts/codemirror-tile-boundaries.mjs';

const source = readFileSync(new URL('../node_modules/@codemirror/view/dist/index.js', import.meta.url), 'utf8');
const patched = patchCodeMirrorTileBoundaries(source);
const pointerClass = code => new Function(code.slice(code.indexOf('class TilePointer {'), code.indexOf('// Used to track open block wrappers')) + '; return TilePointer;')();
function fixture(code, lineBreak = false) {
  const widget = {length: 5, breakAfter: lineBreak, isComposite: () => false};
  const tail = {length: 8, isComposite: () => false};
  const root = {children: [widget, tail], length: 13 + Number(lineBreak), isComposite: () => true};
  return {widget, tail, root, cursor: new (pointerClass(code))(root)};
}
const walk = skip => ({skip, enter() {}, leave() {}, break() {}});

test('old resize sequence reproduces the production parents.pop tile crash', () => {
  const {widget, cursor} = fixture(source);
  cursor.advance(2, -1);
  cursor.advance(3, -1, walk(() => { widget.length = 2; }));
  // The old cursor is still in the reused, now shorter leaf at offset 5.
  assert.equal(cursor.tile, widget);
  assert.equal(cursor.index, 5);
  assert.throws(() => cursor.advance(8, 1), /undefined|tile/);
});

for (const newLength of [0, 2, 5, 9]) for (const side of [-1, 1]) for (const lineBreak of [false, true]) {
  test(`resized widget ${newLength}, side ${side}, break ${lineBreak}: preserve old traversal extent`, () => {
    const {widget, tail, root, cursor} = fixture(patched, lineBreak);
    cursor.advance(2, -1);
    cursor.advance(3, side, walk(() => { widget.length = newLength; }));
    assert.equal(cursor.tile, side > 0 && !lineBreak ? tail : root);
    assert.equal(cursor.index, side > 0 && !lineBreak ? 0 : 1);
    const visited = [];
    cursor.advance(8 + Number(lineBreak), 1, walk((tile, from, to) => visited.push({tile, from, to})));
    assert.deepEqual(visited, [{tile: tail, from: 0, to: 8}]);
    assert.equal(cursor.root, root);
    assert.equal(cursor.index, 2);
    assert.equal(cursor.parents.length, 0);
    assert.doesNotThrow(() => cursor.advance(0, 1));
  });
}

test('partial traversal retains position and zero-distance boundary traversal terminates', () => {
  const {widget, cursor} = fixture(patched);
  cursor.advance(2, -1);
  cursor.advance(1, -1);
  assert.equal(cursor.tile, widget);
  assert.equal(cursor.index, 3);
  cursor.advance(0, 1);
  assert.equal(cursor.index, 3);
});

test('old whole-child skip consumes the resized extent and reproduces the parents.pop crash', () => {
  // This enters the full-child branch, rather than the already-fixed partial
  // leaf branch: v2's leaf-only backport did not change this sequence.
  const {widget, tail, cursor} = fixture(source);
  cursor.advance(5, 1, walk(tile => { if (tile === widget) widget.length = 2; }));
  assert.equal(cursor.tile, tail);
  assert.equal(cursor.index, 3, 'the old code incorrectly consumed only 2 of the old 5 characters');
  assert.throws(() => cursor.advance(8, 1), /undefined|tile/);
});

for (const newLength of [0, 2, 5, 9]) for (const side of [-1, 1]) for (const lineBreak of [false, true]) {
  test(`whole-child resize ${newLength}, side ${side}, break ${lineBreak}: consume original extent`, () => {
    const actual = fixture(patched, lineBreak), expected = fixture(patched, lineBreak);
    const first = side > 0 ? 5 : 6;
    expected.cursor.advance(first, side);
    actual.cursor.advance(first, side, walk(tile => { if (tile === actual.widget) actual.widget.length = newLength; }));
    const location = value => ({
      node: value.cursor.tile === value.root ? 'root' : value.cursor.tile === value.tail ? 'tail' : 'widget',
      index: value.cursor.index,
      beforeBreak: value.cursor.beforeBreak,
      depth: value.cursor.parents.length
    });
    assert.deepEqual(location(actual), location(expected));
    const remainder = 13 + Number(lineBreak) - first;
    assert.doesNotThrow(() => actual.cursor.advance(remainder, 1));
    assert.equal(actual.cursor.tile, actual.root);
    assert.equal(actual.cursor.index, 2);
    assert.equal(actual.cursor.parents.length, 0);
    assert.doesNotThrow(() => actual.cursor.advance(0, 1));
  });
}
