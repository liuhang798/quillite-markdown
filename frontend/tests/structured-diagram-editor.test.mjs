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
    'bar-chart', 'line-chart', 'doughnut-chart', 'sankey'
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
    assert.ok(structuredDiagramDefinition(templateId, 'zh').columns.length >= 2);
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
