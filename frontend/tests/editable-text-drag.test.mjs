import test from 'node:test';
import assert from 'node:assert/strict';
import { EditorState } from '@codemirror/state';
import { textDragTransaction, matchesTextDrag } from '../src/editable-text-drag.js';
import { safeCellInsertion } from '../src/live-editable-block.js';
import {editorLivePreview,renderedEditableBlocks} from '../src/editor-live-preview.js';
import {prepareFootnotes} from '../src/markdown-formats.js';
const apply=(source,transaction)=>EditorState.create({doc:source}).update(transaction).newDoc.toString();

test('stale drag records cannot intercept unrelated external text or file drops',()=>{
  const drag={type:'application/x-quillite-text-drag-test'};
  assert.equal(matchesTextDrag({dataTransfer:{types:['text/plain',drag.type]}},drag),true);
  for (const types of [['text/plain'],['Files'],['text/html','text/plain']]) {
    assert.equal(matchesTextDrag({dataTransfer:{types}},drag),false);
  }
  assert.equal(matchesTextDrag({},drag),false);
  assert.equal(matchesTextDrag({dataTransfer:{types:[drag.type]}},null),false);
});

test('text move in either direction uses original positions and selects inserted text',()=>{
  let tr=textDragTransaction('ABC DEF',{from:0,to:3},7,true);
  assert.equal(apply('ABC DEF',tr),' DEFABC'); assert.deepEqual(tr.selection,{anchor:4,head:7});
  tr=textDragTransaction('ABC DEF',{from:4,to:7},0,true);
  assert.equal(apply('ABC DEF',tr),'DEFABC '); assert.deepEqual(tr.selection,{anchor:0,head:3});
});
test('copy retains source and marks the transaction as input rather than move',()=>{
  const tr=textDragTransaction('ABC DEF',{from:0,to:3},7,false);
  assert.equal(apply('ABC DEF',tr),'ABC DEFABC'); assert.equal(tr.userEvent,'input.drop');
});
test('drop into own selection and invalid source positions do not mutate',()=>{
  for (const position of [0,1,3,-1,99,NaN]) assert.equal(textDragTransaction('ABC DEF',{from:0,to:3},position,true),null);
  assert.equal(textDragTransaction('ABC',{from:1,to:1},3,true),null);
  assert.equal(textDragTransaction('ABC',{from:-1,to:1},3,true),null);
});
test('table drop sanitizes separators and newlines before calculating selection',()=>{
  const source='a|b\nc destination';
  const tr=textDragTransaction(source,{from:0,to:5},source.length,true,[],safeCellInsertion);
  assert.equal(apply(source,tr),' destinationa\\|b c');
  assert.equal(tr.selection.head-tr.selection.anchor,6);
});
test('partial code selection moves content, not retained closing fence',()=>{
  const source='```text\nABC\nDEF\n```\n\nprose\n\nend';
  const block={kind:'code',from:0,to:19,contentFrom:8,contentTo:15};
  const tr=textDragTransaction(source,{from:13,to:26},source.length,true,[block]);
  assert.equal(apply(source,tr),'```text\nABC\nD\n```\n\nendEF\n\nprose');
});
test('whole code block moves to a paragraph boundary with its complete fence',()=>{
  const source='```\nABC\n```\n\nend\n\n';
  const tr=textDragTransaction(source,{from:0,to:11},source.length,true,[{kind:'code',from:0,to:11,contentFrom:4,contentTo:8}]);
  assert.equal(apply(source,tr),'\n\nend\n\n```\nABC\n```');
});

test('whole block move and copy split destination prose without joining paragraphs',()=>{
  const blockText='```\nABC\n```',source=`${blockText}\n\n目标段落`;
  const block={kind:'code',from:0,to:blockText.length,contentFrom:4,contentTo:7};
  for (const move of [true,false]) {
    const tr=textDragTransaction(source,{from:0,to:blockText.length+2},source.indexOf('段落'),move,[block]);
    assert.equal(apply(source,tr),`${move?'':blockText+'\n\n'}目标\n\n${blockText}\n\n段落`);
  }
});

test('whole block boundaries retain existing blank lines and handle document edges',()=>{
  const blockText='```\nABC\n```',source=`before\n\n${blockText}\n\nafter`;
  const from=source.indexOf('```'),to=from+blockText.length;
  const block={kind:'code',from,to,contentFrom:from+4,contentTo:to-4};
  assert.equal(apply(source,textDragTransaction(source,{from,to},0,false,[block])),`${blockText}\n\n${source}`);
  assert.equal(apply(source,textDragTransaction(source,{from,to},source.length,false,[block])),`${source}\n\n${blockText}`);
  const spaced=source+'\n\n';
  assert.equal(apply(spaced,textDragTransaction(spaced,{from,to},spaced.length,false,[block])),spaced+blockText);
});

test('whole block drops into single-line fields do not add paragraph breaks',()=>{
  const blockText='```\nABC\n```',source=blockText+'\n\ncell';
  const block={kind:'code',from:0,to:blockText.length,contentFrom:4,contentTo:7};
  for (const destination of [{kind:'table',cells:[{from:source.length-4,to:source.length}]},
    {kind:'details',cells:[{from:source.length-4,to:source.length,role:'summary'}]}]) {
    const tr=textDragTransaction(source,{from:0,to:blockText.length},source.length,false,[block,destination],safeCellInsertion);
    assert.equal(apply(source,tr),source+safeCellInsertion(blockText));
  }
});

const wrap=body=>'<details open>\n<summary>Destination</summary>\n\n'+body+'\n\n</details>';
for(const[scope,body,prefix]of [['plain','TARGET\n\nAFTER',''],['quote','> TARGET\n>\n> AFTER','> '],['list','- TARGET\n\n  AFTER','  '],['details',wrap('TARGET\n\nAFTER'),''],['details-list',wrap('- TARGET\n\n  AFTER'),'  ']]) {
  for(const[kind,block]of [['code','```text\nALPHA\n```'],['table','| Head |\n| --- |\n| ALPHA |'],['details','<details open>\n<summary>Title</summary>\n\nALPHA\n\n</details>']]) {
    for(const move of [false,true])test(`whole ${kind} ${move?'move':'copy'} retains ${scope} footnote target`,()=>{
      const selected='START\n\n'+block+'\n\n',tail='OUTSIDE\n\nRef[^n]\n\n[^n]: '+body.replaceAll('\n','\n    '),source=selected+tail;
      const state=EditorState.create({doc:source,extensions:editorLivePreview});
      const tr=textDragTransaction(source,{from:0,to:selected.length},source.indexOf('TARGET')+3,move,renderedEditableBlocks(state),text=>text.replaceAll('\n','\n    '));
      const inserted=('\n\n'+selected).replaceAll('\n','\n    '+prefix);
      const expected=(move?'':selected)+tail.replace('TARGET','TAR'+inserted+'GET');
      assert.equal(apply(source,tr),expected);
      const note=prepareFootnotes(expected).definitions.get('n');
      assert.ok(note.text.includes('ALPHA'));assert.ok(note.text.includes('AFTER'));assert.ok(note.text.includes('GET'));
      assert.equal(tr.changes.apply(state.doc).sliceString(tr.selection.anchor,tr.selection.head),inserted);
    });
  }
}
