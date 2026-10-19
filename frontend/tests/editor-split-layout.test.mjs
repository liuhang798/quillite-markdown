import assert from 'node:assert/strict';
import test from 'node:test';
import {fitEditorSplit, normalizeEditorPreviewWidth} from '../src/editor-split-layout.js';

test('preview preference rejects invalid values and retains fractional positions',()=>{
  for(const value of [NaN,Infinity,-Infinity,'invalid'])assert.equal(normalizeEditorPreviewWidth(value),47);
  assert.equal(normalizeEditorPreviewWidth(55.123),55.123);
  assert.equal(normalizeEditorPreviewWidth(-1),12);assert.equal(normalizeEditorPreviewWidth(500),92);
});
test('split reserves usable editing and preview space including divider width',()=>{
  for(const total of [547,653,837,1237,1657])for(const preferred of [12,47,92]){
    const fitted=fitEditorSplit(preferred,total,7),preview=total*fitted.percent/100,editor=total-preview-7;
    assert.ok(editor>=360-1e-8);assert.ok(preview>=Math.min(180,(total-7)/3)-1e-8);
    assert.ok(fitted.minimum<=fitted.percent&&fitted.percent<=fitted.maximum);
  }
});
test('hidden and exceptionally small containers stay finite without overflow',()=>{
  assert.equal(fitEditorSplit(70,0).percent,70);
  for(const total of [1,7,100,240,473]){
    const fitted=fitEditorSplit(92,total,7);
    assert.ok(Number.isFinite(fitted.percent));assert.ok(fitted.percent>=0);
    assert.ok(total*fitted.percent/100+Math.min(total,7)<=total+1e-8);
  }
});
test('window fitting does not mutate the saved wide-window preference',()=>{
  const preferred=fitEditorSplit(92,1657).percent;
  assert.ok(fitEditorSplit(preferred,653).percent<preferred);
  assert.equal(fitEditorSplit(preferred,1657).percent,preferred);
});

test('user-selected limits remain stable when reapplied in large windows',()=>{
  for(const total of [653,1657,3840,10000])for(const request of [-500,500]){
    const result=fitEditorSplit(request,total).percent;
    assert.equal(fitEditorSplit(normalizeEditorPreviewWidth(result),total).percent,result);
  }
});
