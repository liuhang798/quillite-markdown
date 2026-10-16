import test from 'node:test';
import assert from 'node:assert/strict';
import { EditorState } from '@codemirror/state';
import { history, undo, redo } from '@codemirror/commands';
import { registerEditableOwner, resolveEditableOwner } from '../src/editable-owner.js';
import {footnoteProjection} from '../src/footnote-editing.js';
import {prepareFootnotes} from '../src/markdown-formats.js';

function view(doc, extensions = []) {
  const target = { state: EditorState.create({ doc, extensions }), destroyed: false };
  target.dispatch = spec => { target.state = target.state.update(spec).state; };
  return target;
}

test('media dialog owner retains the continuation prefix of an enclosing footnote',()=>{
  const source='Ref[^n]\n\n[^n]: A\n    B',root=view(source),definition=prepareFootnotes(source).definitions.get('n');
  const projection=footnoteProjection(source,definition),inner=view(projection.text);
  registerEditableOwner(inner,root,()=>({from:definition.bodyFrom,to:definition.to,projection}),()=>true);
  const owner=resolveEditableOwner(inner,{from:0,to:3},true);
  assert.equal(owner.projectionPrefix,'    ');assert.equal(owner.from,source.indexOf(': A')+2);assert.equal(owner.to,source.length);
});
test('nested projected ranges map through every parent to one history owner', () => {
  const root = view('prefix BODY suffix', [history()]), body = view('BODY'), cell = view('OD');
  registerEditableOwner(body, root, () => ({ from: 7, to: 11 }), () => true);
  registerEditableOwner(cell, body, () => ({ from: 1, to: 3 }), () => true);
  const target = resolveEditableOwner(cell, { from: 0, to: 2 });
  assert.deepEqual(target, { view: root, from: 8, to: 10 });
  root.dispatch({ changes: { from: target.from, to: target.to, insert: 'XY' } });
  assert.equal(root.state.doc.toString(), 'prefix BXYY suffix');
  undo(resolveEditableOwner(cell).view); assert.equal(root.state.doc.toString(), 'prefix BODY suffix');
  redo(root); assert.equal(root.state.doc.toString(), 'prefix BXYY suffix');
});
test('owner mapping follows current offsets and rejects stale projections', () => {
  const root = view('before body after'), inner = view('body');
  let from = 7, valid = true;
  registerEditableOwner(inner, root, () => ({ from, to: from + 4 }), () => valid);
  assert.equal(resolveEditableOwner(inner).from, 7);
  root.dispatch({ changes: { from: 0, insert: '++' } }); from += 2;
  assert.equal(resolveEditableOwner(inner).from, 9);
  valid = false; assert.equal(resolveEditableOwner(inner), null);
});
test('invalid, readonly, destroyed, mismatched and cyclic owners fail closed', () => {
  const root = view('abcd'), inner = view('ab');
  registerEditableOwner(inner, root, () => ({ from: 0, to: 1 }), () => true);
  assert.equal(resolveEditableOwner(inner), null);
  registerEditableOwner(inner, root, () => ({ from: 0, to: 2 }), () => true);
  assert.equal(resolveEditableOwner(inner, { from: -1, to: 0 }), null);
  assert.equal(resolveEditableOwner(inner, { from: 0, to: 3 }), null);
  root.destroyed = true; assert.equal(resolveEditableOwner(inner), null); root.destroyed = false;
  root.state = EditorState.create({ doc: 'abcd', extensions: EditorState.readOnly.of(true) });
  assert.equal(resolveEditableOwner(inner), null);
  root.state = EditorState.create({ doc: 'ab' });
  registerEditableOwner(root, inner, () => ({ from: 0, to: 2 }), () => true);
  assert.equal(resolveEditableOwner(inner), null);
});
test('inner editor disposal removes its parent registration', () => {
  const root = view('ab'), inner = view('ab');
  const remove = registerEditableOwner(inner, root, () => ({ from: 0, to: 2 }), () => true);
  assert.equal(resolveEditableOwner(inner).view, root);
  remove(); inner.destroyed = true; assert.equal(resolveEditableOwner(inner), null);
});
