import { documentListName } from './document-list-name.js';

// Classify once per list/query, in list order. Only the last bucket needs disk I/O.
export function planLibrarySearch(files, query) {
  const key = query.trim().toLowerCase();
  const exact = [], prefix = [], contains = [], candidates = [];
  for (const file of files) {
    const name = file.name.toLowerCase();
    if (name === key || documentListName(name).title === key) exact.push(file);
    else if (name.startsWith(key)) prefix.push(file);
    else if (name.includes(key)) contains.push(file);
    else candidates.push(file);
  }
  const nameHits = exact.concat(prefix, contains);
  return {
    files, query: key, paths: candidates.map(file => file.path),
    visible(matches) {
      return matches.size ? nameHits.concat(candidates.filter(file => matches.has(file.path))) : nameHits;
    },
  };
}
