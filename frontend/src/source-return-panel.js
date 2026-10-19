import { Facet } from '@codemirror/state';
import { EditorView, ViewPlugin } from '@codemirror/view';
import { resolveEditableOwner } from './editable-owner.js';

export const nestedSourcePanel = Facet.define({combine:values=>values.some(Boolean)});
const changed = 'quillite-source-view-changed';

export function sourceReturnScrollDelta(caret, viewport, margin = 12) {
  if(!caret||!viewport||viewport.bottom<=viewport.top)return 0;
  if(caret.bottom>viewport.bottom-margin)return caret.bottom-viewport.bottom+margin;
  if(caret.top<viewport.top+margin)return caret.top-viewport.top-margin;
  return 0;
}

// Pointer source toggles are presentation changes, not caret navigation.
// Keep the clicked block anchored while CodeMirror settles its new height.
export function preserveSourceBlockPosition(view, position, top, change) {
  const root=resolveEditableOwner(view)?.view;
  change();
  if(!root||root.destroyed||view.destroyed)return;
  const expectedDoc=root.state.doc,expectedSelection=root.state.selection,ownerDoc=view.state.doc;
  let cancelled=false;
  const events=['wheel','pointerdown','keydown','beforeinput','touchstart'];
  const finish=()=>{cancelled=true;for(const type of events)root.dom.removeEventListener(type,finish,true);};
  for(const type of events)root.dom.addEventListener(type,finish,true);
  const valid=()=>!cancelled&&!root.destroyed&&!view.destroyed&&root.dom.classList.contains('cm-live-preview')&&root.state.doc===expectedDoc&&view.state.doc===ownerDoc&&root.state.selection.eq(expectedSelection);
  const measure=attempt=>{
    if(!valid()){finish();return;}
    root.requestMeasure({
      read(){return valid()?view.documentTop+view.lineBlockAt(position).top-top:0;},
      write(delta){
        if(!valid()){finish();return;}
        if(Math.abs(delta)>.5)root.scrollDOM.scrollTop+=delta;
        if(attempt<3)root.dom.ownerDocument.defaultView.requestAnimationFrame(()=>measure(attempt+1));else finish();
      },
    });
  };
  queueMicrotask(()=>measure(0));
}

export function revealSourceReturnCaret(view) {
  const root=resolveEditableOwner(view)?.view;
  if(!root)return;
  const expectedDoc=root.state.doc,expectedSelection=root.state.selection;
  let cancelled=false;
  const finish=()=>{cancelled=true;for(const type of ['wheel','mousedown','keydown'])root.dom.removeEventListener(type,finish,true);};
  for(const type of ['wheel','mousedown','keydown'])root.dom.addEventListener(type,finish,true);
  const valid=()=>!cancelled&&!root.destroyed&&root.dom.classList.contains('cm-live-preview')&&root.state.doc===expectedDoc&&root.state.selection.eq(expectedSelection);
  const measure=attempt=>{
    if(!valid()){finish();return;}
    root.requestMeasure({
      read(){
        if(!valid())return 0;
        const inner=EditorView.findFromDOM(root.dom.ownerDocument.activeElement);
        if(!inner||resolveEditableOwner(inner)?.view!==root)return 0;
        const head=inner.state.selection.main.head,rect=inner.coordsAtPos(head),line=rect?null:inner.lineBlockAt(head);
        const caret=rect||{top:inner.documentTop+line.top,bottom:inner.documentTop+line.bottom};
        return sourceReturnScrollDelta(caret,root.scrollDOM.getBoundingClientRect());
      },
      write(delta){
        if(!valid()){finish();return;}
        if(delta)root.scrollDOM.scrollTop+=delta;
        // A newly restored widget may replace estimated heights in the next
        // frame. Reconcile a bounded number of frames, never after new input.
        if(attempt<3)root.dom.ownerDocument.defaultView.requestAnimationFrame(()=>measure(attempt+1));else finish();
      },
    });
  };
  queueMicrotask(()=>measure(0));
}

