import katex from 'katex';
import { Marked } from 'marked';
import 'katex/contrib/mhchem';
import { mathBlockSyntax, mathInlineSyntax } from './math-syntax.js';
export { isInlineDollarOpen, isInlineDollarClose } from './math-delimiters.js';

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
  ...mathBlockSyntax,
  renderer(token) {
    return `<div class="math-block" role="math" data-math-source="${encodedMathSource(token.text)}"${formulaOrigin(token.text, true)}>${renderLatex(token.text, true)}</div>`;
  },
};

export const mathInlineExtension = {
  ...mathInlineSyntax,
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
