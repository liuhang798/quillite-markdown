import test from 'node:test';
import assert from 'node:assert/strict';
import {EditorState} from '@codemirror/state';
import {history,undo} from '@codemirror/commands';
import {prepareFootnotes} from '../src/markdown-formats.js';
import {footnoteContextIsCurrent,footnoteBodyEdit,footnoteProjection} from '../src/footnote-editing.js';
import {fieldPosition,fieldOffset,fieldInsertion} from '../src/projected-code.js';
import {buildLivePlan,livePreviewField,livePreviewContext,editSelectedFootnote,editorLivePreview,renderedEditableBlocks} from '../src/editor-live-preview.js';
import {protectedBlockReplacement} from '../src/editable-cross-selection.js';
import {formulaReplacement} from '../src/formula-editing.js';
import {diagramReplacementMarkdown} from '../src/diagram-editing.js';
import {footnotesField,footnotesFor,inheritedFootnotes,updateFootnotes} from '../src/editor-reference-context.js';

test('footnote metadata retains exact offsets, occurrence numbering and multiline definitions',()=>{
  const source='Title[^b] same[^b] other[^a]\n\n[^a]: Alpha\n[^b]: **Beta**\n    continuation\n\nEnd';
  const parsed=prepareFootnotes(source);
  assert.deepEqual(parsed.references.map(r=>[r.label,r.number]),[['b',1],['b',1],['a',2]]);
  for(const ref of parsed.references)assert.equal(source.slice(ref.from,ref.to),ref.raw);
  const def=parsed.definitions.get('b');assert.equal(def.text,'**Beta**\ncontinuation');
  assert.equal(source.slice(def.bodyFrom,def.to),'**Beta**\n    continuation');
  const plan=buildLivePlan(source);assert.equal(plan.widgets.filter(w=>w.kind==='footnote').length,3);
  assert.equal(buildLivePlan('Unknown[^missing]').widgets.filter(w=>w.kind==='footnote').length,0);
});

test('footnotes do not consume formulas, code, image attributes, links or differently sized fences',()=>{
  const parts=['`[^a]`','``long `[^a]` code``','    [^a]','![alt[^a]](image.png)','<img src="x" alt="[^a]">','[link[^a]](https://example.com)','[link](https://example.com/[^a])','$x_{[^a]}$','\\[^a]','````\n```\n[^a]: fake\n[^a]\n````'];
  const source=parts.join('\n\n')+'\n\nReal[^a]\n\n[^a]: Real note';
  const result=prepareFootnotes(source);assert.equal(result.references.length,1,JSON.stringify(result.references.map(r=>({raw:r.raw,context:source.slice(Math.max(0,r.from-12),r.to+12)}))));assert.equal(result.references[0].from,source.indexOf('Real[^a]')+4);
  assert.equal(result.definitions.get('a').text,'Real note');
  assert.equal(prepareFootnotes('\\\\[^a]\n\n[^a]: note').references.length,1);
});

test('editing a note preserves identifiers, other definitions and exact single-step undo',()=>{
  const source='A[^b] B[^a] C[^b]\n\n[^a]: A\n[^b]: B\n    next\n\nEnd';
  const definition=prepareFootnotes(source).definitions.get('b');
  const before=EditorState.create({doc:source,extensions:[history()]});let state=before;
  const edit=footnoteBodyEdit(definition,'changed\n\n[^a]: cannot replace A');
  state=state.update({changes:edit}).state;
  assert.equal(state.doc.toString(),'A[^b] B[^a] C[^b]\n\n[^a]: A\n[^b]: changed\n    \n    [^a]: cannot replace A\n\nEnd');
  const result=prepareFootnotes(state.doc.toString());assert.equal(result.definitions.get('a').text,'A');
  assert.equal(result.definitions.get('b').text,'changed\n\n[^a]: cannot replace A');
  assert.ok(undo({state,dispatch:tr=>{state=tr.state;}}));assert.equal(state.doc.toString(),source);
  assert.equal(footnoteBodyEdit(definition,definition.text),null);
  assert.equal(footnoteBodyEdit(definition,'').insert,'');
});

test('footnote dialog rejects stale editor, document, session, read-only and inactive editing',()=>{
  const doc={},editor={state:{doc,readOnly:false}},context={editor,doc,session:4},current={editor,session:4,editing:true};
  assert.ok(footnoteContextIsCurrent(context,current));
  for(const changed of [{editor:null},{editor:{state:{doc,readOnly:false}}},{session:5},{editing:false}])assert.equal(footnoteContextIsCurrent(context,{...current,...changed}),false);
  editor.state.doc={};assert.equal(footnoteContextIsCurrent(context,current),false);
  editor.state.doc=doc;editor.state.readOnly=true;assert.equal(footnoteContextIsCurrent(context,current),false);
});

