import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {resolve} from 'node:path';

export function releaseSummaryForVersion(catalog, version) {
  version = String(version || '').replace(/^[vV]/, '');
  const entry = catalog?.[version];
  if (!entry || typeof entry !== 'object') throw new Error(`Missing release-summaries.json entry for ${version}`);
  const result = {};
  for (const key of ['summaryZh','summaryEn']) {
    const value = entry[key];
    if (typeof value !== 'string' || !value.trim() || /[\r\n]/.test(value)
        || [...value.trim()].length > 160 || /[\u0000-\u001f\u007f]/.test(value)) {
      throw new Error(`${version}.${key} must be one nonempty plain-text line of at most 160 characters`);
    }
    result[key] = value.trim();
  }
  return result;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const catalog = JSON.parse(readFileSync(new URL('../release-summaries.json',import.meta.url),'utf8'));
  process.stdout.write(JSON.stringify(releaseSummaryForVersion(catalog, process.argv[2]))+'\n');
}
