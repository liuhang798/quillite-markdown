import test from 'node:test';
import assert from 'node:assert/strict';
import { EditorState } from '@codemirror/state';
import { markdown } from '@codemirror/lang-markdown';
import { history, undo, redo } from '@codemirror/commands';
import { editorLivePreview, buildLivePlan, liveSourceBlock } from '../src/editor-live-preview.js';

const state=source=>EditorState.create({doc:source,extensions:[markdown(),editorLivePreview,history()]});

test('outer native caret echoes cannot move a code body caret onto hidden fences',()=>{
  for(const source of ['before\n\n```text\nABC\nDEF\n```\n\nafter','~~~js\nABC\n~~~','> ```text\n> ABC\n> DEF\n> ```']){
    const item=buildLivePlan(source).widgets.find(w=>w.kind==='code');assert.ok(item);
    for(const at of [item.contentFrom,source.indexOf('ABC')+1,item.contentTo]){
      const current=state(source).update({selection:{anchor:at}}).state;
      for(const edge of [item.from,item.contentFrom-1,item.contentTo+1,item.to]){
        const next=current.update({selection:{anchor:edge},userEvent:'select'}).state;
        assert.equal(next.selection.main.head,at,'keep authoritative body caret');
        assert.equal(next.doc.toString(),source);
        const typed=next.update({...next.replaceSelection('发送'),userEvent:'input.type'}).state;
        assert.equal(typed.doc.toString(),source.slice(0,at)+'发送'+source.slice(at));
      }
    }
  }
});

test('code caret echo guard preserves explicit navigation, selections and source editing',()=>{
  const source='before\n\n```text\nABC\n```\n\nafter',item=buildLivePlan(source).widgets.find(w=>w.kind==='code');
  const current=state(source).update({selection:{anchor:item.contentFrom+1}}).state;
  for(const userEvent of ['select.pointer','select.keyboard','select.search',undefined]){
    assert.equal(current.update({selection:{anchor:item.from},userEvent}).newSelection.main.head,item.from);
  }
  assert.equal(current.update({selection:{anchor:item.from},userEvent:'select',scrollIntoView:true}).newSelection.main.head,item.from);
  assert.equal(current.update({selection:{anchor:0,head:item.to},userEvent:'select'}).newSelection.main.empty,false);
  assert.equal(current.update({selection:{anchor:0},userEvent:'select'}).newSelection.main.head,0);
  const explicit=current.update({effects:liveSourceBlock.of(item.from)}).state;
  assert.equal(explicit.update({selection:{anchor:item.from},userEvent:'select'}).newSelection.main.head,item.from);
  const selected=current.update({selection:{anchor:item.contentFrom,head:item.contentTo}}).state;
  assert.equal(selected.update({selection:{anchor:item.from},userEvent:'select'}).newSelection.main.head,item.from);
});

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
