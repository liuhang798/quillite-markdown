import {editorHasComposition} from './editor-composition.js';
import { ChangeSet, Text } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import { isolateHistory } from '@codemirror/commands';
import { resolveEditableOwner } from './editable-owner.js';
import { protectedBlockRanges, protectedBlockReplacement } from './editable-cross-selection.js';
import { normalizeEditableInsertion } from './live-editable-block.js';
import { blockDropPrefix } from './block-drop-context.js';
import { fieldOffset } from './projected-code.js';

// Persist a stale-drag tombstone across EditorState replacement on the same view.
// A drop from the previous document must never be pasted into the newly opened one.
const drags = new WeakMap();
export function matchesTextDrag(event, drag) {
  return Boolean(drag && Array.from(event.dataTransfer?.types || []).includes(drag.type));
}

export function textDragTransaction(source, range, position, move, blocks = [], normalize = text => text) {
  const { from, to } = range;
  if (![from, to, position].every(Number.isInteger) || from < 0 || to > source.length || from >= to
    || position < 0 || position > source.length || (position >= from && position <= to)) return null;
  let content = '', cursor = from;
  // Paragraph boundaries belong in the dragged text even when deletion must
  // retain them at the source. Hidden code prefixes do not belong in the text.
  const omitted = protectedBlockRanges(source, from, to, blocks, false);
  for (const block of blocks) {
    if (!block.projection || (from <= block.from && to >= block.to)) continue;
    const segments = block.projection.segments;
    for (let index = 1; index < segments.length; index++) {
      const start = Math.max(from, segments[index - 1].to), end = Math.min(to, segments[index].from);
      if (start < end) omitted.push({ from: start, to: end });
    }
  }
  omitted.sort((a,b) => a.from-b.from || a.to-b.to);
  for (const keep of omitted) {
    if (keep.from > cursor) content += source.slice(cursor, keep.from);
    cursor = Math.max(cursor, keep.to);
  }
  content += source.slice(cursor, to);
  if (!content) return null;
  const deletion = protectedBlockReplacement(source, from, to, '', blocks)?.changes || { from, to, insert: '' };
  const destination = blocks.flatMap(block => (block.cells || [{from:block.contentFrom,to:block.contentTo,projection:block.projection}]).map(field => ({...field,kind:block.kind})))
    .filter(field => position >= field.from && position <= field.to).sort((a,b) => a.to-a.from-(b.to-b.from))[0];
  const acceptsBlocks = !destination || (['details','html-content','footnote-definition'].includes(destination.kind) && destination.role !== 'summary');
  if (acceptsBlocks && blocks.some(block => from <= block.from && to >= block.to)) {
    // Calculate the surrounding text after removal, since deleting the source
    // can change which line breaks are adjacent to the drop position.
    const removal = ChangeSet.of(move ? [deletion] : [], source.length);
    const remaining = removal.apply(Text.of(source.split('\n'))).toString();
    const at = removal.mapPos(position), before = remaining.slice(0,at), after = remaining.slice(at);
    const leading = /^\n*/.exec(content)[0].length, trailing = /\n*$/.exec(content)[0].length;
    if (before) content = '\n'.repeat(Math.max(0,2-/\n*$/.exec(before)[0].length-leading)) + content;
    if (after) content += '\n'.repeat(Math.max(0,2-/^\n*/.exec(after)[0].length-trailing));
    // Resolve local list/quote ownership inside a projected footnote or HTML
    // body; the outer Markdown parser sees only its wrapper/indentation.
    const prefix = destination
      ? blockDropPrefix(destination.projection?.text ?? source.slice(destination.from,destination.to), fieldOffset(destination,position))
      : blockDropPrefix(remaining, at);
    if (prefix) content = content.replaceAll('\n', '\n' + prefix);
  }
  // Added paragraph breaks need the same destination projection prefixes as
  // the dragged content. Normalize once, after constructing those breaks.
  content = normalize(content);
  if (!content) return null;
  const changes = ChangeSet.of([...(move ? [deletion] : []), { from: position, insert: content }], source.length);
  return { changes, selection: { anchor: changes.mapPos(position, -1), head: changes.mapPos(position, 1) },
    userEvent: move ? 'move.drop' : 'input.drop', annotations: isolateHistory.of('full') };
}

