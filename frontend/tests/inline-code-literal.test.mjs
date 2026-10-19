import test from 'node:test';
import assert from 'node:assert/strict';
import {EditorState,EditorSelection} from '@codemirror/state';
import {history,undo,redo} from '@codemirror/commands';
import {marked} from 'marked';
import {buildLivePlan,livePreviewField,liveComposition,protectLiveInlineCode,unwrapLiveInlineBoundary,normalizeLiveInlineWhitespace,protectLiveInlineReplacement} from '../src/editor-live-preview.js';
import {editableForwardedChange,editableProjectionSync} from '../src/editable-owner.js';
const filters=[unwrapLiveInlineBoundary,normalizeLiveInlineWhitespace,protectLiveInlineReplacement,protectLiveInlineCode].map(f=>EditorState.transactionFilter.of(f));
const create=(doc,extra=[])=>EditorState.create({doc,extensions:[livePreviewField,history(),EditorState.allowMultipleSelections.of(true),filters,extra]});
const codes=doc=>marked.Lexer.lexInline(doc).filter(t=>t.type==='codespan').map(t=>t.text);
for(const fence of ['`','``','```'])test(`literal ticks within ${fence.length}-tick code preserve text, caret and history`,()=>{
 for(const at of [0,2,5])for(const insert of ['`','``','```','**<&>**']){
  const doc=fence+'ALPHA'+fence,pos=fence.length+at;let state=create(doc).update({selection:{anchor:pos}}).state;
  state=state.update({...state.replaceSelection(insert),userEvent:'input.type'}).state;
  const expected='ALPHA'.slice(0,at)+insert+'ALPHA'.slice(at),edited=state.doc.toString();assert.deepEqual(codes(edited),[expected]);
  const followed=state.update({...state.replaceSelection('Q'),userEvent:'input.type'}).state;
  assert.deepEqual(codes(followed.doc.toString()),[expected.slice(0,at+insert.length)+'Q'+expected.slice(at+insert.length)]);
  undo({state,dispatch:tr=>state=tr.state});assert.equal(state.doc.toString(),doc);
  redo({state,dispatch:tr=>state=tr.state});assert.equal(state.doc.toString(),edited);
 }
});
test('padding is hidden exactly as code-space normalization requires',()=>{
 for(const[doc,visible]of [['`` `ALPHA ``','`ALPHA'],['`` ALPHA` ``','ALPHA`'],['` ALPHA `','ALPHA'],['`  ALPHA  `',' ALPHA '],['`   `','   '],['`\nALPHA\n`','\nALPHA\n']]){
  const plan=buildLivePlan(doc);let actual=doc;for(const h of [...plan.hides].sort((a,b)=>b.from-a.from))actual=actual.slice(0,h.from)+actual.slice(h.to);assert.equal(actual,visible,doc);
 }
});
test('existing padding and intentional whitespace survive local edits',()=>{
 for(const doc of ['` ALPHA `','`  ALPHA  `','`` `ALPHA ``','`` ALPHA` ``']){
  let state=create(doc),pos=doc.indexOf('ALPHA')+2;state=state.update({selection:{anchor:pos}}).state;
  const expected=codes(doc)[0].replace('ALPHA','AL`PHA');state=state.update({...state.replaceSelection('`'),userEvent:'input.type'}).state;
  assert.deepEqual(codes(state.doc.toString()),[expected]);
 }
});
test('deleting padding-adjacent characters does not consume intentional spaces',()=>{
 for(const[doc,from,to,expected]of [['`x A `',1,2,' A '],['` A x`',4,5,' A '],['`` `ALPHA ``',3,4,'ALPHA']]){
  let state=create(doc).update({selection:{anchor:from,head:to}}).state;state=state.update({...state.replaceSelection(''),userEvent:'delete.backward'}).state;assert.deepEqual(codes(state.doc.toString()),[expected]);
 }
});
test('empty code still disappears and code boundary deletion still unwraps',()=>{
 let state=create('`` ` ``').update({selection:{anchor:3,head:4}}).state;
 assert.equal(state.update({...state.replaceSelection(''),userEvent:'delete.backward'}).newDoc.toString(),'');
 state=create('`` `ALPHA ``').update({selection:{anchor:3}}).state;
 assert.equal(state.update({changes:{from:0,to:3},userEvent:'delete.backward'}).newDoc.toString(),'\\`ALPHA');
});
test('multiple code fields retain cursor order and main index',()=>{
 const doc='`ALPHA` + ``OMEGA``';let state=create(doc).update({selection:EditorSelection.create([EditorSelection.cursor(3),EditorSelection.cursor(14)],1)}).state;
 state=state.update({...state.replaceSelection('`'),userEvent:'input.type'}).state;assert.deepEqual(codes(state.doc.toString()),['AL`PHA','OM`EGA']);assert.equal(state.selection.mainIndex,1);
 state=state.update({...state.replaceSelection('Q'),userEvent:'input.type'}).state;assert.deepEqual(codes(state.doc.toString()),['AL`QPHA','OM`QEGA']);
});
test('outside/non-input changes remain untouched and newlines close each code span',()=>{
 const doc='`ALPHA`';
 assert.equal(create(doc).update({changes:{from:0,to:3,insert:'X'},userEvent:'input.type'}).newDoc.toString(),'XPHA`');
 assert.equal(create(doc).update({changes:{from:3,insert:'`'}}).newDoc.toString(),'`AL`PHA`');
 assert.equal(create(doc).update({changes:{from:3,insert:'\n'},userEvent:'input'}).newDoc.toString(),'`AL`\n`PHA`');
});
test('source/search/composition/read-only and forwarded transactions bypass repairs',()=>{
 const doc='`ALPHA`',spec={changes:{from:3,insert:'`'},userEvent:'input.type'},expected='`AL`PHA`';
 assert.equal(EditorState.create({doc,extensions:EditorState.transactionFilter.of(protectLiveInlineCode)}).update(spec).newDoc.toString(),expected);
 assert.equal(create(doc,[EditorState.readOnly.of(true)]).update(spec).newDoc.toString(),expected);
 assert.equal(create(doc).update({effects:liveComposition.of(true)}).state.update(spec).newDoc.toString(),expected);
 assert.equal(create(doc).update({selection:{anchor:3},userEvent:'select.search'}).state.update(spec).newDoc.toString(),expected);
 for(const annotation of [editableForwardedChange.of(true),editableProjectionSync.of(true)])assert.equal(create(doc).update({...spec,annotations:annotation}).newDoc.toString(),expected);
});
