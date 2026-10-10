// Return text only. A failed formula must remain readable, never become an
// empty export or an HTML injection through a decoded data attribute.
export function formulaFallbackSource(formula) {
  const visible = formula.querySelector('.katex-error')?.textContent || '';
  try { return decodeURIComponent(formula.dataset.mathSource || '') || visible; }
  catch { return visible; }
}
