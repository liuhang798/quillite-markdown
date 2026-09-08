export const STRUCTURED_VISUAL_DIAGRAM_IDS = Object.freeze([
  'sequence', 'gantt', 'state', 'timeline', 'kanban', 'mindmap', 'pie',
  'bar-chart', 'line-chart', 'doughnut-chart', 'sankey'
]);

const text = value => String(value ?? '').trim();
const number = value => Number.isFinite(Number(value)) ? Number(value) : 0;
const safeMermaidText = value => text(value).replace(/[\r\n]+/gu, ' ').replaceAll('"', '＂').replaceAll('[', '［').replaceAll(']', '］');
const safeId = (value, fallback) => text(value).replace(/[^\p{L}\p{N}_-]+/gu, '_').replace(/^\d/u, '_$&') || fallback;

export function hasStructuredVisualEditor(templateId) {
  return STRUCTURED_VISUAL_DIAGRAM_IDS.includes(templateId);
}

function parseSequence(source) {
  const rows = [];
  const unsupportedLines = [];
  let autonumber = false;
  for (const raw of String(source).split(/\r?\n/u).slice(1)) {
    const line = raw.trim();
    if (!line) continue;
    if (/^autonumber$/iu.test(line)) { autonumber = true; continue; }
    let match = line.match(/^(actor|participant)\s+([^\s]+)(?:\s+as\s+(.+))?$/iu);
    if (match) {
      rows.push({ type: match[1].toLowerCase(), from: match[2], to: '', label: text(match[3] || match[2]) });
      continue;
    }
    match = line.match(/^([^\s]+)\s*(-->>|->>|-->|->|-\)|--)\s*([^:]+?)(?:\s*:\s*(.*))?$/u);
    if (match) rows.push({ type: match[2], from: text(match[1]), to: text(match[3]), label: text(match[4]) });
    else unsupportedLines.push(raw);
  }
  return { settings: { autonumber }, rows, unsupportedLines };
}

function parseTimeline(source) {
  const model = { settings: { title: '' }, rows: [], unsupportedLines: [] };
  let currentPeriod = '';
  for (const raw of String(source).split(/\r?\n/u).slice(1)) {
    const line = raw.trim();
    if (!line) continue;
    if (/^title\s+/iu.test(line)) { model.settings.title = line.replace(/^title\s+/iu, ''); continue; }
    const parts = line.split(':').map(text);
    if (parts[0]) currentPeriod = parts.shift();
    const events = parts.filter(Boolean);
    if (!currentPeriod || !events.length) model.unsupportedLines.push(raw);
    else events.forEach(event => model.rows.push({ period: currentPeriod, event }));
  }
  return model;
}

function parseState(source) {
  const model = { settings: { direction: '' }, rows: [], unsupportedLines: [] };
  for (const raw of String(source).split(/\r?\n/u).slice(1)) {
    const line = raw.trim();
    if (!line) continue;
    if (/^direction\s+(LR|RL|TB|BT)$/iu.test(line)) { model.settings.direction = line.split(/\s+/u)[1].toUpperCase(); continue; }
    const match = line.match(/^(.+?)\s*-->\s*([^:]+?)(?:\s*:\s*(.*))?$/u);
    if (match) model.rows.push({ from: text(match[1]), to: text(match[2]), label: text(match[3]) });
    else model.unsupportedLines.push(raw);
  }
  return model;
}

function parsePie(source) {
  const model = { settings: { title: '', showData: /\bshowData\b/iu.test(String(source).split(/\r?\n/u)[0] || '') }, rows: [], unsupportedLines: [] };
  for (const raw of String(source).split(/\r?\n/u).slice(1)) {
    const line = raw.trim();
    if (/^title\s+/iu.test(line)) { model.settings.title = line.replace(/^title\s+/iu, ''); continue; }
    const match = line.match(/^"([\s\S]*?)"\s*:\s*(-?\d+(?:\.\d+)?)$/u);
    if (match) model.rows.push({ label: match[1], value: Number(match[2]) });
    else if (line) model.unsupportedLines.push(raw);
  }
  return model;
}

