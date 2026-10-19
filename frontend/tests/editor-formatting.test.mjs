import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { EditorState, EditorSelection, StateEffect } from '@codemirror/state';
import { formatSelectionEdits } from '../src/inline-format-toggle.js';
import { history, undo, redo, isolateHistory } from '@codemirror/commands';
import { selectedLineFormat, selectedBlockFormat, selectedInlineFormats, selectedFormatColor, paintColorEdit, PAINTER_WRAPPERS } from '../src/editor-formatting.js';
import { TEXT_COLOR_PALETTE, scanTextColorSpans } from '../src/text-colors.js';
import { buildLivePlan, livePreviewField, liveFormatSelection, insertLiveNewline } from '../src/editor-live-preview.js';

for (const [kind, prefix, expected] of [
  ...Array.from({ length: 6 }, (_, i) => ['heading', '#'.repeat(i + 1) + ' ', '#'.repeat(i + 1) + ' First']),
  ['heading', '', 'First'], ['quote', '', '> First'], ['unordered-list', '', '- First'],
  ['ordered-list', '', '1. First'], ['task-list', '', '- [ ] First'],
]) test(`${kind} ${prefix}: a selection ending at next-line start does not format that line`, () => {
  for (const backwards of [false, true]) for (const tail of ['Next\nLast', '\nLast', '']) {
    const doc = 'First\n' + tail;
    const state = EditorState.create({ doc, selection: backwards ? { anchor: 6, head: 0 } : { anchor: 0, head: 6 } });
    const updated = state.update(selectedLineFormat(state, kind, prefix)).state;
    assert.equal(updated.doc.toString(), expected + '\n' + tail);
    assert.equal(updated.selection.main.anchor > updated.selection.main.head, backwards);
  }
});

test('empty selections format the caret line, and an included next-line character formats both', () => {
  for (const [anchor, head, expected] of [[6, 6, 'First\n## Next'], [0, 7, '## First\n## Next'], [0, 10, '## First\n## Next']]) {
    const state = EditorState.create({ doc: 'First\nNext', selection: { anchor, head } });
    assert.equal(state.update(selectedLineFormat(state, 'heading', '## ')).state.doc.toString(), expected);
  }
  const empty = EditorState.create();
  assert.equal(empty.update(selectedLineFormat(empty, 'heading', '### ')).state.doc.toString(), '### ');
});

test('format painter identifies independent nested styles and source-wrapper selections', () => {
  const cases = [
    ['***word***', ['bold', 'italic']], ['__word__', ['bold']], ['_word_', ['italic']],
    ['==**word**==', ['bold', 'highlight']], ['~~*word*~~', ['italic', 'strikethrough']],
    ['<u>**word**</u>', ['bold', 'underline']], ['<sup>word</sup>', ['superscript']],
    ['<sub>word</sub>', ['subscript']], ['<kbd>word</kbd>', ['keyboard']], ['`word`', ['inline-code']],
    ['`**word**`', ['inline-code']], ['$word$', []], ['word', []],
  ];
  for (const [source, expected] of cases) {
    const plan = buildLivePlan(source), from = source.indexOf('word');
    for (const [a, b] of [[from, from + 4], [0, source.length]])
      assert.deepEqual(selectedInlineFormats(plan, a, b).sort(), expected.sort(), source);
  }
  const source = '**one** two';
  assert.deepEqual(selectedInlineFormats(buildLivePlan(source), 0, source.length), []);
});

