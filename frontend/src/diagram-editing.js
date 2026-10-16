import { DIAGRAM_TEMPLATES, diagramTemplateById } from './diagram-templates.js';
import { sourceLines } from './source-lines.js';

function diagramKeyword(source) {
  const start = String(source).replace(/^\s*---\r?\n[\s\S]*?\r?\n---\s*\r?\n/u, '').replace(/^\s*%%[^\n]*(?:\n|$)/gmu, '').trimStart();
  return start.match(/^[\w-]+/u)?.[0]?.toLowerCase();
}

// Display names do not change the editor/template identity or source.
export function diagramDisplayName(source, engine = 'mermaid', locale = 'zh') {
  const names = {
    c4context: ['C4 系统上下文图', 'C4 context'],
    c4container: ['C4 容器图', 'C4 container'],
    c4component: ['C4 组件图', 'C4 component'],
    c4dynamic: ['C4 动态图', 'C4 dynamic'],
    c4deployment: ['C4 部署图', 'C4 deployment'],
  };
  const c4 = engine === 'mermaid' && names[diagramKeyword(source)];
  return c4 ? c4[locale === 'en' ? 1 : 0] : diagramTemplateById(identifyDiagramTemplate(source, engine)).name[locale === 'en' ? 'en' : 'zh'];
}

export function identifyDiagramTemplate(source, engine = 'mermaid') {
  if (engine === 'echarts') {
    try {
      const option = JSON.parse(source);
      const series = option.series;
      if (option.__quillite?.dataEditor === 'histogram') return 'histogram-chart';
      if (option.__quillite?.dataEditor === 'percent') return 'percent-bar-chart';
      if (Array.isArray(series) && series.length > 1 && series.every(item => ['bar', 'line'].includes(item?.type))) {
        if (option.yAxis?.type === 'category') return 'diverging-bar-chart';
        if (series.some(item => item.type === 'bar') && series.some(item => item.type === 'line')) return 'combo-chart';
        if (series.every(item => item.type === 'bar')) return series.every(item => item.stack) ? 'stacked-bar-chart' : 'bar-chart';
        return series.some(item => item.areaStyle) ? 'area-chart' : 'line-chart';
      }
      if (Array.isArray(series) && series.length === 1) {
        const item = series[0];
        if (item.type === 'heatmap' && item.coordinateSystem === 'calendar') return 'calendar-chart';
        if (item.type === 'bar' && option.yAxis?.type === 'category') return 'horizontal-bar-chart';
        if (item.type === 'bar') return 'bar-chart';
        if (item.type === 'line') return item.areaStyle ? 'area-chart' : 'line-chart';
        if (item.type === 'pie' && Array.isArray(item.radius)) return 'doughnut-chart';
        const ids = { scatter: 'scatter-chart', funnel: 'funnel-chart', heatmap: 'heatmap-chart', boxplot: 'boxplot-chart', gauge: 'gauge-chart', wordCloud: 'word-cloud' };
        if (ids[item.type]) return ids[item.type];
      }
    } catch { /* Invalid JSON still needs a source-editing entry point. */ }
    return 'source-echarts';
  }
  const keyword = diagramKeyword(source);
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
  for (const rawLine of sourceLines(text)) {
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

// Retain each existing container prefix, including compact quotes and tabs.
// New lines use a continuation prefix; unchanged suffix lines keep their own
// prefix even when preceding lines have been inserted or removed.
export function projectedDiagramReplacement(range, source) {
  const markdown=diagramReplacementMarkdown(range,source);
  if(!range.projectionPrefixes)return markdown.replace(/\r?\n/g,newline=>newline+(range.projectionPrefix||''));
  const oldLines=String(range.source).split(/\r?\n/),newLines=String(source).split(/\r?\n/);
  const prefixes=range.projectionPrefixes,lines=markdown.split(/\r?\n/);
  let start=0,end=0;
  while(start<oldLines.length&&start<newLines.length&&oldLines[start]===newLines[start])start++;
  while(end<oldLines.length-start&&end<newLines.length-start&&oldLines.at(-1-end)===newLines.at(-1-end))end++;
  const fallback=(range.projectionPrefix||'').replace(/>$/, '> ');
  return lines.map((line,i)=>{
    if(!i)return line;
    if(i===lines.length-1)return prefixes.at(-1)+line;
    const row=i-1,oldRow=row>=newLines.length-end?oldLines.length-(newLines.length-row):row;
    const exists=row<start||row>=newLines.length-end||row-start<oldLines.length-start-end;
    let prefix=exists?prefixes[oldRow+1]:fallback;
    if(prefix.endsWith('>')&&/^[\t ]/.test(line))prefix+=' ';
    return prefix+line;
  }).join(range.lineEnding==='\r\n'?'\r\n':'\n');
}
