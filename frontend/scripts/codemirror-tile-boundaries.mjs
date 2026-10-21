// Asserted compatibility guards for @codemirror/view 6.43.6. Height-map lines
// can temporarily lack a DOM tile around block replacements. IME context can
// likewise outlive its node. Never invent document text or reuse detached DOM.
export function patchCodeMirrorTileBoundaries(code) {
  const marker = '// quillite-tile-boundaries-v1';
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
  return code;
}
