import {fitDiagram, constrainDiagram, zoomDiagram} from './diagram-viewer-geometry.js';
import './diagram-viewer.css';

const selector = '.mermaid-diagram[data-mermaid-rendered="true"], .echarts-diagram[data-echarts-rendered="true"]';
const messages = {
  'zh-CN': {open:'放大查看', title:'图表查看', minus:'缩小', plus:'放大', fit:'适应窗口', actual:'原始大小', close:'关闭',
    hint:'滚轮缩放 · 拖动平移 · ＋／－ 缩放 · 0 原始大小 · F 适应窗口 · Esc 关闭', error:'无法显示此图表，请关闭后重试。'},
  en: {open:'Enlarge chart', title:'Chart viewer', minus:'Zoom out', plus:'Zoom in', fit:'Fit to window', actual:'Actual size', close:'Close',
    hint:'Scroll to zoom · Drag to pan · +/− zoom · 0 actual size · F fit · Esc close', error:'Unable to display this chart. Close and try again.'},
};

// A passive SVG image is isolated from the original chart's DOM, identifiers,
// events and ECharts instance. Zoom/pan never alters document/export geometry.
export function diagramSnapshot(svg) {
  const box = svg.viewBox?.baseVal, bounds = svg.getBoundingClientRect();
  const width = box?.width || Number(svg.getAttribute('width')) || bounds.width;
  const height = box?.height || Number(svg.getAttribute('height')) || bounds.height;
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) return null;
  const clone = svg.cloneNode(true), style = getComputedStyle(svg);
  clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
  clone.setAttribute('width', String(width)); clone.setAttribute('height', String(height));
  if (!box?.width) clone.setAttribute('viewBox', `0 0 ${width} ${height}`);
  clone.style.width = `${width}px`; clone.style.height = `${height}px`; clone.style.maxWidth = 'none';
  clone.style.color = style.color; clone.style.fontFamily = style.fontFamily; clone.style.fontSize = style.fontSize;
  return {width, height, url: 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(new XMLSerializer().serializeToString(clone))};
}

