import {StateEffect, StateField} from '@codemirror/state';
import {Decoration, EditorView} from '@codemirror/view';
import {fieldOffset} from './projected-code.js';

// Root-source matches, not a second query evaluated against stripped cell text.
// This preserves anchors, word boundaries and lookarounds in nested editors.
export const updateProjectedSearch = StateEffect.define();
export const projectedSearchMatches = StateField.define({
  create: () => null,
  update(value, tr) {
    if (tr.docChanged && value !== null) value = [];
    for (const effect of tr.effects) if (effect.is(updateProjectedSearch)) value = effect.value;
    return value;
  },
  provide: field => EditorView.decorations.from(field, matches => Decoration.set((matches || []).filter(m => m.from < m.to).map(m =>
    Decoration.mark({class: m.selected ? 'cm-searchMatch cm-searchMatch-selected' : 'cm-searchMatch'}).range(m.from,m.to)), true)),
});

export function projectSearchMatches(matches, range) {
  const result = [];
  for (const match of matches) {
    if (match.from >= range.to || match.to <= range.from) continue;
    const from = fieldOffset(range, Math.max(match.from,range.from)), to = fieldOffset(range, Math.min(match.to,range.to));
    if (from < to) result.push({from,to,selected:!!match.selected});
  }
  return result;
}
export function sameSearchMatches(a,b) {
  return a !== null && a.length === b.length && a.every((m,i) => m.from===b[i].from && m.to===b[i].to && m.selected===b[i].selected);
}
