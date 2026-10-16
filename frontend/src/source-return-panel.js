import { Facet } from '@codemirror/state';
import { EditorView, ViewPlugin, showPanel } from '@codemirror/view';
import { resolveEditableOwner } from './editable-owner.js';

export const nestedSourcePanel = Facet.define({combine:values=>values.some(Boolean)});
const changed = 'quillite-source-view-changed';

export function sourceReturnScrollDelta(caret, viewport, margin = 12) {
  if(!caret||!viewport||viewport.bottom<=viewport.top)return 0;
  if(caret.bottom>viewport.bottom-margin)return caret.bottom-viewport.bottom+margin;
  if(caret.top<viewport.top+margin)return caret.top-viewport.top-margin;
  return 0;
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

// A presentation-only panel belongs to the root scroller, even when the source
// is open in a projected editor. Never store a document copy or an undo stack.
export function sourceReturnPanel(readSource, returnSource) {
  const panel = root => {
    const doc=root.dom.ownerDocument, dom=doc.createElement('div');
    dom.className='cm-live-source-panel';dom.hidden=true;
    const label=doc.createElement('span'),button=doc.createElement('button');
    button.type='button';button.onmousedown=event=>event.preventDefault();dom.append(label,button);
    let queued=false,alive=true,target=null;
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
      const wasHidden=dom.hidden;dom.hidden=!target;
      label.textContent=root.state.phrase('Editing block source');
      button.textContent=root.state.phrase('Return to rendered view');
      if(wasHidden!==dom.hidden)root.requestMeasure();
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
    return {dom,top:true,mount:schedule,update:schedule,destroy(){alive=false;sources.clear();root.dom.removeEventListener(changed,sourceChanged);root.dom.removeEventListener('focusin',schedule);}};
  };
  return [showPanel.compute([nestedSourcePanel],state=>state.facet(nestedSourcePanel)?null:panel),
    ViewPlugin.define(view=>{
      const signal=()=>queueMicrotask(()=>{if(!view.destroyed)view.dom.dispatchEvent(new view.dom.ownerDocument.defaultView.CustomEvent(changed,{bubbles:true,detail:view}));});
      signal();return {update(update){if(update.docChanged||update.selectionSet||update.transactions.some(tr=>tr.effects.length))signal();}};
    })];
}
