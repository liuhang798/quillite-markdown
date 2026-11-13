import { marked } from 'marked';
import TurndownService from 'turndown';
import { gfm } from 'turndown-plugin-gfm';
import { decodeHTML } from 'entities';
import { formulaMarkdownMatches, isInlineDollarClose, isInlineDollarOpen, mathBlockExtension, renderLatexResult } from './math-rendering.js';
import { scanMarkdownFormulas } from './formula-editing.js';

const RICH_HTML_PATTERN = /<(?:h[1-6]|p|div|br|strong|b|em|i|u|s|strike|del|a|ul|ol|li|blockquote|pre|code|table|img|span|math)\b/i;
const MAX_RICH_CLIPBOARD_HTML = 5 * 1024 * 1024;
const MAX_CLIPBOARD_MATH_SOURCE = 32 * 1024;
const MAX_CLIPBOARD_FORMULAS = 64;
const MAX_CLIPBOARD_MATH_WORK = 8 * 1024;
const SAFE_LINK_PATTERN = /^(?:https?:|#)/i;
const SAFE_IMAGE_PATTERN = /^https?:\/\//i;

// HTML-to-Markdown escaping must not double TeX's backslashes or turn its
// underscores into Markdown escapes. Code nodes do not pass through this hook.
function escapeWithLatex(source, escape) {
  if (!/[$\\]/.test(source)) return escape(source);
  const parts = [];
  let end = 0, cursor = 0, dollarBoundary = 0;
  const preserve = last => {
    parts.push(escape(source.slice(end, cursor)), source.slice(cursor, last));
    end = cursor = last;
  };
  while (cursor < source.length) {
    if (source[cursor] === '$') {
      if (source[cursor + 1] === '$') {
        // Display math is a block, not a pair of inline dollars. This hook
        // sees individual HTML text nodes; each paragraph is converted alone.
        const block = cursor === 0 ? mathBlockExtension.tokenizer(source) : null;
        if (block && block.text.trim()) preserve(block.raw.length);
        else cursor += 2;
        continue;
      }
      if (isInlineDollarOpen(source, cursor)) {
        // An unescaped dollar or line end bounds a candidate. Don't jump over
        // a rejected delimiter (e.g. a second price) and consume later math.
        if (dollarBoundary <= cursor) {
          dollarBoundary = cursor + 1;
          for (; dollarBoundary < source.length; dollarBoundary++) {
            const character = source[dollarBoundary];
            if (character === '$' || character === '\r' || character === '\n') break;
            if (character === '\\' && /[\\$]/.test(source[dollarBoundary + 1] || '')) dollarBoundary++;
          }
        }
        if (dollarBoundary > cursor + 1 && isInlineDollarClose(source, dollarBoundary)) {
          preserve(dollarBoundary + 1);
          continue;
        }
      }
      cursor++;
      continue;
    }
    if (source[cursor] !== '\\') { cursor++; continue; }
    if (source[cursor + 1] === '\\') { cursor += 2; continue; }
    if (source[cursor + 1] === '$') {
      // Turndown doubles the literal slash but does not escape dollars. Keep
      // both characters visible without exposing a new formula opener.
      parts.push(escape(source.slice(end, cursor + 1)), '\\$');
      end = cursor += 2;
      continue;
    }
    const open = source[cursor + 1];
    if (open !== '(' && open !== '[') { cursor++; continue; }
    const close = open === '(' ? ')' : ']';
    let last = cursor + 2;
    for (; last < source.length; last++) {
      if (open === '(' && /[\r\n]/.test(source[last])) break;
      if (source[last] !== '\\') continue;
      if (source[last + 1] === '\\') { last++; continue; }
      if (source[last + 1] === close) break;
    }
    if (last < source.length && source[last] === '\\' && source[last + 1] === close) {
      preserve(last + 2);
    } else cursor = last;
  }
  parts.push(escape(source.slice(end)));
  return parts.join('');
}

function clipboardMath(node) {
  if (node.isCode) return null;
  const classes = node.getAttribute('class') || '';
  const ownFormula = /(?:^|\s)math-(?:inline|block)(?:\s|$)/.test(classes) && node.getAttribute('role') === 'math';
  if (!(ownFormula || /(?:^|\s)katex(?:-display)?(?:\s|$)/.test(classes) || node.nodeName.toLowerCase() === 'math')) return null;
  let expression;
  // Our sanitized document markup deliberately removes MathML annotation
  // elements. Its outer formula keeps a bounded, percent-encoded source.
  if (ownFormula && node.hasAttribute('data-math-source')) {
    const encoded = node.getAttribute('data-math-source');
    if (encoded.length > 32768 * 12) return null;
    try { expression = decodeURIComponent(encoded).trim(); } catch { return null; }
  } else {
    const annotations = node.querySelectorAll('annotation[encoding="application/x-tex"]');
    if (annotations.length !== 1) return null;
    expression = annotations[0].textContent.trim();
  }
  if (!expression || expression.length > 32768) return null;
  let display = node.getAttribute('display') === 'block' || /(?:^|\s)math-block(?:\s|$)/.test(classes);
  for (let parent = node; parent?.nodeType === 1; parent = parent.parentNode) {
    if (/(?:^|\s)katex-display(?:\s|$)/.test(parent.getAttribute('class') || '')) { display = true; break; }
  }
  const markdown = display ? `\\[\n${expression}\n\\]` : `\\(${expression}\\)`;
  // An untrusted annotation must describe exactly one formula, never break out
  // through a closing delimiter and introduce surrounding Markdown content.
  return formulaMarkdownMatches(markdown, expression, display) ? { markdown, expression, display } : null;
}

function clipboardFormulaRanges(source) {
  if (source.length >= MAX_CLIPBOARD_MATH_SOURCE) return [];
  const items = scanMarkdownFormulas(source, { maxSourceLength: MAX_CLIPBOARD_MATH_SOURCE, maxTokens: 8192 });
  return items.length <= MAX_CLIPBOARD_FORMULAS
    && items.reduce((total, item) => total + item.previewExpression.length, 0) <= MAX_CLIPBOARD_MATH_WORK ? items : [];
}

// Keep track of which delimiters are ours. Never strip nested delimiters
// found in literal clipboard text or change an existing Markdown document.
let clipboardMathFragments = null;

function restoreClipboardMath(markdown, { pattern, formulas }) {
  if (!formulas.size) return markdown;
  const merged = new Set();
  let remaining = MAX_CLIPBOARD_MATH_WORK;
  // Keep terminal control words separate from following text letters
  // (e.g. \sin followed by h must not become \sinh).
  const expand = (marker, offset, source) => {
    const expression = formulas.get(marker).expression;
    return /\\[a-z]+$/i.test(expression) && /[a-z]/i.test(source[offset + marker.length] || '')
      ? expression + ' ' : expression;
  };
  for (const item of clipboardFormulaRanges(markdown)) {
    if (!item.raw.startsWith('$')) continue;
    const markers = item.previewExpression.match(pattern);
    if (!markers) continue;
    const fragments = markers.map(marker => formulas.get(marker));
    // Standalone TeX validation cannot detect a new link, table, or emphasis
    // boundary formed by joining a fragment and surrounding Markdown.
    if (fragments.some(formula => !formula || /[\[\]|*`~]/.test(formula.expression))) continue;
    // Text between HTML nodes has already gone through Markdown escaping.
    // If it contains backslashes we cannot safely distinguish original TeX
    // from new escapes. Leave it intact and let the format fallback decide.
    const surroundingTex = item.previewExpression.replace(pattern, '');
    if (surroundingTex.includes('\\')) continue;
    // A dollar followed by a price and prose can look balanced to the
    // Markdown lexer. Don't turn that prose into math around a fragment.
    if (item.mode === 'inline' && /^\d/.test(surroundingTex) && /\b[a-z]{2,}\b/i.test(surroundingTex)) continue;
    const expression = item.previewExpression.replace(pattern, expand);
    if (expression.length > remaining) continue;
    remaining -= expression.length;
    const raw = item.raw.replace(pattern, expand);
    const display = item.mode !== 'inline';
    if (formulaMarkdownMatches(raw, expression, display) && renderLatexResult(expression, display).valid) {
      for (const marker of markers) merged.add(marker);
    }
  }
  return markdown.replace(pattern, (marker, offset, source) => {
    const formula = formulas.get(marker);
    if (!formula) return marker;
    return merged.has(marker) ? expand(marker, offset, source) : formula.markdown;
  });
}

function clipboardMathAudit(source) {
  const items = clipboardFormulaRanges(source);
  if (!items.length) return null;
  const surroundings = [];
  let cursor = 0;
  for (const item of items) {
    if (item.from < cursor) return null;
    surroundings.push(source.slice(cursor, item.from), item.mode);
    cursor = item.to;
  }
  surroundings.push(source.slice(cursor));
  const formulas = items.map(item => ({
    expression: item.previewExpression,
    valid: Boolean(item.previewExpression) && renderLatexResult(item.previewExpression, item.mode !== 'inline').valid
  }));
  return { surroundings: JSON.stringify(surroundings), formulas, valid: formulas.every(formula => formula.valid) };
}

export function selectClipboardMarkdown(converted, markdown, plain) {
  if (converted.length >= MAX_CLIPBOARD_MATH_SOURCE || !/\$|\\[(\[]/.test(converted)) return converted;
  const candidates = [...new Set([markdown, plain])].filter(source =>
    source && source !== converted && source.length < MAX_CLIPBOARD_MATH_SOURCE && /\$|\\[(\[]/.test(source));
  if (!candidates.length) return converted;
  // Ignore line-ending and outer blank-line differences, not indentation:
  // four leading spaces can turn a real formula into a literal code block.
  const normalize = source => source.replace(/\r\n?/g, '\n').replace(/^\n+|\n+$/g, '');
  const rich = clipboardMathAudit(normalize(converted));
  if (!rich || rich.valid) return converted;
  for (const source of candidates) {
    const normalized = normalize(source);
    const alternate = clipboardMathAudit(normalized);
    // Only replace the math, never introduce alternate links/images/HTML or
    // drop prose, code or structure discarded by neither representation.
    if (alternate?.valid && alternate.surroundings === rich.surroundings
      && rich.formulas.every((formula, i) => !formula.valid || formula.expression === alternate.formulas[i].expression)) return normalized;
  }
  return converted;
}

function officeListReplacement(content, node) {
  const style = node.getAttribute('style') || '';
  const className = node.getAttribute('class') || '';
  if (!/mso-list/i.test(style) && !/MsoListParagraph/i.test(className)) return null;
  const level = Math.max(1, Number(style.match(/level(\d+)/i)?.[1]) || 1);
  const indent = '  '.repeat(level - 1);
  const cleaned = content.replace(/^\s*(?:[·•◦▪§]|\d+[.)]|[a-z][.)])\s*/i, '').trim();
  const ordered = /^\s*(?:\d+[.)]|[a-z][.)])/i.test(content);
  return `\n${indent}${ordered ? '1.' : '-'} ${cleaned}\n`;
}

function styledTextReplacement(content, node) {
  const style = String(node.getAttribute('style') || '').toLowerCase();
  const tag = node.nodeName.toLowerCase();
  let result = content;
  const bold = /font-weight\s*:\s*(?:bold|[6-9]00)/.test(style);
  const italic = /font-style\s*:\s*italic/.test(style);
  const underline = tag === 'u' || /text-decoration(?:-line)?\s*:[^;]*underline/.test(style);
  if (bold && result.trim()) result = `**${result}**`;
  if (italic && result.trim()) result = `*${result}*`;
  if (underline && result.trim()) result = `<u>${result}</u>`;
  return result;
}

function createRichTextConverter() {
  const converter = new TurndownService({
    headingStyle: 'atx',
    bulletListMarker: '-',
    codeBlockStyle: 'fenced',
    fence: '```',
    emDelimiter: '*',
    strongDelimiter: '**',
    linkStyle: 'inlined'
  });
  const escape = converter.escape.bind(converter);
  converter.escape = text => escapeWithLatex(text, escape);
  converter.use(gfm);
  converter.remove(['script', 'style', 'noscript', 'iframe', 'object', 'embed', 'xml', 'meta', 'link']);
  converter.addRule('office-list-paragraph', {
    filter: node => node.nodeName === 'P' && (/mso-list/i.test(node.getAttribute('style') || '') || /MsoListParagraph/i.test(node.getAttribute('class') || '')),
    replacement: (content, node) => officeListReplacement(content, node) || `\n\n${content}\n\n`
  });
  converter.addRule('office-styled-text', {
    filter: node => (['SPAN', 'FONT', 'U'].includes(node.nodeName) && /(?:font-weight|font-style|text-decoration)/i.test(node.getAttribute('style') || '')) || node.nodeName === 'U',
    replacement: styledTextReplacement
  });
  converter.addRule('gfm-strikethrough', {
    filter: ['del', 's', 'strike'],
    replacement: content => content.trim() ? `~~${content}~~` : ''
  });
  converter.addRule('safe-links', {
    filter: 'a',
    replacement: (content, node) => {
      const href = String(node.getAttribute('href') || '').trim();
      if (!href || !SAFE_LINK_PATTERN.test(href)) return content;
      const label = content.trim() || href;
      const title = String(node.getAttribute('title') || '').trim();
      const target = /[\s()]/.test(href) ? `<${href.replaceAll('>', '%3E')}>` : href;
      return `[${label}](${target}${title ? ` "${title.replaceAll('"', '\\"')}"` : ''})`;
    }
  });
  converter.addRule('safe-images', {
    filter: 'img',
    replacement: (_content, node) => {
      const source = String(node.getAttribute('src') || '').trim();
      const alt = String(node.getAttribute('alt') || '').replace(/[\[\]]/g, '').trim();
      if (!SAFE_IMAGE_PATTERN.test(source)) return alt;
      const target = /[\s()]/.test(source) ? `<${source.replaceAll('>', '%3E')}>` : source;
      return `![${alt}](${target})`;
    }
  });
  converter.addRule('unrecognized-math-annotation', {
    filter: node => node.nodeName.toLowerCase() === 'annotation' && node.getAttribute('encoding') === 'application/x-tex',
    replacement: (_content, node) => escape(node.textContent)
  });
  const formulas = new WeakMap();
  converter.addRule('latex-formulas', {
    filter: node => {
      const formula = clipboardMath(node);
      if (formula) formulas.set(node, formula);
      return Boolean(formula);
    },
    replacement: (_content, node) => {
      const formula = formulas.get(node);
      if (formula.display) return `\n\n${formula.markdown}\n\n`;
      if (!clipboardMathFragments) return formula.markdown;
      const { prefix, formulas: fragments } = clipboardMathFragments;
      const marker = `${prefix}${fragments.size}q`;
      fragments.set(marker, formula);
      return marker;
    }
  });
  return converter;
}

const richTextConverter = createRichTextConverter();

export function hasRichClipboardHTML(html) {
  const source = String(html || '');
  return source.length <= MAX_RICH_CLIPBOARD_HTML && RICH_HTML_PATTERN.test(source);
}

export function htmlToMarkdown(html) {
  const source = String(html || '').trim();
  if (!source) return '';
  const previous = clipboardMathFragments;
  const prefix = `quilliteclipmath${Math.random().toString(36).slice(2)}x`;
  const fragments = source.length < MAX_CLIPBOARD_MATH_SOURCE && source.includes('$')
    ? { prefix, pattern: new RegExp(`${prefix}\\d+q`, 'g'), formulas: new Map() } : null;
  clipboardMathFragments = fragments;
  let converted;
  try { converted = richTextConverter.turndown(source); }
  finally { clipboardMathFragments = previous; }
  return (fragments ? restoreClipboardMath(converted, fragments) : converted)
    .replace(/\u00a0/g, ' ')
    .replace(/^(\s*)([-+*]|\d+[.)])\s{2,}/gm, '$1$2 ')
    // Turndown encodes an HTML <br> as two trailing spaces. Do not erase
    // that semantic line break while cleaning incidental trailing whitespace.
    .replace(/[ \t]+\n/g, whitespace => whitespace.startsWith('  ') ? '  \n' : '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

// Convert only parser-recognized HTML, never an entire concatenated result:
// literal code and escaped/encoded angle brackets must remain literal text.
// No DOM is created, so copying cannot execute markup or load its resources.
function htmlPlainText(source, context={hidden:''}) {
  source=String(source);
  const chunks=[];let cursor=0,hidden=context.hidden;
  const tags=/<!--[\s\S]*?(?:-->|$)|<\/?([a-z][\w:-]*)\b(?:[^"'<>]|"[^"]*"|'[^']*')*>/gi;
  for(const match of source.matchAll(tags)) {
    if(!hidden)chunks.push(source.slice(cursor,match.index));
    cursor=match.index+match[0].length;
    const tag=match[0],name=match[1]?.toLowerCase(),closing=tag.startsWith('</');
    if(!name)continue;
    if(hidden){if(closing&&name===hidden)hidden='';continue;}
    if(!closing&&/^(?:script|style|noscript)$/.test(name)){hidden=name;continue;}
    if(name==='img'&&!closing) {
      // Consume whole attribute values so text such as title='alt="wrong"'
      // cannot masquerade as the image's actual alternative text.
      for(const attr of tag.matchAll(/([^\s=<>/'"]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+)))?/g)) {
        if(attr[1].toLowerCase()==='alt'){chunks.push(attr[2]??attr[3]??attr[4]??'');break;}
      }
    } else if(/^(?:br|p|div|h[1-6]|li|tr|blockquote|pre|section|article|details|summary|hr)$/.test(name))chunks.push('\n');
  }
  if(!hidden)chunks.push(source.slice(cursor));
  context.hidden=hidden;
  return decodeHTML(chunks.join(''));
}

function inlinePlainText(tokens = [], context={hidden:''}) {
  return tokens.map(token => {
    if (token.type === 'html') return htmlPlainText(token.text || token.raw || '',context);
    if (context.hidden) return '';
    if (token.type === 'br') return '\n';
    if (token.type === 'codespan' || token.type === 'escape') return token.text || '';
    if (token.type === 'image') return decodeHTML(token.text || '');
    if (Array.isArray(token.tokens)) return inlinePlainText(token.tokens,context);
    return decodeHTML(String(token.text ?? token.raw ?? ''));
  }).join('');
}

function blockPlainText(tokens = []) {
  return tokens.map(token => {
    if (token.type === 'space') return '';
    if (token.type === 'hr') return '---';
    if (token.type === 'code') return token.text || '';
    if (token.type === 'table') {
      const rows = [token.header, ...(token.rows || [])];
      return rows.map(row => row.map(cell => inlinePlainText(cell.tokens || [])).join('\t')).join('\n');
    }
    if (token.type === 'list') {
      return token.items.map((item, index) => {
        const marker = token.ordered ? `${(Number(token.start) || 1) + index}. ` : '- ';
        const checked = item.task ? `[${item.checked ? 'x' : ' '}] ` : '';
        return `${marker}${checked}${blockPlainText(item.tokens || []).trim()}`;
      }).join('\n');
    }
    if (token.type === 'blockquote') return blockPlainText(token.tokens || []);
    if (Array.isArray(token.tokens)) return inlinePlainText(token.tokens);
    if (token.type === 'html') return htmlPlainText(token.text || token.raw || '');
    return decodeHTML(String(token.text ?? token.raw ?? ''));
  }).filter(Boolean).join('\n');
}

export function markdownToPlainText(markdown) {
  return blockPlainText(marked.lexer(String(markdown || '')))
    .replace(/\u00a0/g, ' ')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}
