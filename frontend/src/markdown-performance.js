// Marked invokes block-extension start hooks on every remaining suffix. Avoid
// scanning an entire formula-free document once per paragraph (quadratic work).
export function mathBlockStart(source) {
  if (!source.includes('$$') && !source.includes('\\[')) return undefined;
  const match = /(?:^|\n) {0,3}(?:\$\$|\\\[)/.exec(source);
  return match ? match.index + (match[0][0] === '\n' ? 1 : 0) : undefined;
}

export function markdownSourceOptions(defaults, source) {
  const options = { ...defaults, breaks: true };
  if (!source.includes('$$') && !source.includes('\\[') && defaults.extensions?.startBlock) {
    options.extensions = { ...defaults.extensions, startBlock: defaults.extensions.startBlock.filter(start => start !== mathBlockStart) };
  }
  return options;
}
