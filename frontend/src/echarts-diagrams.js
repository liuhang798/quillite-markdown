import * as echarts from 'echarts';
// Preserve the existing chart layout when using the security-patched v6 engine.
import 'echarts/theme/v5';
import 'echarts-wordcloud';
import { secureChartOption } from './chart-security.js';
import { svgToPNGDataURL } from './mermaid-diagrams.js';

const chartInstances = new WeakMap();
const resizeObservers = new WeakMap();
const CHART_PALETTE = ['#159A63', '#2878B5', '#F28E2B', '#E15759', '#76B7B2', '#8F63B8', '#EDC948', '#59A14F', '#AF7AA1', '#FF9DA7'];
// Keep data series deliberately independent from the selected application
// accent. These brighter hues preserve separation and label readability on
// the dark paper surface instead of turning every series into one theme hue.
const DARK_CHART_PALETTE = ['#43C991', '#69A9E0', '#FFB55A', '#F27D7F', '#72D1CB', '#B594DB', '#F0D46C', '#8BD17E', '#D39BC8', '#FFB0BD'];
// Heatmaps encode magnitude rather than application branding. Use one stable
// cold-to-warm scale on both paper and dark surfaces so cells and their legend
// always describe the same values.
const HEATMAP_PALETTE = ['#C9E3F1', '#86C8C0', '#F3E39A', '#EEA06F', '#D85E63'];
const FONT_FAMILY = '"Segoe UI", "Microsoft YaHei", "PingFang SC", "Noto Sans CJK SC", sans-serif';
const NORMAL_TEXT = Object.freeze({ fontFamily: FONT_FAMILY, fontWeight: 400 });
// Office documents and standalone HTML use a white paper surface. Exporting
// the live dark-mode SVG would keep its light text while losing the dark app
// background, making titles, axes and legends almost invisible in Word.
const PAPER_EXPORT_THEME = Object.freeze({
  dark: false,
  text: '#1F2924',
  muted: '#68736D',
  line: '#D9DEDA',
  paper: '#FFFFFF',
  panel: '#F5F8F6',
  background: '#FFFFFF'
});

function decodeSource(element) {
  try {
    return decodeURIComponent(element.dataset.echartsSource || '');
  } catch {
    return element.dataset.echartsSource || '';
  }
}

function cssColor(name, fallback) {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim() || fallback;
}

function isDarkMode() {
  return document.documentElement.dataset.colorMode === 'dark';
}

function axisTheme(axis, text, axisLine, gridLine, minorGridLine, tickLine) {
  if (!axis || typeof axis !== 'object') return;
  axis.axisLabel = { color: text, ...NORMAL_TEXT, fontSize: 12, margin: 10, hideOverlap: true, ...(axis.axisLabel || {}), fontWeight: 400 };
  axis.nameTextStyle = { color: text, ...NORMAL_TEXT, fontSize: 12, lineHeight: 17, ...(axis.nameTextStyle || {}), fontWeight: 400 };
  if (axis.name && !axis.nameLocation) axis.nameLocation = 'middle';
  if (axis.name && axis.nameGap == null) axis.nameGap = axis.type === 'category' ? 30 : 38;
  const originalAxisLine = axis.axisLine || {};
  const originalAxisTick = axis.axisTick || {};
  const originalSplitLine = axis.splitLine || {};
  const originalMinorSplitLine = axis.minorSplitLine || {};
  axis.axisLine = {
    show: originalAxisLine.show !== false,
    ...originalAxisLine,
    lineStyle: { width: 1.2, ...(originalAxisLine.lineStyle || {}), color: axisLine }
  };
  axis.axisTick = {
    ...originalAxisTick,
    lineStyle: { width: 1.2, ...(originalAxisTick.lineStyle || {}), color: tickLine }
  };
  axis.splitLine = {
    ...originalSplitLine,
    // Always show both horizontal and vertical reference grids. Category axes
    // are hidden by ECharts by default, which made bar and line charts look as
    // if the grid fix had not taken effect.
    show: true,
    lineStyle: { width: 1.2, type: 'dashed', ...(originalSplitLine.lineStyle || {}), color: gridLine, opacity: 1 }
  };
  axis.minorSplitLine = {
    ...originalMinorSplitLine,
    lineStyle: { width: 1, type: 'dotted', ...(originalMinorSplitLine.lineStyle || {}), color: minorGridLine }
  };
}

