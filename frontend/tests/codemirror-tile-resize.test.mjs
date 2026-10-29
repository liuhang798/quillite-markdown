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
