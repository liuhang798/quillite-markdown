import { Lexer, Marked, Tokenizer } from 'marked';
import { Facet, Prec, StateEffect, StateField } from '@codemirror/state';
import { Decoration, EditorView, WidgetType, keymap } from '@codemirror/view';
import { isolateHistory } from '@codemirror/commands';
import { findEditableDiagramFenceAt } from './diagram-editing.js';
import { mathBlockExtension } from './math-rendering.js';

export const diagramPreviewContext = Facet.define({ combine: values => values[0] || {} });
export const toggleDiagramSource = StateEffect.define();
export const setDiagramDisplay = StateEffect.define();
export const refreshDiagramPreviews = StateEffect.define();
export const refreshDiagramTheme = StateEffect.define();
export const diagramRenderFailed = StateEffect.define();
export const DIAGRAM_PREVIEW_DOCUMENT_LIMIT = 300_000;
export const DIAGRAM_PREVIEW_LIMIT = 64;
export const DIAGRAM_SOURCE_LIMIT = 20_000;
export const diagramPreviewPhrases = {
  'Edit diagram': '编辑图表', 'Show diagram source': '查看源码', 'Hide diagram source': '收起源码',
  'Diagram: Enter to edit; Delete to remove': '图表：回车编辑，Delete 删除',
  'Diagram could not be rendered; source is retained': '图表无法显示，已保留源码，可编辑修复',
  'Diagram is too large to preview; source is retained': '图表超过预览限制，已保留源码',
  'Loading diagram': '正在显示图表…',
};
const grammar = new Marked({ gfm: true, extensions: [{ ...mathBlockExtension, start: undefined }] });
// Diagram identity only needs block grammar. Avoid inline-tokenizing every
// paragraph on each edit. Interrupt paragraphs at block-math starts locally,
// instead of searching the entire remaining document once per paragraph.
class DiagramTokenizer extends Tokenizer {
  paragraph(source) {
    const token = super.paragraph(source);
    if (!token || !token.raw.includes('$$') && !token.raw.includes('\\[')) return token;
    const start = token.raw.slice(1).search(/^ {0,3}(?:\$\$|\\\[)/m);
    if (start < 0) return token;
    const raw = token.raw.slice(0, start + 1);
    return { ...token, raw, text: raw.trimEnd(), tokens: [] };
  }
}
const blockTokens = source => new Lexer({ ...grammar.defaults, tokenizer: new DiagramTokenizer() }).blockTokens(source);
const mounts = new WeakMap();
const sameRange = (a, b) => a.from === b.from && a.to === b.to;

// Only parser-confirmed, complete top-level fences are replaced. HTML, examples,
// unfinished fences and ambiguous container mappings retain editable source.
export function editorDiagramItems(doc) {
  if (doc.length > DIAGRAM_PREVIEW_DOCUMENT_LIMIT) return [];
  const source = doc.toString(), crlf = [];
  for (let i = source.indexOf('\r\n'); i >= 0; i = source.indexOf('\r\n', i + 2)) crlf.push(i - crlf.length);
  const normalized = source.replace(/\r\n?/g, '\n');
  const originalPosition = position => {
    let lo = 0, hi = crlf.length;
    while (lo < hi) { const mid = (lo + hi) >> 1; if (crlf[mid] < position) lo = mid + 1; else hi = mid; }
    return position + lo;
  };
  try {
    const items = [];
    let offset = 0;
    for (const token of blockTokens(normalized)) {
      if (typeof token.raw !== 'string') return [];
      const start = normalized.indexOf(token.raw, offset);
      if (start < 0 || start > offset && blockTokens(normalized.slice(offset, start)).some(token => token.type !== 'space')) return [];
      offset = start;
      if (token.type === 'code' && /^(mermaid|echarts)$/i.test(token.lang || '') && items.length < DIAGRAM_PREVIEW_LIMIT) {
        const range = findEditableDiagramFenceAt(token.raw, 0);
        const text = range && token.text.split('\n').map(line => line.startsWith(range.indent) ? line.slice(range.indent.length) : line).join('\n');
        if (range && (range.source === token.text || range.source === text) && range.indent.length <= 3) {
          const from = originalPosition(offset + range.from), to = originalPosition(offset + range.to);
          const original = source.slice(from, to);
          items.push({ ...range, from, to, original, lineEnding: original.includes('\r\n') ? '\r\n' : '\n',
            oversized: range.source.length > DIAGRAM_SOURCE_LIMIT, failed: false });
        }
      }
      offset += token.raw.length;
    }
    return offset < normalized.length && blockTokens(normalized.slice(offset)).some(token => token.type !== 'space') ? [] : items;
  } catch { return []; }
}

function currentItem(view, item, doc) {
  if (view.state.doc !== doc) return null;
  const field = view.state.field(editorDiagramField, false);
  return field?.enabled ? field.items.find(candidate => sameRange(candidate, item) && candidate.original === item.original) : null;
}
export function editSelectedDiagram(view) {
  const selection = view.state.selection.main, field = view.state.field(editorDiagramField, false);
  if (selection.empty || !field?.enabled || view.state.readOnly) return false;
  const item = field.items.find(item => !item.open && sameRange(item, selection));
  const edit = view.state.facet(diagramPreviewContext).edit;
  if (!item || !edit) return false;
  edit(item, view); return true;
}
export function deleteRenderedDiagram(view, item, doc) {
  const current = currentItem(view, item, doc);
  if (!current || view.state.readOnly) return false;
  view.dispatch({ changes: { from: current.from, to: current.to, insert: '' }, selection: { anchor: current.from },
    annotations: isolateHistory.of('full'), userEvent: 'delete.diagram' });
  view.focus(); return true;
}

class DiagramWidget extends WidgetType {
  constructor(item, state, theme) {
    super(); this.item = item; this.doc = state.doc; this.theme = theme;
    this.context = state.facet(diagramPreviewContext);
    this.labels = Object.fromEntries(Object.keys(diagramPreviewPhrases).map(key => [key, state.phrase(key)]));
    this.label = this.context.label?.(item) || (item.engine === 'echarts' ? 'ECharts' : 'Mermaid');
  }
  eq(other) { return this.doc === other.doc && sameRange(this.item, other.item) && this.item.original === other.item.original
    && this.item.open === other.item.open && this.item.failed === other.item.failed && this.theme === other.theme && this.context === other.context
    && this.label === other.label && this.labels['Edit diagram'] === other.labels['Edit diagram']; }
  ignoreEvent() { return true; }
  updateDOM(dom, view) {
    const record = mounts.get(dom);
    if (!record || record.item.original !== this.item.original || record.item.open !== this.item.open
      || record.item.failed !== this.item.failed || record.theme !== this.theme || record.context !== this.context
      || record.label !== this.label || record.phrase !== this.labels['Edit diagram']) return false;
    // Keep the live drawing, but refresh the immutable document/range used by
    // its actions after edits elsewhere. Never keep a stale widget callback.
    record.item = this.item; record.doc = this.doc;
    dom.classList.toggle('is-selected', sameRange(view.state.selection.main, this.item) && !view.state.selection.main.empty);
    return true;
  }
  toDOM(view) {
    const root = document.createElement('div'), item = this.item;
    root.className = `cm-diagram-card${item.open ? ' is-source-open' : ''}`;
    root.classList.toggle('is-selected', sameRange(view.state.selection.main, item) && !view.state.selection.main.empty);
    root.contentEditable = 'false'; root.tabIndex = 0; root.setAttribute('role', 'group');
    root.setAttribute('aria-label', this.labels['Diagram: Enter to edit; Delete to remove']);
    const record = { item, doc: this.doc, context: this.context, theme: this.theme, label: this.label, phrase: this.labels['Edit diagram'], active: true, timer: null, observer: null };
    mounts.set(root, record);
    const current = () => record.active && currentItem(view, record.item, record.doc);
    const edit = () => { const found = current(); if (found && !view.state.readOnly) record.context.edit?.(found, view); };
    const tools = document.createElement('div'); tools.className = 'cm-diagram-tools'; root.append(tools);
    const title = document.createElement('span'); title.className = 'cm-diagram-label'; title.textContent = this.label; tools.append(title);
    for (const action of ['edit', 'source']) {
      const button = document.createElement('button'); button.type = 'button'; button.dataset.diagramAction = action;
      button.textContent = this.labels[action === 'edit' ? 'Edit diagram' : item.open ? 'Hide diagram source' : 'Show diagram source'];
      button.disabled = action === 'edit' && view.state.readOnly || action === 'source' && (item.failed || item.oversized);
      if (action === 'source') button.setAttribute('aria-pressed', String(item.open));
      button.onmousedown = event => event.preventDefault();
      button.onclick = event => {
        event.stopPropagation();
        if (action === 'edit') edit();
        else { const found = current(); if (!found) return;
          view.dispatch({ effects: toggleDiagramSource.of({ from: found.from, to: found.to }), selection: { anchor: found.to }, scrollIntoView: true }); view.focus(); }
      };
      tools.append(button);
    }
    const body = document.createElement('div'); body.className = 'cm-diagram-body'; root.append(body);
    if (item.failed || item.oversized) {
      body.textContent = this.labels[item.oversized ? 'Diagram is too large to preview; source is retained' : 'Diagram could not be rendered; source is retained'];
      root.classList.add('is-error'); body.setAttribute('role', 'status');
    } else if (!item.open) {
      body.textContent = this.labels['Loading diagram'];
      const render = async () => {
        if (!record.active || !root.isConnected || !current()) return;
        record.observer?.disconnect(); record.observer = null;
        try {
          const valid = await record.context.render?.(body, record.item);
          if (!record.active || !root.isConnected) return;
          const found = current(); if (!found) return;
          if (!valid) view.dispatch({ effects: diagramRenderFailed.of({ doc: record.doc, item: found }) });
          view.requestMeasure();
        } catch {
          const found = current(); if (found && root.isConnected) view.dispatch({ effects: diagramRenderFailed.of({ doc: record.doc, item: found }) });
        }
      };
      // Run outside CodeMirror's DOM update. Only mounted, near-visible cards
      // render; no background drawing for hundreds of off-screen diagrams.
      record.timer = setTimeout(() => {
        if (!record.active || !root.isConnected) return;
        if (typeof IntersectionObserver === 'function') {
          record.observer = new IntersectionObserver(entries => { if (entries.some(entry => entry.isIntersecting)) render(); },
            { root: view.scrollDOM, rootMargin: '200px' }); record.observer.observe(root);
        } else render();
      }, 0);
    }
    root.onmousedown = event => {
      if (event.target.closest('button')) return;
      const found = current(); if (!found) return;
      event.preventDefault(); view.dispatch({ selection: { anchor: found.from, head: found.to } }); root.focus();
    };
    root.ondblclick = event => { if (!event.target.closest('button')) { event.preventDefault(); edit(); } };
    root.onkeydown = event => {
      if (event.target !== root || event.isComposing) return;
      if (event.key === 'Enter') { event.preventDefault(); edit(); }
      else if (!record.item.open && (event.key === 'Delete' || event.key === 'Backspace')) {
        event.preventDefault(); deleteRenderedDiagram(view, record.item, record.doc);
      } else if (['Escape', 'ArrowLeft', 'ArrowRight'].includes(event.key)) {
        const found = current(); if (!found) return;
        event.preventDefault(); view.dispatch({ selection: { anchor: event.key === 'ArrowLeft' ? found.from : found.to } }); view.focus();
      }
    };
    root.addEventListener('copy', event => {
      const found = current(); if (!found || !event.clipboardData) return;
      event.preventDefault(); event.stopPropagation(); event.clipboardData.setData('text/plain', found.original);
    });
    return root;
  }
  destroy(dom) {
    const record = mounts.get(dom); if (!record) return;
    record.active = false; clearTimeout(record.timer); record.observer?.disconnect(); record.context.release?.(dom);
    mounts.delete(dom);
  }
}

function decorate(items, state, enabled, openRanges = [], theme = 0) {
  const decorations = [], atoms = [];
  if (enabled) for (const item of items) {
    item.open = item.failed || item.oversized || openRanges.some(range => sameRange(range, item))
      || state.selection.ranges.some(range => range.head > item.from && range.head < item.to || range.anchor > item.from && range.anchor < item.to);
    const widget = new DiagramWidget(item, state, theme);
    if (item.open) decorations.push(Decoration.widget({ widget, block: true, side: -1 }).range(item.from));
    else { const replacement = Decoration.replace({ widget, block: true, inclusive: false }).range(item.from, item.to);
      decorations.push(replacement); atoms.push(replacement); }
  }
  return { items, enabled, openRanges, theme, decorations: Decoration.set(decorations, true), atoms: Decoration.set(atoms, true) };
}
export const editorDiagramField = StateField.define({
  create(state) { const enabled = state.facet(diagramPreviewContext).enabled !== false; return decorate(enabled ? editorDiagramItems(state.doc) : [], state, enabled); },
  update(value, transaction) {
    if (!transaction.docChanged && !transaction.selection && !transaction.effects.length && !transaction.reconfigured) return value;
    let { items, enabled, openRanges, theme } = value;
    if (transaction.docChanged) {
      const map = range => ({ from: transaction.changes.mapPos(range.from, 1), to: transaction.changes.mapPos(range.to, -1) });
      openRanges = openRanges.map(map).filter(range => range.from <= range.to);
      const previous = items.map(item => ({ ...item, ...map(item) }));
      // Reconfirm Markdown identity immediately: inserting an outer code/HTML
      // container can invalidate an untouched inner fence. Parsing is bounded;
      // updateDOM keeps unchanged live drawings without re-rendering them.
      items = enabled ? editorDiagramItems(transaction.newDoc).map(item => ({ ...item,
        failed: previous.some(old => sameRange(old, item) && old.original === item.original && old.failed) })) : [];
    }
    for (const effect of transaction.effects) {
      if (effect.is(setDiagramDisplay)) { enabled = effect.value !== 'source'; items = enabled ? editorDiagramItems(transaction.newDoc) : []; }
      if (effect.is(refreshDiagramTheme)) theme++;
      if (effect.is(refreshDiagramPreviews) && effect.value.doc === transaction.newDoc && enabled) {
        items = effect.value.items.map(item => ({ ...item, failed: items.some(old => sameRange(old, item) && old.original === item.original && old.failed) }));
      }
      if (effect.is(diagramRenderFailed) && effect.value.doc === transaction.newDoc) {
        items = items.map(item => sameRange(item, effect.value.item) && item.original === effect.value.item.original ? { ...item, failed: true } : item);
      }
      if (effect.is(toggleDiagramSource)) {
        const range = effect.value;
        openRanges = openRanges.some(item => sameRange(item, range)) ? openRanges.filter(item => !sameRange(item, range)) : [...openRanges, range];
      }
    }
    return decorate(items.map(item => ({ ...item })), transaction.state, enabled, openRanges, theme);
  },
  provide: field => EditorView.decorations.from(field, value => value.decorations),
});
export const editorDiagramPreview = [editorDiagramField,
  EditorView.atomicRanges.of(view => view.state.field(editorDiagramField).atoms),
  Prec.highest(keymap.of([{ key: 'Enter', run: editSelectedDiagram }]))];
