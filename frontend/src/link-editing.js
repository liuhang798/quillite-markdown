import { markdownParser } from './markdown-parser.js';
import { decodeHTML } from 'entities';
import { scanMarkdownFormulas } from './formula-editing.js';
import { nextFootnoteNumber, prepareFootnotes } from './markdown-formats.js';
import {footnoteProjection} from './footnote-editing.js';
import {fieldPosition,fieldOffset} from './projected-code.js';
import {markdownReferenceDefinitions,referenceLabelKey,decodeReferenceValue} from './reference-definitions.js';

const children = node => { const result = []; for (let child = node.firstChild; child; child = child.nextSibling) result.push(child); return result; };
const unescape = decodeReferenceValue;
// Reference identifiers are literal Markdown labels: entities/escapes must not
// be decoded into a different definition (matching the reading renderer).
export const markdownReferenceKey = referenceLabelKey;
const referenceKey = markdownReferenceKey;

// Offsets always refer to the original Markdown. A reference-link edit updates
// its definition, not a rendered DOM projection or every matching text string.
export function findMarkdownLinkAt(source, from, to = from, referenceSource = null) {
  const tree = markdownParser.parse(source), definitions = markdownReferenceDefinitions(referenceSource??source,referenceSource===null?tree:null);
  const visit = (node, callback) => { callback(node); for (const child of children(node)) visit(child, callback); };
  let found = null;
  const formulas = scanMarkdownFormulas(source);
  visit(tree.topNode, node => {
    if (!['Link', 'Autolink'].includes(node.name) || from < node.from || to > node.to || formulas.some(item => item.from < node.to && node.from < item.to)) return;
    // GFM may recognize a bare URL inside an explicit link label. It is label
    // text, not a second editable destination that can override its owner.
    for (let parent = node.parent; parent; parent = parent.parent) if (parent.name === 'Link') return;
    const parts = children(node), marks = parts.filter(child => child.name === 'LinkMark');
    const close = marks.find(child => source.slice(child.from, child.to) === ']');
    const auto = node.name === 'Autolink';
    if (!auto && !close) return;
    const labelFrom = auto ? node.from + 1 : marks[0].to, labelTo = auto ? node.to - 1 : close.from;
    const label = source.slice(labelFrom, labelTo), ref = parts.find(child => child.name === 'LinkLabel');
    const reference = ref ? source.slice(ref.from + 1, ref.to - 1) || label : label;
    const direct = auto || parts.some(child => child.name === 'LinkMark' && source.slice(child.from, child.to) === '(');
    let target;
    if(direct) {
      // URL-looking label text is not a second destination.
      const url=parts.find(child=>child.name==='URL'&&(auto||child.from>=close.to));
      const title=parts.find(child=>child.name==='LinkTitle');
      const open=parts.find(child=>child.name==='LinkMark'&&source.slice(child.from,child.to)==='(');
      if(!url&&!open)return;
      const rawURL=url?source.slice(url.from,url.to):'';
      target={ref:unescape(rawURL.startsWith('<')?rawURL.slice(1,-1):rawURL),title:title?source.slice(title.from,title.to):'',
        urlFrom:url?.from??open.to,urlTo:url?.to??open.to,titleFrom:title?.from,titleTo:title?.to};
    } else target=definitions.get(referenceKey(reference));
    if(!target)return;
    found = { from: node.from, to: node.to, labelFrom, labelTo, label,
      url: target.ref,
      title: target.title ? unescape(target.title.slice(1,-1)) : '',
      kind: auto ? 'autolink' : direct ? 'inline' : 'reference', reference,
      urlFrom: target.urlFrom, urlTo: target.urlTo,
      titleFrom: target.titleFrom, titleTo: target.titleTo, ...(!direct&&referenceSource!==null?{externalReference:true}:{}) };
  });
  // The root CommonMark tree sees continuation lines as indented code. Resolve
  // links in the actual footnote body, then map use/target coordinates back.
  // Shared definitions already carry root coordinates and must not be remapped.
  if(!found && referenceSource===null && source.includes('[^')) {
    for(const definition of prepareFootnotes(source).definitions.values()) {
      if(from<definition.bodyFrom || to>definition.to)continue;
      const projection=footnoteProjection(source,definition),range={from:definition.bodyFrom,to:definition.to,projection};
      const local=findMarkdownLinkAt(projection.text,fieldOffset(range,from),fieldOffset(range,to),source);
      if(!local)continue;
      const mapped={...local};
      for(const key of ['from','to','labelFrom','labelTo',...(!local.externalReference?['urlFrom','urlTo','titleFrom','titleTo']:[])])
        if(Number.isInteger(mapped[key]))mapped[key]=fieldPosition(range,mapped[key]);
      delete mapped.externalReference;return mapped;
    }
  }
  return found;
}

