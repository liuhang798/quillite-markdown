import test from 'node:test';
import assert from 'node:assert/strict';
import { EditorState } from '@codemirror/state';
import { history, undo, redo, undoDepth, isolateHistory } from '@codemirror/commands';
import { marked } from 'marked';
import { structuredHtmlBlocks, insertHtmlBlock } from '../src/html-block-editing.js';
import { buildLivePlan, livePreviewField, liveSourceBlock, insertLiveNewline, editorLivePreview, renderedEditableBlocks } from '../src/editor-live-preview.js';
import { fieldPosition, fieldOffset, fieldInsertion, fieldText } from '../src/projected-code.js';

const sample = '<details>\n<summary>标题</summary>\n\n内容 **加粗**\n\n</details>';
for (const prefix of ['> ', '>> ', '> > ', '  > ', '>   ']) for (const kind of ['details','div']) {
  test(`quoted ${kind} preserves editable fields, all offsets and newlines (${JSON.stringify(prefix)})`, () => {
    const plain=kind==='details'?sample:'<div>\n\n内容 **加粗**\n第二行\n\n</div>';
    const source=plain.split('\n').map(line=>prefix+line).join('\n');
    const item=buildLivePlan(source).widgets.find(item=>item.kind===(kind==='details'?'details':'html-content'));
    assert.ok(item);assert.equal(item.raw,source.slice(prefix.length));
    const body=item.cells.at(-1),text=fieldText(source,body);
    assert.equal(text,kind==='details'?'内容 **加粗**':'内容 **加粗**\n第二行');
    for(let i=0;i<=text.length;i++)assert.equal(fieldOffset(body,fieldPosition(body,i)),i);
    const insert=fieldInsertion(body,'\n新行'),at=fieldPosition(body,text.length);
    assert.equal(insert,'\n'+prefix+'新行');
    const updated=source.slice(0,at)+insert+source.slice(at);
    const next=buildLivePlan(updated).widgets.find(item=>item.kind===itemKind(kind));
    assert.equal(fieldText(updated,next.cells.at(-1)),text+'\n新行');
  });
}
function itemKind(kind){return kind==='details'?'details':'html-content';}
test('quoted blocks accept optional quote whitespace without consuming unquoted prose or fenced HTML',()=>{
  const varied='> <details>\n><summary>Title</summary>\n>\n>ALPHA\n> BETA\n>\n></details>';
  const item=buildLivePlan(varied).widgets.find(item=>item.kind==='details');
  assert.equal(fieldText(varied,item.cells[1]),'ALPHA\nBETA');
  assert.ok(!buildLivePlan(varied.replace('> BETA','BETA')).widgets.some(item=>item.kind==='details'));
  assert.ok(!buildLivePlan('```html\n'+varied+'\n```').widgets.some(item=>item.kind==='details'));
  assert.ok(!buildLivePlan(varied.replace('<details>','<details onclick="bad()">')).widgets.some(item=>item.kind==='details'));
  assert.ok(!buildLivePlan(varied.replace('ALPHA','<script>bad()</script>')).widgets.some(item=>item.kind==='details'));
});
test('quoted details recurse through footnote and HTML owners without exposing hidden prefixes',()=>{
  const detail=sample.replace('内容 **加粗**','```text\nALPHA\nBETA\n```');
  for(const outer of [text=>text,text=>'Ref[^n]\n\n[^n]: '+text.replaceAll('\n','\n    '),text=>'<div>\n\n'+text+'\n\n</div>']) {
    const source=outer(detail.split('\n').map(line=>'> '+line).join('\n'));
    const state=EditorState.create({doc:source,extensions:editorLivePreview});
    const blocks=renderedEditableBlocks(state),code=blocks.find(item=>item.kind==='code'),details=blocks.find(item=>item.kind==='details');
    assert.ok(code);assert.ok(details);
    const field={from:code.contentFrom,to:code.contentTo,projection:code.projection};
    assert.equal(fieldText(source,field),'ALPHA\nBETA');
    assert.equal(fieldPosition(field,6),source.indexOf('BETA'));
    assert.equal(fieldText(source,details.cells[0]),'标题');
    assert.ok(details.cells[1].projection.prefix.endsWith('> '));
  }
});
test('structured quoted HTML leaves following quote markers and formatting rendered',()=>{
  const source=(sample+'\n\n**AFTER**').split('\n').map(line=>'> '+line).join('\n'),plan=buildLivePlan(source);
  const marker=source.lastIndexOf('> '),word=source.indexOf('AFTER');
  assert.ok(plan.hides.some(range=>range.from===marker&&range.to===marker+2));
  assert.ok(plan.marks.some(range=>range.from<=word&&range.to>=word+5&&range.className.includes('strong')));
  const code=sample.replace('内容 **加粗**','```html\n</details>\n```').split('\n').map(line=>'> '+line).join('\n');
  assert.equal(buildLivePlan(code).widgets.find(item=>item.kind==='details')?.raw,code.slice(2));
});
test('balanced details occupy one block with exact editable title and body ranges', () => {
  const source='前文\n\n'+sample+'\n\n后文',plan=buildLivePlan(source);
  assert.equal(plan.widgets.length,1);
  const item=plan.widgets[0];assert.equal(item.kind,'details');assert.equal(item.raw,sample);
  assert.deepEqual(item.cells.map(c=>source.slice(c.from,c.to)),['标题','内容 **加粗**']);
  assert.equal(plan.marks.length,0);assert.equal(plan.hides.length,0);
});
test('nested blocks retain one outer source range; code and comments do not balance HTML tags', () => {
  const nested=sample.replace('内容 **加粗**',sample);
  assert.equal(buildLivePlan(nested).widgets.length,1);
  const code=sample.replace('内容 **加粗**','```html\n</details>\n```');
  const item=buildLivePlan(code).widgets[0];assert.equal(item.kind,'details');assert.equal(item.raw,code);
  const comment=sample.replace('内容 **加粗**','<!-- </details> -->\n\n正文');
  assert.equal(buildLivePlan(comment).widgets[0].raw,comment);
  assert.ok(!buildLivePlan('```html\n'+sample+'\n```').widgets.some(i=>i.kind==='details'));
});
test('unsupported HTML retains source rather than rendering split empty fragments', () => {
  for(const raw of [sample.replace('</details>',''),sample.replace('<details>','<details onclick="x()">'),sample.replace('内容 **加粗**','<script>alert(1)</script>'),sample.replace('<summary>标题</summary>','<summary><b>标题</b></summary>')]) {
    assert.ok(!buildLivePlan(raw).widgets.some(i=>i.kind==='details'),raw);
    assert.ok(!buildLivePlan(raw).widgets.some(i=>i.kind==='html'),raw);
  }
});
test('new HTML and details blocks preserve surrounding text and form Markdown-reading boundaries', () => {
  for(const kind of ['div','details']) {
    const source='前文 **内容** 后文\n\n结尾';
    const edit=insertHtmlBlock(source,3,9,kind,'内容','标题');
    const result=EditorState.create({doc:source}).update(edit).newDoc.toString();
    assert.ok(result.startsWith('前文 \n\n<'));assert.ok(result.endsWith('\n\n 后文\n\n结尾'));
    assert.match(marked.parse(result),/<strong>内容<\/strong>/);
    const item=structuredHtmlBlocks(result)[0];assert.ok(item);assert.equal(item.cells.at(-1).to-item.cells.at(-1).from,6);
    assert.equal(result.slice(edit.selection.anchor,edit.selection.head),kind==='details'?'标题':'**内容**');
  }
});
test('empty HTML bodies preserve space before closing tags and existing blank boundaries', () => {
  const empty='<div>\n\n\n\n</div>',item=structuredHtmlBlocks(empty)[0],range=item.cells[0];
  assert.equal(range.from,range.to);
  const result=EditorState.create({doc:empty}).update({changes:{from:range.from,insert:'正文'}}).newDoc.toString();
  assert.match(marked.parse(result),/<p>正文<\/p>/);
  const source='前文\n\n后文',edit=insertHtmlBlock(source,4,4,'div','内容');
  assert.ok(!EditorState.create({doc:source}).update(edit).newDoc.toString().includes('\n\n\n'));
});

