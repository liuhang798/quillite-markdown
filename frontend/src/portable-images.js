import { markdownParser } from './markdown-parser.js';
import { maskFrontmatter } from './frontmatter.js';
import { decodeHTML, decodeHTMLAttribute } from 'entities';
import { markdownReferenceDefinitions } from './reference-definitions.js';
import { prepareFootnotes } from './markdown-formats.js';
import { footnoteProjection } from './footnote-editing.js';
import { fieldPosition } from './projected-code.js';
import { scanMarkdownFormulas } from './formula-editing.js';

export const MAX_PORTABLE_BYTES = 64 * 1024 * 1024;
const bytes = text => new TextEncoder().encode(text).length;
const labelKey = text => text.replace(/^\[|\]$/g, '').replace(/\s+/g, ' ').trim().toLowerCase();
const decode = (text, stripAngles = true) => (stripAngles ? text.replace(/^<|>$/g, '') : text).replace(/\\([!"#$%&'()*+,\-./:;<=>?@[\\\]^_`{|}~])|&(?:#[xX][0-9a-fA-F]+|#\d+|[A-Za-z][A-Za-z0-9]+);/g, (match, escaped) => escaped ?? decodeHTML(match));
const local = ref => !/^(?:data:|https?:|\/\/|#)/i.test(ref);

function htmlImages(html, base, preview) {
  const result = [];
  let cursor = 0;
  while (cursor < html.length) {
    const start = html.indexOf('<', cursor); if (start < 0) break;
    if (html.startsWith('<!--', start)) { const end = html.indexOf('-->', start + 4); cursor = end < 0 ? html.length : end + 3; continue; }
    let i = start + 1;
    while (/[A-Za-z0-9]/.test(html[i] || '') && i < html.length) i++;
    const tag = html.slice(start + 1, i).toLowerCase();
    if (['script', 'style', 'pre', 'code'].includes(tag)) {
      const end = html.toLowerCase().indexOf(`</${tag}`, i); cursor = end < 0 ? html.length : end + tag.length + 2; continue;
    }
    const attributes = [];
    while (i < html.length && html[i] !== '>') {
      if (/\s|\//.test(html[i])) { i++; continue; }
      const nameStart = i;
      while (i < html.length && !/[\s=<>]/.test(html[i])) i++;
      if (i === nameStart) { i++; continue; }
      const name = html.slice(nameStart, i).toLowerCase();
      while (i < html.length && /\s/.test(html[i])) i++;
      if (html[i] !== '=') continue;
      i++; while (i < html.length && /\s/.test(html[i])) i++;
      const quote = html[i] === '"' || html[i] === "'" ? html[i++] : '';
      const from = i;
      while (i < html.length && (quote ? html[i] !== quote : !/[\s>]/.test(html[i]))) i++;
      const attribute = { name, from, to: i, ref: decodeHTMLAttribute(html.slice(from, i)), start: nameStart };
      if (quote && html[i] === quote) i++;
      attribute.end = i;
      attributes.push(attribute);
    }
    cursor = i + 1;
    if (['img', 'source'].includes(tag) && attributes.some(a => a.name === 'srcset' || (tag === 'source' && a.name === 'src'))) {
      // The editor uses the img's actual src, not author-supplied responsive
      // candidates. Preserve all markup when aligning; portable export still
      // refuses complex responsive sources rather than silently losing them.
      if (!preview) throw new Error('PORTABLE_UNSUPPORTED_IMAGE');
    }
    if (tag === 'img') {
      const src = attributes.find(a => a.name === 'src');
      if (src) result.push({ from: base + src.from, to: base + src.to, ref: src.ref, kind: 'html',
        ...(preview ? { previewFrom: base + start, previewTo: base + cursor, attributes: attributes.map(a => ({ ...a, start: base + a.start, end: base + a.end })), alt: attributes.find(a => a.name === 'alt')?.ref || '' } : {}) });
    }
  }
  return result;
}

// Lezer supplies exact source offsets and excludes code, escapes and comments.
// Replacements never search/replace identical-looking strings in code blocks.
export function markdownImageDefinitions(source, tree) {
  if (!source.includes(']:')) return new Map();
  return new Map([...markdownReferenceDefinitions(source,tree)].map(([label,{ref,title}])=>[label,{ref,title}]));
}

export function markdownImageRanges(source, { preview = false, definitions, excludedRanges = [] } = {}) {
  const tree = markdownParser.parse(maskFrontmatter(source)), result = [];
  definitions ??= markdownImageDefinitions(source, tree);
  tree.iterate({ enter(node) {
    if(excludedRanges.some(range=>node.from>=range.from&&node.to<=range.to))return false;
    if (node.name === 'Image') {
      let paragraph = node.node.parent;
      while (paragraph && paragraph.name !== 'Paragraph') paragraph = paragraph.parent;
      const context = preview && paragraph ? { paragraphFrom: paragraph.from, paragraphTo: paragraph.to } : {};
      const url = node.node.getChild('URL');
      if (url) {
        const closing = node.node.getChildren('LinkMark').find(mark => source.slice(mark.from, mark.to) === ']');
        const title = node.node.getChild('LinkTitle');
        result.push({ from: url.from, to: url.to, ref: decode(source.slice(url.from, url.to)), kind: 'url',
          ...(preview ? { ...context, previewFrom: node.from, previewTo: node.to, alt: decode(source.slice(node.from + 2, closing?.from ?? node.from + 2), false), title: title ? decode(source.slice(title.from + 1, title.to - 1), false) : '' } : {}) });
        return false;
      }
      const label = node.node.getChild('LinkLabel');
      let end = node.from + 2;
      for (let child = node.node.firstChild; child; child = child.nextSibling) { if (child.name === 'LinkMark' && source.slice(child.from, child.to) === ']') { end = child.from; break; } }
      const alt = source.slice(node.from + 2, end);
      const explicit = label ? labelKey(source.slice(label.from, label.to)) : '';
      const definition = definitions.get(explicit || labelKey(alt));
      if (definition) result.push({ from: node.from, to: node.to, ref: definition.ref, alt, title: definition.title,
        ...(preview ? { ...context, previewFrom: node.from, previewTo: node.to, alt: decode(alt, false), title: definition.title ? decode(definition.title.slice(1, -1), false) : '' } : {}), kind: 'reference' });
      return false;
    }
    if (!['HTMLTag', 'HTMLBlock'].includes(node.name)) return;
    const html = source.slice(node.from, node.to);
    // No executable/stylesheet content is interpreted or fetched.
    for (const image of htmlImages(html, node.from, preview)) result.push({ ...image, ...(preview ? (node.name === 'HTMLBlock' ? { blockFrom: node.from, blockTo: node.to } : (() => {
      let paragraph = node.node.parent;
      while (paragraph && paragraph.name !== 'Paragraph') paragraph = paragraph.parent;
      return paragraph ? { paragraphFrom: paragraph.from, paragraphTo: paragraph.to } : {};
    })()) : {}) });
    return false;
  } });
  return result.sort((a, b) => a.from - b.from);
}

// Export/save-as scan the whole document, unlike preview widgets which scan
// their own editable scope. Footnote continuations look like code to the root
// parser, so scan their projected bodies and map only image ranges back.
function documentImageRanges(source) {
  const notes=source.includes('[^')?prepareFootnotes(source).definitions:new Map();
  const definitions=markdownImageDefinitions(source);
  const result=markdownImageRanges(source,{definitions,excludedRanges:[...notes.values(),...scanMarkdownFormulas(source)]});
  for(const note of notes.values()) {
    const projection=footnoteProjection(source,note),range={from:note.bodyFrom,to:note.to,projection};
    for(const item of markdownImageRanges(projection.text,{definitions,excludedRanges:scanMarkdownFormulas(projection.text)})) {
      result.push({...item,from:fieldPosition(range,item.from),to:fieldPosition(range,item.to),continuationPrefix:projection.prefix});
    }
  }
  return result.sort((a,b)=>a.from-b.from);
}

function imageReplacement(item, ref) {
  if (item.kind === 'reference') return `![${item.alt}](<${ref}>${item.title ? ` ${item.title}` : ''})`.replaceAll('\n','\n'+(item.continuationPrefix||''));
  if (item.kind === 'html') return ref.replaceAll('&', '&amp;').replaceAll('"', '&quot;').replaceAll("'", '&#39;');
  return `<${ref}>`;
}

export async function transformMarkdownImages(source, resolve, { portable = false } = {}) {
  if (source.length > MAX_PORTABLE_BYTES || bytes(source) > MAX_PORTABLE_BYTES) throw new Error('PORTABLE_TOO_LARGE');
  const ranges = documentImageRanges(source), replacements = [], cache = new Map();
  let size = bytes(source);
  for (const item of ranges) {
    const embedded = /^data:image\/(?:png|jpeg|gif|webp|bmp);base64,[A-Za-z0-9+/=]+$/i.test(item.ref);
    if (!local(item.ref) && !(portable && embedded)) {
      if (portable) throw new Error('PORTABLE_REMOTE_IMAGE');
      continue;
    }
    if (!cache.has(item.ref)) {
      if (cache.size >= 256) throw new Error('PORTABLE_IMAGE_LIMIT');
      cache.set(item.ref, await resolve(item.ref));
    }
    const ref = cache.get(item.ref);
    if (!ref) throw new Error('PORTABLE_IMAGE_MISSING');
    const replacement = imageReplacement(item, ref);
    size += bytes(replacement) - bytes(source.slice(item.from, item.to));
    if (size > MAX_PORTABLE_BYTES) throw new Error('PORTABLE_TOO_LARGE');
    replacements.push({ ...item, replacement });
  }
  // Join segments, avoiding quadratic copies with many embedded images.
  const parts = []; let cursor = 0;
  for (const item of replacements) { parts.push(source.slice(cursor, item.from), item.replacement); cursor = item.to; }
  parts.push(source.slice(cursor));
  return parts.join('');
}

export function imageReferenceForNewDirectory(ref, sourceDirectory) {
  let path = decodeURIComponent(ref).replaceAll('\\', '/');
  if (/^(?:file:|[A-Za-z]:\/|\/)/.test(path)) return ref;
  const base = sourceDirectory.replaceAll('\\', '/').replace(/\/$/, '');
  path = `${base}/${path}`;
  // Use absolute file URLs so the copy retains its attachments. Originals stay
  // untouched; portable export is the explicit option for a self-contained copy.
  const prefix = /^[A-Za-z]:\//.test(path) ? 'file:///' : 'file://';
  return prefix + path.split('/').map(part => encodeURIComponent(part).replace(/%3A/gi, ':')).join('/');
}

export function rebaseMarkdownImages(source, directory) {
  const parts = []; let cursor = 0;
  for (const item of documentImageRanges(source)) {
    if (!local(item.ref)) continue;
    const ref = imageReferenceForNewDirectory(item.ref, directory);
    if (ref === item.ref) continue;
    parts.push(source.slice(cursor, item.from), imageReplacement(item, ref)); cursor = item.to;
  }
  parts.push(source.slice(cursor));
  return parts.join('');
}
