import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { DIAGRAM_CATEGORIES, DIAGRAM_TEMPLATES, diagramTemplateSource, diagramTemplatesForCategory } from '../src/diagram-templates.js';

const renderer = await readFile(new URL('../src/renderer.js', import.meta.url), 'utf8');
const diagramModule = await readFile(new URL('../src/mermaid-diagrams.js', import.meta.url), 'utf8');
const echartsModule = await readFile(new URL('../src/echarts-diagrams.js', import.meta.url), 'utf8');
const index = await readFile(new URL('../index.html', import.meta.url), 'utf8');
const packageFile = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'));
const styles = await readFile(new URL('../src/styles.css', import.meta.url), 'utf8');
const auditPage = await readFile(new URL('./diagram-audit.html', import.meta.url), 'utf8');
const auditScript = await readFile(new URL('./diagram-audit.js', import.meta.url), 'utf8');
const echartsExamples = await readFile(new URL('../../docs/ECharts-数据图表案例.md', import.meta.url), 'utf8');

test('Typora-style Mermaid fences render as diagrams instead of highlighted code', () => {
  assert.match(renderer, /normalizedLanguage === 'mermaid'/);
  assert.match(renderer, /class="mermaid-diagram"/);
  assert.match(renderer, /renderMermaidDiagrams\(container/);
  assert.match(diagramModule, /securityLevel:\s*'strict'/);
  assert.match(diagramModule, /startOnLoad:\s*false/);
  assert.doesNotMatch(index, /src="\/vendor\/mermaid\.min\.js"/);
  assert.match(diagramModule, /window\.mermaid/);
  assert.match(diagramModule, /script\.src\s*=\s*'\/vendor\/mermaid\.min\.js'/);
  assert.doesNotMatch(diagramModule, /import mermaid from 'mermaid'/);
  assert.match(packageFile.scripts.build, /prepare:mermaid/);
});

test('editor offers one localized diagram builder with the full common Mermaid catalog', () => {
  assert.match(index, /data-format-command="diagram-builder"/);
  assert.match(index, /data-format-command="diagram-builder" data-i18n="diagramBuilder">图表生成器 🔥<\/button>/);
  assert.match(renderer, /diagramBuilder: '图表生成器 🔥'/);
  assert.match(index, /id="diagramDialog"/);
  assert.match(index, /id="openDiagramGuide"[^>]+formula-guide-link/);
  assert.match(index, /data-i18n="diagramGuide">查看图表教程 ↗/);
  assert.match(index, /id="diagramSource"/);
  assert.match(index, /id="diagramPreview"/);
  assert.match(renderer, /openDiagramDialog/);
  assert.match(renderer, /DIAGRAM_GUIDE_URL = 'https:\/\/qm\.ssssa\.cn\/guides\/diagrams\/'/);
  assert.match(renderer, /openDiagramGuide/);
  assert.match(renderer, /diagram-guide\.open/);
  assert.match(renderer, /renderMermaidDiagrams\(els\.diagramPreview/);
  assert.match(styles, /\.diagram-dialog[^}]+calc\(100vw - 32px\)[^}]+calc\(100vh - 24px\)/s);
  assert.match(styles, /#diagramBuilderPanel[^}]+grid-template-columns:\s*minmax\(340px,[^}]+minmax\(460px/s);
  assert.match(styles, /\.diagram-source-card textarea[^}]+height:\s*100%[^}]+resize:\s*none/s);
  assert.equal(DIAGRAM_TEMPLATES.length, 37);
  assert.equal(new Set(DIAGRAM_TEMPLATES.map(template => template.id)).size, DIAGRAM_TEMPLATES.length);
  for (const template of DIAGRAM_TEMPLATES) {
    assert.ok(DIAGRAM_CATEGORIES.some(category => category.id === template.category));
    assert.ok(template.name.zh && template.name.en && template.description.zh && template.description.en);
    assert.ok(diagramTemplateSource(template, 'zh').trim());
    assert.ok(diagramTemplateSource(template, 'en').trim());
  }
  assert.equal(diagramTemplatesForCategory('all').length, 37);
  assert.match(renderer, /template\.engine === 'echarts' \? 'echarts' : 'mermaid'/);
  assert.ok(renderer.includes("template.engine === 'echarts' ? 'echarts' : 'mermaid'"));
});

