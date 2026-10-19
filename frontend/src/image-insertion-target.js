import {findMarkdownTables} from './table-designer.js';

// A media insertion outside a table must start a separate Markdown block.
// Without a blank line, even an image on the next line becomes a GFM table row.
// Do not touch cell insertions, ordinary inline images, or stored table text.
export function separateImageFromTable(source, from, markdown) {
  const table = findMarkdownTables(source).filter(item => item.tableTo <= from).at(-1);
  if (!table) return markdown;
  const gap = source.slice(table.tableTo, from), prefix = table.prefix || '';
  if (!gap) {
    const row = source.slice(source.lastIndexOf('\n', from - 1) + 1, from).trimEnd();
    if (!row.endsWith('|')) return markdown; // End of an unclosed final cell is still inside that cell.
    let slashes = 0;
    for (let i = row.length - 2; i >= 0 && row[i] === '\\'; i--) slashes++;
    if (slashes % 2) return markdown;
    return `\n${prefix}\n${prefix}${markdown}`;
  }
  // More than one newline already provides separation; non-container text
  // means this is another paragraph and must retain inline insertion behavior.
  if (gap === '\n' + prefix || (gap.startsWith('\n' + prefix) && /^[ \t]*$/.test(gap.slice(1 + prefix.length)))) {
    return `\n${prefix}${markdown}`;
  }
  return markdown;
}

// Pending image reads/uploads retain their insertion bookmark, not the latest caret.
export function createImageInsertionTarget(editor, session, path, range = editor.state.selection.main) {
  return {editor, session, path, doc: editor.state.doc, from: range.from, to: range.to,
    selected: editor.state.sliceDoc(range.from, range.to), cancelled: false};
}

export function imageInsertionTargetCurrent(target, editor, session, path, editing) {
  return Boolean(target && !target.cancelled && editing && editor && !editor.destroyed && !editor.state.readOnly
    && target.editor === editor && target.session === session && target.path === path
    && target.doc === editor.state.doc && editor.state.sliceDoc(target.from, target.to) === target.selected);
}

export function mapImageInsertionTargets(targets, update) {
  if (!update.docChanged) return;
  for (const target of targets) {
    if (target.cancelled || target.editor !== update.view) continue;
    if (target.doc !== update.startState.doc) { target.cancelled = true; continue; }
    update.changes.iterChangedRanges((from, to) => {
      const overlaps = target.from === target.to
        ? from < target.from && to > target.from
        : (from < target.to && to > target.from) || (from === to && from > target.from && from < target.to);
      if (overlaps) target.cancelled = true;
    });
    if (target.cancelled) continue;
    const empty = target.from === target.to;
    target.from = update.changes.mapPos(target.from, 1);
    target.to = empty ? target.from : update.changes.mapPos(target.to, -1);
    target.doc = update.state.doc;
    if (target.to < target.from || update.state.sliceDoc(target.from, target.to) !== target.selected) target.cancelled = true;
  }
}
