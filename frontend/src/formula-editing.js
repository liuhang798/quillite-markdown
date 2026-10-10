import { Marked } from 'marked';
import { mathExtensions } from './math-rendering.js';
import { sourceLines } from './source-lines.js';

// Share preview's lexer. Unmappable/transformed runs are never editable.
const lexer = new Marked({ gfm: true, breaks: false, extensions: mathExtensions });

// Manual formula lookup also supports source-only documents beyond the widget
// limit; retain the existing long-line behavior while bounding lexer allocation.
export const FORMULA_SCAN_DOCUMENT_LIMIT = 2 * 1024 * 1024;
const SCAN_DEPTH_LIMIT = 128;
const SCAN_TOKEN_LIMIT = 100_000;

function exceedsContainerBudget(source) {
  // Reject extreme container prefixes before marked recursively lexes them.
  // Conservatively retaining source is safer than guessing editable offsets.
  for (const line of sourceLines(source)) {
    let quotes = 0, indent = 0;
    for (const char of line) {
      if (char === '>') { if (++quotes > SCAN_DEPTH_LIMIT) return true; }
      else if (char === ' ' || char === '\t') { indent += char === '\t' ? 4 : 1; if (indent > SCAN_DEPTH_LIMIT * 4) return true; }
      else break;
    }
  }
  return false;
}

function originalView(source) {
  const segments = [], parts = [];
  let from = 0, local = 0;
  for (const line of sourceLines(source)) {
    const text = line.replace(/\r\n?/g, '\n');
    parts.push(text);
    if (text === line) segments.push({ start: local, end: local + text.length, from });
    else {
      let run = 0;
      for (let i = 0; i < line.length; i++) {
        if (line[i] !== '\r') continue;
        if (i > run) segments.push({ start: local, end: local + i - run, from: from + run });
        local += i - run;
        const length = line[i + 1] === '\n' ? 2 : 1;
        segments.push({ start: local, end: local + 1, from: from + i, width: length });
        local++;
        i += length - 1;
        run = i + 1;
      }
      if (run < line.length) segments.push({ start: local, end: local + line.length - run, from: from + run });
      local += line.length - run;
      from += line.length;
      continue;
    }
    local += text.length;
    from += line.length;
  }
  return { text: parts.join(''), segments };
}

function offset(view, position, end = false) {
  let lo = 0, hi = view.segments.length - 1;
  const target = end ? position - 1 : position;
  while (lo <= hi) {
    const middle = (lo + hi) >> 1, segment = view.segments[middle];
    if (target < segment.start) hi = middle - 1;
    else if (target >= segment.end) lo = middle + 1;
    else return segment.from + (end ? target - segment.start + (segment.width || 1) : target - segment.start);
  }
  return null;
}

function sliceView(view, from, to) {
  const segments = [];
  let lo = 0, hi = view.segments.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (view.segments[mid].end <= from) lo = mid + 1;
    else hi = mid;
  }
  for (let i = lo; i < view.segments.length; i++) {
    const segment = view.segments[i];
    if (segment.start >= to) break;
    const start = Math.max(from, segment.start), end = Math.min(to, segment.end);
    segments.push({ start: start - from, end: end - from, from: segment.from + start - segment.start, width: segment.width });
  }
  return { text: view.text.slice(from, to), segments };
}

function textView(view, text) {
  const direct = view.text.indexOf(text);
  if (direct >= 0) return sliceView(view, direct, direct + text.length);
  // marked removes quote/list prefixes. Retain exact UTF-16 source offsets,
  // including CRLF and emoji, without one allocation per source character.
  const lines = [...sourceLines(view.text)], segments = [];
  let parent = 0, local = 0, lineIndex = 0;
  for (const childLine of sourceLines(text)) {
    const child = childLine.replace(/\n$/, ''), line = lines[lineIndex++];
    if (line === undefined) return null;
    const body = line.replace(/\n$/, '');
    if (!body.endsWith(child) || (!child && !/^[\s>]*$/.test(body))) return null;
    const start = parent + body.length - child.length;
    const mapped = sliceView(view, start, start + childLine.length);
    if (mapped.text !== childLine) return null;
    for (const segment of mapped.segments) segments.push({ ...segment, start: segment.start + local, end: segment.end + local });
    local += childLine.length;
    parent += line.length;
  }
  return { text, segments };
}

function details(source, from, to, expression, displayMode) {
  let cleaned = expression.trim(), mode = displayMode ? 'block' : 'inline', equationNumber = '1';
  const numbered = cleaned.match(/\s*\\tag\{([^{}]*)\}\s*$/);
  if (numbered && displayMode) {
    mode = 'numbered';
    equationNumber = numbered[1].trim() || '1';
    cleaned = cleaned.slice(0, numbered.index).trim();
  }
  const chemistry = cleaned.match(/^\\ce\{([\s\S]*)\}$/);
  const lastLine = source.lastIndexOf('\n', to - 1) + 1;
  const prefixEnd = lastLine <= from ? from : source.indexOf(source.slice(from, from + 2) === '$$' ? '$$' : '\\]', lastLine);
  const prefix = prefixEnd >= lastLine ? source.slice(lastLine, prefixEnd) : '';
  return {
    from, to, raw: source.slice(from, to), source: chemistry ? chemistry[1].trim() : cleaned,
    expression: cleaned, previewExpression: expression.trim(),
    templateId: chemistry ? 'chem-custom' : 'custom', mode, equationNumber,
    continuationPrefix: /^[\s>]*$/.test(prefix) ? prefix : '',
  };
}

