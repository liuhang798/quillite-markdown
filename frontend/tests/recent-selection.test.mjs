import test from 'node:test';
import assert from 'node:assert/strict';
import { retainRecentSelection, toggleRecentSelection, rangeRecentSelection, removeRecentSelection } from '../src/recent-selection.js';

const rangeFiles = ['pinned','a','b','c','d'].map(name => ({path:`C:/${name}.md`}));
test('range selection includes both endpoints and intervening files, forward and backward', () => {
  assert.deepEqual(rangeRecentSelection([], 'c:\\PINNED.md', 'C:/b.md', rangeFiles), rangeFiles.slice(0,3).map(f=>f.path));
  assert.deepEqual(rangeRecentSelection([], 'C:/b.md', 'C:/pinned.md', rangeFiles), rangeFiles.slice(0,3).map(f=>f.path));
});
test('Ctrl/Meta Shift adds the range, Shift replaces it and a stable anchor allows shrinking', () => {
  assert.deepEqual(rangeRecentSelection(['C:/d.md'], 'C:/a.md','C:/b.md',rangeFiles,true),['C:/a.md','C:/b.md','C:/d.md']);
  assert.deepEqual(rangeRecentSelection(['C:/d.md'], 'C:/a.md','C:/b.md',rangeFiles),['C:/a.md','C:/b.md']);
  assert.deepEqual(rangeRecentSelection(['C:/a.md','C:/b.md','C:/c.md'], 'C:/a.md','C:/a.md',rangeFiles),['C:/a.md']);
});
test('absent/stale anchors safely select only the target; reordered lists use their displayed order', () => {
  assert.deepEqual(rangeRecentSelection([], '', 'C:/b.md', rangeFiles),['C:/b.md']);
  assert.deepEqual(rangeRecentSelection(['C:/d.md'], 'gone','C:/b.md',rangeFiles,true),['C:/b.md','C:/d.md']);
  assert.deepEqual(rangeRecentSelection(['C:/a.md'],'C:/a.md','gone',rangeFiles),['C:/a.md']);
  const reordered=[rangeFiles[2],rangeFiles[0],rangeFiles[1],rangeFiles[3]];
  assert.deepEqual(rangeRecentSelection([], 'C:/b.md','C:/a.md',reordered),['C:/b.md','C:/pinned.md','C:/a.md']);
});

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
