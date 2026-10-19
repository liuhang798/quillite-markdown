// @codemirror/view 6.43.6 may reorder retained widget DOM while reconciling
// replacement tiles. Removing/reinserting a focused nested editor cancels its
// native selection and IME composition even though its EditorView survives.
export function patchCodeMirrorNestedFocus(code) {
  const marker = '// quillite-retained-widget-focus-v1';
  if (code.includes(marker)) return code;
  const before = `                while (next && next != child.dom)
                    next = rm$1(next);`;
  if (code.split(before).length !== 2) throw new Error('CodeMirror tile sync changed; review the nested focus patch');
  return code.replace(before, `                ${marker}
                while (next && next != child.dom) {
                    // Keep a retained focused subtree continuously connected.
                    // Move its nonfocused sibling instead. Deleted widgets and
                    // ordinary outer-editor text retain the upstream behavior.
                    if (next.contains(parent.ownerDocument.activeElement) &&
                        this.children.some(retained => retained.dom == next)) {
                        parent.insertBefore(child.dom, next);
                        break;
                    }
                    next = rm$1(next);
                }`);
}
