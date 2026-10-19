import { codeProjection, composeProjections, fieldPosition, fieldOffset } from './projected-code.js';
import { markdownParser } from './markdown-parser.js';

// Strip only the enclosing quote markers, keeping every editable character's
// original offset. Missing markers are ambiguous HTML, not permission to absorb
// text outside the quote. Blank quote lines may omit the optional trailing space.
function quotedHtmlProjection(source, from, to, prefix) {
  const markers = prefix.match(/[ \t]*>[ \t]?/g);
  if (!markers) return null;
  const indent = prefix.slice(markers.join('').length);
  if (/\S/.test(indent)) return null;
  const pieces = [];
  for (let start = from; start <= to;) {
    const next = source.indexOf('\n', start), end = next < 0 || next >= to ? to : next + 1;
    let content = start;
    if (start !== from) {
      for (let index = 0; index < markers.length; index++) {
        const mark = /^[ \t]*>[ \t]?/.exec(source.slice(content, end));
        if (!mark) return null;
        content += mark[0].length;
      }
      if (source.slice(content, end).startsWith(indent)) content += indent.length;
      else if (source.slice(content, end).trim()) return null;
    }
    pieces.push({from:content,to:end});
    if (end === to) break;
    start = end;
  }
  return codeProjection(source, pieces, from, prefix);
}

// Keep offsets in the original document. Never derive editable source from HTML.
export function structuredHtmlBlocks(source, protectedRanges = []) {
  // Raw HTML can hide fenced Markdown from the initial CommonMark tree,
  // especially inside quotes. Mask only structural tags for this code scan;
  // preserve all positions so a literal closing tag cannot end its parent.
  const protectedCode = [];
  if (/<(?:details|div)\b/i.test(source)) {
    const probe = source.replace(/<\/?(?:details|summary|div)\b(?:"[^"]*"|'[^']*'|[^'">])*>/gi, tag=>tag.replace(/[^\r\n]/g,' '));
    const visit = node => {
      if (['FencedCode','InlineCode'].includes(node.name)) {protectedCode.push({from:node.from,to:node.to});return;}
      for (let child=node.firstChild;child;child=child.nextSibling) visit(child);
    };
    visit(markdownParser.parse(probe).topNode);
  }
  const protectedAll = [...protectedRanges,...protectedCode];
  const blocked = (from, to) => protectedAll.some(range => from < range.to && range.from < to);
  const result = [], stack = [];
  const tags = /<!--[^]*?-->|<\/?(?:details|div)\b(?:"[^"]*"|'[^']*'|[^'">])*>/gi;
  for (const match of source.matchAll(tags)) {
    const from = match.index, to = from + match[0].length;
    if (blocked(from, to) || match[0].startsWith('<!--')) continue;
    const name = /^<\/?(\w+)/.exec(match[0])[1].toLowerCase(), closing = /^<\//.test(match[0]);
    if (!closing) { stack.push({ name, from, to, tag: match[0] }); continue; }
    const start = stack.pop();
    if (!start || start.name !== name) { stack.length = 0; continue; }
    if (stack.length) continue;
    if (/<(?:script|style|iframe|object|embed|input|button|form)\b/i.test(source.slice(start.from, to))) continue;
    const lineFrom = source.lastIndexOf('\n', start.from - 1) + 1;
    const lineTo = source.indexOf('\n', to);
    if (source.slice(to, lineTo < 0 ? source.length : lineTo).trim()) continue;
    const prefix = source.slice(lineFrom, start.from);
    if (prefix.trim()) {
      if (!/^(?:[ \t]*>[ \t]?)+[ \t]*$/.test(prefix)) continue;
      const projection = quotedHtmlProjection(source, start.from, to, prefix);
      if (!projection) continue;
      const field = {from:start.from,to,projection}, map = position => fieldPosition(field, position);
      const protectedLocal = protectedRanges.filter(range => range.from < to && range.to > start.from)
        .map(range => ({...range,from:fieldOffset(field,range.from),to:fieldOffset(field,range.to)}));
      for (const item of structuredHtmlBlocks(projection.text, protectedLocal)) {
        const cells = item.cells.map(range => {
          const local = range.projection || codeProjection(projection.text, [{from:range.from,to:range.to}], range.from, '');
          return {...range,from:map(range.from),to:map(range.to),projection:composeProjections(local,projection)};
        });
        result.push({...item,from:map(item.from),to:map(item.to),raw:source.slice(map(item.from),map(item.to)),cells,projection});
      }
      continue;
    }
    // Structured editing is lossless for the application's own block syntax.
    // Other HTML attributes/structures stay in the sanitized source workflow.
    if (!(name === 'details' ? /^<details(?:\s+open(?:=(?:""|''|"open"|'open'|open))?)?\s*>$/i : /^<div\s*>$/i).test(start.tag)) continue;
    let bodyFrom = start.to, summary;
    if (name === 'details') {
      const header = /^\s*<summary>([^]*?)<\/summary>/i.exec(source.slice(bodyFrom, from));
      if (!header || /[\r\n<>]/.test(header[1])) continue;
      const summaryFrom = bodyFrom + header[0].indexOf('>') + 1;
      summary = { from: summaryFrom, to: summaryFrom + header[1].length, role: 'summary' };
      bodyFrom += header[0].length;
    }
    // Blank lines separate Markdown inside HTML in the reading renderer too.
    const inner = source.slice(bodyFrom, from);
    if (!/^\s*\n[ \t]*\n/.test(inner) || !/\n[ \t]*\n\s*$/.test(inner)) continue;
    const leading = /^[ \t]*\r?\n[ \t]*\r?\n/.exec(inner)?.[0].length || 0;
    const trailing = /\r?\n[ \t]*\r?\n[ \t]*$/.exec(inner)?.[0].length || 0;
    const contentFrom = bodyFrom + leading, contentTo = Math.max(contentFrom, from - trailing);
    result.push({ from: start.from, to, raw: source.slice(start.from, to), kind: name === 'details' ? 'details' : 'html-content',
      cells: [...(summary ? [summary] : []), { from: contentFrom, to: contentTo, role: 'body' }], block: true });
  }
  return result;
}

