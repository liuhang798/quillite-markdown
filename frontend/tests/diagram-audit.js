import { DIAGRAM_TEMPLATES, diagramTemplateSource } from '../src/diagram-templates.js';
import { convertMermaidDiagramsToImages, renderMermaidDiagrams } from '../src/mermaid-diagrams.js';
import { convertEChartsDiagramsToImages, renderEChartsDiagrams } from '../src/echarts-diagrams.js';

const search = new URLSearchParams(location.search);
const colorMode = search.get('mode') === 'dark' ? 'dark' : 'light';
const CARTESIAN_GRID_TEMPLATES = new Set([
  'bar-chart', 'line-chart', 'stacked-bar-chart', 'area-chart',
  'scatter-chart', 'diverging-bar-chart', 'combo-chart', 'heatmap-chart',
  'boxplot-chart', 'bubble-chart', 'waterfall-chart'
]);
document.documentElement.dataset.colorMode = colorMode;
const modeAuditLink = document.querySelector('#modeAuditLink');
const exportAuditLink = document.querySelector('#exportAuditLink');
modeAuditLink.textContent = colorMode === 'dark' ? '日间审计' : '夜间审计';
modeAuditLink.href = `?mode=${colorMode === 'dark' ? 'light' : 'dark'}`;
exportAuditLink.href = `?mode=${colorMode}&export=1`;

const charts = document.querySelector('#charts');
const summary = document.querySelector('#summary');

const READABILITY_FIXTURES = [{
  id: 'wide-flowchart-readability',
  source: `flowchart LR
    A["Application_Start"] --> B["Pilot 初始化"]
    B --> C["获取 UnityContainer"]
    C --> D["替换 IHttpControllerActivator"]
    D --> E["设置 Pilot ActionFilterFactory"]
    E --> F["RegisterWebapi"]
    F --> G["扫描 IRepository<T> 并注册 Repository"]
    F --> H["扫描 IBusinessService 并注册 Service"]
    F --> I["加载 CarControllers 与 IStartup"]`
}];

function encoded(source) {
  return encodeURIComponent(source);
}

for (const locale of ['zh', 'en']) {
  for (const template of DIAGRAM_TEMPLATES) {
    const source = diagramTemplateSource(template, locale);
    const card = document.createElement('article');
    card.className = 'audit-card';
    card.dataset.template = template.id;
    card.dataset.locale = locale;
    const engine = template.engine === 'echarts' ? 'echarts' : 'mermaid';
    card.dataset.engine = engine;
    card.innerHTML = `<h2>${template.id} · ${locale} · ${engine}</h2><div class="${engine}-diagram" data-${engine}-source="${encoded(source)}"><div class="${engine}-loading">${engine}</div></div><details><summary>源码</summary><pre></pre></details>`;
    card.querySelector('pre').textContent = source;
    charts.appendChild(card);
  }
}

for (const fixture of READABILITY_FIXTURES) {
  const card = document.createElement('article');
  card.className = 'audit-card';
  card.dataset.template = fixture.id;
  card.dataset.locale = 'zh';
  card.dataset.engine = 'mermaid';
  card.innerHTML = `<h2>${fixture.id} · zh · mermaid</h2><div class="mermaid-diagram" data-mermaid-source="${encoded(fixture.source)}"><div class="mermaid-loading">mermaid</div></div><details><summary>源码</summary><pre></pre></details>`;
  card.querySelector('pre').textContent = fixture.source;
  charts.appendChild(card);
}

function intersectionRatio(a, b) {
  const width = Math.max(0, Math.min(a.right, b.right) - Math.max(a.left, b.left));
  const height = Math.max(0, Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top));
  const area = width * height;
  return area / Math.max(1, Math.min(a.width * a.height, b.width * b.height));
}

