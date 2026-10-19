// Marked 15's Setext regexp alternates one character/newline repeatedly.
// Older WebViews can exhaust their regexp stack on a long paragraph. Scan
// physical lines instead for large inputs, preserving Marked 15 interruption
// rules, raw text and offsets (including multiline Setext headings).
export function largeHeadingTokenizer(src) {
  if (src.length < 32768 || this.options.pedantic) return false;
  const interrupts = line => /^(?:(?:[*+-]|\d{1,9}[.)]) | {4}| {0,3}\t| {0,3}(?:`{3,}|~{3,})| {0,3}>| {0,3}#{1,6}| {0,3}<[^\n>]+>\n)/.test(line)
    || (this.options.gfm && /^ {0,3}\|?(?:[:\- ]*\|)+[:\- ]*\n/.test(line));
  let start = 0;
  while (start < src.length) {
    const newline = src.indexOf('\n', start);
    const end = newline < 0 ? src.length : newline;
    const line = src.slice(start, end);
    if (start) {
      const underline = /^ {0,3}(=+|-+) *$/.exec(line);
      if (underline) {
        let to = end;
        while (src[to] === '\n') to++;
        const text = src.slice(0, start - 1);
        return {type: 'heading', raw: src.slice(0, to), depth: underline[1][0] === '=' ? 1 : 2, text, tokens: this.lexer.inline(text)};
      }
      if (!line.trim()) return undefined;
    }
    if (interrupts(line + (newline < 0 ? '' : '\n')) || /[\r\u2028\u2029]/.test(line)) return undefined;
    if (newline < 0) return undefined;
    start = newline + 1;
  }
  return undefined;
}
