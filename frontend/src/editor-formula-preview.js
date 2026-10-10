import { Facet, Prec, StateEffect, StateField } from '@codemirror/state';
import { Decoration, EditorView, ViewPlugin, WidgetType, keymap } from '@codemirror/view';
import { isolateHistory } from '@codemirror/commands';
import { scanMarkdownFormulas } from './formula-editing.js';
import { editorImageItems } from './image-layout.js';
import { renderLatexResult } from './math-rendering.js';

export const formulaPreviewContext = Facet.define({ combine: values => values[0] || {} });
export const toggleFormulaSource = StateEffect.define();
export const setFormulaDisplay = StateEffect.define();
export const refreshFormulaPreviews = StateEffect.define();
export const formulaPreviewPhrases = {
  'Edit equation': '修改公式', 'Show equation source': '查看源码', 'Hide equation source': '收起源码',
  'Equation: Enter to edit; Delete to remove': '公式：回车修改，Delete 删除',
  'Equation could not be rendered; source is retained': '公式无法显示，已保留源码',
};
// Bound parsing/rendering work; large documents remain fully editable as source.
export const FORMULA_PREVIEW_DOCUMENT_LIMIT = 300_000;
export const FORMULA_PREVIEW_LIMIT = 256;
const COMPACT_IMAGE_PAYLOAD = 'A';
const renderedCache = new Map();
function formulaHTML(item) {
  const key = `${item.mode}\0${item.previewExpression}`;
  if (renderedCache.has(key)) return renderedCache.get(key);
  const { html, valid } = renderLatexResult(item.previewExpression, item.mode !== 'inline');
  const result = !valid || html.length > 256_000 ? null : html;
  // Large expansions still retain source; do not retain huge HTML across files.
  if (html.length > 8_000) return result;
  if (renderedCache.size >= FORMULA_PREVIEW_LIMIT) renderedCache.delete(renderedCache.keys().next().value);
  renderedCache.set(key, result);
  return result;
}
function compactEmbeddedImages(source) {
  const ranges = editorImageItems(source).filter(item => item.sourceKind === 'embedded').map(item => {
    const markup = source.slice(item.from, item.to), local = markup.indexOf(item.ref), comma = item.ref.indexOf(',');
    if (local < 0 || comma < 0 || item.ref.length - comma <= 2) return null;
    const from = item.from + local + comma + 1;
    return { from, to: from + item.ref.length - comma - 1 };
  }).filter(Boolean).sort((a, b) => a.from - b.from);
  if (!ranges.length) return null;
  const parts = [], mappings = [];
  let original = 0, compact = 0;
  for (const range of ranges) {
    if (range.from < original) continue;
    const prefix = source.slice(original, range.from);
    parts.push(prefix, COMPACT_IMAGE_PAYLOAD);
    compact += prefix.length;
    mappings.push({ ...range, compactFrom: compact, compactTo: compact + COMPACT_IMAGE_PAYLOAD.length });
    compact += COMPACT_IMAGE_PAYLOAD.length;
    original = range.to;
  }
  parts.push(source.slice(original));
  const text = parts.join('');
  const originalPosition = (position, end = false) => {
    let removed = 0;
    for (const range of mappings) {
      if (position < range.compactFrom) break;
      if (position <= range.compactTo) return end ? range.to : range.from;
      removed += (range.to - range.from) - (range.compactTo - range.compactFrom);
    }
    return position + removed;
  };
  return { text, originalPosition };
}
export function editorFormulaItems(doc) {
  const source = doc.toString();
  let scanSource = source, restorePosition = position => position;
  if (source.length >= FORMULA_PREVIEW_DOCUMENT_LIMIT) {
    const compacted = compactEmbeddedImages(source);
    if (!compacted || compacted.text.length >= FORMULA_PREVIEW_DOCUMENT_LIMIT) return [];
    scanSource = compacted.text; restorePosition = compacted.originalPosition;
  }
  return scanMarkdownFormulas(scanSource).slice(0, FORMULA_PREVIEW_LIMIT).map(item => {
    const from = restorePosition(item.from), to = restorePosition(item.to, true);
    return { ...item, from, to, raw: source.slice(from, to), html: formulaHTML(item), open: false };
  });
}
function sameRange(a, b) { return a.from === b.from && a.to === b.to; }
function currentItem(view, item, doc) {
  if (view.state.doc !== doc) return null;
  const field = view.state.field(editorFormulaField, false);
  if (!field?.enabled) return null;
  return field.items.find(candidate => sameRange(candidate, item) && candidate.raw === item.raw) || null;
}
export function editSelectedEquation(view) {
  const selection = view.state.selection.main, field = view.state.field(editorFormulaField, false);
  if (selection.empty || !field?.enabled || view.state.readOnly) return false;
  const item = field.items.find(item => !item.open && item.html && sameRange(item, selection));
  if (!item || !view.state.facet(formulaPreviewContext).edit) return false;
  view.state.facet(formulaPreviewContext).edit(item, view);
  return true;
}
export function deleteRenderedEquation(view, item, doc) {
  const current = currentItem(view, item, doc);
  if (!current || view.state.readOnly) return false;
  view.dispatch({ changes: { from: current.from, to: current.to, insert: '' },
    selection: { anchor: current.from }, annotations: isolateHistory.of('full'), userEvent: 'delete.formula' });
  view.focus(); return true;
}
class FormulaWidget extends WidgetType {
  constructor(item, state) {
    super(); this.item = item; this.doc = state.doc; this.context = state.facet(formulaPreviewContext);
    this.labels = Object.fromEntries(Object.keys(formulaPreviewPhrases).map(key => [key, state.phrase(key)]));
  }
  eq(other) { return this.doc === other.doc && sameRange(this.item, other.item) && this.item.open === other.item.open
    && this.item.html === other.item.html && this.context === other.context && this.labels['Edit equation'] === other.labels['Edit equation']; }
  ignoreEvent() { return true; }
  toDOM(view) {
    const item = this.item, block = item.mode !== 'inline';
    const root = document.createElement(block ? 'div' : 'span');
    root.className = `cm-formula-render ${block ? 'is-block' : 'is-inline'}${item.open || !item.html ? ' is-source-open' : ''}`;
    root.contentEditable = 'false'; root.tabIndex = 0; root.setAttribute('role', 'group');
    root.setAttribute('aria-label', this.labels['Equation: Enter to edit; Delete to remove']);
    root.title = this.labels['Equation: Enter to edit; Delete to remove'];
    const edit = () => {
      const current = currentItem(view, item, this.doc);
      if (current && !view.state.readOnly) this.context.edit?.(current, view);
    };
    const content = document.createElement('span'); content.className = 'cm-formula-content'; root.append(content);
    // No author-provided HTML is used. Use the same sanitizer as document preview.
    if (item.html && this.context.sanitize) content.innerHTML = this.context.sanitize(item.html);
    else if (!item.html) {
      content.textContent = this.labels['Equation could not be rendered; source is retained'];
      root.classList.add('is-error');
    }
    const tools = document.createElement('span'); tools.className = 'cm-formula-tools'; root.append(tools);
    for (const action of ['edit', 'source']) {
      const button = document.createElement('button'); button.type = 'button'; button.dataset.formulaAction = action;
      button.textContent = this.labels[action === 'edit' ? 'Edit equation' : item.open ? 'Hide equation source' : 'Show equation source'];
      button.disabled = view.state.readOnly || action === 'source' && !item.html;
      button.onmousedown = event => event.preventDefault();
      button.onclick = event => {
        event.stopPropagation();
        if (action === 'edit') edit();
        else {
          const current = currentItem(view, item, this.doc); if (!current) return;
          view.dispatch({ effects: toggleFormulaSource.of({ from: current.from, to: current.to }), selection: { anchor: current.to }, scrollIntoView: true });
          view.focus();
        }
      };
      tools.append(button);
    }
    root.onmousedown = event => {
      if (event.target.closest('button')) return;
      event.preventDefault();
      const current = currentItem(view, item, this.doc); if (!current) return;
      view.dispatch({ selection: { anchor: current.from, head: current.to } }); root.focus();
    };
    root.ondblclick = event => { if (!event.target.closest('button')) { event.preventDefault(); edit(); } };
    root.onkeydown = event => {
      if (event.target !== root || event.isComposing) return;
      if (event.key === 'Enter') { event.preventDefault(); edit(); }
      else if (event.key === 'Delete' || event.key === 'Backspace') {
        event.preventDefault(); deleteRenderedEquation(view, item, this.doc);
      } else if (event.key === 'Escape' || event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
        event.preventDefault(); const current = currentItem(view, item, this.doc); if (!current) return;
        view.dispatch({ selection: { anchor: event.key === 'ArrowLeft' ? current.from : current.to } }); view.focus();
      }
    };
    root.addEventListener('copy', event => {
      const current = currentItem(view, item, this.doc); if (!current || !event.clipboardData) return;
      event.preventDefault(); event.stopPropagation(); event.clipboardData.setData('text/plain', current.raw);
    });
    return root;
  }
}
function decorate(items, state, enabled, openRanges = []) {
  const decorations = [], atoms = [];
  if (enabled) for (const item of items) {
    item.open = !item.html || openRanges.some(range => sameRange(range, item))
      || state.selection.ranges.some(range => range.head > item.from && range.head < item.to || range.anchor > item.from && range.anchor < item.to);
    const widget = new FormulaWidget(item, state), block = item.mode !== 'inline';
    if (item.open) decorations.push(Decoration.widget({ widget, block, side: -1 }).range(item.from));
    else {
      const replacement = Decoration.replace({ widget, block, inclusive: false }).range(item.from, item.to);
      decorations.push(replacement); atoms.push(replacement);
    }
  }
  return { items, enabled, openRanges, decorations: Decoration.set(decorations, true), atoms: Decoration.set(atoms, true) };
}
export const editorFormulaField = StateField.define({
  create(state) {
    const enabled = state.facet(formulaPreviewContext).enabled !== false;
    return decorate(enabled ? editorFormulaItems(state.doc) : [], state, enabled);
  },
  update(value, transaction) {
    if (!transaction.docChanged && !transaction.selection && !transaction.effects.length && !transaction.reconfigured) return value;
    let { items, enabled, openRanges } = value;
    if (transaction.docChanged) {
      const touched = []; transaction.changes.iterChangedRanges((from, to) => touched.push({ from, to }));
      const map = range => ({ from: transaction.changes.mapPos(range.from, 1), to: transaction.changes.mapPos(range.to, -1) });
      openRanges = openRanges.map(map).filter(range => range.from <= range.to);
      items = items.filter(item => !touched.some(range => range.from < item.to && range.to > item.from
        || range.from === range.to && range.from > item.from && range.from < item.to)).map(item => ({ ...item, ...map(item) }));
      if (transaction.isUserEvent('undo') || transaction.isUserEvent('redo')) items = enabled ? editorFormulaItems(transaction.newDoc) : [];
    }
    for (const effect of transaction.effects) {
      if (effect.is(setFormulaDisplay)) { enabled = effect.value !== 'source'; items = enabled ? editorFormulaItems(transaction.newDoc) : []; }
      if (effect.is(refreshFormulaPreviews) && effect.value.doc === transaction.newDoc && enabled) items = effect.value.items;
      if (effect.is(toggleFormulaSource)) {
        const range = effect.value;
        openRanges = openRanges.some(item => sameRange(item, range)) ? openRanges.filter(item => !sameRange(item, range)) : [...openRanges, range];
      }
    }
    return decorate(items.map(item => ({ ...item })), transaction.state, enabled, openRanges);
  },
  provide: field => EditorView.decorations.from(field, value => value.decorations),
});
const scanner = ViewPlugin.fromClass(class {
  constructor(view) { this.view = view; this.timer = null; }
  update(update) {
    if (!update.docChanged) return;
    clearTimeout(this.timer);
    if (!update.state.field(editorFormulaField).enabled || update.transactions.some(transaction => transaction.isUserEvent('undo') || transaction.isUserEvent('redo'))) return;
    this.timer = setTimeout(() => {
      const doc = this.view.state.doc;
      this.view.dispatch({ effects: refreshFormulaPreviews.of({ doc, items: editorFormulaItems(doc) }) });
    }, 250);
  }
  destroy() { clearTimeout(this.timer); }
});
export const editorFormulaPreview = [editorFormulaField, scanner,
  EditorView.atomicRanges.of(view => view.state.field(editorFormulaField).atoms),
  Prec.highest(keymap.of([{ key: 'Enter', run: editSelectedEquation }]))];
