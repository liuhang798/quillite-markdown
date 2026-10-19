import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { EditorState, EditorSelection, Compartment } from '@codemirror/state';
import { markdown } from '@codemirror/lang-markdown';
import { history, undo, redo } from '@codemirror/commands';
import { buildLivePlan, livePreviewField, livePreviewContext, liveComposition, liveSourceBlock, liveFormatSelection, insertLiveNewline, deleteLiveHeadingBackward, LIVE_PREVIEW_LIMIT } from '../src/editor-live-preview.js';
import { tableCellRanges, safeCellInsertion } from '../src/live-editable-block.js';
import { editorFormulaField } from '../src/editor-formula-preview.js';
import { imagePreviewField } from '../src/embedded-image-preview.js';
import { TEXT_COLOR_BY_ID, textColorValue } from '../src/text-colors.js';
import { formatSelectionEdits, inlineFormatEdit, textColorEdit } from '../src/inline-format-toggle.js';
import { findMarkdownLinkAt } from '../src/link-editing.js';

test('footnote widget equality invalidates captured actions when identity context changes',()=>{
 const scope=new Compartment(),first={editFootnote(){}},second={editFootnote(){}};
 let state=EditorState.create({doc:'Ref[^n]\n\n[^n]: Note',extensions:[livePreviewField,scope.of(livePreviewContext.of(first))]});
 const widget=s=>{let found;s.field(livePreviewField).decorations.between(0,s.doc.length,(_from,_to,d)=>{if(d.spec.widget?.item?.kind==='footnote')found=d.spec.widget;});assert.ok(found);return found;};
 const before=widget(state);state=state.update({effects:scope.reconfigure(livePreviewContext.of(second))}).state;
 const after=widget(state);assert.equal(before.doc,after.doc);assert.equal(before.eq(after),false);
 assert.equal(after.context,second);
 assert.equal(after.eq(widget(state)),true);
});

test('inline HTML breaks render as stable atomic line breaks only in prose', () => {
  for(const tag of ['<br>','<BR>','<br />']){
    const doc='### before'+tag+'after',plan=buildLivePlan(doc),item=plan.widgets.find(w=>w.kind==='break');
    assert.ok(item,tag);assert.equal(doc.slice(item.from,item.to),tag);
    const state=EditorState.create({doc,selection:{anchor:doc.indexOf(tag)},extensions:[livePreviewField]});
    let found=false;
    state.field(livePreviewField).decorations.between(item.from,item.to,(from,to,value)=>{
      if(value.spec.widget?.item?.kind==='break'){found=true;assert.equal(value.spec.widget.lineBreaks,1);assert.equal(value.spec.atomicWidget,true);}
    });assert.ok(found);
  }
  for(const doc of ['`<br>`','```html\n<br>\n```','$<br>$','before <br onclick="evil()"> after'])assert.equal(buildLivePlan(doc).widgets.filter(w=>w.kind==='break').length,0,doc);
});

test('live editing renders every toolbar palette color as editable text, not HTML source', () => {
  for (const id of ['default', ...TEXT_COLOR_BY_ID.keys()]) {
    const open = `<span data-md-color="${id}">`, doc = '# 标题\n正文\n' + open + '我要颜色' + '</span>';
    const plan = buildLivePlan(doc), color = plan.marks.find(item => item.className === 'cm-live-color');
    assert.ok(color, id);
    assert.equal(color.color, textColorValue(id));
    const from = doc.indexOf(open), end = doc.length - 7;
    assert.ok(plan.hides.some(item => item.from === from && item.to === from + open.length));
    assert.ok(plan.hides.some(item => item.from === end && item.to === doc.length));
    const view = { state: create(doc, [markdown()]).update({ selection: { anchor: end } }).state, dispatch(spec) { this.state = this.state.update(spec).state; } };
    assert.equal(insertLiveNewline(view), true);
    assert.equal(view.state.doc.toString(), doc + '\n');
  }
});

test('live palette colors never interpret code, equations, unknown colors or unsafe attributes', () => {
  const tag = '<span data-md-color="spectrum-3-red">颜色</span>';
  for (const doc of ['`' + tag + '`', '```html\n' + tag + '\n```', '$' + tag + '$', '<span data-md-color="red; background:url(https://example.com)">颜色</span>', '<span data-md-color="unknown">颜色</span>', '<span data-md-color="red" onclick="alert(1)">颜色</span>']) {
    assert.equal(buildLivePlan(doc).marks.filter(item => item.className === 'cm-live-color').length, 0, doc);
  }
});

const source = '# 标题\n\n**加粗**、*斜体*、~~删除~~、==高亮==、`代码`、[链接](https://example.com)\n\n> 引用\n\n- [ ] 任务\n- 项目\n\n| 名称 | 数量 |\n| --- | ---: |\n| 中文 | 2 |\n\n---\n\n结束\n';
const create = (doc = source, extensions = []) => EditorState.create({ doc, selection: { anchor: doc.length }, extensions: [history(), livePreviewField, ...extensions] });
const ranges = state => { const result = []; state.field(livePreviewField).decorations.between(0, state.doc.length, (from, to, value) => result.push({ from, to, value })); return result; };