function normalizeAxes(option, text, structure) {
  // ECharts exposes several independent axis families. Applying the same
  // structural palette to every family keeps dashed grids readable in all
  // Cartesian, polar, single-axis and parallel-coordinate charts.
  for (const key of ['xAxis', 'yAxis', 'angleAxis', 'radiusAxis', 'singleAxis', 'parallelAxis']) {
    const axes = option[key] ? (Array.isArray(option[key]) ? option[key] : [option[key]]) : [];
    for (const axis of axes) {
      axisTheme(axis, text, structure.axis, structure.grid, structure.minorGrid, structure.tick);
    }
  }
}

function normalizeGuideLines(series, text, guideLine) {
  for (const item of series) {
    if (!item?.markLine) continue;
    item.markLine = {
      ...item.markLine,
      lineStyle: { width: 1.2, type: 'dashed', ...(item.markLine.lineStyle || {}), color: guideLine },
      label: normalTextStyle(item.markLine.label, text, 11)
    };
  }
}

function normalTextStyle(style, color, fontSize = 12) {
  return { color, ...NORMAL_TEXT, fontSize, ...(style || {}), fontWeight: 400 };
}

function numericInset(value, fallback) {
  return typeof value === 'number' ? Math.max(value, fallback) : value ?? fallback;
}

function normalizeCartesianLayout(option, seriesTypes) {
  if (!option.xAxis && !option.yAxis) return;
  const hasLegend = Boolean(option.legend);
  const needsHeatmapSpace = seriesTypes.has('heatmap');
  const grid = Array.isArray(option.grid) ? option.grid[0] : (option.grid || {});
  const safeGrid = {
    ...grid,
    containLabel: true,
    left: numericInset(grid.left, 58),
    right: numericInset(grid.right, 58),
    top: numericInset(grid.top, hasLegend ? 76 : 62),
    bottom: numericInset(grid.bottom, needsHeatmapSpace ? 104 : 62)
  };
  option.grid = Array.isArray(option.grid) ? [safeGrid, ...option.grid.slice(1)] : safeGrid;
}

function normalizeLegend(option, text) {
  if (!option.legend) return;
  const legends = Array.isArray(option.legend) ? option.legend : [option.legend];
  for (const legend of legends) {
    legend.type = legend.type || 'scroll';
    legend.itemWidth = legend.itemWidth || 18;
    legend.itemHeight = legend.itemHeight || 10;
    legend.itemGap = legend.itemGap || 14;
    legend.pageTextStyle = normalTextStyle(legend.pageTextStyle, text, 11);
    legend.textStyle = normalTextStyle(legend.textStyle, text, 12);
  }
}

function normalizeVisualMap(option, text, panel, line) {
  if (!option.visualMap) return;
  const hasHeatmap = (Array.isArray(option.series) ? option.series : [option.series])
    .some(series => series?.type === 'heatmap');
  const visualMaps = Array.isArray(option.visualMap) ? option.visualMap : [option.visualMap];
  for (const visualMap of visualMaps) {
    const rangeColors = hasHeatmap
      ? HEATMAP_PALETTE
      : (Array.isArray(visualMap.inRange?.color) ? visualMap.inRange.color : [panel, text]);
    visualMap.textStyle = normalTextStyle(visualMap.textStyle, text, 11);
    visualMap.backgroundColor = visualMap.backgroundColor || 'transparent';
    visualMap.borderColor = visualMap.borderColor || line;
    visualMap.borderWidth = visualMap.borderWidth ?? 0;
    visualMap.inRange = { ...(visualMap.inRange || {}), color: rangeColors };
    visualMap.controller = {
      ...(visualMap.controller || {}),
      inRange: { ...((visualMap.controller || {}).inRange || {}), color: rangeColors },
      outOfRange: { color: [panel], ...((visualMap.controller || {}).outOfRange || {}) }
    };
    if (visualMap.orient === 'horizontal') {
      visualMap.bottom = typeof visualMap.bottom === 'number' ? Math.min(visualMap.bottom, 8) : 8;
      // Continuous visualMap uses itemWidth as bar thickness and itemHeight as
      // bar length before rotating the group into its horizontal position.
      visualMap.itemWidth = visualMap.itemWidth || 12;
      visualMap.itemHeight = visualMap.itemHeight || 180;
      visualMap.textGap = visualMap.textGap ?? 12;
      visualMap.padding = visualMap.padding || [4, 10];
      if (hasHeatmap) {
        // Keep the useful two-ended range filter while styling its handles
        // independently from the old black controller track. Extra text spacing
        // prevents the minimum/maximum labels from colliding with the handles.
        visualMap.calculable = true;
        visualMap.realtime = true;
        visualMap.hoverLink = true;
        visualMap.handleSize = visualMap.handleSize || '85%';
        visualMap.handleStyle = {
          color: '#FFFFFF',
          borderColor: '#59645E',
          borderWidth: 1.5,
          shadowBlur: 4,
          shadowColor: 'rgba(0,0,0,.22)',
          ...(visualMap.handleStyle || {})
        };
        visualMap.indicatorStyle = {
          color: '#FFFFFF',
          borderColor: '#59645E',
          borderWidth: 1.5,
          ...(visualMap.indicatorStyle || {})
        };
        visualMap.textGap = Math.max(16, Number(visualMap.textGap) || 0);
        visualMap.text = visualMap.text || [String(visualMap.max ?? ''), String(visualMap.min ?? '')];
      }
    }
  }
}

