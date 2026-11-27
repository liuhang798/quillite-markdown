import { markdownParser } from './markdown-parser.js';
import { frontmatterRange } from './frontmatter.js';
import { detectAISensitiveContent } from './ai-privacy.js';
import { escapedAt, isInlineDollarOpen, isInlineDollarClose } from './math-delimiters.js';
import { scanMarkdownFormulas } from './formula-editing.js';
import { prepareFootnotes } from './markdown-formats.js';

// Return offsets into the original string. Never let a model reconstruct a
// document: only the explicitly identified prose slots can be replaced.
export function translationPlan(source) {
  if (source.length > 2_000_000) throw Error('TRANSLATION_TOO_LARGE');
  if(source.includes('\r')){
    // Lezer consumes LF lines. Project offsets back to the original bytes
    // instead of rewriting CRLF tables, fences or attachments on export.
    const extra=[];let n=0;
    const lf=source.replace(/\r\n?/g,(s,i)=>{if(s.length===2){extra.push(i-n);n++;}return '\n';});
    const orig=pos=>{let a=0,b=extra.length;while(a<b){const m=(a+b)>>1;if(extra[m]<pos)a=m+1;else b=m;}return pos+a;};
    return translationPlan(lf).map(s=>{
      const from=orig(s.from);
      return {...s,from,raw:source.slice(from,orig(s.from+s.raw.length)),
        ...(s.lastNoteEnd!=null?{lastNoteEnd:orig(s.from+s.lastNoteEnd)-from}:{}),
        parts:s.parts.map(p=>({...p,from:orig(s.from+p.from)-from,to:orig(s.from+p.to)-from}))};
    });
  }
  const protectedRanges = [], codeRanges=[], headings = [], prose = [], referenceExclusions=[];
  const opaqueBlock=(from,to)=>{protect(from,to);referenceExclusions.push({from,to});};
  const protect = (from,to) => protectedRanges.push({from,to});
  const fm = frontmatterRange(source);
  if (fm) opaqueBlock(0,fm.to);
  // Markdown's HTML block can end at a blank line inside SVG/HTML.
  for (const m of source.matchAll(/(?:https?:\/\/|mailto:|data:|www\.)[^\s<>]+|\[\^[^\]\r\n]+\]/gi)) protect(m.index,m.index+m[0].length);
  // Run the privacy detector per slot below (outside opaque blocks), not over
  // an entire document containing code samples or base64.
  const slots = /^(Paragraph|ATXHeading[1-6]|SetextHeading[12]|TableCell|Task|Emphasis|StrongEmphasis|Strikethrough)$/;
  const containers = /^(Document|Blockquote|BulletList|OrderedList|ListItem|Table|TableHeader|TableRow)$/;
  function visit(node,depth=0) {
    if(depth>96) return;
    if (/^(ATX|Setext)Heading/.test(node.name) && node.parent?.name==='Document' && node.from >= (fm?.to || 0)) headings.push(node);
    if (!slots.test(node.name) && !containers.test(node.name)) {
      if (/^(InlineCode|FencedCode|CodeBlock)$/.test(node.name)) codeRanges.push({from:node.from,to:node.to});
      if (/^(InlineCode|FencedCode|CodeBlock|HTMLBlock|HTMLTag|LinkReference|Image|Autolink)$/.test(node.name)) protect(node.from,node.to);
      return;
    }
    let pos=node.from;
    for (let c=node.firstChild;c;c=c.nextSibling) {
      if(slots.test(node.name) && c.from>pos) prose.push({from:pos,to:c.from});
      // Translate explicit link text only; never change a reference lookup key.
      if(c.name==='Link') {
        const end=c.firstChild?.nextSibling;
        const raw=source.slice(c.from,c.to), label=/^\[([^\][\x60\\$*_\r\n]+)\]\((?:.|\n)*\)$/.exec(raw);
        if(label && end) prose.push({from:c.from+1,to:c.from+1+label[1].length});
        protect(label ? c.from+1+label[1].length : c.from,c.to);
      } else visit(c,depth+1);
      pos=c.to;
    }
    if(slots.test(node.name) && node.to>pos) prose.push({from:pos,to:node.to});
  }
  const tree=markdownParser.parse(source);
  visit(tree.topNode);
  const islands = /<(svg|math|pre|script|style|video|audio)\b[^>]*>|<!--/gi;
  let cidx=0;
  for (let m; (m=islands.exec(source));) {
    while(cidx<codeRanges.length && codeRanges[cidx].to<=m.index)cidx++;
    if(codeRanges[cidx]?.from<=m.index){islands.lastIndex=codeRanges[cidx].to;continue;}
    const close = m[1] ? new RegExp('</'+m[1]+'\\s*>','ig') : /-->/g;
    close.lastIndex = islands.lastIndex;
    const end = /\/>$/.test(m[0]) ? islands.lastIndex : close.exec(source) ? close.lastIndex : source.length;
    opaqueBlock(m.index,end); islands.lastIndex=end;
  }
  // Scan math outside opaque runs so an unmatched dollar inside code cannot
  // consume following prose. Cross-node math (e.g. x_i) remains one island.
  function merged(items) {
    const out=[];
    for(const item of items.sort((a,b)=>a.from-b.from || b.to-a.to)){
      const last=out.at(-1);
      if(last && item.from<=last.to) last.to=Math.max(last.to,item.to); else out.push({...item});
    }
    return out;
  }
  // Use the reading lexer's actual spans first (including adjacent formulas,
  // table cells and TeX containing URLs). Never send on a lexer budget error.
  // The conservative pass below covers additional/unclosed technical markup.
  const formulaRanges=scanMarkdownFormulas(source,{strict:true});
  for(const {from,to} of formulaRanges) opaqueBlock(from,to);
  const opaque=merged(protectedRanges);
  const marks=/\\[()[\]]|\${1,2}/g;
  let open=null, oi=0, lineEnd=-1;
  for(let m;(m=marks.exec(source));) {
    while(oi<opaque.length && opaque[oi].to<=m.index) oi++;
    if(oi<opaque.length && opaque[oi].from<=m.index) {marks.lastIndex=opaque[oi].to; continue;}
    const token=m[0];
    if(escapedAt(source,m.index)) continue;
    if(lineEnd<m.index) {
      if(open?.end==='$') open=null;
      const next=source.indexOf('\n',m.index); lineEnd=next<0?source.length:next;
    }
    if(open?.end===token && (token!=='$' || isInlineDollarClose(source,m.index))) {
      opaqueBlock(open.from,marks.lastIndex);open=null;continue;
    }
    if((!open || open.end==='$') && (token==='$$' || token==='\\(' || token==='\\[' || isInlineDollarOpen(source,m.index)))
      open={from:m.index,end:({'\\(':'\\)','\\[':'\\]'})[token] || token};
  }
  if(open && open.end!=='$') opaqueBlock(open.from,source.length);
  const noteEnds=[];
  const footnotes=source.includes('[^') && source.includes(']:') ? prepareFootnotes(source,null,{formulaRanges,
    onDefinition({from,to}){
      // Keep the complete definition local, including its colon, blank lines
      // and indentation. Prose replacement must not turn it into a reference.
      opaqueBlock(from,to);noteEnds.push({from,to});
    }
  }) : null;
  const skip=merged(protectedRanges);
  const lineEnds=[]; for(let i=source.indexOf('\n');i!==-1;i=source.indexOf('\n',i+1)) lineEnds.push(i);
  const lineAt=pos=>{let lo=0,hi=lineEnds.length;while(lo<hi){const mid=(lo+hi)>>1;if(lineEnds[mid]<pos)lo=mid+1;else hi=mid;}return lo+1;};
  // Preserve even a heading-less introduction or a metadata-only preamble.
  const starts=[{at:0,title:''}];
  let si=0;
  for(const h of headings) {
    while(si<skip.length && skip[si].to<=h.from) si++;
    if(skip[si]?.from<=h.from) continue;
    const title=source.slice(h.from,Math.min(h.to,h.from+160)).split(/\r?\n/)[0].replace(/^#+\s*|\s+#+$/g,'').trim();
    if(h.from===0) starts[0].title=title; else starts.push({at:h.from,title});
  }
  const sections=starts.map(({at,title},i)=>({title,line:lineAt(at),from:at,raw:source.slice(at,starts[i+1]?.at ?? source.length),parts:[]}));
  if(sections.length>1 && source.includes(']:')) indexChapterReferences(source,tree,sections,merged(referenceExclusions));
  if(sections.length>1 && footnotes){
    const sectionAt=pos=>{
      let lo=0,hi=sections.length;
      while(lo+1<hi){const mid=(lo+hi)>>>1;if(sections[mid].from<=pos)lo=mid;else hi=mid;}
      return sections[lo];
    };
    for(const {from,to} of noteEnds){
      const s=sectionAt(from);s.lastNoteEnd=to-s.from;
    }
    for(const {from,to,label,text,number} of footnotes.definitions.values()){
      const note={label,number,raw:source.slice(from,to)};
      if(text.includes('[')){
        // Note continuations are de-indented by the reading parser. A copied
        // note can itself depend on an image/link defined in another chapter.
        const refs={from:0};
        indexChapterReferences(text,markdownParser.parse(text),[refs],scanMarkdownFormulas(text));
        if(refs.refUses)note.refUses=refs.refUses;
      }
      (sectionAt(from).noteDefs??=[]).push(note);
    }
    const uses=new Map();
    for(const {from,label} of footnotes.references){
      const s=sectionAt(from);
      if(!uses.has(s))uses.set(s,new Set());
      uses.get(s).add(label);
    }
    for(const [s,labels] of uses)s.noteUses=[...labels];
  }
  let ri=0,ci=0;
  function slot(from,to) {
    while(ci+1<sections.length && sections[ci+1].from<=from) ci++;
    const section=sections[ci];
    for(const row of source.slice(from,to).matchAll(/[^\r\n]+/g)){
      const text=row[0], privateSpans=detectAISensitiveContent(text);
      let index=0;
      function add(a,b) {
        while(a<b) {
          let end=Math.min(a+2400,b);
          if(end<b){const space=text.lastIndexOf(' ',end);if(space>a+1000)end=space;else if(/[\uD800-\uDBFF]/.test(text[end-1]))end--;}
          const chunk=text.slice(a,end), trimmed=chunk.trim();
          if(/\p{L}/u.test(trimmed)){
            const pos=from+row.index+a+chunk.length-chunk.trimStart().length-section.from;
            section.parts.push({from:pos,to:pos+trimmed.length,text:trimmed});
          }
          a=end;
        }
      }
      for(const p of privateSpans){add(index,p.start);index=p.end;}
      add(index,text.length);
    }
  }
  for(const span of prose.sort((a,b)=>a.from-b.from)){
    let p=span.from;while(ri<skip.length && skip[ri].to<=p) ri++;
    for(let i=ri;i<skip.length && skip[i].from<span.to;i++){
      if(p<skip[i].from)slot(p,skip[i].from);
      p=Math.max(p,skip[i].to);if(p>=span.to)break;
    }
    if(p<span.to)slot(p,span.to);
  }
  return sections;
}