test('Setext Enter exits after its underline, Backspace at start removes only its heading role, both undo exactly', () => {
  for (const [prefix, continuation] of [['',''],['> ','> '],['- ','  '],['> - ','>   ']]) for (const underline of ['===','---']) for (const tail of ['', '\n'+continuation+'Next']) {
    const doc=prefix+'Title\n'+continuation+'second\n'+continuation+underline+tail;
    for (const key of ['Enter','Backspace']) {
      const anchor=key==='Enter'?doc.indexOf('second')+6:prefix.length;
      const before=create(doc,[markdown()]).update({selection:{anchor}}).state;
      const view={state:before,dispatch(spec){this.state=spec.state||this.state.update(spec).state;}};
      const command=key==='Enter'?insertLiveNewline:deleteLiveHeadingBackward;
      assert.equal(command(view),true,doc+' '+key);
      const expected=key==='Enter'?doc.replace(underline+tail,underline+'\n'+continuation+tail):doc.replace(underline,'');
      assert.equal(view.state.doc.toString(),expected,doc+' '+key);
      assert.equal(undo({state:view.state,dispatch:tr=>{view.state=tr.state;}}),true);
      assert.equal(view.state.doc.toString(),doc);assert.ok(view.state.selection.eq(before.selection));
    }
  }
});

test('Setext boundary commands respect source mode, composition, selections, protected code and read-only state', () => {
  for(const command of [insertLiveNewline,deleteLiveHeadingBackward])for(const mode of ['source','composition','readonly','selection','code']){
    const doc=mode==='code'?'```md\nTitle\n===\n```':'Title\n===';
    let state=EditorState.create({doc,selection:mode==='selection'?{anchor:0,head:5}:{anchor:command===insertLiveNewline?doc.indexOf('Title')+5:doc.indexOf('Title')},extensions:[markdown(),...(mode==='source'?[]:[livePreviewField]),EditorState.readOnly.of(mode==='readonly')]});
    if(mode==='composition')state=state.update({effects:liveComposition.of(true)}).state;
    assert.equal(command({state,dispatch(){assert.fail('must not dispatch');}}),false,mode);
  }
});

test('Setext boundaries retain inline wrappers and support separate heading cursors', () => {
  const doc='**One**\n===\n\n==Two==\n---';
  for (const command of [insertLiveNewline,deleteLiveHeadingBackward]) {
    const positions=command===insertLiveNewline?[5,doc.indexOf('Two')+3]:[2,doc.indexOf('Two')];
    const state=create(doc,[markdown(),EditorState.allowMultipleSelections.of(true)]).update({selection:EditorSelection.create(positions.map(p=>EditorSelection.cursor(p)),1)}).state;
    const view={state,dispatch(spec){this.state=spec.state||this.state.update(spec).state;}};
    assert.ok(command(view));
    assert.equal(view.state.doc.toString(),command===insertLiveNewline?'**One**\n===\n\n\n==Two==\n---\n':'**One**\n\n\n==Two==\n');
    assert.equal(view.state.selection.ranges.length,2);assert.equal(view.state.selection.mainIndex,1);
    undo({state:view.state,dispatch:tr=>{view.state=tr.state;}});assert.equal(view.state.doc.toString(),doc);assert.ok(view.state.selection.eq(state.selection));
  }
});

test('mixed live cursors continue each Markdown context and renumber ordered items in one undo step', () => {
  for(const [doc,expected] of [
    ['alpha\n===\n\n> alpha\n\nalpha','alpha\n===\n\n\n> alpha\n> \n\nalpha\n'],
    ['alpha\n===\n\n1. alpha\n2. alpha\n\nplain alpha','alpha\n===\n\n\n1. alpha\n2. \n3. alpha\n4. \n\nplain alpha\n'],
    ['alpha\n\n> alpha\n\n- alpha','alpha\n\n\n> alpha\n> \n\n- alpha\n- '],
  ]) {
    const positions=[...doc.matchAll(/alpha/g)].map(match=>match.index+5);
    const state=create(doc,[markdown(),EditorState.allowMultipleSelections.of(true)]).update({selection:EditorSelection.create(positions.map(p=>EditorSelection.cursor(p)),1)}).state;
    const view={state,dispatch(spec){this.state=spec.state||this.state.update(spec).state;}};
    assert.ok(insertLiveNewline(view));assert.equal(view.state.doc.toString(),expected);
    assert.equal(view.state.selection.ranges.length,positions.length);assert.equal(view.state.selection.mainIndex,1);
    undo({state:view.state,dispatch:tr=>{view.state=tr.state;}});assert.equal(view.state.doc.toString(),doc);assert.ok(view.state.selection.eq(state.selection));
  }
});

test('mixed heading, quote and Unicode character Backspace retains every cursor and exact undo', () => {
  const doc='alpha\n===\n\n> alpha\n\n😀alpha';
  const positions=[...doc.matchAll(/alpha/g)].map(match=>match.index);
  const state=create(doc,[markdown(),EditorState.allowMultipleSelections.of(true)]).update({selection:EditorSelection.create(positions.map(p=>EditorSelection.cursor(p)),2)}).state;
  const view={state,dispatch(spec){this.state=spec.state||this.state.update(spec).state;}};
  assert.ok(deleteLiveHeadingBackward(view));assert.equal(view.state.doc.toString(),'alpha\n\n\nalpha\n\nalpha');
  assert.equal(view.state.selection.ranges.length,3);assert.equal(view.state.selection.mainIndex,2);
  undo({state:view.state,dispatch:tr=>{view.state=tr.state;}});assert.equal(view.state.doc.toString(),doc);assert.ok(view.state.selection.eq(state.selection));
});

