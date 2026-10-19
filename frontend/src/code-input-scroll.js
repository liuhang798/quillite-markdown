// Typing in a rendered code projection must not ask its own or an ancestor
// scroller to reveal the hidden Markdown range. Explicit navigation still can.
import {resolveEditableOwner} from './editable-owner.js';
export function codeInputScrollIntent(previous, transactions) {
  for (const tr of transactions) {
    if (tr.docChanged || tr.selection || tr.scrollIntoView || tr.effects.length) {
      previous = tr.isUserEvent('input') || tr.isUserEvent('delete') || tr.isUserEvent('select.pointer');
    }
  }
  return previous;
}

const holding = new WeakMap();
const nativeInput = new WeakMap();
export function captureNativeCodeInputScroll(event, view) {
  if (event.type!=='compositionstart'&&!event.isComposing && !/Composition/.test(event.inputType || '')) return;
  if(nativeInput.has(view))return;
  const root=resolveEditableOwner(view)?.view;
  if (!root || !view.hasFocus) return;
  const doc=root.dom.ownerDocument,win=doc.defaultView;
  const snapshot={root,top:root.scrollDOM.scrollTop,left:root.scrollDOM.scrollLeft,frame:0};
  const intents=['wheel','pointerdown','keydown','touchstart'];
  const finish=()=>{
    if(nativeInput.get(view)!==snapshot)return;
    nativeInput.delete(view);win.cancelAnimationFrame(snapshot.frame);
    root.scrollDOM.removeEventListener('scroll',restore);
    for(const type of intents)doc.removeEventListener(type,finish,true);
  };
  const restore=()=>{
    if(root.destroyed||view.destroyed||!view.hasFocus||resolveEditableOwner(view)?.view!==root){finish();return;}
    if(root.scrollDOM.scrollTop!==snapshot.top)root.scrollDOM.scrollTop=snapshot.top;
    if(root.scrollDOM.scrollLeft!==snapshot.left)root.scrollDOM.scrollLeft=snapshot.left;
  };
  Object.assign(snapshot,{finish,restore});nativeInput.set(view,snapshot);
  root.scrollDOM.addEventListener('scroll',restore);
  for(const type of intents)doc.addEventListener(type,finish,true);
  snapshot.frame=win.requestAnimationFrame(()=>{snapshot.frame=win.requestAnimationFrame(finish);});
}
export function clearNativeCodeInputScroll(view) { nativeInput.get(view)?.finish(); }
export function finishNativeCodeInputScroll(view) {
  const snapshot=nativeInput.get(view);
  if (!snapshot) return;
  // Native IME may reveal its caret after input dispatch. Scroll events run
  // before animation-frame painting: contain only this native input turn and
  // its commit frame, then release. A new user gesture cancels immediately.
  snapshot.restore();
}
export function handleCodeTextInput(event, view) {
  if (view.state.readOnly || view.composing || event.isComposing || !event.cancelable
    || event.inputType !== 'insertText' || typeof event.data !== 'string') return false;
  // Native contenteditable insertText can scroll an ancestor before the DOM
  // observer runs. Apply ordinary text through the same CM document/history.
  // Composition remains native; never cancel an IME replacement range.
  event.preventDefault();
  // Send an explicit target through the guard. Omitting it makes CodeMirror
  // apply its estimated-height scroll anchor instead of the held input target.
  view.dispatch({...view.state.replaceSelection(event.data), userEvent:'input.type', scrollIntoView:true});
  return true;
}
export function trackCodeInputScroll(view, transactions) {
  holding.set(view, codeInputScrollIntent(holding.get(view) || false, transactions));
}
export function setCodeInputScroll(view, value) { holding.set(view, value); }
export function holdsCodeInputScroll(view, options = {}) {
  return !!holding.get(view) && view.hasFocus && (!options.y || options.y === 'nearest')
    && (!options.x || options.x === 'nearest');
}