const renderer = readFileSync(new URL('../src/renderer.js', import.meta.url), 'utf8');
function harness(doc, anchor, head, format, session = 1) {
  const view = { state: EditorState.create({ doc, selection: typeof anchor === 'number' ? { anchor, head } : anchor,
    extensions: [history(), livePreviewField, EditorState.allowMultipleSelections.of(true)] }),
    focus() {}, dispatch(spec) { this.state = spec.state || this.state.update(spec).state; } };
  view.dispatch = view.dispatch.bind(view);
  const context = vm.createContext({ codeEditor: view, state: { editing: true, documentSession: session },
    copiedFormat: format, copiedFormatSource: { doc: view.state.doc, session }, formatPainterApplyTimer: null,
    selectedLineFormat, selectedBlockFormat, selectedInlineFormats, selectedFormatColor, paintColorEdit, PAINTER_WRAPPERS, buildLivePlan, isolateHistory, formatSelectionEdits,
    liveFormatSelection, $: () => null, clearTimeout() {}, t: s => s, showToast() {} });
  vm.runInContext(renderer.slice(renderer.indexOf('function analyzeFormat('), renderer.indexOf('function copyFormatFromSelection('))
    + renderer.slice(renderer.indexOf('function applyCopiedFormat('), renderer.indexOf('function runFormatCommand(')), context);
  return { view, context };
}

test('actual painter applies inline and block formats atomically and preserves adjacent text', () => {
  const { view, context } = harness('target\nNext', 0, 6, { inline: ['bold', 'italic'], block: 'heading2' });
  assert.equal(context.applyCopiedFormat(), true);
  assert.equal(view.state.doc.toString(), '## ***target***\nNext');
  assert.equal(context.copiedFormat, null);
  assert.equal(undo(view), true); assert.equal(view.state.doc.toString(), 'target\nNext');
  assert.equal(redo(view), true); assert.equal(view.state.doc.toString(), '## ***target***\nNext');
});

for (const source of ['1. One\n2. Two', '- One\n- Two', '- [x] One\n- [ ] Two']) {
  for (const kind of ['ordered-list', 'unordered-list', 'task-list']) test(`${source.split('\n')[0]} -> ${kind} replaces list syntax once`, () => {
    const state = EditorState.create({ doc: source, selection: { anchor: 0, head: source.length } });
    const output = state.update(selectedLineFormat(state, kind)).state.doc.toString();
    const expected = kind === 'ordered-list' ? '1. One\n2. Two' : kind === 'unordered-list' ? '- One\n- Two'
      : `- [${source.startsWith('- [x]') ? 'x' : ' '}] One\n- [ ] Two`;
    assert.equal(output, expected);
  });
}

test('list marker width changes preserve nested children, continuation text, blank lines and quote containers', () => {
  for (const [source, expected] of [
    ['- One\n  - Child\n    continuation\n- Two', '1. One\n   1. Child\n      1. continuation\n2. Two'],
    ['> - One\n>   - Child\n> - Two', '> 1. One\n>    1. Child\n> 2. Two'],
    ['One\n\nTwo', '1. One\n\n1. Two'],
  ]) {
    const state = EditorState.create({ doc: source, selection: { anchor: 0, head: source.length } });
    assert.equal(state.update(selectedLineFormat(state, 'ordered-list')).state.doc.toString(), expected);
  }
  const source = '- Parent\n  - Child\n    continuation\n- Neighbour';
  const state = EditorState.create({ doc: source, selection: { anchor: 2 } });
  const updated = state.update(selectedLineFormat(state, 'ordered-list')).state;
  assert.equal(updated.doc.toString(), '1. Parent\n   - Child\n     continuation\n- Neighbour');
  const back = updated.update(selectedLineFormat(updated, 'unordered-list')).state;
  assert.equal(back.doc.toString(), source);
});

test('list conversion leaves fenced and indented code content intact', () => {
  for (const source of ['```text\n1. code\n```', '    1. code']) {
    const state = EditorState.create({ doc: source, selection: { anchor: 0, head: source.length } });
    assert.equal(state.update(selectedLineFormat(state, 'task-list')).state.doc.toString(), source);
  }
});

test('every palette color is copied from parsed spans; unknown or executable attributes are not copied', () => {
  for (const { id } of TEXT_COLOR_PALETTE) {
    const source = `<span data-md-color="${id}">**word**</span>`;
    assert.equal(selectedFormatColor(source, buildLivePlan(source), 0, source.length), id);
    const edit = paintColorEdit('target', 0, 6, id);
    assert.equal(edit.changes.insert, `<span data-md-color="${id}">target</span>`);
  }
  for (const source of ['<span data-md-color="unknown">word</span>', '<span data-md-color="red" onclick="evil()">word</span>', '`<span data-md-color="red">word</span>`']) {
    assert.equal(selectedFormatColor(source, buildLivePlan(source), source.indexOf('word'), source.indexOf('word') + 4), null);
  }
  assert.equal(paintColorEdit('word', 0, 4, 'red" onclick="evil()'), null);
});