test('heading splits retain containers, paired inline styles and caret across ATX and Setext forms', () => {
  const styles=[['',''],['**','**'],['*','*'],['***','***'],['~~','~~'],['==','=='],['`','`'],['<u>','</u>'],['<sup>','</sup>'],['<sub>','</sub>'],['<kbd>','</kbd>'],['<mark>','</mark>'],['<span data-md-color="red">','</span>'],['<span data-md-color="red">**','**</span>']];
  for(const [prefix,continuation]of [['',''],['> ','> '],['- ','  '],['> - ','>   ']])for(const setext of [false,true])for(const [open,close]of styles)for(const offset of [0,1]){
    const doc=prefix+(setext?'':'## ')+open+'alpha beta'+close+(setext?'\n'+continuation+'===':' ##')+'\n'+continuation+'Next';
    const anchor=doc.indexOf('beta')-offset;
    const state=create(doc,[markdown()]).update({selection:{anchor}}).state;
    const view={state,dispatch(spec){this.state=spec.state||this.state.update(spec).state;}};
    assert.ok(insertLiveNewline(view),doc);
    assert.equal(view.state.doc.toString(),prefix+(setext?'# ':'## ')+open+'alpha'+close+'\n'+prefix+open+'beta'+close+(setext?'\n'+continuation:'')+'\n'+continuation+'Next',doc);
    assert.equal(view.state.sliceDoc(view.state.selection.main.head,view.state.selection.main.head+4),'beta');
    undo({state:view.state,dispatch:tr=>{view.state=tr.state;}});assert.equal(view.state.doc.toString(),doc);assert.ok(view.state.selection.eq(state.selection));
  }
});

test('heading normalization maps multiple carets within one Setext heading rather than collapsing them', () => {
  const doc='alpha beta gamma\n===\nNext';
  const state=create(doc,[markdown(),EditorState.allowMultipleSelections.of(true)]).update({selection:EditorSelection.create([EditorSelection.cursor(6),EditorSelection.cursor(11)],1)}).state;
  const view={state,dispatch(spec){this.state=spec.state||this.state.update(spec).state;}};
  assert.ok(insertLiveNewline(view));assert.equal(view.state.doc.toString(),'# alpha\nbeta\ngamma\n\nNext');
  assert.deepEqual(view.state.selection.ranges.map(r=>r.head),[8,13]);assert.equal(view.state.selection.mainIndex,1);
  undo({state:view.state,dispatch:tr=>{view.state=tr.state;}});assert.equal(view.state.doc.toString(),doc);assert.ok(view.state.selection.eq(state.selection));
});

test('splitting at the start of styled heading text moves opening tags without creating empty wrappers', () => {
  for(const [open,close]of [['**','**'],['==','=='],['<span data-md-color="red">**','**</span>']]){
    const doc='## '+open+'alpha beta'+close;
    const state=create(doc,[markdown()]).update({selection:{anchor:doc.indexOf('alpha')}}).state;
    const view={state,dispatch(spec){this.state=spec.state||this.state.update(spec).state;}};
    assert.ok(insertLiveNewline(view));assert.equal(view.state.doc.toString(),'## \n'+open+'alpha beta'+close);
  }
});

test('heading link splits preserve targets, reference definitions and nesting with one undo', () => {
  const url='https://example.com/path';
  for(const [prefix,continuation]of [['',''],['> ','> '],['- ','  ']])for(const setext of [false,true])for(const [text,definition,left,right]of [
    [`[alpha beta](${url} "Title")`,'',`[alpha](${url} "Title")`,`[beta](${url} "Title")`],
    ['[alpha beta][ref]',`\n\n[ref]: ${url}`,'[alpha][ref]','[beta][ref]'],
    ['[alpha beta][]',`\n\n[alpha beta]: ${url}`,'[alpha][alpha beta]','[beta][alpha beta]'],
    ['[alpha beta]',`\n\n[alpha beta]: ${url}`,'[alpha][alpha beta]','[beta][alpha beta]'],
    [`[**alpha beta**](${url})`,'',`[**alpha**](${url})`,`[**beta**](${url})`],
    [`**[alpha beta](${url})**`,'',`**[alpha](${url})**`,`**[beta](${url})**`],
    [`<span data-md-color="red">[==alpha beta==](${url})</span>`,'',`<span data-md-color="red">[==alpha==](${url})</span>`,`<span data-md-color="red">[==beta==](${url})</span>`],
  ]){
    const doc=prefix+(setext?'':'## ')+text+(setext?'\n'+continuation+'===':'')+'\n'+continuation+'Next'+definition;
    const state=create(doc,[markdown()]).update({selection:{anchor:doc.indexOf('beta')}}).state;
    const view={state,dispatch(spec){this.state=spec.state||this.state.update(spec).state;}};
    assert.ok(insertLiveNewline(view));assert.equal(view.state.doc.toString(),prefix+(setext?'# ':'## ')+left+'\n'+prefix+right+(setext?'\n'+continuation:'')+'\n'+continuation+'Next'+definition);
    const after=view.state.doc.toString();for(const word of ['alpha','beta'])assert.equal(findMarkdownLinkAt(after,after.indexOf(word)).url,url);
    assert.equal(view.state.sliceDoc(view.state.selection.main.head,view.state.selection.main.head+4),'beta');
    undo({state:view.state,dispatch:tr=>{view.state=tr.state;}});assert.equal(view.state.doc.toString(),doc);assert.ok(view.state.selection.eq(state.selection));
  }
});

