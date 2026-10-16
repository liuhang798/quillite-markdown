import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
import { EditorSelection, EditorState } from '@codemirror/state';
import { history, undo, redo, undoDepth, isolateHistory } from '@codemirror/commands';
import { DIAGRAM_TEMPLATES, diagramTemplateSource } from '../src/diagram-templates.js';
import { diagramReplacementMarkdown, projectedDiagramReplacement } from '../src/diagram-editing.js';
import { editorDiagramItems, editorDiagramField, diagramPreviewContext, toggleDiagramSource, setDiagramDisplay,
  diagramRenderFailed, refreshDiagramPreviews, refreshDiagramTheme, editSelectedDiagram, deleteRenderedDiagram, activeDiagramSourceItem, returnDiagramSourceToRendered, insertDiagramSourceNewline,
  DIAGRAM_PREVIEW_LIMIT, DIAGRAM_PREVIEW_DOCUMENT_LIMIT, DIAGRAM_SOURCE_LIMIT } from '../src/editor-diagram-preview.js';

const fence = (body = 'pie\n"One": 1', engine = 'mermaid') => `\`\`\`${engine}\n${body}\n\`\`\``;
const create = (doc, context = {}) => EditorState.create({ doc, extensions: [history(), editorDiagramField, diagramPreviewContext.of(context)] });
const viewFor = state => { const view = { state, focus() {} }; view.dispatch = spec => { view.state = view.state.update(spec).state; }; return view; };

test('diagram deletion requests a visible caret and keeps one undo transaction',()=>{
 const source=fence(),view=viewFor(create(source));let request;
 const dispatch=view.dispatch;view.dispatch=spec=>{request=spec;dispatch(spec);};
 const item=view.state.field(editorDiagramField).items[0];assert.equal(deleteRenderedDiagram(view,item,view.state.doc),true);
 assert.equal(request.scrollIntoView,true);assert.equal(request.selection.anchor,item.from);assert.equal(undoDepth(view.state),1);
 undo(view);assert.equal(view.state.doc.toString(),source);
 const block=readFileSync(new URL('../src/live-editable-block.js',import.meta.url),'utf8');
 assert.match(block,/transactions\.some\(next => next\.scrollIntoView\)\) transaction\.scrollIntoView = true/);
});

test('diagram source return closes explicit and caret-open source without content or history changes',()=>{
 for(const explicit of [true,false]){
  const text=fence(),view=viewFor(create(text)),item=view.state.field(editorDiagramField).items[0];
  view.dispatch({selection:{anchor:item.from+12},effects:explicit?toggleDiagramSource.of(item):[]});
  assert.ok(activeDiagramSourceItem(view));assert.equal(returnDiagramSourceToRendered(view),true);
  assert.equal(view.state.doc.toString(),text);assert.equal(undoDepth(view.state),0);
  assert.equal(activeDiagramSourceItem(view),null);assert.equal(view.state.field(editorDiagramField).openRanges.length,0);
  assert.equal(view.state.selection.main.from,item.from);assert.equal(view.state.selection.main.to,item.to);
  assert.equal(view.state.selection.main.head,item.from,'scroll targets the visible start of the collapsed card');
 }
});

test('diagram return resolves current source and preserves other open diagrams and source edit history',()=>{
 const text=fence()+'\n\n'+fence('pie\n"Two": 2'),view=viewFor(create(text));
 const [first,second]=view.state.field(editorDiagramField).items;
 view.dispatch({effects:[toggleDiagramSource.of(first),toggleDiagramSource.of(second)],selection:{anchor:first.from+12}});
 view.dispatch({changes:{from:first.from+12,insert:' '},selection:{anchor:first.from+13},userEvent:'input.type'});
 const changed=view.state.doc.toString();assert.equal(returnDiagramSourceToRendered(view),true);
 assert.equal(view.state.doc.toString(),changed);assert.equal(undoDepth(view.state),1);
 assert.equal(view.state.field(editorDiagramField).openRanges.length,1);
 undo(view);assert.equal(view.state.doc.toString(),text);
});

