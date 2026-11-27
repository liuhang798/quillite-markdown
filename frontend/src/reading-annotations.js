import { annotationColors, annotationKey, captureAnchor, decodeAnnotations, findAnchor, maxAnnotations, maxQuote } from './reading-anchors.js';

const blocksSelector = 'p,li,h1,h2,h3,h4,h5,h6,.plain-text';
const excluded = 'pre,code,a,button,input,textarea,select,svg,math,img,br,video,audio,[hidden],[contenteditable=true],[data-dynamic-toc],.katex,.math-inline,.math-block,.mermaid-diagram,.echarts-diagram,.reference-new-badge';
const elementOf = node => node?.nodeType === 1 ? node : node?.parentElement;

// Lazily index paragraphs. A sentinel prevents a quote from crossing an
// excluded inline object (e.g. a formula) or a nested list item.
function documentBlocks(root) {
  return [...root.querySelectorAll(blocksSelector)].filter(el => !el.closest(excluded)).map(el => {
    let text, pieces;
    function index() {
      if (pieces) return;
      pieces=[]; text='';
      const walk = node => {
        if (node.nodeType===3) {
          if (node.length) { pieces.push({node,from:text.length,to:text.length+node.length}); text+=node.data; }
        } else if (node.nodeType===1) {
          if (node.matches(excluded+','+blocksSelector)) text+='\0';
          else for (const child of node.childNodes) walk(child);
        }
      };
      for (const child of el.childNodes) walk(child);
    }
    return {el,tag:el.tagName,get text(){index();return text;},get pieces(){index();return pieces;}};
  });
}

function domRange(b, at, n) {
  const start=b.pieces.find(p=>p.from<=at && at<p.to), end=b.pieces.find(p=>p.from<at+n && at+n<=p.to);
  if (!start || !end) return null;
  const r=document.createRange();
  r.setStart(start.node,at-start.from); r.setEnd(end.node,at+n-end.from); return r;
}

