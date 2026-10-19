// A code editor contains literal code; its parent contains Markdown prefixes.
// Segment positions are in the parent's document, offsets in the inner editor.
export function codeProjection(source, pieces, emptyAt, prefix, node) {
  let text = '';
  const segments = pieces.map(piece => {
    const segment = {from:piece.from,to:piece.to,offset:text.length};
    text += source.slice(piece.from,piece.to);return segment;
  });
  const headers = [], openingLine = node ? source.lastIndexOf('\n', node.from - 1) + 1 : 0;
  for (let parent = node?.parent; parent; parent = parent.parent) {
    if (parent.name !== 'ListItem') continue;
    const mark = parent.getChild('ListMark');
    if (!mark) continue;
    const from = source.lastIndexOf('\n', mark.from - 1) + 1;
    if (from >= openingLine) continue; // The opening-line prefix already owns this marker.
    const end = source.indexOf('\n', mark.to);
    const rest = source.slice(mark.to, end), space = /^[\t ]*/.exec(rest)[0];
    const task = /^\[[ xX]\][\t ]*/.exec(rest.slice(space.length))?.[0] || '';
    headers.push({from,to:mark.to+space.length+task.length,markerTo:task?mark.to+space.length+task.trimEnd().length:mark.to,end});
  }
  headers.sort((a,b)=>a.from-b.from);
  return {text,prefix,segments,headers,from:pieces[0]?.from ?? emptyAt,to:pieces.at(-1)?.to ?? emptyAt};
}

export function indentedCodeProjection(source, node) {
  const start = source.lastIndexOf('\n', node.from - 1) + 1;
  let prefix = source.slice(start, node.from);
  // The first line may also open its list item. New lines retain indentation,
  // never repeat its bullet/number; tabs elsewhere remain byte-for-byte intact.
  for (let parent = node.parent; parent; parent = parent.parent) {
    const mark = parent.name === 'ListItem' && parent.getChild('ListMark');
    if (mark && mark.from >= start && mark.to <= node.from) prefix = prefix.slice(0, mark.from - start) + ' '.repeat(mark.to - mark.from) + prefix.slice(mark.to - start);
  }
  const pieces = [];
  for (let child = node.firstChild; child; child = child.nextSibling) if (child.name === 'CodeText') pieces.push({from:child.from,to:child.to});
  let end = node.to;
  // CommonMark excludes trailing blank lines from CodeBlock. Keep explicitly
  // indented blanks editable so Enter at the end does not destroy focus before
  // the next character is typed. Unindented paragraph separators stay outside.
  while (prefix && source[end] === '\n') {
    const next = source.indexOf('\n', end + 1), to = next < 0 ? source.length : next;
    const line = source.slice(end + 1, to);
    if (!line.startsWith(prefix) || line.slice(prefix.length).trim()) break;
    pieces.push({from:end,to:end+1}, {from:end+1+prefix.length,to});end=to;
  }
  return {to:end,projection:codeProjection(source,pieces,node.from,prefix,node)};
}
export function fieldPosition(range, offset) {
  const projection = range.projection;
  if (!projection) return range.from + offset;
  let segment;
  for (const candidate of projection.segments) { if (candidate.offset > offset) break; segment = candidate; }
  return segment ? Math.min(segment.to,segment.from+offset-segment.offset) : range.from;
}
export function fieldOffset(range, position) {
  if (!range.projection) return Math.max(0,Math.min(range.to-range.from,position-range.from));
  let offset=0;
  for (const segment of range.projection.segments) {
    if (position < segment.from) return offset;
    offset=segment.offset+Math.min(position,segment.to)-segment.from;
    if (position <= segment.to) return offset;
  }
  return offset;
}
export function fieldText(source, range) { return range.projection?.text ?? source.slice(range.from,range.to); }
export function fieldInsertion(range, text) { return range.projection ? text.replaceAll('\n','\n'+range.projection.prefix) : text; }
export function mapProjection(projection, map) {
  return projection && {...projection,from:map(projection.from),to:map(projection.to),segments:projection.segments.map(s=>({...s,from:map(s.from),to:map(s.to)})),headers:projection.headers?.map(h=>({from:map(h.from),to:map(h.to),markerTo:map(h.markerTo),end:map(h.end)}))};
}
// Compose two lossless projections: inner source positions are offsets in the
// outer text. Split at every hidden outer prefix instead of mapping just the
// endpoints, which would accidentally make indentation editable content.
export function composeProjections(inner, outer) {
  const segments=[];let cursor=0;
  for(const segment of inner.segments) {
    while(cursor<outer.segments.length-1 && outer.segments[cursor].offset+outer.segments[cursor].to-outer.segments[cursor].from<=segment.from)cursor++;
    for(let i=cursor;i<outer.segments.length;i++) {
      const parent=outer.segments[i],end=parent.offset+parent.to-parent.from;
      if(parent.offset>segment.to)break;
      const from=Math.max(segment.from,parent.offset),to=Math.min(segment.to,end);
      if(from<to || (segment.from===segment.to && from===to))segments.push({from:parent.from+from-parent.offset,to:parent.from+to-parent.offset,offset:segment.offset+from-segment.from});
    }
  }
  const map=position=>fieldPosition({from:outer.from,to:outer.to,projection:outer},position);
  return {...mapProjection(inner,map),text:inner.text,prefix:outer.prefix+inner.prefix,segments};
}
export function changedFieldPosition(range, innerChanges, sourceChanges, offset) {
  let result;
  innerChanges.iterChanges((from,_to,newFrom,newTo,text)=>{
    if (offset >= newFrom && offset <= newTo) result=sourceChanges.mapPos(fieldPosition(range,from),-1)+fieldInsertion(range,text.toString().slice(0,offset-newFrom)).length;
  });
  return result ?? sourceChanges.mapPos(fieldPosition(range,innerChanges.invertedDesc.mapPos(offset)));
}
