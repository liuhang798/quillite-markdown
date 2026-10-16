import test from 'node:test';
import assert from 'node:assert/strict';
import {EditorState} from '@codemirror/state';
import {EditorView} from '@codemirror/view';
import {editorDiagramField,toggleDiagramSource,setDiagramDisplay,returnDiagramSourceToRendered} from '../src/editor-diagram-preview.js';
import {editorLivePreview,livePreviewField,visibleLiveDecorations} from '../src/editor-live-preview.js';

const fence='> - ~~~~mermaid\n>   flowchart LR\n>   A-->B\n>   ~~~~';
const source='> Before **bold**\n\n'+fence+'\n\n'+fence+'\n\nAfter';
const entries=set=>{const out=[];set.between(0,source.length,(from,to,value)=>out.push({from,to,spec:value.spec}));return out;};
test('exposed diagrams remove only their own live source decorations and restore them on return',()=>{
 let state=EditorState.create({doc:source,selection:{anchor:source.length},extensions:[editorLivePreview,editorDiagramField]});
 const [first,second]=state.field(editorDiagramField).items,start=state.doc.lineAt(first.from).from;
 const baseline=visibleLiveDecorations(state);assert.ok(entries(baseline).some(item=>item.from===start));
 state=state.update({effects:toggleDiagramSource.of(first)}).state;
 const visible=visibleLiveDecorations(state);assert.equal(visibleLiveDecorations(state),visible,'cache is scoped to immutable state');
 assert.equal(entries(visible).filter(item=>item.from>=start&&item.to<=first.to).length,0);
 assert.ok(entries(visible).some(item=>item.from>=second.from),'sibling stays rendered');
 assert.ok(entries(visible).some(item=>item.spec.class==='cm-live-strong'),'outside emphasis is retained');
 assert.ok(entries(state.field(livePreviewField).decorations).length>entries(visible).length,'underlying parse plan remains unchanged');
 const lines=entries(state.field(editorDiagramField).decorations).filter(item=>item.spec.class==='cm-diagram-source-line');
 assert.equal(lines.length,4);assert.equal(lines[0].from,start);
 const sourceTool=entries(state.field(editorDiagramField).decorations).find(item=>item.spec.widget?.item?.open);
 assert.equal(sourceTool.from,start,'toolbar does not split opening prefix from fence');
 // The actual view facet receives the filtered set, including with the live
 // field declared before diagrams (no dependency cycle through ownership).
 assert.ok(state.facet(EditorView.decorations).includes(visible));
 const atoms=state.facet(EditorView.atomicRanges).flatMap(provider=>entries(provider({state})));
 assert.equal(atoms.filter(item=>item.from>=start&&item.to<=first.to).length,0,'visible source prefixes are not hidden cursor atoms');
 const focused=state.update({selection:{anchor:source.indexOf('A-->B')+1}}).state;
 const activeLines=entries(focused.field(editorDiagramField).decorations).filter(item=>item.spec.class?.includes('cm-activeLine'));
 assert.equal(activeLines.length,1);assert.equal(activeLines[0].from,focused.doc.lineAt(source.indexOf('A-->B')).from,'source current-line cue does not depend on root-only plugins');
 const view={state,focus(){},dispatch(spec){this.state=this.state.update(spec).state;}};
 assert.equal(returnDiagramSourceToRendered(view,view.state.field(editorDiagramField).items[0]),true);
 assert.deepEqual(entries(visibleLiveDecorations(view.state)),entries(baseline));
 assert.equal(view.state.doc.toString(),source);
});

test('diagram source styling does not require the media extension or survive disabled display',()=>{
 const plain=EditorState.create({doc:'> Quote',extensions:[editorLivePreview]});
 assert.equal(visibleLiveDecorations(plain),plain.field(livePreviewField).decorations);
 let state=EditorState.create({doc:source,extensions:[editorDiagramField,editorLivePreview]});
 const first=state.field(editorDiagramField).items[0];state=state.update({effects:toggleDiagramSource.of(first)}).state;
 assert.ok(entries(state.field(editorDiagramField).decorations).some(item=>item.spec.class==='cm-diagram-source-line'));
 state=state.update({effects:setDiagramDisplay.of('source')}).state;
 assert.equal(entries(state.field(editorDiagramField).decorations).length,0);
 assert.equal(visibleLiveDecorations(state),state.field(livePreviewField).decorations);
});
