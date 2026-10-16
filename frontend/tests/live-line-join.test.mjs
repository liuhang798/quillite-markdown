import test from 'node:test';
import assert from 'node:assert/strict';
import {EditorState, EditorSelection} from '@codemirror/state';
import {history, undo, redo} from '@codemirror/commands';
import {deleteLiveLineForward, deleteLiveFieldContent, livePreviewField, liveComposition} from '../src/editor-live-preview.js';

const create=(doc,position,extensions=[])=>EditorState.create({doc,selection:{anchor:position},extensions:[livePreviewField,history(),EditorState.allowMultipleSelections.of(true),extensions]});
for(const [source,expected] of [
  ['> AL|\n> `PHA`','> AL`PHA`'],
  ['- AL|\n- `PHA`','- AL`PHA`'],
  ['1. AL|\n2. `PHA`','1. AL`PHA`'],
  ['- [ ] AL|\n- [x] PHA','- [ ] ALPHA'],
  ['> - AL|\n> - PHA','> - ALPHA'],
  ['- AL|\n  PHA','- ALPHA'],
  ['> AL|\n> > PHA','> ALPHA'],
  ['- AL|\n- `- literal`','- AL`- literal`'],
]) test('forward join removes only next container prefix: '+source,()=>{
  const position=source.indexOf('|'),doc=source.replace('|','');let state=create(doc,position);
  assert.equal(deleteLiveLineForward({state,dispatch:spec=>state=state.update(spec).state}),true);
  assert.equal(state.doc.toString(),expected);assert.equal(state.selection.main.head,position);
  undo({state,dispatch:tr=>state=tr.state});assert.equal(state.doc.toString(),doc);
  redo({state,dispatch:tr=>state=tr.state});assert.equal(state.doc.toString(),expected);
});

for(const [open,close] of [['**','**'],['*','*'],['~~','~~'],['==','=='],['```','```'],['<span data-md-color="spectrum-3-red">','</span>'],...['u','sup','sub','kbd','mark'].map(tag=>['<'+tag+'>','</'+tag+'>'])])for(const direction of [-1,1])test('projected multi deletion removes complete '+open+' edge '+direction,()=>{
 for(const wrap of [t=>'<details open>\n<summary>Title</summary>\n\n'+t+'\n\n</details>',t=>'Note[^n]\n\n[^n]: '+t,t=>'| H |\n| --- |\n| '+t+' |']){
  const doc='> needle\n> tail\n\n'+wrap(open+'needle'+close),pos=doc.lastIndexOf('needle')+(direction>0?6:0);
  let state=create(doc,0).update({selection:EditorSelection.create([EditorSelection.cursor(8),EditorSelection.cursor(pos)],1)}).state;
  assert.ok(deleteLiveFieldContent({state,dispatch:spec=>state=state.update(spec).state},direction));
  const expected=(direction>0?'> needletail':'> needl\n> tail')+'\n\n'+wrap('needle');
  assert.equal(state.doc.toString(),expected);assert.equal(state.selection.main.head,expected.lastIndexOf('needle')+(direction>0?6:0));
  undo({state,dispatch:tr=>state=tr.state});assert.equal(state.doc.toString(),doc);
  redo({state,dispatch:tr=>state=tr.state});assert.equal(state.doc.toString(),expected);
 }
});
test('forward join leaves plain/literal and projected block boundaries to their existing handlers',()=>{
  for(const source of ['AL|\nPHA','AL|\n`> PHA`','AL|\n\\- PHA','AL|\n```\n- PHA\n```','AL|\n    - PHA','AL|\n> ```\n> PHA\n> ```','AL|']){
    const position=source.indexOf('|'),state=create(source.replace('|',''),position);
    assert.equal(deleteLiveLineForward({state,dispatch:()=>assert.fail('unexpected dispatch')}),false,source);
  }
});
test('forward join respects source, read-only, composition and selection guards',()=>{
  const doc='> AL\n> PHA',base=create(doc,4);
  for(const state of [EditorState.create({doc,selection:{anchor:4}}),create(doc,4,[EditorState.readOnly.of(true)]),base.update({effects:liveComposition.of(true)}).state,base.update({selection:{anchor:4},userEvent:'select.search'}).state,create(doc,3),base.update({selection:{anchor:3,head:4}}).state])
    assert.equal(deleteLiveLineForward({state,dispatch:()=>assert.fail('unexpected dispatch')}),false);
  assert.equal(deleteLiveLineForward({state:base,composing:true,dispatch:()=>assert.fail('unexpected dispatch')}),false);
});

