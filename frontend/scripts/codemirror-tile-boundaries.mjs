// Asserted compatibility guards for @codemirror/view 6.43.6. Height-map lines
// can temporarily lack a DOM tile around block replacements. IME context can
// likewise outlive its node. Never invent document text or reuse detached DOM.
export function patchCodeMirrorTileBoundaries(code) {
  const marker = '// quillite-tile-boundaries-v3';
  if (code.includes(marker)) return code;
  const replace = (before, after) => {
    if (code.split(before).length !== 2) throw new Error('CodeMirror tile boundaries changed; review the compatibility patch');
    code = code.replace(before, after);
  };
  replace('    return new InlineCoordsScan(view, x, y, view.textDirectionAt(block.from)).scanTile(line, block.from);', `    ${marker}
    if (!line) return precise ? null : new PosAssoc(posAtCoordsImprecise(view, content, block, x, y), 1);
    return new InlineCoordsScan(view, x, y, view.textDirectionAt(block.from)).scanTile(line, block.from);`);
  replace('        let compositionContext = composition && this.getCompositionContext(composition.text);', `        let compositionContext = composition && this.getCompositionContext(composition.text);
        if (!compositionContext) composition = null;`);
  replace('    getCompositionContext(text) {\n        let marks', `    getCompositionContext(text) {
        if (!text || !this.view.contentDOM.contains(text)) return null;
        let marks`);
  replace('        return { line: line, marks };', '        return line ? { line: line, marks } : null;');
  replace('    addComposition(composition, context) {\n        let line = this.curLine;', `    addComposition(composition, context) {
        this.ensureLine(context.line.attrs);
        let line = this.curLine;`);
  // Backport the 6.43.7 TilePointer fix without changing the rest of our pinned
  // editor/IME integration. A walker may reuse and resize the widget it visits.
  // Finish leaving that old leaf with its ORIGINAL length in the same iteration,
  // including side=-1 at an exact boundary. Otherwise the next advance consumes
  // a negative distance and can pop beyond the root, corrupting the view tree.
  replace(`            if (!tile.isComposite()) {
                if (index == tile.length) {
                    beforeBreak = !!tile.breakAfter;
                    ({ tile, index } = parents.pop());
                    index++;
                }
                else if (!dist) {
                    break;
                }
                else {
                    let take = Math.min(dist, tile.length - index);
                    if (walker)
                        walker.skip(tile, index, index + take);
                    dist -= take;
                    index += take;
                }
            }`, `            if (!tile.isComposite()) {
                let len = tile.length;
                if (index < len && dist) {
                    let take = Math.min(dist, len - index);
                    if (walker)
                        walker.skip(tile, index, index + take);
                    dist -= take;
                    index += take;
                }
                if (index == len) {
                    beforeBreak = !!tile.breakAfter;
                    ({ tile, index } = parents.pop());
                    index++;
                }
                else if (!dist) {
                    break;
                }
            }`);
  // A full-child skip invokes the same mutating walker as the leaf path.
  // Keep its old extent too: a reused widget can be resized during skip(),
  // and consuming its new length would move the old-tree cursor past its root.
  replace(`                let next = tile.children[index], brk = next.breakAfter;
                if ((side > 0 ? next.length <= dist : next.length < dist) &&
                    (!walker || walker.skip(next, 0, next.length) !== false || !next.isComposite)) {
                    beforeBreak = !!brk;
                    index++;
                    dist -= next.length;`, `                let next = tile.children[index], brk = next.breakAfter, len = next.length;
                if ((side > 0 ? len <= dist : len < dist) &&
                    (!walker || walker.skip(next, 0, len) !== false || !next.isComposite)) {
                    beforeBreak = !!brk;
                    index++;
                    dist -= len;`);
  return code;
}
