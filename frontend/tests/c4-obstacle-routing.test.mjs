import test from 'node:test';
import assert from 'node:assert/strict';
import {c4ObstacleRoute,c4SegmentHitsBox,c4SelfLoop,c4CaptionPosition} from '../src/c4-obstacle-routing.js';
const boxes=[0,250,500].map(x=>({x,y:0,width:100,height:80}));
test('long captions do not close the port exit corridor',()=>{
 const route=c4ObstacleRoute({x:100,y:40},{x:500,y:40},boxes,{width:720,height:40});
 assert.ok(route);assert.ok(route.label.y<0||route.label.y>80);
 for(let i=1;i<route.points.length;i++)for(const box of boxes)assert.equal(c4SegmentHitsBox(route.points[i-1],route.points[i],box),false);
});
test('caption placement avoids nodes, other captions and crossing segments',()=>{
 const candidates=[{x:50,y:50},{x:100,y:50},{x:150,y:50},{x:200,y:50}];
 const position=c4CaptionPosition(candidates,{width:30,height:20},[{x:40,y:40,width:20,height:20},{x:90,y:40,width:20,height:20}],[[{x:150,y:0},{x:150,y:100}]]);
 assert.deepEqual(position,candidates[3]);
 assert.equal(c4CaptionPosition(candidates.slice(0,1),{width:30,height:20},[{x:40,y:40,width:20,height:20}]),null);
 assert.equal(c4CaptionPosition(candidates,{width:Infinity,height:20},[]),null);
});
test('composite person bounds permit a shoulder port and avoid the head',()=>{
 const parts=[{x:220,y:223,width:216,height:94},{x:278,y:137,width:100,height:100},{x:676,y:137,width:216,height:122},{x:1132,y:137,width:242,height:64}];
 const route=c4ObstacleRoute({x:397,y:223.2},{x:1132.24,y:176.5},parts,{width:80,height:20});
 assert.ok(route);assert.deepEqual(route.points[0],{x:397,y:223.2});
 for(let i=2;i<route.points.length-1;i++)for(const box of parts)assert.equal(c4SegmentHitsBox(route.points[i-1],route.points[i],box),false);
});
test('repeated obstacle routes have distinct channels and captions',()=>{
 const routes=Array.from({length:3},(_,lane)=>c4ObstacleRoute({x:100,y:40},{x:500,y:40},boxes,{width:80,height:20,lane}));
 assert.ok(routes.every(Boolean));assert.equal(new Set(routes.map(r=>r.d)).size,3);
 for(let i=1;i<routes.length;i++)assert.ok(Math.abs(routes[i].label.y-routes[i-1].label.y)>=30);
});
test('self loops remain outside the owner and preserve the original port',()=>{
 const point={x:100,y:40},box=boxes[0],loops=Array.from({length:3},(_,lane)=>c4SelfLoop(point,[box],{width:80,height:20,lane}));
 for(const loop of loops){assert.ok(loop);assert.deepEqual(loop.points[0],point);assert.deepEqual(loop.points.at(-1),point);for(let i=1;i<loop.points.length;i++)assert.equal(c4SegmentHitsBox(loop.points[i-1],loop.points[i],box),false);}
 assert.equal(new Set(loops.map(r=>r.d)).size,3);
 for(let i=1;i<loops.length;i++)assert.ok(loops[i].label.x-loops[i-1].label.x>80);
});
test('self-loop captions avoid adjacent relations without entering a neighbour',()=>{
 const point={x:100,y:40},reserved=[{x:180,y:30,width:90,height:20}];
 const loop=c4SelfLoop(point,boxes,{width:80,height:20},reserved);
 assert.ok(loop);assert.notEqual(loop.label.y,40);
 for(let i=1;i<loop.points.length;i++)for(const box of boxes)assert.equal(c4SegmentHitsBox(loop.points[i-1],loop.points[i],box),false);
 assert.deepEqual(loop.points[0],point);assert.deepEqual(loop.points.at(-1),point);
});
test('vertical captions stay on separated outer channels even with unequal widths',()=>{
 const vertical=boxes.map(b=>({x:0,y:b.x,width:80,height:100}));
 const routes=[160,60,70].map((width,lane)=>c4ObstacleRoute({x:40,y:100},{x:40,y:500},vertical,{width,height:20,channelWidth:160,lane}));
 assert.ok(routes.every(Boolean));
 for(const route of routes)assert.ok(route.label.y>100&&route.label.y<500);
 for(let i=1;i<routes.length;i++)assert.ok(Math.abs(routes[i].label.x-routes[i-1].label.x)>160);
});
test('C4 routes around intermediate nodes without changing ports',()=>{
 for(const [start,end]of [[{x:500,y:40},{x:100,y:40}],[{x:100,y:40},{x:500,y:40}]]){
  const route=c4ObstacleRoute(start,end,boxes,{width:80,height:20});assert.ok(route);
  assert.deepEqual(route.points[0],start);assert.deepEqual(route.points.at(-1),end);
  for(let i=1;i<route.points.length;i++)for(const box of boxes)assert.equal(c4SegmentHitsBox(route.points[i-1],route.points[i],box),false);
  assert.ok(route.label.y<0||route.label.y>80);
 }
});
test('C4 vertical routes preserve endpoints and avoid every node',()=>{
 const vertical=boxes.map(b=>({x:0,y:b.x,width:80,height:100})),start={x:40,y:100},end={x:40,y:500};
 const route=c4ObstacleRoute(start,end,vertical,{width:100,height:30,offsetX:12,offsetY:-8});assert.ok(route);
 assert.deepEqual(route.points[0],start);assert.deepEqual(route.points.at(-1),end);
 for(let i=1;i<route.points.length;i++)for(const box of vertical)assert.equal(c4SegmentHitsBox(route.points[i-1],route.points[i],box),false);
});
test('wide labels do not consume the vertical gap between stacked nodes',()=>{
 const stacked=[0,172,344].map(y=>({x:0,y,width:200,height:100}));
 const route=c4ObstacleRoute({x:100,y:100},{x:100,y:344},stacked,{width:110,height:34});
 assert.ok(route);assert.ok(route.label.x<0||route.label.x>200);
});
test('C4 intersection treats touching borders as safe, not crossing interiors',()=>{
 const b=boxes[0];assert.equal(c4SegmentHitsBox({x:-20,y:40},{x:120,y:40},b),true);
 assert.equal(c4SegmentHitsBox({x:0,y:0},{x:100,y:0},b),false);
 assert.equal(c4SegmentHitsBox({x:100,y:40},{x:120,y:40},b),false);
 assert.equal(c4SegmentHitsBox({x:-20,y:-20},{x:120,y:100},b),true);
 assert.equal(c4ObstacleRoute({x:NaN,y:0},{x:0,y:0},boxes),null);
 assert.equal(c4ObstacleRoute({x:100,y:40},{x:500,y:40},[{x:0,y:0,width:Infinity,height:80}]),null);
});
