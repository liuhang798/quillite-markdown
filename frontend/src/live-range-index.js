// A render plan queries the same ranges for many syntax nodes. Index once
// rather than walking every formula/widget for every query. Prefix maxima
// also retain overlapping/nested ranges and ranges with equal starts.
export function liveRangeIndex(ranges) {
  const ordered = [...ranges].sort((a, b) => a.from - b.from);
  const maxEnds = [];
  for (let i = 0, max = -Infinity; i < ordered.length; i++) {
    max = Math.max(max, ordered[i].to);
    maxEnds.push(max);
  }
  return (from, to, accept) => {
    let lo = 0, hi = ordered.length;
    while (lo < hi) {
      const mid = (lo + hi) >>> 1;
      if (maxEnds[mid] <= from) lo = mid + 1;
      else hi = mid;
    }
    for (; lo < ordered.length && ordered[lo].from < to; lo++) {
      const range = ordered[lo];
      if (range.to > from && (!accept || accept(range))) return true;
    }
    return false;
  };
}
