// Use the engine's parsed type, not the first token (which may be a comment,
// directive or YAML frontmatter). Keep names used by our SVG normalizers.
export function normalizedMermaidType(type) {
  const value = String(type || '').toLowerCase();
  const types = {
    'flowchart-v2': 'flowchart', 'flowchart-elk': 'flowchart', graph: 'flowchart',
    er: 'erdiagram', requirement: 'requirementdiagram', xychart: 'xychart-beta',
    treemap: 'treemap-beta', sankey: 'sankey-beta'
  };
  return Object.hasOwn(types, value) ? types[value] : value;
}

export function hasMermaidConfiguration(source) {
  return source.includes('%%{') || /^\s*---(?:\r?\n)/u.test(source);
}

export function hasConfiguredMermaidForeground(config) {
  if (!config || typeof config !== 'object') return false;
  // Custom CSS may set inherited text paint. Do not try to reinterpret it.
  if (typeof config.themeCSS === 'string' && config.themeCSS.trim()) return true;
  const variables = config.themeVariables;
  return !!variables && typeof variables === 'object' &&
    ['primaryTextColor', 'nodeTextColor', 'textColor', 'labelTextColor']
      .some(key => Object.hasOwn(variables, key) && variables[key] != null);
}
