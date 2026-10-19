import test from 'node:test';
import assert from 'node:assert/strict';
import { ChangeSet, EditorState, Text } from '@codemirror/state';
import { buildLivePlan, editorLivePreview, renderedEditableBlocks } from '../src/editor-live-preview.js';
import { fieldPosition, fieldOffset, fieldInsertion, fieldText, changedFieldPosition } from '../src/projected-code.js';
import { registerEditableOwner, resolveEditableOwner } from '../src/editable-owner.js';
import { textDragTransaction } from '../src/editable-text-drag.js';

test('indented code maps every literal offset and retains its original indentation',()=>{
  for(const [intro,prefix] of [['','    '],['','\t'],['','>     '],['- item\n\n','      '],['123. item\n\n','         '],['> - item\n>\n','>       '],['- outer\n  - inner\n\n','        ']]) {
    const source=intro+prefix+'ABC\n'+prefix+'DEF', {item,range}=projected(source);
    assert.equal(item.indented,true);assert.equal(item.text,'ABC\nDEF');
    assert.equal(range.projection.prefix,prefix);
    for(let i=0;i<=item.text.length;i++)assert.equal(fieldOffset(range,fieldPosition(range,i)),i);
    assert.equal(fieldInsertion(range,'A\nB'),'A\n'+prefix+'B');
  }
});
test('indented blank lines remain editable but paragraph separators do not enter the code',()=>{
  for(const prefix of ['    ','\t','>     ']) {
    const source=prefix+'ABC\n'+prefix+'\n'+prefix+'\n\nend', {item}=projected(source);
    assert.equal(item.text,'ABC\n\n');assert.equal(source.slice(item.to),'\n\nend');
  }
  const {item}=projected('    ABC\n\n    DEF\n    \n    GHI');
  assert.equal(item.text,'ABC\n\nDEF\n\nGHI');
});
test('empty indentation never creates a zero-length replacement widget',()=>{
  for(const source of ['    ','>     ','- item\n\n      ','> - item\n>\n>       ']) {
    assert.equal(buildLivePlan(source).widgets.filter(item=>item.kind==='code').length,0);
    assert.doesNotThrow(()=>EditorState.create({doc:source,extensions:editorLivePreview}));
  }
});
test('code starting on a list marker line continues with spaces, not another marker',()=>{
  const {item,range}=projected('-     ABC\n      DEF');
  assert.equal(item.text,'ABC\nDEF');assert.equal(fieldInsertion(range,'A\nB'),'A\n      B');
});

function projected(source) {
  const item=buildLivePlan(source).widgets.find(item=>item.kind==='code');
  assert.ok(item?.projection);
  return {item,range:{from:item.contentFrom,to:item.contentTo,projection:item.projection}};
}
test('quoted code maps every literal offset across blank lines and variable quote whitespace',()=>{
  const source='> ```text\n> ABC\n>\n>DEF\n> ```', {range}=projected(source);
  assert.equal(fieldText(source,range),'ABC\n\nDEF');
  for(let offset=0;offset<=range.projection.text.length;offset++) assert.equal(fieldOffset(range,fieldPosition(range,offset)),offset);
  assert.equal(fieldPosition(range,5),source.indexOf('DEF'));
  assert.equal(fieldInsertion(range,'A\nB'),'A\n> B');
});