export function createDiagramViewer({roots, language = () => 'zh-CN', canOpen = () => true}) {
  const text = () => messages[language()] || messages['zh-CN'];
  let dialog, stage, image, output, hint, buttons, active = null, drag = null, resizeObserver, sourceObserver;
  const inRoots = element => roots.some(root => root.contains(element));
  const viewport = () => ({width:stage.clientWidth, height:stage.clientHeight});
  const apply = () => {
    if (!active) return;
    active.transform = constrainDiagram(active.transform, active.size, viewport());
    const {x,y,scale} = active.transform;
    image.style.transform = `translate(${x}px, ${y}px) scale(${scale})`;
    output.value = `${Math.round(scale * 1000) / 10}%`;
    buttons.minus.disabled = scale <= Math.min(.1, fitDiagram(active.size, viewport())) + .000001;
    buttons.plus.disabled = scale >= 8;
  };
  const center = scale => {
    if (!active) return;
    const size = active.size, view = viewport();
    active.transform = {scale, x:(view.width-size.width*scale)/2, y:(view.height-size.height*scale)/2}; apply();
  };
  const fit = () => { if (active) {active.fitted = true;center(fitDiagram(active.size, viewport()));} };
  const actual = () => { if (active) {active.fitted = false;center(1);} };
  const zoom = (factor, anchor) => {
    if (!active) return;
    const view = viewport(); active.fitted = false;
    active.transform = zoomDiagram(active.transform, active.transform.scale * factor, anchor || {x:view.width/2,y:view.height/2}, active.size, view); apply();
  };
  const finish = () => {
    const trigger = active?.trigger;
    if (drag && stage.hasPointerCapture(drag.id)) stage.releasePointerCapture(drag.id);
    active = null; drag = null; resizeObserver?.disconnect(); sourceObserver?.disconnect();
    if (image) {image.onload = image.onerror = null; image.removeAttribute('src');}
    stage?.classList.remove('is-dragging');
    if (trigger?.isConnected) trigger.focus({preventScroll:true});
  };
  const close = () => { if (dialog?.open) dialog.close(); finish(); };
  const build = () => {
    dialog = document.createElement('dialog'); dialog.className = 'diagram-viewer'; dialog.id = 'diagramViewer';
    dialog.setAttribute('aria-labelledby','diagramViewerTitle');dialog.setAttribute('aria-describedby','diagramViewerHint');
    const header = document.createElement('header'); header.className = 'diagram-viewer-header';
    const title = document.createElement('h2'); title.id = 'diagramViewerTitle';header.append(title);
    const controls = document.createElement('div');controls.className = 'diagram-viewer-controls';buttons = {};
    for (const key of ['minus','plus','fit','actual','close']) {
      const button = document.createElement('button');button.type = 'button';button.dataset.viewerAction = key;buttons[key] = button;controls.append(button);
      if (key === 'minus') {output = document.createElement('output');output.setAttribute('aria-live','polite');controls.append(output);}
    }
    header.append(controls); stage = document.createElement('div');stage.className = 'diagram-viewer-stage';
    image = document.createElement('img');image.className = 'diagram-viewer-image';image.draggable = false;stage.append(image);
    hint = document.createElement('p');hint.id='diagramViewerHint';hint.className = 'diagram-viewer-hint';hint.setAttribute('role','status');
    dialog.append(header,stage,hint);document.body.append(dialog);
    buttons.minus.onclick=()=>zoom(1/1.25);buttons.plus.onclick=()=>zoom(1.25);buttons.fit.onclick=fit;buttons.actual.onclick=actual;buttons.close.onclick=close;
    dialog.addEventListener('close',()=>{if(!dialog.open)finish();});
    dialog.addEventListener('cancel',event=>{event.preventDefault();close();});
    dialog.addEventListener('click',event=>{if(event.target===dialog)close();});
    dialog.addEventListener('keydown',event=>{
      event.stopPropagation();if(event.isComposing)return;
      if(event.key==='Escape'){event.preventDefault();close();}
      else if(event.key==='+'||event.key==='='){event.preventDefault();zoom(1.25);}
      else if(event.key==='-'){event.preventDefault();zoom(1/1.25);}
      else if(event.key==='0'){event.preventDefault();actual();}
      else if(event.key.toLowerCase()==='f'){event.preventDefault();fit();}
      else if(active&&['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(event.key)){
        event.preventDefault();active.transform.x+=event.key==='ArrowLeft'?40:event.key==='ArrowRight'?-40:0;
        active.transform.y+=event.key==='ArrowUp'?40:event.key==='ArrowDown'?-40:0;apply();
      } else if(event.ctrlKey||event.metaKey)event.preventDefault();
    });
    stage.addEventListener('wheel',event=>{
      event.preventDefault();event.stopPropagation();const rect=stage.getBoundingClientRect();
      if(event.deltaY)zoom(Math.exp(-Math.sign(event.deltaY)*.15),{x:event.clientX-rect.left,y:event.clientY-rect.top});
    },{passive:false});
    stage.addEventListener('pointerdown',event=>{
      if(!active||event.button!==0)return;
      event.preventDefault();drag={id:event.pointerId,x:event.clientX,y:event.clientY,tx:active.transform.x,ty:active.transform.y};
      stage.setPointerCapture(event.pointerId);stage.classList.add('is-dragging');
    });
    stage.addEventListener('pointermove',event=>{
      if(!active||drag?.id!==event.pointerId)return;
      active.transform.x=drag.tx+event.clientX-drag.x;active.transform.y=drag.ty+event.clientY-drag.y;apply();
    });
    const end=()=>{drag=null;stage.classList.remove('is-dragging');};
    for(const type of ['pointerup','pointercancel','lostpointercapture'])stage.addEventListener(type,end);
  };
  const open = (element, trigger) => {
    if (!canOpen() || !inRoots(element) || !element.isConnected) return;
    const svg = element.querySelector('svg'); if (!svg) return;
    const snapshot = diagramSnapshot(svg); if (!snapshot) return;
    if (!dialog) build(); if (dialog.open) close();
    const labels = text();dialog.querySelector('h2').textContent=labels.title;hint.textContent=labels.hint;image.alt=labels.title;
    for(const key of Object.keys(buttons)){
      buttons[key].textContent=key==='minus'?'−':key==='plus'?'+':labels[key];buttons[key].setAttribute('aria-label',labels[key]);buttons[key].title=labels[key];
    }
    const record={element,trigger,size:{width:snapshot.width,height:snapshot.height},transform:{x:0,y:0,scale:1},fitted:true};active=record;
    image.style.width=`${snapshot.width}px`;image.style.height=`${snapshot.height}px`;
    image.onerror=()=>{if(active===record)hint.textContent=labels.error;};
    image.src=snapshot.url;dialog.showModal();fit();buttons.close.focus({preventScroll:true});
    resizeObserver=new ResizeObserver(()=>{if(active===record){if(active.fitted)fit();else apply();}});resizeObserver.observe(stage);
    sourceObserver=new MutationObserver(()=>{if(active===record&&!element.isConnected)close();});sourceObserver.observe(document.body,{childList:true,subtree:true});
  };
  const enhance = element => {
    if(!inRoots(element)||!element.matches(selector)||!element.querySelector('svg'))return;
    let button=element.querySelector(':scope > .diagram-view-button');
    if(!button){button=document.createElement('button');button.type='button';button.className='diagram-view-button';element.append(button);}
    if(button.textContent!==text().open)button.textContent=text().open;
    button.title=text().open;
  };
  const observer=new MutationObserver(records=>{
    const candidates=new Set();
    for(const record of records){
      if(record.target.nodeType===1){const parent=record.target.closest(selector);if(parent)candidates.add(parent);}
      for(const node of record.addedNodes)if(node.nodeType===1){if(node.matches(selector))candidates.add(node);node.querySelectorAll(selector).forEach(el=>candidates.add(el));}
    }
    candidates.forEach(enhance);
  });
  for(const root of roots){root.querySelectorAll(selector).forEach(enhance);observer.observe(root,{childList:true,subtree:true});}
  const pointer = event => {if(event.target.closest?.('.diagram-view-button')&&inRoots(event.target)){event.preventDefault();event.stopPropagation();}};
  const click = event => {
    const element=event.target.closest?.(selector);if(!element||!inRoots(element))return;
    const button=event.target.closest('.diagram-view-button');
    // Keep live-editor selection/double-click editing and ECharts legend/filter
    // interactions intact. Their explicit button opens the same viewer.
    if(!button&&(element.closest('.cm-diagram-card')||element.matches('.echarts-diagram')||event.target.closest('a,button')||!window.getSelection()?.isCollapsed))return;
    event.preventDefault();event.stopPropagation();open(element,button||element.querySelector('.diagram-view-button'));
  };
  document.addEventListener('pointerdown',pointer,true);document.addEventListener('click',click,true);
  return {open,close,destroy(){close();observer.disconnect();dialog?.remove();document.removeEventListener('pointerdown',pointer,true);document.removeEventListener('click',click,true);}};
}