test('autolink splits preserve the full destination and escape literal URL label syntax', () => {
  const url='https://example.com/a[1]_x*alpha_beta';
  const doc='## <'+url+'>',state=create(doc,[markdown()]).update({selection:{anchor:doc.indexOf('beta')}}).state;
  const view={state,dispatch(spec){this.state=spec.state||this.state.update(spec).state;}};
  assert.ok(insertLiveNewline(view));const after=view.state.doc.toString();
  assert.equal(after,'## [https://example.com/a\\[1\\]\\_x\\*alpha\\_](<'+url+'>)\n[beta](<'+url+'>)');
  assert.equal(findMarkdownLinkAt(after,after.indexOf('alpha')).url,url);
  assert.equal(findMarkdownLinkAt(after,view.state.selection.main.head).url,url);
});

test('link label start moves the link instead of leaving empty links; unresolved references stay literal', () => {
  for(const text of ['[alpha beta](./target)','[alpha beta]()']) {
    const doc='## '+text,state=create(doc,[markdown()]).update({selection:{anchor:doc.indexOf('alpha')}}).state;
    const view={state,dispatch(spec){this.state=spec.state||this.state.update(spec).state;}};
    assert.ok(insertLiveNewline(view));assert.equal(view.state.doc.toString(),'## \n'+text);
  }
  assert.equal(buildLivePlan('## [alpha beta][]').marks.filter(m=>m.className==='cm-live-link').length,0);
  assert.equal(buildLivePlan('## [alpha beta][]\n\n[alpha beta]: ./target').marks.filter(m=>m.className==='cm-live-link').length,1);
});

test('inline task, bullet and entity widgets stay stable at every caret and selection position', () => {
  for (const doc of ['- [ ] task', '- [x] done', '- [ ] ', '- bullet', 'text &amp; entity']) {
    const state = create(doc, [markdown()]);
    const expected = ranges(state).filter(item => item.value.spec.atomicWidget).map(item => [item.from, item.to]);
    assert.ok(expected.length > 0, doc);
    for (let position = 0; position <= doc.length; position++) {
      for (const selection of [{ anchor: position }, { anchor: 0, head: position }, { anchor: doc.length, head: position }]) {
        const next = state.update({ selection }).state;
        assert.deepEqual(ranges(next).filter(item => item.value.spec.atomicWidget).map(item => [item.from, item.to]), expected, `${doc}: ${position}`);
        assert.equal(next.doc.toString(), doc);
      }
    }
  }
});

test('task prose renders custom inline formats, keeps checkboxes and closes formats before Enter', () => {
  const formats = [
    ['==', '==', 'cm-live-highlight'],
    ['<u>', '</u>', 'cm-live-u'], ['<sup>', '</sup>', 'cm-live-sup'],
    ['<sub>', '</sub>', 'cm-live-sub'], ['<kbd>', '</kbd>', 'cm-live-kbd'],
    ['<mark>', '</mark>', 'cm-live-mark'],
    ['<span data-md-color="spectrum-3-red">', '</span>', 'cm-live-color'],
  ];
  for (const marker of ['- [ ] ', '- [x] ']) for (const [open, close, css] of formats) {
    const doc = marker + open + '任务正文' + close;
    const plan = buildLivePlan(doc);
    assert.ok(plan.widgets.some(item => item.kind === 'task'), doc);
    assert.ok(plan.marks.some(item => item.className === css), doc);
    assert.ok(plan.hides.some(item => item.from === marker.length && item.to === marker.length + open.length), doc);
    const view = { state: create(doc, [markdown()]).update({ selection: { anchor: doc.length - close.length } }).state,
      dispatch(spec) { this.state = this.state.update(spec).state; } };
    assert.equal(insertLiveNewline(view), true, doc);
    assert.equal(view.state.doc.toString(), doc + '\n- [ ] ', doc);
    assert.equal(undo({ state: view.state, dispatch: tr => { view.state = tr.state; } }), true);
    assert.equal(view.state.doc.toString(), doc);
  }
  for (const prefix of ['> - [ ] ', '- parent\n  - [ ] ']) {
    assert.ok(buildLivePlan(prefix + '==任务==').marks.some(item => item.className === 'cm-live-highlight'));
  }
  for (const text of ['`==code==`', '$==math==$','\\==escaped==']) {
    assert.equal(buildLivePlan('- [ ] ' + text).marks.some(item => item.className === 'cm-live-highlight'), false);
  }
});

test('Enter after toolbar formatting preserves the selected text, closes the wrapper, and undoes once', () => {
  for (const prefix of ['', '- ', '> ', '正文\n==上一行==\n']) {
    const doc = prefix + '==SADFAS==';
    const state = create(doc, [markdown()]).update({ selection: { anchor: prefix.length + 2, head: doc.length - 2 }, effects: liveFormatSelection.of(doc.length) }).state;
    const view = { state, dispatch(spec) { this.state = this.state.update(spec).state; } };
    assert.equal(insertLiveNewline(view), true);
    assert.equal(view.state.doc.toString(), doc + '\n' + (prefix === '- ' || prefix === '> ' ? prefix : ''));
    assert.equal(view.state.field(livePreviewField).formatSelection, null);
    assert.equal(view.state.field(livePreviewField).plan.lines.some(line => line.className.includes('cm-live-heading')), false);
    assert.equal(undo({ state: view.state, dispatch: tr => { view.state = tr.state; } }), true);
    assert.equal(view.state.doc.toString(), doc);
    assert.ok(view.state.selection.eq(state.selection));
    assert.equal(view.state.field(livePreviewField).formatSelection, null, 'undo does not revive the toolbar-only intent');
  }
});

