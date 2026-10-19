import test from 'node:test';
import assert from 'node:assert/strict';
import {marked} from 'marked';
import {inlineFormatEdit} from '../src/inline-format-toggle.js';
const apply=(doc,edit)=>doc.slice(0,edit.from)+edit.insert+doc.slice(edit.to);
const code=doc=>marked.Lexer.lexInline(doc).find(t=>t.type==='codespan')?.text;
for(const body of ['AL`PHA','`ALPHA','ALPHA`',' ALPHA ','A\\B','A``B','A&B','<tag>'])test(`remove/reapply code keeps literal ${JSON.stringify(body)}`,()=>{
 const delimiter='```',pad=body.startsWith('`')||body.endsWith('`')||body.startsWith(' ')&&body.endsWith(' ')?' ':'',raw=delimiter+pad+body+pad+delimiter;
 const removed=inlineFormatEdit(raw,0,raw.length,'`','`','',{rendered:true}),plain=apply(raw,removed);
 const added=inlineFormatEdit(plain,removed.anchor,removed.head,'`','`','',{rendered:true});
 assert.equal(code(apply(plain,added)),body);
});
test('live code application decodes escaped punctuation and entities once',()=>{
 for(const[source,text]of [['AL\\`PHA','AL`PHA'],['A&amp;B','A&B'],['A&amp;amp;B','A&amp;B'],['\\*text\\*','*text*'],['A\\\\B','A\\B'],['&lt;img&gt;','<img>'],['&#96;ALPHA&#96;','`ALPHA`']]){
  const edit=inlineFormatEdit(source,0,source.length,'`','`','',{rendered:true});assert.equal(code(edit.insert),text);
  assert.equal(edit.insert.slice(edit.anchor,edit.head),text);
 }
});
test('source mode keeps literal source escapes/entities while choosing safe delimiters',()=>{
 for(const source of ['AL\\`PHA','A&amp;B',' A ','A``B'])assert.equal(code(inlineFormatEdit(source,0,source.length,'`','`').insert),source);
});
test('only selected characters change, with accurate selection offsets',()=>{
 const source='Before AL\\`PHA After',from=7,to=14,edit=inlineFormatEdit(source,from,to,'`','`','',{rendered:true});
 assert.equal(apply(source,edit),'Before ``AL`PHA`` After');assert.equal(apply(source,edit).slice(edit.anchor,edit.head),'AL`PHA');
});
