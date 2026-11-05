import test from 'node:test';
import assert from 'node:assert/strict';
import {fitDiagram,constrainDiagram,zoomDiagram} from '../src/diagram-viewer-geometry.js';
const size={width:2000,height:1000},viewport={width:800,height:600};
test('fit shows the entire chart, preserves aspect ratio and never enlarges a small chart',()=>{
 assert.equal(fitDiagram(size,viewport),.376);
 assert.equal(fitDiagram({width:200,height:100},viewport),1);
 const scale=fitDiagram({width:100000,height:2000},viewport);
 assert.ok(scale<.1&&scale>0);
});
test('zoom keeps the pointed chart location stable until a pan boundary',()=>{
 const before={x:-500,y:-200,scale:1},anchor={x:300,y:250};
 const after=zoomDiagram(before,2,anchor,size,viewport);
 assert.equal((anchor.x-before.x)/before.scale,(anchor.x-after.x)/after.scale);
 assert.equal((anchor.y-before.y)/before.scale,(anchor.y-after.y)/after.scale);
 assert.equal(zoomDiagram(before,99,anchor,size,viewport).scale,8);
 assert.equal(zoomDiagram(before,0,anchor,size,viewport).scale,.1);
});
test('pan cannot lose the image and smaller dimensions remain centered',()=>{
 assert.deepEqual(constrainDiagram({x:10000,y:-10000,scale:1},size,viewport),{x:24,y:-424,scale:1});
 assert.deepEqual(constrainDiagram({x:-10000,y:10000,scale:.2},size,viewport),{x:200,y:200,scale:.2});
});