test('diagram return rejects stale, failed, read-only, disabled and destroyed source views',()=>{
 for(const kind of ['stale','failed','readOnly','disabled','destroyed']){
  const view=viewFor(create(fence())),item=view.state.field(editorDiagramField).items[0];
  view.dispatch({effects:toggleDiagramSource.of(item)});
  if(kind==='stale')view.dispatch({changes:{from:12,insert:' '}});
  if(kind==='failed')view.dispatch({effects:diagramRenderFailed.of({doc:view.state.doc,item})});
  if(kind==='readOnly')view.state=EditorState.create({doc:fence(),extensions:[editorDiagramField,EditorState.readOnly.of(true)]});
  if(kind==='disabled')view.dispatch({effects:setDiagramDisplay.of('source')});
  if(kind==='destroyed')view.destroyed=true;
  assert.equal(returnDiagramSourceToRendered(view,item),false,kind);
 }
});

test('all chart templates in both languages retain exact source and engine', () => {
  for (const template of DIAGRAM_TEMPLATES) for (const locale of ['zh', 'en']) {
    const raw = `before\n\n${fence(diagramTemplateSource(template, locale), template.engine || 'mermaid')}\n\nafter`;
    for (const source of [raw, raw.replace(/\n/g, '\r\n')]) {
      const items = editorDiagramItems(source);
      assert.equal(items.length, 1, template.id);
      const item = items[0];
      assert.equal(source.slice(item.from, item.to), item.original);
      assert.equal(item.engine, template.engine || 'mermaid');
      const state = create(source), field = state.field(editorDiagramField);
      assert.equal(field.items.length, 1, template.id);
      assert.equal(state.doc.toString(), source.replace(/\r\n/g, '\n')); assert.equal(undoDepth(state), 0);
      assert.equal(field.atoms.size, 1);
    }
  }
});

test('all catalog diagrams in quotes and lists retain source, fence markers and replacement prefixes',()=>{
  for(const template of DIAGRAM_TEMPLATES)for(const locale of ['zh','en'])for(const [intro,prefix]of [['','> '],['','> > '],['- Item\n\n','  ']]) {
    const body=diagramTemplateSource(template,locale),engine=template.engine||'mermaid';
    const raw='~~~~'+engine+'\n'+body+'\n~~~~';
    const source=intro+raw.replace(/^/gm,prefix);
    const [item]=editorDiagramItems(source);assert.ok(item,template.id+' '+prefix);
    assert.equal(item.source,body);assert.equal(item.projectionPrefix,prefix);assert.equal(item.original,source.slice(item.from,item.to));
    const replacement=diagramReplacementMarkdown(item,body).replaceAll('\n','\n'+item.projectionPrefix);
    assert.equal(source.slice(0,item.from)+replacement+source.slice(item.to),source);
    assert.equal(create(source).field(editorDiagramField).atoms.size,1);
  }
});

test('nested diagrams preserve blank lines, CRLF and selection/undo semantics',()=>{
  const source='> ~~~~MERMAID\r\n> flowchart LR\r\n> \r\n>   A-->B\r\n> \r\n> ~~~~';
  const [item]=editorDiagramItems(source);assert.equal(item.source,'flowchart LR\n\n  A-->B\n');
  assert.equal(item.lineEnding,'\r\n');assert.equal(item.projectionPrefix,'> ');
  assert.equal(diagramReplacementMarkdown(item,item.source).replaceAll('\r\n','\r\n> '),item.original);
  const view=viewFor(create(source)),current=view.state.field(editorDiagramField).items[0];
  view.dispatch({selection:{anchor:current.from,head:current.to}});assert.equal(view.state.field(editorDiagramField).atoms.size,1);
  assert.equal(deleteRenderedDiagram(view,current,view.state.doc),true);assert.equal(view.state.doc.toString(),'> ');
  undo(view);assert.equal(view.state.doc.toString(),source.replaceAll('\r\n','\n'));
});

