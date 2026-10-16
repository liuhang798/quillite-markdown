import assert from 'node:assert/strict';
import test from 'node:test';
import { DIAGRAM_TEMPLATES, diagramTemplateSource } from '../src/diagram-templates.js';
import {
  STRUCTURED_VISUAL_DIAGRAM_IDS,
  hasStructuredVisualEditor,
  parseStructuredDiagram,
  serializeStructuredDiagram,
  structuredDiagramDefinition
} from '../src/structured-diagram-editor.js';

test('the first visual-editing batch covers popular structured diagram types', () => {
  assert.deepEqual(STRUCTURED_VISUAL_DIAGRAM_IDS, [
    'sequence', 'gantt', 'state', 'timeline', 'kanban', 'mindmap', 'pie',
    'bar-chart', 'line-chart', 'doughnut-chart', 'sankey',
    'stacked-bar-chart', 'area-chart', 'combo-chart', 'diverging-bar-chart', 'scatter-chart',
    'horizontal-bar-chart', 'histogram-chart', 'percent-bar-chart', 'calendar-chart', 'class', 'er'
  ]);
  const marked = DIAGRAM_TEMPLATES.filter(template => template.visualEditor).map(template => template.id);
  assert.deepEqual(new Set(marked), new Set(['flowchart', ...STRUCTURED_VISUAL_DIAGRAM_IDS]));
  assert.equal(hasStructuredVisualEditor('flowchart'), false);
  assert.equal(DIAGRAM_TEMPLATES.find(template => template.id === 'state').visualEditor, 'canvas');
  assert.equal(DIAGRAM_TEMPLATES.find(template => template.id === 'mindmap').visualEditor, 'canvas');
});

test('every marked structured template parses and serializes its localized defaults', () => {
  for (const templateId of STRUCTURED_VISUAL_DIAGRAM_IDS) {
    const template = DIAGRAM_TEMPLATES.find(item => item.id === templateId);
    const parsed = parseStructuredDiagram(templateId, diagramTemplateSource(template, 'zh'));
    assert.equal(parsed.valid, true, `${templateId} should parse`);
    assert.ok(parsed.model.rows.length, `${templateId} should expose editable rows`);
    assert.ok(serializeStructuredDiagram(templateId, parsed.model).length > 20, `${templateId} should serialize`);
    assert.ok(structuredDiagramDefinition(templateId, 'zh', parsed.model).columns.length >= 1);
  }
});

test('sequence, timeline, and pie fields round-trip through safe Mermaid source', () => {
  const sequence = parseStructuredDiagram('sequence', `sequenceDiagram\n    actor U as 用户\n    U->>A: 打开文档`).model;
  sequence.rows[1].label = '读取并预览';
  assert.match(serializeStructuredDiagram('sequence', sequence), /U->>A: 读取并预览/);

  const timeline = parseStructuredDiagram('timeline', `timeline\n    title 版本\n    2026 : 发布`).model;
  timeline.rows.push({ period: '2027', event: '升级' });
  assert.match(serializeStructuredDiagram('timeline', timeline), /2027 : 升级/);

  const pie = parseStructuredDiagram('pie', `pie showData\n    title 占比\n    "文档" : 60`).model;
  pie.rows.push({ label: '图片', value: 40 });
  assert.match(serializeStructuredDiagram('pie', pie), /"图片" : 40/);
});

test('sequence message operators preserve sender, receiver and arrow semantics after editing', () => {
  for (const arrow of ['->>', '-->>', '->', '-->', '-)']) {
    for (const [from, to] of [['F', 'A'], ['file-store', '用户_1']]) {
      const source = `sequenceDiagram\n    ${from}${arrow}${to}: 返回文档`;
      const parsed = parseStructuredDiagram('sequence', source);
      assert.equal(parsed.valid, true, source);
      assert.deepEqual(parsed.model.rows[0], { from, to, type: arrow, label: '返回文档' });
      parsed.model.rows[0].label = '审计修改';
      assert.equal(serializeStructuredDiagram('sequence', parsed.model), source.replace('返回文档', '审计修改'));
      parsed.model.rows[0].type = '->>';
      assert.equal(serializeStructuredDiagram('sequence', parsed.model), `sequenceDiagram\n    ${from}->>${to}: 审计修改`);
    }
  }
  for (const locale of ['zh', 'en']) {
    const template = DIAGRAM_TEMPLATES.find(item => item.id === 'sequence');
    const parsed = parseStructuredDiagram('sequence', diagramTemplateSource(template, locale));
    assert.equal(parsed.model.rows[5].from, 'F');
    assert.equal(parsed.model.rows[5].type, '-->>');
    assert.equal(parsed.model.rows[6].from, 'A');
    assert.equal(parsed.model.rows[6].type, '-->>');
  }
});

test('sequence unsupported activation and arrow types retain source-mode fallback', () => {
  for (const message of ['A->>+B: activate', 'A-->>-B: deactivate', 'A-xB: cross', 'A<<->>B: bidirectional', 'A--B: dotted']) {
    assert.equal(parseStructuredDiagram('sequence', `sequenceDiagram\n    ${message}`).valid, false, message);
  }
});

