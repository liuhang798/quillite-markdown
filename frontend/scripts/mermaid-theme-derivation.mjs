// Mermaid 11 rebuilds derived theme values only when a directive repeats
// `theme`. Our selected base theme must also derive colors when a diagram
// overrides only themeVariables. Keep upstream sanitization and merging intact.
export function patchMermaidThemeDerivation(bundle) {
  const pattern = /if\(([\w$]+)=([\w$]+)\(\1,([\w$]+)\),\3\.theme&&\3\.theme in ([\w$]+)\)\{let/gu;
  const matches = [...bundle.matchAll(pattern)];
  if (matches.length !== 1 || !bundle.slice(matches[0].index, matches[0].index + 500).includes('"updateCurrentConfig"')) {
    throw new Error('Mermaid theme derivation changed: review the compatibility patch before packaging.');
  }
  return bundle.replace(pattern, (_match, config, merge, overrides, themes) =>
    `if(${config}=${merge}(${config},${overrides}),${overrides}.theme&&${overrides}.theme in ${themes}||!${overrides}.theme&&${overrides}.themeVariables&&${config}.theme==="base"){let`);
}
