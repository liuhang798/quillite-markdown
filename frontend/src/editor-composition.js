import {EditorView} from '@codemirror/view';
import {StateEffect, StateField} from '@codemirror/state';

export const liveComposition = StateEffect.define();
const pendingStarts = new WeakMap();
export function stateComposing(state) {
  return !!pendingStarts.get(state)?.active || !!state.field(editorCompositionState, false);
}
export const editorCompositionState = StateField.define({
  create: () => false,
  update: (active, tr) => transactionComposing(tr, active),
});
export function transactionComposing(tr, fallback = false) {
  return tr.effects.reduce((value,effect)=>effect.is(liveComposition)?effect.value:value,stateComposing(tr.startState)||fallback);
}

// composing starts only after the first DOM change. compositionStarted and our
// commit-frame guard also cover the first phonetic key and final native input.
const sessions = new WeakMap();
export function editorComposing(view) {
  return !!view && (sessions.get(view)?.active || !!view.compositionStarted || !!view.composing);
}
export function editorHasComposition(view) {
  if (editorComposing(view)) return true;
  return [...(view?.dom?.querySelectorAll('.cm-editor') || [])].some(dom => editorComposing(EditorView.findFromDOM(dom)));
}
export function compositionSession(view, notify, schedule = requestAnimationFrame) {
  const session = {active:false, generation:0};
  let startState;
  const clearStart = () => {
    if (startState && pendingStarts.get(startState) === session) pendingStarts.delete(startState);
    startState = null;
  };
  sessions.set(view, session);
  return {
    start() {
      session.generation++; session.active = true;
      clearStart();
      // Do not dispatch here. Even a metadata-only view.update synchronizes
      // the native selection, replacing WebKit's newly established IME range.
      // The first native input transaction adopts this lease without redrawing
      // or touching selection during compositionstart.
      if (view.state) pendingStarts.set(startState = view.state, session);
    },
    end() {
      const generation = ++session.generation;
      schedule(() => {
        // A previous commit frame must never thaw a new candidate session.
        if (view.destroyed || sessions.get(view) !== session || generation !== session.generation || view.compositionStarted) return;
        session.active = false; clearStart(); notify(false);
      });
    },
    destroy() { session.generation++; clearStart(); if (sessions.get(view) === session) sessions.delete(view); },
  };
}