const multi=doc=>create(doc,0).update({selection:EditorSelection.create([...doc.matchAll(/needle/g)].map(m=>EditorSelection.cursor(m.index+6)),1)}).state;
test('projected code boundary deletion retains literal punctuation and exact history',()=>{
 const body='A`<B>&copy;',escaped=body.replace(/[!-/:-@\[-`{-~]/g,'\\$&');
 for(const direction of [-1,1]){
  const doc='> needle\n> tail\n\nNote[^n]\n\n[^n]: ```'+body+'```',start=doc.indexOf(body);
  let state=create(doc,0).update({selection:EditorSelection.create([EditorSelection.cursor(8),EditorSelection.cursor(start+(direction>0?body.length:0))])}).state;
  assert.ok(deleteLiveFieldContent({state,dispatch:spec=>state=state.update(spec).state},direction));
  assert.equal(state.doc.toString(),(direction>0?'> needletail':'> needl\n> tail')+'\n\nNote[^n]\n\n[^n]: '+escaped);
  undo({state,dispatch:tr=>state=tr.state});assert.equal(state.doc.toString(),doc);
 }
});
test('search-revealed multi-carets retain literal source deletion in projected prose',()=>{
 const doc='> needle\n> tail\n\nNote[^n]\n\n[^n]: **needle**';let state=multi(doc);
 state=state.update({selection:state.selection,userEvent:'select.search'}).state;
 assert.equal(deleteLiveLineForward({state,dispatch:()=>assert.fail('search must not join')}),false);
 assert.ok(deleteLiveFieldContent({state,dispatch:spec=>state=state.update(spec).state},1));
 assert.equal(state.doc.toString(),'> needle> tail\n\nNote[^n]\n\n[^n]: **needle*');
});
for(const [kind,body,expected] of [
 ['quote','> needle\n> tail\n\n> needle\n> tail','> needletail\n\n> needletail'],
 ['list','- needle\n- tail\n\n- needle\n- tail','- needletail\n\n- needletail'],
 ['adjacent','> needle\n> needle\n> tail','> needleneedletail'],
 ['mixed','> needle\n> tail\n\nneedleX','> needletail\n\nneedle'],
 ['code','> needle\n> tail\n\n```\nneedle\n> tail\n```','> needletail\n\n```\nneedle> tail\n```'],
 ['table','> needle\n> tail\n\n| H |\n| --- |\n| needle |','> needletail\n\n| H |\n| --- |\n| needle |'],
 ['footnote','> needle\n> tail\n\nNote[^n]\n\n[^n]: - needle\n    - tail','> needletail\n\nNote[^n]\n\n[^n]: - needletail'],
 ['details','> needle\n> tail\n\n<details open>\n<summary>Title</summary>\n\n- needle\n- tail\n\n</details>','> needletail\n\n<details open>\n<summary>Title</summary>\n\n- needletail\n\n</details>'],
])test('multi forward join preserves '+kind+' text, carets and single-step history',()=>{
 let state=multi(body),initial=state.selection;
 assert.ok(deleteLiveLineForward({state,dispatch:spec=>state=state.update(spec).state}));
 assert.equal(state.doc.toString(),expected);assert.equal(state.selection.mainIndex,1);assert.equal(state.selection.ranges.length,initial.ranges.length);
 assert.deepEqual(state.selection.ranges.map(r=>r.head),[...expected.matchAll(/needle/g)].map(m=>m.index+6));
 undo({state,dispatch:tr=>state=tr.state});assert.equal(state.doc.toString(),body);
 redo({state,dispatch:tr=>state=tr.state});assert.equal(state.doc.toString(),expected);
});
