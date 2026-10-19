import test from 'node:test';
import assert from 'node:assert/strict';
import { retainRecentSelection, toggleRecentSelection, removeRecentSelection } from '../src/recent-selection.js';

test('recent selection normalizes paths, toggles and prunes missing records, not missing files', () => {
  const files = [{path:'C:/A.md'}, {path:'C:/B.md',exists:false}];
  assert.deepEqual(retainRecentSelection(['c:\\a.md','C:/B.md','C:/gone.md','C:/A.md'],files),['C:/A.md','C:/B.md']);
  assert.deepEqual(toggleRecentSelection(['C:/A.md'],'c:\\a.md',files),[]);
  assert.deepEqual(toggleRecentSelection(['C:/A.md'],'C:/B.md',files),['C:/A.md','C:/B.md']);
});

test('bulk clear serializes record-only requests and retains failed items', async () => {
  const calls=[];let pending=false;
  const result=await removeRecentSelection(['a.md','A.md','b.md','c.md',''],async path=>{
    assert.equal(pending,false);pending=true;calls.push(path);
    await Promise.resolve();pending=false;if(path==='b.md')throw Error('preferences unavailable');
  });
  assert.deepEqual(calls,['a.md','b.md','c.md']);
  assert.deepEqual(result,{removed:['a.md','c.md'],failed:['b.md']});
});
