// Mermaid 11's Sankey CSV lexer accepts ASCII labels only. Extend just its
// two text character classes; CSV separators and HTML sanitization stay intact.
export function patchSankeyUnicode(bundle) {
  const ascii = String.raw`[\u0020-\u0021\u0023-\u002B\u002D-\u007E]`;
  const unicode = String.raw`[\u0020-\u0021\u0023-\u002B\u002D-\u007E\u0080-\uFFFF]`;
  if (bundle.split(ascii).length - 1 !== 2) {
    throw new Error('Mermaid Sankey lexer changed: review the Unicode compatibility patch before packaging.');
  }
  return bundle.replaceAll(ascii, unicode);
}
