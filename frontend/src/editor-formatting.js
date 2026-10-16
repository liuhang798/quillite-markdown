import { markdownParser } from './markdown-parser.js';
import { EditorSelection } from '@codemirror/state';
import { TEXT_COLOR_VALUES, scanTextColorSpans } from './text-colors.js';

const indentWidth = text => [...text].reduce((column, char) => char === '\t' ? column + 4 - column % 4 : column + 1, 0);
const lineIndent = text => {
  const quote = text.match(/^(?:[ \t]*>[ \t]?)+/)?.[0] || '';
  const indent = text.slice(quote.length).match(/^[ \t]*/)[0];
  return { quote, indent, width: indentWidth(indent) };
};

// Keep formatting inside parser-confirmed containers. Text that merely looks
// like a prefix inside a code block or table must not become document syntax.
function formattingContext(state) {
  const doc = state.doc, source = doc.toString(), tree = markdownParser.parse(source);
  const prefixes = new Map(), blocked = [], headings = new Map(), tasks = new Map(), setext = new Map();
  const cursor = tree.cursor();
  do {
    const node = cursor.node, line = doc.lineAt(node.from);
    if (['FencedCode', 'CodeBlock', 'HTMLBlock', 'Table'].includes(node.name)) blocked.push(node);
    if (['QuoteMark', 'ListMark', 'TaskMarker'].includes(node.name)) {
      const end = node.to + (source.slice(node.to, line.to).match(/^[ \t]*/)?.[0].length || 0);
      prefixes.set(line.number, Math.max(prefixes.get(line.number) || line.from, end));
      if (node.name === 'TaskMarker') tasks.set(line.number, { from: node.from, to: end });
    }
    if (/^ATXHeading[1-6]$/.test(node.name)) headings.set(line.number, node);
    if (/^SetextHeading[12]$/.test(node.name)) {
      for (let number = line.number; number <= doc.lineAt(node.to).number; number++) setext.set(number, node);
    }
  } while (cursor.next());
  return { source, tree, headings, tasks, setext,
    protected: line => blocked.some(node => line.from < node.to && line.to >= node.from),
    prefixEnd: line => prefixes.get(line.number) ?? line.from + line.text.match(/^[ \t]*/)[0].length,
    quoted: line => {
      for (let node = tree.resolveInner(Math.min(line.to, line.from + line.text.length), -1); node; node = node.parent)
        if (node.name === 'Blockquote') return true;
      return false;
    }
  };
}

