import test from 'node:test';
import assert from 'node:assert/strict';
import {EditorState} from '@codemirror/state';
import {buildLivePlan} from '../src/editor-live-preview.js';
import {fieldInsertion,fieldPosition} from '../src/projected-code.js';
import {emptyCodeSeparator} from '../src/code-fence-editing.js';

for(const prefix of ['', '> ', '> > ', '  '])for(const loose of [false,true])test(`empty fence retains user newlines ${JSON.stringify(prefix)} loose=${loose}`,()=>{
 const intro=prefix==='  '?'- Item\n\n':'';
 const wrap=text=>'Before\n\n'+intro+text.replace(/^/gm,prefix)+'\n\nAfter';
 const original=wrap('```text\n'+(loose?'\n':'')+'```');
 const item=buildLivePlan(original).widgets.find(w=>w.kind==='code');assert.ok(item);
 const range={from:item.contentFrom,to:item.contentTo,projection:item.projection};
 for(const input of ['alpha','\n','alpha\n','\n\n']){
  const doc=EditorState.create({doc:original}).doc,suffix=emptyCodeSeparator(doc,item,range);
  assert.equal(suffix,loose?'':'\n');
  // Match an inner insertion, not whole-range replacement: an existing empty
  // line can include a hidden separator outside the literal field positions.
  const at=fieldPosition(range,0);
  const next=original.slice(0,at)+fieldInsertion(range,input+suffix)+original.slice(at);
  assert.equal(next,wrap('```text\n'+input+'\n```'));
  const after=buildLivePlan(next).widgets.find(w=>w.kind==='code');assert.equal(after.text,input);
 }
});

test('separator is not added to other fields or non-empty / indented code',()=>{
 const doc=EditorState.create({doc:'alpha'}).doc;
 assert.equal(emptyCodeSeparator(doc,{kind:'table'},{from:0,to:0}),'');
 assert.equal(emptyCodeSeparator(doc,{kind:'code',indented:true},{from:0,to:0}),'');
 assert.equal(emptyCodeSeparator(doc,{kind:'code'},{from:0,to:5}),'');
});
