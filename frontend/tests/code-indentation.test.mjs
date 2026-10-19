import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {EditorState,EditorSelection} from '@codemirror/state';
import {indentWithTab,history,undo,redo} from '@codemirror/commands';
import {livePreviewPhrases} from '../src/editor-live-preview.js';

test('code-only Tab binding retains separate table navigation and keyboard escape',async()=>{
 const source=await readFile(new URL('../src/live-editable-block.js',import.meta.url),'utf8');
 assert.match(source,/this\.item\.kind === 'code' \? \[indentWithTab\] : \[\]/);
 assert.match(source,/isTable \|\| isDetails \? \[\{ key: 'Tab', run: move\(1\)/);
 assert.match(source,/key: 'Escape', run: \(\) => leave\(\)/);
 assert.match(source,/codeColors\(state\.doc, controller\.widget\)\), liveSelectionDisplay\(\(\) => false\)/);
 assert.ok(livePreviewPhrases['Tab / Shift+Tab: indent / unindent. Escape: return to document.']);
});

for(const reverse of [false,true])test(`code indentation command preserves ${reverse?'reverse':'forward'} selection and history`,()=>{
 const view={state:EditorState.create({doc:'alpha\nbeta',extensions:[history()],selection:EditorSelection.range(reverse?10:0,reverse?0:10)})};
 view.dispatch=spec=>{view.state=spec.state||view.state.update(spec).state;};
 assert.ok(indentWithTab.run(view));assert.equal(view.state.doc.toString(),'  alpha\n  beta');
 assert.equal(view.state.selection.main.anchor>view.state.selection.main.head,reverse);
 assert.ok(undo(view));assert.equal(view.state.doc.toString(),'alpha\nbeta');assert.ok(redo(view));
 assert.ok(indentWithTab.shift(view));assert.equal(view.state.doc.toString(),'alpha\nbeta');
});

test('code indentation respects read-only state',()=>{
 const view={state:EditorState.create({doc:'alpha',extensions:[EditorState.readOnly.of(true)]}),dispatch(){throw new Error('read-only write');}};
 assert.equal(indentWithTab.run(view),false);assert.equal(indentWithTab.shift(view),false);
});
