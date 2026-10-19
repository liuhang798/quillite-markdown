import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import * as echarts from 'echarts';
import 'echarts/theme/v5.js';
import { secureChartOption } from '../src/chart-security.js';
import { ADDITIONAL_CHART_TEMPLATES } from '../src/additional-chart-templates.js';
import { parseStructuredDiagram, serializeStructuredDiagram } from '../src/structured-diagram-editor.js';

// Exercise the production normalizer and real rendering engine, not a copy of
// the options. SSR exposes the actual display list and generated SVG.
const source = readFileSync(new URL('../src/echarts-diagrams.js', import.meta.url), 'utf8');
const normalize = vm.runInNewContext(source.slice(0, source.indexOf('function disposeDiagram')).replace(/^import .*;\r?\n/gm, '') + '\nprepareOption', { secureChartOption });
const theme = dark => ({ dark, text: dark ? '#eeeeee' : '#222222', muted: '#888888', line: '#aaaaaa', paper: dark ? '#222222' : '#ffffff', panel: dark ? '#303030' : '#f5f5f5', background: dark ? '#222222' : '#ffffff' });
const calendarSource = () => JSON.parse(ADDITIONAL_CHART_TEMPLATES.find(t => t.id === 'calendar-chart').source.zh);

test('histogram has theme-aware bin separators and units without altering frequencies or spacing', () => {
  for (const language of ['zh', 'en']) for (const dark of [false, true]) for (const width of [420, 800]) {
    const raw = JSON.parse(ADDITIONAL_CHART_TEMPLATES.find(t => t.id === 'histogram-chart').source[language]);
    const { option, height } = normalize(raw, theme(dark));
    assert.deepEqual(Array.from(option.series[0].data), [2, 3, 3, 1, 1, 2]);
    assert.equal(option.series[0].barCategoryGap, '0%');
    const chart = echarts.init(null, 'v5', { renderer: 'svg', ssr: true, width, height });
    try {
      chart.setOption(option);
      const data = chart.getModel().getSeriesByIndex(0).getData();
      for (let i = 0; i < data.count(); i++) {
        const shape = data.getItemGraphicEl(i);
        assert.equal(shape.style.stroke, theme(dark).paper);
        assert.equal(shape.style.lineWidth, 1);
        assert.notEqual(shape.style.stroke, shape.style.fill);
      }
      const svg = chart.renderToSVGString();
      assert.ok(svg.includes(raw.xAxis.name));
      const name = chart.getZr().storage.getDisplayList().find(el => el.style?.text === raw.xAxis.name);
      assert.ok(name, 'axis name must render');
      const bounds = name.getBoundingRect().clone(); bounds.applyTransform(name.transform);
      assert.ok(bounds.x >= 0 && bounds.y >= 0 && bounds.x + bounds.width <= width && bounds.y + bounds.height <= height, 'axis name must not be clipped');
    } finally { chart.dispose(); }
    raw.series[0].itemStyle = { borderWidth: 2, borderColor: '#123456' };
    assert.equal(normalize(raw, theme(dark)).option.series[0].itemStyle.borderColor, '#123456');
    assert.equal(normalize(raw, theme(dark)).option.series[0].itemStyle.borderWidth, 2);
    delete raw.__quillite; delete raw.series[0].itemStyle;
    assert.equal(normalize(raw, theme(dark)).option.series[0].itemStyle?.borderWidth, undefined, 'ordinary bars are unchanged');
  }
});

