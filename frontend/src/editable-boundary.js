// Navigation targets are source positions only. Moving across a rendered block
// must not insert/delete Markdown delimiters or create a second undo history.
export function editableBoundaryTarget({ length, item, ranges, index, direction, vertical = false }) {
  const range = ranges[index];
  if (!range || ![-1, 1].includes(direction)) return null;
  let next = index + direction;
  if (item.kind === 'table' && vertical) {
    next = ranges.findIndex(cell => cell.row === range.row + direction && cell.column === range.column);
  }
  if (next >= 0 && next < ranges.length) return { index: next, after: direction < 0 };
  // At the document edge there is no adjacent editable paragraph. Do not put
  // the cursor against an opening/closing fence where typing could corrupt it.
  if (direction < 0 ? item.from <= 0 : item.to >= length) return null;
  return { position: direction < 0 ? item.from - 1 : item.to + 1 };
}
