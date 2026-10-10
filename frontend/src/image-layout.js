import { markdownImageRanges } from './portable-images.js';

const MAX_ENCODED_IMAGE = Math.ceil(25 * 1024 * 1024 / 3) * 4;
export const MAX_IMAGE_ROW = 6;
const escapeAttribute = value => value.replaceAll('&', '&amp;').replaceAll('"', '&quot;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');

function normalizedImageDimension(value, axis) {
  const text = String(value ?? '').trim();
  if (!text || text.toLowerCase() === 'auto') return '';
  const match = text.match(/^(\d{1,4})(%|px)?$/i);
  if (!match) throw new Error(`Invalid image ${axis}`);
  const amount = Number(match[1]), unit = (match[2] || '').toLowerCase();
  if (amount < 1 || amount > 4096 || (unit === '%' && (axis !== 'width' || amount > 100))) throw new Error(`Invalid image ${axis}`);
  return unit === '%' ? `${amount}%` : String(amount);
}

export function imageDimensions(image) {
  const attribute = name => image.attributes?.find(item => item.name === name)?.ref || '';
  let width = '', height = '';
  try { width = normalizedImageDimension(attribute('width'), 'width'); } catch {}
  try { height = normalizedImageDimension(attribute('height'), 'height'); } catch {}
  return { width, height };
}

export function imageDimensionStyle(value) {
  return value && !value.endsWith('%') ? `${value}px` : value;
}

export function imageSourceKind(ref) {
  if (!ref || /[\x00-\x1f]/.test(ref)) return null;
  if (/^data:/i.test(ref)) {
    const comma = ref.indexOf(',');
    if (comma < 0 || comma > 200 || ref.length - comma - 1 > MAX_ENCODED_IMAGE) return null;
    const header = ref.slice(0, comma + 1);
    if (!/^data:image\/[a-z0-9.+-]+(?:;[a-z0-9=.+-]+)*,$/i.test(header)) return null;
    if (/;base64,$/i.test(header) && !/^[A-Za-z0-9+/]+={0,2}$/.test(ref.slice(comma + 1))) return null;
    return 'embedded';
  }
  if (/^(?:https?:)?\/\//i.test(ref)) return 'remote';
  if (/^file:/i.test(ref) || /^[A-Za-z]:[\\/]/.test(ref)) return 'local';
  if (/^[a-z][a-z0-9+.-]*:/i.test(ref) || ref.startsWith('#')) return null;
  return 'local';
}

export function imageAlignment(style) {
  const properties = new Map(style.split(';').filter(part => part.includes(':')).map(part => {
    const colon = part.indexOf(':');
    return [part.slice(0, colon).trim().toLowerCase(), part.slice(colon + 1).trim().toLowerCase()];
  }));
  const left = properties.get('margin-left'), right = properties.get('margin-right');
  if (left === 'auto' && (right === '0' || right === '0px')) return 'right';
  if ((left === '0' || left === '0px') && right === 'auto') return 'left';
  return 'center';
}

export function editorImageItems(source) {
  return markdownImageRanges(source, { preview: true }).filter(item => {
    if (item.previewFrom === undefined || item.previewTo > source.length || !imageSourceKind(item.ref)) return false;
    return !item.attributes?.some((a, i, all) => all.findIndex(b => a.name === b.name) !== i);
  }).slice(0, 256).map(item => ({
    ...item, from: item.previewFrom, to: item.previewTo, sourceKind: imageSourceKind(item.ref),
    attributes: item.attributes?.map(a => ({ ...a, start: a.start - item.previewFrom, end: a.end - item.previewFrom })),
    alignment: imageAlignment(item.attributes?.find(a => a.name === 'style')?.ref || '')
  }));
}

export function alignedImageSource(source, item, alignment) {
  if (!['left', 'center', 'right'].includes(alignment)) throw new Error('Invalid image alignment');
  const margins = `display:block;margin-left:${alignment === 'left' ? '0' : 'auto'};margin-right:${alignment === 'right' ? '0' : 'auto'}`;
  if (item.kind !== 'html') return `<img src="${escapeAttribute(item.ref)}" alt="${escapeAttribute(item.alt || '')}"${item.title ? ` title="${escapeAttribute(item.title)}"` : ''} style="${margins}">`;
  const style = item.attributes.find(a => a.name === 'style');
  const retained = (style?.ref || '').split(';').filter(part => !/^\s*(?:display|margin(?:-left|-right)?)\s*:/i.test(part)).filter(part => part.trim()).join(';');
  const replacement = `style="${escapeAttribute(`${retained ? `${retained};` : ''}${margins}`)}"`;
  if (style) return source.slice(0, style.start) + replacement + source.slice(style.end);
  const end = source.lastIndexOf('>'), insert = source[end - 1] === '/' ? end - 1 : end;
  return source.slice(0, insert) + ` ${replacement}` + source.slice(insert);
}

export function sizedImageSource(source, item, dimensions) {
  const width = normalizedImageDimension(dimensions?.width, 'width');
  const height = normalizedImageDimension(dimensions?.height, 'height');
  if (item.kind !== 'html') {
    const html = alignedImageSource(source, item, item.alignment);
    return sizedImageSource(html, editorImageItems(html)[0], { width, height });
  }
  const changes = [];
  for (const [name, value] of [['width', width], ['height', height]]) {
    const attribute = item.attributes.find(entry => entry.name === name);
    if (attribute) changes.push({ from: attribute.start, to: attribute.end, insert: value ? `${name}="${escapeAttribute(value)}"` : '' });
  }
  const additions = [['width', width], ['height', height]]
    .filter(([name, value]) => value && !item.attributes.some(attribute => attribute.name === name))
    .map(([name, value]) => ` ${name}="${escapeAttribute(value)}"`).join('');
  if (additions) {
    const end = source.lastIndexOf('>'), insert = source[end - 1] === '/' ? end - 1 : end;
    changes.push({ from: insert, to: insert, insert: additions });
  }
  return changes.sort((a, b) => b.from - a.from).reduce((result, change) => result.slice(0, change.from) + change.insert + result.slice(change.to), source);
}

export function imageRowSource(source, images) {
  if (images.length < 2 || images.length > MAX_IMAGE_ROW) throw new Error('Invalid image row size');
  const width = Number((100 / images.length).toFixed(4));
  const cells = images.map(item => `<td style="width:${width}%;padding:0 6px;border:0;vertical-align:top">${alignedImageSource(source.slice(item.from, item.to), item, item.alignment)}</td>`);
  return `<table class="quillite-image-row" style="width:100%;table-layout:fixed;border-collapse:collapse;border:0">\n<tbody><tr>\n${cells.join('\n')}\n</tr></tbody>\n</table>`;
}

// Preserve the existing quote/list item, including ordered and task markers.
// Continuations use spaces instead of repeating a bullet (which would create
// another list item). Unknown prefixes are deliberately not rewritten.
function imageContinuation(source, group) {
  const start = source.lastIndexOf('\n', group.from - 1) + 1;
  const prefix = source.slice(start, group.from);
  if (!/^(?:[ \t]|>\s?|(?:[-+*]|\d+[.)])\s+|\[[ xX]\]\s+)*$/.test(prefix)) return null;
  return prefix.replace(/(?:[-+*]|\d+[.)])\s+(?:\[[ xX]\]\s+)?/g, marker => ' '.repeat(marker.length));
}