// Empty-caret comments are standalone only in root prose/headings. A table,
// code block, quote/list or HTML projection keeps its existing inline workflow.
export function insertCommentBlock(source, position, placeholder) {
  if (/<(?:div|details)\b/i.test(source) && structuredHtmlBlocks(source).some(item=>item.from<=position&&position<=item.to)) return null;
  const root=markdownParser.parse(source).topNode;
  for(let node=root.firstChild;node;node=node.nextSibling){
    if(position<node.from||position>node.to)continue;
    if(node.name!=='Paragraph'&&!/^(?:ATXHeading[1-6]|SetextHeading[12])$/.test(node.name))return null;
    for(let inner=root.resolveInner(position,-1);inner&&inner.name!=='Document';inner=inner.parent)
      if(['InlineCode','HTMLTag','Comment'].includes(inner.name))return null;
    return insertHtmlBlock(source,node.from,node.from,'comment',placeholder);
  }
  const from=position===0?0:source.lastIndexOf('\n',position-1)+1;
  return insertHtmlBlock(source,from,from,'comment',placeholder);
}

export function insertHtmlBlock(source, from, to, kind, placeholder, title = '') {
  const before = source.slice(0, from), after = source.slice(to);
  const prefix = !before || before.endsWith('\n\n') ? '' : before.endsWith('\n') ? '\n' : '\n\n';
  const suffix = !after || after.startsWith('\n\n') ? '' : after.startsWith('\n') ? '\n' : '\n\n';
  const content = source.slice(from, to) || placeholder;
  const opening = kind === 'comment' ? '<!-- ' : kind === 'details' ? `<details>\n<summary>${title}</summary>\n\n` : '<div>\n\n';
  const closing = kind === 'comment' ? ' -->' : `\n\n</${kind === 'details' ? 'details' : 'div'}>`;
  const insert = `${prefix}${opening}${content}${closing}${suffix}`;
  const anchor = from + prefix.length + (kind === 'details' ? '<details>\n<summary>'.length : opening.length);
  return { changes: { from, to, insert }, selection: { anchor, head: anchor + (kind === 'details' ? title.length : content.length) } };
}