test('nested colors retain outer formatting and allow painting part of existing colored text', () => {
  const source = '<span data-md-color="red">**before target after**</span>';
  const from = source.indexOf('target'), to = from + 6;
  const { view, context } = harness(source, from, to, { inline: [], block: null, color: 'blue' });
  assert.equal(context.applyCopiedFormat(), true);
  const output = view.state.doc.toString(), plan = buildLivePlan(output);
  assert.equal(output, '<span data-md-color="red">**before <span data-md-color="blue">target</span> after**</span>');
  assert.equal(plan.marks.filter(mark => mark.className === 'cm-live-color').length, 2);
  const target = output.indexOf('target');
  assert.equal(selectedFormatColor(output, plan, target, target + 6), 'blue');
  assert.deepEqual(selectedInlineFormats(plan, target, target + 6), ['bold']);
  undo(view); assert.equal(view.state.doc.toString(), source);
  assert.equal(scanTextColorSpans('<span data-md-color="red">outer<span data-md-color="blue">inner</span>end</span>').length, 2);
});

test('painting a whole existing color replaces it and repeats do not add wrappers', () => {
  const source = '<span data-md-color="blue">target</span>', from = source.indexOf('target');
  for (const [a, b] of [[from, from + 6], [0, source.length]]) {
    const { view, context } = harness(source, a, b, { inline: [], block: null, color: 'red' });
    context.applyCopiedFormat();
    assert.equal(view.state.doc.toString(), '<span data-md-color="red">target</span>');
  }
  const { view, context } = harness(source, from, from + 6, { inline: [], block: null, color: 'blue' });
  assert.equal(context.applyCopiedFormat(), false); assert.equal(view.state.doc.toString(), source);
});

test('actual painter does not duplicate existing formats, and rejects edited or different document sessions', () => {
  for (const [doc, from, to] of [['**target**', 2, 8], ['**target**', 0, 10]]) {
    const { view, context } = harness(doc, from, to, { inline: ['bold'], block: null });
    assert.equal(context.applyCopiedFormat(), false);
    assert.equal(view.state.doc.toString(), doc);
  }
  for (const change of ['session', 'doc']) {
    const { view, context } = harness('target', 0, 6, { inline: ['bold'], block: null });
    if (change === 'session') context.state.documentSession++;
    else view.dispatch({ changes: { from: 6, insert: '!' } });
    const original = view.state.doc.toString();
    assert.equal(context.applyCopiedFormat(), false);
    assert.equal(view.state.doc.toString(), original);
    assert.equal(context.copiedFormat, null);
  }
});

const multi = (doc, ranges, main = 0) => EditorState.create({ doc,
  selection: EditorSelection.create(ranges.map(([anchor, head = anchor]) => EditorSelection.range(anchor, head)), main),
  extensions: [history(), EditorState.allowMultipleSelections.of(true)] });
for (const [kind, prefix, marker] of [['heading', '## ', '## '], ['quote', '', '> '], ['unordered-list', '', '- '], ['ordered-list', '', '1. '], ['task-list', '', '- [ ] ']]) {
  test(`multi ${kind} selects all target lines once, preserving gaps, reverse direction and main range`, () => {
    const state = multi('one\nkeep\ntwo\nlast', [[3, 0], [9, 12]], 1);
    let next = state.update({ ...selectedLineFormat(state, kind, prefix), annotations: isolateHistory.of('full') }).state;
    assert.equal(next.doc.toString(), `${marker}one\nkeep\n${marker}two\nlast`);
    assert.equal(next.selection.ranges.length, 2); assert.equal(next.selection.mainIndex, 1);
    assert.deepEqual(next.selection.ranges.map(r => r.anchor > r.head), [true, false]);
    undo({ state: next, dispatch: tr => { next = tr.state; } }); assert.ok(next.selection.eq(state.selection));assert.equal(next.doc.toString(), state.doc.toString());
    const overlappingLines = multi('one two\nlast', [[0, 2], [5, 7]], 1);
    const result = overlappingLines.update(selectedLineFormat(overlappingLines, kind, prefix)).state;
    assert.equal(result.doc.toString(), marker + 'one two\nlast');assert.equal(result.selection.ranges.length, 1);
  });
}

