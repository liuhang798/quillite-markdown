import test from 'node:test';
import assert from 'node:assert/strict';
import {EditorState,EditorSelection} from '@codemirror/state';
import {history,undo,redo,isolateHistory} from '@codemirror/commands';
import {marked} from 'marked';
import {inlineFormatEdit,formatSelectionEdits} from '../src/inline-format-toggle.js';
const edit=(source,from,to)=>inlineFormatEdit(source,from,to,'`','`','Code',{rendered:true});
const parsed=source=>marked.Lexer.lexInline(source);
const codes=source=>parsed(source).filter(t=>t.type==='codespan').map(t=>t.text);
const text=source=>parsed(source).map(t=>t.text||t.raw).join('');
for(const body of ['ALPHA','AL`PHA',' ALPHA ','A*B&C','A<B>C','A\\B','A``B'])test(`partial code preserves text and unselected styling: ${body}`,()=>{
 const raw='``` '+body+' ```';
 for(const[a,b]of [[1,body.length-1],[0,body.length-1],[1,body.length]]){
  const state=EditorState.create({doc:raw,selection:{anchor:4+a,head:4+b}}),next=state.update(formatSelectionEdits(state,edit)).state;
  assert.deepEqual(codes(next.doc.toString()),[body.slice(0,a),body.slice(b)].filter(Boolean));
  assert.equal(text(next.doc.toString()),body);
  assert.equal(text(next.sliceDoc(next.selection.main.from,next.selection.main.to)),body.slice(a,b));
 }
});
test('multiple selections in one code span are changed once and keep direction/main index',()=>{
 const doc='Before ``ABCDEFGH`` After';
 let state=EditorState.create({doc,selection:EditorSelection.create([EditorSelection.range(12,10),EditorSelection.range(14,16)],1),extensions:[history(),EditorState.allowMultipleSelections.of(true)]});
 const spec=formatSelectionEdits(state,edit);state=state.update({...spec,annotations:isolateHistory.of('full')}).state;
 assert.equal(state.doc.toString(),'Before `A`BC`DE`FG`H` After');
 assert.equal(state.selection.mainIndex,1);assert.deepEqual(state.selection.ranges.map(r=>[state.sliceDoc(r.from,r.to),r.anchor>r.head]),[['BC',true],['FG',false]]);
 assert.deepEqual(spec.formatEnds,state.selection.ranges.map(r=>r.to));
 state=state.update({selection:state.selection}).state;
 const view={get state(){return state;},dispatch(tr){state=tr.state;}};undo(view);assert.equal(state.doc.toString(),doc);redo(view);assert.equal(state.doc.toString(),'Before `A`BC`DE`FG`H` After');assert.ok(state.selection.ranges.every(r=>r.from<=r.to));
});
test('independent plain and code selections retain correct offsets',()=>{
 const doc='AA ``HELLO`` ZZ';const state=EditorState.create({doc,selection:EditorSelection.create([EditorSelection.range(0,2),EditorSelection.range(6,9),EditorSelection.range(15,13)],1),extensions:[EditorState.allowMultipleSelections.of(true)]});
 const next=state.update(formatSelectionEdits(state,edit)).state;
 assert.equal(next.doc.toString(),'`AA` `H`ELL`O` `ZZ`');assert.deepEqual(next.selection.ranges.map(r=>next.sliceDoc(r.from,r.to)),['AA','ELL','ZZ']);
});
test('whole literal code becomes inert prose instead of HTML/emphasis/entities',()=>{
 for(const body of ['<img src=x>','*bold*','A&amp;B','[link](https://example.com)','==mark==']){
  const raw='`'+body+'`',result=edit(raw,1,raw.length-1);assert.equal(text(result.insert),body);assert.deepEqual(codes(result.insert),[]);
 }
});
test('footnote partial code changes only the intended definition body',()=>{
 const source='Note[^n]\n\n[^n]: ``ALPHA``\n\nAfter',from=source.indexOf('LPH'),result=edit(source,from,from+3);
 assert.equal(source.slice(0,result.from)+result.insert+source.slice(result.to),'Note[^n]\n\n[^n]: `A`LPH`A`\n\nAfter');
});
test('an unselected code caret stays on its text when another range splits the same span',()=>{
 const doc='``ABCDEFGH``';const state=EditorState.create({doc,selection:EditorSelection.create([EditorSelection.range(3,5),EditorSelection.cursor(8)],1),extensions:[EditorState.allowMultipleSelections.of(true)]});
 const next=state.update(formatSelectionEdits(state,edit)).state;
 assert.equal(next.doc.toString(),'`A`BC`DEFGH`');assert.equal(next.doc.sliceString(next.selection.main.head,next.selection.main.head+1),'G');assert.ok(next.selection.main.empty);
 assert.equal(edit(doc,4,4),null);
});
