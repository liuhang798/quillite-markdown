import assert from 'node:assert/strict';
import test from 'node:test';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
import { DIAGRAM_TEMPLATES, diagramTemplateById, diagramTemplateSource } from '../src/diagram-templates.js';
import { identifyDiagramTemplate, findEditableDiagramFenceAt, diagramReplacementMarkdown } from '../src/diagram-editing.js';
import { parseStructuredDiagram, serializeStructuredDiagram } from '../src/structured-diagram-editor.js';

test('all 37 chart templates reopen with their exact source and correct engine', () => {
  for (const template of DIAGRAM_TEMPLATES) {
    for (const locale of ['zh', 'en']) {
      const source = diagramTemplateSource(template, locale);
      const engine = template.engine || 'mermaid';
      const markdown = `before\n\n\`\`\`${engine}\n${source}\n\`\`\`\n\nafter`;
      const range = findEditableDiagramFenceAt(markdown, markdown.indexOf(source) + 5);
      assert.ok(range, template.id);
      assert.equal(range.source, source, template.id);
      assert.equal(diagramTemplateById(range.templateId).engine || 'mermaid', engine);
      assert.equal(markdown.slice(0, range.from) + diagramReplacementMarkdown(range, source) + markdown.slice(range.to), markdown);
    }
  }
});

test('unknown or invalid chart syntax still opens source mode without injecting a template', () => {
  for (const [engine, source] of [['mermaid', 'futureDiagram\n A --> B'], ['echarts', '{invalid JSON']]) {
    const markdown = `~~~${engine}\n${source}\n~~~`;
    const range = findEditableDiagramFenceAt(markdown, 10);
    assert.equal(range.templateId, `source-${engine}`);
    assert.equal(diagramTemplateById(range.templateId).visualEditor, undefined);
    assert.equal(range.source, source);
  }
  assert.equal(identifyDiagramTemplate('%% comment\nsequenceDiagram\nA->>B: text'), 'sequence');
  assert.equal(identifyDiagramTemplate('---\ntitle: example\n---\nsankey-beta\nA,B,1'), 'sankey');
});

test('fences preserve indentation, CRLF and language while replacing only the chosen chart', () => {
  const markdown = 'before\r\n  ~~~~ECharts\r\n  {"series":[]}\r\n  ~~~~\r\nafter';
  const range = findEditableDiagramFenceAt(markdown, markdown.indexOf('series'));
  const replacement = diagramReplacementMarkdown(range, '{"series":[{"type":"line"}]}');
  assert.equal(markdown.slice(0, range.from) + replacement + markdown.slice(range.to), 'before\r\n  ~~~~ECharts\r\n  {"series":[{"type":"line"}]}\r\n  ~~~~\r\nafter');
  assert.equal(findEditableDiagramFenceAt(markdown, 0), null);
  assert.equal(findEditableDiagramFenceAt('````markdown\n```mermaid\nflowchart LR\nA-->B\n```\n````', 38), null);
  assert.equal(findEditableDiagramFenceAt('```mermaid\nflowchart LR\n', 20), null);
  assert.match(diagramReplacementMarkdown({ marker: '```', engine: 'mermaid' }, 'future\n```'), /^````mermaid\n/);
});

test('sankey rows round-trip CSV commas, quotes, decimals and row changes', () => {
  const parsed = parseStructuredDiagram('sankey', 'sankey-beta\n"Input, one","A ""quoted"" node",12.5\n"A ""quoted"" node",Output,2');
  assert.equal(parsed.valid, true);
  assert.deepEqual(parsed.model.rows[0], { from: 'Input, one', to: 'A "quoted" node', value: 12.5 });
  parsed.model.rows[0].value = 25;
  parsed.model.rows.pop();
  parsed.model.rows.push({ from: 'Other', to: 'Output', value: 4 });
  const reparsed = parseStructuredDiagram('sankey', serializeStructuredDiagram('sankey', parsed.model));
  assert.equal(reparsed.valid, true);
  assert.deepEqual(reparsed.model.rows, parsed.model.rows);
  for (const source of ['sankey-beta\nA,B,no', 'sankey-beta\nA,B,-3', 'sankey-beta\nA,B,Infinity', 'sankey-beta\n%% custom setting\nA,B,1', '---\ntitle: Keep\n---\nsankey-beta\nA,B,1']) {
    assert.equal(parseStructuredDiagram('sankey', source).valid, false, source);
  }
});

test('existing ECharts table edits preserve custom options and item styling', () => {
  for (const id of ['bar-chart', 'line-chart', 'doughnut-chart']) {
    const option = JSON.parse(diagramTemplateSource(diagramTemplateById(id)));
    option.backgroundColor = '#123456';
    option.title.textStyle = { fontSize: 30 };
    option.series[0].itemStyle = { color: '#ff0000' };
    if (id === 'doughnut-chart') option.series[0].data[0].itemStyle = { color: '#ff0000' };
    const parsed = parseStructuredDiagram(id, JSON.stringify(option));
    assert.equal(parsed.valid, true);
    parsed.model.rows[0].value = 222;
    const result = JSON.parse(serializeStructuredDiagram(id, parsed.model));
    assert.deepEqual(result.title.textStyle, option.title.textStyle);
    assert.deepEqual(result.series[0].itemStyle, option.series[0].itemStyle);
    assert.equal(result.backgroundColor, '#123456');
    if (id === 'doughnut-chart') assert.deepEqual(result.series[0].data[0].itemStyle, option.series[0].data[0].itemStyle);
  }
  assert.equal(parseStructuredDiagram('bar-chart', '{"xAxis":{"type":"category"},"dataset":{"source":[1]},"series":[{"type":"bar"}]}').valid, false);
});

test('saving an existing diagram refuses stale sessions or changed source ranges', () => {
  const renderer = readFileSync(new URL('../src/renderer.js', import.meta.url), 'utf8');
  const fn = renderer.slice(renderer.indexOf('function replaceExistingFlowchart('), renderer.indexOf('function insertGeneratedDiagram('));
  const state = { editing: true, documentSession: 1 };
  const calls = [];
  const context = vm.createContext({ state, codeEditor: { state: { doc: { sliceString: () => 'original' } }, dispatch: value => calls.push(value), focus() {} }, diagramReplacementMarkdown, showToast() {}, t: x => x });
  vm.runInContext(fn, context);
  const range = { from: 0, to: 8, documentSession: 0, original: 'original', engine: 'echarts' };
  context.replaceExistingFlowchart(range, '{}');
  assert.equal(calls.length, 0);
  range.documentSession = 1;
  range.original = 'changed';
  context.replaceExistingFlowchart(range, '{}');
  assert.equal(calls.length, 0);
  range.original = 'original';
  context.replaceExistingFlowchart(range, '{}');
  assert.equal(calls.length, 1);
  assert.match(calls[0].changes.insert, /^```echarts/);
});