test('toolbar Enter intent expires on manual selection, edits or composition and never applies to source mode', () => {
  const doc = '==正文==';
  const selected = { anchor: 2, head: 4 };
  const state = create(doc).update({ selection: selected, effects: liveFormatSelection.of(doc.length) }).state;
  for (const spec of [{ selection: selected }, { changes: { from: 3, insert: '新' } }, { effects: liveComposition.of(true) }]) {
    const next = state.update(spec).state;
    assert.equal(next.field(livePreviewField).formatSelection, null);
    assert.equal(insertLiveNewline({ state: next, dispatch() { assert.fail('ordinary selected-text replacement must stay native'); } }), false);
  }
  const source = EditorState.create({ doc, selection: selected }).update({ effects: liveFormatSelection.of(doc.length) }).state;
  assert.equal(insertLiveNewline({ state: source }), false);
});

test('multiple toolbar selections close each wrapper on Enter, retain main/direction on undo, and expire together', () => {
  for (const open of ['**', '*', '***', '~~', '==', '`', '<u>', '<sup>', '<sub>', '<kbd>', 'color']) {
    const close = open.startsWith('<') ? open.replace('<', '</') : open;
    const original = EditorState.create({ doc: 'one\n\ntwo\n\nthree',
      selection: EditorSelection.create([EditorSelection.range(3, 0), EditorSelection.range(5, 8), EditorSelection.range(15, 10)], 1),
      extensions: [history(), markdown(), livePreviewField, EditorState.allowMultipleSelections.of(true)] });
    const { formatEnds, ...edit } = formatSelectionEdits(original, (s, a, b) => open === 'color'
      ? textColorEdit(s, a, b, 'red') : inlineFormatEdit(s, a, b, open, close));
    const state = original.update({ ...edit, effects: liveFormatSelection.of(formatEnds) }).state;
    assert.deepEqual(state.field(livePreviewField).formatSelection.ends, formatEnds);
    const view = { state, dispatch(spec) { this.state = spec.state || this.state.update(spec).state; } };
    assert.equal(insertLiveNewline(view), true);
    assert.equal(view.state.doc.toString(), state.doc.toString().replaceAll('\n\n', '\n\n\n') + '\n', open);
    assert.equal(view.state.selection.ranges.length, 3);
    assert.equal(view.state.selection.mainIndex, 1);
    assert.equal(undo({ state: view.state, dispatch: tr => { view.state = tr.state; } }), true); assert.equal(view.state.doc.toString(), state.doc.toString());
    assert.ok(view.state.selection.eq(state.selection));
    assert.equal(view.state.field(livePreviewField).formatSelection, null);
    for (const change of [{ selection: state.selection }, { effects: liveComposition.of(true) }, { changes: { from: 0, insert: 'x' } }]) {
      assert.equal(state.update(change).state.field(livePreviewField).formatSelection, null);
    }
    for (const ends of [[state.doc.length], [null, null, null], [-1, 8, 15], [9999, 9999, 9999]]) {
      assert.equal(original.update({ effects: liveFormatSelection.of(ends) }).state.field(livePreviewField).formatSelection, null);
    }
  }
});

test('live Enter keeps closing formatting on the previous line in a single undo step', () => {
  for (const [before, after] of [['~~', '~~'], ['**', '**'], ['*', '*'], ['***', '***'], ['==', '=='], ['`', '`'], ['<u>', '</u>'], ['[', '](https://example.com)'], ['**~~', '~~**']]) {
    for (const prefix of ['', '# ', '- ', '> ', '1. ', ...(before === '~~' ? ['- [x] '] : [])]) {
      const doc = prefix + before + '中文' + after;
      const original = create(doc, [markdown()]).update({ selection: { anchor: prefix.length + before.length + 2 } }).state;
      const view = { state: original, dispatch(spec) { this.state = spec.state || this.state.update(spec).state; } };
      assert.equal(insertLiveNewline(view), true, doc);
      const continuation = ({ '- ': '- ', '> ': '> ', '1. ': '2. ', '- [x] ': '- [ ] ' })[prefix] || '';
      assert.equal(view.state.doc.toString(), doc + '\n' + continuation, doc);
      const dispatch = tr => { view.state = tr.state; };
      assert.equal(undo({ state: view.state, dispatch }), true);
      assert.equal(view.state.doc.toString(), doc);
      assert.equal(view.state.selection.main.head, original.selection.main.head);
      assert.equal(redo({ state: view.state, dispatch }), true);
      assert.equal(view.state.doc.toString(), doc + '\n' + continuation);
    }
  }
});

