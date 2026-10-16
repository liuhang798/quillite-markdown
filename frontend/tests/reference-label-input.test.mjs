import test from 'node:test';
import assert from 'node:assert/strict';
import {EditorState,EditorSelection} from '@codemirror/state';
import {history,undo,redo} from '@codemirror/commands';
import {livePreviewField,liveComposition,preserveLiveReferenceLabels,unwrapLiveInlineBoundary,normalizeLiveInlineWhitespace,protectLiveInlineReplacement} from '../src/editor-live-preview.js';
import {imageDefinitionsField,inheritedImageDefinitions} from '../src/editor-reference-context.js';
import {editableForwardedChange,editableProjectionSync} from '../src/editable-owner.js';
const extension=[imageDefinitionsField,livePreviewField,history(),EditorState.allowMultipleSelections.of(true),EditorState.transactionFilter.of(preserveLiveReferenceLabels),EditorState.transactionFilter.of(unwrapLiveInlineBoundary),EditorState.transactionFilter.of(normalizeLiveInlineWhitespace),EditorState.transactionFilter.of(protectLiveInlineReplacement)];
const create=(doc,extra=[])=>EditorState.create({doc,extensions:[extension,extra]});
const definition='\n\n[ALPHA]: https://example.com "Shared"';
for(const original of ['[ALPHA]','[ALPHA][]'])test(`typing/deleting/newline inside ${original} keeps the original reference`,()=>{
 for(const [from,to,text,event,label]of [[3,3,'xy','input.type','ALxyPHA'],[6,6,'xy','input.type','ALPHAxy'],[2,3,'','delete.backward','APHA'],[3,4,'','delete.forward','ALHA'],[2,5,'X','input.paste','AXA'],[3,3,'\n','input','AL\nPHA']]){
  let state=create(original+definition);state=state.update({selection:{anchor:from,head:to}}).state;
  state=state.update({changes:{from,to,insert:text},selection:{anchor:from+text.length},userEvent:event}).state;
  assert.equal(state.doc.toString(),`[${label}][ALPHA]`+definition);
  assert.equal(state.selection.main.head,from+text.length);
  undo({state,dispatch:tr=>state=tr.state});assert.equal(state.doc.toString(),original+definition);
  redo({state,dispatch:tr=>state=tr.state});assert.equal(state.doc.toString(),`[${label}][ALPHA]`+definition);
 }
});
test('implicit reference changes preserve sibling links and definitions',()=>{
 const doc='[ALPHA][] and [ALPHA]'+definition;
 const state=create(doc).update({changes:{from:3,insert:'X'},userEvent:'input.type'}).state;
 assert.equal(state.doc.toString(),'[ALXPHA][ALPHA] and [ALPHA]'+definition);
});
test('inherited definitions remain outside child editor documents',()=>{
 const defs=new Map([['alpha',{ref:'https://example.com',title:''}]]),state=create('[ALPHA][]',[inheritedImageDefinitions.of(defs)]);
 assert.equal(state.update({changes:{from:3,insert:'X'},userEvent:'input.type'}).newDoc.toString(),'[ALXPHA][ALPHA]');
});
test('multi-cursor edits retain all caret offsets and reference identities',()=>{
 let state=create('[ALPHA][] [ALPHA]'+definition);state=state.update({selection:EditorSelection.create([EditorSelection.cursor(3),EditorSelection.cursor(13)],1)}).state;
 state=state.update({...state.replaceSelection('X'),userEvent:'input.type'}).state;
 assert.equal(state.doc.toString(),'[ALXPHA][ALPHA] [ALXPHA][ALPHA]'+definition);
 assert.deepEqual(state.selection.ranges.map(r=>r.head),[4,20]);assert.equal(state.selection.mainIndex,1);
});
test('clearing the whole label still removes its empty wrapper',()=>{
 let state=create('[ALPHA][]'+definition);state=state.update({selection:{anchor:1,head:6}}).state;
 assert.equal(state.update({...state.replaceSelection(''),userEvent:'delete.backward'}).newDoc.toString(),definition);
});
test('cross-boundary replacement retains the existing boundary repair',()=>{
 const doc='[ALPHA][] gap *OMEGA*'+definition;let state=create(doc);state=state.update({selection:{anchor:3,head:doc.indexOf('OMEGA')+3}}).state;
 assert.equal(state.update({...state.replaceSelection('X'),userEvent:'input.type'}).newDoc.toString(),'[AL][ALPHA]X<em>GA</em>'+definition);
});
test('explicit links and unresolved labels are not canonicalized',()=>{
 for(const label of ['[ALPHA][target]','[ALPHA](https://example.com)','[MISSING][]']){
  const doc=label+definition;assert.equal(create(doc).update({changes:{from:3,insert:'X'},userEvent:'input.type'}).newDoc.toString(),doc.slice(0,3)+'X'+doc.slice(3));
 }
});
test('source, read-only, composition and forwarded changes bypass label preservation',()=>{
 const doc='[ALPHA][]'+definition,spec={changes:{from:3,insert:'X'},userEvent:'input.type'},expected='[ALXPHA][]'+definition;
 assert.equal(EditorState.create({doc,extensions:EditorState.transactionFilter.of(preserveLiveReferenceLabels)}).update(spec).newDoc.toString(),expected);
 assert.equal(create(doc,[EditorState.readOnly.of(true)]).update(spec).newDoc.toString(),expected);
 assert.equal(create(doc).update({effects:liveComposition.of(true)}).state.update(spec).newDoc.toString(),expected);
 for(const annotation of [editableForwardedChange.of(true),editableProjectionSync.of(true)])assert.equal(create(doc).update({...spec,annotations:annotation}).newDoc.toString(),expected);
 assert.equal(create(doc).update({selection:{anchor:3,head:4},userEvent:'select.search'}).state.update(spec).newDoc.toString(),expected);
});
for(const [open,label,close]of [['[','ALPHA',']'],['[','ALPHA','][]'],['[','ALPHA','][ALPHA]'],['[','ALPHA','](https://example.com)'],['<','https://example.com/ALPHA','>'],['<','ALPHA@example.com','>']])test(`deleting either hidden edge of ${open+label+close} unwraps the other edge`,()=>{
 for(const backward of [true,false]){
  const doc=open+label+close+definition,caret=backward?open.length:open.length+label.length;
  let state=create(doc);state=state.update({selection:{anchor:caret}}).state;
  state=state.update({changes:{from:backward?0:caret,to:backward?caret:caret+close.length},selection:{anchor:backward?0:caret},userEvent:'delete'}).state;
  assert.equal(state.doc.toString(),label+definition);assert.equal(state.selection.main.head,backward?0:label.length);
  undo({state,dispatch:tr=>state=tr.state});assert.equal(state.doc.toString(),doc);
  redo({state,dispatch:tr=>state=tr.state});assert.equal(state.doc.toString(),label+definition);
 }
});
test('simultaneous deletion of both link markers is not repaired twice',()=>{
 let state=create('[ALPHA][]'+definition);state=state.update({selection:EditorSelection.create([EditorSelection.cursor(1),EditorSelection.cursor(6)])}).state;
 state=state.update({changes:[{from:0,to:1},{from:6,to:9}],userEvent:'delete'}).state;
 assert.equal(state.doc.toString(),'ALPHA'+definition);
});
test('ordinary deletion selections and source search can intentionally edit syntax',()=>{
 const doc='[ALPHA][]'+definition,spec={changes:{from:0,to:1},userEvent:'delete'};
 const isolated=()=>EditorState.create({doc,extensions:[imageDefinitionsField,livePreviewField,EditorState.transactionFilter.of(unwrapLiveInlineBoundary)]});
 let state=isolated().update({selection:{anchor:0,head:1}}).state;assert.equal(state.update(spec).newDoc.toString(),doc.slice(1));
 state=isolated().update({selection:{anchor:0,head:1},userEvent:'select.search'}).state;assert.equal(state.update(spec).newDoc.toString(),doc.slice(1));
});
test('read-only, composition and forwarded boundary deletions are not unwrapped',()=>{
 const doc='[ALPHA][]'+definition,spec={changes:{from:0,to:1},userEvent:'delete'},expected=doc.slice(1);
 const position=state=>state.update({selection:{anchor:1}}).state;
 assert.equal(position(create(doc,[EditorState.readOnly.of(true)])).update(spec).newDoc.toString(),expected);
 assert.equal(position(create(doc)).update({effects:liveComposition.of(true)}).state.update(spec).newDoc.toString(),expected);
 for(const annotation of [editableForwardedChange.of(true),editableProjectionSync.of(true)])assert.equal(position(create(doc)).update({...spec,annotations:annotation}).newDoc.toString(),expected);
});
