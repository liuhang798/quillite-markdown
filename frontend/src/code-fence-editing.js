// Keep literal fence lines inside a rendered code editor. Only widen its
// existing wrapper; never escape or otherwise rewrite the user's code text.
export function codeFenceRepairs(transaction, blocks) {
  if (!transaction.docChanged || !(transaction.isUserEvent('input') || transaction.isUserEvent('move.drop'))) return [];
  const source = transaction.startState.doc, changes = transaction.changes, repairs = [];
  for (const block of blocks) {
    if (block.kind !== 'code' || block.indented) continue;
    let touched = false, wrapperChanged = false;
    changes.iterChangedRanges((from, to) => {
      if (to < block.from || from > block.to) return;
      if (from >= block.contentFrom && to <= block.contentTo) touched = true;
      else if (from < block.to && to > block.from) wrapperChanged = true;
    });
    if (!touched || wrapperChanged) continue;
    const raw = source.sliceString(block.from, block.to);
    const opening = /^( {0,3})(`{3,}|~{3,})/.exec(raw);
    const closing = block.fences ? ['', '', source.sliceString(block.fences[1].from,block.fences[1].to)] : /(?:^|\n)( {0,3})(`{3,}|~{3,})[\t ]*$/.exec(raw);
    if (!opening || !closing || opening[2][0] !== closing[2][0]) continue;
    const body = transaction.newDoc.sliceString(changes.mapPos(block.contentFrom, -1), changes.mapPos(block.contentTo, 1));
    let longest = opening[2].length - 1;
    for (let [index,line] of body.split('\n').entries()) {
      if (index && block.projection && line.startsWith(block.projection.prefix)) line=line.slice(block.projection.prefix.length);
      const candidate = /^ {0,3}(`{3,}|~{3,})[\t ]*$/.exec(line);
      if (candidate?.[1][0] === opening[2][0]) longest = Math.max(longest, candidate[1].length);
    }
    if (longest < opening[2].length) continue;
    const start = block.from + opening[1].length;
    const end = block.fences?.[1].from ?? block.from + closing.index + (closing[0].startsWith('\n') ? 1 : 0) + closing[1].length;
    repairs.push({from:changes.mapPos(start),to:changes.mapPos(start+opening[2].length),insert:opening[2][0].repeat(longest+1)});
    if (closing[2].length <= longest) repairs.push({from:changes.mapPos(end),to:changes.mapPos(end+closing[2].length),insert:opening[2][0].repeat(longest+1)});
  }
  return repairs;
}
// A body ending in a user-entered newline still needs a separate newline
// before its closing fence. Existing separator lines must not be duplicated.
export function emptyCodeSeparator(doc, block, range) {
  return block.kind === 'code' && !block.indented && range.from === range.to
    && doc.sliceString(range.to, range.to + 1) !== '\n' ? '\n' : '';
}