function normalizePieSeries(item) {
  item.avoidLabelOverlap = true;
  item.label = {
    ...item.label,
    show: item.label?.show !== false,
    fontWeight: 400,
    fontSize: 12,
    lineHeight: 16,
    overflow: 'break'
  };
  item.labelLine = { length: 12, length2: 8, smooth: false, ...(item.labelLine || {}) };
}

function prepareOption(rawOption, appearance = null) {
  // Sources are JSON by design; JSON cloning also works in older WebView2 and
  // WKWebView versions where structuredClone may not be available.
  const option = secureChartOption(JSON.parse(JSON.stringify(rawOption)));
  const metadata = option.__quillite || {};
  delete option.__quillite;
  const text = appearance?.text || cssColor('--text', '#1F2924');
  const muted = appearance?.muted || cssColor('--muted', '#68736D');
  const line = appearance?.line || cssColor('--line', '#D9DEDA');
  const paper = appearance?.paper || cssColor('--paper', '#FFFFFF');
  const panel = appearance?.panel || cssColor('--panel', '#F5F8F6');
  const dark = appearance?.dark ?? isDarkMode();
  // Chart structure needs more contrast than ordinary card borders. Keeping
  // these colours independent prevents Cartesian charts from losing their
  // axes and reference grid on either the paper or dark panel surface.
  const structure = dark
    ? { axis: '#9AA69F', grid: '#6C7972', minorGrid: '#4F5B55', tick: '#87938C', guide: '#9AA8A0' }
    : { axis: '#76827B', grid: '#A5B0A9', minorGrid: '#CBD2CE', tick: '#87938D', guide: '#647169' };
  const palette = dark ? DARK_CHART_PALETTE : CHART_PALETTE;
  option.animation = false;
  option.darkMode = dark;
  option.color = option.color || palette;
  option.backgroundColor = appearance?.background || 'transparent';
  option.textStyle = normalTextStyle(option.textStyle, text, 13);
  if (option.title) {
    option.title.textStyle = normalTextStyle(option.title.textStyle, text, 16);
    option.title.subtextStyle = normalTextStyle(option.title.subtextStyle, muted, 12);
  }
  normalizeLegend(option, text);
  option.tooltip = {
    trigger: 'item',
    ...(option.tooltip || {}),
    renderMode: 'richText',
    backgroundColor: paper,
    borderColor: line,
    textStyle: normalTextStyle(option.tooltip?.textStyle, text, 12),
    extraCssText: `box-shadow:0 10px 28px ${dark ? 'rgba(0,0,0,.38)' : 'rgba(20,30,24,.12)'};border-radius:8px;`
  };
  normalizeVisualMap(option, text, panel, line);
  const dataZooms = option.dataZoom ? (Array.isArray(option.dataZoom) ? option.dataZoom : [option.dataZoom]) : [];
  for (const dataZoom of dataZooms) {
    dataZoom.textStyle = normalTextStyle(dataZoom.textStyle, text, 11);
    dataZoom.borderColor = dataZoom.borderColor || line;
    dataZoom.backgroundColor = dataZoom.backgroundColor || panel;
    dataZoom.fillerColor = dataZoom.fillerColor || (dark ? 'rgba(121,169,209,.28)' : 'rgba(40,120,181,.18)');
    dataZoom.handleStyle = { color: dark ? '#79A9D1' : '#2878B5', borderColor: paper, ...(dataZoom.handleStyle || {}) };
    dataZoom.moveHandleStyle = { color: muted, ...(dataZoom.moveHandleStyle || {}) };
  }
  normalizeAxes(option, text, structure);
  const series = Array.isArray(option.series) ? option.series : [];
  normalizeGuideLines(series, text, structure.guide);
  const seriesTypes = new Set(series.map(item => item?.type).filter(Boolean));
  normalizeCartesianLayout(option, seriesTypes);
  for (const [seriesIndex, item] of series.entries()) {
    item.label = normalTextStyle(item.label, text, 12);
    item.emphasis = { ...(item.emphasis || {}), label: normalTextStyle(item.emphasis?.label, text, 12) };
    if (item.type === 'pie') normalizePieSeries(item);
    if (item.type === 'heatmap') {
      item.label = {
        ...item.label,
        color: '#17211C',
        textBorderColor: 'rgba(255,255,255,.45)',
        textBorderWidth: 1
      };
      item.itemStyle = {
        borderColor: dark ? '#202723' : '#FFFFFF',
        borderWidth: 1,
        ...(item.itemStyle || {})
      };
    }
    if (item.type === 'wordCloud' && Array.isArray(item.data)) {
      // An explicit per-word fontSize overrides the plugin's sizeRange mapping.
      // Supply color and family only unless the document requested a size.
      item.data = item.data.map((word, index) => ({ ...word, textStyle: { ...NORMAL_TEXT, color: palette[index % palette.length], ...(word.textStyle || {}), fontWeight: 400 } }));
    }
    if (metadata.transform === 'bubble' && item.type === 'scatter') {
      item.symbolSize = value => Math.max(12, Math.min(54, Number(value?.[2]) || 16));
      item.itemStyle = { color: palette[seriesIndex % palette.length], opacity: .82, borderColor: paper, borderWidth: 1, ...(item.itemStyle || {}) };
      item.label = { ...item.label, show: true, position: 'top', distance: 7, formatter: params => String(params.value?.[3] || ''), fontWeight: 400 };
    }
    if (item.type === 'scatter' && metadata.transform !== 'bubble') {
      item.itemStyle = { color: palette[seriesIndex % palette.length], opacity: .88, ...(item.itemStyle || {}) };
    }
    if (item.type === 'boxplot') {
      item.itemStyle = {
        color: dark ? '#294254' : '#D8EAF7',
        borderColor: dark ? '#79A9D1' : '#2878B5',
        borderWidth: 1.5,
        ...(item.itemStyle || {})
      };
    }
    if (item.type === 'gauge') {
      // ECharts' gauge defaults use a dark gray that nearly disappears on the
      // night paper surface. Always create these three text styles (templates
      // commonly omit axisLabel/title) and force high-contrast white in dark
      // mode. The light theme keeps the normal document text colour.
      const gaugeText = dark ? '#FFFFFF' : text;
      item.detail = { ...normalTextStyle(item.detail, gaugeText, item.detail?.fontSize || 24), color: gaugeText };
      item.axisLabel = { ...normalTextStyle(item.axisLabel, gaugeText, item.axisLabel?.fontSize || 11), color: gaugeText };
      item.title = { ...normalTextStyle(item.title, gaugeText, item.title?.fontSize || 12), color: gaugeText };
      item.axisLine = { ...(item.axisLine || {}), lineStyle: { color: [[1, dark ? '#434846' : '#E2E6E3']], ...((item.axisLine || {}).lineStyle || {}) } };
      item.splitLine = { ...(item.splitLine || {}), lineStyle: { color: text, ...((item.splitLine || {}).lineStyle || {}) } };
      item.axisTick = { ...(item.axisTick || {}), lineStyle: { color: muted, ...((item.axisTick || {}).lineStyle || {}) } };
    }
    if (item.type === 'funnel' && !item.itemStyle) item.itemStyle = { borderColor: paper, borderWidth: 1 };
    item.z = item.z ?? seriesIndex + 1;
  }
  return { option, height: Math.max(300, Math.min(720, Number(metadata.height) || 420)) };
}

