import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { EditorState } from '@codemirror/state';
import { history, undo, redo, undoDepth, isolateHistory } from '@codemirror/commands';
import { marked } from 'marked';
import { prepareFootnotes } from '../src/markdown-formats.js';
import { findMarkdownLinkAt, linkEdit, footnoteEdit, validLinkDestination } from '../src/link-editing.js';

const apply = (source, edit) => EditorState.create({ doc: source }).update(edit).newDoc.toString();

for(const token of ['[文字][ref]','[ref][]','[ref]'])test(`footnote reference ${token} edits the root definition without moving its use`,()=>{
  const definition='[ref]: https://example.com/old "Old"',source='Intro[^n]\n\n[^n]: First\n    \n    '+token+'\n    \n    Last\n\n'+definition;
  const item=findMarkdownLinkAt(source,source.indexOf(token)+2);
  assert.equal(item.kind,'reference');assert.equal(source.slice(item.from,item.to),token);
  assert.equal(source.slice(item.urlFrom,item.urlTo),'https://example.com/old');assert.equal(source.slice(item.titleFrom,item.titleTo),'"Old"');
  const edit=linkEdit(source,{}, {...item,url:'https://example.com/new',title:'New'},item);
  assert.equal(apply(source,edit),source.replace(definition,'[ref]: <https://example.com/new> "New"'));
});
test('footnote direct and local-reference link coordinates include hidden indentation and Unicode',()=>{
  for(const [token,definition] of [['[文字](https://example.com/old "Old")',''],['[文字][local]','\n    \n    [local]: https://example.com/old "Old"']]) {
    const source='😀[^n]\n\n[^n]: First\n\t'+token+definition+'\n    \n    Last';
    const item=findMarkdownLinkAt(source,source.indexOf('文字'));
    assert.equal(source.slice(item.labelFrom,item.labelTo),'文字');assert.equal(source.slice(item.urlFrom,item.urlTo),'https://example.com/old');
    const changed=apply(source,linkEdit(source,{}, {...item,url:'https://example.com/new'},item));
    assert.ok(changed.startsWith('😀[^n]\n\n[^n]: First\n\t'));assert.ok(changed.endsWith('\n    \n    Last'));
    assert.equal(findMarkdownLinkAt(changed,changed.indexOf('文字')).url,'https://example.com/new');
  }
});
test('footnote code examples never open an existing-link edit and shared duplicates retain first-wins targets',()=>{
  const source='Ref[^n]\n\n[^n]: ` [ref] `\n    \n    ```md\n    [ref]\n    ```\n    \n    [text][ref]\n\n[ref]: https://example.com/first\n[ref]: https://example.com/second';
  for(const from of [source.indexOf('[ref]'),source.indexOf('[ref]',source.indexOf('```md'))])assert.equal(findMarkdownLinkAt(source,from+2),null);
  const link=findMarkdownLinkAt(source,source.indexOf('[text]')+2);assert.equal(link.url,'https://example.com/first');
});
test('inline links retain label Markdown, encoded destination and tooltip', () => {
  const source = 'Before [**文字**](<https://example.com/a b> "the \\"tip\\"") after';
  const item = findMarkdownLinkAt(source, source.indexOf('文字'));
  assert.equal(item.label, '**文字**'); assert.equal(item.url, 'https://example.com/a b'); assert.equal(item.title, 'the "tip"');
  assert.deepEqual(linkEdit(source, {}, item, item), { changes: [] });
  const edit = linkEdit(source, {}, { ...item, url: 'https://qm.ssssa.cn/a_(b)?x=1&y=2' }, item);
  const result = apply(source, edit);
  assert.match(result, /^Before \[\*\*文字\*\*\]/); assert.ok(result.endsWith(' after'));
  assert.match(marked.parse(result), /href="https:\/\/qm\.ssssa\.cn\/a_\(b\)\?x=1&(?:amp;)?y=2"/);
  assert.equal(findMarkdownLinkAt(result, result.indexOf('文字')).title, item.title);
});

for (const link of ['[label][REF]', '[ref][]', '[ref]']) test(`reference editing preserves other references: ${link}`, () => {
  const source = `${link} and [other][ref]\n\n[ref]: /old.md 'tip'\n\nTail`;
  const item = findMarkdownLinkAt(source, 2);
  assert.equal(item.kind, 'reference'); assert.equal(item.url, '/old.md');
  const result = apply(source, linkEdit(source, {}, { label: 'changed', url: '#section', title: 'new' }, item));
  assert.ok(result.includes('and [other][ref]'));
  assert.equal((marked.parse(result).match(/href="#section"/g) || []).length, 2);
  assert.ok(result.endsWith('\n\nTail'));
  assert.equal(findMarkdownLinkAt(result, 2).label, 'changed');
});

test('reference definition before link is edited in one sorted transaction', () => {
  const source = '[ref]: /old\n\n[a][ref]';
  const item = findMarkdownLinkAt(source, source.indexOf('[a]') + 1);
  const result = apply(source, linkEdit(source, {}, {label:'b',url:'/new',title:'title'},item));
  assert.equal(result, '[ref]: </new> "title"\n\n[b][ref]');
});

