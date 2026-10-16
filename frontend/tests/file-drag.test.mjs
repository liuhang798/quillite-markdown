import test from 'node:test';
import assert from 'node:assert/strict';
import { isFileDrag } from '../src/file-drag.js';
test('file import overlay ignores internal text, HTML and link dragging',()=>{
  for (const types of [[],['text/plain'],['text/html','text/plain'],['text/uri-list']]) {
    assert.equal(isFileDrag({dataTransfer:{types,files:[]}}),false);
  }
  assert.equal(isFileDrag({}),false);
});
test('file dragging is recognized during protected dragover and final drop',()=>{
  assert.equal(isFileDrag({dataTransfer:{types:['Files'],files:[]}}),true);
  assert.equal(isFileDrag({dataTransfer:{types:[],files:[{}]}}),true);
});