test('compact quotes, mixed prefixes and tab lists render and preserve exact replacement syntax',()=>{
  const body='flowchart LR\n  A[Original]-->B\n  B-->C';
  const wrap=[
    raw=>raw.split('\n').map(line=>(/^\s/.test(line)?'> ':'>')+line).join('\n'),
    raw=>raw.split('\n').map((line,i)=>(i%2&&!/^\s/.test(line)?'>':'> ')+line).join('\n'),
    raw=>'- Item\n\n'+raw.replace(/^/gm,'\t'),
    raw=>'12. '+raw.replaceAll('\n','\n    ')
  ];
  for(const make of wrap)for(const ending of ['\n','\r\n']) {
    const source=make('~~~~mermaid\n'+body+'\n~~~~').replaceAll('\n',ending);
    const [item]=editorDiagramItems(source);assert.ok(item,source);assert.equal(item.source,body);
    const replace=text=>source.slice(0,item.from)+projectedDiagramReplacement(item,text)+source.slice(item.to);
    assert.equal(replace(body),source,'no syntax normalization');
    assert.equal(replace(body.replace('Original','Edited')),source.replace('Original','Edited'));
    for(const next of [body.replace('  A[Original]-->B','  A[Original]-->B\n  X-->Y'),body.replace('  A[Original]-->B\n','')]) {
      const changed=replace(next),[reopened]=editorDiagramItems(changed);assert.ok(reopened,changed);assert.equal(reopened.source,next);
      assert.equal(changed.split(ending).at(-1),source.split(ending).at(-1),'closing prefix retained');
    }
  }
});

test('direct diagram source Enter preserves quote/list prefixes and has isolated undo',()=>{
  for(const [intro,prefix] of [['','> '],['','>'],['- Item\n\n','\t'],['','>   '],['','']]) {
    const source=intro+fence('flowchart LR\nA-->B').replace(/^/gm,prefix);
    const view=viewFor(create(source)),item=view.state.field(editorDiagramField).items[0];assert.ok(item,source);
    const at=source.indexOf('A-->B')+5;view.dispatch({selection:{anchor:at},effects:toggleDiagramSource.of(item)});
    assert.equal(insertDiagramSourceNewline(view),true);
    assert.equal(view.state.doc.toString(),source.slice(0,at)+'\n'+prefix+source.slice(at));
    assert.equal(view.state.field(editorDiagramField).items.length,1);
    undo(view);assert.equal(view.state.doc.toString(),source);redo(view);assert.equal(view.state.doc.toString(),source.slice(0,at)+'\n'+prefix+source.slice(at));
  }
  for(const kind of ['prose','opening','closing','composing','readonly','disabled']) {
    const source=fence()+'\n\nAfter',view=viewFor(create(source)),item=view.state.field(editorDiagramField).items[0];
    const at=kind==='prose'?source.length:kind==='opening'?item.from+2:kind==='closing'?item.to-1:source.indexOf('pie')+3;
    view.dispatch({selection:{anchor:at,head:kind==='selection'?at-1:at},effects:toggleDiagramSource.of(item)});
    if(kind==='composing')view.composing=true;
    if(kind==='readonly')view.state=EditorState.create({doc:source,selection:{anchor:at},extensions:[editorDiagramField,EditorState.readOnly.of(true)]});
    if(kind==='disabled')view.dispatch({effects:setDiagramDisplay.of('source')});
    assert.equal(insertDiagramSourceNewline(view),false,kind);assert.equal(view.state.doc.toString(),source);
  }
});

test('diagram source Enter replaces forward/backward and multiline selections without losing container prefixes',()=>{
 for(const [intro,prefix]of [['',''],['','> '],['','>'],['- Item\n\n','  '],['- Item\n\n','\t'],['> - Item\n>\n','>   ']])for(const multiline of [false,true])for(const backward of [false,true]){
  const source=intro+fence('flowchart LR\nA;   B;\nC').replace(/^/gm,prefix);
  const view=viewFor(create(source)),item=view.state.field(editorDiagramField).items[0];assert.ok(item,source);
  const from=source.indexOf('   B'),to=multiline?source.indexOf('C\n'):from+3;
  view.dispatch({effects:toggleDiagramSource.of(item),selection:{anchor:backward?to:from,head:backward?from:to}});
  assert.equal(insertDiagramSourceNewline(view),true);
  const expected=source.slice(0,from)+'\n'+prefix+source.slice(to);
  assert.equal(view.state.doc.toString(),expected);assert.equal(view.state.field(editorDiagramField).items.length,1);
  assert.equal(view.state.selection.main.head,from+1+prefix.length);assert.equal(undoDepth(view.state),1);
  undo(view);assert.equal(view.state.doc.toString(),source);redo(view);assert.equal(view.state.doc.toString(),expected);
 }
});

