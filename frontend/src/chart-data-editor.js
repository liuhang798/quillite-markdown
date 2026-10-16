// Pure, bounded data editing. Unsupported configurations remain source-only.
export const TABLE_CHART_IDS = ['stacked-bar-chart', 'area-chart', 'combo-chart', 'diverging-bar-chart', 'scatter-chart', 'horizontal-bar-chart', 'histogram-chart', 'percent-bar-chart', 'calendar-chart'];
const clone = value => JSON.parse(JSON.stringify(value));
export const finiteNumber = value => {
  if (!['number', 'string'].includes(typeof value) || String(value).trim() === '' || !Number.isFinite(Number(value))) throw new Error('invalid-number');
  return Number(value);
};
const axes = value => Array.isArray(value) ? value : [value];
const fail = () => { throw new Error('unsupported-data'); };

export function histogram(samples, bins) {
  bins = finiteNumber(bins);
  if (!Number.isInteger(bins) || bins < 1 || bins > 100 || !samples.length || samples.length > 2000) fail();
  const values = samples.map(finiteNumber);
  let min = values[0], max = values[0];
  for (const value of values) { min = Math.min(min, value); max = Math.max(max, value); }
  if (min === max) return { labels: [String(min)], values: [values.length] };
  const width = (max - min) / bins;
  if (!Number.isFinite(width) || width <= 0) fail();
  const counts = Array(bins).fill(0);
  values.forEach(value => counts[Math.min(bins - 1, Math.floor((value - min) / width))]++);
  const fmt = value => String(Number(value.toPrecision(10)));
  return { labels: counts.map((_, i) => `[${fmt(min + i * width)}, ${fmt(i === bins - 1 ? max : min + (i + 1) * width)}${i === bins - 1 ? ']' : ')'}`), values: counts };
}

export function percentageColumns(columns) {
  if (!Array.isArray(columns) || !columns.length || columns.length > 12 || !Array.isArray(columns[0]) || columns[0].length > 2000 || columns.some(col => !Array.isArray(col) || col.length !== columns[0].length)) fail();
  const result = columns.map(col => col.map(value => { const n = finiteNumber(value); if (n < 0) fail(); return n; }));
  for (let row = 0; row < result[0].length; row++) {
    let max = 0;
    for (const col of result) max = Math.max(max, col[row]);
    let total = 0;
    if (max) for (const col of result) total += col[row] / max;
    for (const col of result) col[row] = total ? (col[row] / max) / total * 100 : 0;
  }
  return result;
}

function validDate(value) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) && Number.isFinite(Date.parse(`${value}T00:00:00Z`)) && new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) === value;
}

function calendarMaximum(rows) {
  let max = 0;
  for (const row of rows) max = Math.max(max, finiteNumber(row.value));
  // Keep an all-zero calendar meaningful without a degenerate color domain.
  return max || 1;
}

function calendarVisualMap(option) {
  const maps = option.visualMap == null ? [] : axes(option.visualMap);
  if (maps.length > 1) fail();
  const map = maps[0];
  if (map && (typeof map !== 'object' || map.type && map.type !== 'continuous' || map.pieces || map.categories || map.dimension != null && map.dimension !== 1 || map.seriesIndex != null && map.seriesIndex !== 0 && map.seriesIndex !== 'all')) fail();
  return map;
}

