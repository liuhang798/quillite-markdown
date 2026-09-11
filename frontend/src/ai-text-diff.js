const MAX_DIFF_LINES = 500;

function splitLines(value) {
  if (!value) return [];
  return value.match(/[^\n]*\n|[^\n]+$/g) || [];
}

function fallbackDiff(original, revised) {
  if (original === revised) return [{ type: 'equal', original, replacement: revised }];
  return [{ type: 'change', original, replacement: revised, accepted: true }];
}

export function buildAITextDiff(original = '', revised = '') {
  if (original === revised) return fallbackDiff(original, revised);
  const before = splitLines(original);
  const after = splitLines(revised);
  if (before.length > MAX_DIFF_LINES || after.length > MAX_DIFF_LINES) return fallbackDiff(original, revised);

  const table = Array.from({ length: before.length + 1 }, () => new Uint16Array(after.length + 1));
  for (let left = before.length - 1; left >= 0; left -= 1) {
    for (let right = after.length - 1; right >= 0; right -= 1) {
      table[left][right] = before[left] === after[right]
        ? table[left + 1][right + 1] + 1
        : Math.max(table[left + 1][right], table[left][right + 1]);
    }
  }

  const operations = [];
  let left = 0;
  let right = 0;
  while (left < before.length || right < after.length) {
    if (left < before.length && right < after.length && before[left] === after[right]) {
      operations.push({ type: 'equal', value: before[left] });
      left += 1;
      right += 1;
    } else if (right >= after.length || (left < before.length && table[left + 1][right] >= table[left][right + 1])) {
      operations.push({ type: 'delete', value: before[left] });
      left += 1;
    } else {
      operations.push({ type: 'insert', value: after[right] });
      right += 1;
    }
  }

  const segments = [];
  let unchanged = '';
  let removed = '';
  let added = '';
  const flushUnchanged = () => {
    if (!unchanged) return;
    segments.push({ type: 'equal', original: unchanged, replacement: unchanged });
    unchanged = '';
  };
  const flushChange = () => {
    if (!removed && !added) return;
    segments.push({ type: 'change', original: removed, replacement: added, accepted: true });
    removed = '';
    added = '';
  };
  for (const operation of operations) {
    if (operation.type === 'equal') {
      flushChange();
      unchanged += operation.value;
    } else {
      flushUnchanged();
      if (operation.type === 'delete') removed += operation.value;
      else added += operation.value;
    }
  }
  flushChange();
  flushUnchanged();
  return segments;
}

export function applyAITextDiff(segments = []) {
  return segments.map(segment => segment.type === 'change'
    ? (segment.accepted ? segment.replacement : segment.original)
    : segment.original).join('');
}

export function changedAITextSegments(segments = []) {
  return segments.filter(segment => segment.type === 'change');
}