test('diagram source Enter at indentation keeps only indentation before caret and supports independent blank lines',()=>{
 const source='> '+fence('flowchart LR\n  A;   B;').replaceAll('\n','\n> ');
 const view=viewFor(create(source)),item=view.state.field(editorDiagramField).items[0],at=source.indexOf('   B');
 view.dispatch({effects:toggleDiagramSource.of(item),selection:{anchor:at}});
 assert.equal(insertDiagramSourceNewline(view),true);
 const first=source.slice(0,at)+'\n>   '+source.slice(at);assert.equal(view.state.doc.toString(),first);
 assert.equal(insertDiagramSourceNewline(view),true);
 assert.equal(view.state.doc.toString(),source.slice(0,at)+'\n>   \n>   '+source.slice(at));
 undo(view);assert.equal(view.state.doc.toString(),first);undo(view);assert.equal(view.state.doc.toString(),source);
});

test('diagram Enter handles multiple body selections atomically but leaves fence/prefix-crossing selections to structural commands',()=>{
 const source='> '+fence('flowchart LR\nA; B;\nC; D;').replaceAll('\n','\n> ');
 const view=viewFor(EditorState.create({doc:source,extensions:[editorDiagramField,history(),EditorState.allowMultipleSelections.of(true)]}));
 const item=view.state.field(editorDiagramField).items[0],one=source.indexOf(' B'),two=source.indexOf(' D');
 view.dispatch({effects:toggleDiagramSource.of(item),selection:EditorSelection.create([EditorSelection.range(one,one+1),EditorSelection.range(two,two+1)])});
 assert.equal(insertDiagramSourceNewline(view),true);assert.equal(view.state.doc.toString(),source.replace(' B','\n> B').replace(' D','\n> D'));
 assert.equal(view.state.selection.ranges.length,2);undo(view);assert.equal(view.state.doc.toString(),source);
 for(const [from,to]of [[source.indexOf('A;'),source.lastIndexOf('```')],[source.indexOf('A;'),source.indexOf('> C')+1],[source.indexOf('> A')+1,source.indexOf('B;')]]){
  view.dispatch({selection:{anchor:from,head:to}});assert.equal(insertDiagramSourceNewline(view),false);assert.equal(view.state.doc.toString(),source);
 }
});

test('nested math, HTML, literal code examples and incomplete fences are never diagrams',()=>{
  for(const prefix of ['> ','> > ','  '])for(const body of [
    '$$\n'+fence()+'\n$$','\\[\n'+fence()+'\n\\]',
    '<pre>\n'+fence()+'\n</pre>','<!--\n'+fence()+'\n-->',
    '````markdown\n'+fence()+'\n````','```mermaid\npie\n'
  ]) {
    const source=(prefix==='  '?'- Item\n\n':'')+body.replace(/^/gm,prefix);
    assert.deepEqual(editorDiagramItems(source),[],source);
  }
});

test('nested diagram scans share the document and item limits with root diagrams',()=>{
  const nested=fence().replace(/^/gm,'> ');
  assert.equal(editorDiagramItems((nested+'\n\n').repeat(DIAGRAM_PREVIEW_LIMIT+5)).length,DIAGRAM_PREVIEW_LIMIT);
  assert.equal(editorDiagramItems('> '+ 'x'.repeat(DIAGRAM_PREVIEW_DOCUMENT_LIMIT)+'\n'+nested).length,0);
});

test('only complete parser-confirmed fences hide source; examples, HTML, comments and containers remain intact', () => {
  for (const source of ['````markdown\n' + fence() + '\n````', '<!--\n' + fence() + '\n-->', '<pre>\n' + fence() + '\n</pre>',
    '$$\n' + fence() + '\n$$', 'before\n$$\n' + fence() + '\n$$', '\\[\n' + fence() + '\n\\]', 'before\n\\[\n' + fence() + '\n\\]',
    '    ```mermaid\n    pie\n    "One": 1\n    ```', '```mermaid\npie\n', 'paragraph `mermaid pie`']) {
    assert.equal(editorDiagramItems(source).length, 0, source);
  }
  const source = '# 标题 😀\r\n\r\n  ~~~~MERMAID\r\n  pie\r\n  "One": 1\r\n  ~~~~\r\nnext';
  const [item] = editorDiagramItems(source);
  assert.ok(item); assert.equal(item.lineEnding, '\r\n'); assert.equal(item.indent, '  ');
  assert.equal(source.slice(item.from, item.to), item.original); assert.equal(item.source, 'pie\n"One": 1');
  assert.equal(diagramReplacementMarkdown(item, item.source), item.original);
  assert.equal(editorDiagramItems('[ref]: https://example.org\n\n' + fence()).length, 1);
});