test('live Enter leaves literal source, mid-text, selections, code, IME and nested cell commands alone', () => {
  const cases = [
    { doc: '~~中文~~', anchor: 3 },
    { doc: '~~中文~~ 后续', anchor: 4 },
    { doc: '~~中文~~', anchor: 2, head: 4 },
    { doc: '```\n~~中文~~\n```', anchor: 8 },
    { doc: '~~中文~~', anchor: 4, extensions: [EditorState.readOnly.of(true)] },
    { doc: '~~中文~~', anchor: 4, composing: true },
    { doc: '~~中文~~', anchor: 4, nested: true },
    { doc: '~~中文~~', anchor: 4, source: true },
  ];
  for (const item of cases) {
    const state = EditorState.create({ doc: item.doc, selection: { anchor: item.anchor, head: item.head ?? item.anchor }, extensions: [markdown(), ...(item.source ? [] : [livePreviewField]), ...(item.extensions || [])] });
    const view = { state, composing: item.composing, dom: { classList: { contains: name => name === 'cm-live-inner' && item.nested } }, dispatch() { assert.fail('must leave default command in control'); } };
    assert.equal(insertLiveNewline(view), false);
  }
  const state = create('~~中文~~').update({ selection: { anchor: 4 }, effects: liveComposition.of(true) }).state;
  assert.equal(insertLiveNewline({ state }), false);
});

test('live Enter maps multiple cursors and preserves CRLF line endings', () => {
  const doc = '~~甲~~\r\n**乙**';
  const state = EditorState.create({ doc, extensions: [history(), livePreviewField, markdown(), EditorState.allowMultipleSelections.of(true), EditorState.lineSeparator.of('\r\n')] })
    .update({ selection: EditorSelection.create([EditorSelection.cursor(3), EditorSelection.cursor(9)], 1) }).state;
  const view = { state, dispatch(spec) { this.state = this.state.update(spec).state; } };
  assert.equal(insertLiveNewline(view), true);
  assert.equal(view.state.sliceDoc(), '~~甲~~\r\n\r\n**乙**\r\n');
  assert.equal(view.state.selection.ranges.length, 2);
  assert.equal(view.state.selection.mainIndex, 1);
});

test('reference NEW badge renders as editable text without HTML markers or emoji', () => {
  const badge = '<span class="reference-new-badge">NEW</span>';
  const doc = `### 日历热力图 ${badge}\n\n\`${badge}\`\n`;
  const plan = buildLivePlan(doc);
  const badges = plan.marks.filter(item => item.className === 'reference-new-badge');
  assert.equal(badges.length, 1, 'code examples must not become badges');
  const item = badges[0];
  let visible = '';
  for (let i = item.from; i < item.to; i++) if (!plan.hides.some(range => i >= range.from && i < range.to)) visible += doc[i];
  assert.equal(visible, 'NEW');
  assert.equal(create(doc).doc.toString(), doc);
});

test('live rendering covers headings, inline formats, quotes, tasks, links, tables and rules without altering Markdown', () => {
  const state = create(), plan = state.field(livePreviewField).plan;
  for (const css of ['strong', 'em', 'strike', 'highlight', 'inline-code', 'link']) assert.ok(plan.marks.some(item => item.className === `cm-live-${css}`), css);
  for (const kind of ['task', 'bullet', 'table', 'rule']) assert.ok(plan.widgets.some(item => item.kind === kind), kind);
  assert.ok(plan.lines.some(item => item.className.includes('cm-live-h1')));
  assert.ok(plan.lines.some(item => item.className === 'cm-live-quote'));
  assert.equal(state.doc.toString(), source);
});
test('moving the caret keeps heading syntax hidden and layout stable', () => {
  let state = create();
  assert.ok(ranges(state).some(item => item.from === 0 && item.to === 2));
  state = state.update({ selection: { anchor: 3 } }).state;
  assert.ok(ranges(state).some(item => item.from === 0 && item.to === 2));
  state = state.update({ selection: { anchor: state.doc.length } }).state;
  assert.ok(ranges(state).some(item => item.from === 0 && item.to === 2));
  assert.equal(state.doc.toString(), source);
});
test('selection crossing blocks preserves the table layout; source is an explicit action', () => {
  let state = create();
  const table = state.field(livePreviewField).plan.widgets.find(item => item.kind === 'table');
  assert.equal(table.cells.length, 4);
  assert.ok(ranges(state).some(item => item.value.spec.widget?.item?.kind === 'table'));
  state = state.update({ selection: { anchor: 0, head: state.doc.length } }).state;
  assert.ok(ranges(state).some(item => item.value.spec.widget?.item?.kind === 'table'));
  state = state.update({ effects: liveSourceBlock.of(table.from), selection: { anchor: table.from } }).state;
  assert.ok(!ranges(state).some(item => item.value.spec.widget?.item?.kind === 'table'));
  state = state.update({ selection: { anchor: state.doc.length } }).state;
  assert.ok(ranges(state).some(item => item.value.spec.widget?.item?.kind === 'table'));
});

test('table editing keeps empty cells and escaped pipes with exact source positions', () => {
  const raw = '| A | B |\n| --- | --- |\n| | x\\|y |';
  const cells = tableCellRanges(raw, 10);
  assert.equal(cells.length, 4);
  assert.equal(cells[2].from, cells[2].to);
  assert.equal(raw.slice(cells[3].from - 10, cells[3].to - 10), 'x\\|y');
  assert.equal(tableCellRanges('| A | B |\n| --- | --- |\n| missing |'), null);
  assert.equal(safeCellInsertion('a|b\n中文\\|c'), 'a\\|b 中文\\|c');
});

