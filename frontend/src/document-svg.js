// Blank lines inside SVG are not Markdown paragraph boundaries. Claim only a
// complete, standalone root and leave the original bytes to the HTML sanitizer.
export function svgBlockEnd(source, from = 0) {
  const open = / {0,3}<svg(?=[\s/>])/iy;
  open.lastIndex = from;
  if (!open.test(source)) return -1;
  const tag = /<!--[\s\S]*?-->|<!\[CDATA\[[\s\S]*?\]\]>|<\/?[a-zA-Z_](?:[^<>"']|"[^"]*"|'[^']*')*>/gy;
  let at = source.indexOf('<', from), depth = 0;
  while (at >= 0) {
    tag.lastIndex = at;
    const token = tag.exec(source)?.[0];
    if (!token) return -1;
    // Bound speculative lookahead across runs of unfinished root elements.
    if (/^<svg(?=[\s/>])/i.test(token) && !token.endsWith('/>') && ++depth > 32) return -1;
    if (/^<\/svg\s*>$/i.test(token)) depth--;
    if (!depth) {
      const eol = /[ \t]*(?=\r?\n|$)/y;
      eol.lastIndex = tag.lastIndex;
      return eol.test(source) ? tag.lastIndex : -1;
    }
    at = source.indexOf('<', tag.lastIndex);
  }
  return -1;
}

export const documentSvgBlock = {
  name: 'documentSvg', level: 'block',
  tokenizer(source) {
    const end = svgBlockEnd(source);
    if (end < 0) return;
    const raw = source.slice(0, end);
    return { type: 'html', raw, text: raw, block: true };
  }
};

// Use a passive image in the editor: the diagram cannot capture clicks,
// navigate or load external resources. Never persist this presentation.
export function liveSvgImage(source, purifier) {
  const fragment = purifier.sanitize(source, { USE_PROFILES: { svg: true, svgFilters: true },
    FORBID_TAGS: ['style', 'foreignObject'], RETURN_DOM_FRAGMENT: true });
  const svg = fragment.firstElementChild;
  if (svg?.namespaceURI !== 'http://www.w3.org/2000/svg' || svg.localName !== 'svg') return '';
  const img = document.createElement('img');
  img.className = 'cm-document-svg';
  img.alt = svg.querySelector('title')?.textContent || 'SVG';
  img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(new XMLSerializer().serializeToString(svg));
  // Relative widths resolve against the editor, not the image viewport.
  const width = svg.style.width || svg.getAttribute('width');
  if (width && /^(?:\d+(?:\.\d+)?|\.\d+)(?:px|%|em|rem)?$/i.test(width)) {
    img.style.width = /^\d*\.?\d+$/.test(width) ? width + 'px' : width;
  }
  return img.outerHTML;
}
