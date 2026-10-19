// Percentages describe the preview pane, independent of its physical side.
export function normalizeEditorPreviewWidth(value) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.max(12, Math.min(92, number)) : 47;
}

export function fitEditorSplit(preferred, totalWidth, dividerWidth = 7) {
  preferred = normalizeEditorPreviewWidth(preferred);
  const total = Number(totalWidth);
  if (!Number.isFinite(total) || total <= 0) return {percent:preferred, minimum:12, maximum:92};
  const divider = Math.min(total, Math.max(0, Number(dividerWidth) || 0));
  const available = total - divider;
  const previewMinimum = Math.min(180, available / 3);
  const editorMinimum = Math.min(360, available - previewMinimum);
  const maximum = Math.min(92, (available - editorMinimum) / total * 100);
  const minimum = Math.min(maximum, Math.max(12, previewMinimum / total * 100));
  return {percent:Math.max(minimum, Math.min(maximum, preferred)), minimum, maximum};
}