export function installReadingAnnotations({root,toc,view,panel,menu,current,t,notify,translate}) {
  const supported=!!(globalThis.CSS?.highlights && typeof Highlight==='function');
  let key='', revision='', snapshot=null, items=[], storageError=false;
  let ranges=[], orphans=[], target=null, relocating='', printing=false;
  // Ordinary saved documents have a native SHA revision. Unsaved previews
  // only receive a transient identity: never carry positional trust across sessions.
  let transient={};
  function version(doc) {
    if (!doc) return '';
    if (doc.revision) return doc.revision;
    if (transient.content!==doc.content || transient.session!==doc.session) transient={content:doc.content,session:doc.session,id:'preview:'+randomID()};
    return transient.id;
  }
  function randomID() {return [...crypto.getRandomValues(new Uint32Array(4))].join('-');}
  const localKey=doc=>annotationKey(doc?.path,document.documentElement.dataset.platform==='windows');
  const registryName=color=>'quillite-reading-'+color;
  function close() {menu.hidden=true; target=null;}
  function read() {
    try {snapshot=key?localStorage.getItem(key):null; items=decodeAnnotations(snapshot); storageError=false;}
    catch {items=[]; storageError=true;}
  }
  function write(next) {
    if (!key || localKey(current())!==key) {close();return;}
    let raw;
    try {
      if (storageError || localStorage.getItem(key)!==snapshot) throw new Error();
      raw=next.length?JSON.stringify(next):null;
      if (raw) localStorage.setItem(key,raw); else localStorage.removeItem(key);
    } catch {
      close(); read(); paint(); notify(t('annoStoreError'),'warning'); return;
    }
    items=next; snapshot=raw; relocating=''; close(); paint();
  }
  function syncDots() {
    const colors=new Map();
    for (const {el,item} of ranges) if (el.id && /^H[1-6]$/.test(el.tagName) && !colors.has(el.id)) colors.set(el.id,item.color);
    for (const link of toc.querySelectorAll(colors.size?'a[data-target]':'a[data-reading-dot]')) {
      const color=colors.get(link.dataset.target);
      if (color) link.dataset.readingDot=color; else delete link.dataset.readingDot;
    }
  }
  const button=(label,action)=>{
    const b=document.createElement('button'); b.type='button'; b.textContent=label; b.addEventListener('click',action); return b;
  };
  function orphanPanel() {
    panel.hidden=!orphans.length;
    const body=panel.querySelector('div'); body.replaceChildren();
    if (!orphans.length) {panel.open=false;relocating='';return;}
    panel.querySelector('summary').textContent=t('annoUnplaced',{count:orphans.length});
    for (const item of orphans) {
      const row=document.createElement('p'), label=document.createElement('span');
      label.textContent=item.quote; label.title=item.quote;
      row.append(label,button(t(relocating===item.id?'annoCancel':'annoRelocate'),()=>{
        relocating=relocating===item.id?'':item.id;
        if (relocating) notify(t('annoChoose'),'info');
        orphanPanel();
      }),button(t('annoRemove'),()=>write(items.filter(i=>i.id!==item.id))));
      body.append(row);
    }
  }
  function paint() {
    trackText(Boolean(key && supported && items.length));
    ranges=[]; orphans=[];
    if (supported) for (const c of annotationColors) CSS.highlights.delete(registryName(c));
    if (key && items.length && supported) {
      const blocks=documentBlocks(root), groups=new Map();
      for (const item of items) {
        const pos=findAnchor(blocks,item,revision);
        const block=pos && blocks[pos.block], range=block && domRange(block,pos.at,item.quote.length);
        if (!range) {orphans.push(item);continue;}
        ranges.push({el:block.el,at:pos.at,range,item});
        if (!groups.has(item.color)) groups.set(item.color,new Highlight());
        groups.get(item.color).add(range);
      }
      if (!printing) for (const [color,highlight] of groups) CSS.highlights.set(registryName(color),highlight);
    }
    syncDots(); orphanPanel();
  }
  function refresh() {
    const doc=current(), next=localKey(doc);
    if (next!==key) {key=next;relocating='';transient={};panel.open=false;read();}
    revision=version(doc);
    close(); paint();
  }
  function selected() {
    const sel=window.getSelection();
    if (!key || !sel?.rangeCount || sel.isCollapsed) return null;
    const range=sel.getRangeAt(0), start=elementOf(range.startContainer), end=elementOf(range.endContainer);
    const el=start?.closest(blocksSelector);
    if (!el || !root.contains(el) || el!==end?.closest(blocksSelector) || start.closest(excluded) || end.closest(excluded)) return null;
    const quote=range.toString();
    if (!quote.trim() || quote.length>maxQuote || (el.matches('.plain-text') && /[\r\n]/.test(quote))) return null;
    const blocks=documentBlocks(root), block=blocks.findIndex(b=>b.el===el);
    if (block<0) return null;
    for (const p of blocks[block].pieces) {
      if (!range.intersectsNode(p.node)) continue;
      const off=range.startContainer===p.node?range.startOffset:0;
      if (off===p.node.length) continue;
      const at=p.from+off, anchor=captureAnchor(blocks,block,at,quote,revision);
      if (!anchor) return null;
      const intersect=ranges.find(r=>r.el===el && r.at<at+quote.length && at<r.at+r.item.quote.length);
      if (intersect && !(intersect.at===at && intersect.item.quote===quote)) return {overlap:true};
      return {anchor,item:intersect?.item,range:range.cloneRange()};
    }
    return null;
  }
  function hit(e) {
    const el=elementOf(e.target)?.closest(blocksSelector);
    return el && ranges.find(r=>r.el===el && [...r.range.getClientRects()].some(b=>e.clientX>=b.left && e.clientX<=b.right && e.clientY>=b.top && e.clientY<=b.bottom));
  }
  function open(e,found,extra=null) {
    if (!found) return;
    e.preventDefault();e.stopPropagation();
    if (!supported || storageError || found.overlap) {notify(t(!supported?'annoUnsupported':storageError?'annoStoreError':'annoOverlap'),'warning');return;}
    target={...found,key,revision,session:current()?.session};
    menu.replaceChildren();
    const title=document.createElement('strong'); title.textContent=t('annoTitle'); menu.append(title);
    const hint=document.createElement('small'); hint.textContent=t('annoPrivate'); menu.append(hint);
    const controls=document.createElement('div'); controls.className='reading-mark-colors'; menu.append(controls);
    const action=fn=>()=>{
      const doc=current();
      if (!target || target.key!==localKey(doc) || target.revision!==version(doc) || target.session!==doc?.session || !root.contains(target.range.startContainer)) {close();return;}
      fn(target);
    };
    if (relocating && found.anchor && !found.item) {
      menu.append(button(t('annoPlace'),action(v=>write(items.map(i=>i.id===relocating?{...i,...v.anchor}:i)))));
    } else for (const color of annotationColors) {
      const b=button(t('anno_'+color),action(v=>{
        if (v.item) write(items.map(i=>i.id===v.item.id?{...i,color}:i));
        else if (items.length>=maxAnnotations) {close();notify(t('annoLimit',{count:maxAnnotations}),'warning');}
        else write([...items,{...v.anchor,id:randomID(),color}]);
        window.getSelection()?.removeAllRanges();
      }));
      b.dataset.color=color; b.setAttribute('aria-pressed',String(found.item?.color===color)); controls.append(b);
    }
    if (found.item) menu.append(button(t('annoRemove'),action(v=>write(items.filter(i=>i.id!==v.item.id)))));
    menu.append(button(t('copyAsPlainText'),action(async v=>{
      const text=v.item?.quote ?? v.anchor.quote; close();
      try {await navigator.clipboard.writeText(text);} catch {notify(t('clipboardCopyFailed'),'warning');}
    })));
    if(extra) menu.append(extra);
    position(e,found.range.getBoundingClientRect());
  }
  function position(e,origin) {
    menu.hidden=false;
    const rect=menu.getBoundingClientRect();
    const x=e.clientX || origin.left, y=e.clientY || origin.bottom;
    menu.style.left=Math.max(4,Math.min(x,innerWidth-rect.width-6))+'px';
    menu.style.top=Math.max(4,Math.min(y,innerHeight-rect.height-6))+'px';
    menu.querySelector('button')?.focus({preventScroll:true});
  }
  root.addEventListener('contextmenu',e=>{
    if (!current()) return;
    const sel=window.getSelection();
    if (sel && !sel.isCollapsed && sel.rangeCount && !sel.getRangeAt(0).intersectsNode(e.target)) return;
    const selectedRange=sel && !sel.isCollapsed && sel.rangeCount ? sel.getRangeAt(0) : null;
    if(selectedRange && (!root.contains(selectedRange.startContainer) || !root.contains(selectedRange.endContainer)))return;
    const range=selectedRange?.cloneRange(), session=current()?.session;
    const line=Number(elementOf(e.target)?.closest('[data-line]')?.dataset.line);
    const found=key && key===localKey(current()) && (range?selected():hit(e));
    const extra=translate && (range || (line && !elementOf(e.target)?.closest(excluded))) ? button(t(range?'rtSelection':'rtTranslateHere'),()=>{
      close();if(current()?.session===session && (!range || root.contains(range.startContainer)))translate(range,line);
    }) : null;
    if(extra && range)extra.title=t('rtSelectionHint');
    if(found && (!extra || (supported && !storageError && !found.overlap))) open(e,found,extra);
    else if(extra){e.preventDefault();e.stopPropagation();menu.replaceChildren(extra);position(e,e.target.getBoundingClientRect());}
  });
  root.addEventListener('click',e=>{
    if (!key || !window.getSelection()?.isCollapsed || e.ctrlKey || e.metaKey || e.shiftKey) return;
    open(e,hit(e));
  });
  document.addEventListener('pointerdown',e=>{if (!menu.contains(e.target)) close();},true);
  document.addEventListener('keydown',e=>{if(!menu.hidden && e.key==='Escape'){e.preventDefault();close();}},true);
  view.addEventListener('scroll',close,true);
  window.addEventListener('resize',close);
  window.addEventListener('beforeprint',()=>{printing=true;close();if(supported) for(const c of annotationColors) CSS.highlights.delete(registryName(c));});
  window.addEventListener('afterprint',()=>{printing=false;refresh();});
  window.addEventListener('storage',e=>{if(key && (e.key===key || e.key===null)){read();refresh();}});
  new MutationObserver(refresh).observe(root,{childList:true});
  // Search replaces text nodes in-place. Don't observe thousands of syntax
  // highlighting or chart mutations on documents without any private marks.
  const textObserver=new MutationObserver(changes=>{
    if (changes.some(m=>m.target!==root && !elementOf(m.target)?.closest(excluded))) refresh();
  });
  let trackingText=false;
  function trackText(on) {
    if (on===trackingText) return;
    trackingText=on;
    if (on) textObserver.observe(root,{childList:true,subtree:true,characterData:true});
    else textObserver.disconnect();
  }
  new MutationObserver(refresh).observe(view,{attributes:true,attributeFilter:['class']});
  new MutationObserver(syncDots).observe(toc,{childList:true});
  refresh();
}
