// Map the tokens that actually render, not an independently guessed block list.
// Offsets stay local to each token; only line arrays are retained, including for
// large embedded images. Container prefixes may disappear in child token raws.
import { markdownSourceOptions } from './markdown-performance.js';
const mappedContainers = new WeakMap();
const cursorMaps = new WeakMap();
export function clearPreviewSourceMap(container) { mappedContainers.delete(container); }
function lineStarts(text) {
  const starts = [0];
  for (let i = 0; i < text.length; i++) if (text[i] === '\n') starts.push(i + 1);
  return starts;
}
function lineIndex(starts, offset) {
  let lo = 0, hi = starts.length;
  while (lo + 1 < hi) {
    const mid = (lo + hi) >> 1;
    if (starts[mid] <= offset) lo = mid; else hi = mid;
  }
  return lo;
}

export function createPreviewSourceMap(markdown, sourceLineMap = null, { inline = true, snapshot = '' } = {}) {
  const locations = new WeakMap(), contexts = new WeakMap(), cursorAnchors = new Map();
  const anchors = new Map(snapshot ? JSON.parse(snapshot) : []);
  const prefix = `qm-${globalThis.crypto.randomUUID()}-`;
  let serial = 0;
  const mark = (html, line, inline = false, cursor = null) => {
    if (!Number.isInteger(line) || !html) return html;
    // Keep image separators as text nodes: image-row normalisation deliberately
    // accepts only images plus whitespace, not arbitrary inline elements.
    if (inline && !html.trim()) return html;
    const id = prefix + serial++;
    if (!inline && !/^\s*<[a-z][\w-]*(?=[\s>])/i.test(html)) return html;
    anchors.set(id, line);
    if (cursor) cursorAnchors.set(id, cursor);
    return inline ? `<span data-qm-source="${id}">${html}</span>`
      : html.replace(/^(\s*<[a-z][\w-]*)(?=[\s>])/i, `$1 data-qm-source="${id}"`);
  };
  function locateChildren(tokens, parent) {
    let cursor = 0;
    for (const token of tokens || []) {
      const raw = token.raw ?? token.text;
      if (typeof raw !== 'string' || !raw.length) continue;
      const starts = lineStarts(raw), lines = [], columns = [];
      const addLocation = at => {
        const index = lineIndex(parent.starts, at);
        lines.push(parent.lines[index]);
        columns.push((parent.columns?.[index] || 0) + at - parent.starts[index]);
      };
      const exact = parent.text.indexOf(raw, cursor);
      let end = cursor;
      if (exact >= 0) {
        for (const start of starts) addLocation(exact + start);
        end = exact + raw.length;
      } else {
        // Quotes/list items remove their structural prefixes. Match successive
        // physical lines within this parent only; never search another block.
        let probe = cursor, valid = true;
        for (let i = 0; i < starts.length; i++) {
          const part = raw.slice(starts[i], i + 1 < starts.length ? starts[i + 1] - 1 : raw.length);
          const at = part ? parent.text.indexOf(part, probe) : probe;
          if (at < 0) { valid = false; break; }
          addLocation(at);
          probe = at + part.length;
          if (i + 1 < starts.length) {
            const newline = parent.text.indexOf('\n', probe);
            if (newline < 0) { valid = false; break; }
            probe = newline + 1;
          }
        }
        if (!valid) continue; // No guessed source locations on ambiguous syntax.
        end = probe;
      }
      cursor = end;
      locations.set(token, lines[0]);
      const context = {text: raw, starts, lines, columns};
      if (inline) contexts.set(token, context);
      locateChildren(token.tokens || token.items, context);
      if (token.type === 'table') {
        const cells = [...token.header];
        for (const row of token.rows) for (const cell of row) cells.push(cell);
        locateChildren(cells, context);
      }
    }
  }
  function cursorInfo(token) {
    const context = contexts.get(token);
    if (!context || !['text', 'code'].includes(token.type)) return null;
    if (token.type === 'text') return {lines: context.lines, columns: context.columns, code: false};
    // Fenced/indented code and nested containers strip syntax before rendering.
    // Match only within this token, retaining the physical source-line mapping.
    const lines = [], columns = [];
    let probe = /^[ \t]*([~\x60])\1{2,}/.test(context.text) ? context.text.indexOf('\n') + 1 : 0;
    for (const part of token.text.split('\n')) {
      const at = part ? context.text.indexOf(part, probe) : probe;
      if (at < 0) return null;
      const row = lineIndex(context.starts, at);
      lines.push(context.lines[row]);
      columns.push(context.columns[row] + at - context.starts[row]);
      const next = context.text.indexOf('\n', at + part.length);
      probe = next < 0 ? context.text.length : next + 1;
    }
    return {lines, columns, code: true};
  }
  return {
    parse(text, links = null) {
      // Marked normalises newlines itself; normalise before indexing as well.
      text = text.replace(/\r\n?/g, '\n');
      const options = markdownSourceOptions(markdown.defaults, text);
      const lexer = new markdown.Lexer(options);
      if (links) Object.assign(lexer.tokens.links, links);
      const tokens = lexer.lex(text), starts = lineStarts(text);
      locateChildren(tokens, {text, starts, lines: starts.map((_, i) => (sourceLineMap?.[i] ?? i) + 1)});
      const base = markdown.defaults.renderer || new markdown.Renderer();
      // marked.use renderer wrappers close over the original renderer object.
      // A prototype clone gets its own parser, but those wrappers still read
      // base.parser (undefined or stale). Scope decoration to the real object
      // for this synchronous parse, restoring every property even on failure.
      const renderer = base;
      const saved = new Map();
      const save = name => saved.set(name, Object.getOwnPropertyDescriptor(renderer, name));
      save('parser');
      save('options');
      try {
      for (const name of ['paragraph', 'heading', 'blockquote', 'list', 'listitem', 'table', 'code', 'hr', 'html', 'image', 'codespan', 'text']) {
        if (!inline && ['image', 'codespan', 'text'].includes(name)) continue;
        save(name);
        const original = base[name];
        renderer[name] = function(token) {
          return mark(original.call(this, token), locations.get(token), name === 'text' || name === 'codespan', inline ? cursorInfo(token) : null);
        };
      }
      const extensions = options.extensions && {...options.extensions, renderers: {...options.extensions.renderers}};
      if (extensions) for (const [name, original] of Object.entries(extensions.renderers)) {
        extensions.renderers[name] = function(token) {
          const html = original.call(this, token);
          return typeof html === 'string' ? mark(html, locations.get(token)) : html;
        };
      }
      return markdown.parser(tokens, {...options, renderer, extensions});
      } finally {
        for (const [name, descriptor] of saved) {
          if (descriptor) Object.defineProperty(renderer, name, descriptor);
          else delete renderer[name];
        }
      }
    },
    snapshot() { return JSON.stringify([...anchors]); },
    apply(container) {
      // Source HTML cannot supply navigation metadata. Only this render's
      // unguessable token IDs are accepted; never keep the temporary IDs.
      container.querySelectorAll('[data-line]').forEach(el => el.removeAttribute('data-line'));
      const entries = [];
      container.querySelectorAll('[data-qm-source]').forEach(el => {
        const id = el.getAttribute('data-qm-source');
        const line = anchors.get(id), cursor = cursorAnchors.get(id);
        el.removeAttribute('data-qm-source');
        if (line) {
          el.dataset.line = String(line); entries.push({el, line});
          if (cursor) cursorMaps.set(el, cursor);
        }
      });
      mappedContainers.set(container, entries.sort((a, b) => a.line - b.line));
    }
  };
}