test('multiple list parents and children share one indentation plan without duplicate shifts', () => {
  const source='- Parent\n  - Child\n    continuation\n- Keep\n- Other\n  follow';
  const state=multi(source, [[2,8], [source.indexOf('Child'),source.indexOf('Child')+5], [source.indexOf('Other'),source.indexOf('Other')+5]], 2);
  const next=state.update(selectedLineFormat(state,'ordered-list')).state;
  assert.equal(next.doc.toString(),'1. Parent\n   1. Child\n      continuation\n- Keep\n1. Other\n   follow');
  assert.equal(next.selection.ranges.length,3);assert.equal(next.selection.mainIndex,2);
  const numbered='9. one\n10. keep\n11. three';
  const numberedState=multi(numbered,[[3,6],[numbered.indexOf('three'),numbered.length]]);
  assert.equal(numberedState.update(selectedLineFormat(numberedState,'ordered-list')).state.doc.toString(),numbered);
});

test('multi block half-open boundaries and blank cursors do not consume neighbours', () => {
  const doc='one\nkeep\n\ntwo\nlast', state=multi(doc,[[0,4],[9],[10,14]]);
  const next=state.update(selectedLineFormat(state,'task-list')).state;
  assert.equal(next.doc.toString(),'- [ ] one\nkeep\n- [ ] \n- [ ] two\nlast');
});

test('multi painter applies combined formats once, keeps gaps and reversals, and undoes all targets', () => {
  const selection=EditorSelection.create([EditorSelection.range(3,0),EditorSelection.range(9,12)],1);
  const {view,context}=harness('one\nkeep\ntwo',selection,undefined,{inline:['bold','italic'],block:'heading2',color:'red'});
  assert.equal(context.applyCopiedFormat(),true);
  const expected='## <span data-md-color="red">***one***</span>\nkeep\n## <span data-md-color="red">***two***</span>';
  assert.equal(view.state.doc.toString(),expected);assert.equal(view.state.selection.ranges.length,2);assert.equal(view.state.selection.mainIndex,1);
  assert.deepEqual(view.state.selection.ranges.map(r=>r.anchor>r.head),[true,false]);
  undo(view);assert.equal(view.state.doc.toString(),'one\nkeep\ntwo');assert.ok(view.state.selection.eq(selection));
  redo(view);assert.equal(view.state.doc.toString(),expected);
});

test('multi painter closes nested color and inline wrappers before Enter in middle of paragraphs', () => {
  for(const alreadyColored of [false,true]){
    const wrap=t=>alreadyColored?`<span data-md-color="red">${t}</span>`:t;
    const doc=wrap('one')+' tail\n\n'+wrap('two')+' tail';
    const selection=EditorSelection.create(['one','two'].map(w=>EditorSelection.range(doc.indexOf(w),doc.indexOf(w)+3)),1);
    const {view,context}=harness(doc,selection,undefined,{inline:['bold'],block:null,color:'red'});
    assert.equal(context.applyCopiedFormat(),true);
    const formatted=view.state.doc.toString();assert.equal(insertLiveNewline(view),true);
    assert.equal(view.state.doc.toString(),formatted.replaceAll('</span> ','</span>\n'));
    undo(view);assert.equal(view.state.doc.toString(),formatted);
  }
});

test('painting neighboring color spans never strips mismatched outer tags', () => {
  const doc='<span data-md-color="red">one</span> <span data-md-color="blue">two</span>';
  const edit=paintColorEdit(doc,0,doc.length,'green');
  assert.equal(edit.changes.insert,`<span data-md-color="green">${doc}</span>`);
});