export function scanMarkdownFormulas(markdown = '') {
  const source = String(markdown);
  if (source.length >= FORMULA_SCAN_DOCUMENT_LIMIT || exceedsContainerBudget(source)) return [];
  if (!source.includes('$') && !source.includes('\\(') && !source.includes('\\[')) return [];
  const formulas = [], root = originalView(source);
  let tokenCount = 0;
  const visit = (tokens, view, depth = 0) => {
    if (!view) return;
    if (depth > SCAN_DEPTH_LIMIT) throw new Error('FORMULA_SCAN_DEPTH');
    let cursor = 0;
    for (const token of tokens || []) {
      if (++tokenCount > SCAN_TOKEN_LIMIT) throw new Error('FORMULA_SCAN_BUDGET');
      if (!token.raw) continue;
      const start = view.text.indexOf(token.raw, cursor);
      if (start < 0) return;
      cursor = start + token.raw.length;
      const own = sliceView(view, start, cursor);
      if (token.type === 'mathInline' || token.type === 'mathBlock') {
        const from = offset(own, 0), to = offset(own, token.raw.trimEnd().length, true);
        if (from !== null && to !== null) formulas.push(details(source, from, to, token.text, token.type === 'mathBlock'));
      } else if (token.type === 'list') visit(token.items, own, depth + 1);
      else if (token.type === 'table') {
        let cellCursor = 0;
        for (const row of [token.header, ...token.rows]) for (const cell of row) {
          const at = own.text.indexOf(cell.text, cellCursor);
          if (at < 0) continue;
          cellCursor = at + cell.text.length;
          visit(cell.tokens, sliceView(own, at, cellCursor), depth + 1);
        }
      } else if (token.tokens && !['code', 'codespan', 'html', 'image'].includes(token.type)) {
        visit(token.tokens, textView(own, token.text ?? token.raw), depth + 1);
      }
    }
  };
  try { visit(lexer.lexer(root.text), root); }
  catch { return []; } // Never return partial/unreliable edit ranges or block source editing.
  return formulas.sort((a, b) => a.from - b.from);
}

export function findFormulaAt(markdown, from, to = from, formulas = scanMarkdownFormulas(markdown)) {
  const start = Math.max(0, Number(from) || 0), end = Math.max(start, Number(to) || start);
  return formulas.find(formula => start === end ? start >= formula.from && start <= formula.to : start < formula.to && end > formula.from) || null;
}

export function formulaEditIsCurrent(context, { session, path, document }) {
  return Boolean(context && context.session === session && context.path === path && context.document === document);
}

export function matchPreviewFormulas(formulas, previews, allowOrdered = true) {
  const key = item => `${item.displayMode ?? (item.mode !== 'inline')}:${item.previewExpression ?? item.expression}`;
  if (allowOrdered && formulas.length === previews.length && formulas.every((item, i) => key(item) === key(previews[i]))) return formulas;
  const byKey = new Map();
  for (const item of formulas) {
    const id = key(item);
    byKey.set(id, byKey.has(id) ? null : item);
  }
  const counts = new Map();
  for (const item of previews) counts.set(key(item), (counts.get(key(item)) || 0) + 1);
  return previews.map(item => counts.get(key(item)) === 1 ? byKey.get(key(item)) || null : null);
}

export function formulaReplacement(markdown, range, value, initialValue = null) {
  if (value === initialValue) return range.raw;
  if (range.mode === 'inline' && /^(\$\$|\\\[)/.test(value.trim())) return formulaInsertion(markdown, range.from, range.to, value);
  const eol = range.raw.includes('\r\n') ? '\r\n' : '\n';
  return value.replace(/\r\n?/g, '\n').split('\n').join(eol + (range.continuationPrefix || ''));
}

export function formulaInsertion(source, from, to, value) {
  if (!/^(\$\$|\\\[)/.test(value.trim())) return value;
  const before = source.slice(source.lastIndexOf('\n', from - 1) + 1, from);
  const quote = before.match(/^(?: {0,3}>[ \t]?)+/)?.[0] || '';
  const remainder = before.slice(quote.length);
  const list = remainder.match(/^(\s*)(?:[-+*]|\d+[.)])[ \t]+/);
  const prefix = quote + (list ? ' '.repeat(list[0].length) : remainder.match(/^[ \t]*/)?.[0] || '');
  const eol = source.includes('\r\n') ? '\r\n' : '\n';
  const body = value.replace(/\r\n?/g, '\n').split('\n').join(eol + prefix);
  const left = before && before !== prefix ? eol + eol + prefix : '';
  const right = source[to] && source[to] !== '\n' && source[to] !== '\r' ? eol + eol + prefix : '';
  return left + body + right;
}
