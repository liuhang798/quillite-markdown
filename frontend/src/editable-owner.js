import { Annotation } from '@codemirror/state';
import { fieldPosition } from './projected-code.js';

// Inner editors are projections of the main document, never history owners.
export const editableProjectionSync = Annotation.define();
export const editableForwardedChange = Annotation.define();
const parents = new WeakMap();

export function registerEditableOwner(inner, parent, range, valid) {
  parents.set(inner, { parent, range, valid });
  return () => parents.delete(inner);
}

export function resolveEditableOwner(view, range = view.state.selection.main, includePrefix = false) {
  let { from, to } = range;
  let projectionPrefix='';
  const visited = new Set();
  while (view) {
    if (visited.has(view) || view.destroyed || view.state.readOnly || !Number.isInteger(from) || !Number.isInteger(to)
      || from < 0 || to < from || to > view.state.doc.length) return null;
    visited.add(view);
    const link = parents.get(view);
    if (!link) return { view, from, to, ...(includePrefix?{projectionPrefix}:{}) };
    if (!link.valid()) return null;
    const target = link.range();
    if (!target || (target.projection?.text.length ?? target.to - target.from) !== view.state.doc.length) return null;
    projectionPrefix=(target.projection?.prefix || '')+projectionPrefix;
    from = fieldPosition(target,from); to = fieldPosition(target,to); view = link.parent;
  }
  return null;
}