export function validLinkDestination(value) {
  const url = decodeHTML(String(value)).trim();
  if (!url || /[\u0000-\u001f\u007f\\]/.test(url)) return false;
  const scheme = url.match(/^([a-z][a-z\d+.-]*):/i);
  if (scheme && !/^https?$/i.test(scheme[1])) return false;
  if (/^https?:/i.test(url)) { try { return /^https?:\/\//i.test(url) && Boolean(new URL(url).hostname); } catch { return false; } }
  return !url.startsWith('//');
}

function labelSource(text) {
  // Keep Markdown emphasis and existing escapes; brackets cannot form a nested link.
  return text.replace(/\\.|[\[\]]/gs, token => token.length === 2 ? token : `\\${token}`);
}
const destinationSource = text => `<${text.replaceAll('<', '%3C').replaceAll('>', '%3E')}>`;
const titleSource = text => `"${text.replaceAll('\\', '\\\\').replaceAll('"', '\\"')}"`;

export function linkEdit(source, range, values, existing = null, mode = 'inline', referenceName = 'reference') {
  const url = String(values.url).trim(), label = String(values.label), title = String(values.title || '');
  if (mode === 'autolink') {
    if (!/^https?:\/\//i.test(url) || !validLinkDestination(url)) return null;
    if (existing?.kind === 'autolink' && existing.url === url) return { changes: [] };
    const insert = destinationSource(url.replaceAll(' ', '%20'));
    const from = existing?.from ?? range.from, to = existing?.to ?? range.to;
    return { changes: { from, to, insert }, selection: { anchor: from + insert.length } };
  }
  if (!validLinkDestination(url) || !label.trim() || /[\r\n]/.test(label + title)) return null;
  if (existing && existing.label === label && existing.url === url && existing.title === title) return { changes: [] };
  const safeLabel = labelSource(label);
  if (mode === 'reference' && !existing) {
    // Reserve even unresolved labels, so insertion cannot silently activate an
    // unrelated shortcut link. Conservative reservation is harmless.
    const used = new Set(Array.from(source.matchAll(/\[((?:\\.|[^\]\\\r\n])*)\]/g), match => referenceKey(match[1])));
    let name = referenceName, number = 2;
    while (used.has(referenceKey(name))) name = `${referenceName}-${number++}`;
    const insert = `[${safeLabel}][${name}]`;
    const remaining = source.slice(0, range.from) + insert + source.slice(range.to);
    const separator = remaining.endsWith('\n\n') ? '' : remaining.endsWith('\n') ? '\n' : '\n\n';
    const definition = `${separator}[${name}]: ${destinationSource(url)}${title ? ` ${titleSource(title)}` : ''}\n`;
    const changes = range.to === source.length ? { ...range, insert: insert + definition }
      : [{ ...range, insert }, { from: source.length, insert: definition }];
    return { changes, selection: { anchor: range.from + insert.length } };
  }
  if (existing?.kind === 'reference') {
    const changes = [];
    if (existing.label !== label) changes.push({ from: existing.from, to: existing.to, insert: `[${safeLabel}][${existing.reference}]` });
    if (existing.url !== url) changes.push({ from: existing.urlFrom, to: existing.urlTo, insert: destinationSource(url) });
    if (existing.title !== title) changes.push(existing.titleFrom === undefined
      ? { from: existing.urlTo, insert: title ? ` ${titleSource(title)}` : '' }
      : { from: existing.titleFrom, to: existing.titleTo, insert: title ? titleSource(title) : '' });
    return { changes: changes.sort((a, b) => a.from - b.from) };
  }
  const insert = existing?.kind === 'autolink' && label === url && !title
    ? destinationSource(url) : `[${safeLabel}](${destinationSource(url)}${title ? ` ${titleSource(title)}` : ''})`;
  const from = existing?.from ?? range.from, to = existing?.to ?? range.to;
  return { changes: { from, to, insert }, selection: { anchor: from + insert.length } };
}

export function footnoteEdit(source, from, to, placeholder) {
  const reference = `[^${nextFootnoteNumber(source)}]`;
  const note = (source.slice(from, to) || placeholder).replace(/\r\n?/g, '\n').replaceAll('\n', '\n    ');
  const remaining = source.slice(0, from) + reference + source.slice(to);
  const separator = remaining.endsWith('\n\n') ? '' : remaining.endsWith('\n') ? '\n' : '\n\n';
  const definition = `${separator}${reference}: ${note}\n`;
  const changes = to === source.length ? { from, to, insert: reference + definition }
    : [{ from, to, insert: reference }, { from: source.length, insert: definition }];
  return { changes, selection: { anchor: from + reference.length } };
}
