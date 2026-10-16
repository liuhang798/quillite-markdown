import test from 'node:test';
import assert from 'node:assert/strict';
import {EditorState} from '@codemirror/state';
import {history,undo,redo} from '@codemirror/commands';
import {marked} from 'marked';
import {editorLivePreview,renderedEditableBlocks} from '../src/editor-live-preview.js';

const cases=[
  ['', '> ', ''], ['- 条目\n\n','  ','-\n'], ['> - 条目\n> \n','>   ','> -\n'],
  ['- 条目\n\n','  > ','-\n'], ['- 外层\n  - 内层\n\n','    ','-\n  -\n'],
  ['123. 条目\n\n','     ','123.\n'], ['- [x] 条目\n\n','  ','- [x]\n'],
];
function fixture(intro,prefix) {return '开头\n\n'+intro+['```text','ABC','DEF','```'].map(line=>prefix+line).join('\n')+'\n\n后文';}
function replace(source,from,to,insert,event='input.paste') {
  let state=EditorState.create({doc:source,selection:{anchor:from,head:to},extensions:[editorLivePreview,history()]});
  const tr=state.update({changes:{from,to,insert},userEvent:event});state=tr.state;
  const result=state.doc.toString();
  const view={get state(){return state;},dispatch(tr){state=tr.state;}};
  assert.ok(undo(view));assert.equal(state.doc.toString(),source);assert.ok(redo(view));assert.equal(state.doc.toString(),result);
  return {state,result};
}
test('cross-block multiline paste keeps container prefixes, code structure and one undo',()=>{
  for(const [intro,prefix] of cases) {
    const source=fixture(intro,prefix), {state,result}=replace(source,source.indexOf('DEF')+2,source.length,'新\r\n行');
    assert.equal(result,source.replace('DEF','DE新\n'+prefix+'行').replace('后文',''));
    assert.equal(renderedEditableBlocks(state).filter(b=>b.kind==='code').length,1);
    assert.match(marked.parse(result),/<code class="language-text">ABC\nDE新\n行\n<\/code>/);
  }
});
test('reverse selection retains structural list markers but removes selected item prose',()=>{
  for(const [intro,prefix,headers] of cases) {
    const source=fixture(intro,prefix);
    for(const insert of ['','第一行\n第二行']) {
      const {state,result}=replace(source,0,source.indexOf('ABC')+1,insert,insert?'input.paste':'delete.selection');
      assert.equal(result,insert+'\n\n'+headers+prefix+'```text\n'+prefix+source.slice(source.indexOf('ABC')+1));
      assert.equal(renderedEditableBlocks(state).filter(b=>b.kind==='code').length,1);
      assert.match(marked.parse(result),/<code class="language-text">BC\nDEF\n<\/code>/);
      assert.ok(!result.includes('条目')&&!result.includes('外层')&&!result.includes('内层'));
    }
  }
});
test('cross-selection paste of a closing fence widens the preserved wrapper',()=>{
  for(const [intro,prefix] of cases) {
    const source=fixture(intro,prefix), {state,result}=replace(source,source.indexOf('DEF')+2,source.length,'\n```\n尾部');
    const expected=source.replace('```text','````text').replace('DEF\n'+prefix+'```','DE\n'+prefix+'```\n'+prefix+'尾部\n'+prefix+'````').replace('后文','');
    assert.equal(result,expected);
    assert.equal(renderedEditableBlocks(state).filter(b=>b.kind==='code').length,1);
    assert.match(marked.parse(result),/ABC\nDE\n```\n尾部\n<\/code>/);
  }
});
test('nested details restore header coordinates without deleting their HTML wrapper',()=>{
  const body=fixture('- 条目\n\n','  '),start='<details open>\n<summary>概要</summary>\n\n',source=start+body+'\n\n</details>';
  const {result,state}=replace(source,start.length,source.indexOf('ABC')+1,'新\n文');
  assert.equal(result,start+'新\n文\n\n-\n  ```text\n  BC\n  DEF\n  ```\n\n后文\n\n</details>');
  assert.equal(renderedEditableBlocks(state).filter(b=>b.kind==='code').length,1);
});
