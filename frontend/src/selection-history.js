import {EditorSelection,StateEffect} from '@codemirror/state';
import {invertedEffects} from '@codemirror/commands';

const restoreSelection = StateEffect.define({map(selection,changes){
  return EditorSelection.create(selection.ranges.map(range=>{
    const mapped=range.map(changes),from=Math.min(mapped.from,mapped.to),to=Math.max(mapped.from,mapped.to);
    return range.anchor>range.head?EditorSelection.range(to,from):EditorSelection.range(from,to);
  }),selection.mainIndex);
}});
// Use the public history inversion hook to retain the actual selection. The
// built-in fallback can invert inner ranges across whole-text replacements.
// Effects join the existing event, preserving typing/composition grouping.
export const selectionHistory = invertedEffects.of(tr=>tr.docChanged?[restoreSelection.of(tr.startState.selection)]:[]);

export function withSelectionHistory(transactions) {
  let previous;
  return transactions.map(tr=>{
    const selection=(tr.isUserEvent('undo')||tr.isUserEvent('redo'))
      ?tr.effects.filter(effect=>effect.is(restoreSelection)).at(-1)?.value:null;
    if(selection||previous&&previous!==tr.startState)tr=(previous||tr.startState).update({changes:tr.changes,
      selection:selection||tr.selection,effects:tr.effects,annotations:tr.annotations,scrollIntoView:tr.scrollIntoView,filter:false});
    previous=tr.state;return tr;
  });
}