test('source display, selection, themes and global modes leave content and undo history untouched', () => {
  const source = fence() + '\n\n' + fence('flowchart LR\nA-->B');
  let state = create(source); const item = state.field(editorDiagramField).items[0];
  state = state.update({ effects: toggleDiagramSource.of(item) }).state;
  assert.equal(state.field(editorDiagramField).atoms.size, 1);
  state = state.update({ effects: toggleDiagramSource.of(item), selection: { anchor: item.from, head: item.to } }).state;
  assert.equal(state.field(editorDiagramField).items[0].open, false);
  state = state.update({ effects: refreshDiagramTheme.of(null) }).state;
  assert.equal(state.field(editorDiagramField).theme, 1);
  state = state.update({ effects: setDiagramDisplay.of('source') }).state;
  assert.equal(state.field(editorDiagramField).decorations.size, 0);
  state = state.update({ effects: setDiagramDisplay.of('preview') }).state;
  assert.equal(state.field(editorDiagramField).atoms.size, 2);
  assert.equal(state.doc.toString(), source); assert.equal(undoDepth(state), 0);
});

test('outer Markdown edits immediately invalidate old diagram identity, without stale atomic ranges', () => {
  const source = fence();
  for (const prefix of ['````markdown\n', '<pre>\n', '<!--\n', 'ordinary text']) {
    const state = create(source).update({ changes: { from: 0, insert: prefix } }).state;
    assert.equal(state.field(editorDiagramField).atoms.size, 0, prefix);
    assert.equal(state.doc.toString(), prefix + source);
  }
  const initial = create(source);
  const updated = initial.update({ changes: { from: 0, insert: '前言\n\n' } }).state;
  assert.equal(updated.field(editorDiagramField).items[0].from, 4);
  assert.equal(updated.field(editorDiagramField).items[0].original, source);
});

test('invalid diagram results reveal source, while stale async results cannot affect a new document', () => {
  const source = fence('futureDiagram\nA'); let state = create(source);
  const originalDoc = state.doc, item = state.field(editorDiagramField).items[0];
  state = state.update({ effects: diagramRenderFailed.of({ doc: originalDoc, item }) }).state;
  assert.equal(state.field(editorDiagramField).atoms.size, 0); assert.equal(state.doc.toString(), source);
  state = state.update({ effects: refreshDiagramPreviews.of({ doc: state.doc, items: editorDiagramItems(state.doc) }) }).state;
  assert.equal(state.field(editorDiagramField).items[0].failed, true);
  state = create(source);
  state = state.update({ effects: [diagramRenderFailed.of({ doc: originalDoc, item }), refreshDiagramPreviews.of({ doc: originalDoc, items: [] })] }).state;
  assert.equal(state.field(editorDiagramField).atoms.size, 1);
  state = state.update({ changes: { from: 0, insert: 'prefix\n\n' } }).state;
  assert.equal(state.field(editorDiagramField).items[0].from, item.from + 8);
  state = state.update({ effects: diagramRenderFailed.of({ doc: originalDoc, item }) }).state;
  assert.equal(state.field(editorDiagramField).items[0].failed, false);
});