test('autolinks and empty inline destinations can be reopened', () => {
  const auto = findMarkdownLinkAt('<https://example.com>', 5);
  assert.equal(auto.kind, 'autolink');
  assert.equal(apply('<https://example.com>', linkEdit('', {}, {label:'https://qm.ssssa.cn',url:'https://qm.ssssa.cn'}, auto)), '<https://qm.ssssa.cn>');
  assert.equal(findMarkdownLinkAt('[empty]()', 3).url, '');
});

test('code, images, equations and unrelated selections are not existing links', () => {
  for (const source of ['`[x](https://example.com)`', '![x](https://example.com)', '$[x](https://example.com)$', '```\n[x](https://example.com)\n```'])
    assert.equal(findMarkdownLinkAt(source, source.indexOf('[x]') + 1), null, source);
  assert.equal(findMarkdownLinkAt('before [x](/path) after', 0, 21), null);
});

test('new links escape label brackets and unsafe delimiter characters', () => {
  const edit = linkEdit('text', {from:0,to:4}, {label:'文字 [说明] **bold**',url:'https://example.com/a>b',title:'"tip"'});
  const html = marked.parse(apply('text',edit));
  assert.match(html, /文字 \[说明\] <strong>bold<\/strong>/);
  assert.match(html, /href="https:\/\/example.com\/a%3Eb"/);
  assert.match(html, /title="&quot;tip&quot;"/);
});

test('unsafe schemes and invalid values cannot be inserted', () => {
  for (const url of ['javascript:alert(1)', 'javascript&#58;alert(1)', 'data:text/html,hi', 'file:///a', 'vbscript:x', '//host/a', 'https://', 'https:/host', 'a\nb', 'a\\b']) {
    assert.equal(validLinkDestination(url), false, url);
    assert.equal(linkEdit('', {from:0,to:0}, {label:'label',url}), null);
  }
  for (const url of ['https://qm.ssssa.cn','http://example.com','../文档.md','#标题','doc/a.md']) assert.equal(validLinkDestination(url), true);
  assert.equal(linkEdit('',{from:0,to:0},{label:'',url:'#a'}),null);
});

test('footnote insertion does not absorb paragraph suffix; multiline notes stay indented', () => {
  const source = '前文 注释 后文\n\n保留段落';
  assert.equal(apply(source, footnoteEdit(source,3,5,'note')), '前文 [^1] 后文\n\n保留段落\n\n[^1]: 注释\n');
  assert.equal(apply('a\nb',footnoteEdit('a\nb',0,3,'note')), '[^1]\n\n[^1]: a\n    b\n');
  assert.equal(apply('',footnoteEdit('',0,0,'note')), '[^1]\n\n[^1]: note\n');
  const existing = 'text[^1]\n\n[^1]: original\n';
  assert.ok(apply(existing,footnoteEdit(existing,0,4,'note')).endsWith('[^2]: text\n'));
});

test('multiline footnote definitions do not leak continuation lines into document body', () => {
  const source = '[^1] body\n\n[^1]: first\n    second\n\n    third\n\nTail';
  const parsed = prepareFootnotes(source);
  assert.equal(parsed.notes[0].text, 'first\nsecond\n\nthird');
  assert.ok(!parsed.markdown.includes('second'));
  assert.ok(parsed.markdown.endsWith('\n\nTail'));
  assert.deepEqual(parsed.lineMap, [0,1,6,7]);
  const multiline=apply('first\nsecond',footnoteEdit('first\nsecond',0,12,'note'));
  assert.equal(prepareFootnotes(multiline).notes[0].text,'first\nsecond');
});

