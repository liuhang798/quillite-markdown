// A position by itself is only meaningful in the exact original revision.
export const annotationColors = ['yellow', 'mint', 'purple'];
export const maxAnnotations = 200;
export const maxQuote = 2048;
const pad = 32;

export function annotationKey(path, windows) {
  return path ? 'quillite.reading-marks.v1:' + (windows ? path.replaceAll('\\', '/').toLowerCase() : path) : '';
}

export function decodeAnnotations(raw) {
  if (raw == null) return [];
  const items = JSON.parse(raw);
  if (!Array.isArray(items) || items.length > maxAnnotations || new Set(items.map(i => i?.id)).size !== items.length ||
    !items.every(i => i && typeof i.id === 'string' && annotationColors.includes(i.color) &&
      typeof i.quote === 'string' && i.quote.trim() && i.quote.length <= maxQuote && !i.quote.includes('\0') &&
      ['tag','before','after','prev','next','revision'].every(k => typeof i[k] === 'string') &&
      ['at','block'].every(k => Number.isSafeInteger(i[k]) && i[k] >= 0) && typeof i.ambiguous === 'boolean')) {
    throw new Error('Invalid local reading annotations');
  }
  return items;
}

export function captureAnchor(blocks, block, at, quote, revision) {
  const b = blocks[block];
  if (!quote.trim() || quote.includes('\0') || quote.length > maxQuote || b.text.slice(at, at + quote.length) !== quote) return null;
  const a = { tag:b.tag, block, at, quote, revision,
    before:b.text.slice(Math.max(0, at-pad),at), after:b.text.slice(at+quote.length,at+quote.length+pad),
    prev:blocks[block-1]?.text.slice(-pad) || '', next:blocks[block+1]?.text.slice(0,pad) || '', ambiguous:false };
  a.ambiguous = !findAnchor(blocks,a,null);
  return a;
}

export function findAnchor(blocks, a, revision) {
  const contextMatches = (s,i) => s.startsWith(a.after,i+a.quote.length) && s.endsWith(a.before,i)
    && (a.before || i===0) && (a.after || i+a.quote.length===s.length);
  const b = blocks[a.block];
  if (revision && revision===a.revision && b?.tag===a.tag && b.text.startsWith(a.quote,a.at) && contextMatches(b.text,a.at)) {
    return {block:a.block,at:a.at};
  }
  if (a.ambiguous) return null;
  let match = null;
  for (let block=0; block<blocks.length; block++) {
    if (blocks[block].tag!==a.tag) continue;
    const s = blocks[block].text;
    for (let i=s.indexOf(a.quote); i!==-1; i=s.indexOf(a.quote,i+1)) {
      if (!contextMatches(s,i)) continue;
      if (!a.before && !a.after && ((!a.prev && !a.next) ||
        (a.prev && !blocks[block-1]?.text.endsWith(a.prev)) || (a.next && !blocks[block+1]?.text.startsWith(a.next)))) continue;
      if (match) return null; // never choose the first/nearest duplicate
      match={block,at:i};
    }
  }
  return match;
}
