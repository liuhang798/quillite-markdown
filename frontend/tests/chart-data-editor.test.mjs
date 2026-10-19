import test from 'node:test';
import assert from 'node:assert/strict';
import { TABLE_CHART_IDS, histogram, percentageColumns, parsePastedTable, addTableSeries, parseTableChart } from '../src/chart-data-editor.js';
import { DIAGRAM_TEMPLATES, diagramTemplateSource, diagramTemplateById, searchDiagramTemplates } from '../src/diagram-templates.js';
import { parseStructuredDiagram, serializeStructuredDiagram, validateStructuredDiagram, structuredDiagramDefinition } from '../src/structured-diagram-editor.js';
import { identifyDiagramTemplate } from '../src/diagram-editing.js';
const source = (id, locale = 'zh') => diagramTemplateSource(diagramTemplateById(id), locale);
const draft = id => parseStructuredDiagram(id, source(id)).model;

test('catalog contains 41 unique templates and searches both languages without modifying drafts', () => {
  assert.equal(DIAGRAM_TEMPLATES.length, 41);
  assert.equal(new Set(DIAGRAM_TEMPLATES.map(t => t.id)).size, 41);
  for (const q of ['直方', 'Histogram', 'ｈｉｓｔｏｇｒａｍ', 'echarts distribution']) assert.ok(searchDiagramTemplates('all', q).some(t => t.id === 'histogram-chart'), q);
  assert.equal(searchDiagramTemplates('software', 'histogram').length, 0);
  assert.equal(searchDiagramTemplates('all', 'no-such-chart').length, 0);
});

test('all table charts parse/edit/serialize/reopen in both locales preserving custom configuration', () => {
  for (const id of TABLE_CHART_IDS) for (const lang of ['zh', 'en']) {
    const option = JSON.parse(source(id, lang));
    option.toolbox = { show: false }; option.series[0].itemStyle = { opacity: 0.75 }; option.series[0].id = 'keep-me';
    const parsed = parseStructuredDiagram(id, JSON.stringify(option)); assert.equal(parsed.valid, true, id);
    const model = parsed.model; model.settings.title = '中文 title';
    const def = structuredDiagramDefinition(id, lang, model); assert.ok(def.columns.length);
    const output = serializeStructuredDiagram(id, model), saved = JSON.parse(output);
    assert.deepEqual(saved.toolbox, option.toolbox); assert.deepEqual(saved.series[0].itemStyle, option.series[0].itemStyle); assert.equal(saved.series[0].id, 'keep-me');
    assert.equal(parseStructuredDiagram(id, output).valid, true, id);
    assert.equal(parseStructuredDiagram(identifyDiagramTemplate(output, 'echarts'), output).valid, true, `reopen ${id}`);
  }
});

test('histogram bins observations, includes maximum and handles constants, negatives and invalid ranges', () => {
  assert.deepEqual(histogram([0, 1, 2, 3, 4], 2), { labels: ['[0, 2)', '[2, 4]'], values: [2, 3] });
  assert.deepEqual(histogram([7, 7, 7], 6).values, [3]);
  assert.deepEqual(histogram([-4, -2, 0], 2).values, [1, 2]);
  for (const bins of [0, -1, 101, 1.2, '', Infinity]) assert.throws(() => histogram([1, 2], bins));
  assert.throws(() => histogram([-1e308, 1e308], 3));
  assert.throws(() => histogram([], 3));
  const model = draft('histogram-chart'); model.rows = [{ value: 10 }, { value: 20 }]; model.settings.bins = 2;
  const saved = JSON.parse(serializeStructuredDiagram('histogram-chart', model)); assert.deepEqual(saved.series[0].data, [1, 1]);
  saved.series[0].data[0] = 500;
  assert.equal(parseStructuredDiagram('histogram-chart', JSON.stringify(saved)).valid, false, 'manual source edits cannot be silently overwritten by stored raw samples');
});

test('histogram axis units are editable, optional and survive reopening without changing bins', () => {
  for (const locale of ['zh', 'en']) {
    const model = parseStructuredDiagram('histogram-chart', source('histogram-chart', locale)).model;
    assert.equal(model.settings.xAxisName, locale === 'zh' ? '阅读时长（分钟）' : 'Reading duration (minutes)');
    assert.ok(structuredDiagramDefinition('histogram-chart', locale, model).settings.some(setting => setting.key === 'xAxisName'));
    for (const label of ['年龄（岁）', 'Amount (USD)', '']) {
      model.settings.xAxisName = label;
      const saved = serializeStructuredDiagram('histogram-chart', model);
      assert.equal(JSON.parse(saved).xAxis.name, label);
      assert.equal(parseStructuredDiagram('histogram-chart', saved).model.settings.xAxisName, label);
      assert.deepEqual(JSON.parse(saved).series[0].data, [2, 3, 3, 1, 1, 2]);
    }
    const old = JSON.parse(source('histogram-chart', locale)); delete old.xAxis.name;
    const legacy = parseStructuredDiagram('histogram-chart', JSON.stringify(old)).model;
    assert.equal(legacy.settings.xAxisName, '');
    assert.equal(JSON.parse(serializeStructuredDiagram('histogram-chart', legacy)).xAxis.name, '');
  }
});