const renderer = readFileSync(new URL('../src/renderer.js',import.meta.url),'utf8');
test('new reference links preserve suffix and avoid existing and unresolved labels', () => {
  const source = '前文 链接 后文\n\n[旧][引用名称]\n[引用名称-2]\n\n[引用名称]: https://example.com';
  const edit = linkEdit(source,{from:3,to:5},{label:'链接',url:'https://qm.ssssa.cn',title:'官网'},null,'reference','引用名称');
  const result = apply(source,edit);
  assert.ok(result.startsWith('前文 [链接][引用名称-3] 后文\n\n'));
  assert.ok(result.includes('[引用名称]: https://example.com'));
  assert.ok(result.endsWith('[引用名称-3]: <https://qm.ssssa.cn> "官网"\n'));
  assert.equal(findMarkdownLinkAt(result,4).url,'https://qm.ssssa.cn');
});
test('reference insertion at document end and empty document is a valid single transaction', () => {
  for (const source of ['', 'text']) {
    const result=apply(source,linkEdit(source,{from:0,to:source.length},{label:'label',url:'/doc'},null,'reference'));
    assert.equal(result,'[label][reference]\n\n[reference]: </doc>\n');
  }
  const source='[Reference]\n[reference-2]';
  assert.ok(apply(source,linkEdit(source,{from:0,to:0},{label:'a',url:'/a'},null,'reference')).startsWith('[a][reference-3]'));
});
test('autolink mode requires absolute safe HTTP URL and encodes spaces', () => {
  for(const url of ['普通文字','#heading','doc.md','javascript:alert(1)','https://'])
    assert.equal(linkEdit('text',{from:0,to:4},{url},null,'autolink'),null);
  const result=apply('前 text 后',linkEdit('前 text 后',{from:2,to:6},{url:'https://qm.ssssa.cn/a b'},null,'autolink'));
  assert.equal(result,'前 <https://qm.ssssa.cn/a%20b> 后');
  assert.match(marked.parse(result),/href="https:\/\/qm.ssssa.cn\/a%20b"/);
});
test('autolink editing keeps URL as text and unchanged edits add no transaction', () => {
  const source='<https://example.com>',existing=findMarkdownLinkAt(source,4);
  assert.deepEqual(linkEdit(source,{},existing,existing,'autolink'),{changes:[]});
  assert.equal(apply(source,linkEdit(source,{}, {url:'https://qm.ssssa.cn'},existing,'autolink')),'<https://qm.ssssa.cn>');
});
function dialogHarness(doc) {
  const view = { state: EditorState.create({doc,extensions:[history()]}),focus(){},dispatch(spec){this.state=this.state.update(spec).state;} };
  view.dispatch=view.dispatch.bind(view);
  const fields = Object.fromEntries(['linkLabel','linkDestination','linkTitle','linkError'].map(key=>[key,{value:'',textContent:'',focus(){}}]));
  const state={editing:true,documentSession:1,linkEditContext:{editor:view,doc:view.state.doc,session:1,range:{from:0,to:doc.length},existing:null}};
  const context=vm.createContext({state,codeEditor:view,$:s=>fields[s.slice(1)],linkEdit,validLinkDestination,isolateHistory,t:s=>s,closeLinkDialog(){context.closed=true;}});
  vm.runInContext(renderer.slice(renderer.indexOf('function saveLinkDialog('),renderer.indexOf('function runFormatCommand(')),context);
  return {view,fields,state,context};
}
test('actual dialog save is atomic, undoable and rejects stale document/session', () => {
  const {view,fields,state,context}=dialogHarness('target');
  fields.linkLabel.value='target';fields.linkDestination.value='https://qm.ssssa.cn';
  assert.equal(context.saveLinkDialog(),true);assert.equal(undoDepth(view.state),1);
  const changed=view.state.doc.toString();assert.ok(changed.includes('https://qm.ssssa.cn'));
  undo(view);assert.equal(view.state.doc.toString(),'target');redo(view);assert.equal(view.state.doc.toString(),changed);
  assert.equal(context.saveLinkDialog(),false);assert.equal(fields.linkError.textContent,'linkStale');
  state.linkEditContext.doc=view.state.doc;state.documentSession++;
  assert.equal(context.saveLinkDialog(),false);assert.equal(view.state.doc.toString(),changed);
});

test('actual unchanged link save adds no undo item; invalid input retains dialog', () => {
  const source='[x](/doc "tip")'; const {view,fields,state,context}=dialogHarness(source);
  const existing=findMarkdownLinkAt(source,1);state.linkEditContext.existing=existing;
  fields.linkLabel.value=existing.label;fields.linkDestination.value=existing.url;fields.linkTitle.value=existing.title;
  assert.equal(context.saveLinkDialog(),true);assert.equal(undoDepth(view.state),0);
  fields.linkDestination.value='javascript:alert(1)';context.closed=false;
  assert.equal(context.saveLinkDialog(),false);assert.equal(context.closed,false);assert.equal(view.state.doc.toString(),source);
});

test('actual dialog reference and auto modes are atomic with undo and redo', () => {
  for (const mode of ['reference','autolink']) {
    const {view,fields,state,context}=dialogHarness('target');
    state.linkEditContext.mode=mode;
    fields.linkLabel.value='target';fields.linkDestination.value='https://qm.ssssa.cn';
    assert.equal(context.saveLinkDialog(),true);assert.equal(undoDepth(view.state),1);
    const changed=view.state.doc.toString();
    assert.ok(changed.startsWith(mode==='reference'?'[target][referenceName]':'<https://'));
    undo(view);assert.equal(view.state.doc.toString(),'target');redo(view);assert.equal(view.state.doc.toString(),changed);
  }
});

test('URL-looking label text cannot override the destination of its explicit link', () => {
  const source='[https://example.com/display](https://example.com/actual)';
  const found=findMarkdownLinkAt(source,source.indexOf('display'));
  assert.equal(found.kind,'inline');assert.equal(found.url,'https://example.com/actual');assert.equal(found.label,'https://example.com/display');
});

test('reference labels retain literal entities instead of activating a different definition', () => {
  assert.equal(findMarkdownLinkAt('[label][a&amp;b]\n\n[a&b]: https://example.com',3),null);
  assert.equal(findMarkdownLinkAt('[label][a&amp;b]\n\n[a&amp;b]: https://example.com',3).url,'https://example.com');
});