test('headings stay inside list and quote containers and remove only real heading marks', () => {
  for (const prefix of ['> ', '- ', '> - ', '>   - ', '> > ', '1. ']) {
    const doc=prefix+'target\n\nKeep', state=multi(doc,[[doc.indexOf('target'),doc.indexOf('target')+6]]);
    const next=state.update(selectedLineFormat(state,'heading','## ')).state;
    assert.equal(next.doc.toString(),prefix+'## target\n\nKeep');
    assert.equal(next.update(selectedLineFormat(next,'heading','')).state.doc.toString(),doc);
    assert.equal(selectedBlockFormat(next,prefix.length+3),'heading2');
  }
  const state=multi('> - ### target ###\n\nKeep',[[8,14]]);
  assert.equal(state.update(selectedLineFormat(state,'heading','## ')).state.doc.toString(),'> - ## target\n\nKeep');
  assert.equal(state.update(selectedLineFormat(state,'heading','')).state.doc.toString(),'> - target\n\nKeep');
  for(const task of ['- [x] ','> - [ ] ']){
    const doc=task+'target',s=multi(doc,[[task.length,doc.length]]);
    assert.equal(s.update(selectedLineFormat(s,'heading','## ')).state.doc.toString(),task.replace(/\[[ x]\] /,'')+'## target');
  }
});

test('quote painter is idempotent including lazy continuation while the quote toolbar can nest', () => {
  for(const doc of ['> target','> > target','- > target','> first\ntarget']){
    const from=doc.indexOf('target'),{view,context}=harness(doc,from,from+6,{inline:[],block:'quote'});
    assert.equal(context.applyCopiedFormat(),false,doc);assert.equal(view.state.doc.toString(),doc);
  }
  const doc='- target',s=multi(doc,[[2,8]]);
  assert.equal(s.update(selectedLineFormat(s,'quote')).state.doc.toString(),'- > target');
  const quoted=multi('> target',[[2,8]]);
  assert.equal(quoted.update(selectedLineFormat(quoted,'quote')).state.doc.toString(),'> > target');
  const task=multi('- [x] target',[[6,12]]);
  assert.equal(task.update(selectedLineFormat(task,'quote')).state.doc.toString(),'> - [x] target');
});

test('block format detection uses semantic nesting, not text-looking prefixes', () => {
  for(const [doc,expected] of [['> - ## target','heading2'],['> - target','unordered-list'],['  9. target','ordered-list'],['> - [x] target','task-list'],['> target','quote'],['target\n===','heading1'],['```md\n# target\n```',null],['    # target',null],['| target |\n|---|',null]]){
    const state=EditorState.create({doc});assert.equal(selectedBlockFormat(state,doc.indexOf('target')),expected,doc);
  }
});

test('heading and quote commands leave code, HTML and table syntax intact', () => {
  for(const doc of ['```md\n# target\n```','    # target','| target |\n|---|','<div>target</div>'])for(const kind of ['heading','quote']){
    const state=multi(doc,[[0,doc.length]]);
    assert.equal(state.update(selectedLineFormat(state,kind,'## ')).state.doc.toString(),doc);
  }
});

test('Setext headings convert as whole blocks from text or underline and preserve paragraph boundaries', () => {
  for(const [doc,title,plain] of [
    ['Title\n=====\nNext','Title','Title\n\nNext'],
    ['Title\nsecond\n---\nNext','Title second','Title\nsecond\n\nNext'],
    ['Title  \nsecond\n===\nNext','Title<br>second','Title  \nsecond\n\nNext'],
    ['**Title  \nsecond**\n===\nNext','**Title<br>second**','**Title  \nsecond**\n\nNext'],
    ['Title\\\nsecond\n===\nNext','Title<br>second','Title\\\nsecond\n\nNext'],
    ['Title #\n===\nNext','Title \\#','Title #\n\nNext'],
  ])for(let level=0;level<=6;level++)for(const position of [0,doc.indexOf('\n')+1,doc.lastIndexOf('\n')-1]) {
    const state=multi(doc,[[position]]),prefix=level?'#'.repeat(level)+' ':'';
    const next=state.update(selectedLineFormat(state,'heading',prefix)).state;
    assert.equal(next.doc.toString(),level?prefix+title+'\n\nNext':plain,doc+' '+level+' '+position);
    assert.equal(next.selection.main.to,level?(prefix+title).length:plain.indexOf('\n\n'));
    if(level)assert.equal(next.update(selectedLineFormat(next,'heading',prefix)).state.doc.toString(),next.doc.toString());
  }
});

