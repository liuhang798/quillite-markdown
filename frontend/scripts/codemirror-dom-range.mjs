// Narrow compatibility patch for @codemirror/view 6.43.6. Never pair text
// from an invalid DOM sibling range with the old logical document bounds.
// Reject the whole DOM change and let the observer resync from EditorState.
export function patchCodeMirrorDOMRange(code) {
  const marker = '// quillite-validated-dom-range-v2';
  if (code.includes(marker)) return code;
  const replace = (before, after) => {
    if (code.split(before).length !== 2) throw new Error('CodeMirror DOM range changed; review the boundary patch');
    code = code.replace(before, after);
  };
  replace('    readRange(start, end) {\n        if (!start)', `    readRange(start, end) {
        ${marker}
        if (end) {
            let cursor = start;
            if (!start || start.parentNode != end.parentNode) cursor = null;
            else while (cursor && cursor != end) cursor = cursor.nextSibling;
            if (cursor != end) { this.invalidRange = true; return this; }
        }
        if (start && !this.view.contentDOM.contains(start)) { this.invalidRange = true; return this; }
        if (start == end) return this;
        if (!start)`);
  replace('            let nextTile = Tile.get(next);', `            if (!next) { this.invalidRange = true; return this; }
            let nextTile = Tile.get(next);`);
  replace('            this.text = reader.text;', `            if (reader.invalidRange) {
                this.bounds = null;
                this.newSel = null;
                view.docView.tile.markDirty(false);
                return;
            }
            this.text = reader.text;`);
  return code;
}
