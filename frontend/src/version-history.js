export function documentVersionLineDifference(older = '', current = '') {
  const before = String(older || '').split('\n');
  const after = String(current || '').split('\n');
  let prefix = 0;
  while (prefix < before.length && prefix < after.length && before[prefix] === after[prefix]) prefix += 1;
  let suffix = 0;
  while (suffix < before.length - prefix && suffix < after.length - prefix
    && before[before.length - 1 - suffix] === after[after.length - 1 - suffix]) suffix += 1;
  return {
    removed: Math.max(0, before.length - prefix - suffix),
    added: Math.max(0, after.length - prefix - suffix)
  };
}

export function historyPreviewText(content = '', maximum = 120_000) {
  const value = String(content || '');
  return value.length <= maximum ? { text: value, truncated: false } : { text: value.slice(0, maximum), truncated: true };
}