test('projected editors inherit global footnote numbers and update after root renumbering',()=>{
  let root=EditorState.create({doc:'B[^b] A[^a]\n\n[^a]: A\n[^b]: B',extensions:[footnotesField]});
  let inner=EditorState.create({doc:'A[^a]',extensions:[footnotesField,inheritedFootnotes.of(footnotesFor(root))]});
  assert.equal(buildLivePlan(inner.doc.toString(),footnotesFor(inner)).widgets.find(w=>w.kind==='footnote').number,2);
  root=root.update({changes:{from:0,to:root.doc.length,insert:'A[^a] B[^b]\n\n[^a]: New A\n[^b]: B'}}).state;
  inner=inner.update({effects:updateFootnotes.of(footnotesFor(root))}).state;
  const ref=buildLivePlan(inner.doc.toString(),footnotesFor(inner)).widgets.find(w=>w.kind==='footnote');assert.equal(ref.number,1);assert.equal(ref.text,'New A');
});

test('Enter edits an exactly selected live footnote without changing its reference',()=>{
  const doc='A[^a]\n\n[^a]: Note';let calls=0;
  const state=EditorState.create({doc,selection:{anchor:1,head:5},extensions:[livePreviewField,livePreviewContext.of({editFootnote:item=>{calls++;assert.equal(item.label,'a');}})]});
  assert.equal(editSelectedFootnote({state}),true);assert.equal(calls,1);assert.equal(state.doc.toString(),doc);
  assert.equal(editSelectedFootnote({state,composing:true}),false);
  assert.equal(editSelectedFootnote({state:state.update({selection:{anchor:5}}).state}),false);
});

test('definition projections retain whitespace and map every body offset without exposing markers',()=>{
  for(const body of ['','One','One\n    Two','One\n\tTwo','One\n\n    Two','One\n    \n    Two\n    ']) {
    const source='Before[^a]\n\n[^a]: '+body+'\n\nAfter';
    const definition=prepareFootnotes(source).definitions.get('a');
    const projection=footnoteProjection(source,definition),range={from:definition.bodyFrom,to:definition.to,projection};
    assert.equal(projection.text,body.replace(/\n(?: {4}|\t)/g,'\n'));
    for(let offset=0;offset<=projection.text.length;offset++)assert.equal(fieldOffset(range,fieldPosition(range,offset)),offset);
    assert.equal(fieldInsertion(range,'x\ny'),'x\n    y');
    const plan=buildLivePlan(source),blocks=plan.widgets.filter(item=>item.kind==='footnote-definition');
    assert.equal(blocks.length,1);assert.equal(blocks[0].number,1);assert.equal(blocks[0].projection.text,projection.text);
    assert.equal(plan.widgets.filter(item=>item.kind==='code').length,0);
  }
});

test('definition bodies own their nested media without creating nested footnotes',()=>{
  const source='Reference[^a]\n\n[^a]: **bold** $x^2$\n    <details open>\n    <summary>Title</summary>\n\n    Body\n    </details>';
  const plan=buildLivePlan(source),block=plan.widgets.find(item=>item.kind==='footnote-definition');
  assert.ok(block);assert.equal(plan.widgets.filter(item=>item.kind==='details').length,0);
  assert.equal(plan.marks.filter(item=>item.from>=block.from).length,0);
  const inner=buildLivePlan('[^a]: literal\n\nreference[^a]',prepareFootnotes(source).definitions,true);
  assert.equal(inner.widgets.filter(item=>item.kind.startsWith('footnote')).length,0);
});

test('cross-footnote replacement preserves nested table and code wrappers and single undo',()=>{
  for(const body of ['| Head |\n| --- |\n| Cell |','```js\nconst value = 1;\n```']) {
    const source='Before[^n]\n\n[^n]: Intro\n    \n    '+body.replaceAll('\n','\n    ')+'\n    \n    Tail\n\nAfter';
    let state=EditorState.create({doc:source,extensions:[editorLivePreview,history()]});
    const text=body.startsWith('|')?'Cell':'const value = 1;',from=source.indexOf(text)+text.length,to=source.length;
    const edit=protectedBlockReplacement(source,from,to,'Q',renderedEditableBlocks(state));assert.ok(edit);
    state=state.update(edit).state;
    assert.ok(state.doc.toString().includes(body.startsWith('|')?'| CellQ |':'const value = 1;Q\n    ```'));
    assert.ok(undo({state,dispatch:tr=>{state=tr.state;}}));assert.equal(state.doc.toString(),source);
  }
});

test('formula edits and inline-to-display conversion retain footnote indentation',()=>{
  const source='Ref[^n]\n\n[^n]: $x$';const from=source.indexOf('$x$');
  const range={from,to:from+3,raw:'$x$',mode:'inline',projectionPrefix:'    ',continuationPrefix:'    '};
  const replacement=formulaReplacement(source,range,'$$\nx^2\n$$');
  assert.equal(replacement,'\n\n    $$\n    x^2\n    $$');
  assert.equal(formulaReplacement('',{raw:'$$\n    x\n    $$',mode:'block',continuationPrefix:'    '},'$$\ny\n$$'),'$$\n    y\n    $$');
  assert.equal(diagramReplacementMarkdown({language:'mermaid'},'flowchart LR\nA --> B').replaceAll('\n','\n    '),'```mermaid\n    flowchart LR\n    A --> B\n    ```');
});
