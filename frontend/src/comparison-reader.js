import {revealReaderLayout} from './reader-performance.js';

// Own only the secondary viewport. No editor, save, recovery or recent-file
// state belongs here. A generation also invalidates reads after a primary switch.
export function comparisonReader({read, primary, samePath, prepare, render, release, layout, warn, t, findDocumentLinkTarget}) {
  const get = id => document.getElementById(id);
  const pane = get('comparisonPane'), divider = get('comparisonDivider');
  const title = get('comparisonName'), status = get('comparisonStatus'), scroll = get('comparisonScroll');
  const main = get('comparisonPrimary'), workspace = pane.parentElement;
  const host = get('comparisonHost');
  let shadow, article, doc, disposeTranslation, generation = 0, right = 50, preferred = 50;
  const active = () => !pane.hidden;
  function mount() {
    if (!shadow) {
      // Isolate authored IDs (including SVG paint servers) and document styles
      // from the primary reader. Reuse the same bundled theme/KaTeX CSS.
      shadow = host.attachShadow({mode:'open'});
      for (const sheet of document.head.querySelectorAll('style, link[rel="stylesheet"]')) {
        shadow.append(sheet.cloneNode(true));
      }
    }
    const next = document.createElement('article');
    next.className = 'markdown-body';
    shadow.append(next);
    return next;
  }
  function show(on, restore = true) {
    if (on === active()) return;
    layout(() => {
      pane.hidden = divider.hidden = main.hidden = !on;
      workspace.classList.toggle('comparing',on);
      if (on) {width(preferred); resize.observe(workspace);} else resize.disconnect();
      const heading = main.querySelector('strong');
      heading.textContent = primary()?.name || '';
      heading.title = primary()?.path || '';
    },restore);
  }
  function drop() {
    if (disposeTranslation) { const dispose = disposeTranslation; disposeTranslation = null; dispose(); }
    if (article) {release(article); article.remove(); article = null;}
    doc = null;
  }
  function beginTranslation(label, dispose) {
    generation++; show(true); drop();
    disposeTranslation = dispose;
    article = mount();
    title.textContent = title.title = label;
    status.hidden = true; scroll.scrollTop = 0;
    return article;
  }
  function close(restore = true) {
    generation++;
    drop();
    status.hidden = true;
    title.textContent = title.title = '';
    show(false, restore);
  }
  function jump(fragment) {
    if (!fragment) { scroll.scrollTop = 0; return; }
    if (article) revealReaderLayout(article);
    const target = article && findDocumentLinkTarget(article,fragment);
    if (target) scroll.scrollTop += target.getBoundingClientRect().top - scroll.getBoundingClientRect().top - 12;
    else warn(t('compareAnchorMissing'));
  }
  async function open(path, fragment = '') {
    const owner = primary();
    if (!owner || !path || samePath(owner.path,path)) return;
    const id = ++generation;
    if (disposeTranslation) drop();
    let replacing = false;
    show(true);
    status.textContent = t('compareLoading'); status.hidden = false;
    const current = () => id === generation && samePath(owner.path, primary()?.path);
    try {
      const next = await read(path);
      if (!current()) return;
      if (!next?.path || samePath(next.path, owner.path)) throw Error('reference unavailable');
      const presentation = await prepare(next,current);
      if (!current()) return;
      // Keep the previous reference on a failed read. Do not carry its scroll,
      // video or resource callbacks across successful replacements.
      replacing = true; drop();
      article = mount(); doc = next;
      title.textContent = next.name; title.title = next.path;
      const work = render(article, next, {open, jump, viewport:scroll}, presentation);
      status.hidden = true;
      jump(fragment);
      await work;
    } catch {
      if (!current()) return;
      status.hidden = true;
      if (!doc || replacing) close();
      warn(t('compareOpenFailed'));
    }
  }
  function width(value) {
    preferred = Math.min(75, Math.max(25, value));
    const min = Math.min(50, Math.max(25,Math.ceil(22000 / Math.max(1,workspace.clientWidth))));
    right = Math.min(100-min, Math.max(min, preferred));
    workspace.style.setProperty('--comparison-width', right+'%');
    divider.setAttribute('aria-valuemin',String(min));
    divider.setAttribute('aria-valuemax',String(100-min));
    divider.setAttribute('aria-valuenow',String(Math.round(right)));
  }
  const resize = new ResizeObserver(()=>{if(active()) width(preferred);});
  divider.addEventListener('pointerdown',e=>{
    if (e.button !== 0 || !active()) return;
    e.preventDefault(); divider.focus(); divider.setPointerCapture(e.pointerId);
  });
  divider.addEventListener('pointermove',e=>{
    if (!divider.hasPointerCapture(e.pointerId) || !active()) return;
    const rect = workspace.getBoundingClientRect();
    if (rect.width) width(100*(rect.right-e.clientX)/rect.width);
  });
  divider.addEventListener('pointerup',e=>{if(divider.hasPointerCapture(e.pointerId)) divider.releasePointerCapture(e.pointerId);});
  divider.addEventListener('keydown',e=>{
    const value = {ArrowLeft:right+5,ArrowRight:right-5,Home:25,End:75}[e.key];
    if (typeof value === 'number') {e.preventDefault(); width(value);}
  });
  get('comparisonClose').addEventListener('click',()=>{
    close(); get('fileList').querySelector('.file-item.active, [data-path]')?.focus({preventScroll:true});
  });
  return {active,open,close,beginTranslation,translationActive:()=>!!disposeTranslation,content:()=>article};
}
