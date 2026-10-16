import { markdownLanguage } from '@codemirror/lang-markdown';
import { Table } from '@lezer/markdown';

// Lezer 1.7.2 rejects whitespace after a delimiter row's final pipe.
// Reuse its table parser (including escapes, inline nodes and containers),
// trimming only the delimiter probe. Never normalize the stored document or
// subsequent body rows: their original offsets/whitespace must survive edits.
const table = Table.parseBlock.find(parser => parser.name === 'Table');
export const tableWhitespace = {
  parseBlock: [{
    ...table,
    leaf(cx, leaf) {
      const parser = table.leaf(cx, leaf);
      if (!parser) return null;
      const nextLine = parser.nextLine;
      let first = true;
      parser.nextLine = function(cx, line, leaf) {
        if (first) {
          first = false;
          line = Object.assign(Object.create(line), { text: line.text.trimEnd() });
        }
        return nextLine.call(this, cx, line, leaf);
      };
      return parser;
    },
    endLeaf(cx, line, leaf) {
      const probe = Object.create(cx);
      probe.peekLine = () => cx.peekLine().trimEnd();
      return table.endLeaf(probe, line, leaf);
    }
  }]
};

export const markdownParser = markdownLanguage.parser.configure(tableWhitespace);

// Marked 15 also rejects a terminal tab on the delimiter row. Convert tabs
// only inside real table delimiter nodes for rendering, retaining UTF-16 and
// line offsets. Code examples and prose hard-break whitespace stay untouched.
export function tableRenderSource(source) {
  if (!source.includes('\t')) return source;
  const edits = [];
  const visit = node => {
    if (node.name === 'Table') {
      for (let row = node.firstChild; row; row = row.nextSibling) {
        if (row.name === 'TableDelimiter') {
          const end = source.indexOf('\n', row.to);
          edits.push({from:row.from, to:end < 0 ? source.length : end});
        }
      }
      return;
    }
    for (let child = node.firstChild; child; child = child.nextSibling) visit(child);
  };
  visit(markdownParser.parse(source).topNode);
  for (const {from,to} of edits.reverse()) source = source.slice(0,from)+source.slice(from,to).replaceAll('\t',' ')+source.slice(to);
  return source;
}