export function separateImageChanges(source, group) {
  const continuation = imageContinuation(source, group);
  if (continuation === null) return null;
  return { from: group.from, to: group.to, insert: group.images.map(image => source.slice(image.from, image.to)).join(`\n${continuation}\n${continuation}`) };
}

export function alignImageChanges(source, group, index, alignment) {
  const target = group.images[index];
  if (group.row && target.paragraphFrom !== undefined) {
    // Converting only the first image would start an HTML block and consume
    // later Markdown images. Convert the whole paragraph in one transaction.
    const images = group.images.map((image, i) => i === index ? { ...image, alignment } : image);
    return { from: group.from, to: group.to, insert: imageRowSource(source, images).replaceAll('\n', '') };
  }
  let insert = alignedImageSource(source.slice(target.from, target.to), target, alignment);
  // An img-only first line starts an HTML block. End that block before the
  // remaining Markdown prose, retaining the surrounding quote/list container.
  if (target.kind !== 'html' && target.paragraphFrom === target.from && /^\s*\n/.test(source.slice(target.to, target.paragraphTo))) {
    const continuation = imageContinuation(source, group);
    if (continuation === null) return null;
    insert += `\n${continuation}`;
  }
  return { from: target.from, to: target.to, insert };
}

export function resizeImageChanges(source, group, index, dimensions) {
  const target = group.images[index];
  if (!target) throw new Error('Invalid image index');
  if (group.row && target.paragraphFrom !== undefined) {
    // As with alignment, first materialize the complete Markdown-only row so
    // an HTML img cannot swallow the remaining Markdown images.
    let row = imageRowSource(source, group.images).replaceAll('\n', '');
    const rowTarget = editorImageItems(row)[index];
    const replacement = sizedImageSource(row.slice(rowTarget.from, rowTarget.to), rowTarget, dimensions);
    row = row.slice(0, rowTarget.from) + replacement + row.slice(rowTarget.to);
    return { from: group.from, to: group.to, insert: row };
  }
  let insert = sizedImageSource(source.slice(target.from, target.to), target, dimensions);
  if (target.kind !== 'html' && target.paragraphFrom === target.from && /^\s*\n/.test(source.slice(target.to, target.paragraphTo))) {
    const continuation = imageContinuation(source, group);
    if (continuation === null) return null;
    insert += `\n${continuation}`;
  }
  return { from: target.from, to: target.to, insert };
}

