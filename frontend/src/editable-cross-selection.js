import { StateEffect, StateField } from '@codemirror/state';
import { fieldInsertion } from './projected-code.js';

export const crossSelection = StateEffect.define();
export const crossSelectionField = StateField.define({
  create: state => !state.selection.main.empty,
  update(value, tr) {
    if (tr.docChanged) value = !tr.newSelection.main.empty;
    else if (tr.selection && !tr.isUserEvent('select')) value = false;
    for (const effect of tr.effects) if (effect.is(crossSelection)) value = effect.value;
    return value && !tr.newSelection.main.empty;
  },
});

// Preserve the syntax skeleton of partially selected rendered blocks. Fully
// selected blocks remain removable. All offsets refer to the original source.
export function protectedBlockRanges(source, from, to, blocks, preserveParagraphs = true) {
  if (from >= to) return [];
  const keep = [];
  const protect = (a, b) => { a = Math.max(a, from); b = Math.min(b, to); if (a < b) keep.push({ from: a, to: b }); };
  for (const block of blocks) {
    if (block.to <= from || block.from >= to || (from <= block.from && to >= block.to)) continue;
    const ranges = block.cells || [{ from: block.contentFrom, to: block.contentTo }];
    if (!ranges.length || ranges.some(range => !Number.isInteger(range.from) || !Number.isInteger(range.to))) continue;
    let boundaryFrom = block.projection ? source.lastIndexOf('\n', block.from - 1) + 1 : block.from;
    let position = boundaryFrom;
    for (const range of ranges) { protect(position, range.from); position = range.to; }
    protect(position, block.to);
    // A partial code selection must keep its list markers, but not selected
    // item text. Retain one newline per ancestor so empty items stay owners.
    const headers = block.projection?.headers?.filter(header => header.end >= from) || [];
    for (const header of headers) {
      protect(header.from, from <= header.to ? header.markerTo : header.to); protect(header.end, header.end + 1);
    }
    if (headers.length) boundaryFrom = headers[0].from;
    // Keep existing paragraph boundaries on a retained wrapper. Otherwise a
    // closing fence/tag could become adjacent to the following prose.
    const before = /(?:\r?\n[ \t]*){1,2}$/.exec(source.slice(0, boundaryFrom));
    const after = /^(?:[ \t]*\r?\n){1,2}/.exec(source.slice(block.to));
    if (preserveParagraphs && before) protect(boundaryFrom - before[0].length, boundaryFrom);
    if (preserveParagraphs && after && !/^\r?\n/.test(source.slice(to))) protect(block.to, block.to + after[0].length);
  }
  keep.sort((a, b) => a.from - b.from || a.to - b.to);
  const merged = [];
  for (const range of keep) {
    const previous = merged.at(-1);
    if (previous && range.from <= previous.to) previous.to = Math.max(previous.to, range.to);
    else merged.push({ ...range });
  }
  return merged;
}

export function protectedBlockReplacement(source, from, to, insert, blocks) {
  const merged = protectedBlockRanges(source, from, to, blocks);
  if (!merged.length) return null;
  // Replacement text starts in the first selected editable field. Honor that
  // field's single-line/escaping rules just as typing directly into it does.
  const field = blocks.flatMap(block => (block.cells || [{from:block.contentFrom,to:block.contentTo,projection:block.projection}]).map(range => ({ ...range, kind: block.kind })))
    .filter(range => from >= range.from && from <= range.to).sort((a, b) => (a.to - a.from) - (b.to - b.from))[0];
  if (field?.kind === 'table') insert = insert.replace(/\r\n?|\n/g, ' ').replace(/(\\*)\|/g, (match, slashes) => slashes.length % 2 ? match : `${slashes}\\|`);
  else if (field?.role === 'summary') insert = insert.replace(/\r\n?|\n/g, ' ').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
  else if (field?.projection) insert = fieldInsertion(field, insert.replace(/\r\n?/g, '\n'));
  // Keep the original wrapper ranges untouched, rather than delete/reinsert
  // them. Position mapping and fence-collision repair can then trust them.
  const changes = [];
  let cursor = from;
  for (const range of merged) {
    if (cursor < range.from) changes.push({from:cursor,to:range.from,insert:''});
    cursor = range.to;
  }
  if (cursor < to) changes.push({from:cursor,to,insert:''});
  if (changes[0]?.from === from) changes[0].insert = insert;
  else if (insert) changes.unshift({from,insert});
  return {changes,selection:{anchor:from+insert.length}};
}
