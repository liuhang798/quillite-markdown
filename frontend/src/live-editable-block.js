import { ChangeSet, EditorState, EditorSelection, StateEffect, Transaction, RangeSet } from '@codemirror/state';
import { Decoration, EditorView, WidgetType, keymap, drawSelection, runScopeHandlers } from '@codemirror/view';
import { defaultKeymap, undo, redo, isolateHistory, indentWithTab } from '@codemirror/commands';
import { registerEditableOwner, resolveEditableOwner, editableProjectionSync, editableForwardedChange } from './editable-owner.js';
import { editableBoundaryTarget } from './editable-boundary.js';
import { crossSelection, crossSelectionField } from './editable-cross-selection.js';
import { fieldPosition, fieldOffset, fieldInsertion, changedFieldPosition } from './projected-code.js';
import { imageDefinitionsFor, imageDefinitionsField, inheritedImageDefinitions, updateImageDefinitions, footnotesFor, footnotesField, inheritedFootnotes, updateFootnotes, footnoteBodyContext } from './editor-reference-context.js';
import { singleLineMedia } from './media-ownership.js';
import { nestedSourcePanel, revealSourceReturnCaret, preserveSourceBlockPosition } from './source-return-panel.js';
import {getSearchQuery, searchPanelOpen} from '@codemirror/search';
import {projectedSearchMatches, updateProjectedSearch, projectSearchMatches, sameSearchMatches} from './projected-search.js';
import {tableGridEdit} from './table-clipboard.js';
import {liveSelectionDisplay} from './live-selection-layer.js';
import {emptyCodeSeparator} from './code-fence-editing.js';
import {spellingDecorations, setSpellingDecorations, projectSpellingDecorations} from './spelling-decorations.js';
import {trackCodeInputScroll, setCodeInputScroll, holdsCodeInputScroll, handleCodeTextInput, captureNativeCodeInputScroll, finishNativeCodeInputScroll, clearNativeCodeInputScroll} from './code-input-scroll.js';
import {sameFootnotePresentation} from './editor-reference-context.js';
import {editorHasComposition, afterComposition} from './editor-composition.js';

// Include empty cells, but never invent missing cells or discard extra columns.
export function tableCellRanges(raw, base = 0) {
  const rows = raw.split('\n'), cells = [];
  let offset = base, columns = 0;
  for (let row = 0; row < rows.length; row++) {
    const text = rows[row], pipes = [];
    for (let i = 0; i < text.length; i++) {
      if (text[i] !== '|') continue;
      let escapes = 0;
      for (let j = i - 1; j >= 0 && text[j] === '\\'; j--) escapes++;
      if (!(escapes % 2)) pipes.push(i);
    }
    const start = /^\s*\|/.test(text) ? pipes.shift() + 1 : 0;
    const end = pipes.length && /^\s*$/.test(text.slice(pipes.at(-1) + 1)) ? pipes.pop() : text.length;
    const edges = [start - 1, ...pipes, end];
    if (!row) columns = edges.length - 1;
    if (row !== 1) {
      if (edges.length - 1 !== columns) return null;
      for (let column = 0; column < columns; column++) {
        let from = edges[column] + 1, to = edges[column + 1];
        while (from < to && /\s/.test(text[from])) from++;
        while (to > from && /\s/.test(text[to - 1])) to--;
        cells.push({ from: offset + from, to: offset + to, row: row === 0 ? 0 : row - 1, column });
      }
    }
    offset += text.length + 1;
  }
  return cells;
}

export function safeCellInsertion(text) {
  return text.replace(/\r\n?|\n/g, ' ').replace(/(\\*)\|/g, (match, slashes) => slashes.length % 2 ? match : `${slashes}\\|`);
}

// A GFM table needs a blank separator before new prose. If there is already
// a second blank line, place the caret there without changing the document.
export function tableFollowingBlank(doc, end) {
  const row = doc.lineAt(end);
  if (row.to !== end || row.number === doc.lines) return null;
  const first = doc.line(row.number + 1);
  if (first.text.trim()) return null;
  const second = first.number < doc.lines ? doc.line(first.number + 1) : null;
  return second && !second.text.trim() ? second : first;
}

// A final GFM cell may omit its closing pipe while nonempty. Once cleared,
// its preceding separator would be read as the row's closing pipe, losing a
// column. Materialize only the missing boundary in the same user transaction.
export function emptyTableCellBoundary(source, item, field, text) {
  if (item.kind !== 'table' || text.trim() || !item.cells?.length) return null;
  if (item.cells.some(cell => cell.row === field.row && cell.column > field.column)) return null;
  const end = typeof source === 'string' ? source.indexOf('\n', field.to) : source.lineAt(field.to).to;
  const to = end < 0 ? source.length : end;
  if (!/^[ \t]*$/.test(typeof source === 'string' ? source.slice(field.to, to) : source.sliceString(field.to, to))) return null;
  return {from: to, insert: '|'};
}

export function mapEditableSelection(selection, position) {
  return EditorSelection.create(selection.ranges.map(range => EditorSelection.range(position(range.anchor), position(range.head))), selection.mainIndex);
}

export function insertSingleLineMultiBreak(view) {
  if (view.state.selection.ranges.length < 2 || view.state.readOnly || editorHasComposition(view)) return false;
  // Several carets cannot navigate as one. Normalize each break just as paste
  // does, keeping the single-line field and every insertion position intact.
  view.dispatch({ ...view.state.replaceSelection(' '), userEvent: 'input',
    annotations: isolateHistory.of('full'), scrollIntoView: true });
  return true;
}

export function editableFieldContains(source, field, from, to, kind) {
  if (from >= field.from && to <= field.to) return true;
  // A deletion can leave several source carets in trimmed cell padding.
  // Keep those positions owned by the same cell, never across a pipe/newline.
  const padding = (a, b) => /^[\t ]*$/.test(typeof source === 'string' ? source.slice(a, b) : source.sliceString(a, b));
  return (kind === 'table' || kind === 'footnote-definition')
    && padding(Math.min(from, field.from), field.from)
    && padding(field.to, Math.max(to, field.to));
}

export function retainEditableCellPadding(source, field, selection) {
  // Clearing a cell leaves the caret between its two structural spaces.
  // Keep an empty field at that caret, instead of importing trailing padding
  // into the child. Trimming that padding on the next input would rewrite the
  // active IME composition and can commit its phonetic text prematurely.
  const caret=selection.main;
  if(field.from===field.to&&selection.ranges.length===1&&caret.empty
    &&editableFieldContains(source,field,caret.from,caret.to,'table'))return {...field,from:caret.from,to:caret.to};
  let from=field.from,to=field.to;
  for(const range of selection.ranges)if(editableFieldContains(source,field,range.from,range.to,'table')){
    from=Math.min(from,range.from);to=Math.max(to,range.to);
  }
  return {...field,from,to};
}

