import {EditorView} from '@codemirror/view';
import {StateEffect, StateField} from '@codemirror/state';

export const liveComposition = StateEffect.define();
export const editorCompositionState = StateField.define({
  create: () => false,
  update: (active, tr) => tr.effects.reduce((value,effect)=>effect.is(liveComposition)?effect.value:value,active),
});
export function transactionComposing(tr) {
  return tr.effects.reduce((value,effect)=>effect.is(liveComposition)?effect.value:value,tr.startState.field(editorCompositionState,false)||false);
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
  sessions.set(view, session);
  return {
    start() { session.generation++; session.active = true; notify(true); },
    end() {
      const generation = ++session.generation;
      schedule(() => {
        // A previous commit frame must never thaw a new candidate session.
        if (view.destroyed || sessions.get(view) !== session || generation !== session.generation || view.compositionStarted) return;
        session.active = false; notify(false);
      });
    },
    destroy() { session.generation++; if (sessions.get(view) === session) sessions.delete(view); },
  };
}