// Recognize only a single, image-only generated table. Arbitrary table text,
// captions, unknown markup or nested tables must never disappear in a widget.
function pureImageTable(source, images, from, to) {
  const head = source.slice(from, Math.min(from + 512, to));
  if (!/^\s*<table\s+class=["']quillite-image-row["'](?:\s|>)/i.test(head)) return false;
  const parts = []; let cursor = from;
  for (const image of images) { parts.push(source.slice(cursor, image.from)); cursor = image.to; }
  parts.push(source.slice(cursor, to));
  const markup = parts.join('');
  if (markup.length > 8192 || !/^\s*<table\b[\s\S]*<\/table>\s*$/i.test(markup)) return false;
  const tags = markup.match(/<\/?(?:table|tbody|tr|td)\b[^>]*>/gi) || [];
  if (markup.replace(/<\/?(?:table|tbody|tr|td)\b[^>]*>/gi, '').trim()) return false;
  const structure = tags.map(tag => (tag.match(/^<(\/?\w+)/) || [])[1]?.toLowerCase());
  const expected = ['table', 'tbody', 'tr'];
  for (const image of images) expected.push('td', '/td');
  expected.push('/tr', '/tbody', '/table');
  return structure.length === expected.length && structure.every((tag, i) => tag === expected[i]);
}

export function editorImageGroups(source) {
  const images = editorImageItems(source), groups = [], used = new Set();
  for (const item of images) {
    if (used.has(item)) continue;
    let siblings = [], from = item.from, to = item.to, row = false;
    if (item.blockFrom !== undefined) {
      siblings = images.filter(image => image.blockFrom === item.blockFrom && image.blockTo === item.blockTo);
      if (siblings.length >= 2 && siblings.length <= MAX_IMAGE_ROW && pureImageTable(source, siblings, item.blockFrom, item.blockTo)) {
        from = item.blockFrom; to = item.blockTo; row = true;
      }
    } else if (item.paragraphFrom !== undefined) {
      siblings = images.filter(image => image.paragraphFrom === item.paragraphFrom && image.paragraphTo === item.paragraphTo);
      if (siblings.length >= 2 && siblings.length <= MAX_IMAGE_ROW) {
        let cursor = item.paragraphFrom;
        const emptyGap = text => !text.replace(/\n[ \t]*(?:>[ \t]*)+/g, '\n').trim();
        row = siblings.every(image => { const gap = source.slice(cursor, image.from); cursor = image.to; return emptyGap(gap); }) && emptyGap(source.slice(cursor, item.paragraphTo));
        if (row) { from = item.paragraphFrom; to = item.paragraphTo; }
      }
    }
    if (!row) siblings = [item];
    for (const image of siblings) used.add(image);
    groups.push({ ...siblings[0], from, to, images: siblings, row, open: false });
  }
  return groups.sort((a, b) => a.from - b.from);
}

export function canJoinImageGroups(source, first, next) {
  if (!next || first.images.length + next.images.length > MAX_IMAGE_ROW) return false;
  // Also accepts a CodeMirror Text rope: do not stringify the whole document
  // once per image/keystroke merely to enable a small toolbar button.
  const slice = typeof source === 'string' ? (from, to) => source.slice(from, to) : (from, to) => source.sliceString(from, to);
  if (slice(first.to, next.from).trim()) return false;
  const lineStart = typeof source === 'string' ? source.lastIndexOf('\n', first.from - 1) + 1 : source.lineAt(first.from).from;
  const endPosition = Math.max(next.from, next.to - 1);
  const lineEnd = typeof source === 'string' ? source.indexOf('\n', endPosition) : source.lineAt(endPosition).to;
  return !slice(lineStart, first.from).trim() && !slice(next.to, lineEnd < 0 ? source.length : Math.max(next.to, lineEnd)).trim();
}

// Called after DOMPurify. Image-only Markdown paragraphs become real tables
// so multi-image rows also survive Word export, not just browser flex layout.
export function normalizeImageRows(container) {
  for (const paragraph of container.querySelectorAll('p, li')) {
    const children = [...paragraph.childNodes];
    const images = children.filter(node => node.nodeType === 1 && node.tagName === 'IMG');
    if (images.length < 2 || images.length > MAX_IMAGE_ROW || children.some(node => node.nodeType === 1 ? node.tagName !== 'IMG' : node.nodeType !== 3 || node.textContent.trim())) continue;
    const table = document.createElement('table'); table.className = 'quillite-image-row';
    table.style.cssText = 'width:100%;table-layout:fixed;border-collapse:collapse;border:0';
    const row = table.createTBody().insertRow();
    for (const img of images) {
      const cell = row.insertCell(); cell.style.cssText = `width:${Number((100 / images.length).toFixed(4))}%;padding:0 6px;border:0;vertical-align:top`;
      if (!img.style.marginLeft && !img.style.marginRight) { img.style.display = 'block'; img.style.marginLeft = 'auto'; img.style.marginRight = 'auto'; }
      cell.append(img);
    }
    if (paragraph.tagName === 'LI') paragraph.replaceChildren(table);
    else paragraph.replaceWith(table);
  }
}
