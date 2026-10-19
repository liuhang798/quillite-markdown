import test from 'node:test';
import assert from 'node:assert/strict';
import { EditorState } from '@codemirror/state';
import { history, undo, redo } from '@codemirror/commands';
import { selectedLineFormat } from '../src/editor-formatting.js';
import { markdownParser } from '../src/markdown-parser.js';

const image = '<img src="data:image/png;base64,YQ==" alt="图片" style="display:block;margin-left:0;margin-right:auto" width="50">';
for (const container of ['', '  ']) for (const [kind, prefix, marker] of [
  ...Array.from({length:6}, (_,i)=>['heading', '#'.repeat(i+1)+' ', '#'.repeat(i+1)+' ']),
  ['quote','','> '], ['unordered-list','','- '], ['ordered-list','','1. '], ['task-list','','- [ ] ']
]) test(`format prose after HTML image: ${JSON.stringify(container)} ${kind} ${prefix}`, () => {
  const doc = container + image + '\n' + container + '图片后文字\n' + container + '\n' + container + '下面文字';
  let state = EditorState.create({doc, selection:{anchor:doc.indexOf('图片后文字')+2}, extensions:[history()]});
  const view = {get state(){return state;},dispatch(spec){state=state.update(spec).state;}};
  const before = state.selection;
  view.dispatch(selectedLineFormat(state,kind,prefix));
  assert.equal(state.doc.toString(),container+image+'\n'+container+'\n'+container+marker+'图片后文字\n'+container+'\n'+container+'下面文字');
  const changed=state.doc.toString();
  if(kind==='heading') assert.ok(markdownParser.parse(changed).toString().includes('ATXHeading'+prefix.trim().length));
  assert.ok(undo(view));assert.equal(state.doc.toString(),doc);assert.ok(state.selection.eq(before));
  assert.ok(redo(view));assert.equal(state.doc.toString(),changed);
});

for (const start of [image+'\n\n', '![图片](a.png)\n']) test('existing boundary stays unchanged: '+start.slice(0,15),()=>{
  const doc=start+'正文'; const s=EditorState.create({doc,selection:{anchor:doc.length}});
  assert.equal(s.update(selectedLineFormat(s,'heading','# ')).state.doc.toString(),start+'# 正文');
});
for(const doc of [
  '<div>\n'+image+'\n正文\n</div>',
  '```html\n'+image+'\n正文\n```',
  '<table><tr><td>'+image+'\n正文\n</td></tr></table>',
  '> '+image+'\n> 正文',
]) test('do not rewrite non-image-only HTML or code: '+doc.slice(0,18),()=>{
  const s=EditorState.create({doc,selection:{anchor:doc.indexOf('正文')}});
  assert.equal(s.update(selectedLineFormat(s,'heading','# ')).state.doc.toString(),doc);
});

test('multiple adjacent images and following multi-line selection preserve all image bytes',()=>{
  const start=image+'\n'+image+'\n',doc=start+'甲\n乙\n\n尾';
  const s=EditorState.create({doc,selection:{anchor:start.length,head:start.length+3}});
  assert.equal(s.update(selectedLineFormat(s,'heading','## ')).state.doc.toString(),start+'\n## 甲\n## 乙\n\n尾');
});
