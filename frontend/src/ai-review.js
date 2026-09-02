export function nthTextIndex(source, search, occurrence = 1) {
  source = String(source ?? '');
  search = String(search ?? '');
  occurrence = Math.max(1, Math.trunc(Number(occurrence) || 1));
  if (!search) return -1;
  let index = -1;
  let from = 0;
  for (let count = 0; count < occurrence; count += 1) {
    index = source.indexOf(search, from);
    if (index < 0) return -1;
    from = index + search.length;
  }
  return index;
}

export function locateAIReviewSuggestions(rawSuggestions, source) {
  if (!Array.isArray(rawSuggestions)) return [];
  source = String(source ?? '');
  const seen = new Set();
  return rawSuggestions.slice(0, 60).flatMap((raw, index) => {
    const original = String(raw?.original || '');
    const replacement = String(raw?.replacement ?? '');
    const occurrence = Math.max(1, Math.trunc(Number(raw?.occurrence) || 1));
    const start = nthTextIndex(source, original, occurrence);
    if (!original || start < 0 || original === replacement) return [];
    const key = `${start}\u0000${original}\u0000${replacement}`;
    if (seen.has(key)) return [];
    seen.add(key);
    const category = ['grammar', 'spelling', 'punctuation', 'clarity', 'consistency', 'markdown'].includes(raw?.category) ? raw.category : 'clarity';
    const severity = ['high', 'medium', 'low'].includes(raw?.severity) ? raw.severity : 'medium';
    return [{
      id: String(raw?.id || `suggestion-${index + 1}`),
      category,
      severity,
      original,
      replacement,
      reason: String(raw?.reason || '').trim(),
      occurrence,
      start,
      end: start + original.length,
      selected: true
    }];
  }).sort((left, right) => left.start - right.start || left.end - right.end);
}

export function hasOverlappingReviewSuggestions(suggestions) {
  const sorted = [...suggestions].sort((left, right) => left.start - right.start || left.end - right.end);
  for (let index = 1; index < sorted.length; index += 1) {
    if (sorted[index].start < sorted[index - 1].end) return true;
  }
  return false;
}
