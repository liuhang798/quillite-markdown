import { marked } from 'marked';
import TurndownService from 'turndown';
import { gfm } from 'turndown-plugin-gfm';

const RICH_HTML_PATTERN = /<(?:h[1-6]|p|div|br|strong|b|em|i|u|s|strike|del|a|ul|ol|li|blockquote|pre|code|table|img|span)\b/i;
const MAX_RICH_CLIPBOARD_HTML = 5 * 1024 * 1024;
const SAFE_LINK_PATTERN = /^(?:https?:|#)/i;
const SAFE_IMAGE_PATTERN = /^https?:\/\//i;

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
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function inlinePlainText(tokens = []) {
  return tokens.map(token => {
    if (token.type === 'br') return '\n';
    if (token.type === 'image') return token.text || '';
    if (Array.isArray(token.tokens)) return inlinePlainText(token.tokens);
    return String(token.text ?? token.raw ?? '');
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
    if (token.type === 'html') return String(token.text || token.raw || '').replace(/<[^>]+>/g, '');
    return String(token.text ?? token.raw ?? '');
  }).filter(Boolean).join('\n');
}

export function markdownToPlainText(markdown) {
  return blockPlainText(marked.lexer(String(markdown || '')))
    .replace(/\u00a0/g, ' ')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}
