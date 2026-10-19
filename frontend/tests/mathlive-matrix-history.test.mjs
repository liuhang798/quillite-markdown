import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { patchMathliveMatrixHistory } from '../scripts/mathlive-matrix-history.mjs';

const upstream = readFileSync(new URL('../node_modules/mathlive/mathlive.mjs', import.meta.url), 'utf8');
test('matrix history patch is pinned to the audited command dispatcher', () => {
  const patched = patchMathliveMatrixHistory(upstream);
  assert.match(patched, /matrixCommand && mathfield.model.getValue\(\) !== matrixBefore/);
  assert.throws(() => patchMathliveMatrixHistory('changed dependency'), /requires review/);
  assert.throws(() => patchMathliveMatrixHistory(patched), /requires review/);
});

test('matrix add/remove records post-change snapshots once, preserves no-ops and leaves other commands alone', () => {
  const patched = patchMathliveMatrixHistory(upstream);
  const perform = patched.slice(patched.indexOf('function perform(mathfield, command) {'), patched.indexOf('\nfunction performWithFeedback('));
  for (const name of ['addRowAfter', 'addRowBefore', 'addColumnAfter', 'addColumnBefore', 'removeRow', 'removeColumn', 'deleteBackward']) {
    for (const mutate of [true, false]) {
      let value = 'initial'; const snapshots = [];
      const mf = { isSelectionEditable: true, model: { getValue: () => value, selectionIsCollapsed: true },
        flushInlineShortcutBuffer() {}, stopCoalescingUndo() {}, scrollIntoView() {}, snapshot() { snapshots.push(value); } };
      const context = { parseCommand: value => value, isArray: Array.isArray,
        COMMANDS: { [name]: { target: 'model', changeContent: true, changeSelection: true,
          fn: () => { if (mutate) value = 'changed'; } } }, removeSuggestion() {}, updateAutocomplete() {}, requestUpdate() {} };
      vm.runInNewContext(perform, context);
      context.perform(mf, name);
      assert.deepEqual(snapshots, name === 'deleteBackward' ? ['initial'] : mutate ? ['changed'] : []);
    }
  }
});
