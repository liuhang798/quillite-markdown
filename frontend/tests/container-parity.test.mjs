import test from 'node:test';
import assert from 'node:assert/strict';
import { EditorState } from '@codemirror/state';
import { history, undo } from '@codemirror/commands';
import { buildLivePlan, livePreviewField } from '../src/editor-live-preview.js';

const layoutAt = (plan, source, text) => plan.lines.find(line => line.from === source.lastIndexOf('\n', source.indexOf(text) - 1) + 1 && line.className === 'cm-live-container-line');

test('nested quote rails follow semantic depth, including lazy continuation and return to outer quote', () => {
  const source = '> 一级\n>\n> > 二级\n> > 续行\n>\n> 返回\n\n正文';
  const plan = buildLivePlan(source);
  assert.match(layoutAt(plan, source, '一级').style, /--live-quote-depth:1/);
  assert.match(layoutAt(plan, source, '二级').style, /--live-quote-depth:2/);
  assert.match(layoutAt(plan, source, '续行').style, /--live-quote-depth:2/);
  assert.match(layoutAt(plan, source, '返回').style, /--live-quote-depth:1/);
  assert.equal(layoutAt(plan, source, '正文'), undefined);
  const lazy = '> quoted\nlazy';
  assert.match(layoutAt(buildLivePlan(lazy),lazy,'lazy').style,/--live-quote-depth:1/);
});

test('list nesting has stable indentation, hanging markers and distinct bullet levels', () => {
  const source = '- 第一\n- 第二\n  - 子项\n    - 三级\n- 返回\n\n123. 数字\n     续行';
  const plan = buildLivePlan(source);
  assert.deepEqual(plan.widgets.filter(w => w.kind === 'bullet').map(w => w.text), ['•','•','◦','▪','•']);
  assert.match(layoutAt(plan,source,'子项').style,/--live-list-depth:2/);
  assert.match(layoutAt(plan,source,'三级').style,/--live-list-depth:3/);
  assert.match(layoutAt(plan,source,'返回').style,/--live-list-depth:1/);
  assert.match(layoutAt(plan,source,'数字').style,/--live-marker-width:2.6em/);
  assert.ok(plan.hides.some(r => r.from === source.indexOf('  - 子项') && r.to === source.indexOf('- 子项')));
});

test('container presentation preserves explicit formatting, task widgets, code ownership, source and undo', () => {
  const source = '> - **粗体**、*斜体*、[链接](https://example.com)\n>   - [x] 完成\n>\n> ```text\n>   原缩进\n> ```';
  const plan = buildLivePlan(source);
  for (const cls of ['cm-live-strong','cm-live-em','cm-live-link']) assert.ok(plan.marks.some(m => m.className === cls));
  assert.equal(plan.widgets.filter(w => w.kind === 'task').length,1);
  const code=plan.widgets.find(w => w.kind === 'code');
  assert.ok(code);
  assert.ok(!plan.lines.some(l => l.className === 'cm-live-container-line' && l.from >= code.from && l.from < code.to));
  let state=EditorState.create({doc:source,extensions:[history(),livePreviewField]});
  state=state.update({changes:{from:source.length,insert:'测试'}}).state;
  assert.ok(undo({state,dispatch:tr=>{state=tr.state;}}));
  assert.equal(state.doc.toString(),source);
  const ranges=[];state.field(livePreviewField).decorations.between(0,state.doc.length,(from,to,value)=>{if(value.spec.attributes?.style)ranges.push(value.spec.attributes.style);});
  assert.ok(ranges.some(style=>style.includes('--live-quote-depth:1')));
});

test('quote separators and heading-to-list space are measured without removing editable blank lines', () => {
  const source = '### 标题\n\n- 一\n  - 子项\n- 二\n\n> 引用\n>\n> > 内层';
  const plan = buildLivePlan(source);
  assert.ok(plan.lines.some(l=>l.className==='cm-live-list-leading-gap'&&l.from===source.indexOf('\n')+1));
  assert.ok(plan.lines.some(l=>l.className==='cm-live-heading-before-list'&&l.from===0));
  assert.ok(plan.lines.some(l=>l.className==='cm-live-nested-list-end'&&l.from===source.indexOf('  - 子项')));
  assert.ok(plan.lines.some(l=>l.className==='cm-live-quote-gap'&&l.from===source.indexOf('>\n> >')));
  assert.equal(EditorState.create({doc:source,extensions:[livePreviewField]}).doc.toString(),source);
});