test('rendered diagrams edit the exact selected block, deletion is isolated and fully undoable', () => {
  const source = fence() + '\n\n' + fence('flowchart LR\nA-->B'); const calls = [];
  const view = viewFor(create(source, { edit: item => calls.push(item.original) }));
  const firstDoc = view.state.doc, item = view.state.field(editorDiagramField).items[1];
  view.dispatch({ selection: { anchor: item.from, head: item.to } });
  assert.equal(editSelectedDiagram(view), true); assert.deepEqual(calls, [item.original]);
  assert.equal(deleteRenderedDiagram(view, item, view.state.doc), true);
  assert.equal(view.state.doc.toString(), fence() + '\n\n'); assert.equal(undoDepth(view.state), 1);
  assert.equal(deleteRenderedDiagram(view, item, firstDoc), false);
  undo(view); assert.equal(view.state.doc.toString(), source); assert.equal(view.state.field(editorDiagramField).items.length, 2);
  redo(view); assert.equal(view.state.doc.toString(), fence() + '\n\n');
  const readOnly = create(source, { edit: () => assert.fail('read-only edit') });
  const locked = EditorState.create({ doc: readOnly.doc, selection: { anchor: 0, head: fence().length }, extensions: [editorDiagramField,
    diagramPreviewContext.of({ edit() { assert.fail('read-only edit'); } }), EditorState.readOnly.of(true)] });
  assert.equal(editSelectedDiagram(viewFor(locked)), false); assert.equal(deleteRenderedDiagram(viewFor(locked), item, locked.doc), false);
});

test('preview work is bounded and oversized diagrams always keep source visible', () => {
  assert.equal(editorDiagramItems('x'.repeat(DIAGRAM_PREVIEW_DOCUMENT_LIMIT + 1)).length, 0);
  assert.equal(editorDiagramItems((fence() + '\n\n').repeat(DIAGRAM_PREVIEW_LIMIT + 10)).length, DIAGRAM_PREVIEW_LIMIT);
  const source = fence('pie\n' + 'x'.repeat(DIAGRAM_SOURCE_LIMIT));
  const state = create(source); assert.equal(state.field(editorDiagramField).items[0].oversized, true);
  assert.equal(state.field(editorDiagramField).atoms.size, 0); assert.equal(state.doc.toString(), source);
});

test('actual in-place save preserves no-op source and rejects immutable-document/session mismatches', () => {
  const renderer = readFileSync(new URL('../src/renderer.js', import.meta.url), 'utf8');
  const fn = renderer.slice(renderer.indexOf('function replaceExistingFlowchart('), renderer.indexOf('function insertGeneratedDiagram('));
  const source = fence(), doc = { sliceString: () => source }, calls = [];
  const context = vm.createContext({ state: { editing: true, documentSession: 1 }, codeEditor: { state: { doc }, dispatch: value => calls.push(value), focus() {} },
    projectedDiagramReplacement, isolateHistory, showToast() {}, t: key => key });
  vm.runInContext(fn, context);
  const range = { ...editorDiagramItems(source)[0], editorDoc: doc, documentSession: 1 };
  context.replaceExistingFlowchart(range, range.source); assert.equal(calls.length, 0);
  context.replaceExistingFlowchart({ ...range, editorDoc: {} }, 'pie\n"One": 2'); assert.equal(calls.length, 0);
  context.replaceExistingFlowchart({ ...range, documentSession: 0 }, 'pie\n"One": 2'); assert.equal(calls.length, 0);
  context.replaceExistingFlowchart(range, 'pie\n"One": 2'); assert.equal(calls.length, 1);
  assert.equal(calls[0].selection.head,range.from);
  assert.equal(calls[0].selection.anchor,range.from+calls[0].changes.insert.length);
});

test('actual widgets have local accessible actions, lazy rendering and cleanup; no detached floating editor', () => {
  const source = readFileSync(new URL('../src/editor-diagram-preview.js', import.meta.url), 'utf8');
  const renderer = readFileSync(new URL('../src/renderer.js', import.meta.url), 'utf8');
  const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
  assert.doesNotMatch(renderer + html, /editFlowchartButton|activeFlowchartFence/);
  assert.match(source, /root\.ondblclick/); assert.match(source, /event\.key === 'Enter'/);
  assert.match(source, /IntersectionObserver/); assert.match(source, /record\.context\.release\?\.\(dom\)/);
  assert.match(source, /event\.clipboardData\.setData\('text\/plain', found\.original\)/);
  assert.match(renderer, /syncEditorDiagramDisplay\(\)/);
  assert.match(html, /data-diagram-display="source"/);
});

