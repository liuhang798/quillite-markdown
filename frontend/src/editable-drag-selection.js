import {editorHasComposition} from './editor-composition.js';
import { EditorView } from '@codemirror/view';
import { crossSelection } from './editable-cross-selection.js';
import { resolveEditableOwner } from './editable-owner.js';

// Pixels per nominal 60 Hz frame. Clamp acceleration outside the viewport.
export function dragScrollStep(y, top, bottom) {
  if (![y, top, bottom].every(Number.isFinite) || bottom <= top) return 0;
  const edge = Math.min(32, (bottom - top) / 3);
  if (y < top + edge) return -Math.min(18, Math.max(1, (top + edge - y) / 2));
  if (y > bottom - edge) return Math.min(18, Math.max(1, (y - bottom + edge) / 2));
  return 0;
}

// Bridge a mouse selection across independent contenteditables while retaining
// native selection within one editor. All positions belong to the main source.
export function installCrossBlockDrag(view) {
  const doc = view.dom.ownerDocument;
  const win = doc.defaultView;
  let stop = null;
  const point = (target, x, y) => {
    const editor = target && EditorView.findFromDOM(target);
    if (!editor || editor.destroyed || editorHasComposition(editor)) return null;
    const local = editor.posAtCoords({ x, y }, false);
    if (!Number.isInteger(local)) return null;
    const owner = resolveEditableOwner(editor, { from: local, to: local });
    return owner?.view === view ? { editor, position: owner.from } : null;
  };
  const down = event => {
    stop?.();
    if (event.button !== 0 || event.detail !== 1 || event.ctrlKey || event.metaKey || event.altKey || editorHasComposition(view) || view.state.readOnly
      || resolveEditableOwner(view)?.view !== view || !event.target.closest?.('.cm-content')
      || event.target.closest('button, input, a, select, textarea')) return;
    const start = point(event.target, event.clientX, event.clientY);
    if (!start) return;
    const original = view.state.doc, initial = view.state.selection.main;
    // Preserve native dragging of an existing text selection.
    if (!event.shiftKey && !initial.empty && start.position >= initial.from && start.position <= initial.to) return;
    let crossed = false, anchor = event.shiftKey ? initial.anchor : null;
    let pointer = null, frame = 0, previousTime = 0;
    const valid = () => !view.destroyed && view.state.doc === original && !editorHasComposition(view) && !view.state.readOnly;
    const bounds = () => {
      const rect = view.scrollDOM.getBoundingClientRect();
      return { top: Math.max(0, rect.top), bottom: Math.min(win.innerHeight, rect.bottom),
        left: Math.max(0, rect.left), right: Math.min(win.innerWidth, rect.right) };
    };
    const hit = () => {
      if (!pointer) return null;
      const rect = bounds();
      if (rect.bottom <= rect.top || rect.right <= rect.left) return null;
      const x = Math.max(rect.left + 2, Math.min(rect.right - 2, pointer.x));
      const y = Math.max(rect.top + 2, Math.min(rect.bottom - 2, pointer.y));
      return point(doc.elementFromPoint(x, y), x, y);
    };
    const select = end => {
      if (!end) return;
      const selection = view.state.selection.main;
      if (selection.anchor !== anchor || selection.head !== end.position) {
        view.dispatch({ selection: { anchor, head: end.position }, effects: crossSelection.of(true), userEvent: 'select.pointer' });
      }
    };
    const tick = time => {
      frame = 0;
      if (!valid()) return stop?.();
      // Resolve against the newly measured viewport before scrolling again.
      select(hit());
      const rect = bounds(), speed = dragScrollStep(pointer.y, rect.top, rect.bottom);
      const oldTop = view.scrollDOM.scrollTop;
      const delta = previousTime ? Math.min(32, time - previousTime) / (1000 / 60) : 1;
      previousTime = time;
      view.scrollDOM.scrollTop += speed * delta;
      if (speed && view.scrollDOM.scrollTop !== oldTop) frame = win.requestAnimationFrame(tick);
      else previousTime = 0;
    };
    const move = next => {
      if (!valid() || !next.buttons) return stop?.();
      pointer = { x: next.clientX, y: next.clientY };
      const end = hit();
      if (!end || (!crossed && end.editor === start.editor)) return;
      if (anchor === null) {
        const local = start.editor.state.selection.main.anchor;
        anchor = resolveEditableOwner(start.editor, { from: local, to: local })?.from ?? start.position;
      }
      crossed = true;
      next.preventDefault(); next.stopImmediatePropagation();
      select(end);
      view.focus();
      if (!frame) frame = win.requestAnimationFrame(tick);
    };
    const up = () => stop?.();
    const cancel = () => stop?.();
    const key = event => { if (event.key === 'Escape') stop?.(); };
    stop = () => {
      if (frame) win.cancelAnimationFrame(frame);
      doc.removeEventListener('mousemove', move, true); doc.removeEventListener('mouseup', up, true);
      doc.removeEventListener('keydown', key, true);
      win.removeEventListener('blur', cancel); stop = null;
    };
    doc.addEventListener('mousemove', move, true); doc.addEventListener('mouseup', up, true);
    doc.addEventListener('keydown', key, true);
    win.addEventListener('blur', cancel);
  };
  view.dom.addEventListener('mousedown', down, true);
  return () => { stop?.(); view.dom.removeEventListener('mousedown', down, true); };
}
