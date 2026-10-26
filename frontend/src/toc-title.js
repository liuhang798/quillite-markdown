import { renderLatex } from './math-rendering.js';

const escape = value => String(value).replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));

// Extract semantic title parts instead of flattening KaTeX's MathML, TeX
// annotation and visual HTML into duplicate text. Never copy heading HTML:
// links, IDs, images and editor formula origins must not enter a TOC link.
export function createTocTitle(heading) {
  const parts = [];
  const text = value => {
    if (!value) return;
    const previous = parts.at(-1);
    if (previous && !previous.math) previous.text += value;
    else parts.push({ text: value });
  };
  const visit = node => {
    if (node.nodeType === 3) { text(node.textContent); return; }
    if (node.nodeType !== 1) return;
    if (node.matches('.math-inline[data-math-source], .math-block[data-math-source]')) {
      try {
        const source = decodeURIComponent(node.getAttribute('data-math-source'));
        parts.push({ text: source, math: renderLatex(source, false) });
        return;
      } catch { /* Malformed metadata remains readable, never executable. */ }
    }
    if (node.tagName === 'BR') text(' ');
    else for (const child of node.childNodes) visit(child);
  };
  for (const child of heading.childNodes) visit(child);
  return { parts, text: parts.map(part => part.text).join(''), hasMath: parts.some(part => part.math) };
}

export function tocTitleHTML(title, query = '') {
  const needle = String(query).trim().toLocaleLowerCase();
  return title.parts.map(part => {
    const index = needle ? part.text.toLocaleLowerCase().indexOf(needle) : -1;
    if (part.math) {
      const math = `<span class="toc-math">${part.math}</span>`;
      // Highlight the complete formula, never splice tags into KaTeX markup.
      return index < 0 ? math : `<mark>${math}</mark>`;
    }
    if (index < 0) return escape(part.text);
    return `${escape(part.text.slice(0, index))}<mark>${escape(part.text.slice(index, index + needle.length))}</mark>${escape(part.text.slice(index + needle.length))}`;
  }).join('');
}
