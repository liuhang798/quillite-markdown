import test from 'node:test';
import assert from 'node:assert/strict';
import {picGoPrepareProgressModel as model, picGoPrepareBytes as bytes} from '../src/picgo-prepare-progress.js';

test('runtime download progress comes only from received bytes', () => {
  assert.equal(model({phase:'downloading',done:42,total:100}).percent,42);
  assert.equal(model({phase:'downloading',done:101,total:100}).percent,100);
  assert.equal(model({phase:'downloading',done:100,total:0}).percent,null);
  assert.equal(model({phase:'downloading',done:100,total:Infinity}).percent,null);
  assert.equal(model({phase:'downloading',done:-4,total:100}).percent,0);
});
for(const phase of ['starting','verifying','extracting','installing','checking'])test(`${phase} has no simulated percentage`,()=>{
  const value=model({phase,done:50,total:100});assert.equal(value.percent,null);assert.equal(value.active,true);
});
test('completion and failure stop activity, only success reaches completion',()=>{
  assert.equal(model({phase:'complete'}).percent,100);assert.equal(model({phase:'complete'}).step,4);assert.equal(model({phase:'complete'}).active,false);
  assert.equal(model({phase:'failed'}).percent,null);assert.equal(model({phase:'failed'}).active,false);
});
test('unknown events and byte display are safe',()=>{
  assert.equal(model({phase:'constructor'}).phase,'starting');assert.equal(bytes(1024*1024*1.5),'1.5 MB');assert.equal(bytes(-1),'0.0 MB');
});