test('mindmap parentage follows preceding smaller indentation, not fixed two-space levels', () => {
  for (const source of [
    'mindmap\nroot((项目))\n  计划\n   深入\n  发布\n   上线',
    'mindmap\n    root((项目))\n        计划\n             深入\n      发布\n       上线',
    'mindmap\n\troot((项目))\n\t\t计划\n\t\t\t深入\n\t\t发布\n\t\t\t上线',
  ]) {
    const parsed = parseStructuredDiagram('mindmap', source);
    assert.equal(parsed.valid, true, source);
    assert.deepEqual(parsed.model.rows.map(row => row.level), [0, 1, 2, 1, 2]);
    const output = serializeStructuredDiagram('mindmap', parsed.model);
    assert.deepEqual(parseStructuredDiagram('mindmap', output).model.rows.map(row => row.level), [0, 1, 2, 1, 2]);
  }
  assert.equal(parseStructuredDiagram('mindmap', 'mindmap\nroot\notherRoot').valid, false);
  assert.equal(parseStructuredDiagram('mindmap', 'mindmap\n  root\n child').valid, false);
});

test('mindmap basic shapes and IDs survive label editing without becoming visible syntax', () => {
  const source = 'mindmap\n  topic((项目))\n    plan[计划]\n      detail(详情)\n    release((发布))\n    普通主题';
  const parsed = parseStructuredDiagram('mindmap', source);
  assert.equal(parsed.valid, true);
  assert.deepEqual(parsed.model.rows.map(row => row.label), ['项目', '计划', '详情', '发布', '普通主题']);
  assert.equal(serializeStructuredDiagram('mindmap', parsed.model), source);
  parsed.model.rows[1].label = '新计划';
  parsed.model.rows[2].label = '新详情';
  assert.equal(serializeStructuredDiagram('mindmap', parsed.model), source.replace('计划', '新计划').replace('详情', '新详情'));
  const plainRoot = parseStructuredDiagram('mindmap', 'mindmap\n  Plain root\n    Child');
  assert.equal(serializeStructuredDiagram('mindmap', plainRoot.model), 'mindmap\n  Plain root\n    Child');
});

test('mindmap comments, directives and unsupported shapes cannot silently become topic labels', () => {
  for (const line of ['%% comment', '::icon(fa fa-book)', ':::important', 'node{{Hexagon}}', 'node))Bang((', 'node)Cloud(', 'node["`**Markdown**`"]', '<b>HTML</b>', 'node[[wrong]]']) {
    const source = `mindmap\n  root((Root))\n    ${line}`;
    const parsed = parseStructuredDiagram('mindmap', source);
    assert.equal(parsed.valid, false, line);
    assert.ok(parsed.unsupportedLines.length, line);
  }
  assert.equal(parseStructuredDiagram('mindmap', '---\ntitle: metadata\n---\nmindmap\n root').valid, false);
});

test('timeline edits preserve source event groups and intentionally repeated period nodes', () => {
  const input = 'timeline\n    title History\n    Q1 : first : second\n       : third\n    Q2 : fourth\n    Q1 : fifth';
  const parsed = parseStructuredDiagram('timeline', input);
  assert.equal(parsed.valid, true);
  assert.deepEqual(parsed.model.rows.map(row => row.periodGroup), [0, 0, 0, 1, 2]);
  parsed.model.settings.title = 'Edited';
  parsed.model.rows[1].event = 'changed';
  const output = serializeStructuredDiagram('timeline', parsed.model);
  assert.equal(output, 'timeline\n    title Edited\n    Q1 : first\n     : changed\n     : third\n    Q2 : fourth\n    Q1 : fifth');
  assert.deepEqual(parseStructuredDiagram('timeline', output).model, parsed.model);
  parsed.model.rows[1].period = 'Q3';
  assert.match(serializeStructuredDiagram('timeline', parsed.model), /Q1 : first\n    Q3 : changed\n    Q1 : third/);
  parsed.model.rows.splice(1, 1);
  assert.match(serializeStructuredDiagram('timeline', parsed.model), /Q1 : first\n     : third/);
  parsed.model.rows.push({ period: 'Q1', event: 'new node' });
  assert.match(serializeStructuredDiagram('timeline', parsed.model), /Q1 : fifth\n    Q1 : new node$/);
});

test('advanced syntax refuses visual conversion instead of losing source', () => {
  assert.equal(parseStructuredDiagram('sequence', `sequenceDiagram\n    participant A\n    loop Retry\n      A->>A: Again\n    end`).valid, false);
  assert.equal(parseStructuredDiagram('kanban', `kanban\n  todo[Todo]\n    task[Work]@{ priority: 'High' }`).valid, false);
  assert.equal(parseStructuredDiagram('bar-chart', JSON.stringify({ xAxis: { type: 'value' }, series: [{ type: 'bar', data: [1] }] })).valid, false);
});

test('simple ECharts data editors preserve categories and numeric values', () => {
  for (const id of ['bar-chart', 'line-chart', 'doughnut-chart']) {
    const template = DIAGRAM_TEMPLATES.find(item => item.id === id);
    const parsed = parseStructuredDiagram(id, diagramTemplateSource(template, 'en'));
    parsed.model.rows[0].value = 123;
    const serialized = JSON.parse(serializeStructuredDiagram(id, parsed.model));
    const value = id === 'doughnut-chart' ? serialized.series[0].data[0].value : serialized.series[0].data[0];
    assert.equal(value, 123);
  }
});