test('ECharts catalog supplies all requested data visualizations and an offline SVG export path', () => {
  const echartsTemplates = DIAGRAM_TEMPLATES.filter(template => template.engine === 'echarts');
  assert.equal(echartsTemplates.length, 15);
  for (const id of ['bar-chart', 'line-chart', 'stacked-bar-chart', 'area-chart', 'scatter-chart', 'diverging-bar-chart', 'combo-chart', 'funnel-chart', 'heatmap-chart', 'boxplot-chart', 'bubble-chart', 'gauge-chart', 'doughnut-chart', 'waterfall-chart', 'word-cloud']) {
    assert.ok(echartsTemplates.some(template => template.id === id), `missing ${id}`);
  }
  for (const template of echartsTemplates) {
    for (const locale of ['zh', 'en']) {
      const option = JSON.parse(diagramTemplateSource(template, locale));
      assert.ok(Array.isArray(option.series) && option.series.length > 0, `${template.id}/${locale} has no series`);
    }
  }
  assert.match(renderer, /normalizedLanguage === 'echarts'/);
  assert.match(renderer, /renderEChartsDiagrams\(container/);
  assert.match(renderer, /convertEChartsDiagramsToImages\(clone/);
  assert.match(echartsModule, /renderer:\s*'svg'/);
  assert.match(echartsModule, /import 'echarts-wordcloud'/);
  assert.match(echartsModule, /svgToPNGDataURL/);
  assert.match(echartsModule, /const PAPER_EXPORT_THEME = Object\.freeze/);
  assert.match(echartsModule, /prepareOption\(parsed, PAPER_EXPORT_THEME\)/);
  assert.match(echartsModule, /Math\.max\(1000, Math\.min\(1800/);
  assert.match(echartsModule, /requestAnimationFrame\(\(\) => requestAnimationFrame/);
  assert.match(echartsModule, /svgToPNGDataURL\([\s\S]+PAPER_EXPORT_THEME\.paper,[\s\S]+\{ width, height \}/);
  assert.match(diagramModule, /requestedSize = null/);
  assert.match(diagramModule, /clone\.setAttribute\('viewBox', `0 0 \$\{sourceWidth\} \$\{sourceHeight\}`\)/);
  assert.match(diagramModule, /context\.fillRect\(0, 0, width, height\)/);
  assert.match(echartsModule, /visualMap\.itemWidth\s*=\s*visualMap\.itemWidth\s*\|\|\s*12/);
  assert.match(echartsModule, /const HEATMAP_PALETTE = \['#C9E3F1', '#86C8C0', '#F3E39A', '#EEA06F', '#D85E63'\]/);
  assert.match(echartsModule, /visualMap\.itemHeight\s*=\s*visualMap\.itemHeight\s*\|\|\s*180/);
  assert.match(echartsModule, /visualMap\.calculable\s*=\s*true/);
  assert.match(echartsModule, /visualMap\.handleSize\s*=\s*visualMap\.handleSize\s*\|\|\s*'85%'/);
  assert.match(echartsModule, /visualMap\.indicatorStyle\s*=\s*\{/);
  assert.match(echartsModule, /visualMap\.text\s*=\s*visualMap\.text\s*\|\|\s*\[String\(visualMap\.max/);
  assert.match(echartsModule, /item\.type === 'heatmap'/);
  assert.match(echartsModule, /item\.type === 'boxplot'/);
  assert.match(echartsModule, /color:\s*dark\s*\?\s*'#294254'\s*:\s*'#D8EAF7'/);
  assert.match(echartsModule, /borderColor:\s*dark\s*\?\s*'#79A9D1'\s*:\s*'#2878B5'/);
  assert.match(echartsModule, /const gaugeText = dark \? '#FFFFFF' : text/);
  assert.match(echartsModule, /item\.axisLabel = \{ \.\.\.normalTextStyle\(item\.axisLabel, gaugeText/);
  assert.match(echartsModule, /item\.title = \{ \.\.\.normalTextStyle\(item\.title, gaugeText/);
  assert.match(styles, /\.echarts-diagram/);
  assert.match(styles, /\.echarts-diagram svg\s*\{[^}]*stroke:\s*none[^}]*stroke-width:\s*0/s);
  assert.match(styles, /\.echarts-diagram svg text[^}]*stroke:\s*none\s*!important/s);
});

test('ECharts example document contains 15 complete and valid runnable chart cases', () => {
  const sources = [...echartsExamples.matchAll(/```echarts\s*\n([\s\S]*?)\n```/gu)].map(match => match[1]);
  assert.equal(sources.length, 15);
  for (const [index, source] of sources.entries()) {
    const option = JSON.parse(source);
    assert.ok(Array.isArray(option.series), `case ${index + 1} should contain series`);
    assert.ok(option.series.length > 0, `case ${index + 1} should contain at least one series`);
  }
  const types = new Set(sources.flatMap(source => JSON.parse(source).series.map(series => series.type)));
  for (const type of ['bar', 'line', 'scatter', 'funnel', 'heatmap', 'boxplot', 'gauge', 'pie', 'wordCloud']) {
    assert.ok(types.has(type), `example document should cover ${type}`);
  }
});

test('Mermaid diagrams use safe SVG labels, avoid stale rendering work, and export as embedded images', () => {
  assert.match(styles, /\.mermaid-diagram svg[^}]+max-width:\s*none/s);
  assert.match(styles, /data-mermaid-type="gantt"/);
  assert.match(styles, /data-mermaid-type="gantt"[^}]+1480px[^}]+min-height:\s*260px/s);
  assert.match(diagramModule, /gantt:\s*\{[^}]+fontSize:\s*16[^}]+sectionFontSize:\s*15[^}]+barHeight:\s*28/s);
  assert.match(diagramModule, /type === 'gantt' \? 14 : 12/);
  assert.match(diagramModule, /function mermaidColor\(/);
  assert.match(diagramModule, /getImageData\(0, 0, 1, 1\)/);
  assert.match(diagramModule, /color\('--accent-soft'/);
  assert.doesNotMatch(diagramModule, /primaryColor:\s*value\('--accent-soft'/);
  assert.match(diagramModule, /htmlLabels:\s*false/);
  assert.match(diagramModule, /function normalizeSVGTypography\(svg, type = ''\)/);
  assert.match(diagramModule, /const PIE_COLORS = \[/);
  for (const color of ['#4E79A7', '#F28E2B', '#E15759', '#76B7B2', '#59A14F', '#EDC948']) {
    assert.match(diagramModule, new RegExp(color));
  }
  assert.match(diagramModule, /const pieColors = dark \? DARK_PIE_COLORS : PIE_COLORS/);
  assert.match(diagramModule, /Object\.fromEntries\(pieColors\.map/);
  assert.match(diagramModule, /pieSectionTextColor:/);
  assert.match(diagramModule, /Math\.max\(minimumSize, Math\.min\(maximumSize, size\)\)/);
  assert.match(diagramModule, /!type\.startsWith\('c4'\)/);
  assert.match(diagramModule, /c4ShapeMargin:\s*120/);
  assert.match(diagramModule, /c4ShapeInRow:\s*3/);
  assert.match(diagramModule, /c4:\s*\{[^}]+useMaxWidth:\s*false/s);
  assert.match(diagramModule, /normalizeSVGTypography\(element\.querySelector\('svg'\), element\.dataset\.mermaidType\)/);
  assert.match(diagramModule, /function normalizeERDiagram\(svg\)/);
  assert.match(diagramModule, /type === 'erdiagram'/);
  assert.match(diagramModule, /\.relationshipLabelBox, \.edgeLabel rect, rect\.labelBkg/);
  assert.match(diagramModule, /label\.style\.setProperty\('fill', text, 'important'\)/);
  assert.match(diagramModule, /edgeLabelBackground:/);
  assert.match(diagramModule, /relationLabelColor:/);
  assert.match(diagramModule, /function normalizeC4Diagram\(svg\)/);
  assert.match(diagramModule, /type\.startsWith\('c4'\)/);
  assert.match(diagramModule, /label\.textContent = `«\$\{match\[1\]\}»`/);
  assert.match(diagramModule, /label\.removeAttribute\('textLength'\)/);
  assert.match(diagramModule, /label\.setAttribute\('text-anchor', 'middle'\)/);
  assert.match(diagramModule, /label\.style\.stroke\s*=\s*'none'/);
  assert.match(diagramModule, /function normalizeRequirementDiagram\(svg\)/);
  assert.match(diagramModule, /type === 'requirementdiagram'/);
  assert.match(diagramModule, /\.reqLabelBox, \.edgeLabel rect, rect\.labelBkg/);
  assert.match(diagramModule, /label\.textContent = `«\$\{match\[1\]\}»`/);
  assert.match(diagramModule, /label\.style\.fontWeight\s*=\s*'400'/);
  assert.match(diagramModule, /function normalizeXYChart\(svg\)/);
  assert.match(diagramModule, /\.left-axis > \.title > text/);
  assert.match(diagramModule, /translate\(-18,/);
  assert.match(diagramModule, /function expandSVGViewBox\(svg, padding = 10\)/);
  assert.match(diagramModule, /svg\.getBBox\(\)/);
  assert.match(diagramModule, /svg\.setAttribute\('viewBox'/);
  assert.match(diagramModule, /function normalizeJourneyDiagram\(svg\)/);
  assert.match(diagramModule, /type === 'journey'/);
  assert.match(diagramModule, /text\.journey-section/);
  assert.match(diagramModule, /function normalizeTreemapDiagram\(svg\)/);
  assert.match(diagramModule, /type === 'treemap-beta'/);
  assert.match(diagramModule, /\.treemapLeaf/);
  assert.match(diagramModule, /function normalizeMindmapDiagram\(svg\)/);
  assert.match(diagramModule, /type === 'mindmap'/);
  assert.match(diagramModule, /\.mindmapDiagram \.edge/);
  assert.match(diagramModule, /function normalizeSankeyDiagram\(svg\)/);
  assert.match(diagramModule, /type === 'sankey-beta'/);
  assert.match(diagramModule, /mix-blend-mode', 'normal'/);
  assert.match(diagramModule, /function normalizeEdgeLabelBackgrounds\(svg\)/);
  assert.match(diagramModule, /\.edgeLabel rect\.background/);
  assert.match(diagramModule, /box\.style\.setProperty\('stroke', 'none', 'important'\)/);
  assert.match(styles, /data-mermaid-type="c4context"[^}]+1400px/);
  assert.match(styles, /\.mermaid-diagram svg text[^}]+font-weight:\s*400\s*!important[^}]+stroke:\s*none\s*!important/s);
  assert.match(diagramModule, /FORBID_TAGS:\s*\[[^\]]*'foreignObject'/);
  assert.match(diagramModule, /renderGenerations\.get\(container\)\s*===\s*generation/);
  assert.match(diagramModule, /setTimeout\(resolve, 0\)/);
  assert.match(renderer, /previewDelay[^\n]+mermaid\|echarts[^\n]+\?\s*220\s*:\s*90/);
  assert.match(diagramModule, /convertMermaidDiagramsToImages/);
  assert.match(diagramModule, /canvas\.toDataURL\('image\/png'\)/);
  assert.match(diagramModule, /data:image\/svg\+xml;base64/);
  assert.doesNotMatch(diagramModule, /URL\.createObjectURL/);
  assert.doesNotMatch(diagramModule, /Unable to prepare Mermaid diagram for export/);
  assert.match(renderer, /await convertMermaidDiagramsToImages\(clone/);
});

test('live preview reuses unchanged Mermaid SVGs so editing does not jump to an earlier diagram', () => {
  assert.match(renderer, /root\.dataset\.colorMode[^\n]+root\.dataset\.accent/);
  assert.match(renderer, /function reusableMermaidDiagrams\(container, themeKey\)/);
  assert.match(renderer, /\.mermaid-diagram\[data-mermaid-rendered="true"\]/);
  assert.match(renderer, /diagram\.dataset\.mermaidUiTheme !== themeKey/);
  assert.match(renderer, /function restoreReusableMermaidDiagrams\(container, reusable, themeKey\)/);
  assert.match(renderer, /matches\?\.shift\(\)/);
  assert.match(renderer, /restoreReusableMermaidDiagrams\(container, reusableMermaid, mermaidThemeKey\)/);
  assert.match(renderer, /const mermaidRender = renderMarkdownTo\(els\.editorPreview/);
  assert.match(renderer, /Promise\.resolve\(mermaidRender\)\.then/);
  assert.match(renderer, /generation !== renderEditorPreview\.generation/);
  assert.match(renderer, /requestAnimationFrame\(\(\) => requestAnimationFrame/);
  assert.match(renderer, /scrollPreviewToCursor\(true, 'auto'\)/);
});

test('appearance changes rebuild Mermaid and ECharts with explicit dark-mode colours', () => {
  assert.match(renderer, /function refreshDiagramAppearance\(\)/);
  assert.match(renderer, /refreshMermaidDiagrams\(container/);
  assert.match(renderer, /refreshEChartsDiagrams\(container/);
  assert.match(renderer, /setAccentTheme[\s\S]+refreshDiagramAppearance\(\)/);
  assert.match(renderer, /setColorMode[\s\S]+refreshDiagramAppearance\(\)/);
  assert.match(diagramModule, /name:\s*'base'/);
  assert.match(diagramModule, /darkMode:\s*dark/);
  assert.match(diagramModule, /C4 keeps fixed #444 relationship colours/);
  assert.match(diagramModule, /marker\.style\.setProperty\('fill', dark \? muted/);
  assert.match(diagramModule, /export async function refreshMermaidDiagrams/);
  assert.match(echartsModule, /option\.darkMode\s*=\s*dark/);
  assert.match(echartsModule, /const palette\s*=\s*dark\s*\?\s*DARK_CHART_PALETTE\s*:\s*CHART_PALETTE/);
  assert.match(echartsModule, /dark[\s\S]+grid:\s*'#6C7972'[\s\S]+grid:\s*'#A5B0A9'/);
  assert.match(echartsModule, /\['xAxis', 'yAxis', 'angleAxis', 'radiusAxis', 'singleAxis', 'parallelAxis'\]/);
  assert.match(echartsModule, /minorSplitLine[\s\S]+color:\s*minorGridLine/);
  assert.match(echartsModule, /normalizeGuideLines\(series, text, structure\.guide\)/);
  assert.match(echartsModule, /show:\s*true,[\s\S]+type:\s*'dashed'[\s\S]+opacity:\s*1/);
  assert.match(echartsModule, /backgroundColor:\s*paper/);
  assert.match(echartsModule, /export async function refreshEChartsDiagrams/);
  assert.match(styles, /data-color-mode="dark"[^}]+\.mermaid-diagram/s);
});

test('real-render audit covers every localized template and the PNG export path', () => {
  assert.match(auditPage, /id="summary"/);
  assert.match(auditPage, /id="charts"/);
  assert.match(auditScript, /for \(const locale of \['zh', 'en'\]\)/);
  assert.match(auditScript, /for \(const template of DIAGRAM_TEMPLATES\)/);
  assert.match(auditScript, /function auditSVG\(svg, source = ''\)/);
  assert.match(auditScript, /文字超出画布/);
  assert.match(auditScript, /虚线或辅助线对比度不足/);
  assert.match(auditScript, /文字重叠/);
  assert.match(auditScript, /旅程阶段文字与背景同色/);
  assert.match(auditScript, /连线备注仍有可见边框/);
  assert.match(auditScript, /convertMermaidDiagramsToImages\(exportRoot/);
  assert.match(auditScript, /convertEChartsDiagramsToImages\(exportRoot/);
  assert.match(auditScript, /data:image\/png;base64/);
  assert.match(auditScript, /window\.__diagramExportAuditReport/);
});
