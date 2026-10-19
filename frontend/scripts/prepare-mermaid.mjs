import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { patchSankeyUnicode } from './mermaid-sankey-unicode.mjs';
import { patchMermaidSVGEntities } from './mermaid-svg-entities.mjs';
import { patchMermaidThemeDerivation } from './mermaid-theme-derivation.mjs';
import { patchMermaidC4Spacing } from './mermaid-c4-spacing.mjs';
import { patchMermaidC4Dynamic } from './mermaid-c4-dynamic.mjs';
import { patchMermaidC4Colors } from './mermaid-c4-colors.mjs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const frontendRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const source = resolve(frontendRoot, 'node_modules', 'mermaid', 'dist', 'mermaid.min.js');
const target = resolve(frontendRoot, 'public', 'vendor', 'mermaid.min.js');

await mkdir(dirname(target), { recursive: true });
await writeFile(target, patchMermaidC4Colors(patchMermaidC4Dynamic(patchMermaidC4Spacing(patchMermaidThemeDerivation(patchMermaidSVGEntities(patchSankeyUnicode(await readFile(source, 'utf8'))))))));