export function parseTableChart(id, source) {
  const option = JSON.parse(source);
  if (!option || option.dataset || Array.isArray(option.title) || !Array.isArray(option.series) || !option.series.length || option.series.length > 12) fail();
  if (option.series.some(s => !s || !Array.isArray(s.data) || s.data.length > 2000 || s.encode || s.datasetIndex != null)) fail();
  const model = { tableChart: true, originalOption: option, settings: { title: option.title?.text || '' }, rows: [], series: option.series.map(s => clone(s)) };
  if (id === 'histogram-chart') {
    const meta = option.__quillite;
    if (meta?.dataEditor !== 'histogram' || option.series.length !== 1 || option.series[0].type !== 'bar' || !Array.isArray(meta.samples)) fail();
    const computed = histogram(meta.samples, meta.bins);
    if (JSON.stringify(option.xAxis?.data) !== JSON.stringify(computed.labels) || JSON.stringify(option.series[0].data) !== JSON.stringify(computed.values)) fail();
    model.kind = 'histogram'; model.settings.bins = meta.bins; model.settings.xAxisName = option.xAxis?.name || ''; model.rows = meta.samples.map(value => ({ value }));
  } else if (id === 'calendar-chart') {
    if (!option.calendar || Array.isArray(option.calendar) || option.series.length !== 1 || option.series[0].coordinateSystem !== 'calendar' || option.series[0].type !== 'heatmap') fail();
    model.kind = 'calendar';
    model.rows = option.series[0].data.map(item => { if (!Array.isArray(item) || item.length !== 2) fail(); return { label: item[0], value: item[1] }; });
    const map = calendarVisualMap(option);
    // Legacy generated charts have a zero baseline and a maximum matching
    // their data. Distinct custom domains/filters stay fixed unless opted in.
    model.settings.autoVisualMap = typeof option.__quillite?.autoVisualMap === 'boolean'
      ? option.__quillite.autoVisualMap
      : !map || (!map.range && (map.min ?? 0) === 0 && map.max === calendarMaximum(model.rows));
  } else if (id === 'scatter-chart') {
    if (option.series.some(s => s.type !== 'scatter') || option.__quillite?.transform || option.series.length !== 1) fail();
    model.kind = 'scatter';
    model.rows = option.series[0].data.map(item => { if (!Array.isArray(item) || item.length !== 2) fail(); return { x: item[0], y: item[1] }; });
  } else {
    const horizontal = ['horizontal-bar-chart', 'diverging-bar-chart'].includes(id);
    const categoryAxis = horizontal ? option.yAxis : option.xAxis;
    if (!categoryAxis || Array.isArray(categoryAxis) || categoryAxis.type !== 'category' || !Array.isArray(categoryAxis.data) || option.series.some(s => !['bar', 'line'].includes(s.type))) fail();
    if (option.series.some(s => (s.xAxisIndex || 0) !== 0 || !Number.isInteger(s.yAxisIndex || 0) || (s.yAxisIndex || 0) >= axes(option.yAxis).length)) fail();
    if (option.series.some(s => s.data.length !== categoryAxis.data.length || s.data.some(n => typeof n !== 'number' || !Number.isFinite(n)))) fail();
    if (categoryAxis.data.some(s => !['string', 'number'].includes(typeof s))) fail();
    model.kind = horizontal ? 'horizontal' : id === 'percent-bar-chart' ? 'percent' : 'cartesian';
    let data = option.series.map(s => s.data);
    if (model.kind === 'percent') {
      if (option.__quillite?.dataEditor !== 'percent' || !Array.isArray(option.__quillite.rawColumns)) fail();
      const calculated = percentageColumns(option.__quillite.rawColumns);
      if (JSON.stringify(calculated) !== JSON.stringify(data)) fail();
      data = option.__quillite.rawColumns;
    }
    model.rows = categoryAxis.data.map((label, i) => Object.fromEntries([['label', label], ...data.map((col, index) => [`s${index}`, col[i]])]));
  }
  model.series.forEach((series, i) => { model.settings[`name${i}`] = String(series.name ?? ''); });
  const validation = validateTableChart(model);
  if (!validation.valid) fail();
  return model;
}

export function tableChartDefinition(model, locale = 'zh') {
  const en = locale === 'en';
  const settings = [{ key: 'title', label: en ? 'Title' : '标题' }];
  if (model.kind === 'histogram') settings.push({ key: 'bins', type: 'number', min: 1, max: 100, label: en ? 'Bins (1–100)' : '分箱数（1–100）' }, { key: 'xAxisName', label: en ? 'Horizontal axis label / unit' : '横轴名称／单位' });
  else if (model.kind === 'calendar') settings.push({ key: 'autoVisualMap', type: 'checkbox', label: en ? 'Auto color scale (off: keep original range)' : '色标随数据自动缩放（关闭则保留原范围）' });
  else if (model.kind !== 'calendar') model.series.forEach((_, i) => settings.push({ key: `name${i}`, label: `${en ? 'Series' : '系列'} ${i + 1}` }));
  const numeric = (key, label) => ({ key, label, type: 'number', ...(model.kind === 'percent' || model.kind === 'calendar' ? { min: 0 } : {}) });
  let columns;
  if (model.kind === 'histogram') columns = [numeric('value', en ? 'Raw observation' : '原始样本值')];
  else if (model.kind === 'scatter') columns = [numeric('x', 'X'), numeric('y', 'Y')];
  else if (model.kind === 'calendar') columns = [{ key: 'label', label: en ? 'Date YYYY-MM-DD' : '日期 YYYY-MM-DD' }, numeric('value', en ? 'Value' : '数值')];
  else columns = [{ key: 'label', label: en ? 'Category' : '分类' }, ...model.series.map((_, i) => numeric(`s${i}`, model.settings[`name${i}`] || `${en ? 'Series' : '系列'} ${i + 1}`))];
  return { settings, columns, empty: Object.fromEntries(columns.map(col => [col.key, col.type === 'number' ? 0 : ''])), add: en ? 'Add row' : '添加一行', remove: en ? 'Remove' : '删除', seriesEditable: ['cartesian', 'horizontal', 'percent'].includes(model.kind) };
}

