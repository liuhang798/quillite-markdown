import test from 'node:test';
import assert from 'node:assert/strict';
import {EditorState,EditorSelection} from '@codemirror/state';
import {history,undo,redo} from '@codemirror/commands';
import {livePreviewField,liveComposition,protectLiveInlineReplacement,normalizeLiveInlineWhitespace,buildLivePlan} from '../src/editor-live-preview.js';
import {editableForwardedChange,editableProjectionSync} from '../src/editable-owner.js';
import {inlineFormatEdit} from '../src/inline-format-toggle.js';
const create=(doc,extra=[])=>EditorState.create({doc,extensions:[livePreviewField,history(),EditorState.allowMultipleSelections.of(true),EditorState.transactionFilter.of(normalizeLiveInlineWhitespace),EditorState.transactionFilter.of(protectLiveInlineReplacement),...extra]});
const cases=[
 ['**ALPHA** gap *OMEGA*','<strong>AL</strong>','<em>GA</em>'],
 ['~~ALPHA~~ gap ==OMEGA==','<del>AL</del>','<mark>GA</mark>'],
 ['[ALPHA](https://example.com "Title") gap <u>OMEGA</u>','[AL](https://example.com "Title")','<u>GA</u>'],
 ['**<u>ALPHA</u>** gap *<mark>OMEGA</mark>*','<strong><u>AL</u></strong>','<em><mark>GA</mark></em>'],
 ['<span data-md-color="spectrum-3-red">ALPHA</span> gap <sup>OMEGA</sup>','<span data-md-color="spectrum-3-red">AL</span>','<sup>GA</sup>'],
];
for(const[doc,left,right]of cases)test(`crossing ${doc} preserves remaining styles and one history event`,()=>{
 for(const insert of ['**RICH** *TEXT*','PLAIN',''])for(const reverse of [false,true]){
  const from=doc.indexOf('ALPHA')+2,to=doc.indexOf('OMEGA')+3;let state=create(doc);state=state.update({selection:EditorSelection.single(reverse?to:from,reverse?from:to)}).state;
  state=state.update({...state.replaceSelection(insert),userEvent:insert?'input.paste':'delete.backward'}).state;
  assert.equal(state.doc.toString(),left+insert+right);assert.equal(state.selection.main.head,left.length+insert.length);
  undo({state,dispatch:tr=>state=tr.state});assert.equal(state.doc.toString(),doc);
  redo({state,dispatch:tr=>state=tr.state});assert.equal(state.doc.toString(),left+insert+right);
 }
});
test('whole visible selection clears leftover boundary wrappers',()=>{
 for(const[doc]of cases){let state=create(doc);state=state.update({selection:{anchor:doc.indexOf('ALPHA'),head:doc.indexOf('OMEGA')+5}}).state;
  assert.equal(state.update({...state.replaceSelection('**RICH**'),userEvent:'input.paste'}).newDoc.toString(),'**RICH**');}
});
test('partial replacement entirely within a wrapper keeps its style',()=>{
 let state=create('**ALPHA**');state=state.update({selection:{anchor:3,head:5}}).state;
 assert.equal(state.update({...state.replaceSelection('X'),userEvent:'input.type'}).newDoc.toString(),'**AXHA**');
});
test('source, read-only, composing, history and projection synchronization are untouched',()=>{
 const doc='**ALPHA** gap *OMEGA*',from=4,to=18;
 for(const mode of ['source','readOnly','composition','undo','redo','sync','forward']){
  let state=mode==='source'?EditorState.create({doc,extensions:[EditorState.transactionFilter.of(protectLiveInlineReplacement)]}):create(doc,mode==='readOnly'?[EditorState.readOnly.of(true)]:[]);
  state=state.update({selection:{anchor:from,head:to},...(mode==='composition'?{effects:liveComposition.of(true)}:{})}).state;
  const tr=state.update({...state.replaceSelection('X'),userEvent:['undo','redo'].includes(mode)?mode:'input.paste',...(mode==='sync'?{annotations:editableProjectionSync.of(true)}:mode==='forward'?{annotations:editableForwardedChange.of(true)}:{})});
  assert.equal(tr.newDoc.toString(),doc.slice(0,from)+'X'+doc.slice(to));
 }
});
test('HTML seam styles render as existing safe text decorations, not document DOM',()=>{
 for(const[tag,css]of [['strong','strong'],['em','em'],['del','strike']]){
  const doc=`<${tag}>AL</${tag}>`,plan=buildLivePlan(doc);
  assert.ok(plan.marks.some(m=>m.className==='cm-live-'+css));assert.equal(plan.hides.length,2);
  assert.equal(plan.widgets.length,0);
 }
 assert.equal(buildLivePlan('`<strong>AL</strong>`').marks.some(m=>m.className==='cm-live-strong'),false);
});
test('multiple crossing ranges keep direction, primary index and surrounding text',()=>{
 const line='**ALPHA** gap *OMEGA*',doc=line+'\n\n'+line;let state=create(doc);
 const from=4,to=line.indexOf('OMEGA')+3,offset=line.length+2;
 state=state.update({selection:EditorSelection.create([EditorSelection.range(from,to),EditorSelection.range(to+offset,from+offset)],1)}).state;
 const tr=state.update({...state.replaceSelection('X'),userEvent:'input.paste'});
 assert.equal(tr.newDoc.toString(),['<strong>AL</strong>X<em>GA</em>','<strong>AL</strong>X<em>GA</em>'].join('\n\n'));
 assert.equal(tr.newSelection.ranges.length,2);assert.equal(tr.newSelection.mainIndex,1);
});
test('toolbar toggles remove equivalent HTML seam styles while retaining nested styles',()=>{
 for(const[doc,marker,expected]of [
  ['<strong>AL</strong>','**','AL'],['<em>AL</em>','*','AL'],['<del>AL</del>','~~','AL'],['<mark>AL</mark>','==','AL'],
  ['<strong><u>AL</u></strong>','**','<u>AL</u>'],['<em><strong>AL</strong></em>','***','AL'],
  ['<strong>AL</strong>','***','<strong><em>AL</em></strong>'],
 ])for(const edges of ['body','whole','closing','opening']){
  const from=['whole','opening'].includes(edges)?0:doc.indexOf('AL'),to=['whole','closing'].includes(edges)?doc.length:doc.indexOf('AL')+2,edit=inlineFormatEdit(doc,from,to,marker,marker);
  assert.equal(doc.slice(0,edit.from)+edit.insert+doc.slice(edit.to),expected);
 }
});
test('multiline retained emphasis remains rendered after a cross-style replacement',()=>{
 const doc='**first\nALPHA** gap *OMEGA*';let state=create(doc);
 const from=doc.indexOf('ALPHA')+2,to=doc.indexOf('OMEGA')+3;state=state.update({selection:{anchor:from,head:to}}).state;
 const next=state.update({...state.replaceSelection('X'),userEvent:'input.paste'}).state;
 assert.equal(next.doc.toString(),'<strong>first\nAL</strong>X<em>GA</em>');
 const plan=next.field(livePreviewField).plan;
 assert.ok(plan.marks.some(m=>m.className==='cm-live-strong'&&m.from===0&&m.to==='<strong>first\nAL</strong>'.length));
});
