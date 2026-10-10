import { copyFile, mkdir, readdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const source = resolve(root, 'node_modules/mathlive/fonts');
const target = resolve(root, 'public/vendor/mathlive/fonts');
await mkdir(target, { recursive: true });
for (const file of await readdir(source)) {
  if (/^KaTeX_[A-Za-z0-9-]+\.woff2$/.test(file)) await copyFile(resolve(source, file), resolve(target, file));
}