function convertSetext(state, context, node, headingPrefix) {
  const doc = state.doc, marker = node.getChild('HeaderMark');
  const first = doc.lineAt(node.from), underline = doc.lineAt(marker.from), lastText = doc.line(underline.number - 1);
  if (!headingPrefix) return { edits: [{ from: marker.from, to: marker.to, insert: '' }], first, lastText };
  const hardBreaks = [], parts = [], segments = [], cursor = node.cursor();
  let offset = 0;
  do { if (cursor.name === 'HardBreak') hardBreaks.push(cursor.node); } while (cursor.next());
  for (let number = first.number; number < underline.number; number++) {
    const line = doc.line(number), from = number === first.number ? node.from : context.prefixEnd(line);
    const hardBreak = hardBreaks.find(part => part.from >= from && part.from <= line.to && part.to > line.to);
    const text = context.source.slice(from, hardBreak?.from ?? line.to).trimEnd();
    segments.push({ from, to: line.to, offset, length: text.length });
    parts.push(text); offset += text.length;
    if (number < underline.number - 1) { const separator = hardBreak ? '<br>' : ' '; parts.push(separator); offset += separator.length; }
  }
  // Literal trailing hashes in Setext text must not turn into ATX closers.
  const rawTitle = parts.join(''), trailingHashes = rawTitle.match(/[ \t](#+)$/);
  const escapeFrom = trailingHashes ? rawTitle.length - trailingHashes[1].length : rawTitle.length;
  const title = headingPrefix + rawTitle.replace(/([ \t])(#+)$/, (_, space, hashes) => space + hashes.replaceAll('#', '\\#'));
  const container = context.source.slice(underline.from, marker.from);
  const positionInTitle = position => {
    const segment = segments.find(part => position <= part.to) || segments.at(-1);
    const rawOffset = segment.offset + Math.max(0, Math.min(segment.length, position - segment.from));
    return headingPrefix.length + rawOffset + Math.max(0, rawOffset - escapeFrom);
  };
  return { edits: [{ from: node.from, to: node.to, insert: title + '\n' + container }], first, lastText, titleLength: title.length, positionInTitle };
}

export function normalizeSetextCaret(state, position) {
  const context = formattingContext(state), node = context.setext.get(state.doc.lineAt(position).number);
  if (!node || position >= node.getChild('HeaderMark').from) return null;
  const block = convertSetext(state, context, node, '#'.repeat(Number(node.name.at(-1))) + ' ');
  const changes = state.changes(block.edits);
  const mapPosition = (value, assoc = 1) => value >= node.from && value <= block.lastText.to
    ? node.from + block.positionInTitle(value) : changes.mapPos(value,assoc);
  return { changes, selection: EditorSelection.cursor(mapPosition(position)), mapPosition };
}

export function selectedBlockFormat(state, position) {
  const context = formattingContext(state), line = state.doc.lineAt(position);
  if (context.protected(line)) return null;
  let list = null, quote = false;
  for (let node = context.tree.resolveInner(Math.min(line.to, Math.max(position, context.prefixEnd(line))), 1); node; node = node.parent) {
    if (/^(?:ATX|Setext)Heading[1-6]$/.test(node.name)) return `heading${node.name.at(-1)}`;
    if (node.name === 'Task') return 'task-list';
    if (node.name === 'ListItem' && !list) list = node.parent.name === 'OrderedList' ? 'ordered-list' : 'unordered-list';
    if (node.name === 'Blockquote') quote = true;
  }
  return list || (quote ? 'quote' : null);
}

function listLineFormat(state, kind, first, last, selectedLines, caretLines) {
  const doc = state.doc, source = doc.toString(), marks = new Map(), blocked = [];
  const cursor = markdownParser.parse(source).cursor();
  do {
    if (['FencedCode', 'CodeBlock', 'HTMLBlock', 'Table'].includes(cursor.name)) blocked.push({ from: cursor.from, to: cursor.to });
    if (cursor.name === 'ListMark') {
      const node = cursor.node, item = node.parent, line = doc.lineAt(node.from);
      if (!marks.has(line.number)) marks.set(line.number, { from: node.from, to: node.to, end: item.to, list: item.parent.from });
    }
  } while (cursor.next());
  const changes = [], parents = [], counters = new Map();
  let plainCounter = 0;
  for (let number = first.number; number <= last.number; number++) {
    if (!selectedLines.has(number)) { plainCounter = 0; counters.clear(); continue; }
    const line = doc.line(number), mark = marks.get(number), layout = lineIndent(line.text);
    if (!line.text.trim() && !caretLines.has(number)) { plainCounter = 0; continue; }
    if (blocked.some(range => line.from < range.to && line.to > range.from)) continue;
    const from = mark?.from ?? line.from + layout.quote.length + layout.indent.length;
    const whitespace = mark ? source.slice(mark.to, line.to).match(/^[ \t]*/)[0] : '';
    const contentFrom = mark ? mark.to + whitespace.length : from;
    const task = mark ? source.slice(contentFrom, line.to).match(/^\[([ xX])\](?:[ \t]+|$)/) : null;
    let ordinal;
    if (mark) {
      const original = source.slice(mark.from, mark.to).match(/^(\d+)[.)]$/);
      ordinal = counters.has(mark.list) ? counters.get(mark.list) + 1 : Number(original?.[1] || 1);
      counters.set(mark.list, ordinal);
    } else ordinal = ++plainCounter;
    const marker = kind === 'ordered-list' ? `${ordinal}. ` : '- ';
    const checkbox = kind === 'task-list' ? `[${task?.[1] || ' '}] ` : '';
    changes.push({ from, to: contentFrom + (task?.[0].length || 0), insert: marker + checkbox });
    if (mark) {
      const oldWidth = indentWidth(source.slice(mark.from, contentFrom));
      parents.push({ line: number, end: mark.end, oldIndent: layout.width + oldWidth, delta: marker.length - oldWidth });
    }
  }
  // A wider list marker needs wider child/continuation indentation, including
  // descendants outside the text selection. Never change their actual content.
  const finalLine = parents.reduce((end, parent) => Math.max(end, doc.lineAt(parent.end).number), last.number);
  let pending = 0, active = [];
  for (let number = first.number + 1; number <= finalLine; number++) {
    const line = doc.line(number), layout = lineIndent(line.text);
    while (pending < parents.length && parents[pending].line < number) active.push(parents[pending++]);
    active = active.filter(parent => line.from < parent.end);
    if (!line.text.trim()) continue;
    const delta = active.reduce((sum, parent) => sum + (layout.width >= parent.oldIndent ? parent.delta : 0), 0);
    if (delta) changes.push({ from: line.from + layout.quote.length, to: line.from + layout.quote.length + layout.indent.length,
      insert: ' '.repeat(Math.max(0, layout.width + delta)) });
  }
  changes.sort((a, b) => a.from - b.from || a.to - b.to);
  return state.changes(changes);
}

export function selectedLineFormat(state, kind, headingPrefix = '', { ensureQuote = false } = {}) {
  const doc = state.doc, selectedLines = new Set(), caretLines = new Set();
  const ranges = state.selection.ranges.map(selection => {
    const first = doc.lineAt(selection.from), end = doc.lineAt(selection.to);
    // A range ending at the next line's start does not select that line.
    const last = !selection.empty && end.from === selection.to ? doc.lineAt(selection.to - 1) : end;
    for (let number = first.number; number <= last.number; number++) selectedLines.add(number);
    if (selection.empty) caretLines.add(first.number);
    return { first, last, backwards: selection.anchor > selection.head };
  });
  // Container commands operate on semantic headings, not individual physical
  // Setext lines. Normalize privately, then compose into the caller's single
  // transaction so neither the intermediate syntax nor history is exposed.
  if (['quote', 'unordered-list', 'ordered-list', 'task-list'].includes(kind)) {
    const context = formattingContext(state), blocks = new Map(), edits = [];
    for (const number of selectedLines) {
      const line = doc.line(number);
      if (context.protected(line) || (kind === 'quote' && ensureQuote && context.quoted(line))) continue;
      const node = context.setext.get(number);
      if (node && !blocks.has(node.from)) {
        const block = convertSetext(state, context, node, '#'.repeat(Number(node.name.at(-1))) + ' ');
        blocks.set(node.from, { ...block, node });
        edits.push(...block.edits);
      }
      // A GFM task's body cannot be an ATX heading. Retain the title text,
      // but remove only parser-confirmed marks when converting it to a task.
      const heading = kind === 'task-list' && context.headings.get(number);
      if (heading) {
        const opening = heading.firstChild, closing = heading.lastChild;
        const to = opening.to + (context.source.slice(opening.to, line.to).match(/^[ \t]*/)?.[0].length || 0);
        edits.push({ from: opening.from, to, insert: '' });
        if (closing.name === 'HeaderMark' && closing.from !== opening.from)
          edits.push({ from: closing.from - (context.source.slice(to, closing.from).match(/[ \t]+$/)?.[0].length || 0), to: closing.to, insert: '' });
      }
    }
    if (edits.length) {
      edits.sort((a,b) => a.from - b.from || a.to - b.to);
      const normalization = state.changes(edits);
      const selection = EditorSelection.create(ranges.map(({ first, last, backwards }) => {
        const startBlock = blocks.get(context.setext.get(first.number)?.from);
        const endBlock = blocks.get(context.setext.get(last.number)?.from);
        const from = normalization.mapPos(startBlock?.first.from ?? first.from, -1);
        const to = endBlock ? normalization.mapPos(endBlock.node.from, -1) + endBlock.titleLength : normalization.mapPos(last.to, 1);
        return backwards ? EditorSelection.range(to, from) : EditorSelection.range(from, to);
      }), state.selection.mainIndex);
      const normalized = state.update({ changes: normalization, selection }).state;
      const result = selectedLineFormat(normalized, kind, headingPrefix, { ensureQuote });
      return { changes: normalization.compose(result.changes), selection: result.selection };
    }
  }
  let changes;
  const converted = new Map(), setextLines = new Map();
  if (['unordered-list', 'ordered-list', 'task-list'].includes(kind)) {
    changes = listLineFormat(state, kind, ranges[0].first, ranges.at(-1).last, selectedLines, caretLines);
  } else {
    const edits = [], context = formattingContext(state);
    for (const number of selectedLines) {
      const line = doc.line(number);
      if (context.protected(line)) continue;
      if (kind === 'heading') {
        const setext = context.setext.get(number);
        if (setext) {
          setextLines.set(number, setext);
          if (!converted.has(setext.from)) {
            const result = convertSetext(state, context, setext, headingPrefix);
            converted.set(setext.from, result);
            edits.push(...result.edits);
          }
          continue;
        }
        const heading = context.headings.get(number), task = context.tasks.get(number);
        // GFM task text cannot itself be an ATX heading. Explicitly converting
        // a task to a heading keeps its list container, not a literal "##".
        const from = heading?.from ?? (headingPrefix && task ? task.from : context.prefixEnd(line));
        const opening = heading?.firstChild;
        const to = opening ? opening.to + (context.source.slice(opening.to, line.to).match(/^[ \t]*/)?.[0].length || 0)
          : headingPrefix && task ? task.to : from;
        edits.push({ from, to, insert: headingPrefix });
        const closing = heading?.lastChild;
        if (closing?.name === 'HeaderMark' && closing.from !== opening?.from)
          edits.push({ from: closing.from - (context.source.slice(to, closing.from).match(/[ \t]+$/)?.[0].length || 0), to: closing.to, insert: '' });
      } else if (kind === 'quote' && !(ensureQuote && context.quoted(line))) {
        // A quote cannot start after a task checkbox in GFM. Wrap the task
        // instead, retaining its checkbox rather than turning it into prose.
        edits.push({ from: context.tasks.has(number) ? line.from : context.prefixEnd(line), insert: '> ' });
      }
    }
    edits.sort((a,b) => a.from - b.from || a.to - b.to);
    changes = state.changes(edits);
  }
  return { changes, selection: EditorSelection.create(ranges.map(({first,last,backwards}) => {
    const firstNode = setextLines.get(first.number), lastNode = setextLines.get(last.number);
    const firstBlock = firstNode && converted.get(firstNode.from), lastBlock = lastNode && converted.get(lastNode.from);
    const start = changes.mapPos(firstBlock?.first.from ?? first.from, -1);
    const end = lastBlock?.titleLength !== undefined ? changes.mapPos(lastNode.from, -1) + lastBlock.titleLength
      : changes.mapPos(lastBlock?.lastText.to ?? last.to, 1);
    return backwards ? EditorSelection.range(end, start) : EditorSelection.range(start, end);
  }), state.selection.mainIndex) };
}

export const PAINTER_WRAPPERS = {
  bold: ['**', '**'], italic: ['*', '*'], strikethrough: ['~~', '~~'],
  highlight: ['==', '=='], 'inline-code': ['`', '`'],
  underline: ['<u>', '</u>'], superscript: ['<sup>', '</sup>'],
  subscript: ['<sub>', '</sub>'], keyboard: ['<kbd>', '</kbd>'],
};

const styleNames = {
  'cm-live-strong': 'bold', 'cm-live-em': 'italic', 'cm-live-strike': 'strikethrough',
  'cm-live-highlight': 'highlight', 'cm-live-inline-code': 'inline-code',
  'cm-live-u': 'underline', 'cm-live-sup': 'superscript', 'cm-live-sub': 'subscript',
  'cm-live-kbd': 'keyboard',
};

function visibleSelection(plan, from, to) {
  // Both visible-text selections and whole source wrappers represent the same
  // content. Ignore only parser-confirmed hidden syntax at selection edges.
  let changed = true;
  while (changed && from < to) {
    changed = false;
    for (const hide of plan.hides) {
      if (hide.from <= from && hide.to > from && hide.to <= to) { from = hide.to; changed = true; }
      if (hide.to >= to && hide.from < to && hide.from >= from) { to = hide.from; changed = true; }
    }
  }
  return { from, to };
}

export function selectedInlineFormats(plan, from, to) {
  ({ from, to } = visibleSelection(plan, from, to));
  if (from >= to) return [];
  return [...new Set(plan.marks.filter(mark => mark.from <= from && mark.to >= to)
    .map(mark => styleNames[mark.className]).filter(Boolean))];
}

export function selectedFormatColor(source, plan, from, to) {
  ({ from, to } = visibleSelection(plan, from, to));
  if (from >= to) return null;
  const colors = plan.marks.filter(mark => mark.className === 'cm-live-color' && mark.from <= from && mark.to >= to)
    .sort((a, b) => b.from - a.from);
  for (const mark of colors) {
    const match = source.slice(mark.from, mark.to).match(/^<span\s+data-md-color=(["'])([^"']+)\1>/i);
    if (match && TEXT_COLOR_VALUES.has(match[2])) return match[2];
  }
  return null;
}

export function paintColorEdit(source, from, to, color) {
  if (!TEXT_COLOR_VALUES.has(color) || color === 'default') return null;
  let text = source.slice(from, to);
  const full = text.match(/^<span\s+data-md-color=(["'])([^"']+)\1>([\s\S]*)<\/span>$/i);
  const wholeSpan = fragment => scanTextColorSpans(fragment).some(span => span.from === 0 && span.to === fragment.length);
  if (full && TEXT_COLOR_VALUES.has(full[2]) && wholeSpan(text)) text = full[3];
  else {
    const open = source.slice(Math.max(0, from - 80), from).match(/<span\s+data-md-color=(["'])([^"']+)\1>$/i);
    if (open && TEXT_COLOR_VALUES.has(open[2]) && source.slice(to, to + 7).toLowerCase() === '</span>'
        && wholeSpan(source.slice(from - open[0].length, to + 7))) {
      from -= open[0].length;
      to += 7;
    }
  }
  const open = `<span data-md-color="${color}">`, insert = open + text + '</span>';
  return { changes: { from, to, insert }, selection: { anchor: from + open.length, head: from + open.length + text.length } };
}