// Index labels in document order in the worker. Keep one copy of each raw
// definition; do not multiply a large definition by the number of chapters.
function indexChapterReferences(source,tree,sections,excluded) {
  const key=s=>s.trim().replace(/\s+/g,' ').toLowerCase();
  const uses=sections.map(()=>new Set());
  let i=0,skip=0;
  tree.iterate({enter(n){
    while(skip<excluded.length && excluded[skip].to<=n.from) skip++;
    if(excluded[skip]?.from<=n.from && n.to<=excluded[skip].to) return false;
    if(n.name!=='LinkReference' && n.name!=='Link' && n.name!=='Image') return;
    while(i+1<sections.length && sections[i+1].from<=n.from)i++;
    const node=n.node, label=node.getChild('LinkLabel');
    if(n.name==='LinkReference'){
      if(!label || !node.getChild('URL'))return false;
      const name=key(source.slice(label.from+1,label.to-1));
      if(name.startsWith('^'))return false;
      let raw=source.slice(n.from,n.to);
      // Continuation lines in a block quote carry outer Markdown prefixes.
      for(let p=node.parent;p;p=p.parent) if(p.name==='Blockquote') raw=raw.replace(/\n {0,3}>[ \t]?/g,'\n');
      (sections[i].refDefs??=[]).push({name,raw});
      return false;
    }
    const marks=node.getChildren('LinkMark');
    if(marks.length===2){
      const text=label && source.slice(label.from+1,label.to-1);
      uses[i].add(key(text || source.slice(marks[0].to,marks[1].from)));
    }
    // A link can contain a reference image; keep visiting children.
  }});
  uses.forEach((set,i)=>{if(set.size) sections[i].refUses=[...set];});
}

