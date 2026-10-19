import { histogram, percentageColumns } from './chart-data-editor.js';

const translated = (zh, en) => ({ zh, en });
const entry = (id, zh, en, hint, hintEn, build) => ({
  id, category: 'data', engine: 'echarts', visualEditor: 'structured',
  name: translated(zh, en), description: translated(hint, hintEn),
  source: { zh: JSON.stringify(build(false), null, 2), en: JSON.stringify(build(true), null, 2) }
});
export const ADDITIONAL_CHART_TEMPLATES = [
  entry('histogram-chart', '直方图', 'Histogram', '展示样本分布：输入原始样本并设置分箱数；区间左闭右开，最后一箱含最大值。', 'Show a distribution: enter observations and choose bins; intervals include the lower bound, and the last bin includes the maximum.', en => {
    const samples = [12, 15, 18, 18, 21, 24, 25, 28, 31, 36, 42, 48];
    const bins = 6, computed = histogram(samples, bins);
    return { __quillite: { dataEditor: 'histogram', samples, bins }, title: { text: en ? 'Reading duration distribution' : '阅读时长分布', left: 'center' }, tooltip: { trigger: 'axis' }, xAxis: { type: 'category', name: en ? 'Reading duration (minutes)' : '阅读时长（分钟）', nameLocation: 'middle', nameGap: 32, data: computed.labels }, yAxis: { type: 'value', minInterval: 1, name: en ? 'Frequency' : '频数' }, series: [{ type: 'bar', barCategoryGap: '0%', data: computed.values }] };
  }),
  entry('percent-bar-chart', '百分比堆叠图', '100% stacked bar', '填写非负原始数值，按分类归一为 100%；合计为零时显示为零。', 'Enter nonnegative raw values; each category totals 100%. Zero totals remain zero.', en => {
    const rawColumns = [[40, 20, 30], [20, 40, 10], [40, 40, 60]], data = percentageColumns(rawColumns);
    return { __quillite: { dataEditor: 'percent', rawColumns }, title: { text: en ? 'Category composition' : '分类构成比例', left: 'center' }, tooltip: { trigger: 'axis' }, legend: { top: 30 }, xAxis: { type: 'category', data: en ? ['Jan', 'Feb', 'Mar'] : ['一月', '二月', '三月'] }, yAxis: { type: 'value', min: 0, max: 100, axisLabel: { formatter: '{value}%' } }, series: data.map((values, i) => ({ name: `${en ? 'Series' : '系列'} ${i + 1}`, type: 'bar', stack: 'percent', data: values })) };
  }),
  entry('horizontal-bar-chart', '横向排名图', 'Horizontal ranking', '适合长名称；按数值从高到低填入各行，第一行显示在顶部。', 'For long labels. Enter rows from highest to lowest; the first row appears at the top.', en => ({ title: { text: en ? 'Reading ranking' : '阅读排名', left: 'center' }, tooltip: { trigger: 'axis' }, xAxis: { type: 'value' }, yAxis: { type: 'category', inverse: true, data: en ? ['Technical guides', 'Project notes', 'Meeting records'] : ['技术文档与操作指南', '项目方案与学习笔记', '会议纪要'] }, series: [{ name: en ? 'Reads' : '阅读次数', type: 'bar', data: [120, 86, 42] }] })),
  entry('calendar-chart', '日历热力图', 'Calendar heatmap', '按日期展示非负数值；日期不可重复，范围不超过 366 天。', 'Nonnegative values by date. Dates must be unique and span at most 366 days.', en => ({ __quillite: { height: 360 }, title: { text: en ? 'Daily activity' : '每日活跃记录', left: 'center' }, tooltip: { trigger: 'item' }, visualMap: { min: 0, max: 10, orient: 'horizontal', left: 'center', bottom: 8 }, calendar: { top: 85, left: 55, right: 35, cellSize: ['auto', 24], range: ['2026-01-01', '2026-03-31'], yearLabel: { show: false }, dayLabel: { nameMap: en ? 'en' : 'cn' }, monthLabel: { nameMap: en ? 'en' : 'cn' } }, series: [{ type: 'heatmap', coordinateSystem: 'calendar', data: [['2026-01-01', 3], ['2026-01-12', 7], ['2026-02-02', 10], ['2026-02-20', 5], ['2026-03-31', 8]] }] }))
];
