import {StateEffect, StateField} from '@codemirror/state';
import {Decoration} from '@codemirror/view';
import {fieldOffset} from './projected-code.js';

// One spelling analysis in the authoritative Markdown document. Child editors
// only project its marks; they do not reinterpret code or load dictionaries.
export const setSpellingDecorations = StateEffect.define();
export const spellingDecorations = StateField.define({
  create: () => Decoration.none,
  update(value, tr) {
    let next = value.map(tr.changes);
    for (const effect of tr.effects) if (effect.is(setSpellingDecorations)) next = effect.value;
    return next;
  },
});

export function projectSpellingDecorations(marks, range) {
  const result = [];
  marks.between(range.from, range.to, (from, to, value) => {
    // A word crossing a field boundary is not a word owned by this field.
    if (from < range.from || to > range.to) return;
    const a = fieldOffset(range, from), b = fieldOffset(range, to);
    if (a < b) result.push(value.range(a,b));
  });
  return Decoration.set(result,true);
}
