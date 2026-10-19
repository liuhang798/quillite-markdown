import test from 'node:test';
import assert from 'node:assert/strict';
import {EditorState,EditorSelection} from '@codemirror/state';
import {history,undo,redo} from '@codemirror/commands';
import {marked} from 'marked';
import {livePreviewField,protectLiveInlineCode} from '../src/editor-live-preview.js';
import {inlineCodeText} from '../src/inline-code-syntax.js';
import {inlineFormatEdit} from '../src/inline-format-toggle.js';
import {selectionHistory,withSelectionHistory} from '../src/selection-history.js';
const create=doc=>EditorState.create({doc,extensions:[livePreviewField,history(),selectionHistory,EditorState.allowMultipleSelections.of(true),EditorState.transactionFilter.of(protectLiveInlineCode)]});
const codes=source=>{const result=[];marked.walkTokens(marked.lexer(source),t=>{assert.notEqual(t.type,'code','must not create a fenced block');if(t.type==='codespan')result.push(t.text);});return result;};
for(const body of ['ALPHA\nBE`TA','ALPHA\nBE``TA','A`\nB``\n# TITLE',' ALPHA \n BETA ','A\n\nB','\nALPHA\n','<img>\n**bold**\n&copy;'])test('line serializer preserves literal text '+JSON.stringify(body),()=>{
 const code=inlineCodeText(body);assert.deepEqual(codes(code.text),body.split('\n').filter(Boolean));
 for(let i=0;i<body.length;i++)if(body[i]!=='\n')assert.equal(code.text[code.position(i)],body[i]);
});
for(const prefix of ['', '> ', '  '])test('editing multiline code keeps prose/container, caret and history '+JSON.stringify(prefix),()=>{
 const lead=prefix==='  '?'- ':prefix,raw=lead+'``ALPHA\n'+prefix+'BETA``',doc='Before\n\n'+raw+'\n\nAfter',at=doc.indexOf('BETA')+2;
 let state=create(doc).update({selection:{anchor:at}}).state;
 state=state.update({...state.replaceSelection('``'),userEvent:'input.type'}).state;const edited=state.doc.toString();
 assert.equal(edited,'Before\n\n'+lead+'``ALPHA``\n'+prefix+'```BE``TA```\n\nAfter');assert.deepEqual(codes(edited),['ALPHA','BE``TA']);
 assert.deepEqual(codes(state.update({...state.replaceSelection('Q'),userEvent:'input.type'}).newDoc.toString()),['ALPHA','BE``QTA']);
 const dispatch=tr=>state=withSelectionHistory([tr])[0].state;undo({state,dispatch});assert.equal(state.doc.toString(),doc);redo({state,dispatch});assert.equal(state.doc.toString(),edited);
});
test('paste preserves literal prefix but Enter keeps its automatic quote/list continuation',()=>{
 for(const[lead,prefix]of [['> ','> '],['- ','  ']]){
  const doc=lead+'`ALPHA`',at=doc.indexOf('ALPHA')+2,initial=create(doc).update({selection:{anchor:at}}).state;
  for(const event of ['input.paste','input.type','input']){
   const insert='\n'+prefix+'BETA',tr=initial.update({...initial.replaceSelection(insert),userEvent:event});
   assert.deepEqual(codes(tr.newDoc.toString()),['AL',event==='input'?'BETAPHA':prefix+'BETAPHA']);
   assert.ok(tr.newDoc.toString().split('\n')[1].startsWith(prefix));
  }
 }
});
test('Enter generated list markers stay structural instead of becoming literal code',()=>{
 for(const[lead,next]of [['- ','- '],['1. ','2. '],['> - ','> - '],['- [x] ','- [ ] ']]){
  const doc=lead+'``AL`PHA``',at=doc.indexOf('PHA'),state=create(doc).update({selection:{anchor:at}}).state;
  const changed=state.update({...state.replaceSelection('\n'+next),userEvent:'input'}).newDoc.toString();
  assert.deepEqual(codes(changed),['AL`','PHA']);assert.ok(changed.split('\n')[1].startsWith(next));
 }
});
test('multiline literal paste keeps all code punctuation and unaffected neighbours',()=>{
 const doc='BEFORE `ALPHA` AFTER',at=doc.indexOf('ALPHA')+2,insert='ONE`\nTWO``\n# THREE';let state=create(doc).update({selection:{anchor:at}}).state;
 state=state.update({...state.replaceSelection(insert),userEvent:'input.paste'}).state;
 assert.deepEqual(codes(state.doc.toString()),['ALONE`','TWO``','# THREEPHA']);assert.ok(state.doc.toString().startsWith('BEFORE '));assert.ok(state.doc.toString().endsWith(' AFTER'));
 assert.deepEqual(codes(state.update({...state.replaceSelection('Q'),userEvent:'input.type'}).newDoc.toString()),['ALONE`','TWO``','# THREEQPHA']);
});
test('multi-caret multiline edits map every caret through code delimiters',()=>{
 let state=create('`ALPHA` + `OMEGA`').update({selection:EditorSelection.create([EditorSelection.cursor(3),EditorSelection.cursor(12)],1)}).state;
 state=state.update({...state.replaceSelection('`\n'),userEvent:'input.paste'}).state;
 assert.deepEqual(codes(state.doc.toString()),['AL`','PHA','O`','MEGA']);assert.equal(state.selection.mainIndex,1);
 assert.deepEqual(codes(state.update({...state.replaceSelection('Q'),userEvent:'input.type'}).newDoc.toString()),['AL`','QPHA','O`','QMEGA']);
});
test('toolbar code application and partial removal cannot create a fenced block',()=>{
 const source='ALPHA\nBE``TA',edit=inlineFormatEdit(source,0,source.length,'`','`','',{rendered:true});assert.deepEqual(codes(edit.insert),['ALPHA','BE``TA']);
 const doc='``ALPHA\nBE`TA``',partial=inlineFormatEdit(doc,2,4,'`','`','',{rendered:true});assert.deepEqual(codes(partial.insert),['PHA','BE`TA']);assert.ok(partial.insert.startsWith('AL'));
});
test('partly unwrapping multiline code keeps quote/list/footnote continuation outside code',()=>{
 for(const[lead,prefix]of [['> ','> '],['- ','  '],['[^n]: ','    '],['[^n]: ','\t']]){
  const source=lead+'``ALPHA\n'+prefix+'BE`TA``',from=source.indexOf('ALPHA'),edit=inlineFormatEdit(source,from,from+2,'`','`','',{rendered:true});
  assert.equal(source.slice(0,edit.from)+edit.insert+source.slice(edit.to),lead+'AL`PHA`\n'+prefix+'``BE`TA``');
 }
});
test('whole multiline removal retains container prefixes and escapes only literal punctuation',()=>{
 for(const[lead,prefix]of [['> ','> '],['- ','  '],['[^n]: ','    '],['[^n]: ','\t']]){
  const source=lead+'``ALPHA\n'+prefix+'BE`TA``',from=source.indexOf('ALPHA'),to=source.indexOf('TA')+2;
  const edit=inlineFormatEdit(source,from,to,'`','`','',{rendered:true});
  assert.equal(source.slice(0,edit.from)+edit.insert+source.slice(edit.to),lead+'ALPHA\n'+prefix+'BE\\`TA');
 }
});