export function retainFootnoteCaretPadding(source, item, selection) {
  const field={from:item.contentFrom,to:item.contentTo,projection:item.projection};
  const marker=/^ {0,3}\[\^[^\]\n]+\]:[\t ]?/.exec(item.raw);
  if(!marker || !field.projection)return field;
  const minimum=item.from+marker[0].length;
  let from=field.from;
  for(const range of selection.ranges)if(range.from>=minimum&&range.from<from&&editableFieldContains(source,field,range.from,range.to,'footnote-definition'))from=range.from;
  if(from===field.from)return field;
  const padding=typeof source==='string'?source.slice(from,field.from):source.sliceString(from,field.from);
  return {...field,from,projection:{...field.projection,from,text:padding+field.projection.text,
    segments:[{from,to:field.from,offset:0},...field.projection.segments.map(segment=>({...segment,offset:segment.offset+padding.length}))]}};
}

const controllers = new WeakMap();
export function lightweightTableCell(root, item, index) {
  const controller = controllers.get(root);
  return controller?.widget.item.from === item.from && controller.widget.item.raw === item.raw
    ? controller.cellElement?.(index) : null;
}
function editableTableGridTarget(inner) {
  if(inner.destroyed||inner.state.readOnly||inner.state.selection.ranges.length!==1||editorHasComposition(inner))return null;
  const direct=controllers.get(inner.dom.closest('.cm-live-table'));
  if(direct?.valid()&&direct.widget.item.kind==='table'){
    const index=direct.editors.indexOf(inner);if(index>=0)return{controller:direct,index};
  }
  // A real drag between cells is owned by the root, not either child editor.
  // Resolve both endpoints into the same table, even through footnotes/details.
  const selection=resolveEditableOwner(inner);if(!selection)return null;
  for(const element of inner.dom.querySelectorAll('.cm-live-table')){
    const controller=controllers.get(element);if(!controller?.valid())continue;
    const fields=controller.widget.item.cells.map(cell=>resolveEditableOwner(controller.view,cell));
    const index=fields.findIndex(field=>field?.view===selection.view&&selection.from>=field.from&&selection.from<=field.to);
    if(index>=0&&fields.some(field=>field?.view===selection.view&&selection.to>=field.from&&selection.to<=field.to))return{controller,index};
  }
  return null;
}
export function canPasteEditableTableGrid(view){return Boolean(editableTableGridTarget(view));}
export function pasteEditableTableGrid(inner, grid) {
  const target=editableTableGridTarget(inner);if(!target)return false;
  const {controller,index}=target;
  const view=controller.view,edit=tableGridEdit(view.state.doc.toString(),controller.widget.item,index,grid);
  if(!edit)return false;
  view.dispatch({...edit,userEvent:'input.paste',annotations:isolateHistory.of('full'),scrollIntoView:true});
  view.focus();focusEditableBlock(view);
  return true;
}
export function editableClipboardMode(view) {
  const controller = controllers.get(view.dom.closest('.cm-live-editable-block'));
  if (!controller?.valid()) return null;
  const index = controller.editors.indexOf(view);
  if (index < 0) return null;
  const range = controller.range(index);
  return ['code', 'comment'].includes(controller.widget.item.kind) || range.role === 'summary' ? 'plain' : 'rich';
}
export function normalizeEditableInsertion(inner, text) {
  const controller = controllers.get(inner.dom.closest('.cm-live-editable-block'));
  if (!controller?.valid()) return text;
  const range = controller.range(controller.editors.indexOf(inner));
  if (controller.widget.item.kind === 'table') return safeCellInsertion(text);
  if (range?.role === 'summary') return text.replace(/\r\n?|\n/g, ' ').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
  const owner = resolveEditableOwner(inner, {from:0,to:inner.state.doc.length}, true);
  return owner?.projectionPrefix ? text.replaceAll('\n','\n'+owner.projectionPrefix) : text;
}
export function extendPointerSelection(event, inner) {
  if (!event.shiftKey || event.button !== 0 || editorHasComposition(inner)) return false;
  const owner = resolveEditableOwner(inner, { from: 0, to: inner.state.doc.length });
  if (!owner || owner.view === inner || editorHasComposition(owner.view) || owner.view.state.selection.ranges.length !== 1) return false;
  const selection = owner.view.state.selection.main;
  if (inner.hasFocus && selection.from >= owner.from && selection.to <= owner.to) return false;
  const local = inner.posAtCoords({ x: event.clientX, y: event.clientY });
  if (!Number.isInteger(local)) return false;
  event.preventDefault();
  owner.view.dispatch({ selection: { anchor: selection.anchor, head: resolveEditableOwner(inner,{from:local,to:local}).from },
    effects: crossSelection.of(true), userEvent: 'select.pointer', scrollIntoView: true });
  owner.view.focus();
  return true;
}
// A projected child has no search panel of its own. Forward only the owner's
// temporary reveal intent, never a query or a second document mutation.
export const editableSearchSelection = StateEffect.define();
const projectedSearchSelections = new WeakMap();
const sourceSearchCache = new WeakMap();
export function syncEditableSearch(view) {
  if (view.destroyed || editorHasComposition(view)) return;
  const children = [...view.dom.querySelectorAll('.cm-live-editable-block')].map(root=>controllers.get(root))
    .filter(c=>c?.view===view && c.valid());
  if (!children.length) return;
  let matches = view.state.field(projectedSearchMatches,false);
  if (matches == null) {
    matches = [];
    const query = getSearchQuery(view.state);
    if (searchPanelOpen(view.state) && query.valid) {
      let from=view.state.doc.length,to=0;
      for(const child of children){from=Math.min(from,child.widget.item.from);to=Math.max(to,child.widget.item.to);}
      let cached = sourceSearchCache.get(view);
      if (!cached || cached.doc!==view.state.doc || !cached.query.eq(query) || cached.from!==from || cached.to!==to) {
        const cursor = query.getCursor(view.state,from), found = [];
        // Leave the cursor's end at the real document end: truncating it at a
        // projected field would invent regex $ and word boundaries there.
        while (!cursor.next().done) {
          const match=cursor.value;
          if (match.from>=to) break;
          if (match.to>match.from) found.push({from:match.from,to:match.to});
        }
        cached={doc:view.state.doc,query,from,to,matches:found};sourceSearchCache.set(view,cached);
      }
      matches=cached.matches.map(m=>({...m,selected:view.state.selection.ranges.some(r=>r.from===m.from&&r.to===m.to)}));
    }
  }
  for (const controller of children) {
    controller.syncing=true;
    try {controller.ranges().forEach((range,index)=>{
      const inner=controller.editors[index];if(!inner || inner.destroyed)return;
      const projected=projectSearchMatches(matches,range);
      if(!sameSearchMatches(inner.state.field(projectedSearchMatches),projected)) inner.dispatch({effects:updateProjectedSearch.of(projected)});
    });} finally {controller.syncing=false;}
  }
}
export function syncEditableSelections(view, searchSelection = false) {
  if (editorHasComposition(view)) return;
  const selection = view.state.selection.main;
  for (const root of view.dom.querySelectorAll('.cm-live-editable-block')) {
    const controller = controllers.get(root);
    if (controller?.view !== view || !controller.valid()) continue;
    controller.syncing = true;
    try { controller.ranges().forEach((range, index) => {
      const inner = controller.editors[index];
      // Pointer selection is dispatched before focus leaves the inner editor.
      // A cross-field range must paint its inner portion during that handoff.
      if (!inner || inner.destroyed || (inner.hasFocus && !view.state.field(crossSelectionField, false))) return;
      const clamp = position => fieldOffset(range,position);
      const selected = view.state.selection.ranges.filter(r=>r.to>range.from&&r.from<range.to).map(r=>EditorSelection.range(clamp(r.anchor),clamp(r.head)));
      const next = EditorSelection.create(selected.length ? selected : [EditorSelection.range(clamp(selection.anchor),clamp(selection.head))]);
      const reveal = searchSelection && next.ranges.some(r=>!r.empty);
      if (!inner.state.selection.eq(next) || projectedSearchSelections.get(inner) !== reveal) {
        projectedSearchSelections.set(inner, reveal);
        inner.dispatch({ selection: next, effects: editableSearchSelection.of(reveal) });
      }
    }); } finally { controller.syncing = false; }
  }
}
export function syncEditableSpelling(view) {
  if (editorHasComposition(view)) return;
  const marks = view.state.field(spellingDecorations, false) || Decoration.none;
  for (const root of view.dom.querySelectorAll('.cm-live-editable-block')) {
    const controller = controllers.get(root);
    if (controller?.view !== view || !controller.valid()) continue;
    controller.syncing = true;
    try { controller.ranges().forEach((range,index) => {
      const inner = controller.editors[index];
      if (!inner || inner.destroyed) return;
      const next = ['code','comment'].includes(controller.widget.item.kind)
        ? Decoration.none : projectSpellingDecorations(marks,range);
      if (!RangeSet.eq([inner.state.field(spellingDecorations)],[next])) inner.dispatch({effects:setSpellingDecorations.of(next)});
      syncEditableSpelling(inner);
    }); } finally { controller.syncing = false; }
  }
}
export function extendEditableSelection(view, direction, vertical = false) {
  const selection = view.state.selection.main;
  if (editorHasComposition(view) || selection.empty || view.state.selection.ranges.length !== 1) return false;
  for (const root of view.dom.querySelectorAll('.cm-live-editable-block')) {
    const controller = controllers.get(root);
    if (controller?.view !== view || !controller.valid()) continue;
    const ranges = controller.ranges(), index = ranges.findIndex(range => selection.head >= range.from && selection.head <= range.to);
    if (index < 0) continue;
    const range = ranges[index], inner = controller.editors[index];
    if (!inner) return false;
    const local = EditorSelection.cursor(fieldOffset(range,selection.head));
    const moved = vertical ? inner.moveVertically(local, direction > 0) : inner.moveByChar(local, direction > 0);
    let head = fieldPosition(range,moved.head);
    if (moved.head === local.head) {
      const target = editableBoundaryTarget({ length: view.state.doc.length, item: controller.widget.item, ranges, index, direction, vertical });
      if (!target) return false;
      head = target.index === undefined ? target.position : (direction > 0 ? ranges[target.index].from : ranges[target.index].to);
    }
    view.dispatch({ selection: { anchor: selection.anchor, head }, effects: crossSelection.of(true), scrollIntoView: true }); return true;
  }
  if (view.state.field(crossSelectionField, false)) {
    const cursor = EditorSelection.cursor(selection.head);
    const moved = vertical ? view.moveVertically(cursor, direction > 0) : view.moveByChar(cursor, direction > 0);
    if (moved.head === selection.head) return false; // Let this projection extend into its own parent.
    view.dispatch({ selection: { anchor: selection.anchor, head: moved.head }, effects: crossSelection.of(true), scrollIntoView: true }); return true;
  }
  return false;
}
export function forwardEditableEffects(view, effects) {
  for (const root of view.dom.querySelectorAll('.cm-live-editable-block')) {
    const controller = controllers.get(root);
    if (controller?.view !== view || !controller.valid()) continue;
    controller.syncing = true;
    try { for (const inner of controller.editors) if (inner && !inner.destroyed) {
      if (editorHasComposition(inner) || controller.pendingEffects.has(inner)) controller.deferEffects(inner, effects);
      else inner.dispatch({ effects });
    } }
    finally { controller.syncing = false; }
  }
}
export function focusEditableBlock(view, searchSelection = false) {
  if (editorHasComposition(view)) return false;
  // A single child cannot own a document-wide multi-selection.
  if (view.state.selection.ranges.length !== 1) return false;
  const selection = view.state.selection.main;
  for (const root of view.dom.querySelectorAll('.cm-live-editable-block')) {
    const controller = controllers.get(root);
    if (controller?.view !== view || !controller.valid()) continue;
    const ranges = controller.ranges();
    const index = ranges.findIndex(range => selection.from >= range.from && selection.to <= range.to);
    if (index < 0) continue;
    const inner = controller.activate?.(index) || controller.editors[index], range = ranges[index];
    if (!inner) return false;
    controller.syncing = true;
    try {
      projectedSearchSelections.set(inner, searchSelection);
      inner.dispatch({ selection: { anchor: fieldOffset(range,selection.anchor), head: fieldOffset(range,selection.head) }, effects: editableSearchSelection.of(searchSelection) });
    }
    finally { controller.syncing = false; }
    if (!inner.hasFocus) inner.focus(); return true;
  }
  return false;
}