export function installEditableTextDrag(view, blocks) {
  const doc = view.dom.ownerDocument;
  let pending = null;
  const resolve = target => {
    const element = target?.nodeType === 1 ? target : target?.parentElement;
    if (!element) return null;
    const inner = EditorView.findFromDOM(element);
    if (!inner || inner.destroyed || editorHasComposition(inner)) return null;
    const owner = resolveEditableOwner(inner, { from:0, to:inner.state.doc.length });
    return owner?.view === view ? { inner, owner } : null;
  };
  const down = event => {
    pending = null;
    if (event.button !== 0 || event.shiftKey || view.state.selection.ranges.length !== 1) return;
    const source = resolve(event.target), range = view.state.selection.main;
    if (!source || range.empty) return;
    const local = source.inner.posAtCoords({x:event.clientX,y:event.clientY},false);
    const position = Number.isInteger(local) ? resolveEditableOwner(source.inner,{from:local,to:local})?.from : null;
    if (Number.isInteger(position) && position >= range.from && position <= range.to) {
      pending = {doc:view.state.doc,range,inner:source.inner};
      // The painted projection selection is not the browser's native selection
      // until focused. Establish it before CodeMirror handles mousedown so a
      // press inside selected text starts native dragging, not a new caret.
      if (source.inner !== view) source.inner.focus();
    }
  };
  const start = event => {
    const element = event.target?.nodeType === 1 ? event.target : event.target?.parentElement;
    if (resolveEditableOwner(view)?.view !== view || editorHasComposition(view) || view.state.readOnly || !event.dataTransfer
      || event.dataTransfer.files.length || view.state.selection.ranges.length !== 1
      || !element?.closest('.cm-content') || element.closest('img, a, button, input, select, textarea')) return;
    const source = resolve(event.target);
    const range = pending?.doc === view.state.doc && pending.inner === source?.inner ? pending.range : view.state.selection.main;
    pending = null;
    if (!source || range.empty) return;
    const crossing = blocks().some(block => {
      const fields = block.cells || [{from:block.contentFrom,to:block.contentTo}];
      return fields.some(field => range.from <= field.to && range.to >= field.from
        && !(range.from >= field.from && range.to <= field.to));
    });
    const type = `application/x-quillite-text-drag-${doc.defaultView.crypto.randomUUID()}`;
    event.dataTransfer.setData(type, '1');
    drags.set(view, { type, doc:view.state.doc, range, inner:source.inner,
      crossing:crossing || range.from < source.owner.from || range.to > source.owner.to });
  };
  const moves = event => {
    const configured = view.state.facet(EditorView.dragMovesSelection);
    if (configured.length) return configured[0](event);
    return /Mac|iPhone|iPad/.test(doc.defaultView.navigator.platform) ? !event.altKey : !event.ctrlKey;
  };
  const over = event => {
    const drag = drags.get(view), target = resolve(event.target);
    if (!matchesTextDrag(event, drag) || !target) return;
    event.preventDefault();
    if (event.dataTransfer) event.dataTransfer.dropEffect = drag.invalid || drag.doc !== view.state.doc ? 'none' : moves(event) ? 'move' : 'copy';
  };
  const drop = event => {
    const drag = drags.get(view);
    if (!matchesTextDrag(event, drag)) return;
    const target = resolve(event.target);
    if (!drag.invalid && drag.doc === view.state.doc && target?.inner === drag.inner && !drag.crossing) {
      drags.delete(view); return; // Preserve native moves within one editor.
    }
    event.preventDefault(); event.stopImmediatePropagation(); drags.delete(view);
    if (drag.invalid || drag.doc !== view.state.doc || !target || editorHasComposition(view) || view.state.readOnly) return;
    const local = target.inner.posAtCoords({x:event.clientX,y:event.clientY}, false);
    if (!Number.isInteger(local)) return;
    const position = resolveEditableOwner(target.inner,{from:local,to:local})?.from;
    const transaction = textDragTransaction(view.state.doc.toString(), drag.range, position, moves(event), blocks(), text => normalizeEditableInsertion(target.inner,text));
    if (transaction) { view.dispatch(transaction); view.focus(); }
  };
  const end = () => { pending = null; drags.delete(view); };
  const up = () => { pending = null; };
  view.dom.addEventListener('mousedown',down,true);
  view.dom.addEventListener('dragstart',start,true);
  view.dom.addEventListener('dragover',over,true);
  view.dom.addEventListener('drop',drop,true);
  doc.addEventListener('dragend',end,true);
  doc.addEventListener('mouseup',up,true);
  return () => {
    const drag = drags.get(view); if (drag) drag.invalid = true;
    pending = null;
    view.dom.removeEventListener('mousedown',down,true); doc.removeEventListener('mouseup',up,true);
    view.dom.removeEventListener('dragstart',start,true); view.dom.removeEventListener('dragover',over,true);
    view.dom.removeEventListener('drop',drop,true); doc.removeEventListener('dragend',end,true);
  };
}
