// Headings in document flow (or editor source order) are ordered. Read their
// current position lazily: cached offsets become stale after images, fonts,
// diagrams, resizing or disclosure changes. A scroll must not measure them all.
export function activeHeadingIndex(headings, isBeforeBoundary) {
  if (!headings.length) return -1;
  let low = 0, high = headings.length;
  while (low < high) {
    const middle = low + Math.floor((high - low) / 2);
    if (isBeforeBoundary(headings[middle])) low = middle + 1;
    else high = middle;
  }
  // Retain the first chapter while its heading is still below the viewport.
  return Math.max(0, low - 1);
}

// Closed disclosures can expose internal (out-of-flow) rectangles in WebKit
// and Chromium. Filter structurally on render/toggle, not via layout reads on
// scroll. Keep the complete outline separately, including closed chapters.
export function readerFlowHeadings(headings, root) {
  return headings.filter(heading => {
    for (let node = heading; node && node !== root; node = node.parentElement) {
      if (node.hidden) return false;
      if (node.tagName !== 'DETAILS' || node.open) continue;
      const summary = [...node.children].find(child => child.tagName === 'SUMMARY');
      if (!summary?.contains(heading)) return false;
    }
    return true;
  });
}