function entryEnd(entries, line) {
  let low = 0, high = entries.length;
  while (low < high) {
    const middle = (low + high) >> 1;
    if (entries[middle].line <= line) low = middle + 1; else high = middle;
  }
  return low;
}

export function previewLineTarget(container, line) {
  const entries = mappedContainers.get(container) || [];
  for (let i = entryEnd(entries, line) - 1; i >= 0; i--) {
    if (container.contains(entries[i].el) && entries[i].el.getClientRects().length) return entries[i].el;
  }
  return null;
}

// Measure rendered glyphs rather than the top of an entire code/paragraph block.
// Metadata stays in WeakMaps, never trusted source HTML or persisted documents.
export function previewCursorRect(container, line, column = 0) {
  let target = previewLineTarget(container, line);
  if (!target) return null;
  const entries = mappedContainers.get(container) || [];
  // Several inline tokens can start on the same source line. Prefer the token
  // containing/preceding the column, not always the last token in the paragraph.
  let bestColumn = -1;
  for (let i = entryEnd(entries, line) - 1; i >= 0; i--) {
    const entry = entries[i];
    if (entry.line > line) continue;
    if (entry.line < line) break;
    const map = cursorMaps.get(entry.el), start = map?.columns[0];
    if (start <= column && start > bestColumn && container.contains(entry.el) && entry.el.getClientRects().length) {
      target = entry.el; bestColumn = start;
    }
  }
  const map = cursorMaps.get(target);
  const textElement = map?.code ? target.querySelector('pre code') || target.querySelector('code') : target;
  if (!map || !textElement) return target.getBoundingClientRect();
  const row = Math.max(0, Math.min(map.lines.length - 1, lineIndex(map.lines, line)));
  const text = textElement.textContent, starts = lineStarts(text);
  const start = starts[Math.min(row, starts.length - 1)];
  const end = row + 1 < starts.length ? starts[row + 1] - 1 : text.length;
  const offset = Math.min(end, start + Math.max(0, column - (map.columns[row] || 0)));
  const walker = textElement.ownerDocument.createTreeWalker(textElement, 4);
  let remaining = offset;
  for (let node; (node = walker.nextNode());) {
    if (remaining > node.length) { remaining -= node.length; continue; }
    const range = textElement.ownerDocument.createRange();
    range.setStart(node, remaining);
    range.setEnd(node, Math.min(node.length, remaining + 1));
    const rect = range.getBoundingClientRect();
    if (rect.height) return rect;
  }
  return target.getBoundingClientRect();
}

export function previewPointerTarget(container, event) {
  const direct = event.target?.closest?.('[data-line]');
  if (direct && container.contains(direct) && !direct.querySelector('[data-line]')) return direct;
  if (event.target?.closest?.('.footnotes')) return null;
  let target = null, distance = Infinity;
  for (const el of (direct || container).querySelectorAll('[data-line]')) {
    // Prefer mapped text leaves to an enclosing multi-line paragraph/list.
    if (el.querySelector('[data-line]')) continue;
    for (const rect of el.getClientRects()) {
      const dy = Math.max(rect.top - event.clientY, event.clientY - rect.bottom, 0);
      const dx = Math.max(rect.left - event.clientX, event.clientX - rect.right, 0);
      const score = dy * 10000 + dx;
      if (rect.width && rect.height && score < distance) { target = el; distance = score; }
    }
  }
  return target || direct;
}