function auditSVG(svg, source = '') {
  const issues = [];
  const bounds = svg.getBoundingClientRect();
  const texts = [...svg.querySelectorAll('text')].filter(node => node.textContent.trim() && node.getBoundingClientRect().width > 1);
  for (const text of texts) {
    const box = text.getBoundingClientRect();
    if (box.left < bounds.left - 1 || box.top < bounds.top - 1 || box.right > bounds.right + 1 || box.bottom > bounds.bottom + 1) {
      issues.push(`文字超出画布: ${text.textContent.trim()}`);
    }
  }
  for (let left = 0; left < texts.length; left += 1) {
    const a = texts[left];
    const aBox = a.getBoundingClientRect();
    for (let right = left + 1; right < texts.length; right += 1) {
      const b = texts[right];
      if (a.closest('g') === b.closest('g')) continue;
      const ratio = intersectionRatio(aBox, b.getBoundingClientRect());
      if (ratio > 0.22) issues.push(`文字重叠: ${a.textContent.trim()} ↔ ${b.textContent.trim()}`);
    }
  }
  if (/^journey\b/iu.test(source.trim())) {
    const expectedSections = source.split(/\r?\n/u)
      .map(line => line.trim().match(/^section\s+(.+)$/u)?.[1])
      .filter(Boolean);
    const sectionLabels = [...svg.querySelectorAll('text.journey-section')];
    for (const expected of expectedSections) {
      const label = sectionLabels.find(node => node.textContent.trim() === expected);
      if (!label) {
        issues.push(`旅程阶段文字缺失: ${expected}`);
        continue;
      }
      const classes = [...label.classList].map(name => `.${CSS.escape(name)}`).join('');
      const background = classes ? svg.querySelector(`rect${classes}`) : null;
      if (background && getComputedStyle(label).fill === getComputedStyle(background).fill) {
        issues.push(`旅程阶段文字与背景同色: ${expected}`);
      }
    }
  }
  for (const box of svg.querySelectorAll('.edgeLabel rect.background, .edgeLabel rect.labelBkg, .edgeLabel > rect, .relationshipLabelBox, .reqLabelBox')) {
    const style = getComputedStyle(box);
    const width = Number.parseFloat(style.strokeWidth);
    if (style.stroke !== 'none' && Number.isFinite(width) && width > 0) {
      issues.push('连线备注仍有可见边框');
      break;
    }
  }
  if (/Application_Start/u.test(source)) {
    const smallestLabelHeight = texts.reduce((smallest, node) => {
      const height = node.getBoundingClientRect().height;
      return height > 0 ? Math.min(smallest, height) : smallest;
    }, Number.POSITIVE_INFINITY);
    if (!Number.isFinite(smallestLabelHeight) || smallestLabelHeight < 11) {
      issues.push(`宽流程图文字过小: ${Number.isFinite(smallestLabelHeight) ? smallestLabelHeight.toFixed(1) : 0}px`);
    }
    const readableWidth = Number.parseFloat(svg.dataset.mermaidReadableWidth || '0');
    if (!Number.isFinite(readableWidth) || readableWidth <= 680) {
      issues.push('宽流程图没有启用按内容计算的可读宽度');
    }
  }
  return [...new Set(issues)];
}

function auditEChartsSVG(svg, templateId = '') {
  const issues = [];
  const bounds = svg.getBoundingClientRect();
  if (bounds.width < 100 || bounds.height < 100) issues.push(`图表画布尺寸异常: ${Math.round(bounds.width)} × ${Math.round(bounds.height)}`);
  const texts = [...svg.querySelectorAll('text')].filter(node => node.textContent.trim() && node.getBoundingClientRect().width > 1);
  if (!texts.length) issues.push('图表没有可见文字');
  const drawings = [...svg.querySelectorAll('path, rect, circle, polygon, polyline')].filter(node => {
    const box = node.getBoundingClientRect();
    return box.width > 1 || box.height > 1;
  });
  if (!drawings.length) issues.push('图表没有实际绘图元素');
  for (const text of texts) {
    const box = text.getBoundingClientRect();
    const weight = Number.parseInt(getComputedStyle(text).fontWeight, 10);
    if ((Number.isFinite(weight) && weight > 500) || /\b(?:bold|bolder)\b/iu.test(getComputedStyle(text).fontWeight)) {
      issues.push(`图表文字字重过大: ${text.textContent.trim()} (${getComputedStyle(text).fontWeight})`);
    }
    if (box.left < bounds.left - 2 || box.top < bounds.top - 2 || box.right > bounds.right + 2 || box.bottom > bounds.bottom + 2) {
      issues.push(`图表文字超出画布: ${text.textContent.trim()}`);
    }
  }
  for (const guide of svg.querySelectorAll('path, line, polyline')) {
    const style = getComputedStyle(guide);
    if (!style.strokeDasharray || style.strokeDasharray === 'none' || style.strokeDasharray === '0px') continue;
    const effectiveOpacity = Number.parseFloat(style.opacity || '1') * Number.parseFloat(style.strokeOpacity || '1');
    if (style.stroke === 'none' || style.stroke === 'transparent' || !Number.isFinite(effectiveOpacity) || effectiveOpacity < .55) {
      issues.push('虚线或辅助线对比度不足');
      break;
    }
  }
  if (CARTESIAN_GRID_TEMPLATES.has(templateId)) {
    const segments = [...svg.querySelectorAll('path[stroke-dasharray]')]
      .map(node => node.getAttribute('d') || '')
      .map(value => value.match(/^M([\d.-]+) ([\d.-]+)L([\d.-]+) ([\d.-]+)$/u))
      .filter(Boolean)
      .map(match => ({
        horizontal: Math.abs(Number(match[2]) - Number(match[4])) < 1,
        vertical: Math.abs(Number(match[1]) - Number(match[3])) < 1
      }));
    if (!segments.some(item => item.horizontal) || !segments.some(item => item.vertical)) {
      issues.push('笛卡尔图表缺少横向或纵向虚线网格');
    }
  }
  if (templateId === 'heatmap-chart') {
    const gradient = [...svg.querySelectorAll('path[fill^="url("]')]
      .map(node => node.getBoundingClientRect())
      .find(box => box.width > 1 && box.height > 1);
    if (!gradient || gradient.width < gradient.height * 5 || gradient.top < bounds.top + bounds.height * .7) {
      issues.push('热力图色阶应在底部横向显示');
    }
  }
  return [...new Set(issues)];
}