test('hidden heading and formatting markers are identified independently of styled text', () => {
  const state = create('### **标题**\n\n`代码`');
  const hidden = ranges(state).filter(item => item.value.spec.hiddenSyntax);
  assert.ok(hidden.length >= 5);
  for (const { value } of hidden) {
    assert.equal(value.spec.widget, undefined);
    assert.equal(value.spec.inclusive, false);
  }
  assert.equal(state.doc.toString(), '### **标题**\n\n`代码`');
});

test('block widget spacing is measurable and never uses vertical margins', async () => {
  const css = (await Promise.all(['editor-live-preview.css', 'styles.css'].map(name => readFile(new URL('../src/' + name, import.meta.url), 'utf8')))).join('\n');
  for (const selector of ['.cm-live-source-notice', '.cm-live-table, .cm-live-html', '.cm-live-code.cm-live-widget', '.cm-live-toc', '.cm-diagram-card', '.cm-formula-render.is-block']) {
    const rule = css.slice(css.indexOf(selector + ' {')).split('}')[0];
    assert.ok(rule.includes('{'), selector);
    for (const match of rule.matchAll(/(?:^|[;{])\s*(margin(?:-top|-bottom)?):\s*([^;]+)/g)) {
      const values = match[2].trim().split(/\s+/);
      assert.equal(parseFloat(values[0]), 0, `${selector} top margin`);
      if (match[1] === 'margin') assert.equal(parseFloat(values[2] || values[0]), 0, `${selector} bottom margin`);
    }
  }
});

test('editing a later block keeps unchanged widgets equal so their measured heights are retained', () => {
  const doc = '| A | B |\n| --- | --- |\n| one | two |\n\n```text\nline one\nline two\n```\n\nend';
  const before = create(doc);
  const after = before.update({ changes: { from: doc.indexOf('line two') + 4, insert: 'X' } }).state;
  const widgets = state => ranges(state).map(range=>range.value.spec.widget).filter(Boolean);
  const originalTable = widgets(before).find(widget=>widget.item.kind==='table');
  const nextTable = widgets(after).find(widget=>widget.item.kind==='table');
  assert.notEqual(before.doc, after.doc);
  assert.ok(originalTable.eq(nextTable), 'unrelated document edits must not invalidate table geometry');
  assert.ok(!widgets(before).find(widget=>widget.item.kind==='code').eq(widgets(after).find(widget=>widget.item.kind==='code')));
  const shifted = before.update({changes:{from:0,insert:'prefix\n\n'}}).state;
  assert.ok(!originalTable.eq(widgets(shifted).find(widget=>widget.item.kind==='table')), 'moved ranges must refresh their editing coordinates');
});
test('toggle presentation preserves exact selection, unsaved content, undo and redo', () => {
  const compartment = new Compartment();
  let state = EditorState.create({ doc: source, extensions: [history(), compartment.of(livePreviewField)] });
  state = state.update({ changes: { from: state.doc.length, insert: '继续写' }, selection: { anchor: source.length + 3 }, userEvent: 'input' }).state;
  state = state.update({ effects: compartment.reconfigure([]) }).state;
  assert.equal(state.selection.main.head, source.length + 3);
  const dispatch = transaction => { state = transaction.state; };
  assert.ok(undo({ state, dispatch })); assert.equal(state.doc.toString(), source);
  assert.ok(redo({ state, dispatch })); assert.equal(state.doc.toString(), source + '继续写');
  state = state.update({ effects: compartment.reconfigure(livePreviewField) }).state;
  assert.equal(state.doc.toString(), source + '继续写');
});
test('IME composition keeps mapped decorations until committed, then rebuilds', () => {
  let state = create('# 标题\n\n');
  state = state.update({ effects: liveComposition.of(true) }).state;
  state = state.update({ changes: { from: state.doc.length, insert: '**中文输入**' }, userEvent: 'input.type.compose' }).state;
  assert.equal(state.field(livePreviewField).composing, true);
  state = state.update({ effects: liveComposition.of(false) }).state;
  assert.ok(state.field(livePreviewField).plan.marks.some(item => item.className === 'cm-live-strong'));
  assert.equal(state.doc.toString(), '# 标题\n\n**中文输入**');
});
test('inline media retains surrounding prose styles and heading splits without parsing TeX punctuation', () => {
  const styles=[['**','**','strong'],['*','*','em'],['~~','~~','strike'],['==','==','highlight'],['<u>','</u>','u'],['<span data-md-color="red">','</span>','color']];
  for(const [open,close,css] of styles)for(const media of ['$x_i^2$','$a * b$','\\(x_1\\)','![sample](image.png)','[^note]'])for(const setext of [false,true]){
    const doc=(setext?'':'## ')+open+'alpha '+media+' beta'+close+(setext?'\n===':'')+'\n\nNext';
    const plan=buildLivePlan(doc),style=plan.marks.find(m=>m.className==='cm-live-'+css);
    assert.ok(style,doc);assert.equal(doc.slice(style.from,style.to),open+'alpha '+media+' beta'+close);
    const initial=create(doc,[markdown()]).update({selection:{anchor:doc.indexOf('beta')}}).state;
    const view={state:initial,dispatch(spec){this.state=spec.state||this.state.update(spec).state;}};
    assert.ok(insertLiveNewline(view));
    assert.equal(view.state.doc.toString(),(setext?'# ':'## ')+open+'alpha '+media+close+'\n'+open+'beta'+close+(setext?'\n':'')+'\n\nNext',doc);
    undo({state:view.state,dispatch:tr=>{view.state=tr.state;}});assert.equal(view.state.doc.toString(),doc);assert.ok(view.state.selection.eq(initial.selection));
  }
  // A delimiter belonging to TeX cannot close an outer Markdown style.
  for(const doc of ['*alpha $x_i$ beta*','_alpha $x_y$ beta_','[alpha $x_i$ beta](https://example.com)']){
    const plan=buildLivePlan(doc),from=doc.indexOf('$'),to=doc.lastIndexOf('$')+1;
    assert.ok(plan.marks.some(m=>m.from<from&&m.to>to),doc);
    assert.ok(!plan.hides.some(h=>h.from<to&&h.to>from));
  }
  for(const doc of ['<img src="sample.png" alt="==hidden==">','![==hidden==](sample.png)'])
    assert.ok(!buildLivePlan(doc).marks.some(m=>m.className==='cm-live-highlight'),doc);
});

test('code and formulas are never reinterpreted as Markdown decorations', () => {
  const doc = '`**literal**`\n\n```md\n# literal\n==literal==\n```\n\n$x_i^{2} + \\left(a\\right)$\n\n$$\na * b\n$$\n\n![pic](a.png)\n';
  const plan = buildLivePlan(doc);
  assert.ok(!plan.marks.some(item => item.className === 'cm-live-strong' || item.className === 'cm-live-highlight'));
  assert.ok(!plan.lines.some(item => item.className.includes('heading')));
  const state = create(doc, [editorFormulaField, imagePreviewField]);
  assert.equal(state.field(editorFormulaField).items.length, 2);
  assert.equal(state.field(imagePreviewField).items.length, 1);
  assert.equal(state.doc.toString(), doc);
});
test('nested Markdown, inline HTML, entities and escapes retain lossless source offsets', () => {
  const doc = '***粗斜体*** <u>下划线</u> <sup>2</sup> <kbd>Ctrl</kbd> &amp; \\*\n\n结束';
  const plan = buildLivePlan(doc);
  for (const css of ['cm-live-strong', 'cm-live-em', 'cm-live-u', 'cm-live-sup', 'cm-live-kbd']) assert.ok(plan.marks.some(item => item.className === css));
  assert.equal(plan.widgets.find(item => item.kind === 'text').text, '&');
  for (const list of [plan.marks, plan.hides, plan.widgets]) for (const item of list) assert.ok(item.from >= 0 && item.to <= doc.length && item.from < item.to);
});
test('large documents remain editable and incomplete syntax stays visible', () => {
  assert.equal(buildLivePlan('a'.repeat(LIVE_PREVIEW_LIMIT + 1)).oversized, true);
  const plan = buildLivePlan('**unfinished\n\n[link](\n\n```md\n# raw');
  assert.equal(plan.hides.length, 0); assert.equal(plan.widgets.length, 0);
});
test('unsafe HTML retains source instead of mounting executable widgets', () => {
  for (const doc of ['<script>alert(1)</script>', '<iframe src="https://example.com"></iframe>', '<img src=x onerror=alert(1)>']) assert.equal(buildLivePlan(doc).widgets.length, 0);
});
test('embedded image payloads do not disable rendering of the surrounding prose', () => {
  const image = '![photo](data:image/png;base64,' + 'A'.repeat(400_000) + ')';
  const doc = '# 标题\n\n' + image + '\n\n**正文**\n\n';
  const plan = buildLivePlan(doc);
  assert.equal(plan.oversized, false);
  const strong = plan.marks.find(item => item.className === 'cm-live-strong');
  assert.equal(doc.slice(strong.from, strong.to), '**正文**');
  const state = create(doc);
  assert.equal(state.doc.toString(), doc);
});
test('TOC, complete code fences and media tables retain separate editable ranges', () => {
  const plan = buildLivePlan('# One\n\n[TOC]\n\n```js\nconst a = 1;\n```\n\n| A |\n| --- |\n| ![pic](a.png) |\n');
  const code = plan.widgets.find(item => item.kind === 'code');
  assert.equal(code.text, 'const a = 1;'); assert.equal(code.language, 'js');
  assert.equal(plan.widgets.find(item => item.kind === 'toc').headings[0].text, 'One');
  const table=plan.widgets.find(item => item.kind === 'table');
  assert.ok(table);assert.ok(code.to < table.from);
  assert.equal(table.cells.length,2);
  assert.equal(table.raw.slice(table.cells[1].from-table.from,table.cells[1].to-table.from),'![pic](a.png)');
});
test('unresolved reference links remain literal while defined reference links are rendered', () => {
  const doc = '[unknown]\n\n[known][ref]\n\n[ref]: https://example.com';
  const plan = buildLivePlan(doc);
  assert.ok(!plan.hides.some(item => item.from === 0));
  assert.ok(plan.hides.some(item => item.from === doc.indexOf('[known]')));
});
test('code nested in containers projects every CodeText segment without changing source', () => {
  for (const doc of ['> ```js\n> one\n> two\n> ```', '- item\n\n  ```js\n  one\n  two\n  ```']) {
    const code=buildLivePlan(doc).widgets.find(item => item.kind === 'code');
    assert.equal(code.text,'one\ntwo');assert.equal(code.projection.text,'one\ntwo');
    assert.equal(create(doc).doc.toString(), doc);
  }
});
