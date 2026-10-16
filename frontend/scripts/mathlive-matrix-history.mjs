// MathLive 0.111.0 snapshots add* before mutation and never snapshots remove*.
// Matrix commands need their resulting state recorded for undo AND redo.
// Keep the patch asserted so dependency upgrades cannot silently drop it.
export function patchMathliveMatrixHistory(source) {
  const before = '    if (/^(delete|add)/.test(selector)) {';
  const invoke = '    COMMANDS[selector].fn(mathfield.model, ...args);';
  for (const needle of [before, invoke]) {
    if (source.split(needle).length !== 2) throw new Error('MathLive matrix history patch requires review');
  }
  return source.replace(before, `    const matrixCommand = /^(addRowAfter|addRowBefore|addColumnAfter|addColumnBefore|removeRow|removeColumn)$/.test(selector);
    const matrixBefore = matrixCommand ? mathfield.model.getValue() : null;
    if (matrixCommand) mathfield.stopCoalescingUndo();
    if (/^(delete|add)/.test(selector) && !matrixCommand) {`)
    .replace(invoke, `${invoke}
    if (matrixCommand && mathfield.model.getValue() !== matrixBefore) mathfield.snapshot();`);
}