// A zero-layout overlay follows the active source block, including projected
// editors. Never insert a panel above the scroller: that moves the whole page.
export function sourceReturnPanel(readSource, returnSource) {
  const panel = root => {
    const doc=root.dom.ownerDocument, dom=doc.createElement('div');
    dom.className='cm-live-source-panel';dom.hidden=true;
    const button=doc.createElement('button');
    button.type='button';button.onmousedown=event=>event.preventDefault();dom.append(button);
    let queued=false,alive=true,target=null;
    let pointer=null,area=null;
    const hover=()=>dom.classList.toggle('is-source-hovered',!!pointer&&!!area&&pointer.x>=area.left&&pointer.x<=area.right&&pointer.y>=area.top&&pointer.y<=area.bottom);
    const move=event=>{pointer={x:event.clientX,y:event.clientY};hover();};
    const leave=()=>{pointer=null;hover();};
    const sources=new Set();
    const candidates=()=>{
      if(readSource(root))sources.add(root);else sources.delete(root);
      for(const view of sources)if(view.destroyed||!root.dom.contains(view.dom)||!readSource(view)||resolveEditableOwner(view)?.view!==root)sources.delete(view);
      return [...sources];
    };
    const sync=()=>{
      queued=false;if(!alive||root.destroyed)return;
      const views=candidates(),focused=EditorView.findFromDOM(doc.activeElement);
      target=views.find(view=>view===focused)||views.at(-1)||null;
      if(!target){dom.hidden=true;area=null;return;}
      button.textContent=root.state.phrase('Return to rendered view');
      const owner=target,expected=owner.state;
      root.requestMeasure({key:dom,
        read(){
          const item=readSource(owner);
          if(!alive||owner.destroyed||owner.state!==expected||!item)return null;
          const first=owner.lineBlockAt(item.from),last=owner.lineBlockAt(item.to);
          const rect=root.dom.getBoundingClientRect(),port=root.scrollDOM.getBoundingClientRect(),content=owner.contentDOM.getBoundingClientRect();
          const style=doc.defaultView.getComputedStyle(owner.contentDOM);
          const left=Math.max(port.left,content.left+parseFloat(style.paddingLeft||0));
          const right=Math.min(port.right,content.right-parseFloat(style.paddingRight||0));
          const top=owner.documentTop+first.top,bottom=owner.documentTop+last.bottom;
          if(bottom<=port.top||top>=port.bottom||right<=left)return null;
          // For a long block the action follows its visible top, but never
          // occupies layout space or floats outside this block's viewport.
          const y=Math.max(port.top+3,top-27);
          if(y+24>Math.min(port.bottom,bottom))return null;
          return {left,right,top:y,bottom:Math.min(port.bottom,bottom),x:right-rect.left-4,y:y-rect.top};
        },
        write(position){
          if(!alive||owner!==target||owner.destroyed||owner.state!==expected)return;
          area=position;dom.hidden=!position;
          if(position){dom.style.left=position.x+'px';dom.style.top=position.y+'px';}
          hover();
        },
      });
    };
    const schedule=()=>{if(!queued&&alive){queued=true;queueMicrotask(sync);}};
    button.onclick=()=>{
      // Resolve current source state again. A document switch or projection
      // rebuild between pointer-down and click cannot edit a stale owner.
      if(target&&candidates().includes(target))returnSource(target);
      schedule();
    };
    const sourceChanged=event=>{
      const view=event.detail;
      if(view instanceof EditorView&&root.dom.contains(view.dom)){
        if(readSource(view))sources.add(view);else sources.delete(view);
        schedule();
      }
    };
    root.dom.addEventListener(changed,sourceChanged);
    root.dom.addEventListener('focusin',schedule);
    root.dom.addEventListener('pointermove',move);
    root.dom.addEventListener('pointerleave',leave);
    root.dom.addEventListener('scroll',schedule,true);
    root.dom.append(dom);schedule();
    return {update:schedule,destroy(){alive=false;sources.clear();dom.remove();root.dom.removeEventListener(changed,sourceChanged);root.dom.removeEventListener('focusin',schedule);root.dom.removeEventListener('pointermove',move);root.dom.removeEventListener('pointerleave',leave);root.dom.removeEventListener('scroll',schedule,true);}};
  };
  return [ViewPlugin.define(view=>view.state.facet(nestedSourcePanel)?{}:panel(view)),
    ViewPlugin.define(view=>{
      const signal=()=>queueMicrotask(()=>{if(!view.destroyed)view.dom.dispatchEvent(new view.dom.ownerDocument.defaultView.CustomEvent(changed,{bubbles:true,detail:view}));});
      signal();return {update(update){if(update.docChanged||update.selectionSet||update.transactions.some(tr=>tr.effects.length))signal();}};
    })];
}
