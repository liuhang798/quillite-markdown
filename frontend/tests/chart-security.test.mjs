import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import * as echarts from 'echarts';
import { secureChartOption } from '../src/chart-security.js';

test('dataset rows and named columns are data, not executable chart options', () => {
  for (const source of [
    [{ link: 120, sublink: 30, constructor: 5, prototype: 8, tooltip: { renderMode: 'html' }, type: 'filter', config: { reg: 'ordinary text' } }],
    { link: [120, 130], constructor: [5, 6], prototype: [8, 9] },
  ]) {
    const option = { dataset: [{ source }], series: [{ type: 'bar', encode: { x: 'constructor', y: 'link' } }] };
    const original = structuredClone(option);
    assert.deepEqual(secureChartOption(option), original);
  }
});

test('raw value objects and encode maps retain custom dimension names', () => {
  const option = { series: [{ type: 'scatter', dimensions: [{ name: 'link' }, { name: 'constructor' }], encode: { tooltip: ['link'], itemName: 'constructor' }, data: [{ value: { link: 120, constructor: 5 }, tooltip: { renderMode: 'html' } }] }] };
  secureChartOption(option);
  assert.deepEqual(option.series[0].data[0].value, { link: 120, constructor: 5 });
  assert.deepEqual(option.series[0].encode, { tooltip: ['link'], itemName: 'constructor' });
  assert.equal(option.series[0].data[0].tooltip.renderMode, 'richText');
});

test('data boundaries cannot disable executable option filtering in timeline or media', () => {
  const option = { baseOption: { dataset: { source: [{ link: 120 }] } }, options: [{ title: { link: 'javascript:alert(1)' } }], media: [{ option: { series: [{ data: [{ link: 'javascript:alert(1)', tooltip: { renderMode: 'html' } }] }] } }] };
  secureChartOption(option);
  assert.equal(option.baseOption.dataset.source[0].link, 120);
  assert.equal(option.options[0].title.link, undefined);
  assert.equal(option.media[0].option.series[0].data[0].link, undefined);
  assert.equal(option.media[0].option.series[0].data[0].tooltip.renderMode, 'richText');
});

test('large arrays and filter lists do not exceed the JavaScript argument limit', () => {
  const values = Array.from({ length: 150000 }, (_, i) => i);
  const option = { series: [{ type: 'line', data: values }], dataset: { transform: { type: 'filter', config: { and: Array.from({ length: 150000 }, () => ({ dimension: 'year', '>=': 2020 })) } } } };
  assert.doesNotThrow(() => secureChartOption(option));
  assert.equal(option.series[0].data.length, 150000);
  assert.equal(option.series[0].data[149999], 149999);
  option.dataset.transform.config.and[149999] = { reg: '^(a+)+$' };
  assert.throws(() => secureChartOption(option), /Regular-expression/);
});

test('prototype pollution keys remain blocked even inside raw data', () => {
  const option = JSON.parse('{"dataset":{"source":[{"constructor":5,"__proto__":{"polluted":true},"nested":{"__proto__":{"polluted":true}}}]},"constructor":{"prototype":{"polluted":true}}}');
  secureChartOption(option);
  assert.equal(option.dataset.source[0].constructor, 5);
  assert.equal(Object.hasOwn(option.dataset.source[0], '__proto__'), false);
  assert.equal(Object.hasOwn(option.dataset.source[0].nested, '__proto__'), false);
  assert.equal(Object.hasOwn(option, 'constructor'), false);
  assert.equal({}.polluted, undefined);
});

test('ECharts renders both row and column datasets with reserved-looking dimension names', () => {
  for (const source of [
    [{ link: 120, constructor: 'A' }, { link: 130, constructor: 'B' }],
    { link: [120, 130], constructor: ['A', 'B'] },
  ]) {
    const chart = echarts.init(null, null, { renderer: 'svg', ssr: true, width: 600, height: 400 });
    try {
      chart.setOption(secureChartOption({ animation: false, dataset: { source }, xAxis: { type: 'category' }, yAxis: {}, series: [{ type: 'bar', encode: { x: 'constructor', y: 'link' } }] }));
      const data = chart.getModel().getSeriesByIndex(0).getData();
      assert.equal(data.count(), 2);
      assert.deepEqual([data.get('link', 0), data.get('link', 1)], [120, 130]);
      assert.match(chart.renderToSVGString(), /<path/);
    } finally { chart.dispose(); }
  }
});

