import { Facet, StateEffect, StateField } from '@codemirror/state';
import { markdownImageDefinitions } from './portable-images.js';
import { prepareFootnotes } from './markdown-formats.js';

export const inheritedFootnotes = Facet.define({combine: values => values[0] ?? null});
export const footnoteBodyContext = Facet.define({combine: values => values.some(Boolean)});
export const updateFootnotes = StateEffect.define();
export const footnotesField = StateField.define({
  create(state) { const inherited=state.facet(inheritedFootnotes);return {inherited:inherited!==null,definitions:inherited ?? prepareFootnotes(state.doc.toString()).definitions}; },
  update(value,tr) {
    for(const effect of tr.effects)if(effect.is(updateFootnotes))return {inherited:true,definitions:effect.value};
    if(!tr.docChanged||value.inherited)return value;
    return {inherited:false,definitions:prepareFootnotes(tr.newDoc.toString()).definitions};
  }
});
export const footnotesFor = state => state.field(footnotesField,false)?.definitions;

// The authoritative Markdown document owns definitions (first declaration wins).
// Projected editors inherit the same immutable snapshot, never synthesize hidden
// Markdown lines or rewrite reference uses into direct URLs just for rendering.
export const inheritedImageDefinitions = Facet.define({ combine: values => values[0] ?? null });
export const updateImageDefinitions = StateEffect.define();
function sameDefinitions(a, b) {
  return a.size === b.size && [...a].every(([label, value]) => {
    const other = b.get(label);
    return other && other.ref === value.ref && other.title === value.title;
  });
}
export const imageDefinitionsField = StateField.define({
  create(state) {
    const inherited = state.facet(inheritedImageDefinitions);
    return { inherited: inherited !== null, definitions: inherited ?? markdownImageDefinitions(state.doc.toString()) };
  },
  update(value, tr) {
    for (const effect of tr.effects) if (effect.is(updateImageDefinitions)) return { inherited: true, definitions: effect.value };
    if (!tr.docChanged || value.inherited) return value;
    const definitions = markdownImageDefinitions(tr.newDoc.toString());
    return sameDefinitions(value.definitions, definitions) ? value : { inherited: false, definitions };
  }
});
export const imageDefinitionsFor = state => state.field(imageDefinitionsField, false)?.definitions;
