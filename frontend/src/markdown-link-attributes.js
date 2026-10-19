import { decodeHTMLStrict } from 'entities';

// Marked keeps entity references in link destinations/titles. Decode exactly
// once, then encode for a quoted HTML attribute. Do not decode percent escapes
// or legacy entities without semicolons (these are literal Markdown text).
export function markdownLinkAttribute(value = '') {
  return decodeHTMLStrict(String(value)).replace(/[&<>"']/g, char => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  })[char]);
}