function disposeDiagram(element) {
  resizeObservers.get(element)?.disconnect();
  resizeObservers.delete(element);
  const chart = chartInstances.get(element) || echarts.getInstanceByDom(element);
  if (chart && !chart.isDisposed()) chart.dispose();
  chartInstances.delete(element);
}

export function releaseEChartsDiagrams(container) {
  container.querySelectorAll('.echarts-diagram').forEach(disposeDiagram);
}

function renderError(element, error, messages) {
  disposeDiagram(element);
  element.dataset.echartsRendered = 'error';
  element.classList.add('echarts-error');
  const panel = document.createElement('div');
  panel.className = 'mermaid-error-panel';
  const title = document.createElement('strong');
  title.textContent = messages?.errorTitle || 'Invalid data chart';
  const hint = document.createElement('p');
  hint.textContent = messages?.errorHint || 'Check the chart JSON source.';
  const details = document.createElement('code');
  details.textContent = String(error?.message || error || 'Unknown error');
  panel.append(title, hint, details);
  element.replaceChildren(panel);
}

function renderDiagram(element, messages) {
  const source = decodeSource(element).trim();
  try {
    const parsed = JSON.parse(source);
    const { option, height } = prepareOption(parsed);
    disposeDiagram(element);
    element.classList.remove('echarts-error');
    element.style.height = `${height}px`;
    element.replaceChildren();
    const chart = echarts.init(element, 'v5', { renderer: 'svg', devicePixelRatio: 1 });
    chart.setOption(option, { notMerge: true, lazyUpdate: false });
    chartInstances.set(element, chart);
    element.dataset.echartsRendered = 'true';
    const observer = new ResizeObserver(entries => {
      if (!element.isConnected) {
        disposeDiagram(element);
        return;
      }
      const width = entries[0]?.contentRect?.width;
      if (width > 0 && !chart.isDisposed()) chart.resize({ width, height });
    });
    observer.observe(element);
    resizeObservers.set(element, observer);
  } catch (error) {
    renderError(element, error, messages);
  }
}

