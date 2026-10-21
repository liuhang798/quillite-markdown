import { normalizeDocumentPath, sameDocumentPath } from './library-state.js';

export function retainRecentSelection(selected, files) {
  const wanted = new Set(selected.map(normalizeDocumentPath));
  const seen = new Set();
  return files.filter(file => {
    const key = normalizeDocumentPath(file.path);
    if (!key || !wanted.has(key) || seen.has(key)) return false;
    seen.add(key); return true;
  }).map(file => file.path);
}

export function toggleRecentSelection(selected, path, files) {
  return retainRecentSelection(selected.some(item => sameDocumentPath(item, path))
    ? selected.filter(item => !sameDocumentPath(item, path)) : [...selected, path], files);
}

// The caller supplies the displayed order, including the pinned group. Keep
// the anchor by path rather than index so reorder/removal cannot shift it.
export function rangeRecentSelection(selected, anchor, path, files, additive = false) {
  const end = files.findIndex(file => sameDocumentPath(file.path, path));
  if (end < 0) return retainRecentSelection(selected, files);
  const start = files.findIndex(file => sameDocumentPath(file.path, anchor));
  const range = start < 0 ? [files[end].path]
    : files.slice(Math.min(start, end), Math.max(start, end) + 1).map(file => file.path);
  return retainRecentSelection(additive ? [...selected, ...range] : range, files);
}

// Reuse the record-only API; never call file deletion. Serial writes avoid
// competing preferences snapshots. Each failed item remains available to retry.
export async function removeRecentSelection(paths, remove) {
  const removed = [], failed = [], seen = new Set();
  for (const path of paths) {
    const key = normalizeDocumentPath(path);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    try { await remove(path); removed.push(path); }
    catch { failed.push(path); }
  }
  return { removed, failed };
}