test('Setext conversion retains containers, deduplicates a block and keeps multi-selection direction', () => {
  for(const [doc,expected] of [
    ['> Title\n> second\n> ===\n> Next','> ### Title second\n> \n> Next'],
    ['- Title\n  second\n  ---\n  Next','- ### Title second\n  \n  Next'],
    ['> - Title\n>   second\n>   ---\n>   Next','> - ### Title second\n>   \n>   Next'],
  ]){
    const from=doc.indexOf('Title'),second=doc.indexOf('second');
    const state=multi(doc,[[from+5,from],[second+6,second]],1);
    const next=state.update(selectedLineFormat(state,'heading','### ')).state;
    assert.equal(next.doc.toString(),expected);assert.equal(next.selection.ranges.length,1);assert.ok(next.selection.main.anchor>next.selection.main.head);
  }
  const doc='One\n===\n\nKeep\n\nTwo\n---\n\nLast',two=doc.indexOf('Two');
  const state=multi(doc,[[0,3],[two+3,two]],1);
  const next=state.update(selectedLineFormat(state,'heading','#### ')).state;
  assert.equal(next.doc.toString(),'#### One\n\n\nKeep\n\n#### Two\n\n\nLast');
  assert.equal(next.selection.mainIndex,1);assert.equal(next.selection.ranges.length,2);
  assert.deepEqual(next.selection.ranges.map(r=>r.anchor>r.head),[false,true]);
});

test('container commands treat multiline Setext as one heading, and tasks retain only its text', () => {
  for (const [prefix, continuation] of [['',''],['> ','> '],['- ','  '],['> - ','>   ']]) {
    const doc=prefix+'Title\n'+continuation+'second\n'+continuation+'===\n'+continuation+'Next';
    for (const kind of ['quote','unordered-list','ordered-list','task-list']) for (const position of [doc.indexOf('Title'),doc.indexOf('second')+2,doc.indexOf('===')]) {
      const state=multi(doc,[[position]]), next=state.update(selectedLineFormat(state,kind)).state, result=next.doc.toString();
      assert.ok(result.includes((kind==='task-list'?'[ ] ':'# ')+'Title second'),result);
      assert.ok(!result.includes('==='),result);assert.ok(result.endsWith('Next'));
      assert.equal(next.selection.main.to,result.indexOf('\n'));
    }
  }
  const doc='> Title\n> second\n> ===',state=multi(doc,[[4]]);
  assert.ok(selectedLineFormat(state,'quote','',{ensureQuote:true}).changes.empty);
  const code=multi('```md\nTitle\n===\n```',[[9]]);
  for(const kind of ['quote','task-list'])assert.ok(selectedLineFormat(code,kind).changes.empty);
});

test('task conversion removes ATX closers and composes disjoint Setext selections without touching other lines', () => {
  const doc='> ### One ###\n\nKeep\n\nTwo\n===\n\nLast';
  const two=doc.indexOf('Two'), state=multi(doc,[[doc.indexOf('One')+3,doc.indexOf('One')],[two,two+3]],1);
  const next=state.update(selectedLineFormat(state,'task-list')).state;
  assert.equal(next.doc.toString(),'> - [ ] One\n\nKeep\n\n- [ ] Two\n\n\nLast');
  assert.equal(next.selection.ranges.length,2);assert.equal(next.selection.mainIndex,1);
  assert.deepEqual(next.selection.ranges.map(r=>r.anchor>r.head),[true,false]);
});
