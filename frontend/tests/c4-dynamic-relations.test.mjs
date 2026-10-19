import assert from 'node:assert/strict';
import test from 'node:test';
import {readFileSync} from 'node:fs';
import {c4RelationLane,c4RelationLaneSpacing,c4LocalMarkerId} from '../src/c4-dynamic-relations.js';
import {patchMermaidC4Dynamic} from '../scripts/mermaid-c4-dynamic.mjs';
const original=readFileSync(new URL('../node_modules/mermaid/dist/mermaid.min.js',import.meta.url),'utf8');
test('C4 arrow references resolve only local SVG fragments',()=>{
 for(const value of ['url(#arrow)','url("#arrow")',"url('#arrow')",'url( #arrow )'])assert.equal(c4LocalMarkerId(value),'arrow');
 for(const value of [null,'none','url(https://example.org/#arrow)','url(//example.org/#arrow)','url(data:image/svg+xml,x)','url(#a) red','url(#a b)'])assert.equal(c4LocalMarkerId(value),null);
});
test('C4 lane spacing accounts for horizontal, vertical and diagonal label bounds',()=>{
 const start={x:0,y:0},boxes=[{width:100,height:30},{width:80,height:40}];
 assert.equal(c4RelationLaneSpacing(start,{x:100,y:0},boxes),58);
 assert.equal(c4RelationLaneSpacing(start,{x:0,y:100},boxes),118);
 assert.ok(Math.abs(c4RelationLaneSpacing(start,{x:100,y:100},boxes)-(130/Math.sqrt(2)+18))<1e-9);
 assert.equal(c4RelationLaneSpacing(start,start,boxes),32);
 assert.equal(c4RelationLaneSpacing(start,{x:100,y:0},[{width:Infinity,height:20}]),32);
});
test('C4 dynamic patch fails closed and sets kind before adding relationships',()=>{
 const patched=patchMermaidC4Dynamic(original);
 for(const source of ['different',original+original,patched])assert.throws(()=>patchMermaidC4Dynamic(source),/dynamic structure changed/);
 const actions=patched.match(/case 17:return this\.yy\.setC4Type[^]+?case 22:/)?.[0];assert.ok(actions);
 const lexer=new Function('kind',`switch(kind){${actions.slice(0,-8)}}`);
 for(const[index,kind]of ['C4Context','C4Container','C4Component','C4Dynamic','C4Deployment'].entries()){
  let type;const token=lexer.call({yy:{setC4Type(value){type=value;}}},17+index);assert.equal(type,kind);assert.equal(token,[11,15,16,17,18][index]);
 }
});
test('C4Dynamic preserves repeated events in order while context keeps upstream replacement semantics',()=>{
 const patched=patchMermaidC4Dynamic(original);
 const body=patched.match(/YWe=s\((function\(e,t,r,n,i,a,o,l,u\)\{[^]+?\}),"addRel"/)[1];
 for(const kind of ['C4Dynamic','C4Context','C4Container']){
  const rels=[],add=new Function('lb','CJ','Zp','Od',`return (${body});`)(rels,kind,()=>{},()=>false);
  add('rel','a','b','Request');add('rel','a','b','Confirm');add('rel_b','a','b','Response');
  assert.deepEqual(rels.map(r=>r.label.text),kind==='C4Dynamic'?['Request','Confirm','Response']:['Response']);
  assert.equal(rels.at(-1).type,'rel_b');
 }
});
test('C4 relation lanes retain endpoints, distinguish reverse edges and reject degenerate geometry',()=>{
 const start={x:10,y:20},end={x:110,y:20};
 const a=c4RelationLane(start,end,0,3,40),b=c4RelationLane(start,end,1,3,40),c=c4RelationLane(start,end,2,3,40);
 assert.equal(a.d,'M 10,20 Q 60,-60 110,20');assert.equal(b.d,'M 10,20 Q 60,20 110,20');assert.equal(c.d,'M 10,20 Q 60,100 110,20');
 assert.equal(c4RelationLane(end,start,2,3,40,true).dy,c.dy);
 assert.equal(c4RelationLane(start,start,0,2,40),null);assert.equal(c4RelationLane(start,{x:NaN,y:20},0,2,40),null);assert.equal(c4RelationLane(start,end,0,1,40),null);
 assert.deepEqual(start,{x:10,y:20});assert.deepEqual(end,{x:110,y:20});
});