test('percent series preserve raw values, safely normalize huge values and reject negative/blank inputs', () => {
  assert.deepEqual(percentageColumns([[0, 1e308, 1], [0, 1e308, 3]]), [[0, 50, 25], [0, 50, 75]]);
  assert.throws(() => percentageColumns([[-1], [2]])); assert.throws(() => percentageColumns([[''], [2]]));
  const model = draft('percent-bar-chart'); model.rows[0].s0 = 0;
  const saved = serializeStructuredDiagram('percent-bar-chart', model);
  assert.equal(parseStructuredDiagram('percent-bar-chart', saved).model.rows[0].s0, 0);
  model.rows[0].s0 = -1; assert.equal(validateStructuredDiagram('percent-bar-chart', model).valid, false);
});

test('TSV and quoted CSV import is bounded, explicit about headers and rejects incomplete rows', () => {
  const cols = [{ key: 'label' }, { key: 'value', type: 'number' }];
  assert.deepEqual(parsePastedTable('名称\t数值\r\n甲\t0\r\n乙\t-1.2\r\n', cols, true), [{ label: '甲', value: 0 }, { label: '乙', value: -1.2 }]);
  assert.deepEqual(parsePastedTable('"A, B",3\n"say ""hi""",4', cols), [{ label: 'A, B', value: 3 }, { label: 'say "hi"', value: 4 }]);
  for (const invalid of ['a,', 'a,Infinity', 'a,1,extra', 'a', '"unclosed,1', '"a"oops,1', 'a,1\nb,']) assert.throws(() => parsePastedTable(invalid, cols), invalid);
  assert.throws(() => parsePastedTable('a,1\n'.repeat(2001), cols));
});

test('multi-series editing preserves dual axes, styles, legend order and selected state', () => {
  const option = JSON.parse(source('combo-chart'));
  option.legend = { data: [{ name: option.series[1].name, icon: 'circle' }, option.series[0].name], selected: { [option.series[0].name]: false } };
  const model = parseStructuredDiagram('combo-chart', JSON.stringify(option)).model;
  model.settings.name0 = '__proto__'; model.settings.name1 = 'New'; model.rows[0].s0 = -3.25;
  let saved = JSON.parse(serializeStructuredDiagram('combo-chart', model));
  assert.deepEqual(saved.yAxis, option.yAxis); assert.equal(saved.series[1].yAxisIndex, 1);
  assert.deepEqual(saved.legend.data, [{ name: 'New', icon: 'circle' }, '__proto__']); assert.equal(saved.legend.selected.__proto__, false);
  assert.equal(saved.series[0].data[0], -3.25);
  assert.equal(addTableSeries(model), true); saved = JSON.parse(serializeStructuredDiagram('combo-chart', model)); assert.equal(saved.series.length, 3); assert.equal(saved.series[2].yAxisIndex, 1);
  model.settings.name2 = 'New'; assert.equal(validateStructuredDiagram('combo-chart', model).code, 'series-name');
  const bar = parseTableChart('bar-chart', source('bar-chart')); assert.equal(addTableSeries(bar), true);
  assert.equal(parseStructuredDiagram('bar-chart', serializeStructuredDiagram('bar-chart', bar)).valid, true);
});

test('calendar dates reject duplicates, impossible dates, spans over a year and negative values', () => {
  for (const value of ['2026-02-30', '2026-13-01', '26-01-01', '2026-1-1']) {
    const model = draft('calendar-chart'); model.rows[0].label = value; assert.equal(validateStructuredDiagram('calendar-chart', model).valid, false);
  }
  const model = draft('calendar-chart'); model.rows[0].label = model.rows[1].label; assert.equal(validateStructuredDiagram('calendar-chart', model).valid, false);
  model.rows[0].label = '2024-01-01'; assert.equal(validateStructuredDiagram('calendar-chart', model).code, 'date-range');
});

test('calendar automatic color domain grows and shrinks after editing, deleting, pasting and reopening', () => {
  for (const locale of ['zh', 'en']) for (const arrayMap of [false, true]) {
    const original = JSON.parse(source('calendar-chart', locale));
    if (arrayMap) original.visualMap = [original.visualMap];
    let model = parseStructuredDiagram('calendar-chart', JSON.stringify(original)).model;
    assert.equal(model.settings.autoVisualMap, true);
    const save = () => {
      const output = serializeStructuredDiagram('calendar-chart', model);
      model = parseStructuredDiagram('calendar-chart', output).model;
      const option = JSON.parse(output);
      return { option, map: arrayMap ? option.visualMap[0] : option.visualMap };
    };
    model.rows[2].value = 50; assert.equal(save().map.max, 50);
    model.rows[2].value = 30; assert.equal(save().map.max, 30);
    model.rows.splice(2, 1); assert.equal(save().map.max, 8);
    model.rows = parsePastedTable('2026-02-01\t0.2\n2026-02-03\t0.5', structuredDiagramDefinition('calendar-chart', locale, model).columns);
    const pasted = save(); assert.equal(pasted.map.max, 0.5); assert.equal(pasted.map.min, 0);
    assert.deepEqual(pasted.option.calendar.range, ['2026-02-01', '2026-02-03']);
    model.rows.forEach(row => { row.value = 0; }); assert.equal(save().map.max, 1);
    assert.equal(model.settings.autoVisualMap, true);
  }
});

