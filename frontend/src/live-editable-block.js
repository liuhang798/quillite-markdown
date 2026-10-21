import { ChangeSet, EditorState, EditorSelection, StateEffect, Transaction, RangeSet } from '@codemirror/state';
import { Decoration, EditorView, WidgetType, keymap, drawSelection, runScopeHandlers } from '@codemirror/view';
import { defaultKeymap, undo, redo, isolateHistory, indentWithTab } from '@codemirror/commands';
import { registerEditableOwner, resolveEditableOwner, editableProjectionSync, editableForwardedChange } from './editable-owner.js';
import { editableBoundaryTarget } from './editable-boundary.js';
import { crossSelection, crossSelectionField } from './editable-cross-selection.js';
import { fieldPosition, fieldOffset, fieldText, fieldInsertion, changedFieldPosition } from './projected-code.js';
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
import {editorHasComposition} from './editor-composition.js';

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

// A final GFM cell may omit its closing pipe while nonempty. Once cleared,
// its preceding separator would be read as the row's closing pipe, losing a
// column. Materialize only the missing boundary in the same user transaction.
export function emptyTableCellBoundary(source, item, field, text) {
  if (item.kind !== 'table' || text.trim() || !item.cells?.length) return null;
  if (item.cells.some(cell => cell.row === field.row && cell.column > field.column)) return null;
  const end = source.indexOf('\n', field.to);
  const to = end < 0 ? source.length : end;
  if (!/^[ \t]*$/.test(source.slice(field.to, to))) return null;
  return {from: to, insert: '|'};
}

export function mapEditableSelection(selection, position) {
  return EditorSelection.create(selection.ranges.map(range => EditorSelection.range(position(range.anchor), position(range.head))), selection.mainIndex);
}

