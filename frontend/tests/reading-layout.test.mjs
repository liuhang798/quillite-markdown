import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import {sidebarStartsCollapsed, alignedPreviewScroll} from '../src/reading-layout.js';

test('sidebar restores only the last state, defaulting to expanded', () => {
  for (const value of [null, undefined, '', 'bad', 'false']) assert.equal(sidebarStartsCollapsed(value), false);
  assert.equal(sidebarStartsCollapsed('true'), true);
});

const args = {
  editor: {top:100, bottom:900, height:800}, preview: {top:60, bottom:660, height:600},
  target: {top:400, height:20}, scrollTop:500, scrollHeight:3000, clientHeight:600,
};
test('preview aligns to relative caret height across unequal panes, including already visible content', () => {
  for (const fraction of [.1,.5,.9]) {
    const y=100+800*fraction;
    const result=alignedPreviewScroll({...args, caret:{top:y-10,bottom:y+10}});
    assert.equal(410-(result-500),60+600*fraction);
  }
});
test('alignment respects scroll boundaries and hidden/offscreen caret', () => {
  assert.equal(alignedPreviewScroll({...args,caret:null}),null);
  assert.equal(alignedPreviewScroll({...args,caret:{top:0,bottom:20}}),null);
  assert.equal(alignedPreviewScroll({...args,scrollTop:0,target:{top:80,height:20},caret:{top:800,bottom:820}}),0);
  assert.equal(alignedPreviewScroll({...args,scrollTop:2500,caret:{top:100,bottom:120}}),2400);
});

test('queued preview alignment ignores composition, manual scrolling and obsolete sessions', () => {
  const source=readFileSync(new URL('../src/renderer.js',import.meta.url),'utf8');
  const fn=source.slice(source.indexOf('let previewCursorFrame = 0;'),source.indexOf('\nfunction previewBlockAtPointer'));
  let pending,queries=0,composing=false;
  const state={editing:true,editorLayout:'editor-left',documentSession:1,previewScrollPausedSession:null};
  const context=vm.createContext({state,codeEditor:{},cancelAnimationFrame(){},
    requestAnimationFrame:cb=>{pending=cb;return 1;},editorHasComposition:()=>composing,
    $(){queries++;return null;},els:{editorPreview:null}});
  vm.runInContext(fn,context);
  context.scrollPreviewToCursor();composing=true;pending();assert.equal(queries,0);
  composing=false;context.scrollPreviewToCursor();state.previewScrollPausedSession=1;pending();assert.equal(queries,0);
  state.previewScrollPausedSession=null;context.scrollPreviewToCursor();state.documentSession=2;pending();assert.equal(queries,0);
  context.scrollPreviewToCursor();state.editorLayout='editor-only';pending();assert.equal(queries,0);
  state.editorLayout='editor-left';context.scrollPreviewToCursor();pending();assert.equal(queries,1);
});
