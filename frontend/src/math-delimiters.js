// Shared by the renderer and the translation worker; no DOM or KaTeX required.
export function escapedAt(source, index) {
  let slashes = 0;
  for (let i = index - 1; i >= 0 && source[i] === '\\'; i--) slashes++;
  return slashes % 2 === 1;
}

export function isInlineDollarOpen(source, i) {
  return source[i] === '$' && source[i+1] !== '$' && /\S/.test(source[i+1] || '') && !escapedAt(source,i);
}

export function isInlineDollarClose(source, i) {
  return source[i] === '$' && /\S/.test(source[i-1] || '') && !/\d/.test(source[i+1] || '') && !escapedAt(source,i);
}
