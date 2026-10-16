import test from 'node:test';
import assert from 'node:assert/strict';
import {EditorState,EditorSelection} from '@codemirror/state';
import {history,undo,redo} from '@codemirror/commands';
import {livePreviewField,normalizeLiveInlineWhitespace} from '../src/editor-live-preview.js';
import {retainFootnoteCaretPadding} from '../src/live-editable-block.js';
import {fieldPosition,fieldOffset} from '../src/projected-code.js';

const create=doc=>EditorState.create({doc,extensions:[livePreviewField,history(),EditorState.allowMultipleSelections.of(true),EditorState.transactionFilter.of(normalizeLiveInlineWhitespace)]});
for(const marker of ['**','*','~~','==','***'])test(`edge whitespace preserves ${marker} format, text, caret and history`,()=>{
 let state=create(marker+'alpha omega'+marker),start=marker.length+6;
 state=state.update({changes:{from:start,to:start+5},selection:{anchor:start},userEvent:'delete.backward'}).state;
 const expected=marker+'alpha'+marker+' ';assert.equal(state.doc.toString(),expected);assert.equal(state.selection.main.head,expected.length);
 undo({state,dispatch:tr=>{state=tr.state;}});assert.equal(state.doc.toString(),marker+'alpha omega'+marker);
 redo({state,dispatch:tr=>{state=tr.state;}});assert.equal(state.doc.toString(),expected);
 const initial=create(marker+'alpha omega'+marker),end=marker.length+5;
 const next=initial.update({changes:{from:marker.length,to:end},selection:{anchor:marker.length},userEvent:'delete.forward'}).state;
 assert.equal(next.doc.toString(),' '+marker+'omega'+marker);
});
test('paste edge whitespace, including nested styles, preserves all literal spaces',()=>{
 for(const marker of ['**','***','==']){
  const state=create(marker+'alpha'+marker),next=state.update({changes:{from:marker.length,to:marker.length+5,insert:'  beta  '},selection:{anchor:marker.length+8},userEvent:'input.paste'}).state;
  assert.equal(next.doc.toString(),'  '+marker+'beta'+marker+'  ');assert.equal(next.selection.main.head,next.doc.length);
 }
});
test('empty format wrappers disappear without creating a thematic break',()=>{
 for(const marker of ['**','*','~~','==','***']){
  const state=create(marker+'alpha'+marker),next=state.update({changes:{from:marker.length,to:marker.length+5},selection:{anchor:marker.length},userEvent:'delete.backward'}).state;
  assert.equal(next.doc.toString(),'');assert.equal(next.selection.main.head,0);
 }
});
test('unrelated source, direct marker edits, typing, and code stay untouched',()=>{
 const doc='**alpha omega**',from=doc.indexOf('omega');
 for(const event of ['input.type','undo','redo'])assert.equal(create(doc).update({changes:{from,to:from+5},userEvent:event}).state.doc.toString(),'**alpha **');
 assert.equal(create('`**alpha omega**`').update({changes:{from:9,to:14},userEvent:'delete.backward'}).state.doc.toString(),'`**alpha **`');
 assert.equal(create(doc).update({changes:{from:0,to:2},userEvent:'delete.backward'}).state.doc.toString(),'alpha omega**');
});
test('multiple reversed selections keep their identity across whitespace repairs',()=>{
 const doc='**alpha omega**\n==beta omega==',state=create(doc),hits=[...doc.matchAll(/omega/g)];
 const changes=hits.map(m=>({from:m.index,to:m.index+5,insert:' X '})),base=state.changes(changes);
 const selection=EditorSelection.create(hits.map(m=>EditorSelection.range(base.mapPos(m.index+5,1),base.mapPos(m.index,-1))),1);
 const next=state.update({changes,selection,userEvent:'input.paste'}).state;
 assert.equal(next.doc.toString(),'**alpha  X** \n==beta  X== ');assert.equal(next.selection.ranges.length,2);assert.equal(next.selection.mainIndex,1);
 assert.ok(next.selection.ranges.every(r=>r.anchor>r.head));
});
test('deleting an inner format leaves the outer style intact',()=>{
 const doc='**alpha *omega***',start=doc.indexOf('omega'),state=create(doc);
 assert.equal(state.update({changes:{from:start,to:start+5},selection:{anchor:start},userEvent:'delete.backward'}).state.doc.toString(),'**alpha** ');
});
test('moved spaces cannot create indented code or a new hard break',()=>{
 for(const [doc,insert,expected]of [
  ['**alpha**','    beta ','&#32;   **beta** '],
  ['***alpha***','    beta ','&#32;   ***beta*** '],
  ['**alpha**','\tbeta ','&#9;**beta** '],
  ['> **alpha**','    beta ','> &#32;   **beta** '],
  ['**alpha**\nnext','beta  ','**beta** &#32;\nnext'],
 ]){
  const state=create(doc),from=doc.indexOf('alpha'),next=state.update({changes:{from,to:from+5,insert},selection:{anchor:from+insert.length},userEvent:'input.paste'}).state;
  assert.equal(next.doc.toString(),expected);assert.ok(next.selection.main.head<=next.doc.length);
  assert.ok(next.field(livePreviewField).plan.marks.some(m=>m.className==='cm-live-strong'));
 }
});
test('footnote caret padding keeps inserted spaces editable without exposing the marker separator',()=>{
 const doc='[^n]:  **omega**',state=create(doc),item=state.field(livePreviewField).plan.widgets.find(item=>item.kind==='footnote-definition');
 const field=retainFootnoteCaretPadding(state.doc,item,EditorSelection.single(6));
 assert.equal(field.from,6);assert.equal(field.projection.text,' **omega**');
 for(let offset=0;offset<=field.projection.text.length;offset++)assert.equal(fieldOffset(field,fieldPosition(field,offset)),offset);
 const untouched=retainFootnoteCaretPadding(state.doc,item,EditorSelection.single(5));assert.equal(untouched.from,item.contentFrom);
 assert.equal(item.projection.text,'**omega**');
});
for(const[open,close]of [['<span data-md-color="spectrum-3-red">','</span>'],['[','](https://example.com "Title")'],['`','`'],...['u','sup','sub','kbd','mark'].map(tag=>[`<${tag}>`,`</${tag}>`])])test(`empty ${open} wrapper clears with content, retains nonempty spaces and history`,()=>{
 const doc=open+'X'+close;let state=create(doc);
 state=state.update({changes:{from:open.length,to:open.length+1},selection:{anchor:open.length},userEvent:'delete.backward'}).state;
 assert.equal(state.doc.toString(),'');assert.equal(state.selection.main.head,0);
 undo({state,dispatch:tr=>{state=tr.state;}});assert.equal(state.doc.toString(),doc);
 redo({state,dispatch:tr=>{state=tr.state;}});assert.equal(state.doc.toString(),'');
 assert.equal(create(doc).update({changes:{from:open.length,to:open.length+1,insert:' '},userEvent:'input.paste'}).state.doc.toString(),open+' '+close);
});
test('deleting a reference label leaves the shared definition and other links unchanged',()=>{
 const doc='[X][ref] and [Other][ref]\n\n[ref]: https://example.com "Shared"',state=create(doc);
 const next=state.update({changes:{from:1,to:2},selection:{anchor:1},userEvent:'delete.forward'}).state;
 assert.equal(next.doc.toString(),' and [Other][ref]\n\n[ref]: https://example.com "Shared"');
});
test('nested link/color/bold wrappers empty together but raw source edits are not normalized',()=>{
 const doc='[**<span data-md-color="spectrum-3-red">X</span>**](https://example.com)',from=doc.indexOf('X');
 assert.equal(create(doc).update({changes:{from,to:from+1},userEvent:'delete.forward'}).state.doc.toString(),'');
 const raw=EditorState.create({doc,extensions:[EditorState.transactionFilter.of(normalizeLiveInlineWhitespace)]});
 assert.equal(raw.update({changes:{from,to:from+1},userEvent:'delete.forward'}).state.doc.toString(),doc.replace('X',''));
});