export function validateTableChart(model) {
  if (!model.rows.length) return { valid: false, code: 'empty-rows' };
  if (model.rows.length > 2000) return { valid: false, code: 'data-limit' };
  if (model.series.length > 1) {
    const names = model.series.map((_, i) => model.settings[`name${i}`]?.trim());
    if (names.some(name => !name) || new Set(names).size !== names.length) return { valid: false, code: 'series-name' };
  }
  const definition = tableChartDefinition(model);
  const dates = new Set();
  for (const [row, data] of model.rows.entries()) for (const col of definition.columns) {
    const failAt = code => ({ valid: false, code, row, field: col.key });
    if (col.type === 'number') {
      let value; try { value = finiteNumber(data[col.key]); } catch { return failAt('invalid-number'); }
      if (col.min !== undefined && value < col.min) return failAt('number-range');
    } else if (!String(data[col.key] ?? '').trim()) return failAt('empty-label');
    if (model.kind === 'calendar' && col.key === 'label') {
      if (!validDate(data.label)) return failAt('invalid-date');
      if (dates.has(data.label)) return failAt('duplicate-label');
      dates.add(data.label);
    }
  }
  if (model.kind === 'calendar') {
    const sorted = [...dates].sort();
    if ((Date.parse(sorted.at(-1)) - Date.parse(sorted[0])) / 86400000 > 366) return { valid: false, code: 'date-range' };
  }
  if (model.kind === 'histogram') {
    try { histogram(model.rows.map(row => row.value), model.settings.bins); } catch { return { valid: false, code: 'bin-range' }; }
  }
  return { valid: true };
}

export function serializeTableChart(model) {
  const validation = validateTableChart(model);
  if (!validation.valid) throw Object.assign(new Error(validation.code), validation);
  const option = clone(model.originalOption);
  option.title = { ...option.title, text: model.settings.title };
  option.series = clone(model.series);
  const renames = new Map(model.originalOption.series.map(s => [s.name, null]));
  option.series.forEach((s, i) => { renames.set(s.name, model.settings[`name${i}`]); });
  for (const legend of option.legend ? axes(option.legend) : []) {
    if (Array.isArray(legend.data)) {
      legend.data = legend.data.flatMap(item => {
        const name = typeof item === 'string' ? item : item?.name;
        if (!renames.has(name)) return [item];
        const renamed = renames.get(name);
        return renamed === null ? [] : [typeof item === 'object' ? { ...item, name: renamed } : renamed];
      });
      for (let i = model.originalOption.series.length; i < model.series.length; i++) legend.data.push(model.settings[`name${i}`]);
    }
    if (legend.selected) legend.selected = Object.fromEntries(Object.entries(legend.selected).flatMap(([key, value]) => renames.get(key) === null ? [] : [[renames.get(key) ?? key, value]]));
  }
  option.series.forEach((s, i) => { if (model.kind !== 'calendar') s.name = model.settings[`name${i}`]; });
  if (model.kind === 'histogram') {
    const samples = model.rows.map(row => finiteNumber(row.value));
    const result = histogram(samples, model.settings.bins);
    option.__quillite = { ...option.__quillite, dataEditor: 'histogram', bins: Number(model.settings.bins), samples };
    option.xAxis.data = result.labels; option.xAxis.name = model.settings.xAxisName; option.series[0].data = result.values;
  } else if (model.kind === 'calendar') {
    option.series[0].data = model.rows.map(row => [row.label, finiteNumber(row.value)]);
    const dates = model.rows.map(row => row.label).sort();
    const range = option.calendar.range;
    const originalDates = model.originalOption.series[0].data.map(item => item[0]).sort();
    const followsDates = Array.isArray(range) && range[0] === originalDates[0] && range[1] === originalDates.at(-1);
    if (followsDates || !Array.isArray(range) || dates[0] < range[0] || dates.at(-1) > range[1]) option.calendar.range = [dates[0], dates.at(-1)];
    option.__quillite = { ...option.__quillite, autoVisualMap: Boolean(model.settings.autoVisualMap) };
    if (model.settings.autoVisualMap) {
      const originalMap = calendarVisualMap(option);
      const map = { ...originalMap, min: 0, max: calendarMaximum(model.rows) };
      // Explicit filters and numeric endpoint captions must not retain an old
      // domain when the user chooses automatic scaling.
      delete map.range;
      if (Array.isArray(map.text) && map.text.length === 2 && map.text[0] === String(originalMap?.max) && map.text[1] === String(originalMap?.min)) map.text = [String(map.max), '0'];
      option.visualMap = Array.isArray(option.visualMap) ? [map] : map;
    }
  } else if (model.kind === 'scatter') option.series[0].data = model.rows.map(row => [finiteNumber(row.x), finiteNumber(row.y)]);
  else {
    const categoryAxis = model.kind === 'horizontal' ? option.yAxis : option.xAxis;
    categoryAxis.data = model.rows.map(row => row.label);
    let data = option.series.map((_, i) => model.rows.map(row => finiteNumber(row[`s${i}`])));
    if (model.kind === 'percent') {
      option.__quillite = { ...option.__quillite, dataEditor: 'percent', rawColumns: data };
      data = percentageColumns(data);
    }
    option.series.forEach((s, i) => { s.data = data[i]; });
  }
  return JSON.stringify(option, null, 2);
}

