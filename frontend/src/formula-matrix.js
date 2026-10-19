// Split template rows, not arbitrary TeX. Nested expressions keep their exact source;
// alignment commands may only occur inside a TeX group/environment of the cell.
function matrixParts(value, splitColumns) {
  const text = String(value).trim(), stack = [], parts = [];
  const invalid = () => { throw new Error('FORMULA_MATRIX_INVALID'); };
  const close = kind => { if (stack.pop() !== kind) invalid(); };
  let start = 0, braceDepth = 0, environmentDepth = 0;
  const structuralScope = () => braceDepth > 0 || environmentDepth > 0;
  if (text.length > 32768) invalid();
  for (let i = 0; i < text.length;) {
    if (stack.length > 256) invalid();
    const char = text[i];
    if (char === '\\') {
      const token = text.slice(i).match(/^\\([A-Za-z]+|[\s\S])/);
      if (!token) invalid();
      const command = token[1]; i += token[0].length;
      if (['def', 'gdef', 'edef', 'xdef', 'let', 'futurelet', 'newcommand', 'renewcommand', 'providecommand', 'global'].includes(command)) invalid();
      // TeX braces already isolate the cell. Text arguments may contain unmatched
      // visible parentheses; do not reinterpret those as row delimiters.
      if (braceDepth > 0) continue;
      if (command === 'begin' || command === 'end') {
        const environment = text.slice(i).match(/^\s*\{([A-Za-z*]+)\}/);
        if (!environment) invalid();
        const kind = 'env:' + environment[1]; i += environment[0].length;
        if (command === 'begin') { stack.push(kind); environmentDepth++; }
        else { close(kind); environmentDepth--; }
      } else if (command === 'left' || command === 'right') {
        const delimiter = text.slice(i).match(/^\s*(?:\\(?:[A-Za-z]+|[^A-Za-z])|[()[\]{}.|<>/])/);
        if (!delimiter) invalid();
        i += delimiter[0].length;
        if (command === 'left') stack.push('left'); else close('left');
      } else if (['{', 'lbrace', 'langle', 'lvert', 'lVert', 'lceil', 'lfloor', 'lparen', 'lbrack'].includes(command)) stack.push('visible');
      else if (['}', 'rbrace', 'rangle', 'rvert', 'rVert', 'rceil', 'rfloor', 'rparen', 'rbrack'].includes(command)) close('visible');
      else if (['\\', 'cr', 'newline', 'hline', 'hdashline'].includes(command) && !structuralScope()) invalid();
      continue;
    }
    if (char === '%') invalid(); // A comment could swallow generated separators/end markers.
    if (char === '{') { stack.push('brace'); braceDepth++; }
    else if (char === '}') { close('brace'); braceDepth--; }
    else if (braceDepth > 0) { i++; continue; }
    else if (char === '(' || char === '[') stack.push('visible');
    else if (char === ')' || char === ']') close('visible'); // also permits interval notation (a,b]
    else if (char === '&' && !structuralScope()) invalid();
    else if (splitColumns && (char === ',' || char === '，') && stack.length === 0) {
      parts.push(text.slice(start, i).trim()); start = i + 1;
    }
    i++;
  }
  if (stack.length) invalid();
  parts.push(text.slice(start).trim());
  if (parts.some(part => !part)) invalid();
  return parts;
}

export function formulaMatrixCell(value) {
  return matrixParts(value, false)[0];
}

export function formulaMatrixRow(value, columns = 3) {
  const parts = matrixParts(value, true);
  if (parts.length !== columns) throw new Error('FORMULA_MATRIX_INVALID');
  return parts.join('&');
}
