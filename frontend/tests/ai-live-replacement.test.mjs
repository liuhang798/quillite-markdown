import test from 'node:test';
import assert from 'node:assert/strict';
import {EditorState} from '@codemirror/state';
import {livePreviewField,liveAIReplacement} from '../src/editor-live-preview.js';

const cases=[
 ['table','| Head | Other |\n| --- | --- |\n| Alpha | Cell |','Beta\nGamma | X','Beta Gamma \\| X'],
 ['escaped pipe','| Head |\n| --- |\n| Alpha |','Beta \\| X','Beta \\| X'],
 ['footnote','Ref[^n]\n\n[^n]: Alpha','Beta\nGamma','Beta\n    Gamma'],
 ['existing footnote prefix','Ref[^n]\n\n[^n]: Alpha','Beta\n    Gamma','Beta\n    Gamma'],
 ['quote','> Alpha','Beta\nGamma','Beta\n> Gamma'],
 ['existing quote prefix','> Alpha','Beta\n> Gamma','Beta\n> Gamma'],
 ['list','- Alpha','Beta\nGamma','Beta\n  Gamma'],
 ['quote list','> - Alpha','Beta\nGamma','Beta\n>   Gamma'],
 ['quoted code','> ```text\n> Alpha\n> ```','Beta\nGamma','Beta\n> Gamma'],
 ['CRLF','Ref[^n]\n\n[^n]: Alpha','Beta\r\nGamma','Beta\n    Gamma'],
 ['summary','<details open>\n<summary>Alpha</summary>\n\nBody\n\n</details>','Beta\n<x>','Beta &lt;x&gt;'],
 ['ordinary prose','Alpha','Beta\nGamma','Beta\nGamma'],
];
for(const[name,block,reply,expected]of cases)test('live AI replacement: '+name,()=>{
 const doc='Before\n\n'+block+'\n\nAfter',from=doc.indexOf('Alpha');const state=EditorState.create({doc,extensions:[livePreviewField]});
 const spec=liveAIReplacement(state,from,from+5,reply),tr=state.update(spec);assert.equal(tr.newDoc.toString(),doc.replace('Alpha',expected));assert.equal(tr.newSelection.main.head,from+expected.length);
});
test('AI replacing complete source blocks does not re-add their container prefixes',()=>{
 for(const block of ['> Alpha','- Alpha','| Head |\n| --- |\n| Alpha |']){
  const doc='Before\n\n'+block+'\n\nAfter',from=doc.indexOf(block),state=EditorState.create({doc,extensions:[livePreviewField]});
  assert.equal(state.update(liveAIReplacement(state,from,from+block.length,'Beta\nGamma')).newDoc.toString(),'Before\n\nBeta\nGamma\n\nAfter');
 }
});
test('AI multiline source with existing continuation prefixes stays idempotent',()=>{
 const doc='Ref[^n]\n\n[^n]: Alpha\n    Tail',from=doc.indexOf('Alpha'),state=EditorState.create({doc,extensions:[livePreviewField]});
 assert.equal(state.update(liveAIReplacement(state,from,doc.length,'Beta\n    Tail')).newDoc.toString(),doc.replace('Alpha','Beta'));
});

test('AI crossing from a projected field to prose keeps an existing prefix only once',()=>{
 for(const[block,selected,reply,expected]of[
  ['Ref[^n]\n\n[^n]: Alpha\n    Tail\n\nAfter tail','Alpha\n    Tail\n\nAfter','Beta\n    Gamma','Ref[^n]\n\n[^n]: Beta\n    Gamma\n\n tail'],
  ['> ```text\n> Alpha\n> Keep\n> ```\n\nAfter tail','Alpha\n> Keep\n> ```\n\nAfter','Beta\n> Gamma','> ```text\n> Beta\n> Gamma\n> ```\n\n tail'],
  ['Ref[^n]\n\n[^n]: Alpha\n    Tail\n\nAfter tail','Alpha\n    Tail\n\nAfter','Beta\n        Gamma','Ref[^n]\n\n[^n]: Beta\n        Gamma\n\n tail'],
 ]){
  const from=block.indexOf(selected),state=EditorState.create({doc:block,extensions:[livePreviewField]});
  assert.equal(state.update(liveAIReplacement(state,from,from+selected.length,reply)).newDoc.toString(),expected);
 }
});
