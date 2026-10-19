import test from 'node:test';
import assert from 'node:assert/strict';
import {EditorState,EditorSelection} from '@codemirror/state';
import {history,undo} from '@codemirror/commands';
import {projectSearchMatches,projectedSearchMatches,updateProjectedSearch,sameSearchMatches} from '../src/projected-search.js';
import {handleCrossBlockTextInput,replaceLiveSelections,livePreviewField,editorLivePreview} from '../src/editor-live-preview.js';
import {crossSelectionField} from '../src/editable-cross-selection.js';
import {selectionHistory,withSelectionHistory} from '../src/selection-history.js';

test('search match projection preserves selections and clips across hidden prefixes',()=>{
 const range={from:10,to:22,projection:{text:'abc\ndef',segments:[{from:10,to:14,offset:0},{from:19,to:22,offset:4}]}};
 assert.deepEqual(projectSearchMatches([{from:0,to:2},{from:11,to:21,selected:true},{from:14,to:19}],range),[{from:1,to:6,selected:true}]);
 assert.equal(sameSearchMatches(null,[]),false);assert.equal(sameSearchMatches([],[]),true);
 assert.equal(sameSearchMatches([{from:1,to:2,selected:true}],[{from:1,to:2,selected:false}]),false);
});
test('projected search is transient, clears on edits and adds no undo entry',()=>{
 let state=EditorState.create({doc:'needle',extensions:[history(),projectedSearchMatches]});
 state=state.update({effects:updateProjectedSearch.of([{from:0,to:6,selected:true}])}).state;
 assert.equal(state.field(projectedSearchMatches).length,1);assert.equal(undo({state,dispatch(){}}),false);
 state=state.update({changes:{from:0,to:6,insert:'new'}}).state;assert.deepEqual(state.field(projectedSearchMatches),[]);
});
test('multi-range beforeinput changes authoritative ranges once and undoes exactly',()=>{
 const doc='needle\n\n| A |\n| --- |\n| needle |';let state=EditorState.create({doc,extensions:[history(),livePreviewField,EditorState.allowMultipleSelections.of(true)],selection:EditorSelection.create([...doc.matchAll(/needle/g)].map(m=>EditorSelection.range(m.index,m.index+6)))});
 let prevented=false;const view={get state(){return state;},composing:false,dispatch(tr){state=state.update(tr).state;}};
 const event={cancelable:true,inputType:'insertText',data:'X',preventDefault(){prevented=true;}};
 assert.equal(handleCrossBlockTextInput(event,view),true);assert.ok(prevented);assert.equal(state.doc.toString(),doc.replaceAll('needle','X'));
 assert.equal(undo({state,dispatch:tr=>{state=tr.state;}}),true);assert.equal(state.doc.toString(),doc);
 for(const options of [{isComposing:true},{cancelable:false},{inputType:'insertCompositionText'}]){
  prevented=false;assert.equal(handleCrossBlockTextInput({...event,...options},view),false);assert.equal(prevented,false);
 }
});

test('single placeholder input collapses once and subsequent characters append without another click',()=>{
 for(const [open,close] of [['*','*'],['**','**'],['~~','~~'],['==','=='],['<u>','</u>'],['`','`'],['<span data-md-color="spectrum-1-red">','</span>']])for(const reverse of [false,true]){
  const prefix='# 标题\n\n',doc=prefix+open+'占位'+close,start=prefix.length+open.length;
  const selection={anchor:start+(reverse?2:0),head:start+(reverse?0:2)};
  let state=EditorState.create({doc,selection,extensions:[editorLivePreview,history(),selectionHistory]});
  const view={get state(){return state;},composing:false,dispatch(spec){state=withSelectionHistory([spec.state?spec:state.update(spec)]).at(-1).state;}};
  let prevented=false;
  const input=data=>({cancelable:true,inputType:'insertText',data,preventDefault(){prevented=true;}});
  assert.equal(state.field(crossSelectionField),true);
  assert.equal(handleCrossBlockTextInput(input('你'),view),true);assert.equal(prevented,true);
  assert.equal(state.doc.toString(),prefix+open+'你'+close);
  assert.equal(state.selection.main.empty,true);assert.equal(state.selection.main.head,start+1);assert.equal(state.field(crossSelectionField),false);
  for(const text of ['好','ab','😀']){
   prevented=false;assert.equal(handleCrossBlockTextInput(input(text),view),false);assert.equal(prevented,false);
   view.dispatch({...state.replaceSelection(text),userEvent:'input.type'});
  }
  assert.equal(state.doc.toString(),prefix+open+'你好ab😀'+close);assert.equal(state.selection.main.head,start+'你好ab😀'.length);
  undo(view);assert.equal(state.doc.toString(),doc);assert.deepEqual(state.selection.main.toJSON(),selection);
 }
});

test('single placeholder input leaves IME and non-text native events untouched',()=>{
 const doc='*斜体*';
 for(const options of [{isComposing:true},{inputType:'insertCompositionText'},{cancelable:false},{data:null}]){
  const state=EditorState.create({doc,selection:{anchor:1,head:3},extensions:[editorLivePreview]});let dispatched=false,prevented=false;
  const view={state,composing:false,dispatch(){dispatched=true;}};
  const event={cancelable:true,inputType:'insertText',data:'你',preventDefault(){prevented=true;},...options};
  assert.equal(handleCrossBlockTextInput(event,view),false);assert.equal(dispatched,false);assert.equal(prevented,false);
 }
 const state=EditorState.create({doc,selection:{anchor:1,head:3},extensions:[editorLivePreview]});
 assert.equal(handleCrossBlockTextInput({cancelable:true,inputType:'insertText',data:'你',preventDefault(){throw Error('IME intercepted');}}, {state,composing:true}),false);
});
test('multi-range typing retains each table and summary field input rules',()=>{
 const doc='needle\n\n| A | B |\n| --- | --- |\n| needle | needle |\n\n<details><summary>needle</summary>\n\nbody\n\n</details>';
 const state=EditorState.create({doc,extensions:[livePreviewField,EditorState.allowMultipleSelections.of(true)],selection:EditorSelection.create([...doc.matchAll(/needle/g)].map(m=>EditorSelection.range(m.index,m.index+6)))});
 assert.equal(state.update(replaceLiveSelections(state,'|')).state.doc.toString(),doc.replace('needle','|').replace('needle','\\|').replace('needle','\\|').replace('needle','|'));
 assert.equal(state.update(replaceLiveSelections(state,'<x>')).state.doc.toString(),doc.replace('needle','<x>').replace('needle','<x>').replace('needle','<x>').replace('needle','&lt;x&gt;'));
});