test('new chart data remains visible in actual light/dark SVG output at narrow/wide widths', () => {
  for (const template of ADDITIONAL_CHART_TEMPLATES) for (const language of ['zh', 'en']) for (const dark of [false, true]) for (const width of [420, 800]) {
    const raw = JSON.parse(template.source[language]);
    const before = JSON.stringify(raw);
    const { option, height } = normalize(raw, theme(dark));
    assert.equal(JSON.stringify(raw), before, 'normalizing must not rewrite document data');
    const chart = echarts.init(null, 'v5', { renderer: 'svg', ssr: true, width, height });
    try {
      chart.setOption(option);
      const svg = chart.renderToSVGString();
      assert.ok(!svg.includes('NaN'));
      chart.getModel().eachSeries(series => {
        const data = series.getData();
        assert.equal(data.count(), raw.series[series.seriesIndex].data.length);
        for (let i = 0; i < data.count(); i++) {
          const shape = data.getItemGraphicEl(i);
          assert.ok(shape && !shape.ignore && !shape.invisible, `${template.id}: missing visible data ${i}`);
          const rect = shape.getBoundingRect();
          assert.ok(rect.width > 0 && rect.height > 0, `${template.id}: empty data geometry ${i}`);
          const center = shape.transformCoordToGlobal(rect.x + rect.width / 2, rect.y + rect.height / 2);
          assert.ok(center[0] >= 0 && center[0] <= width && center[1] >= 0 && center[1] <= height, `${template.id}: clipped data ${i}`);
          if (template.id === 'calendar-chart') {
            const calendar = chart.getModel().getComponent('calendar');
            assert.ok(shape.z > calendar.get('z'), 'calendar background must not cover heat cells');
            assert.notEqual(shape.style.fill, option.calendar.itemStyle.color, 'real values must differ from missing days');
          }
        }
      });
      if (template.id === 'calendar-chart') {
        assert.equal(chart.getOption().visualMap[0].max, 10);
        assert.equal((svg.match(/>10<\/text>/g) || []).length, 1, 'one maximum label, no duplicate handle text');
        assert.equal((svg.match(/>0<\/text>/g) || []).length, 1, 'one minimum label');
      }
    } finally { chart.dispose(); }
  }
});

test('calendar layer repair preserves custom range, zero values, filter choice and source', () => {
  const raw = calendarSource(); raw.calendar.z = 8; raw.calendar.zlevel = 2;
  raw.visualMap.max = 5000; raw.visualMap.calculable = true;
  raw.series[0].data = [['2026-01-01', 0], ['2026-01-02', 5000]];
  const { option } = normalize(raw, theme(false));
  assert.equal(option.series[0].z, 9); assert.equal(option.series[0].zlevel, 2);
  assert.equal(option.visualMap.max, 5000); assert.equal(option.visualMap.calculable, true);
  assert.equal(option.visualMap.text, undefined);
  assert.equal(option.series[0].data[0][1], 0); assert.equal(raw.series[0].z, undefined);
  const chart = echarts.init(null, 'v5', { renderer: 'svg', ssr: true, width: 600, height: 360 });
  try {
    chart.setOption(option);
    const data = chart.getModel().getSeriesByIndex(0).getData();
    assert.equal(data.count(), 2);
    const zero = data.getItemGraphicEl(0), maximum = data.getItemGraphicEl(1);
    assert.ok(zero && maximum && !zero.ignore && !maximum.ignore);
    assert.notEqual(zero.style.fill, maximum.style.fill);
    assert.notEqual(zero.style.fill, option.calendar.itemStyle.color);
    assert.equal(zero.zlevel, 2); assert.equal(zero.z, 9);
  } finally { chart.dispose(); }
});

test('explicit one-pixel chart strokes survive the toolbar SVG reset', () => {
  const css = readFileSync(new URL('../src/styles.css', import.meta.url), 'utf8');
  assert.ok(css.includes('.echarts-diagram svg [stroke]:not([stroke="none"]):not([stroke-width]) { stroke-width: 1; }'));
});

test('edited calendar uses the latest color maximum and endpoints in real light/dark renders', () => {
  for (const dark of [false, true]) {
    let model = parseStructuredDiagram('calendar-chart', JSON.stringify(calendarSource())).model;
    for (const value of [50, 30, 0.5, 0]) {
      model.rows.forEach(row => { row.value = value / 2; });
      model.rows[2].value = value;
      const saved = serializeStructuredDiagram('calendar-chart', model);
      const { option, height } = normalize(JSON.parse(saved), theme(dark));
      const chart = echarts.init(null, 'v5', { renderer: 'svg', ssr: true, width: 700, height });
      try {
        chart.setOption(option);
        assert.equal(chart.getOption().visualMap[0].max, value || 1);
        const data = chart.getModel().getSeriesByIndex(0).getData();
        assert.equal(data.get('value', 2), value);
        if (value) assert.notEqual(data.getItemGraphicEl(0).style.fill, data.getItemGraphicEl(2).style.fill);
        const svg = chart.renderToSVGString();
        assert.ok(svg.includes(`>${value || 1}</text>`), 'latest maximum caption is rendered');
        if (value === 30) assert.ok(!svg.includes('>50</text>'), 'old maximum caption is absent');
      } finally { chart.dispose(); }
      model = parseStructuredDiagram('calendar-chart', saved).model;
    }
  }
});
