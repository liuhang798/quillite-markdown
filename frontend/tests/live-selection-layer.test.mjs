import test from 'node:test';
import assert from 'node:assert/strict';
import { mergeSelectionRects, selectionLineRanges } from '../src/live-selection-layer.js';
import {EditorState} from '@codemirror/state';

test('selection rectangles merge duplicate span/text boxes but keep bidi gaps and wrapped lines', () => {
  const rect = (left, right, top = 10) => ({ left, right, top, bottom: top + 20, width: right - left, height: 20 });
  const source = [rect(20, 30), rect(10, 20), rect(10, 20), rect(40, 50), rect(10, 30, 40), rect(60, 60)];
  assert.deepEqual(mergeSelectionRects(source), [
    { left: 10, right: 30, top: 10, bottom: 30 },
    { left: 40, right: 50, top: 10, bottom: 30 },
    { left: 10, right: 30, top: 40, bottom: 60 },
  ]);
  assert.equal(source.length, 6);
});
test('padded inline spans do not paint their nested text a second time',()=>{
 const rect=(left,right,top,bottom)=>({left,right,top,bottom,width:right-left,height:bottom-top});
 assert.deepEqual(mergeSelectionRects([rect(10,50,10,30),rect(13,47,11,29)]),[{left:10,right:50,top:10,bottom:30}]);
});
test('multiline measurement splits at physical lines and retains selected empty lines',()=>{
 const doc=EditorState.create({doc:'ALPHA\n\nBETA\nGAMMA'}).doc;
 assert.deepEqual(selectionLineRanges(doc,{from:1,to:15},[{from:0,to:doc.length}]),[
  {from:1,to:5,newline:true},{from:6,to:6,newline:true},{from:7,to:11,newline:true},{from:12,to:15,newline:false}]);
 assert.deepEqual(selectionLineRanges(doc,{from:1,to:7},[{from:0,to:doc.length}]),[{from:1,to:5,newline:true},{from:6,to:6,newline:true}]);
});
test('offscreen and replaced ranges are excluded from measurement',()=>{
 const doc=EditorState.create({doc:'ALPHA\nBETA\nGAMMA'}).doc;
 assert.deepEqual(selectionLineRanges(doc,{from:0,to:doc.length},[{from:2,to:4},{from:7,to:9}]),[{from:2,to:4,newline:false},{from:7,to:9,newline:false}]);
 assert.deepEqual(selectionLineRanges(doc,{from:5,to:5},[{from:0,to:doc.length}]),[]);
});