await renderMermaidDiagrams(charts, {
  diagramLabel: 'Mermaid diagram',
  errorTitle: 'Render error',
  errorHint: 'Check source'
});
await renderEChartsDiagrams(charts, {
  errorTitle: 'Render error',
  errorHint: 'Check chart JSON'
});
await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));

const report = [...document.querySelectorAll('.audit-card')].map(card => {
  const engine = card.dataset.engine;
  const diagram = card.querySelector(`.${engine}-diagram`);
  const svg = diagram.querySelector('svg');
  const issues = diagram.dataset[`${engine}Rendered`] === 'error'
    ? [diagram.textContent.trim()]
    : svg ? (engine === 'mermaid' ? auditSVG(svg, card.querySelector('pre')?.textContent || '') : auditEChartsSVG(svg, card.dataset.template)) : ['没有生成 SVG'];
  card.dataset.auditStatus = issues.length ? 'fail' : 'pass';
  if (issues.length) {
    const output = document.createElement('pre');
    output.className = 'audit-issues';
    output.textContent = issues.join('\n');
    card.prepend(output);
  }
  return {
    id: card.dataset.template,
    locale: card.dataset.locale,
    engine,
    status: issues.length ? 'fail' : 'pass',
    issues,
    width: svg?.getBoundingClientRect().width || 0,
    height: svg?.getBoundingClientRect().height || 0
  };
});

window.__diagramAuditReport = report;
window.__diagramAuditMode = colorMode;
const failures = report.filter(item => item.status === 'fail');
let exportSummary = '';
if (document.documentElement.dataset.exportAudit === 'true' || new URLSearchParams(location.search).has('export')) {
  const exportRoot = charts.cloneNode(true);
  exportRoot.style.cssText = 'position:fixed;left:-100000px;top:0;width:1100px;visibility:hidden;pointer-events:none';
  document.body.appendChild(exportRoot);
  const expectedMermaid = exportRoot.querySelectorAll('.mermaid-diagram[data-mermaid-rendered="true"]').length;
  const expectedECharts = exportRoot.querySelectorAll('.echarts-diagram[data-echarts-rendered="true"]').length;
  const expected = expectedMermaid + expectedECharts;
  const exportIssues = [];
  try {
    await convertMermaidDiagramsToImages(exportRoot, 'Mermaid diagram');
    await convertEChartsDiagramsToImages(exportRoot, 'Data chart');
    const images = [...exportRoot.querySelectorAll('.mermaid-export-image, .echarts-export-image')];
    if (images.length !== expected) exportIssues.push(`仅生成 ${images.length}/${expected} 张导出图片`);
    for (const image of images) {
      if (!image.src.startsWith('data:image/png;base64,') || image.src.length < 500) {
        exportIssues.push('存在无效 PNG 数据');
        break;
      }
    }
  } catch (error) {
    exportIssues.push(error?.message || String(error));
  } finally {
    exportRoot.remove();
  }
  window.__diagramExportAuditReport = {
    expected,
    passed: exportIssues.length === 0,
    issues: exportIssues
  };
  exportSummary = `；导出 ${exportIssues.length ? '失败' : `${expected}/${expected} 通过`}`;
}
summary.textContent = `完成 ${report.length} 个渲染：${report.length - failures.length} 通过，${failures.length} 个需检查${exportSummary}`;
summary.dataset.complete = 'true';
