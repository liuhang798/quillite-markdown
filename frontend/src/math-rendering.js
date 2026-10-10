import katex from 'katex';
import { Marked } from 'marked';
import 'katex/contrib/mhchem';

const blockDelimiters = [
  {
    start: '$$',
    multiline: /^ {0,3}\$\$[ \t]*\n([\s\S]*?)\n {0,3}\$\$[ \t]*(?:\n|$)/,
    singleline: /^ {0,3}\$\$(?!\$)([^\n]*?)(?<!\\)\$\$[ \t]*(?:\n|$)/,
  },
  {
    start: '\\[',
    multiline: /^ {0,3}\\\[[ \t]*\n([\s\S]*?)\n {0,3}\\\][ \t]*(?:\n|$)/,
    singleline: /^ {0,3}\\\[([^\n]*?)\\\][ \t]*(?:\n|$)/,
  },
];

function escapedAt(source, index) {
  let slashes = 0;
  for (let cursor = index - 1; cursor >= 0 && source[cursor] === '\\'; cursor--) slashes++;
  return slashes % 2 === 1;
}

function inlineDollarMatch(source) {
  if (!source.startsWith('$') || source.startsWith('$$') || /[\s\t]/.test(source[1] || '')) return undefined;
  for (let index = 1; index < source.length && source[index] !== '\n'; index++) {
    if (source[index] !== '$' || escapedAt(source, index)) continue;
    const previous = source[index - 1];
    const next = source[index + 1] || '';
    if (/\s/.test(previous) || previous === '\\' || /\d/.test(next)) continue;
    return { raw: source.slice(0, index + 1), text: source.slice(1, index) };
  }
  return undefined;
}

function inlineLatexDelimiterMatch(source) {
  if (!source.startsWith('\\(')) return undefined;
  for (let index = 2; index < source.length && source[index] !== '\n'; index++) {
    if (source[index] === '\\' && source[index + 1] === ')' && !escapedAt(source, index)) {
      return { raw: source.slice(0, index + 2), text: source.slice(2, index) };
    }
  }
  return undefined;
}

function firstUnescapedInlineDelimiter(source) {
  for (let index = 0; index < source.length; index++) {
    if (source[index] === '$' && !escapedAt(source, index) && source[index + 1] !== '$') return index;
    if (source[index] === '\\' && source[index + 1] === '(' && !escapedAt(source, index)) return index;
  }
  return -1;
}

function encodedMathSource(source) {
  return encodeURIComponent(String(source).trim());
}

let formulaCollection = null;
export function collectFormulaRendering(render) {
  const previous = formulaCollection;
  const collection = { namespace: `qmf-${Math.random().toString(36).slice(2)}-${Date.now().toString(36)}`, formulas: [] };
  formulaCollection = collection;
  try { return { html: render(), formulas: collection.formulas }; }
  finally { formulaCollection = previous; }
}

function formulaOrigin(source, displayMode) {
  if (!formulaCollection) return '';
  const id = `${formulaCollection.namespace}-${formulaCollection.formulas.length}`;
  formulaCollection.formulas.push({ id, expression: String(source).trim(), displayMode });
  return ` data-math-origin="${id}"`;
}

// Return a structured status: user text and MathML annotations may legitimately
// contain "katex-error", so HTML substring matching is never validation.
export function renderLatexResult(source, displayMode = false) {
  const expression = String(source).trim();
  let depth = 0, escaped = false;
  const escapedText = text => text.replace(/[&<>"']/g, value => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[value]));
  const error = message => ({ valid: false, message, html: `<span class="katex-error" title="${escapedText(message)}">${escapedText(expression)}</span>` });
  if (expression.length > 32768) return error('Formula exceeds the 32768-character rendering limit; source is preserved.');
  for (const char of expression) {
    if (!escaped && char === '{' && ++depth > 256) return error('Formula nesting exceeds the safe rendering limit; source is preserved.');
    if (!escaped && char === '}') depth--;
    escaped = !escaped && char === '\\';
  }
  try { return { valid: true, message: '', html: katex.renderToString(expression, {
    displayMode,
    throwOnError: true,
    strict: 'ignore',
    trust: false,
    output: 'htmlAndMathml',
    maxExpand: 1000,
    maxSize: 20,
  }) }; } catch (cause) { return error(String(cause?.message || 'Unable to render formula')); }
}

export function renderLatex(source, displayMode = false) {
  return renderLatexResult(source, displayMode).html;
}

export const mathBlockExtension = {
  name: 'mathBlock',
  level: 'block',
  start(source) {
    const indexes = [source.search(/^ {0,3}\$\$/m), source.search(/^ {0,3}\\\[/m)]
      .filter(index => index >= 0);
    return indexes.length ? Math.min(...indexes) : undefined;
  },
  tokenizer(source) {
    for (const delimiter of blockDelimiters) {
      const match = delimiter.multiline.exec(source) || delimiter.singleline.exec(source);
      if (!match) continue;
      return { type: 'mathBlock', raw: match[0], text: match[1] };
    }
    return undefined;
  },
  renderer(token) {
    return `<div class="math-block" role="math" data-math-source="${encodedMathSource(token.text)}"${formulaOrigin(token.text, true)}>${renderLatex(token.text, true)}</div>`;
  },
};

export const mathInlineExtension = {
  name: 'mathInline',
  level: 'inline',
  start(source) {
    const index = firstUnescapedInlineDelimiter(source);
    return index >= 0 ? index : undefined;
  },
  tokenizer(source) {
    const match = inlineDollarMatch(source) || inlineLatexDelimiterMatch(source);
    if (!match) return undefined;
    return { type: 'mathInline', raw: match.raw, text: match.text };
  },
  renderer(token) {
    return `<span class="math-inline" role="math" data-math-source="${encodedMathSource(token.text)}"${formulaOrigin(token.text, false)}>${renderLatex(token.text, false)}</span>`;
  },
};

export const mathExtensions = [mathBlockExtension, mathInlineExtension];

const formulaOutputLexer = new Marked({ gfm: true, breaks: false, extensions: mathExtensions });

// KaTeX accepts nested dollars in text, but Markdown can split the surrounding
// $...$ first. Validate the actual document grammar, not just the inner LaTeX.
export function formulaMarkdownMatches(markdown, expression, displayMode) {
  const normalize = value => String(value).replace(/\r\n?/g, '\n').trim();
  const source = normalize(markdown);
  if (!source || source.length > 65536) return false;
  try {
    const tokens = formulaOutputLexer.lexer(source).filter(token => token.type !== 'space');
    if (tokens.length !== 1 || tokens[0].raw.trim() !== source) return false;
    const block = tokens[0].type === 'mathBlock';
    const token = block ? tokens[0] : tokens[0].type === 'paragraph' && tokens[0].tokens?.length === 1 ? tokens[0].tokens[0] : null;
    return Boolean(token && token.type === (displayMode ? 'mathBlock' : 'mathInline')
      && block === Boolean(displayMode) && token.raw.trim() === source && normalize(token.text) === normalize(expression));
  } catch { return false; }
}