test('editable prose Enter closes inline formatting and preserves intentional blank lines', () => {
  const doc='正文 **加粗**';
  const view={state:EditorState.create({doc,selection:{anchor:doc.length-2},extensions:[livePreviewField]}),dom:{classList:{contains:name=>['cm-live-inner','cm-live-prose'].includes(name)}},dispatch(t){this.state=this.state.update(t).state;}};
  assert.equal(insertLiveNewline(view),true);assert.equal(view.state.doc.toString(),doc+'\n');
  const source=sample.replace('内容 **加粗**','\n正文\n\n');
  const range=structuredHtmlBlocks(source)[0].cells[1];assert.equal(source.slice(range.from,range.to),'\n正文\n\n');
});
test('standalone comments remain discoverable and editable without interpreting their contents', () => {
  const source='<!-- **注释** -->\n\n正文',plan=buildLivePlan(source),item=plan.widgets[0];
  assert.equal(item.kind,'comment');assert.equal(source.slice(item.cells[0].from,item.cells[0].to),' **注释** ');
  assert.ok(!marked.parse(source).includes('<strong>'));
});
test('table layout metadata stays hidden only when attached to a real table', () => {
  const metadata = '<!-- quillite-table-widths: 220, 220 -->';
  const source = metadata + '\n| A | B |\n| --- | --- |\n| x | y |';
  const plan = buildLivePlan(source);
  assert.ok(!plan.widgets.some(item => item.kind === 'comment'));
  assert.ok(plan.hides.some(item => item.from === 0 && item.to === metadata.length));
  assert.ok(buildLivePlan(metadata).widgets.some(item => item.kind === 'comment'));
  assert.ok(buildLivePlan('```html\n' + source + '\n```').widgets.every(item => item.kind === 'code'));
});
test('structured block selection stays rendered; source return is explicit and history-neutral', () => {
  let state=EditorState.create({doc:sample,extensions:[livePreviewField,history()]});
  const item=state.field(livePreviewField).plan.widgets[0];
  const widgets=()=>{const found=[];state.field(livePreviewField).decorations.between(0,state.doc.length,(_f,_t,d)=>{if(d.spec.widget)found.push(d.spec.widget)});return found;};
  state=state.update({selection:{anchor:item.cells[1].from}}).state;
  assert.ok(widgets().some(w=>w.item?.kind==='details'));
  state=state.update({effects:liveSourceBlock.of(item.from)}).state;
  assert.ok(widgets().some(w=>w.sourceItem?.kind==='details'));assert.ok(!widgets().some(w=>w.item?.kind==='details'));
  state=state.update({effects:liveSourceBlock.of(null)}).state;
  assert.ok(widgets().some(w=>w.item?.kind==='details'));assert.equal(undoDepth(state),0);
});
test('structured block insertion, title and body changes share authoritative undo history', () => {
  const view={state:EditorState.create({doc:'内容',extensions:[livePreviewField,history()]}),dispatch(t){this.state=this.state.update(t).state;}};view.dispatch=view.dispatch.bind(view);
  view.dispatch({...insertHtmlBlock('内容',0,2,'details','内容','标题'),annotations:isolateHistory.of('full')});
  const inserted=view.state.doc.toString(),range=view.state.field(livePreviewField).plan.widgets[0].cells[0];
  view.dispatch({changes:{from:range.from,to:range.to,insert:'修改'},annotations:isolateHistory.of('full')});
  undo(view);assert.equal(view.state.doc.toString(),inserted);undo(view);assert.equal(view.state.doc.toString(),'内容');redo(view);assert.equal(view.state.doc.toString(),inserted);
});
