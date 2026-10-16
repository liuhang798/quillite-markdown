import test from 'node:test';
import assert from 'node:assert/strict';
import {EditorState,EditorSelection,StateEffect} from '@codemirror/state';
import {history,undo} from '@codemirror/commands';
import {livePreviewField,replaceLiveSelections,deleteLiveFieldContent} from '../src/editor-live-preview.js';
import {mapEditableSelection} from '../src/live-editable-block.js';
import {codeProjection,fieldPosition} from '../src/projected-code.js';
const make=(doc,live=true)=>EditorState.create({doc,extensions:[history(),EditorState.allowMultipleSelections.of(true),...(live?[livePreviewField]:[])],
 selection:EditorSelection.create([...doc.matchAll(/needle/g)].map(m=>EditorSelection.range(m.index,m.index+6)))});

for(const live of [true,false])test(`mixed rich paste selects literal payload per field (${live?'live':'source'})`,()=>{
 const doc='needle\n\n`needle`\n\n```text\nneedle\n```\n\n<details>\n<summary>needle</summary>\n\nneedle `needle`\n\n</details>\n\n<!-- needle -->\n\nNote[^n]\n\n[^n]: needle `needle`';
 const state=make(doc,live),expected=['**Rich**','Rich','Rich','Rich','**Rich**','Rich','Rich','**Rich**','Rich'];let i=0;
 const tr=state.update({...replaceLiveSelections(state,'**Rich**','Rich'),userEvent:'input.paste'});
 assert.equal(tr.newDoc.toString(),doc.replaceAll('needle',()=>expected[i++]));
 assert.equal(tr.newSelection.ranges.length,expected.length);
 let restored=tr.state;assert.ok(undo({state:restored,dispatch:t=>{restored=t.state;}}));assert.equal(restored.doc.toString(),doc);
});

for(const [kind,body]of [['table','| A | B |\n| --- | --- |\n| needle | needle |'],['code','```text\nneedle needle\n```'],['footnote','Note[^n]\n\n[^n]: needle needle']])for(const direction of [-1,1])for(const byWord of [false,true])test(`repeated ${byWord?'word ':''}${direction<0?'Backspace':'Delete'} cannot escape empty ${kind}`,()=>{
 const doc='Before\n\n'+body+'\n\nAfter';let state=make(doc);
 const view={get state(){return state;},dispatch:tr=>{state=state.update(tr).state;}};
 assert.ok(deleteLiveFieldContent(view,direction,byWord));const cleared=state.doc.toString();
 for(let i=0;i<8;i++)assert.ok(deleteLiveFieldContent(view,direction,byWord));
 if(kind==='code')assert.equal(state.doc.toString(),direction<0?'Before\n\n```text\n\n```\n\nAfter':'Before\n\n```text\n```\n\nAfter');
 else assert.equal(state.doc.toString(),cleared);
 for(let i=0;i<12&&state.doc.toString()!==doc;i++)assert.ok(undo({state,dispatch:tr=>{state=tr.state;}}));
 assert.equal(state.doc.toString(),doc);
});

test('child selection mapping keeps reversed ranges, main index and projected line prefixes',()=>{
 const selection=EditorSelection.create([EditorSelection.range(3,1),EditorSelection.cursor(8)],0);
 const mapped=mapEditableSelection(selection,pos=>pos+15);
 assert.deepEqual(mapped.ranges.map(r=>[r.anchor,r.head]),[[18,16],[23,23]]);assert.equal(mapped.mainIndex,0);
 const source='> alpha\n> beta',projection=codeProjection(source,[{from:2,to:8},{from:10,to:14}],2,'> ');
 const projected=mapEditableSelection(selection,pos=>fieldPosition({from:2,to:14,projection},pos));
 assert.deepEqual(projected.ranges.map(r=>[r.anchor,r.head]),[[5,3],[12,12]]);assert.equal(projected.mainIndex,0);
});

test('projection deletion respects graphemes and protects quote prefixes',()=>{
 const doc='> ```text\n> 🐈\n> 🐈\n> ```';let state=EditorState.create({doc,extensions:[livePreviewField,EditorState.allowMultipleSelections.of(true)],selection:EditorSelection.create([...doc.matchAll(/🐈/g)].map(m=>EditorSelection.cursor(m.index+2)))});
 const view={get state(){return state;},dispatch:tr=>{state=state.update(tr).state;}};
 assert.ok(deleteLiveFieldContent(view,-1));assert.equal(state.doc.toString(),'> ```text\n> \n> \n> ```');
});

test('boundary guard leaves source mode, readonly and composition input alone',()=>{
 const doc='```text\nneedle needle\n```';
 for(const [state,extra]of [[make(doc,false),{}],[make(doc),{composing:true}],[make(doc).update({effects:StateEffect.appendConfig.of(EditorState.readOnly.of(true))}).state,{}]]){
  assert.equal(deleteLiveFieldContent({state,...extra,dispatch(){throw Error('must not dispatch');}},-1),false);
 }
});
