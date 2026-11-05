import { marked } from 'marked';
import TurndownService from 'turndown';
import { gfm } from 'turndown-plugin-gfm';
import { decodeHTML } from 'entities';
import { formulaMarkdownMatches } from './math-rendering.js';

const RICH_HTML_PATTERN = /<(?:h[1-6]|p|div|br|strong|b|em|i|u|s|strike|del|a|ul|ol|li|blockquote|pre|code|table|img|span|math)\b/i;
const MAX_RICH_CLIPBOARD_HTML = 5 * 1024 * 1024;
const SAFE_LINK_PATTERN = /^(?:https?:|#)/i;
const SAFE_IMAGE_PATTERN = /^https?:\/\//i;

// HTML-to-Markdown escaping must not double TeX's backslashes or turn its
// underscores into Markdown escapes. Only explicit, balanced LaTeX delimiters
// are opaque; ordinary/escaped parentheses and code retain Turndown's rules.
function escapeWithLatex(source, escape) {
  const parts = [];
  let end = 0, cursor = 0;
  while (cursor < source.length) {
    if (source[cursor] !== '\\') { cursor++; continue; }
    if (source[cursor + 1] === '\\') { cursor += 2; continue; }
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
      parts.push(escape(source.slice(end, cursor)), source.slice(cursor, last + 2));
      end = cursor = last + 2;
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
  return formulaMarkdownMatches(markdown, expression, display) ? { markdown, display } : null;
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
      return formula.display ? `\n\n${formula.markdown}\n\n` : formula.markdown;
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
  return richTextConverter.turndown(source)
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