test('calendar custom domains and filters stay fixed until explicitly switched to automatic', () => {
  const original = JSON.parse(source('calendar-chart'));
  original.visualMap = { ...original.visualMap, min: 2, max: 5000, range: [2, 4000], text: ['5000', '2'], calculable: true };
  const model = parseStructuredDiagram('calendar-chart', JSON.stringify(original)).model;
  assert.equal(model.settings.autoVisualMap, false);
  model.rows[2].value = 30;
  assert.deepEqual(JSON.parse(serializeStructuredDiagram('calendar-chart', model)).visualMap, original.visualMap);
  model.settings.autoVisualMap = true;
  const saved = JSON.parse(serializeStructuredDiagram('calendar-chart', model));
  assert.equal(saved.visualMap.max, 30); assert.equal(saved.visualMap.min, 0);
  assert.equal(saved.visualMap.range, undefined); assert.deepEqual(saved.visualMap.text, ['30', '0']);
  assert.equal(saved.visualMap.calculable, true);
  assert.equal(original.visualMap.max, 5000, 'original snapshot must remain intact');
  const reopened = parseStructuredDiagram('calendar-chart', JSON.stringify(saved)).model;
  reopened.settings.autoVisualMap = false; reopened.rows[2].value = 20;
  assert.equal(JSON.parse(serializeStructuredDiagram('calendar-chart', reopened)).visualMap.max, 30);
  assert.equal(parseStructuredDiagram('calendar-chart', serializeStructuredDiagram('calendar-chart', reopened)).model.settings.autoVisualMap, false);
});

test('advanced calendar color mappings stay source-only instead of losing configuration', () => {
  for (const change of [o => { o.visualMap = [o.visualMap, { min: 0, max: 20 }]; }, o => { o.visualMap.type = 'piecewise'; }, o => { o.visualMap.dimension = 0; }]) {
    const option = JSON.parse(source('calendar-chart')); change(option);
    assert.equal(parseStructuredDiagram('calendar-chart', JSON.stringify(option)).valid, false);
  }
});

test('other table charts refresh every edited numeric cell without changing intentional fixed axes', () => {
  for (const id of [...TABLE_CHART_IDS.filter(id => id !== 'calendar-chart'), 'bar-chart', 'line-chart']) for (const locale of ['zh', 'en']) {
    // Table parser also covers the single-series variants.
    let model = parseTableChart(id, source(id, locale));
    const definition = structuredDiagramDefinition(id, locale, model);
    for (const field of definition.columns.filter(field => field.type === 'number')) {
      for (const value of [50, 30, 0]) {
        model.rows[0][field.key] = value;
        const saved = serializeStructuredDiagram(id, model);
        model = parseTableChart(id, saved);
        assert.equal(model.rows[0][field.key], value, `${id}/${field.key}/${value}`);
        const option = JSON.parse(saved);
        if (id === 'percent-bar-chart') assert.equal(option.yAxis.max, 100);
        if (id === 'diverging-bar-chart') assert.deepEqual([option.xAxis.min, option.xAxis.max], [-100, 100]);
      }
    }
  }
});

test('complex ECharts data remains source-only and never flattens objects or datasets', () => {
  for (const change of [o => { o.dataset = { source: [[1]] }; }, o => { o.series[0].data[0] = { value: 3, itemStyle: { color: 'red' } }; }, o => { o.series[0].data.push(1); }, o => { o.xAxis = [o.xAxis]; }]) {
    const option = JSON.parse(source('stacked-bar-chart')); change(option);
    assert.equal(parseStructuredDiagram('stacked-bar-chart', JSON.stringify(option)).valid, false);
  }
});

test('basic class and ER diagrams edit fields and relations without losing members; advanced syntax stays source-only', () => {
  for (const id of ['class', 'er']) {
    const model = draft(id); const member = model.rows.find(row => row.kind === 'member'); member.name = 'updated_field';
    const output = serializeStructuredDiagram(id, model); assert.match(output, /updated_field/);
    assert.equal(parseStructuredDiagram(id, output).valid, true);
    model.rows.find(row => row.kind === 'relation').label = '关系说明'; assert.equal(validateStructuredDiagram(id, model).valid, true);
    model.rows.find(row => row.kind === 'relation').target = 'MISSING'; assert.equal(validateStructuredDiagram(id, model).valid, false);
    assert.equal(parseStructuredDiagram(id, source(id) + '\n%% keep this note').valid, false);
  }
});
