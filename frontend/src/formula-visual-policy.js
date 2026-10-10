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

export const FORMULA_STRUCTURES = [
  ['fraction', '\\frac{#@}{#?}'], ['root', '\\sqrt{#@}'], ['power', '{#@}^{#?}'],
  ['subscript', '{#@}_{#?}'], ['integral', '\\int_{#?}^{#?} #@\\,dx'],
  ['sum', '\\sum_{n=#?}^{#?} #@'], ['parentheses', '\\left(#@\\right)'],
  ['matrix', '\\begin{pmatrix}#?&#?\\\\#?&#?\\end{pmatrix}'],
  ['pi', '\\pi'], ['theta', '\\theta'], ['infinity', '\\infty'], ['times', '\\times'], ['plusminus', '\\pm'],
];
