// Bound the interactive parser independently of the document renderer.
export function canLoadVisualFormula(source) {
  const value = String(source);
  if (value.length > 8192
    || /\\(?:href|url|html\w*|class|cssId|style|includegraphics|def|gdef|newcommand|renewcommand)\b/.test(value)) return false;
  let depth = 0, escaped = false;
  for (const char of value) {
    if (!escaped && char === '%') return false;
    if (!escaped && char === '{' && ++depth > 64) return false;
    if (!escaped && char === '}') depth--;
    escaped = !escaped && char === '\\';
  }
  return true;
}

// Opening/closing or undoing an edit must never normalize the original source.
export function visualFormulaValue(original, initialSerialized, currentSerialized) {
  return initialSerialized === currentSerialized ? original : currentSerialized;
}

// MathLive structure buttons insert editable slots, not malformed LaTeX.
// Ignore an escaped backslash; a genuine placeholder still prevents insertion.
export function hasFormulaPlaceholders(source) {
  return /(?:^|[^\\])(?:\\\\)*\\placeholder\b/.test(String(source));
}

// Public MathLive offsets are post-order: an enclosing atom follows its
// descendants at a shallower depth. Do not rely on private model internals.
export function isMatrixCellPosition(field) {
  if (!field.selectionIsCollapsed) return false;
  let depth = field.getElementInfo(field.position)?.depth;
  if (!Number.isFinite(depth)) return false;
  for (let offset = field.position + 1; offset <= field.lastOffset; offset++) {
    const info = field.getElementInfo(offset);
    if (!info || !Number.isFinite(info.depth) || info.depth >= depth) continue;
    if (/^\\begin\{(?:[pbBvV]?matrix\*?|array|[dr]?cases)\}/.test(info.latex || '')) return true;
    depth = info.depth;
  }
  return false;
}

export const FORMULA_STRUCTURES = [
  ['fraction', '\\frac{#@}{#?}'], ['root', '\\sqrt{#@}'], ['power', '{#@}^{#?}'],
  ['subscript', '{#@}_{#?}'], ['integral', '\\int_{#?}^{#?} #@\\,dx'],
  ['sum', '\\sum_{n=#?}^{#?} #@'], ['parentheses', '\\left(#@\\right)'],
  ['matrix', '\\begin{pmatrix}#?&#?\\\\#?&#?\\end{pmatrix}'],
  ['pi', '\\pi'], ['theta', '\\theta'], ['infinity', '\\infty'], ['times', '\\times'], ['plusminus', '\\pm'],
];
