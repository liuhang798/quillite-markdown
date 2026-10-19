import { Facet } from '@codemirror/state';

// A rendered editable container delegates its descendants to its inner editor.
// Keep scanned items in each field, but mount/measure each media widget once.
export const renderedContainerRanges = Facet.define({ combine: values => values.flat() });
// GFM cells cannot contain literal newlines. Media layout commands need an
// explicit context instead of having their separators silently flattened.
export const singleLineMedia = Facet.define({ combine: values => values.some(Boolean) });
export function mediaOwnedByInnerEditor(state, item) {
  return state.facet(renderedContainerRanges).some(range => range.from <= item.from && item.to <= range.to);
}