export function runEditableHistory(view, command) {
  const owner = resolveEditableOwner(view);
  if (!owner) return false;
  const target = owner.view, doc = target.dom.ownerDocument;
  const hadFocus = target.dom.contains(doc.activeElement);
  const handled = command(target);
  // History restores the authoritative selection, even when a surviving child
  // still has focus and its old caret. Reconcile that child too, otherwise redo
  // after a reverse selection types at the old start instead of the restored end.
  // Never steal focus from a control outside this editor.
  if (handled && hadFocus && !target.destroyed && (target.dom.contains(doc.activeElement) || !doc.activeElement || doc.activeElement === doc.body)) {
    if (!focusEditableBlock(target)) {
      target.focus();
      syncEditableSelections(target);
    }
  }
  return handled;
}

export function keepVisibleBlockStable(view, range, options) {
  // A partially visible code block can be much taller than the viewport.
  // Its focused child owns the actual caret; never reveal the outer fence
  // while that child is processing pointer placement or text input.
  const active = EditorView.findFromDOM(view.dom.ownerDocument.activeElement);
  if (active && active !== view && view.dom.contains(active.dom) && !projectedSearchSelections.get(active) && holdsCodeInputScroll(active, options)) {
    const caret = resolveEditableOwner(active), target = resolveEditableOwner(view, range);
    if (caret && target && caret.view === target.view && caret.from === target.from && caret.to === target.to) return true;
  }
  const viewport = view.scrollDOM.getBoundingClientRect();
  for (const root of view.dom.querySelectorAll('.cm-live-editable-block')) {
    const controller = controllers.get(root), item = controller?.widget.item, rect = root.getBoundingClientRect();
    if (controller?.view === view && item && range.from >= item.from && range.to <= item.to && rect.top >= viewport.top && rect.bottom <= viewport.bottom) return true;
  }
  return false;
}
function codeColors(doc, widget) {
  if (!widget.options.context.render) return Decoration.none;
  const container = document.createElement('div');
  // Same sanitized renderer as the outer editor. Only hljs classes are copied.
  container.innerHTML = widget.options.context.render('', { ...widget.item, text: doc.toString() });
  const ranges = [];
  let offset = 0;
  const walk = node => {
    const from = offset;
    if (node.nodeType === 3) offset += node.textContent.length;
    else for (const child of node.childNodes) walk(child);
    if (node.nodeType === 1 && node.tagName === 'SPAN' && offset > from) {
      const classes = [...node.classList].filter(name => /^hljs-[\w-]+$/.test(name)).join(' ');
      if (classes) ranges.push(Decoration.mark({ class: classes }).range(from, Math.min(offset, doc.length)));
    }
  };
  walk(container.querySelector('code') || container);
  return Decoration.set(ranges, true);
}