export function standaloneTranslationSection(sections,index) {
  const section=sections[index], wanted=new Set(section.refUses);
  const wantedNotes=new Set(section.noteUses);
  if(!wanted.size && !wantedNotes.size && !section.noteDefs?.length)return section;
  const definitions=[],notes=[];
  const newline=/\r\n|\r|\n/.exec(section.raw)?.[0] || '\n';
  for(const s of sections)for(const def of s.noteDefs || []){
    const used=wantedNotes.delete(def.label);
    if(s!==section && !used)continue;
    for(const key of def.refUses || [])wanted.add(key);
    if(s!==section)notes.push(def.raw.replace(/\n/g,newline));
  }
  for(const s of sections)for(const def of s.refDefs || []){
    if(!wanted.delete(def.name) || s===section)continue;
    definitions.push(def.raw.replace(/\n/g,newline));
  }
  if(!definitions.length && !notes.length)return section;
  // Put definitions before body blocks: an unclosed fence at EOF would
  // swallow appended definitions, and a duplicate local label must not win.
  // Keep any original BOM / YAML envelope at byte zero.
  const yaml=frontmatterRange(section.raw);
  const at=yaml ? yaml.to+(section.raw[yaml.to]==='\n'?1:0) : (section.raw.startsWith('\uFEFF')?1:0);
  const gap=newline+newline, edits=[];
  // CommonMark reference links are first-wins, but reading footnotes are
  // last-wins. Put imported notes after any local shadow, before an EOF fence.
  const noteAt=section.lastNoteEnd??at;
  const first=noteAt===at?definitions.concat(notes):definitions;
  if(first.length)edits.push({at,text:(yaml?newline:'')+first.join(newline)+gap});
  if(notes.length && noteAt!==at)edits.push({at:noteAt,text:gap+notes.join(gap)+gap});
  let raw=section.raw;
  for(let i=edits.length-1;i>=0;i--){const e=edits[i];raw=raw.slice(0,e.at)+e.text+raw.slice(e.at);}
  return {...section,raw,parts:section.parts.map(p=>{
    const shift=edits.reduce((n,e)=>n+(p.from>=e.at?e.text.length:0),0);
    return {...p,from:p.from+shift,to:p.to+shift};
  })};
}

export function translatedMarkdown(section,values) {
  if(values.length!==section.parts.length) throw Error('TRANSLATION_INCOMPLETE');
  let cursor=0;const out=[];
  section.parts.forEach(({from,to,text},i)=>{
    const s=values[i]; if(typeof s!=='string' || !s.trim() || /[\r\n\0]/.test(s)) throw Error('TRANSLATION_RESULT_INVALID');
    const safe=s===text ? text : s.replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replace(/[\\\x60*_{}[\]()#+.!|~$=-]/g,'\\$&');
    out.push(section.raw.slice(cursor,from),safe);cursor=to;
  });
  out.push(section.raw.slice(cursor));return out.join('');
}