function parseKanban(source) {
  const rows = [];
  const unsupportedLines = [];
  let column = '';
  for (const raw of String(source).split(/\r?\n/u).slice(1)) {
    const match = raw.trim().match(/^([^\s\[]+)\[([^\]]*)\]/u);
    if (!match || /@\{/u.test(raw)) { if (raw.trim()) unsupportedLines.push(raw); continue; }
    if (/^\s{0,2}\S/u.test(raw)) column = match[2];
    else rows.push({ column, task: match[2] });
  }
  return { settings: {}, rows, unsupportedLines };
}

function parseMindmap(source) {
  const rows = [];
  for (const raw of String(source).split(/\r?\n/u).slice(1)) {
    if (!raw.trim()) continue;
    const spaces = raw.match(/^\s*/u)?.[0].length || 0;
    const label = raw.trim().replace(/^root\(\((.*)\)\)$/u, '$1');
    rows.push({ level: Math.max(0, Math.round((spaces - 2) / 2)), label });
  }
  if (rows.length) rows[0].level = 0;
  return { settings: {}, rows };
}

function parseGantt(source) {
  const model = { settings: { title: '', dateFormat: 'YYYY-MM-DD', excludes: '' }, rows: [], unsupportedLines: [] };
  let section = '';
  for (const raw of String(source).split(/\r?\n/u).slice(1)) {
    const line = raw.trim();
    if (!line) continue;
    if (/^excludes\s+/iu.test(line)) { model.settings.excludes = line.replace(/^excludes\s+/iu, ''); continue; }
    if (/^title\s+/iu.test(line)) { model.settings.title = line.replace(/^title\s+/iu, ''); continue; }
    if (/^dateFormat\s+/iu.test(line)) { model.settings.dateFormat = line.replace(/^dateFormat\s+/iu, ''); continue; }
    if (/^section\s+/iu.test(line)) { section = line.replace(/^section\s+/iu, ''); continue; }
    const [taskName, definition = ''] = line.split(/:(.*)/su);
    if (!definition) { model.unsupportedLines.push(raw); continue; }
    const tokens = definition.split(',').map(text);
    const knownStatus = ['done', 'active', 'crit', 'milestone'].includes(tokens[0]) ? tokens.shift() : '';
    const id = tokens.length > 2 && !/^(?:after\s+|\d{4}-\d{2}-\d{2})/u.test(tokens[0]) ? tokens.shift() : '';
    model.rows.push({ section, task: text(taskName), status: knownStatus, id, start: tokens[0] || '', duration: tokens[1] || '' });
  }
  return model;
}

function parseECharts(templateId, source) {
  const option = JSON.parse(source);
  if (Array.isArray(option.title) || Array.isArray(option.xAxis) || Array.isArray(option.yAxis)) throw new Error('unsupported-components');
  const title = text(option?.title?.text);
  if (templateId === 'doughnut-chart') {
    if (option?.series?.length !== 1 || option.series[0]?.type !== 'pie') throw new Error('unsupported-series');
    const data = option?.series?.[0]?.data;
    if (!Array.isArray(data) || data.some(item => !item || typeof item.name !== 'string' || typeof item.value !== 'number')) throw new Error('unsupported-data');
    return { originalOption: option, settings: { title, seriesName: text(option?.series?.[0]?.name) }, rows: data.map(item => ({ originalItem: item, label: text(item.name), value: item.value })) };
  }
  const expectedType = templateId === 'line-chart' ? 'line' : 'bar';
  if (option?.series?.length !== 1 || option.series[0]?.type !== expectedType || option?.xAxis?.type !== 'category') throw new Error('unsupported-series');
  const categories = option?.xAxis?.data || [];
  const values = option?.series?.[0]?.data || [];
  if (!Array.isArray(option?.xAxis?.data) || !Array.isArray(values) || categories.length !== values.length || values.some(value => typeof value !== 'number' || !Number.isFinite(value)) || categories.some(value => typeof value !== 'string' && typeof value !== 'number')) throw new Error('unsupported-data');
  return {
    originalOption: option,
    settings: { title, seriesName: text(option?.series?.[0]?.name), yAxisName: text(option?.yAxis?.name) },
    rows: categories.map((label, index) => ({ label: text(label), value: number(values[index]) }))
  };
}

function parseSankey(source) {
  const lines = String(source).split(/\r?\n/u);
  if (!/^sankey(?:-beta)?\s*$/iu.test(lines[0])) throw new Error('unsupported-header');
  const model = { settings: {}, rows: [], unsupportedLines: [] };
  const field = '("(?:[^"\\r\\n]|"")*"|[^",\\r\\n]*)';
  const record = new RegExp(`^\\s*${field}\\s*,\\s*${field}\\s*,\\s*${field}\\s*$`, 'u');
  const decode = value => value.trim().replace(/^"([\s\S]*)"$/u, '$1').replaceAll('""', '"');
  for (const line of lines.slice(1)) {
    if (!line.trim()) continue;
    const match = line.match(record);
    const from = match && decode(match[1]);
    const to = match && decode(match[2]);
    const rawValue = match && decode(match[3]);
    const value = Number(rawValue);
    if (!match || !from || !to || !rawValue || !Number.isFinite(value) || value < 0) model.unsupportedLines.push(line);
    else model.rows.push({ from, to, value });
  }
  return model;
}

function serializeSankey(model) {
  const quote = value => `"${text(value).replace(/[\r\n]+/gu, ' ').replaceAll('"', '""')}"`;
  return ['sankey-beta', ...model.rows.map(row => `${quote(row.from)},${quote(row.to)},${Number(row.value)}`)].join('\n');
}

export function parseStructuredDiagram(templateId, source) {
  try {
    let model = null;
    if (templateId === 'sequence') model = parseSequence(source);
    else if (templateId === 'sankey') model = parseSankey(source);
    else if (templateId === 'timeline') model = parseTimeline(source);
    else if (templateId === 'state') model = parseState(source);
    else if (templateId === 'pie') model = parsePie(source);
    else if (templateId === 'kanban') model = parseKanban(source);
    else if (templateId === 'mindmap') model = parseMindmap(source);
    else if (templateId === 'gantt') model = parseGantt(source);
    else if (['bar-chart', 'line-chart', 'doughnut-chart'].includes(templateId)) model = parseECharts(templateId, source);
    if (model) return { valid: !model.unsupportedLines?.length, model, unsupportedLines: model.unsupportedLines || [] };
  } catch (error) {
    return { valid: false, error: error instanceof Error ? error.message : String(error) };
  }
  return { valid: false, error: 'unsupported-template' };
}

function serializeSequence(model) {
  const lines = ['sequenceDiagram'];
  if (model.settings.autonumber) lines.push('    autonumber');
  model.rows.forEach((row, index) => {
    if (row.type === 'actor' || row.type === 'participant') {
      const id = safeId(row.from, `P${index + 1}`);
      lines.push(`    ${row.type} ${id} as ${safeMermaidText(row.label || id)}`);
    } else if (row.from && row.to) {
      lines.push(`    ${safeId(row.from, 'A')}${row.type || '->>'}${safeId(row.to, 'B')}: ${safeMermaidText(row.label)}`);
    }
  });
  return lines.join('\n');
}

function serializeTimeline(model) {
  const lines = ['timeline'];
  if (model.settings.title) lines.push(`    title ${safeMermaidText(model.settings.title)}`);
  model.rows.forEach(row => { if (row.period && row.event) lines.push(`    ${safeMermaidText(row.period)} : ${safeMermaidText(row.event)}`); });
  return lines.join('\n');
}

function serializeState(model) {
  const lines = ['stateDiagram-v2'];
  if (model.settings.direction) lines.push(`    direction ${model.settings.direction}`);
  model.rows.forEach(row => {
    if (!row.from || !row.to) return;
    lines.push(`    ${safeMermaidText(row.from)} --> ${safeMermaidText(row.to)}${row.label ? ` : ${safeMermaidText(row.label)}` : ''}`);
  });
  return lines.join('\n');
}

function serializePie(model) {
  const lines = [`pie${model.settings.showData ? ' showData' : ''}`];
  if (model.settings.title) lines.push(`    title ${safeMermaidText(model.settings.title)}`);
  model.rows.forEach(row => { if (row.label && number(row.value) > 0) lines.push(`    "${safeMermaidText(row.label)}" : ${number(row.value)}`); });
  return lines.join('\n');
}

function serializeKanban(model) {
  const lines = ['kanban'];
  const columns = [];
  model.rows.forEach(row => { if (row.column && !columns.includes(row.column)) columns.push(row.column); });
  columns.forEach((column, columnIndex) => {
    lines.push(`  column${columnIndex + 1}[${safeMermaidText(column)}]`);
    model.rows.filter(row => row.column === column && row.task).forEach((row, taskIndex) => lines.push(`    task${columnIndex + 1}_${taskIndex + 1}[${safeMermaidText(row.task)}]`));
  });
  return lines.join('\n');
}

function serializeMindmap(model) {
  const rows = model.rows.filter(row => row.label);
  const lines = ['mindmap'];
  rows.forEach((row, index) => {
    const level = index === 0 ? 0 : Math.max(1, Math.min(5, Number(row.level) || 1));
    const value = index === 0 ? `root((${safeMermaidText(row.label)}))` : safeMermaidText(row.label);
    lines.push(`${'  '.repeat(level + 1)}${value}`);
  });
  return lines.join('\n');
}

function serializeGantt(model) {
  const lines = ['gantt'];
  if (model.settings.title) lines.push(`    title ${safeMermaidText(model.settings.title)}`);
  lines.push(`    dateFormat ${text(model.settings.dateFormat) || 'YYYY-MM-DD'}`);
  if (model.settings.excludes) lines.push(`    excludes ${safeMermaidText(model.settings.excludes)}`);
  let section = '';
  model.rows.forEach((row, index) => {
    if (!row.task) return;
    if (row.section && row.section !== section) { section = row.section; lines.push(`    section ${safeMermaidText(section)}`); }
    const tokens = [row.status, row.id || `task${index + 1}`, row.start, row.duration].filter(Boolean);
    lines.push(`    ${safeMermaidText(row.task)} :${tokens.join(', ')}`);
  });
  return lines.join('\n');
}

function serializeECharts(templateId, model) {
  if (model.originalOption) {
    const option = JSON.parse(JSON.stringify(model.originalOption));
    option.title = { ...(option.title || {}), text: text(model.settings.title) };
    option.series[0].name = text(model.settings.seriesName);
    if (templateId === 'doughnut-chart') {
      option.series[0].data = model.rows.map(row => ({ ...(row.originalItem || {}), name: text(row.label), value: number(row.value) }));
    } else {
      option.xAxis.data = model.rows.map(row => text(row.label));
      option.yAxis = { ...(option.yAxis || {}), name: text(model.settings.yAxisName) };
      option.series[0].data = model.rows.map(row => number(row.value));
    }
    return JSON.stringify(option, null, 2);
  }
  const title = { text: text(model.settings.title), left: 'center' };
  if (templateId === 'doughnut-chart') {
    return JSON.stringify({ __quillite: { height: 460 }, title, tooltip: { trigger: 'item' }, legend: { bottom: 4, left: 'center' }, series: [{ name: text(model.settings.seriesName) || 'Data', type: 'pie', radius: ['38%', '62%'], data: model.rows.filter(row => row.label).map(row => ({ name: text(row.label), value: number(row.value) })) }] }, null, 2);
  }
  const type = templateId === 'line-chart' ? 'line' : 'bar';
  return JSON.stringify({ title, tooltip: { trigger: 'axis' }, xAxis: { type: 'category', boundaryGap: type === 'bar', data: model.rows.map(row => text(row.label)) }, yAxis: { type: 'value', name: text(model.settings.yAxisName) }, series: [{ name: text(model.settings.seriesName), type, data: model.rows.map(row => number(row.value)) }] }, null, 2);
}

export function serializeStructuredDiagram(templateId, model) {
  if (templateId === 'sankey') return serializeSankey(model);
  if (templateId === 'sequence') return serializeSequence(model);
  if (templateId === 'timeline') return serializeTimeline(model);
  if (templateId === 'state') return serializeState(model);
  if (templateId === 'pie') return serializePie(model);
  if (templateId === 'kanban') return serializeKanban(model);
  if (templateId === 'mindmap') return serializeMindmap(model);
  if (templateId === 'gantt') return serializeGantt(model);
  if (['bar-chart', 'line-chart', 'doughnut-chart'].includes(templateId)) return serializeECharts(templateId, model);
  return '';
}

export function structuredDiagramDefinition(templateId, locale = 'zh') {
  const en = locale === 'en';
  const common = { add: en ? 'Add row' : '添加一行', remove: en ? 'Remove' : '删除' };
  if (templateId === 'sankey') return { ...common, settings: [], columns: [{ key: 'from', label: en ? 'Source' : '来源' }, { key: 'to', label: en ? 'Target' : '目标' }, { key: 'value', label: en ? 'Value' : '数值', type: 'number', min: 0 }], empty: { from: 'Source', to: 'Target', value: 10 } };
  if (templateId === 'sequence') return { ...common, settings: [{ key: 'autonumber', label: en ? 'Auto numbering' : '自动编号', type: 'checkbox' }], columns: [{ key: 'type', label: en ? 'Type' : '类型', type: 'select', options: [['participant', en ? 'Participant' : '参与者'], ['actor', en ? 'Actor' : '角色'], ['->>', en ? 'Request →' : '请求实线 →'], ['-->>', en ? 'Response ⇢' : '响应虚线 ⇢'], ['->', en ? 'Open arrow →' : '开放箭头 →'], ['-->', en ? 'Dashed open arrow ⇢' : '开放虚线 ⇢'], ['-)', en ? 'Async →' : '异步消息 →']] }, { key: 'from', label: en ? 'From / ID' : '发起方／标识' }, { key: 'to', label: en ? 'To' : '接收方' }, { key: 'label', label: en ? 'Name / Message' : '名称／消息' }], empty: { type: '->>', from: 'A', to: 'B', label: en ? 'Message' : '消息' } };
  if (templateId === 'gantt') return { ...common, settings: [{ key: 'title', label: en ? 'Title' : '标题' }, { key: 'dateFormat', label: en ? 'Date format' : '日期格式' }, { key: 'excludes', label: en ? 'Excluded days' : '排除日期' }], columns: [{ key: 'section', label: en ? 'Section' : '阶段' }, { key: 'task', label: en ? 'Task' : '任务' }, { key: 'status', label: en ? 'Status' : '状态', type: 'select', options: [['', en ? 'Normal' : '普通'], ['done', en ? 'Done' : '已完成'], ['active', en ? 'Active' : '进行中'], ['crit', en ? 'Critical' : '关键'], ['milestone', en ? 'Milestone' : '里程碑']] }, { key: 'start', label: en ? 'Start / dependency' : '开始／依赖' }, { key: 'duration', label: en ? 'Duration' : '时长' }], empty: { section: en ? 'Phase' : '阶段', task: en ? 'New task' : '新任务', status: '', start: '', duration: '1d' } };
  if (templateId === 'timeline') return { ...common, settings: [{ key: 'title', label: en ? 'Title' : '标题' }], columns: [{ key: 'period', label: en ? 'Time / Stage' : '时间／阶段' }, { key: 'event', label: en ? 'Event' : '事件' }], empty: { period: en ? 'New stage' : '新阶段', event: en ? 'New event' : '新事件' } };
  if (templateId === 'state') return { ...common, settings: [{ key: 'direction', label: en ? 'Direction' : '方向', type: 'select', options: [['', en ? 'Automatic' : '自动'], ['LR', en ? 'Left → right' : '左 → 右'], ['TB', en ? 'Top → bottom' : '上 → 下'], ['RL', en ? 'Right → left' : '右 → 左'], ['BT', en ? 'Bottom → top' : '下 → 上']] }], columns: [{ key: 'from', label: en ? 'From state' : '起始状态' }, { key: 'to', label: en ? 'To state' : '目标状态' }, { key: 'label', label: en ? 'Transition' : '转换条件' }], empty: { from: en ? 'State A' : '状态A', to: en ? 'State B' : '状态B', label: en ? 'Event' : '事件' } };
  if (templateId === 'kanban') return { ...common, settings: [], columns: [{ key: 'column', label: en ? 'Column' : '看板列' }, { key: 'task', label: en ? 'Task card' : '任务卡片' }], empty: { column: en ? 'To do' : '待处理', task: en ? 'New task' : '新任务' } };
  if (templateId === 'mindmap') return { ...common, settings: [], columns: [{ key: 'level', label: en ? 'Level' : '层级', type: 'number', min: 0, max: 5 }, { key: 'label', label: en ? 'Topic' : '主题' }], empty: { level: 1, label: en ? 'New topic' : '新主题' } };
  if (['pie', 'doughnut-chart'].includes(templateId)) return { ...common, settings: [{ key: 'title', label: en ? 'Title' : '标题' }, ...(templateId === 'pie' ? [{ key: 'showData', label: en ? 'Show values' : '显示数值', type: 'checkbox' }] : [{ key: 'seriesName', label: en ? 'Series' : '系列名称' }])], columns: [{ key: 'label', label: en ? 'Category' : '分类' }, { key: 'value', label: en ? 'Value' : '数值', type: 'number', min: 0 }], empty: { label: en ? 'New category' : '新分类', value: 10 } };
  return { ...common, settings: [{ key: 'title', label: en ? 'Title' : '标题' }, { key: 'seriesName', label: en ? 'Series' : '系列名称' }, { key: 'yAxisName', label: en ? 'Y-axis' : '纵轴名称' }], columns: [{ key: 'label', label: en ? 'Category' : '分类' }, { key: 'value', label: en ? 'Value' : '数值', type: 'number' }], empty: { label: en ? 'New category' : '新分类', value: 0 } };
}
