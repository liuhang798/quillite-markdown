import { Facet, StateEffect, StateField } from '@codemirror/state';
import { Decoration, EditorView, WidgetType } from '@codemirror/view';
import { TreeFragment } from '@lezer/common';
import { decodeHTMLAttribute } from 'entities';
import { transactionComposing } from './editor-composition.js';
import { maskFrontmatter } from './frontmatter.js';
import { markdownParser } from './markdown-parser.js';
import { createDocumentVideoCard, localVideoMarkdownExtensions, parseLocalVideoReference, parseNetworkVideoReference, releaseLocalVideos } from './local-video.js';

// Installed on the document editor only, never in child table/callout editors.
export const videoPreviewContext = Facet.define({ combine: values => values[0] || null });
const setVideoSource = StateEffect.define();
const containsVideo = /<video(?=[\s/>])/i;
const viewObservers = new WeakMap();

// Match only the simple syntax accepted by the ordinary Markdown renderer.
// The tokenizer never returns a match for child markup or appended prose. Only
// the decoded, validated source is used; authored HTML is never put in the DOM.
export function standaloneLiveVideoSource(raw) {
  if (raw.length > 4200 || !/^ {0,3}<video(?=[\s/>])/i.test(raw)) return '';
  const token = localVideoMarkdownExtensions[0].tokenizer(raw);
  if (!token || token.raw !== raw) return '';
  const attributes = token.opening.slice(6, -1).replace(/\/\s*$/, '');
  const nextAttribute = /\s*([^\s=<>"'/]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/y;
  let match, source;
  while ((match = nextAttribute.exec(attributes))) {
    if (match[1].toLowerCase() !== 'src') continue;
    if (source !== undefined) return ''; // ambiguous malformed element
    source = decodeHTMLAttribute(match[2] ?? match[3] ?? match[4] ?? '');
  }
  return parseNetworkVideoReference(source) || parseLocalVideoReference(source);
}

function collectVideoBlocks(source, tree) {
  const items = [];
  for (let node = tree.topNode.firstChild; node; node = node.nextSibling) {
    // Lezer treats a normal <video src ...> at the top level as a paragraph
    // containing HTMLTag tokens. It can also recognize a standalone HTML block.
    if (node.name !== 'Paragraph' && node.name !== 'HTMLBlock') continue;
    if (!containsVideo.test(source.slice(node.from, Math.min(node.to, node.from + 12)))) continue;
    const from = source.lastIndexOf('\n', node.from - 1) + 1;
    if (!/^ {0,3}$/.test(source.slice(from, node.from))) continue;
    const raw = source.slice(from, node.to);
    const reference = standaloneLiveVideoSource(raw);
    if (reference) items.push({ from, to: node.to, raw, reference });
  }
  return items;
}

export function liveVideoBlockRanges(source) {
  return containsVideo.test(source) ? collectVideoBlocks(source, markdownParser.parse(maskFrontmatter(source))) : [];
}

function updateVideoBlocks(doc, previous, changes) {
  const source = doc.toString();
  if (!containsVideo.test(source)) return { tree: null, masked: false, items: [] };
  const input = maskFrontmatter(source);
  const masked = input !== source;
  let fragments;
  if (!masked && previous?.tree && !previous.masked && changes) {
    const ranges = [];
    changes.iterChangedRanges((fromA, toA, fromB, toB) => ranges.push({fromA, toA, fromB, toB}));
    fragments = TreeFragment.applyChanges(TreeFragment.addTree(previous.tree), ranges);
  }
  const tree = markdownParser.parse(input, fragments);
  return { tree, masked, items: collectVideoBlocks(source, tree) };
}

function createsVideoMarker(transaction) {
  const doc = transaction.newDoc;
  let found = false;
  transaction.changes.iterChangedRanges((_from, _to, start, end) => {
    // Include chars beside removals or joins: deleting a single space from
    // "<vid eo>" can introduce a marker even with no inserted content.
    if (!found && containsVideo.test(doc.sliceString(Math.max(0, start - 8), Math.min(doc.length, end + 8)))) found = true;
  });
  return found;
}

function sameDocument(first, second) {
  return first?.documentPath === second?.documentPath && first?.session === second?.session;
}

function retainIdentities(items, value, changes) {
  const matched = new Map();
  if (value && changes) {
    const edits = [];
    changes.iterChangedRanges((from, to) => edits.push({from, to}));
    for (const item of value.items) {
      if (edits.some(edit => edit.from < item.to && edit.to > item.from)) continue;
      const from = changes.mapPos(item.from, 1), to = changes.mapPos(item.to, -1);
      matched.set(from, { ...item, from, to });
    }
  }
  return items.map(item => {
    const previous = matched.get(item.from);
    const identity = previous?.to === item.to && previous.raw === item.raw ? previous.identity : {};
    return { ...item, identity };
  });
}

class VideoPreviewWidget extends WidgetType {
  constructor(item, context, open) {
    super();
    this.item = item;
    this.context = context;
    this.open = open;
    this.label = context.t(open ? 'videoReturnRendered' : 'videoEditSource');
  }
  eq(other) {
    return this.item.identity === other.item.identity && this.open === other.open
      && sameDocument(this.context, other.context) && this.label === other.label;
  }
  get estimatedHeight() { return this.open ? 32 : 132; }
  ignoreEvent() { return true; }
  toDOM(view) {
    const doc = view.dom.ownerDocument;
    const root = doc.createElement('div');
    root.className = 'cm-live-video';
    root.contentEditable = 'false';
    let actions = root;
    if (this.open) root.classList.add('is-source-open');
    else {
      const card = createDocumentVideoCard(doc, this.item.reference, this.context);
      root.append(card);
      actions = card.querySelector('.qm-local-video__controls') || root;
      const Observer = doc.defaultView?.ResizeObserver;
      if (Observer) {
        const observer = new Observer(() => {
          if (root.isConnected && !view.destroyed) view.requestMeasure();
        });
        observer.observe(root);
        viewObservers.set(root, observer);
      }
    }
    const source = doc.createElement('button');
    source.type = 'button';
    source.className = 'cm-live-video__source';
    source.textContent = this.label;
    source.addEventListener('click', () => {
      if (view.destroyed || !root.isConnected) return;
      // The widget can retain its DOM across mapped positions. Resolve by
      // identity at action time, never by offsets captured in the old DOM.
      const current = view.state.field(videoPreviewField, false)?.items.find(item => item.identity === this.item.identity);
      if (!current) return;
      view.dispatch({
        effects: setVideoSource.of(this.open ? null : current.from),
        selection: {anchor: this.open ? current.to : current.from + Math.min(1, current.to - current.from)},
      });
      view.focus();
    });
    actions.append(source);
    return root;
  }
  destroy(root) {
    viewObservers.get(root)?.disconnect();
    viewObservers.delete(root);
    releaseLocalVideos(root);
  }
}

function decorate(items, context, open) {
  const decorations = [], atoms = [];
  for (const item of items) {
    const sourceOpen = item.from === open;
    const widget = new VideoPreviewWidget(item, context, sourceOpen);
    if (sourceOpen) decorations.push(Decoration.widget({widget, block: true, side: -1}).range(item.from));
    else {
      const replacement = Decoration.replace({widget, block: true, inclusive: false}).range(item.from, item.to);
      decorations.push(replacement);
      atoms.push(replacement);
    }
  }
  return { decorations: Decoration.set(decorations, true), atoms: Decoration.set(atoms, true) };
}

function initialValue(state, context) {
  const parsed = context?.enabled ? updateVideoBlocks(state.doc) : { tree: null, masked: false, items: [] };
  const items = retainIdentities(parsed.items);
  return { ...parsed, items, context, open: null, composing: false, reparseAfterComposition: false, ...decorate(items, context, null) };
}

const videoPreviewField = StateField.define({
  create(state) { return initialValue(state, state.facet(videoPreviewContext)); },
  update(value, transaction) {
    const context = transaction.state.facet(videoPreviewContext);
    if (!sameDocument(context, value.context) || context?.enabled !== value.context?.enabled) return initialValue(transaction.state, context);
    if (!context?.enabled) return value;
    const composing = transactionComposing(transaction, value.composing);
    const changedVideoPlan = transaction.docChanged && (!!value.tree || createsVideoMarker(transaction));
    let open = value.open === null ? null : transaction.changes.mapPos(value.open, -1);
    if (composing) {
      // Keep native IME DOM stable. Reparse and prove identity on commit; a
      // changed video block is disposed when its decorated range disappears.
      return { ...value, context, open, composing, reparseAfterComposition: value.reparseAfterComposition || changedVideoPlan, items: value.items.map(item => ({
        ...item, from: transaction.changes.mapPos(item.from, 1), to: transaction.changes.mapPos(item.to, -1),
      })), decorations: value.decorations.map(transaction.changes), atoms: value.atoms.map(transaction.changes) };
    }
    const parsed = changedVideoPlan || value.reparseAfterComposition
      ? updateVideoBlocks(transaction.newDoc, value.composing ? null : value, transaction.changes)
      : value;
    const items = parsed === value ? value.items : retainIdentities(parsed.items, value, transaction.changes);
    for (const effect of transaction.effects) if (effect.is(setVideoSource)) open = effect.value;
    if (transaction.isUserEvent('select.search')) {
      const { from, to } = transaction.newSelection.main;
      const found = items.find(item => from > item.from && to <= item.to);
      if (found) open = found.from;
    }
    if (open !== null) {
      const active = items.find(item => item.from === open);
      if (!active || transaction.selection && !transaction.newSelection.ranges.some(range => range.head >= active.from && range.head <= active.to)) open = null;
    }
    if (parsed === value && open === value.open && context === value.context && composing === value.composing) return value;
    return { tree: parsed.tree, masked: parsed.masked, items, context, open, composing, reparseAfterComposition: false, ...decorate(items, context, open) };
  },
  provide: field => [
    EditorView.decorations.from(field, value => value.decorations),
    EditorView.atomicRanges.of(view => view.state.field(field).atoms),
  ],
});

export const editorVideoPreview = videoPreviewField;