export async function renderEChartsDiagrams(container, messages) {
  const diagrams = [...container.querySelectorAll('.echarts-diagram:not([data-echarts-rendered="true"])')];
  for (const diagram of diagrams) renderDiagram(diagram, messages);
}

export async function refreshEChartsDiagrams(container, messages) {
  if (!container) return;
  const diagrams = [...container.querySelectorAll('.echarts-diagram')];
  if (!diagrams.length) return;
  for (const diagram of diagrams) {
    const height = Math.max(300, Math.ceil(diagram.getBoundingClientRect().height));
    disposeDiagram(diagram);
    delete diagram.dataset.echartsRendered;
    diagram.classList.remove('echarts-error');
    diagram.style.height = `${height}px`;
    diagram.replaceChildren();
  }
  await renderEChartsDiagrams(container, messages);
}

export async function convertEChartsDiagramsToImages(container, altText) {
  for (const diagram of container.querySelectorAll('.echarts-diagram[data-echarts-rendered="true"]')) {
    const sourceSVG = diagram.querySelector('svg');
    if (!sourceSVG) continue;
    let exportHost;
    let exportChart;
    try {
      const parsed = JSON.parse(decodeSource(diagram).trim());
      const { option, height } = prepareOption(parsed, PAPER_EXPORT_THEME);
        const viewBox = sourceSVG.viewBox?.baseVal;
        const attributeWidth = Number.parseFloat(sourceSVG.getAttribute('width') || '');
        // Keep Word/HTML exports at a predictable landscape size. The cloned
        // preview SVG can report a 0x0 or square layout once detached, which
        // previously produced square PNGs and clipped the right half in Word.
        const measuredWidth = Number.isFinite(attributeWidth) && attributeWidth > 0
          ? attributeWidth
          : (viewBox?.width || 1000);
        const width = Math.max(1000, Math.min(1800, Math.ceil(measuredWidth)));
      exportHost = document.createElement('div');
      exportHost.setAttribute('aria-hidden', 'true');
      Object.assign(exportHost.style, {
        position: 'fixed',
        left: '-10000px',
        top: '0',
        width: `${width}px`,
        height: `${height}px`,
        background: PAPER_EXPORT_THEME.paper,
        pointerEvents: 'none'
      });
      document.body.append(exportHost);
        exportChart = echarts.init(exportHost, 'v5', { renderer: 'svg', devicePixelRatio: 1, width, height });
        exportChart.setOption(option, { notMerge: true, lazyUpdate: false });
        await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
        const exportSVG = exportHost.querySelector('svg');
        if (!exportSVG) continue;
        const image = document.createElement('img');
        image.src = await svgToPNGDataURL(
          exportSVG,
          'data chart',
          PAPER_EXPORT_THEME.paper,
          { width, height }
        );
      image.alt = altText;
      image.className = 'echarts-export-image';
      diagram.replaceChildren(image);
      diagram.style.height = 'auto';
    } finally {
      if (exportChart && !exportChart.isDisposed()) exportChart.dispose();
      exportHost?.remove();
    }
  }
}

export function validateEChartsSource(source) {
  try {
    const parsed = JSON.parse(String(source || '').trim());
    if (!parsed || typeof parsed !== 'object' || !Array.isArray(parsed.series) || !parsed.series.length) {
      throw new Error('Chart JSON must contain at least one series.');
    }
    return { valid: true, option: parsed };
  } catch (error) {
    return { valid: false, error: error?.message || String(error) };
  }
}
