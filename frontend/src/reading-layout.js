export function sidebarStartsCollapsed(remembered) {
  return remembered === 'true';
}

// Align the rendered glyph to the caret's relative height in its own pane.
// Different toolbars/pane sizes must not bias the target toward the top.
export function alignedPreviewScroll({caret, editor, target, preview, scrollTop, scrollHeight, clientHeight}) {
  if (!caret || !editor || editor.height <= 0 || preview.height <= 0) return null;
  const center = (caret.top + caret.bottom) / 2;
  if (center < editor.top || center > editor.bottom) return null;
  const fraction = (center - editor.top) / editor.height;
  const inset = Math.min(24, preview.height / 2);
  const desired = Math.max(inset, Math.min(preview.height - inset, fraction * preview.height));
  // Large widgets have no individual glyph; use their leading edge.
  const actual = target.top + Math.min(target.height / 2, 12);
  return Math.max(0, Math.min(Math.max(0, scrollHeight - clientHeight), scrollTop + actual - preview.top - desired));
}