test('actual save keeps the edited draft open when the document is stale', async () => {
  const renderer = readFileSync(new URL('../src/renderer.js', import.meta.url), 'utf8');
  const fn = renderer.slice(renderer.indexOf('function insertGeneratedDiagram('), renderer.indexOf('function openTableDialog('));
  let closed = 0;
  const context = vm.createContext({ els: { diagramSource: { value: 'pie\n"One": 2', focus() {} }, diagramDialog: { classList: { contains: () => false } } },
    state: { editing: true, documentSession: 1 }, codeEditor: { state: { doc: {}, selection: { eq: () => true } } },
    checkStructuredDiagramDraft: () => true, structuredDiagramState: { model: null }, flowchartDesignerState: { mode: 'source' },
    updateDiagramActionLabels() {}, validateDiagramRendering: async () => ({ valid: true }),
    diagramWizardState: { templateId: 'pie', editRange: {} }, diagramTemplateById: () => ({ engine: 'mermaid' }),
    closeDiagramDialog: () => closed++, replaceExistingFlowchart: () => false, t: key => key, showToast() {} });
  vm.runInContext(fn, context); await context.insertGeneratedDiagram();
  assert.equal(closed, 0); assert.equal(context.els.diagramSource.value, 'pie\n"One": 2');
  context.replaceExistingFlowchart = () => true; await context.insertGeneratedDiagram(); assert.equal(closed, 1);
});

test('actual insertion collapses every template, leaves a typing caret after it and preserves undo/source controls', async () => {
  const renderer = readFileSync(new URL('../src/renderer.js', import.meta.url), 'utf8');
  const insertFn = renderer.slice(renderer.indexOf('function insertGeneratedDiagram('), renderer.indexOf('function openTableDialog('));
  const replaceFn = renderer.slice(renderer.indexOf('function replaceSelection('), renderer.indexOf('function wrapSelection('));
  for (const template of DIAGRAM_TEMPLATES) for (const locale of ['zh', 'en']) {
    const source = diagramTemplateSource(template, locale).trim();
    const original = 'Before\nreplace me\nAfter';
    const view = viewFor(create(original));
    view.dispatch({ selection: { anchor: 7, head: 17 } });
    let closed = 0;
    const context = vm.createContext({
      els: { diagramSource: { value: source }, diagramDialog: { classList: { contains: () => false } } },
      state: { editing: true, documentSession: 1 }, codeEditor: view,
      diagramWizardState: { templateId: template.id, editRange: null }, diagramTemplateById: () => template,
      checkStructuredDiagramDraft: () => true, structuredDiagramState: { model: null }, flowchartDesignerState: { mode: 'source' },
      updateDiagramActionLabels() {}, validateDiagramRendering: async () => ({ valid: true }), validateEChartsSource: () => ({ valid: true }),
      closeDiagramDialog: () => closed++, t: key => key, showToast: message => assert.fail(message),
    });
    vm.runInContext(replaceFn + insertFn, context);
    await context.insertGeneratedDiagram();
    assert.equal(closed, 1, template.id);
    const markdown = `\n\n${fence(source, template.engine || 'mermaid')}\n\n`;
    const expected = original.slice(0, 7) + markdown + original.slice(17);
    assert.equal(view.state.doc.toString(), expected, template.id);
    const field = view.state.field(editorDiagramField), item = field.items[0];
    assert.equal(field.items.length, 1, template.id);
    assert.equal(item.open, false, template.id);
    assert.equal(field.atoms.size, 1, template.id);
    assert.equal(view.state.selection.main.empty, true);
    assert.equal(view.state.selection.main.head, 7 + markdown.length);
    assert.ok(view.state.selection.main.head > item.to);
    view.dispatch({ effects: toggleDiagramSource.of(item) });
    assert.equal(view.state.field(editorDiagramField).items[0].open, true);
    view.dispatch({ effects: toggleDiagramSource.of(item) });
    assert.equal(view.state.field(editorDiagramField).items[0].open, false);
    assert.equal(undoDepth(view.state), 1);
    assert.equal(undo(view), true); assert.equal(view.state.doc.toString(), original);
    assert.equal(redo(view), true); assert.equal(view.state.doc.toString(), expected);
    assert.equal(view.state.field(editorDiagramField).items[0].open, false);
  }
});
