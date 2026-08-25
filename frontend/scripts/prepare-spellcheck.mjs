import { copyFile, mkdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const frontendRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const output = resolve(frontendRoot, 'public/vendor/dictionaries');
const dictionaries = [
  ['dictionary-en', 'en-US'],
  ['dictionary-en-gb', 'en-GB']
];

await mkdir(output, { recursive: true });
for (const [packageName, locale] of dictionaries) {
  const packageRoot = resolve(frontendRoot, 'node_modules', packageName);
  await Promise.all([
    copyFile(resolve(packageRoot, 'index.aff'), resolve(output, `${locale}.aff`)),
    copyFile(resolve(packageRoot, 'index.dic'), resolve(output, `${locale}.dic`))
  ]);
}
