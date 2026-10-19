import { markdownParser } from './markdown-parser.js';

// Continuation prefix for the actual quote/list owning a prose drop position.
// Derive it from syntax nodes, including lazy continuation lines, rather than
// interpreting an arbitrary leading dash or greater-than character as markup.
export function blockDropPrefix(source, position) {
  const tree = markdownParser.parse(source), containers = [];
  for (let node = tree.resolveInner(position, -1); node; node = node.parent) {
    if (['FencedCode', 'CodeBlock', 'HTMLBlock'].includes(node.name)) return '';
    if (['ListItem', 'Blockquote'].includes(node.name)) containers.push(node);
  }
  const innermost = containers[0];
  if (!innermost) return '';
  const mark = innermost.getChild(innermost.name === 'ListItem' ? 'ListMark' : 'QuoteMark');
  if (!mark) return '';
  const start = source.lastIndexOf('\n', mark.from - 1) + 1;
  const end = source.indexOf('\n', mark.to), rest = source.slice(mark.to, end < 0 ? source.length : end);
  const whitespace = /^[\t ]*/.exec(rest)[0];
  let prefix = source.slice(start, mark.to) + whitespace;
  // A list marker is only used once. Subsequent paragraphs belong to that item
  // through indentation; task checkboxes are content, not continuation markers.
  const marks = containers.filter(node => node.name === 'ListItem').map(node => node.getChild('ListMark'))
    .filter(node => node && node.from >= start && node.to <= mark.to).sort((a,b) => b.from-a.from);
  for (const item of marks) prefix = prefix.slice(0,item.from-start) + ' '.repeat(item.to-item.from) + prefix.slice(item.to-start);
  // Keep tab indentation aligned with Markdown's four-column tab stops.
  let expanded = '';
  for (const char of prefix) expanded += char === '\t' ? ' '.repeat(4-expanded.length%4) : char;
  return expanded;
}