for(const [opening,prefix]of [['> ','> '],['> > ','> > '],['- ','  '],['123. ','     '],['> - ','>   ']])test(`final empty fenced line maps after its container prefix ${JSON.stringify(opening)}`,()=>{
 const source=opening+'```text\n'+prefix+'alpha\n'+prefix+'\n'+prefix+'beta\n'+prefix+'\n'+prefix+'```';
 const {item,range}=projected(source);
 assert.equal(item.text,'alpha\n\nbeta\n');
 const end=source.lastIndexOf('\n'+prefix+'```');
 assert.equal(fieldPosition(range,item.text.length),end);
 assert.equal(range.to,end);
 for(let offset=0;offset<=item.text.length;offset++)assert.equal(fieldOffset(range,fieldPosition(range,offset)),offset);
 const inserted=source.slice(0,end)+'Q'+source.slice(end);
 assert.equal(projected(inserted).item.text,'alpha\n\nbeta\nQ');
});
test('projected parent registration uses literal length and maps through nested owners',()=>{
  const source='> ```\n> ABC\n> DEF\n> ```',{range}=projected(source);
  const root={state:EditorState.create({doc:'prefix\n'+source})}, body={state:EditorState.create({doc:source})}, inner={state:EditorState.create({doc:range.projection.text})};
  registerEditableOwner(body,root,()=>({from:7,to:7+source.length}),()=>true);
  registerEditableOwner(inner,body,()=>range,()=>true);
  assert.deepEqual(resolveEditableOwner(inner,{from:4,to:7}),{view:root,from:7+source.indexOf('DEF'),to:7+source.indexOf('DEF')+3});
});
test('selection after multi-change edits uses actual source gaps rather than canonical prefix widths',()=>{
  const source='> ```\n>ABC\n> DEF\n> ```',{range}=projected(source);
  const inner=ChangeSet.of([{from:1,insert:'字\n中'},{from:6,to:7,insert:'XYZ'}],7), edits=[];
  inner.iterChanges((from,to,_a,_b,text)=>edits.push({from:fieldPosition(range,from),to:fieldPosition(range,to),insert:fieldInsertion(range,text.toString())}));
  const changes=ChangeSet.of(edits,source.length), next=changes.apply(Text.of(source.split('\n'))).toString(), nextRange=projected(next).range;
  assert.equal(nextRange.projection.text,inner.apply(Text.of(range.projection.text.split('\n'))).toString());
  for(let offset=0;offset<=nextRange.projection.text.length;offset++) assert.equal(changedFieldPosition(range,inner,changes,offset),fieldPosition(nextRange,offset),`offset ${offset}`);
});
test('empty quoted code and code after compacted embedded images retain exact offsets',()=>{
  const empty='> ```text\n> ```', range=projected(empty).range;
  assert.equal(fieldPosition(range,0),empty.lastIndexOf('```'));
  const source='![image](data:image/png;base64,'+'A'.repeat(310000)+')\n\n> ```\n> ABC\n> DEF\n> ```';
  const next=projected(source).range;assert.equal(fieldPosition(next,4),source.indexOf('DEF'));
});
test('details collection maps nested code segments to root source coordinates',()=>{
  const source='<details open>\n<summary>标题</summary>\n\n> ```\n> ABC\n> DEF\n> ```\n\n</details>';
  const state=EditorState.create({doc:source,extensions:editorLivePreview}),item=renderedEditableBlocks(state).find(item=>item.kind==='code');
  assert.equal(fieldPosition({from:item.contentFrom,to:item.contentTo,projection:item.projection},4),source.indexOf('DEF'));
});
test('moving multiline literal code to prose excludes container markers and preserves the fence',()=>{
  const source='前文\n\n> ```\n> ABC\n> DEF\n> ```\n\n后文', {item}=projected(source);
  const transaction=textDragTransaction(source,{from:source.indexOf('ABC')+1,to:source.indexOf('DEF')+2},source.length,true,[item]);
  assert.equal(transaction.changes.apply(Text.of(source.split('\n'))).toString(),source.replace('ABC\n> DEF','AF')+'BC\nDE');
});
test('cross-block copy excludes hidden quote prefixes from partially selected code',()=>{
  const source='前文\n\n> ```\n> ABC\n> DEF\n> ```\n\n后文', {item}=projected(source);
  const transaction=textDragTransaction(source,{from:source.indexOf('ABC')+1,to:source.length},2,false,[item]);
  const copied=transaction.changes.apply(Text.of(source.split('\n'))).toString();
  assert.equal(copied.slice(0,copied.indexOf('\n\n> ```')),'前文BC\nDEF\n\n后文');
});

test('footnote and details nested code compose exact text, prefixes and every source offset',()=>{
  for(const wrapper of [false,true]) {
    const body=(wrapper?'<details open>\n<summary>Title</summary>\n\n':'')+'> ```\n> ABC\n> DEF\n> ```'+(wrapper?'\n\n</details>':'');
    const source='Ref[^n]\n\n[^n]: Intro\n    \n    '+body.replaceAll('\n','\n    ')+'\n\nAfter';
    const state=EditorState.create({doc:source,extensions:editorLivePreview}),blocks=renderedEditableBlocks(state);
    const code=blocks.find(item=>item.kind==='code');assert.ok(code);
    const range={from:code.contentFrom,to:code.contentTo,projection:code.projection};
    assert.equal(fieldText(source,range),'ABC\nDEF');assert.equal(code.projection.prefix,'    > ');
    assert.equal(fieldInsertion(range,'X\nY'),'X\n    > Y');
    assert.equal(fieldPosition(range,4),source.indexOf('DEF'));
    for(let offset=0;offset<=7;offset++)assert.equal(fieldOffset(range,fieldPosition(range,offset)),offset);
    assert.equal(code.raw,source.slice(code.from,code.to));
  }
});
