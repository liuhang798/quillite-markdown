import test from 'node:test';
import assert from 'node:assert/strict';
import { annotationKey, captureAnchor, findAnchor, decodeAnnotations } from '../src/reading-anchors.js';
const ps=(...strings)=>strings.map(text=>({tag:'P',text}));
test('persistent path identity is platform aware and keeps independent files separate',()=>{
  assert.equal(annotationKey('C:\\Dir\\One.MD',true),annotationKey('c:/dir/one.md',true));
  assert.notEqual(annotationKey('/A.md',false),annotationKey('/a.md',false));
  assert.notEqual(annotationKey('/a/notes.md',false),annotationKey('/b/notes.md',false));
});
test('restore a quote across block insertions with its context, not the old position',()=>{
  const a=captureAnchor(ps('Intro','Read this sentence.','End'),1,5,'this','r1');
  assert.deepEqual(findAnchor(ps('New','Intro','Read this sentence.','End'),a,'r2'),{block:2,at:5});
  assert.equal(findAnchor(ps('Intro','this is something else.','End'),a,'r2'),null);
  assert.equal(findAnchor(ps('Read this sentence.','Read this sentence.'),a,'r2'),null);
});
test('ambiguous old quotes can use unchanged revision only, even if just one copy now survives',()=>{
  const old=ps('the key here','the key here');
  const a=captureAnchor(old,1,4,'key','r1');
  assert.equal(a.ambiguous,true);assert.deepEqual(findAnchor(old,a,'r1'),{block:1,at:4});
  assert.equal(findAnchor(ps('the key here'),a,'r2'),null);
});
test('whole paragraph uses its neighbors; do not match a whole isolated quote blindly',()=>{
  const a=captureAnchor(ps('A','Whole','B'),1,0,'Whole','r1');
  assert.deepEqual(findAnchor(ps('New','A','Whole','B'),a,'r2'),{block:2,at:0});
  assert.equal(findAnchor(ps('New','Whole','B'),a,'r2'),null);
  assert.equal(findAnchor(ps('Whole'),captureAnchor(ps('Whole'),0,0,'Whole','r1'),'r2'),null);
});
test('never silently discard malformed stored data or match across protected rich content',()=>{
  assert.throws(()=>decodeAnnotations('{"version":2}'));assert.throws(()=>decodeAnnotations('[{}]'));
  assert.equal(captureAnchor(ps('a\0b'),0,0,'ab','r'),null);
});
