import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { patchSankeyUnicode } from './mermaid-sankey-unicode.mjs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const frontendRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const source = resolve(frontendRoot, 'node_modules', 'mermaid', 'dist', 'mermaid.min.js');
const target = resolve(frontendRoot, 'public', 'vendor', 'mermaid.min.js');

await mkdir(dirname(target), { recursive: true });
await writeFile(target, patchSankeyUnicode(await readFile(source, 'utf8')));
