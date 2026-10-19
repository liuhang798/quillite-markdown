import { markdownParser } from './markdown-parser.js';
import { EditorSelection } from '@codemirror/state';
import { TEXT_COLOR_VALUES, scanTextColorSpans } from './text-colors.js';
import { prepareFootnotes } from './markdown-formats.js';
import { footnoteProjection } from './footnote-editing.js';
import { fieldText, fieldOffset, fieldPosition } from './projected-code.js';
import { decodeHTML } from 'entities';
import { inlineCodeText } from './inline-code-syntax.js';
import { blockDropPrefix } from './block-drop-context.js';

// Plan all ranges against the same source. CodeMirror maps each returned
// selection through the other changes without dropping secondary cursors.
export function formatSelectionEdits(state, editRange) {
  const source = state.doc.toString(), ends = [];
  const planned = state.selection.ranges.map(range => editRange(source, range.from, range.to));
  if (planned.some(edit => edit?.codeRemoval)) {
    // Several selections may split the same code span. Build that span once,
    // against the original document, rather than overlapping replacements.
    const groups = new Map(), edits = [];
    planned.forEach((edit, index) => {
      if (!edit) return;
      if (!edit.codeRemoval) { edits.push({ ...edit, indices: [index] }); return; }
      const key = `${edit.from}:${edit.to}`;
      if (!groups.has(key)) groups.set(key, { span: edit.codeRemoval, cuts: [], indices: [] });
      const group = groups.get(key); group.cuts.push(edit.codeRemoval.cut); group.indices.push(index);
    });
    for (const group of groups.values()) edits.push({ ...splitCode(source, group.span, group.cuts), indices: group.indices });
    edits.sort((a,b)=>a.from-b.from);
    const changes = state.changes(edits.map(({from,to,insert})=>({from,to,insert})));
    const selections = state.selection.ranges.map((range,index) => {
      const edit = edits.find(edit=>edit.indices.includes(index));
      if (edit) {
        const offset = changes.mapPos(edit.from,-1)-edit.from;
        const selected = edit.selections?.[edit.indices.indexOf(index)] || edit;
        ends[index] = range.empty ? null : edit.selections ? selected.head+offset : changes.mapPos(edit.to,1);
        const anchor=selected.anchor+offset,head=selected.head+offset;
        return range.anchor>range.head ? EditorSelection.range(head,anchor) : EditorSelection.range(anchor,head);
      }
      ends[index]=null;
      const position=pos=>{
        const owner=edits.find(edit=>edit.mapPosition&&pos>=edit.from&&pos<=edit.to);
        return owner ? changes.mapPos(owner.from,-1)+owner.mapPosition(pos)-owner.from : changes.mapPos(pos);
      };
      return EditorSelection.range(position(range.anchor),position(range.head));
    });
    return {changes,selection:EditorSelection.create(selections,state.selection.mainIndex),formatEnds:ends};
  }
  let index = 0;
  const spec = state.changeByRange(range => {
    const edit = planned[index++];
    ends.push(edit && !range.empty ? edit.to : null);
    if (!edit) return { range };
    return { changes: { from: edit.from, to: edit.to, insert: edit.insert },
      range: range.anchor > range.head ? EditorSelection.range(edit.head, edit.anchor) : EditorSelection.range(edit.anchor, edit.head) };
  });
  return { ...spec, formatEnds: ends.map(end => end === null ? null : spec.changes.mapPos(end, 1)) };
}

export function textColorEdit(source, from, to, color, placeholder = '') {
  if (!TEXT_COLOR_VALUES.has(color)) return null;
  let text = source.slice(from, to);
  const full = text.match(/^<span data-md-color="([^"]+)">([\s\S]*)<\/span>$/);
  const isWholeSpan = fragment => scanTextColorSpans(fragment).some(span => span.from === 0 && span.to === fragment.length);
  if (full && TEXT_COLOR_VALUES.has(full[1]) && isWholeSpan(text)) text = full[2];
  else {
    const opening = source.slice(Math.max(0, from - 80), from).match(/<span data-md-color="([^"]+)">$/);
    if (opening && TEXT_COLOR_VALUES.has(opening[1]) && source.slice(to, to + 7) === '</span>'
        && isWholeSpan(source.slice(from - opening[0].length, to + 7))) { from -= opening[0].length; to += 7; }
    else if (color === 'default') return null;
  }
  text ||= color === 'default' ? '' : placeholder;
  const open = color === 'default' ? '' : `<span data-md-color="${color}">`;
  return { from, to, insert: open + text + (open ? '</span>' : ''), anchor: from + open.length, head: from + open.length + text.length };
}

