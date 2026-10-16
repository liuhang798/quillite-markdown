import test from 'node:test';
import assert from 'node:assert/strict';
import { EditorState } from '@codemirror/state';
import { markdown } from '@codemirror/lang-markdown';
import { history, undo, redo } from '@codemirror/commands';
import { editorLivePreview, buildLivePlan, liveSourceBlock } from '../src/editor-live-preview.js';

const state=source=>EditorState.create({doc:source,extensions:[markdown(),editorLivePreview,history()]});

test('literal fences in indented code never receive wrapper repairs',()=>{
  const source='    ```\n    ABC\n    ```',at=source.indexOf('ABC');
  const tr=state(source).update({changes:{from:at,insert:'```\n    '},userEvent:'input.type'});
  assert.equal(tr.newDoc.toString(),source.slice(0,at)+'```\n    '+source.slice(at));
  assert.equal(buildLivePlan(tr.newDoc.toString()).widgets[0].text,'```\n```\nABC\n```');
});
test('typing a closing fence widens both wrappers and keeps the caret on literal code',()=>{
  for (const fence of ['```','~~~','````']) {
    const source=`${fence}text\nABC\nDEF\n${fence}\n\nend`,at=source.indexOf('DEF');
    let current=state(source),tr=current.update({changes:{from:at,insert:fence+'\n'},selection:{anchor:at+fence.length},userEvent:'input.type'});
    const wider=fence+fence[0];current=tr.state;
    assert.equal(current.doc.toString(),`${wider}text\nABC\n${fence}\nDEF\n${wider}\n\nend`);
    assert.equal(current.selection.main.head,at+fence.length+1);
    const plan=buildLivePlan(current.doc.toString());assert.equal(plan.widgets.filter(x=>x.kind==='code').length,1);
    assert.equal(plan.widgets.find(x=>x.kind==='code').text,`ABC\n${fence}\nDEF`);
    const view={get state(){return current;},dispatch(tr){current=tr.state;}};
    assert.ok(undo(view));assert.equal(current.doc.toString(),source);
    assert.ok(redo(view));assert.equal(current.doc.toString(),tr.newDoc.toString());
  }
});
test('non-closing literals do not change wrappers',()=>{
  for (const insert of ['```text\n','    ```\n','~~~\n','x```\n','``\n']) {
    const source='```text\nABC\n```',at=source.indexOf('ABC');
    assert.equal(state(source).update({changes:{from:at,insert},userEvent:'input.paste'}).newDoc.toString(),source.slice(0,at)+insert+source.slice(at));
  }
});
test('long fences, trailing whitespace and longer existing closers are preserved',()=>{
  const source='```text\nABC\n``````\n\nend',at=source.indexOf('ABC');
  assert.equal(state(source).update({changes:{from:at,insert:' ````` \t\n'},userEvent:'input.paste'}).newDoc.toString(),'``````text\n ````` \t\nABC\n``````\n\nend');
});
test('explicit source edits and whole block replacement remain literal',()=>{
  const source='```text\nABC\n```',at=source.indexOf('ABC');
  const raw=state(source).update({effects:liveSourceBlock.of(0)}).state;
  assert.equal(raw.update({changes:{from:at,insert:'```\n'},userEvent:'input.type'}).newDoc.toString(),source.slice(0,at)+'```\n'+source.slice(at));
  const replacement='```\n```\ntext';
  assert.equal(state(source).update({changes:{from:0,to:source.length,insert:replacement},userEvent:'input.paste'}).newDoc.toString(),replacement);
});
test('nested code in details shares fence protection and one authoritative history',()=>{
  const source='<details open>\n<summary>title</summary>\n\n```text\nABC\n```\n\n</details>',at=source.indexOf('ABC');
  const tr=state(source).update({changes:{from:at,insert:'```\n'},userEvent:'input.paste'});
  assert.equal(tr.newDoc.toString(),source.replace('```text\nABC\n```','````text\n```\nABC\n````'));
});