export function addTableSeries(model, locale = 'en') {
  if (!tableChartDefinition(model).seriesEditable || model.series.length >= 12) return false;
  const index = model.series.length;
  // Copy only the series kind/axis/stack, never stale marks, IDs or data.
  const previous = model.series.at(-1);
  model.series.push({ type: previous.type, ...(previous.areaStyle ? { areaStyle: clone(previous.areaStyle) } : {}), ...(previous.stack ? { stack: previous.stack } : {}), ...(previous.yAxisIndex ? { yAxisIndex: previous.yAxisIndex } : {}) });
  const prefix = locale === 'en' ? 'Series' : '系列';
  let suffix = index + 1;
  while (Object.values(model.settings).includes(`${prefix} ${suffix}`)) suffix++;
  model.settings[`name${index}`] = `${prefix} ${suffix}`;
  if (index === 1 && !model.settings.name0) model.settings.name0 = `${prefix} 1`;
  model.rows.forEach(row => { row[`s${index}`] = 0; });
  return true;
}

// TSV from Excel and quoted CSV. Parse atomically: a malformed cell never
// partially replaces the user's table. Headers are explicitly optional.
export function parsePastedTable(source, columns, skipHeader = false) {
  if (source.length > 500000) throw new Error('data-limit');
  const separator = source.includes('\t') ? '\t' : ',';
  const records = []; let row = [], value = '', quoted = false, closed = false;
  for (let i = 0; i <= source.length; i++) {
    const c = source[i];
    if (quoted) {
      if (c === '"' && source[i + 1] === '"') { value += '"'; i++; }
      else if (c === '"') { quoted = false; closed = true; }
      else if (c === undefined) throw new Error('invalid-table');
      else value += c;
    } else if (c === separator || c === '\n' || c === '\r' || c === undefined) {
      row.push(value); value = ''; closed = false;
      if (c !== separator) { if (row.some(v => v !== '')) records.push(row); row = []; if (c === '\r' && source[i + 1] === '\n') i++; }
    } else if (c === '"' && !value && !closed) quoted = true;
    else { if (closed || c === '"') throw new Error('invalid-table'); value += c; }
    if (records.length > 2001) throw new Error('data-limit');
  }
  if (skipHeader) records.shift();
  if (!records.length || records.length > 2000) throw new Error('empty-rows');
  return records.map(record => {
    if (record.length !== columns.length) throw new Error('column-count');
    return Object.fromEntries(columns.map((col, i) => [col.key, col.type === 'number' ? finiteNumber(record[i]) : record[i]]));
  });
}