export function insertSingleLineMultiBreak(view) {
  if (view.state.selection.ranges.length < 2 || view.state.readOnly || view.composing) return false;
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
function editableTableGridTarget(inner) {
  if(inner.destroyed||inner.state.readOnly||inner.state.selection.ranges.length!==1||inner.composing)return null;
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
  const range = controller.ranges()[index];
  return ['code', 'comment'].includes(controller.widget.item.kind) || range.role === 'summary' ? 'plain' : 'rich';
}
export function normalizeEditableInsertion(inner, text) {
  const controller = controllers.get(inner.dom.closest('.cm-live-editable-block'));
  if (!controller?.valid()) return text;
  const range = controller.ranges()[controller.editors.indexOf(inner)];
  if (controller.widget.item.kind === 'table') return safeCellInsertion(text);
  if (range?.role === 'summary') return text.replace(/\r\n?|\n/g, ' ').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
  const owner = resolveEditableOwner(inner, {from:0,to:inner.state.doc.length}, true);
  return owner?.projectionPrefix ? text.replaceAll('\n','\n'+owner.projectionPrefix) : text;
}
export function extendPointerSelection(event, inner) {
  if (!event.shiftKey || event.button !== 0 || inner.composing) return false;
  const owner = resolveEditableOwner(inner, { from: 0, to: inner.state.doc.length });
  if (!owner || owner.view === inner || owner.view.composing || owner.view.state.selection.ranges.length !== 1) return false;
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
      const inner=controller.editors[index];if(inner.destroyed)return;
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
      if (inner.destroyed || (inner.hasFocus && !view.state.field(crossSelectionField, false))) return;
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
      if (inner.destroyed) return;
      const next = ['code','comment'].includes(controller.widget.item.kind)
        ? Decoration.none : projectSpellingDecorations(marks,range);
      if (!RangeSet.eq([inner.state.field(spellingDecorations)],[next])) inner.dispatch({effects:setSpellingDecorations.of(next)});
      syncEditableSpelling(inner);
    }); } finally { controller.syncing = false; }
  }
}
export function extendEditableSelection(view, direction, vertical = false) {
  const selection = view.state.selection.main;
  if (view.composing || selection.empty || view.state.selection.ranges.length !== 1) return false;
  for (const root of view.dom.querySelectorAll('.cm-live-editable-block')) {
    const controller = controllers.get(root);
    if (controller?.view !== view || !controller.valid()) continue;
    const ranges = controller.ranges(), index = ranges.findIndex(range => selection.head >= range.from && selection.head <= range.to);
    if (index < 0) continue;
    const range = ranges[index], inner = controller.editors[index];
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
    try { for (const inner of controller.editors) if (!inner.destroyed) inner.dispatch({ effects }); }
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
    const index = controller.ranges().findIndex(range => selection.from >= range.from && selection.to <= range.to);
    if (index < 0) continue;
    const inner = controller.editors[index], range = controller.ranges()[index];
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

function applyTablePresentation(root, item) {
  if (item.kind !== 'table') return;
  const table = root.querySelector('table');
  if (!table) return;
  table.querySelector(':scope > colgroup')?.remove();
  table.style.width = '';
  if (item.widths) {
    const cols = document.createElement('colgroup');
    for (const width of item.widths) { const col=document.createElement('col');col.style.width=`${width}px`;cols.append(col); }
    table.prepend(cols);table.style.width=`${item.widths.reduce((sum,width)=>sum+width,0)}px`;
  }
  // Changing only the delimiter row must refresh alignment without remounting
  // the focused cell editor. The source renderer supplies only sanitized HTML.
  if (item.alignments) for (const row of table.rows) [...row.cells].forEach((cell,index)=>cell.setAttribute('align',item.alignments[index] || 'left'));
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
    if (this.item.cells && controller.editors.length !== this.item.cells.length) return false;
    controller.widget = this;
    controller.sync(view);
    applyTablePresentation(root,this.item);
    const number=root.querySelector(':scope > .cm-live-footnote-number');
    if(number){number.textContent=String(this.item.number);number.title=`${this.labels[10]} ${this.item.number} [${this.item.label}]`;}
    return true;
  }
  destroy(root) { const controller = controllers.get(root); controller?.unregister.forEach(remove => remove()); controller?.editors.forEach(editor => {clearNativeCodeInputScroll(editor);editor.destroy();}); controllers.delete(root); }
  toDOM(view) {
    const root = document.createElement('div');
    root.className = `cm-live-widget cm-live-${this.item.kind} cm-live-editable-block`;
    root.contentEditable = 'false';
    for (const type of ['mousedown', 'mouseup', 'click', 'dblclick', 'paste', 'copy', 'cut', 'compositionstart', 'compositionupdate', 'compositionend']) root.addEventListener(type, event => event.stopPropagation());
    const controller = {
      widget: this, view, editors: [], unregister: [], syncing: false,
      ranges() {
        const item=this.widget.item;
        if(item.kind==='table')return item.cells.map((field,index)=>this.editors[index]?.hasFocus
          ? retainEditableCellPadding(view.state.doc,field,view.state.selection) : field);
        if(item.kind==='footnote-definition'&&this.editors[0]?.hasFocus)return [retainFootnoteCaretPadding(view.state.doc,item,view.state.selection)];
        return item.cells || [{ from: item.contentFrom, to: item.contentTo, projection:item.projection }];
      },
      // Equality may retain this controller across unrelated document edits.
      // Validate its exact current source range rather than a stale doc object.
      valid() { return !view.destroyed && !view.state.readOnly && root.isConnected && view.state.sliceDoc(this.widget.item.from, this.widget.item.to) === this.widget.item.raw; },
      sync() {
        this.syncing = true;
        try {
          this.ranges().forEach((range, i) => {
            const editor = this.editors[i], text = fieldText(view.state.doc.toString(),range);
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
              editor.dispatch({effects,annotations:editableProjectionSync.of(true)});
            }
          });
        } finally { this.syncing = false; }
      },
    };
    controllers.set(root, controller);
    const isTable = this.item.kind === 'table', isDetails = this.item.kind === 'details', isFootnote=this.item.kind==='footnote-definition';
    const isProse = isDetails || isFootnote || this.item.kind === 'html-content';
    if(isFootnote){const number=document.createElement('span');number.className='cm-live-footnote-number';number.textContent=String(this.item.number);number.title=`${this.labels[10]} ${this.item.number} [${this.item.label}]`;root.append(number);}
    const content = document.createElement('div'); content.className = 'cm-live-block-content'; root.append(content);
    const mounts = [];
    if (isTable) {
      // Use the safe renderer for alignment and table structure, not editable HTML.
      content.innerHTML = this.options.context.render?.(this.item.renderSource ?? this.item.raw, this.item) || '';
      // Only this table owns the source cells. A generated image row (or other
      // nested HTML table) belongs to its cell editor, not to this mapping.
      const table = content.querySelector('table');
      if (table) for (const row of table.rows) for (const cell of row.cells) mounts.push(cell);
      if (mounts.length !== this.item.cells.length) { content.textContent = this.item.raw; return root; }
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
    mounts.forEach((mount, index) => {
      mount.replaceChildren();
      const range = controller.ranges()[index];
      const isSummary = range.role === 'summary';
      const history = command => () => { if (controller.valid()) runEditableHistory(view, command); return true; };
      const move = step => () => {
        const next = controller.editors[index + step];
        if (!next) return leave(step > 0);
        const hiddenBody = next.dom.closest('.cm-live-details-body');
        if (hiddenBody?.hidden) { hiddenBody.hidden = false; const toggle = root.querySelector('.cm-live-details-header button'); toggle.textContent = controller.widget.labels[7]; toggle.setAttribute('aria-expanded', 'true'); view.requestMeasure(); }
        next.focus(); return true;
      };
      const navigateBoundary = (direction, vertical = false) => inner => {
        const selection = inner.state.selection.main;
        if (!controller.valid() || inner.composing || inner.state.selection.ranges.length !== 1 || !selection.empty) return false;
        // Let CodeMirror handle ordinary/wrapped text navigation. Intercept only
        // when it has no text left in the requested direction.
        if (selection.head !== (direction < 0 ? 0 : inner.state.doc.length)) return false;
        const target = editableBoundaryTarget({ length: view.state.doc.length, item: controller.widget.item,
          ranges: controller.ranges(), index, direction, vertical });
        if (!target) return false;
        if (target.index !== undefined) {
          const next = controller.editors[target.index];
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
        if (!controller.valid() || inner.composing || inner.state.selection.ranges.length !== 1
          || selection.head !== (direction < 0 ? 0 : inner.state.doc.length)) return false;
        const ranges = controller.ranges();
        const target = editableBoundaryTarget({ length: view.state.doc.length, item: controller.widget.item, ranges, index, direction, vertical });
        if (!target) return false;
        const head = target.index === undefined ? target.position : (direction > 0 ? ranges[target.index].from : ranges[target.index].to);
        view.dispatch({ selection: { anchor: fieldPosition(ranges[index],selection.anchor), head }, effects: crossSelection.of(true), scrollIntoView: true });
        view.focus(); return true;
      };
      const editor = new EditorView({ parent: mount,
        state: EditorState.create({ doc: fieldText(view.state.doc.toString(),range), extensions: [
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
            focus() { if (controller.valid()) view.dispatch({ selection: mapEditableSelection(editor.state.selection, offset => fieldPosition(controller.ranges()[index],offset)),
              ...(projectedSearchSelections.get(editor) ? {effects: editableSearchSelection.of(true)} : {}), annotations: isolateHistory.of('before') }); return false; },
          }),
        ] }),
        dispatchTransactions(transactions, inner) {
          const before = inner.state;
          const wasFocused = inner.hasFocus;
          if (!controller.syncing && controller.widget.item.kind === 'code') trackCodeInputScroll(inner, transactions);
          inner.update(transactions);
          if (controller.syncing || !controller.valid()) return;
          const range = controller.ranges()[index], selection = inner.state.selection;
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
            const cellBoundary = emptyTableCellBoundary(view.state.doc.toString(), controller.widget.item, range, inner.state.doc.toString());
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
      controller.editors.push(editor);
      controller.unregister.push(registerEditableOwner(editor, view, () => controller.ranges()[index], () => controller.valid()));
    });
    const actions = document.createElement('div'); actions.className = 'cm-live-block-actions';
    const action = (label, callback) => { const button = document.createElement('button'); button.type = 'button'; button.textContent = label; button.onmousedown = event => event.preventDefault(); button.onclick = event => { event.stopPropagation(); if (controller.valid()) callback(event); }; actions.append(button); };
    if (isTable && this.options.context.editTable) action(this.labels[1], () => controller.widget.options.context.editTable(controller.widget.item, view));
    action(this.labels[0], event => {
      const position = Math.max(controller.widget.item.from, Math.min(view.state.selection.main.head, controller.widget.item.to));
      const open=()=>{controller.widget.options.source(view, position);view.focus();};
      if(event.detail>0)preserveSourceBlockPosition(view,controller.widget.item.from,root.getBoundingClientRect().top,open);
      else {open();revealSourceReturnCaret(view);}
    });
    root.append(actions);
    applyTablePresentation(root,this.item);
    return root;
  }
}
