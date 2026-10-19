import { decodeMermaidTextEntities } from '../src/mermaid-label-text.js';

// Mermaid's SVG-only text renderer decodes amp/lt/gt but leaves its own numeric
// label escapes visible. Decode text before measurement, not by rewriting SVG
// markup afterwards (which would invalidate layout or create executable HTML).
export function patchMermaidSVGEntities(bundle) {
  const pattern = /function ([\w$]+)\(e\)\{let t=\/&\(amp\|lt\|gt\);\/g;return e\.replace\(t,\(r,n\)=>\{switch\(n\)\{case"amp":return"&";case"lt":return"<";case"gt":return">";default:return r\}\}\)\}/gu;
  const matches = [...bundle.matchAll(pattern)];
  if (matches.length !== 1) throw new Error('Mermaid SVG entity decoder changed: review the text compatibility patch before packaging.');
  return bundle.replace(pattern, (_match, name) => decodeMermaidTextEntities.toString().replace('decodeMermaidTextEntities', name));
}