test('ECharts renders a 150,000-point chart after security filtering', () => {
  const chart = echarts.init(null, null, { renderer: 'svg', ssr: true, width: 600, height: 400 });
  try {
    chart.setOption(secureChartOption({ animation: false, xAxis: { type: 'category' }, yAxis: {}, series: [{ type: 'line', showSymbol: false, data: Array.from({ length: 150000 }, (_, i) => i % 100) }] }));
    assert.equal(chart.getModel().getSeriesByIndex(0).getData().count(), 150000);
    assert.match(chart.renderToSVGString(), /<path/);
  } finally { chart.dispose(); }
});

test('nested tooltip HTML modes cannot bypass rich-text rendering', () => {
  const option = { tooltip: { renderMode: 'html', extraCssText: 'position:fixed' }, options: [{ series: [{ tooltip: { renderMode: 'html' }, data: [{ name: '<img onerror=alert(1)>' }] }] }] };
  secureChartOption(option);
  assert.equal(option.tooltip.renderMode, 'richText');
  assert.equal(option.tooltip.extraCssText, undefined);
  assert.equal(option.options[0].series[0].tooltip.renderMode, 'richText');
  assert.equal(option.options[0].series[0].data[0].name, '<img onerror=alert(1)>');
  const renderer = readFileSync(new URL('../src/echarts-diagrams.js', import.meta.url), 'utf8');
  assert.match(renderer, /const option = secureChartOption\(JSON.parse\(JSON.stringify\(rawOption\)\)\)/);
  assert.match(renderer, /option.tooltip = \{[\s\S]*renderMode: 'richText'/);
});

test('chart links only allow HTTP and HTTPS and prototype keys are removed', () => {
  const option = JSON.parse('{"title":{"link":"javascript:alert(1)","sublink":"https://example.com"},"series":[{"data":[{"link":"data:text/html,bad"}]}],"__proto__":{"polluted":true}}');
  secureChartOption(option);
  assert.equal(option.title.link, undefined);
  assert.equal(option.title.sublink, 'https://example.com');
  assert.equal(option.series[0].data[0].link, undefined);
  assert.equal(Object.hasOwn(option, '__proto__'), false);
  assert.equal({}.polluted, undefined);
});

test('data-view labels are escaped without removing the feature', () => {
  const option = { toolbox: { feature: { dataView: { show: true, title: '<img src=x>', lang: ['<svg onload=x>', 'close', 'refresh'] } } } };
  secureChartOption(option);
  assert.equal(option.toolbox.feature.dataView.show, true);
  assert.equal(option.toolbox.feature.dataView.title, '&lt;img src=x&gt;');
  assert.equal(option.toolbox.feature.dataView.lang[0], '&lt;svg onload=x&gt;');
});

test('unsafe regex filters are rejected while ordinary numeric filters remain valid', () => {
  assert.throws(() => secureChartOption({ dataset: { transform: { type: 'filter', config: { and: [{ reg: '^(a+)+$' }] } } } }), /Regular-expression/);
  const option = { dataset: { transform: { type: 'filter', config: { dimension: 'year', '>=': 2020 } } } };
  assert.deepEqual(secureChartOption(structuredClone(option)), option);
});

test('patched chart engine preserves the v5 theme in preview and export', () => {
  const renderer = readFileSync(new URL('../src/echarts-diagrams.js', import.meta.url), 'utf8');
  assert.match(renderer, /import 'echarts\/theme\/v5'/);
  const initializers = [...renderer.matchAll(/echarts\.init\([^\n]+/g)];
  assert.equal(initializers.length, 2);
  for (const [initializer] of initializers) assert.match(initializer, /, 'v5',/);
});

test('word-cloud normalization leaves weight-based sizes intact', () => {
  const renderer = readFileSync(new URL('../src/echarts-diagrams.js', import.meta.url), 'utf8');
  const normalization = renderer.match(/item\.data = item\.data\.map\(\(word, index\) =>[^\n]+/)[0];
  const item = { data: [{ name: 'large', value: 100 }, { name: 'small', value: 10 }, { name: 'custom', value: 50, textStyle: { fontSize: 32 } }] };
  new Function('item', 'palette', 'NORMAL_TEXT', normalization)(item, ['#159A63'], { fontFamily: 'sans-serif', fontWeight: 400 });
  assert.equal(item.data[0].textStyle.fontSize, undefined);
  assert.equal(item.data[1].textStyle.fontSize, undefined);
  assert.equal(item.data[2].textStyle.fontSize, 32);
});