const escapedAt = (source, at) => {
  let slashes = 0;
  while (at > 0 && source[--at] === '\\') slashes++;
  return slashes % 2 === 1;
};

// Leaving literal code must not turn punctuation into HTML, links or emphasis.
const codeAsProse = text => text.replace(/[!-/:-@\[-`{-~]/g,'\\$&');
function splitCode(source, span, cuts) {
  let insert='',cursor=span.bodyFrom;const selections=[],segments=[];
  const prefixAt=(from,text)=>{
    if(source[from-1]!=='\n')return '';
    if(span.footnote)return /^(?: {4}|\t)/.exec(text)?.[0]||'';
    return span.continuation&&text.startsWith(span.continuation)?span.continuation:'';
  };
  const proseText=(from,to)=>{
    let offset=0;
    return source.slice(from,to).split('\n').map(text=>{
      const prefix=prefixAt(from+offset,text);offset+=text.length+1;
      return prefix+codeAsProse(text.slice(prefix.length));
    }).join('\n');
  };
  const append=(from,to,plain)=>{
    if(from===to)return;
    const body=source.slice(from,to),code=plain?null:inlineCodeText(body,1,(offset,text)=>prefixAt(from+offset,text)),start=span.from+insert.length;
    insert+=plain?proseText(from,to):code.text;
    segments.push({from,to,start,plain,code});
  };
  for(const cut of cuts){
    append(cursor,cut.from,false);const anchor=span.from+insert.length;
    append(cut.from,cut.to,true);selections.push({anchor,head:span.from+insert.length});cursor=cut.to;
  }
  append(cursor,span.bodyTo,false);
  return {from:span.from,to:span.to,insert,anchor:selections[0].anchor,head:selections[0].head,selections,
    mapPosition(pos){const segment=segments.find(s=>pos>=s.from&&pos<=s.to);return segment?segment.start+(segment.plain?proseText(segment.from,pos).length:segment.code.position(pos-segment.from)):pos<=span.bodyFrom?span.from:span.from+insert.length;}};
}

// Return one replacement and an inner selection. Never round-trip document HTML.
// Recognize whole wrappers only: a partial word must not remove its neighbours' style.
export function inlineFormatEdit(source, from, to, before, after, placeholder = '', {rendered=false} = {}) {
  const selected = source.slice(from, to) || placeholder;
  const result = (start, end, text, open = '', close = '') => ({
    from: start, to: end, insert: open + text + close,
    anchor: start + open.length, head: start + open.length + text.length,
  });
  if((from!==to||rendered)&&before==='`'&&after==='`'){
    let removal=null, caretInCode=false;
    let parsed=source,parsedFrom=from,parsedTo=to,position=pos=>pos,footnote=false;
    // A Markdown footnote resembles a link definition to the base parser.
    // Inspect its actual prose projection, mapping only the result to source.
    if(source.includes('[^'))for(const definition of prepareFootnotes(source).definitions.values()){
      if(from<definition.bodyFrom||to>definition.to)continue;
      const projection=footnoteProjection(source,definition),field={from:projection.from,to:projection.to,projection};
      parsed=fieldText(source,field);parsedFrom=fieldOffset(field,from);parsedTo=fieldOffset(field,to);position=pos=>fieldPosition(field,pos);footnote=true;break;
    }
    markdownParser.parse(parsed).iterate({from:parsedFrom,to:parsedTo,enter(ref){
      if(ref.name!=='InlineCode')return;
      const node=ref.node,first=node.firstChild,last=node.lastChild;
      if(!first||!last||first===last||first.name!=='CodeMark'||last.name!=='CodeMark')return false;
      const raw=parsed.slice(first.to,last.from),pad=raw.startsWith(' ')&&raw.endsWith(' ')&&/[^ \n]/.test(raw)?1:0;
      if(rendered&&from===to&&parsedFrom>=first.to+pad&&parsedFrom<=last.from-pad){caretInCode=true;return false;}
      if(rendered&&parsedFrom>=node.from&&parsedTo<=node.to){
        const bodyFrom=position(first.to+pad),bodyTo=position(last.from-pad);
        const cut={from:Math.max(from,bodyFrom),to:Math.min(to,bodyTo)};
        if(cut.from<cut.to){
          const span={from:position(node.from),to:position(node.to),bodyFrom,bodyTo,cut,footnote,continuation:footnote?'':blockDropPrefix(source,position(node.from)+1)};
          removal={...splitCode(source,span,[cut]),codeRemoval:span};
        }
        return false;
      }
      if(parsedFrom>=node.from&&parsedTo<=node.to&&parsedFrom<=first.to+pad&&parsedTo>=last.from-pad){
        const body=source.slice(position(first.to+pad),position(last.from-pad));
        // Literal backticks/backslashes must not create a different code span
        // when this formatting is removed. Ordinary code text stays unchanged.
        removal=result(position(node.from),position(node.to),body.replace(/[\\`]/g,'\\$&'));
      }
      return false;
    }});
    // Already code, with no selected text: do not insert nested code markers
    // or a placeholder into the literal body. Other selections still apply.
    if(caretInCode)return null;
    if(removal)return removal;
  }
  if(before==='`'&&after==='`'){
    let body=selected;
    if(rendered){
      // In rendered prose these are already literal characters. Decode only
      // parser-confirmed escapes/entities, never arbitrary HTML or code text.
      const edits=[];
      markdownParser.parse(body).iterate({enter(ref){
        if(['InlineCode','FencedCode','CodeBlock','HTMLBlock'].includes(ref.name))return false;
        const raw=body.slice(ref.from,ref.to);
        if(ref.name==='Escape')edits.push({from:ref.from,to:ref.to,text:raw.slice(1)});
        else if(ref.name==='Entity')edits.push({from:ref.from,to:ref.to,text:decodeHTML(raw)});
      }});
      for(const edit of edits.reverse())body=body.slice(0,edit.from)+edit.text+body.slice(edit.to);
    }
    const continuation=body.includes('\n')?blockDropPrefix(source,from+1):'';
    const inFootnote=body.includes('\n')&&source.includes('[^')&&[...prepareFootnotes(source).definitions.values()].some(definition=>from>=definition.bodyFrom&&to<=definition.to);
    const code=inlineCodeText(body,1,(offset,text)=>offset?(inFootnote?/^(?: {4}|\t)/.exec(text)?.[0]||'':continuation&&text.startsWith(continuation)?continuation:''):'');
    return {from,to,insert:code.text,anchor:from+code.position(0),head:from+code.position(body.length)};
  }
  // Cross-style replacements use unambiguous HTML seams. Toolbar toggles
  // must treat those safe equivalents just like their Markdown counterparts.
  const aliases={'**':['strong'],'*':['em'],'***':['strong','em'],'~~':['del'],'==':['mark']};
  if(from!==to&&before===after&&aliases[before]){
    let start=from,end=to,body=source.slice(from,to),wrappers=[];
    const pattern=/^<(strong|em|del|mark|u|sup|sub|kbd)>([\s\S]*)<\/\1>$/i;
    // Adjacent hidden delimiters share one visual coordinate. A real mouse
    // selection may include only the closing (or opening) tag of its wrapper.
    // Complete that exact wrapper before toggling; never broaden visible text.
    let extended=true;
    while(extended){
      extended=false;
      const balance=tag=>[...body.matchAll(new RegExp(`<(/?)${tag}>`,'gi'))].reduce((n,m)=>n+(m[1]?-1:1),0);
      const open=source.slice(0,start).match(/<(strong|em|del|mark|u|sup|sub|kbd)>$/i);
      if(open&&!escapedAt(source,start-open[0].length)&&balance(open[1])<0){
        start-=open[0].length;body=open[0]+body;extended=true;
      }
      const close=source.slice(end).match(/^<\/(strong|em|del|mark|u|sup|sub|kbd)>/i);
      if(close&&balance(close[1])>0){body+=close[0];end+=close[0].length;extended=true;}
    }
    let match;
    while((match=body.match(pattern))&&!match[2].includes(`</${match[1]}>`)){
      wrappers.push(match[1].toLowerCase());body=match[2];
    }
    while(true){
      const opening=source.slice(0,start).match(/<(strong|em|del|mark|u|sup|sub|kbd)>$/i);
      if(!opening||escapedAt(source,start-opening[0].length))break;
      const close=`</${opening[1]}>`;
      if(source.slice(end,end+close.length).toLowerCase()!==close.toLowerCase())break;
      wrappers.unshift(opening[1].toLowerCase());start-=opening[0].length;end+=close.length;
    }
    if(aliases[before].some(tag=>wrappers.includes(tag))){
      const remove=aliases[before].every(tag=>wrappers.includes(tag));
      wrappers=remove?wrappers.filter(tag=>!aliases[before].includes(tag)):[...wrappers,...aliases[before].filter(tag=>!wrappers.includes(tag))];
      return result(start,end,body,wrappers.map(tag=>`<${tag}>`).join(''),[...wrappers].reverse().map(tag=>`</${tag}>`).join(''));
    }
  }
  if (from !== to && /^\*{1,3}$/.test(before) && before === after) {
    let start = from, end = to;
    while (start > 0 && /[*_]/.test(source[start - 1])) start--;
    while (end < source.length && /[*_]/.test(source[end])) end++;
    const fragment = source.slice(start, end);
    const paragraph = markdownParser.parse(fragment).topNode.firstChild;
    let node = paragraph?.name === 'Paragraph' && !paragraph.nextSibling ? paragraph.firstChild : null;
    let bold = false, italic = false, innerFrom = 0, innerTo = fragment.length;
    // Parser-confirmed nested emphasis avoids mistaking **bold** for italic.
    while (node && node.from === innerFrom && node.to === innerTo && ['StrongEmphasis', 'Emphasis'].includes(node.name)) {
      bold ||= node.name === 'StrongEmphasis';
      italic ||= node.name === 'Emphasis';
      innerFrom = node.firstChild.to;
      innerTo = node.lastChild.from;
      node = node.firstChild.nextSibling;
    }
    if ((bold || italic) && !escapedAt(source, start)
        && from <= start + innerFrom && to >= start + innerTo) {
      if (before.length === 1) italic = !italic;
      else if (before.length === 2) bold = !bold;
      else if (bold && italic) { bold = false; italic = false; }
      else { bold = true; italic = true; }
      const marker = '*'.repeat((bold ? 2 : 0) + (italic ? 1 : 0));
      return result(start, end, fragment.slice(innerFrom, innerTo), marker, marker);
    }
  } else if (from !== to) {
    // Do not peel a single backtick out of a longer code delimiter.
    const boundaryOK = (start, end) => !escapedAt(source, start)
      && (before !== '`' || (source[start - 1] !== '`' && source[end] !== '`'));
    if (selected.startsWith(before) && selected.endsWith(after)
        && selected.length > before.length + after.length && boundaryOK(from, to)
        && !selected.slice(before.length, -after.length).includes(after)
        && (before !== '`' || (selected[1] !== '`' && selected.at(-2) !== '`'))) {
      return result(from, to, selected.slice(before.length, -after.length));
    }
    const start = from - before.length, end = to + after.length;
    if (start >= 0 && source.slice(start, from) === before && source.slice(to, end) === after
        && boundaryOK(start, end)) return result(start, end, selected);
  }
  return result(from, to, selected, before, after);
}