function applyTablePresentation(root, item, previous) {
  if (item.kind !== 'table') return;
  const widthsChanged = !previous || item.widths?.join() !== previous.widths?.join();
  const alignmentsChanged = !previous || item.alignments?.join() !== previous.alignments?.join();
  if (!widthsChanged && !alignmentsChanged) return;
  const table = root.querySelector('table');
  if (!table) return;
  if (widthsChanged) {
    table.querySelector(':scope > colgroup')?.remove();
    table.style.width = '';
    if (item.widths) {
      const cols = document.createElement('colgroup');
      for (const width of item.widths) { const col=document.createElement('col');col.style.width=`${width}px`;cols.append(col); }
      table.prepend(cols);table.style.width=`${item.widths.reduce((sum,width)=>sum+width,0)}px`;
    }
  }
  // Changing only the delimiter row must refresh alignment without remounting
  // the focused cell editor. The source renderer supplies only sanitized HTML.
  if (alignmentsChanged) for (const row of table.rows) [...row.cells].forEach((cell,index)=>cell.setAttribute('align',item.alignments?.[index] || 'left'));
}

export class EditableBlockWidget extends WidgetType {
  constructor(item, state, options) { super(); this.item = item; this.options = options; this.references = imageDefinitionsFor(state); this.footnotes = footnotesFor(state); this.readOnly = state.readOnly; this.labels = ['View source', 'Edit table', 'Table cell', 'Code content', 'Section title', 'Section content', 'Comment (not shown when reading)', 'Collapse content', 'Expand content', 'Footnote content', 'Footnote'].map(key => state.phrase(key)); }
  eq(other) {
    // A document revision is not a visual change to every widget. Retaining
    // unchanged widgets also retains their measured heights in CodeMirror.
    return this.item.kind === other.item.kind && this.item.from === other.item.from && this.item.to === other.item.to && this.item.raw === other.item.raw
      && this.item.widths?.join() === other.item.widths?.join()
      && this.references === other.references && sameFootnotePresentation(this.footnotes, other.footnotes) && this.options.context === other.options.context && this.readOnly === other.readOnly && this.labels.join() === other.labels.join();
  }
  ignoreEvent() { return true; }
  coordsAt(root, offset, side) {
    const controller = controllers.get(root);
    if (!controller?.valid()) return null;
    const position = controller.widget.item.from + offset;
    const ranges = controller.ranges();
    const source = controller.view.state.doc;
    const index = ranges.findIndex(range => editableFieldContains(source, range, position, position, controller.widget.item.kind));
    const inner = controller.editors[index];
    if (!inner || inner.destroyed || !inner.dom.getClientRects().length || inner.dom.closest('[hidden]')) return null;
    // Root selection coordinates must come from the actual child text, not
    // the bounding box of the entire table/code block. This also recurses
    // through details and footnote projections.
    return inner.coordsAtPos(fieldOffset(ranges[index], position), side);
  }
  updateDOM(root, view) {
    const controller = controllers.get(root);
    if (!controller || controller.widget.item.kind !== this.item.kind || controller.widget.readOnly !== this.readOnly || controller.widget.labels.join() !== this.labels.join()
      || controller.widget.options.context !== this.options.context) return false;
    if (controller.widget.item.lightweight !== this.item.lightweight || this.item.cells && controller.cellCount !== this.item.cells.length) return false;
    const previous = controller.widget.item;
    const previousWidget = controller.widget;
    controller.widget = this;
    if (this.item.lightweight && !controller.refreshTable(previousWidget)) {
      controller.widget = previousWidget;
      return false;
    }
    controller.sync(view);
    applyTablePresentation(root,this.item,previous);
    const number=root.querySelector(':scope > .cm-live-footnote-number');
    if(number){number.textContent=String(this.item.number);number.title=`${this.labels[10]} ${this.item.number} [${this.item.label}]`;}
    return true;
  }
  destroy(root) {
    const controller = controllers.get(root);
    controller?.cancelSync?.();
    controller?.stopPointer?.();
    controller?.pendingEffects.forEach(pending => pending.cancel());
    controller?.unregister.forEach(remove => remove?.());
    controller?.editors.forEach(editor => { if (editor) {clearNativeCodeInputScroll(editor);editor.destroy();} });
    if (this.item.lightweight) this.options.context.releaseTable?.(root);
    controllers.delete(root);
  }
  toDOM(view) {
    const root = document.createElement('div');
    root.className = `cm-live-widget cm-live-${this.item.kind} cm-live-editable-block`;
    if (this.item.lightweight) root.classList.add('cm-live-table-lightweight');
    root.contentEditable = 'false';
    for (const type of ['mousedown', 'mouseup', 'click', 'dblclick', 'paste', 'copy', 'cut', 'compositionstart', 'compositionupdate', 'compositionend']) root.addEventListener(type, event => event.stopPropagation());
    const controller = {
      widget: this, view, editors: [], unregister: [], syncing: false, cellCount: this.item.cells?.length,
      pendingEffects: new Map(), cancelSync: null,
      deferEffects(inner, effects) {
        let pending = this.pendingEffects.get(inner);
        if (pending) { pending.effects.push(...effects); return; }
        pending = {effects:[...effects]}; this.pendingEffects.set(inner, pending);
        pending.cancel = afterComposition(inner, () => {
          this.pendingEffects.delete(inner);
          const syncing = this.syncing; this.syncing = true;
          try { inner.dispatch({effects:pending.effects}); } finally { this.syncing = syncing; }
        }, () => this.valid() && controllers.get(root) === this);
      },
      syncLater() {
        if (this.cancelSync) return;
        this.cancelSync = afterComposition(view, () => { this.cancelSync = null; this.sync(); }, () => this.valid() && controllers.get(root) === this);
      },
      range(index) {
        const item = this.widget.item, focused = this.editors[index]?.hasFocus;
        if (item.kind === 'table' && focused) return retainEditableCellPadding(view.state.doc, item.cells[index], view.state.selection);
        if (item.kind === 'footnote-definition' && focused) return retainFootnoteCaretPadding(view.state.doc, item, view.state.selection);
        return item.cells ? item.cells[index] : { from: item.contentFrom, to: item.contentTo, projection: item.projection };
      },
      ranges() {
        const item = this.widget.item;
        if (item.kind === 'table') {
          // At most one child owns focus. Use the active element once, rather
          // than querying document focus for every mounted table cell.
          const active = view.root.activeElement;
          const index = active ? this.editors.findIndex(editor => editor?.contentDOM === active) : -1;
          if (index < 0 || !this.editors[index].hasFocus) return item.cells;
          const ranges = item.cells.slice();
          ranges[index] = retainEditableCellPadding(view.state.doc, ranges[index], view.state.selection);
          return ranges;
        }
        if (item.kind === 'footnote-definition') return [this.range(0)];
        return item.cells || [{ from: item.contentFrom, to: item.contentTo, projection:item.projection }];
      },
      // Equality may retain this controller across unrelated document edits.
      // Validate its exact current source range rather than a stale doc object.
      valid() { return !view.destroyed && !view.state.readOnly && root.isConnected && view.state.sliceDoc(this.widget.item.from, this.widget.item.to) === this.widget.item.raw; },
      sync() {
        this.syncing = true;
        const doc = view.state.doc;
        try {
          this.ranges().forEach((range, i) => {
            const editor = this.editors[i];
            if (!editor) return;
            const text = range.projection?.text ?? doc.sliceString(range.from, range.to);
            const previous = editor.state.doc.toString();
            const effects=this.widget.references && imageDefinitionsFor(editor.state)!==this.widget.references
              ? [updateImageDefinitions.of(this.widget.references)] : [];
            if(this.widget.footnotes && footnotesFor(editor.state)!==this.widget.footnotes)effects.push(updateFootnotes.of(this.widget.footnotes));
            if (previous !== text) {
              let from = 0, end = previous.length, nextEnd = text.length;
              while (from < end && from < nextEnd && previous[from] === text[from]) from++;
              while (end > from && nextEnd > from && previous[end - 1] === text[nextEnd - 1]) { end--; nextEnd--; }
              editor.dispatch({ changes: { from, to: end, insert: text.slice(from, nextEnd) },
                selection: { anchor: Math.min(editor.state.selection.main.head, text.length) }, effects, annotations: editableProjectionSync.of(true) });
            } else if (effects.length) {
              // Re-read the latest definitions after commit, not an old snapshot.
              if (editorHasComposition(editor)) this.syncLater();
              else editor.dispatch({effects,annotations:editableProjectionSync.of(true)});
            }
          });
        } finally { this.syncing = false; }
      },
    };
    controllers.set(root, controller);
    const isTable = this.item.kind === 'table', isDetails = this.item.kind === 'details', isFootnote=this.item.kind==='footnote-definition';
    const lazy = !!this.item.lightweight;
    const isProse = isDetails || isFootnote || this.item.kind === 'html-content';
    if(isFootnote){const number=document.createElement('span');number.className='cm-live-footnote-number';number.textContent=String(this.item.number);number.title=`${this.labels[10]} ${this.item.number} [${this.item.label}]`;root.append(number);}
    const content = document.createElement('div'); content.className = 'cm-live-block-content'; root.append(content);
    let mounts = [];
    if (isTable) {
      // Use the safe renderer for alignment and table structure, not editable HTML.
      if (lazy && this.options.context.renderTable) this.options.context.renderTable(content, this.item.renderSource, this.references);
      else content.innerHTML = this.options.context.render?.(this.item.renderSource ?? this.item.raw, this.item) || '';
      // Only this table owns the source cells. A generated image row (or other
      // nested HTML table) belongs to its cell editor, not to this mapping.
      const table = content.querySelector('table');
      if (table) for (const row of table.rows) for (const cell of row.cells) mounts.push(cell);
      if (mounts.length !== this.item.cells.length || lazy && mounts.some((cell, i) =>
        cell.cellIndex !== this.item.cells[i].column || cell.parentElement.rowIndex !== this.item.cells[i].row)) {
        content.textContent = this.item.raw;
        mounts = [];
      }
      root.addEventListener('mousedown', event => {
        // The empty footer is not a cell or a horizontal scrollbar. The
        // widget swallows mouse events, so send this plain click to the text
        // view ourselves instead of leaving the last cell focused.
        if (event.button !== 0 || event.detail !== 1 || event.shiftKey || event.ctrlKey || event.metaKey || event.altKey
          || (event.target !== root && event.target !== content) || !controller.valid() || editorHasComposition(view)) return;
        const rendered = content.querySelector('table');
        if (!rendered || event.clientY <= rendered.getBoundingClientRect().bottom) return;
        const box = content.getBoundingClientRect();
        if (content.offsetHeight > content.clientHeight && event.clientY >= box.top + content.clientHeight && event.clientY < box.bottom) return;
        const line = tableFollowingBlank(view.state.doc, controller.widget.item.to);
        if (!line) return;
        event.preventDefault();
        view.dispatch({ selection: EditorSelection.cursor(line.from, 1), userEvent: 'select.pointer' });
        view.focus();
      });
    } else if (isDetails) {
      const header = document.createElement('div'); header.className = 'cm-live-details-header';
      const summary = document.createElement('div'); summary.className = 'cm-live-details-title';
      const body = document.createElement('div'); body.className = 'cm-live-details-body';
      const toggle = document.createElement('button'); toggle.type = 'button'; toggle.textContent = this.labels[7]; toggle.setAttribute('aria-expanded', 'true');
      toggle.onclick = () => { body.hidden = !body.hidden; toggle.textContent = this.labels[body.hidden ? 8 : 7]; toggle.setAttribute('aria-expanded', String(!body.hidden)); view.requestMeasure(); };
      header.append(summary, toggle); content.append(header, body); mounts.push(summary, body);
    } else {
      if (this.item.kind === 'comment') { const label = document.createElement('small'); label.textContent = this.labels[6]; content.append(label); const body = document.createElement('div'); content.append(body); mounts.push(body); }
      else mounts.push(content);
    }
    const leave = (after = true) => {
      if (!controller.valid()) return true;
      const item = controller.widget.item;
      view.dispatch({ selection: { anchor: after ? Math.min(view.state.doc.length, item.to + 1) : Math.max(0, item.from - 1) } });
      view.focus(); return true;
    };
    const mountEditor = (mount, index) => {
      mount.replaceChildren();
      const range = controller.range(index);
      const isSummary = range.role === 'summary';
      const history = command => () => { if (controller.valid()) runEditableHistory(view, command); return true; };
      const move = step => () => {
        const next = controller.activate?.(index + step) || controller.editors[index + step];
        if (!next) return leave(step > 0);
        const hiddenBody = next.dom.closest('.cm-live-details-body');
        if (hiddenBody?.hidden) { hiddenBody.hidden = false; const toggle = root.querySelector('.cm-live-details-header button'); toggle.textContent = controller.widget.labels[7]; toggle.setAttribute('aria-expanded', 'true'); view.requestMeasure(); }
        next.focus(); return true;
      };
      const navigateBoundary = (direction, vertical = false) => inner => {
        const selection = inner.state.selection.main;
        if (!controller.valid() || editorHasComposition(inner) || inner.state.selection.ranges.length !== 1 || !selection.empty) return false;
        // Let CodeMirror handle ordinary/wrapped text navigation. Intercept only
        // when it has no text left in the requested direction.
        if (selection.head !== (direction < 0 ? 0 : inner.state.doc.length)) return false;
        const target = editableBoundaryTarget({ length: view.state.doc.length, item: controller.widget.item,
          ranges: controller.ranges(), index, direction, vertical });
        if (!target) return false;
        if (target.index !== undefined) {
          const next = controller.activate?.(target.index) || controller.editors[target.index];
          if (!next) return false;
          const hiddenBody = next.dom.closest('.cm-live-details-body');
          if (hiddenBody?.hidden) {
            hiddenBody.hidden = false;
            const toggle = root.querySelector('.cm-live-details-header button');
            toggle.textContent = controller.widget.labels[7]; toggle.setAttribute('aria-expanded', 'true'); view.requestMeasure();
          }
          next.dispatch({ selection: { anchor: target.after ? next.state.doc.length : 0 } }); next.focus();
        } else {
          view.dispatch({ selection: { anchor: target.position }, scrollIntoView: true }); view.focus();
        }
        return true;
      };
      const extendBoundary = (direction, vertical = false) => inner => {
        const selection = inner.state.selection.main;
        if (!controller.valid() || editorHasComposition(inner) || inner.state.selection.ranges.length !== 1
          || selection.head !== (direction < 0 ? 0 : inner.state.doc.length)) return false;
        const ranges = controller.ranges();
        const target = editableBoundaryTarget({ length: view.state.doc.length, item: controller.widget.item, ranges, index, direction, vertical });
        if (!target) return false;
        const head = target.index === undefined ? target.position : (direction > 0 ? ranges[target.index].from : ranges[target.index].to);
        view.dispatch({ selection: { anchor: fieldPosition(ranges[index],selection.anchor), head }, effects: crossSelection.of(true), scrollIntoView: true });
        view.focus(); return true;
      };
      const editor = new EditorView({ parent: mount,
        state: EditorState.create({ doc: range.projection?.text ?? view.state.doc.sliceString(range.from, range.to), extensions: [
          imageDefinitionsField, ...(this.references ? [inheritedImageDefinitions.of(this.references)] : []),
          footnotesField, ...(this.footnotes ? [inheritedFootnotes.of(this.footnotes)] : []),
          footnoteBodyContext.of(isFootnote || view.state.facet(footnoteBodyContext)),
          singleLineMedia.of(isTable),
          EditorState.readOnly.of(view.state.readOnly), EditorView.editable.of(!view.state.readOnly),
          view.state.facet(EditorState.phrases).map(phrases => EditorState.phrases.of(phrases)),
          EditorView.lineWrapping, drawSelection(), EditorState.allowMultipleSelections.of(true), projectedSearchMatches,
          spellingDecorations, EditorView.decorations.from(spellingDecorations),
          nestedSourcePanel.of(true),
          EditorView.editorAttributes.of({ class: isProse && !isSummary ? 'cm-live-inner cm-live-prose' : 'cm-live-inner' }),
          EditorView.contentAttributes.of({ 'aria-label': isTable ? `${this.labels[2]} ${range.row + 1}, ${range.column + 1}` : isFootnote ? this.labels[9] : isSummary ? this.labels[4] : isProse ? this.labels[5] : this.item.kind === 'comment' ? this.labels[6] : this.labels[3] }),
          ...(this.item.kind === 'code' ? [EditorView.contentAttributes.of({title: view.state.phrase('Tab / Shift+Tab: indent / unindent. Escape: return to document.')}),
            EditorView.scrollHandler.of((inner, _range, options) => holdsCodeInputScroll(inner, options))] : []),
          keymap.of([
            { key: 'Mod-z', run: history(undo) }, { key: 'Mod-Shift-z', run: history(redo) }, { key: 'Mod-y', run: history(redo) },
            { key: 'Escape', run: () => leave() },
            { key: 'ArrowLeft', run: navigateBoundary(-1) }, { key: 'ArrowRight', run: navigateBoundary(1) },
            { key: 'ArrowUp', run: navigateBoundary(-1, true) }, { key: 'ArrowDown', run: navigateBoundary(1, true) },
            { key: 'Shift-ArrowLeft', run: extendBoundary(-1) }, { key: 'Shift-ArrowRight', run: extendBoundary(1) },
            { key: 'Shift-ArrowUp', run: extendBoundary(-1, true) }, { key: 'Shift-ArrowDown', run: extendBoundary(1, true) },
            ...(isTable || isDetails ? [{ key: 'Tab', run: move(1) }, { key: 'Shift-Tab', run: move(-1) }] : []),
            ...(this.item.kind === 'code' ? [indentWithTab] : []),
            ...(isTable || isSummary ? [{ key: 'Enter', run: inner => insertSingleLineMultiBreak(inner) || move(1)(inner) }] : []),
            ...defaultKeymap,
          ]),
          ...(isTable || isProse ? [...(isSummary ? [] : [controller.widget.options.inline()]), EditorState.transactionFilter.of(tr => {
            if (!tr.docChanged || controller.syncing) return tr;
            const raw = tr.newDoc.toString(), sanitize = isTable ? safeCellInsertion : isSummary ? text => text.replace(/\r\n?|\n/g, ' ').replaceAll('<', '&lt;').replaceAll('>', '&gt;') : text => text;
            const safe = sanitize(raw);
            if (safe === raw) return tr;
            const selection = mapEditableSelection(tr.newSelection, offset => sanitize(raw.slice(0, offset)).length);
            return { changes: { from: 0, to: tr.startState.doc.length, insert: safe }, selection, userEvent: 'input.paste' };
          })] : this.item.kind === 'code' ? [EditorView.decorations.compute(['doc'], state => codeColors(state.doc, controller.widget)), liveSelectionDisplay(() => false)] : []),
          EditorView.domEventHandlers({
            compositionstart(event, inner) { if(controller.widget.item.kind==='code')captureNativeCodeInputScroll(event,inner);return false; },
            beforeinput(event, inner) {
              if(controller.widget.item.kind !== 'code')return false;
              captureNativeCodeInputScroll(event,inner);
              return handleCodeTextInput(event, inner);
            },
            input(_event, inner) { finishNativeCodeInputScroll(inner); return false; },
            mousedown(event, inner) { if (controller.widget.item.kind === 'code') setCodeInputScroll(inner, true); return extendPointerSelection(event, inner); },
            keydown(event, inner) {
              if (controller.widget.item.kind === 'code') setCodeInputScroll(inner, false);
              // Parent CodeMirror must never process the same editing key twice.
              // Document-level Save still receives its shortcut.
              if (!((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 's')) event.stopPropagation();
              // Search belongs to the complete document, not a projected cell
              // or body. Keep query state and navigation in its root editor.
              const rootShortcut = (event.ctrlKey || event.metaKey) && ['b', 'i', 'k', 'f', 'g', 'd'].includes(event.key.toLowerCase()) || event.key === 'F3';
              if (rootShortcut && controller.valid()) {
                const owner = resolveEditableOwner(view);
                if (owner) {
                  const handled = runScopeHandlers(owner.view, event, 'editor');
                  // findNext/Previous normally run in the already-focused root.
                  // Forwarding must move focus too, or typing edits the old cell.
                  // Select-next-occurrence can span multiple projected fields;
                  // its selection and following input belong to the root too.
                  const navigation = event.key === 'F3' || (event.ctrlKey || event.metaKey) && ['g','d'].includes(event.key.toLowerCase()) && !event.altKey;
                  if (handled && navigation) owner.view.focus();
                  return handled;
                }
              }
              return false;
            },
            focus() { if (controller.valid()) view.dispatch({ selection: mapEditableSelection(editor.state.selection, offset => fieldPosition(controller.range(index),offset)),
              ...(projectedSearchSelections.get(editor) ? {effects: editableSearchSelection.of(true)} : {}), annotations: isolateHistory.of('before') }); return false; },
          }),
        ] }),
        dispatchTransactions(transactions, inner) {
          const before = inner.state;
          const wasFocused = inner.hasFocus;
          if (!controller.syncing && controller.widget.item.kind === 'code') trackCodeInputScroll(inner, transactions);
          inner.update(transactions);
          if (controller.syncing || !controller.valid()) return;
          const range = controller.range(index), selection = inner.state.selection;
          const transaction = { selection: mapEditableSelection(selection, offset => fieldPosition(range,offset)) };
          // A child scroll request must reach the actual document scroller,
          // including when removing a large media widget shrinks several parents.
          if (transactions.some(next => next.scrollIntoView)) transaction.scrollIntoView = true;
          if (before.doc !== inner.state.doc) {
            // One authoritative document and undo history, updated on every input.
            // An immediately closed empty fence has no separator after its
            // editable body. The user's trailing newline belongs to the body,
            // not the closing fence; retain both so the next input stays inside.
            const suffix = emptyCodeSeparator(view.state.doc, controller.widget.item, range);
            // Keep unaffected source positions stable for selection, history
            // and scroll-anchor mapping instead of replacing the entire block.
            let changes = ChangeSet.empty(before.doc.length);
            for (const next of transactions) changes = changes.compose(next.changes);
            transaction.changes = [];
            changes.iterChanges((from, to, _newFrom, _newTo, text) => {
              transaction.changes.push({ from: fieldPosition(range,from), to: fieldPosition(range,to), insert: fieldInsertion(range,text.toString() + suffix) });
            });
            const cellBoundary = isTable && emptyTableCellBoundary(view.state.doc, controller.widget.item, range, inner.state.doc.toString());
            if (cellBoundary) transaction.changes.push(cellBoundary);
            if (range.projection) {
              // Map the new inner selection using the new code's line prefixes,
              // not the old projection whose lengths predate this transaction.
              const sourceChanges=ChangeSet.of(transaction.changes,view.state.doc.length);
              const position=offset=>changedFieldPosition(range,changes,sourceChanges,offset);
              transaction.selection=mapEditableSelection(selection,position);
            }
            transaction.annotations = [Transaction.userEvent.of(transactions.at(-1).annotation(Transaction.userEvent) || 'input.type'), editableForwardedChange.of(true)];
          }
          // Focus and formatting boundaries must reach the authoritative history
          // even when they pass through several projected editors.
          const isolation = transactions.map(next => next.annotation(isolateHistory)).filter(Boolean);
          if (isolation.length) transaction.annotations = [transaction.annotations, isolateHistory.of(isolation.includes('full') || new Set(isolation).size > 1 ? 'full' : isolation[0])].flat().filter(Boolean);
          const owner = wasFocused ? resolveEditableOwner(view)?.view : null;
          view.dispatch(transaction);
          // Removing the last character of an indented block removes its
          // projection. Return focus to the authoritative mapped caret, not
          // the browser's fallback DOM selection on the following line.
          if (wasFocused && inner.destroyed && owner && !owner.destroyed) {
            owner.focus(); focusEditableBlock(owner);
          }
        },
      });
      controller.editors[index] = editor;
      controller.unregister[index] = registerEditableOwner(editor, view, () => controller.range(index), () => controller.valid());
      return editor;
    };
    if (!lazy) mounts.forEach(mountEditor);
    else {
      // There is one projected cell editor, not an editor per row. Keep
      // rendered content in the other cells, including media and alignment.
      let active = -1, stale = false, savedCell = null;
      const indexOf = new WeakMap();
      controller.cellElement = index => mounts[index];
      const indexMounts = () => mounts.forEach((cell, index) => indexOf.set(cell, index));
      indexMounts();
      const repaint = () => {
        const widget = controller.widget, item = widget.item;
        if (!widget.options.context.renderTable) return false;
        widget.options.context.renderTable(content, item.renderSource, widget.references);
        const table = content.querySelector('table'), cells = [];
        if (table) for (const row of table.rows) for (const cell of row.cells) cells.push(cell);
        const exact = cells.length === item.cells.length && cells.every((cell, i) =>
          cell.cellIndex === item.cells[i].column && cell.parentElement.rowIndex === item.cells[i].row);
        if (!exact) content.textContent = item.raw;
        mounts = exact ? cells : [];
        indexMounts();
        applyTablePresentation(root, item);
        stale = false;
        return exact;
      };
      const unmount = () => {
        if (active < 0) return;
        const inner = controller.editors[active];
        controller.pendingEffects.get(inner)?.cancel();
        controller.pendingEffects.delete(inner);
        controller.unregister[active]?.();
        inner.destroy();
        delete controller.editors[active];
        delete controller.unregister[active];
        if (mounts[active] && savedCell) mounts[active].append(savedCell);
        active = -1;
        savedCell = null;
      };
      controller.activate = index => {
        if (!mounts[index] || !controller.valid()) return null;
        if (active === index) return controller.editors[index];
        if (active >= 0 && editorHasComposition(controller.editors[active])) return null;
        unmount();
        if (stale && !repaint()) return null;
        const mount = mounts[index];
        if (!mount) return null;
        active = index;
        savedCell = mount.ownerDocument.createDocumentFragment();
        while (mount.firstChild) savedCell.append(mount.firstChild);
        return mountEditor(mount, index);
      };
      controller.refreshTable = previous => {
        const item = controller.widget.item, old = previous.item;
        if (previous.references === controller.widget.references && item.raw === old.raw && item.renderSource === old.renderSource) return true;
        if (active < 0) { repaint(); return true; }
        const before = old.cells[active], after = item.cells[active];
        // For a normal keystroke in the active cell, do not rebuild the
        // table or detach the focused DOM (in particular during IME).
        if (previous.references !== controller.widget.references || !before || !after
          || before.row !== after.row || before.column !== after.column
          || old.raw.slice(0, before.from - old.from) !== item.raw.slice(0, after.from - item.from)
          || old.raw.slice(before.to - old.from) !== item.raw.slice(after.to - item.from)) return false;
        stale = true;
        return true;
      };
      const doc = root.ownerDocument;
      let stop = null;
      controller.stopPointer = () => stop?.();
      const staticPosition = (cell, index, x, y) => {
        const range = controller.range(index);
        const source = view.state.sliceDoc(range.from, range.to);
        if (cell.textContent !== source) return null;
        const caret = doc.caretPositionFromPoint?.(x, y);
        const browserRange = !caret && doc.caretRangeFromPoint?.(x, y);
        const node = caret?.offsetNode || browserRange?.startContainer;
        const offset = caret?.offset ?? browserRange?.startOffset;
        if (!node || !cell.contains(node) || !Number.isInteger(offset)) return null;
        const prefix = doc.createRange();
        prefix.selectNodeContents(cell);
        prefix.setEnd(node, offset);
        return Math.min(source.length, prefix.toString().length);
      };
      root.addEventListener('mousedown', event => {
        if (event.button !== 0 || event.ctrlKey || event.metaKey || event.altKey || event.target.closest('.cm-editor') !== view.dom) return;
        const cell = event.target.closest('td, th'), index = indexOf.get(cell);
        if (index === undefined || mounts[index] !== cell) return;
        // Hit-test the visible glyphs before replacing them with CodeMirror.
        // Use native projected hit-testing for cells with hidden Markdown.
        const hit = staticPosition(cell, index, event.clientX, event.clientY);
        const inner = controller.activate(index);
        if (!inner) return;
        event.preventDefault();
        const point = next => inner.posAtCoords({x:next.clientX, y:next.clientY}, false);
        const position = hit ?? point(event);
        if (!Number.isInteger(position)) return;
        const anchor = event.shiftKey ? inner.state.selection.main.anchor : position;
        inner.focus();
        inner.dispatch({selection:{anchor,head:position},userEvent:'select.pointer'});
        stop?.();
        const move = next => {
          if (inner.destroyed || !next.buttons || controller.editors[index] !== inner) { stop?.(); return; }
          const head = point(next);
          if (Number.isInteger(head)) {
            next.preventDefault();
            inner.dispatch({selection:{anchor,head},userEvent:'select.pointer'});
          }
        };
        const end = () => stop?.();
        stop = () => {
          doc.removeEventListener('mousemove', move, true);
          doc.removeEventListener('mouseup', end, true);
          doc.defaultView.removeEventListener('blur', end);
          stop = null;
        };
        doc.addEventListener('mousemove', move, true);
        doc.addEventListener('mouseup', end, true);
        doc.defaultView.addEventListener('blur', end);
      });
      root.addEventListener('click', event => { if (event.target.closest('a')) event.preventDefault(); });
    }
    const actions = document.createElement('div'); actions.className = 'cm-live-block-actions';
    const action = (label, callback) => { const button = document.createElement('button'); button.type = 'button'; button.textContent = label; button.onmousedown = event => event.preventDefault(); button.onclick = event => { event.stopPropagation(); if (controller.valid()) callback(event); }; actions.append(button); };
    if (isTable && !lazy && this.options.context.editTable) action(this.labels[1], () => controller.widget.options.context.editTable(controller.widget.item, view));
    action(lazy ? view.state.phrase('Edit table source') : this.labels[0], event => {
      const position = Math.max(controller.widget.item.from, Math.min(view.state.selection.main.head, controller.widget.item.to));
      const open=()=>{controller.widget.options.source(view, position);view.focus();};
      if(lazy) {
        open();
        view.dispatch({effects:EditorView.scrollIntoView(position,{y:'nearest'})});
      }
      else if(event.detail>0)preserveSourceBlockPosition(view,controller.widget.item.from,root.getBoundingClientRect().top,open);
      else {open();revealSourceReturnCaret(view);}
    });
    if (lazy) {
      actions.className = 'cm-live-large-table-header';
      const hint = document.createElement('span');
      hint.textContent = view.state.phrase('Large table · click a cell to edit');
      actions.prepend(hint);
      root.prepend(actions);
    } else root.append(actions);
    applyTablePresentation(root,this.item);
    return root;
  }
}
