import { DIAGRAM_TEMPLATES } from './diagram-templates.js';

export function identifyDiagramTemplate(source, engine = 'mermaid') {
  if (engine === 'echarts') {
    try {
      const option = JSON.parse(source);
      const series = option.series;
      if (Array.isArray(series) && series.length === 1) {
        const item = series[0];
        if (item.type === 'bar') return 'bar-chart';
        if (item.type === 'line') return item.areaStyle ? 'area-chart' : 'line-chart';
        if (item.type === 'pie' && Array.isArray(item.radius)) return 'doughnut-chart';
        const ids = { scatter: 'scatter-chart', funnel: 'funnel-chart', heatmap: 'heatmap-chart', boxplot: 'boxplot-chart', gauge: 'gauge-chart', wordCloud: 'word-cloud' };
        if (ids[item.type]) return ids[item.type];
      }
    } catch { /* Invalid JSON still needs a source-editing entry point. */ }
    return 'source-echarts';
  }
  const start = String(source).replace(/^\s*---\r?\n[\s\S]*?\r?\n---\s*\r?\n/u, '').replace(/^\s*%%[^\n]*(?:\n|$)/gmu, '').trimStart();
  const keyword = start.match(/^[\w-]+/u)?.[0]?.toLowerCase();
  if (keyword === 'graph') return 'flowchart';
  if (keyword === 'sankey') return 'sankey';
  if (keyword === 'statediagram') return 'state';
  if (keyword?.startsWith('c4')) return 'c4';
  return DIAGRAM_TEMPLATES.find(template => template.engine !== 'echarts' && template.source.zh.match(/^[\w-]+/u)?.[0]?.toLowerCase() === keyword)?.id || 'source-mermaid';
}

// Track all fences, including ordinary code examples, so nested Mermaid text
// inside a longer code fence is never treated as an editable diagram.
export function findEditableDiagramFenceAt(source, position) {
  const text = String(source || '');
  const target = Math.max(0, Math.min(text.length, Number(position) || 0));
  let offset = 0;
  let opening = null;
  for (const rawLine of text.match(/.*(?:\r\n|\n|$)/gu) || []) {
    if (!rawLine) continue;
    const line = rawLine.replace(/\r?\n$/u, '');
    const lineEnd = offset + line.length;
    if (!opening) {
      const match = line.match(/^([ \t]*)(`{3,}|~{3,})([^\r\n]*)$/u);
      if (match) opening = { from: offset, contentFrom: offset + rawLine.length, indent: match[1], marker: match[2], language: match[3].trim(), engine: match[3].trim().toLowerCase() };
    } else {
      const closing = line.match(/^[ \t]*(`{3,}|~{3,})[ \t]*$/u);
      if (closing && closing[1][0] === opening.marker[0] && closing[1].length >= opening.marker.length) {
        if (target >= opening.from && target <= lineEnd && ['mermaid', 'echarts'].includes(opening.engine)) {
          const content = text.slice(opening.contentFrom, offset).replace(/\r?\n$/u, '');
          const normalized = content.split(/\r?\n/u).map(line => line.startsWith(opening.indent) ? line.slice(opening.indent.length) : line).join('\n');
          return { ...opening, to: lineEnd, source: normalized, original: text.slice(opening.from, lineEnd), templateId: identifyDiagramTemplate(normalized, opening.engine), lineEnding: rawLine.endsWith('\r\n') || text.slice(opening.from, opening.contentFrom).endsWith('\r\n') ? '\r\n' : '\n' };
        }
        opening = null;
      }
    }
    offset += rawLine.length;
  }
  return null;
}

export function diagramReplacementMarkdown(range, source) {
  const indent = range.indent || '';
  let marker = range.marker || '```';
  // A source edit may itself contain a fence; keep the outer fence longer.
  for (const line of String(source).split(/\r?\n/u)) {
    const fence = line.trim().match(/^(`+|~+)$/u)?.[0];
    if (fence?.[0] === marker[0] && fence.length >= marker.length) marker = marker[0].repeat(fence.length + 1);
  }
  const ending = range.lineEnding === '\r\n' ? '\r\n' : '\n';
  const body = String(source).split(/\r?\n/u).map(line => indent + line).join(ending);
  return `${indent}${marker}${range.language || range.engine || 'mermaid'}${ending}${body}${ending}${indent}${marker}`;
}
