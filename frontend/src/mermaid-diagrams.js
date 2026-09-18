import DOMPurify from 'dompurify';

let renderSequence = 0;
let renderQueue = Promise.resolve();
let enginePromise = null;
let configuredEngine = null;
let configuredThemeSignature = '';
const renderGenerations = new WeakMap();
const resolvedColorCache = new Map();
const DIAGRAM_FONT_FAMILY = '"Segoe UI", "Microsoft YaHei", "PingFang SC", "Noto Sans CJK SC", sans-serif';
// Categorical charts must remain distinguishable regardless of the selected
// application accent. These Tableau-inspired colours have clearly separated
// hues and work on both light and dark diagram surfaces.
const PIE_COLORS = [
  '#4E79A7', '#F28E2B', '#E15759', '#76B7B2',
  '#59A14F', '#EDC948', '#B07AA1', '#FF9DA7',
  '#9C755F', '#BAB0AC', '#17BECF', '#8CD17D'
];
const DARK_PIE_COLORS = [
  '#79A9D1', '#FFB55A', '#EF7D7F', '#7FC8C2',
  '#83C978', '#E8CD65', '#C99BC5', '#FFAFBB',
  '#C8957E', '#B9B6B0', '#55C7D2', '#9CD58F'
];

function byteToHex(value) {
  return Math.max(0, Math.min(255, Math.round(value))).toString(16).padStart(2, '0');
}

function mermaidColor(rawValue, fallback) {
  const raw = String(rawValue || '').trim();
  if (!raw) return fallback;
  if (resolvedColorCache.has(raw)) return resolvedColorCache.get(raw);

  // Mermaid's colour parser only accepts traditional colour formats. The app
  // theme intentionally uses modern CSS such as color-mix(), so ask the
  // browser to resolve it and read the final sRGB pixel before configuring
  // Mermaid. This also covers nested var(), named colours and display-p3.
  const probe = document.createElement('span');
  probe.style.cssText = 'position:fixed;visibility:hidden;pointer-events:none;color:#010203';
  probe.style.color = raw;
  (document.body || document.documentElement).appendChild(probe);
  const resolved = getComputedStyle(probe).color;
  probe.remove();

  const canvas = document.createElement('canvas');
  canvas.width = 1;
  canvas.height = 1;
  const context = canvas.getContext('2d', { willReadFrequently: true });
  if (!context) return fallback;
  context.clearRect(0, 0, 1, 1);
  context.fillStyle = '#010203';
  context.fillStyle = resolved;
  context.fillRect(0, 0, 1, 1);
  const [red, green, blue, alpha] = context.getImageData(0, 0, 1, 1).data;
  if (!alpha) return fallback;
  const value = `#${byteToHex(red)}${byteToHex(green)}${byteToHex(blue)}`.toUpperCase();
  resolvedColorCache.set(raw, value);
  return value;
}

function diagramTheme() {
  const root = getComputedStyle(document.documentElement);
  const dark = document.documentElement.dataset.colorMode === 'dark';
  const colorNames = ['--accent-soft', '--text', '--accent', '--muted', '--panel', '--paper', '--line', '--accent-strong'];
  const rawColors = Object.fromEntries(colorNames.map(name => [name, root.getPropertyValue(name).trim()]));
  const color = (name, fallback) => mermaidColor(root.getPropertyValue(name), fallback);
  const pieColors = dark ? DARK_PIE_COLORS : PIE_COLORS;
  const pieVariables = Object.fromEntries(pieColors.map((value, index) => [`pie${index + 1}`, value]));
  return {
    signature: `${dark ? 'dark' : 'light'}|${colorNames.map(name => rawColors[name]).join('|')}`,
    // Mermaid's stock dark theme still contains several fixed black/white
    // values which bypass themeVariables. Always use the customisable base
    // theme and provide every neutral colour explicitly for both UI modes.
    name: 'base',
    variables: {
      darkMode: dark,
      fontFamily: DIAGRAM_FONT_FAMILY,
      fontSize: '14px',
      primaryColor: color('--accent-soft', dark ? '#203C31' : '#E7F5EE'),
      primaryTextColor: color('--text', dark ? '#E7ECE9' : '#1F2924'),
      primaryBorderColor: color('--accent', '#159A63'),
      lineColor: color('--muted', '#68716B'),
      secondaryColor: color('--panel', dark ? '#242C28' : '#F5F8F6'),
      tertiaryColor: color('--paper', dark ? '#1D2420' : '#FFFFFF'),
      background: color('--paper', dark ? '#1D2420' : '#FFFFFF'),
      mainBkg: color('--paper', dark ? '#1D2420' : '#FFFFFF'),
      secondBkg: color('--panel', dark ? '#242C28' : '#F5F8F6'),
      textColor: color('--text', dark ? '#E7ECE9' : '#1F2924'),
      // Labels must remain legible independently from the selected accent.
      // Several Mermaid renderers reuse a border colour as label text, which
      // can otherwise produce same-colour text and backgrounds.
      edgeLabelBackground: color('--paper', dark ? '#1D2420' : '#FFFFFF'),
      relationLabelBackground: color('--paper', dark ? '#1D2420' : '#FFFFFF'),
      relationLabelColor: color('--text', dark ? '#E7ECE9' : '#1F2924'),
      labelTextColor: color('--text', dark ? '#E7ECE9' : '#1F2924'),
      nodeTextColor: color('--text', dark ? '#E7ECE9' : '#1F2924'),
      titleColor: color('--text', dark ? '#E7ECE9' : '#1F2924'),
      actorTextColor: color('--text', dark ? '#E7ECE9' : '#1F2924'),
      actorBkg: color('--panel', dark ? '#242C28' : '#F5F8F6'),
      actorBorder: color('--accent', '#159A63'),
      actorLineColor: color('--muted', dark ? '#A8ADAA' : '#68716B'),
      signalColor: color('--text', dark ? '#E7ECE9' : '#1F2924'),
      signalTextColor: color('--text', dark ? '#E7ECE9' : '#1F2924'),
      labelBoxBkgColor: color('--paper', dark ? '#1D2420' : '#FFFFFF'),
      labelBoxBorderColor: color('--line', dark ? '#39443E' : '#D9E0DB'),
      labelTextColor: color('--text', dark ? '#E7ECE9' : '#1F2924'),
      loopTextColor: color('--text', dark ? '#E7ECE9' : '#1F2924'),
      noteBkgColor: color('--panel', dark ? '#242C28' : '#F5F8F6'),
      noteTextColor: color('--text', dark ? '#E7ECE9' : '#1F2924'),
      noteBorderColor: color('--line', dark ? '#39443E' : '#D9E0DB'),
      classText: color('--text', dark ? '#E7ECE9' : '#1F2924'),
      fillType0: color('--accent-soft', dark ? '#203C31' : '#E7F5EE'),
      fillType1: color('--panel', dark ? '#242C28' : '#F5F8F6'),
      fillType2: color('--paper', dark ? '#1D2420' : '#FFFFFF'),
      fillType3: color('--accent-soft', dark ? '#203C31' : '#E7F5EE'),
      fillType4: color('--panel', dark ? '#242C28' : '#F5F8F6'),
      fillType5: color('--paper', dark ? '#1D2420' : '#FFFFFF'),
      fillType6: color('--accent-soft', dark ? '#203C31' : '#E7F5EE'),
      fillType7: color('--panel', dark ? '#242C28' : '#F5F8F6'),
      border1: color('--line', dark ? '#39443E' : '#D9E0DB'),
      border2: color('--accent', '#159A63'),
      taskBkgColor: color('--accent-soft', dark ? '#203C31' : '#E7F5EE'),
      taskBorderColor: color('--accent', '#159A63'),
      activeTaskBkgColor: color('--accent', '#159A63'),
      activeTaskBorderColor: color('--accent-strong', '#0F7D50'),
      gridColor: color('--line', dark ? '#39443E' : '#D9E0DB'),
      todayLineColor: color('--accent', '#159A63'),
      ...pieVariables,
      pieStrokeColor: color('--paper', dark ? '#1D2420' : '#FFFFFF'),
      pieSectionTextColor: '#111827',
      pieLegendTextColor: color('--text', dark ? '#E7ECE9' : '#1F2924'),
      pieTitleTextColor: color('--text', dark ? '#E7ECE9' : '#1F2924')
    }
  };
}

function configureMermaid(mermaid) {
  const theme = diagramTheme();
  if (configuredEngine === mermaid && configuredThemeSignature === theme.signature) return;
  mermaid.initialize({
    startOnLoad: false,
    securityLevel: 'strict',
    suppressErrorRendering: true,
    htmlLabels: false,
    fontFamily: DIAGRAM_FONT_FAMILY,
    theme: theme.name,
    themeVariables: theme.variables,
    flowchart: { htmlLabels: false, useMaxWidth: true },
    sequence: { useMaxWidth: true },
    // Gantt charts contain several dense lanes (section, task, date axis and
    // milestone labels).  Mermaid's compact defaults are difficult to read on
    // high-DPI displays, so give the chart more vertical breathing room and a
    // real body-text-sized font.  The stylesheet also provides extra canvas
    // width so these larger labels do not collide.
    gantt: {
      useMaxWidth: true,
      fontSize: 16,
      sectionFontSize: 15,
      barHeight: 28,
      barGap: 7,
      topPadding: 64,
      leftPadding: 120,
      rightPadding: 90,
      gridLineStartPadding: 34
    },
    // Mermaid's C4 renderer places relationship captions at the midpoint
    // between two shapes. Its 50px default margin only leaves a 100px gap,
    // which is narrower than common Chinese captions (and their technology
    // label), so the text extends into neighbouring systems. Reserve a real
    // caption lane between shapes and wrap dense context diagrams after three
    // nodes to keep every relationship readable.
    c4: {
      useMaxWidth: false,
      c4ShapeMargin: 120,
      c4ShapeInRow: 3
    }
  });
  configuredEngine = mermaid;
  configuredThemeSignature = theme.signature;
}

function validMermaidEngine(engine) {
  return Boolean(engine && typeof engine.initialize === 'function' && typeof engine.render === 'function');
}

function mermaidEngine() {
  if (validMermaidEngine(window.mermaid)) return Promise.resolve(window.mermaid);
  if (enginePromise) return enginePromise;
  enginePromise = new Promise((resolve, reject) => {
    const existing = document.querySelector('script[data-quillite-mermaid]');
    const script = existing || document.createElement('script');
    const finish = () => {
      if (validMermaidEngine(window.mermaid)) resolve(window.mermaid);
      else reject(new Error('The bundled Mermaid engine is unavailable'));
    };
    script.addEventListener('load', finish, { once: true });
    script.addEventListener('error', () => reject(new Error('Unable to load the bundled Mermaid engine')), { once: true });
    if (!existing) {
      script.src = '/vendor/mermaid.min.js';
      script.async = true;
      script.dataset.quilliteMermaid = 'true';
      document.head.appendChild(script);
    } else if (validMermaidEngine(window.mermaid)) {
      finish();
    }
  }).catch(error => {
    enginePromise = null;
    throw error;
  });
  return enginePromise;
}

function sourceFrom(element) {
  try {
    return decodeURIComponent(element.dataset.mermaidSource || '');
  } catch {
    return '';
  }
}

function diagramType(source) {
  return source.split(/\s+/u, 1)[0].toLowerCase().replace(/[^a-z0-9-]/g, '');
}

function normalizeSVGTypography(svg, type = '') {
  if (!svg) return;
  svg.querySelectorAll('text, tspan').forEach(label => {
    const size = Number.parseFloat(getComputedStyle(label).fontSize);
    label.style.fontFamily = DIAGRAM_FONT_FAMILY;
    label.style.fontWeight = '400';
    // The application-wide icon rule gives every SVG element a currentColor
    // stroke. On text this outlines each glyph and makes labels look bold and
    // oversized, so Mermaid text must explicitly opt out.
    label.style.stroke = 'none';
    label.style.strokeWidth = '0';
    // C4 measures stereotype and relationship labels before positioning boxes
    // and connectors. Resizing those labels after render invalidates Mermaid's
    // measured bounds and makes labels overlap lines or neighbouring systems.
    // Keep the exact layout font size for C4 while still normalising its family,
    // weight and accidental SVG stroke.
    if (!type.startsWith('c4') && Number.isFinite(size)) {
      const minimumSize = type === 'gantt' ? 14 : 12;
      const maximumSize = type === 'gantt' ? 17 : 16;
      label.style.fontSize = `${Math.max(minimumSize, Math.min(maximumSize, size))}px`;
    }
  });

  normalizeEdgeLabelBackgrounds(svg);
  if (type.startsWith('c4')) normalizeC4Diagram(svg);
  if (type === 'erdiagram') normalizeERDiagram(svg);
  if (type === 'requirementdiagram') normalizeRequirementDiagram(svg);
  if (type === 'xychart-beta') normalizeXYChart(svg);
  if (type === 'journey') normalizeJourneyDiagram(svg);
  if (type === 'treemap-beta') normalizeTreemapDiagram(svg);
  if (type === 'mindmap') normalizeMindmapDiagram(svg);
  if (type === 'sankey-beta') normalizeSankeyDiagram(svg);
  expandSVGViewBox(svg);
  applyReadableSVGWidth(svg, type);
}

function applyReadableSVGWidth(svg, type = '') {
  if (!svg) return;
  const values = (svg.getAttribute('viewBox') || '').trim().split(/[\s,]+/u).map(Number);
  if (values.length !== 4 || values.some(value => !Number.isFinite(value)) || values[2] <= 0) return;

  // Mermaid lays a diagram out in SVG user units and then `width: 100%`
  // scales the complete canvas into the article. That is useful for compact
  // diagrams, but a long LR flowchart can be 2–3 times wider than the article:
  // every 14px label is then reduced to 5–7 physical pixels. Preserve a
  // body-text-sized label instead and let the existing diagram scroller expose
  // the extra width. The median ignores an occasional large title or tiny
  // stereotype without changing Mermaid's measured node geometry.
  const fontSizes = [...svg.querySelectorAll('text, tspan')]
    .map(label => Number.parseFloat(getComputedStyle(label).fontSize))
    .filter(size => Number.isFinite(size) && size >= 8 && size <= 32)
    .sort((left, right) => left - right);
  const medianFontSize = fontSizes.length
    ? fontSizes[Math.floor(fontSizes.length / 2)]
    : (type === 'gantt' ? 16 : 14);
  const configuredScale = Number.parseFloat(
    getComputedStyle(document.documentElement).getPropertyValue('--font-scale')
  );
  const fontScale = Number.isFinite(configuredScale) && configuredScale > 0 ? configuredScale : 1;
  const targetFontSize = (type === 'gantt' ? 14 : 13) * fontScale;
  const readableWidth = Math.ceil(values[2] * (targetFontSize / medianFontSize));
  const boundedWidth = Math.max(320, Math.min(6000, readableWidth));

  svg.style.setProperty('--mermaid-readable-width', `${boundedWidth}px`);
  svg.dataset.mermaidReadableWidth = String(boundedWidth);
}

function renderedDiagramColors() {
  const root = getComputedStyle(document.documentElement);
  const dark = document.documentElement.dataset.colorMode === 'dark';
  const color = (name, fallback) => mermaidColor(root.getPropertyValue(name), fallback);
  return {
    dark,
    paper: color('--paper', dark ? '#1D2420' : '#FFFFFF'),
    panel: color('--panel', dark ? '#242C28' : '#F5F8F6'),
    text: color('--text', dark ? '#E7ECE9' : '#1F2924'),
    muted: color('--muted', dark ? '#A7B0AA' : '#68716B'),
    line: color('--line', dark ? '#445049' : '#D9E0DB'),
    accent: color('--accent', '#159A63')
  };
}

function normalizeTreemapDiagram(svg) {
  const { dark, paper, panel, text, line } = renderedDiagramColors();
  const fills = dark
    ? ['#245C48', '#294E68', '#6B4C25', '#663A43', '#3F5360', '#4C4168']
    : ['#CDEBDD', '#D5E7F4', '#F6E0BC', '#F3D4D9', '#D9E5EA', '#E4DCF1'];

  // Mermaid derives treemap shades by darkening the application background.
  // On a dark surface that calculation collapses to 0% lightness and produces
  // indistinguishable black leaves. Inline categorical colours so every
  // export keeps the same visible result as the live preview.
  svg.querySelectorAll('.treemapLeaf').forEach((leaf, index) => {
    leaf.style.setProperty('fill', fills[index % fills.length], 'important');
    leaf.style.setProperty('fill-opacity', '1', 'important');
    leaf.style.setProperty('stroke', dark ? line : paper, 'important');
    leaf.style.setProperty('stroke-width', '2', 'important');
  });
  svg.querySelectorAll('.treemapSection').forEach(section => {
    section.style.setProperty('fill', panel, 'important');
    section.style.setProperty('fill-opacity', '1', 'important');
    section.style.setProperty('stroke', line, 'important');
  });
  svg.querySelectorAll('.treemapSectionHeader').forEach(header => {
    header.style.setProperty('fill', panel, 'important');
    header.style.setProperty('stroke', line, 'important');
  });
  svg.querySelectorAll('.treemapLabel, .treemapValue, .treemapSectionLabel, .treemapSectionValue').forEach(label => {
    label.style.setProperty('fill', text, 'important');
    label.style.setProperty('opacity', '1', 'important');
  });
}

function normalizeMindmapDiagram(svg) {
  const { dark, text, muted, line, accent } = renderedDiagramColors();
  const fills = dark
    ? ['#245C48', '#294E68', '#5A4629', '#533F62']
    : ['#D6EFE3', '#DCEBF5', '#F4E5C8', '#E9DDF1'];
  const borders = dark
    ? ['#63D2A4', '#79B8E4', '#E0B567', '#C6A0DF']
    : ['#159A63', '#2878B5', '#A86F16', '#8057A4'];

  // Mermaid's generated HSL branch colours also collapse to black on a dark
  // base. Colour by top-level branch instead, keeping descendants related.
  svg.querySelectorAll('.mindmap-node').forEach((node, nodeIndex) => {
    const sectionClass = [...node.classList].find(name => /^section--?\d+$/u.test(name));
    const section = Number.parseInt(sectionClass?.replace('section-', '') || String(nodeIndex), 10);
    const paletteIndex = section < 0 ? 0 : (section + 1) % fills.length;
    node.querySelectorAll(':scope > .node-bkg, :scope > rect, :scope > circle, :scope > polygon').forEach(shape => {
      shape.style.setProperty('fill', fills[paletteIndex], 'important');
      shape.style.setProperty('stroke', borders[paletteIndex], 'important');
      shape.style.setProperty('stroke-width', '1.5', 'important');
    });
    node.querySelectorAll(':scope > line').forEach(decoration => {
      decoration.style.setProperty('stroke', borders[paletteIndex], 'important');
      decoration.style.setProperty('stroke-width', '1.5', 'important');
    });
    node.querySelectorAll('text, tspan').forEach(label => {
      label.style.setProperty('fill', text, 'important');
      label.style.setProperty('color', text, 'important');
    });
  });
  svg.querySelectorAll('.mindmapDiagram .edge').forEach(edge => {
    edge.style.setProperty('stroke', dark ? muted : line, 'important');
    edge.style.setProperty('stroke-width', '2', 'important');
    edge.style.setProperty('fill', 'none', 'important');
  });
  svg.querySelectorAll('.mindmapDiagram marker path, .mindmapDiagram .arrowMarkerPath').forEach(marker => {
    marker.style.setProperty('fill', accent, 'important');
    marker.style.setProperty('stroke', accent, 'important');
  });
}

function normalizeSankeyDiagram(svg) {
  const { dark, text, paper } = renderedDiagramColors();
  // Mermaid uses multiply blending for Sankey flows. Multiplying a colour
  // over a near-black page produces another near-black colour, so disable the
  // blend in night mode and preserve the generated endpoint gradients.
  svg.querySelectorAll('.links').forEach(links => links.setAttribute('stroke-opacity', dark ? '0.72' : '0.52'));
  svg.querySelectorAll('.link').forEach(link => link.style.setProperty('mix-blend-mode', 'normal', 'important'));
  svg.querySelectorAll('.nodes rect').forEach(node => {
    node.style.setProperty('stroke', paper, 'important');
    node.style.setProperty('stroke-width', '1.5', 'important');
  });
  svg.querySelectorAll('.node-labels text').forEach(label => {
    label.style.setProperty('fill', text, 'important');
    label.style.setProperty('opacity', '1', 'important');
  });
}

function normalizeEdgeLabelBackgrounds(svg) {
  const root = getComputedStyle(document.documentElement);
  const dark = document.documentElement.dataset.colorMode === 'dark';
  const paper = mermaidColor(root.getPropertyValue('--paper'), dark ? '#1D2420' : '#FFFFFF');

  // Mermaid uses a small background rectangle to mask the connector beneath
  // an edge caption. Keep that useful mask, but remove its inherited outline:
  // connector notes are annotations, not diagram nodes, and a framed label is
  // easily mistaken for another state or class. Inline styles also keep Word,
  // HTML and PNG exports identical to the live preview.
  svg.querySelectorAll('.edgeLabel rect.background, .edgeLabel rect.labelBkg, .edgeLabel > rect').forEach(box => {
    box.style.setProperty('fill', paper, 'important');
    box.style.setProperty('background-color', paper, 'important');
    box.style.setProperty('stroke', 'none', 'important');
    box.style.setProperty('stroke-width', '0', 'important');
    box.style.setProperty('opacity', '1', 'important');
  });
}

function normalizeJourneyDiagram(svg) {
  const root = getComputedStyle(document.documentElement);
  const dark = document.documentElement.dataset.colorMode === 'dark';
  const text = mermaidColor(root.getPropertyValue('--text'), dark ? '#E7ECE9' : '#1F2924');

  // Journey section rectangles and their titles intentionally share the
  // `journey-section section-type-*` classes. Mermaid's generated theme CSS
  // consequently applies the section background fill to the <text> as well,
  // making headings such as "Open document" blend into the rectangle. Write
  // the final foreground directly onto text nodes so preview and exported
  // images keep the section titles visible in every application theme.
  svg.querySelectorAll('text.journey-section').forEach(label => {
    label.style.setProperty('fill', text, 'important');
    label.style.setProperty('color', text, 'important');
    label.style.setProperty('opacity', '1', 'important');
    label.style.setProperty('font-family', DIAGRAM_FONT_FAMILY, 'important');
    label.style.setProperty('font-size', '14px', 'important');
    label.style.setProperty('font-weight', '400', 'important');
    label.style.setProperty('stroke', 'none', 'important');
  });
}

function normalizeXYChart(svg) {
  // Mermaid places the rotated Y-axis title at x=5 while tick labels start at
  // roughly x=20. A 14-16px UI font therefore makes the title occupy the same
  // horizontal strip as several tick labels. Move only the axis title into a
  // dedicated lane; expandSVGViewBox() below then preserves the extra lane.
  const title = svg.querySelector('.left-axis > .title > text');
  if (!title) return;
  const transform = title.getAttribute('transform') || '';
  const match = transform.match(/translate\(\s*[-+\d.]+(?:e[-+]?\d+)?[ ,]+([-+\d.]+(?:e[-+]?\d+)?)\s*\)\s*rotate\(\s*270\s*\)/iu);
  if (!match) return;
  title.setAttribute('transform', `translate(-18, ${match[1]}) rotate(270)`);
}

function expandSVGViewBox(svg, padding = 10) {
  // Several Mermaid renderers calculate their viewBox before the final web
  // font is applied. Titles, first/last labels and participant names can then
  // land just outside the declared canvas and get clipped. Keep Mermaid's
  // original canvas, but grow it when the real rendered bounds need more room.
  const values = (svg.getAttribute('viewBox') || '').trim().split(/[\s,]+/u).map(Number);
  if (values.length !== 4 || values.some(value => !Number.isFinite(value))) return;
  let content;
  try {
    content = svg.getBBox();
  } catch {
    return;
  }
  if (!content || !Number.isFinite(content.x) || !Number.isFinite(content.y) || !content.width || !content.height) return;

  const [x, y, width, height] = values;
  const right = x + width;
  const bottom = y + height;
  const nextX = Math.min(x, content.x - padding);
  const nextY = Math.min(y, content.y - padding);
  const nextRight = Math.max(right, content.x + content.width + padding);
  const nextBottom = Math.max(bottom, content.y + content.height + padding);
  if (nextX === x && nextY === y && nextRight === right && nextBottom === bottom) return;
  svg.setAttribute('viewBox', `${nextX} ${nextY} ${nextRight - nextX} ${nextBottom - nextY}`);
}

function normalizeC4Diagram(svg) {
  const { dark, text, muted } = renderedDiagramColors();
  // Mermaid measures C4 stereotypes with guillemets (for example
  // `«person»`) but draws the longer ASCII form (`<<person>>`) into that
  // measured textLength. The browser then compresses the extra characters
  // and individual letters visibly overlap. Use the same glyphs Mermaid used
  // for measurement and centre them explicitly inside their owning shape.
  svg.querySelectorAll('.person-man > text').forEach(label => {
    const match = label.textContent?.trim().match(/^<<(.+)>>$/u);
    if (!match) return;
    label.textContent = `«${match[1]}»`;
    label.removeAttribute('textLength');
    label.removeAttribute('lengthAdjust');
    const shape = label.parentElement?.querySelector(':scope > rect');
    const x = Number.parseFloat(shape?.getAttribute('x'));
    const width = Number.parseFloat(shape?.getAttribute('width'));
    if (Number.isFinite(x) && Number.isFinite(width)) {
      label.setAttribute('x', String(x + width / 2));
      label.setAttribute('text-anchor', 'middle');
    }
    label.style.setProperty('letter-spacing', '0', 'important');
  });

  // C4 keeps fixed #444 relationship colours even under a dark custom theme.
  // Leave white node text intact, but make relationship lines, arrowheads and
  // their captions use a readable neutral foreground.
  svg.querySelectorAll('line').forEach(connector => {
    connector.style.setProperty('stroke', dark ? muted : '#55615B', 'important');
    connector.style.setProperty('opacity', '1', 'important');
  });
  svg.querySelectorAll('marker path').forEach(marker => {
    marker.style.setProperty('fill', dark ? muted : '#55615B', 'important');
    marker.style.setProperty('stroke', dark ? muted : '#55615B', 'important');
  });
  svg.querySelectorAll('text').forEach(label => {
    const fill = (label.getAttribute('fill') || '').toLowerCase();
    if (fill === '#444444' || fill === '#000000' || fill === 'black') {
      label.style.setProperty('fill', text, 'important');
      label.style.setProperty('opacity', '1', 'important');
    }
  });
}

function normalizeERDiagram(svg) {
  const root = getComputedStyle(document.documentElement);
  const dark = document.documentElement.dataset.colorMode === 'dark';
  const color = (name, fallback) => mermaidColor(root.getPropertyValue(name), fallback);
  const paper = color('--paper', dark ? '#1D2420' : '#FFFFFF');
  const text = color('--text', dark ? '#E7ECE9' : '#1F2924');
  const line = color('--muted', dark ? '#A7B0AA' : '#68716B');

  // Mermaid ER uses the node border colour for relationship captions. That
  // works for its stock themes but can turn both the caption and its box into
  // the application accent. Inline the final neutral colours so the preview
  // and exported SVG/PNG have exactly the same readable result.
  svg.querySelectorAll('.relationshipLabelBox, .edgeLabel rect, rect.labelBkg').forEach(box => {
    box.style.setProperty('fill', paper, 'important');
    box.style.setProperty('background-color', paper, 'important');
    box.style.setProperty('stroke', 'none', 'important');
    box.style.setProperty('stroke-width', '0', 'important');
    box.style.setProperty('opacity', '1', 'important');
  });
  svg.querySelectorAll('.edgeLabel .label, .edgeLabel text, .edgeLabel tspan').forEach(label => {
    label.style.setProperty('fill', text, 'important');
    label.style.setProperty('color', text, 'important');
    label.style.setProperty('stroke', 'none', 'important');
  });
  svg.querySelectorAll('.relationshipLine, .marker').forEach(edge => {
    edge.style.setProperty('stroke', line, 'important');
  });
}

function normalizeRequirementDiagram(svg) {
  const root = getComputedStyle(document.documentElement);
  const dark = document.documentElement.dataset.colorMode === 'dark';
  const color = (name, fallback) => mermaidColor(root.getPropertyValue(name), fallback);
  const paper = color('--paper', dark ? '#1D2420' : '#FFFFFF');
  const text = color('--text', dark ? '#E7ECE9' : '#1F2924');
  const line = color('--muted', dark ? '#A7B0AA' : '#68716B');

  // Mermaid draws Requirement Diagram relationship captions on a dedicated
  // label box. Some Mermaid/theme combinations leave that box black while
  // the caption inherits an equally dark colour. Apply final SVG colours
  // directly so live preview and exported SVG snapshots remain identical.
  svg.querySelectorAll('.reqLabelBox, .edgeLabel rect, rect.labelBkg').forEach(labelBox => {
    labelBox.style.setProperty('fill', paper, 'important');
    labelBox.style.setProperty('background-color', paper, 'important');
    labelBox.style.setProperty('stroke', 'none', 'important');
    labelBox.style.setProperty('stroke-width', '0', 'important');
    labelBox.style.setProperty('opacity', '1', 'important');
  });

  svg.querySelectorAll('.relationshipLabel, .edgeLabel .label, .edgeLabel text, .edgeLabel tspan').forEach(label => {
    label.style.setProperty('fill', text, 'important');
    label.style.setProperty('color', text, 'important');
    label.style.setProperty('stroke', 'none', 'important');
    label.style.setProperty('font-family', DIAGRAM_FONT_FAMILY, 'important');
    label.style.setProperty('font-size', '13px', 'important');
    label.style.setProperty('font-weight', '400', 'important');
    label.style.setProperty('opacity', '1', 'important');

    if (/^(text|tspan)$/iu.test(label.tagName)) {
      const match = label.textContent.trim().match(/^<<(.+)>>$/u);
      if (match) label.textContent = `«${match[1]}»`;
      label.removeAttribute('textLength');
      label.removeAttribute('lengthAdjust');
    }
  });

  svg.querySelectorAll('.relationshipLine').forEach(connector => {
    connector.style.setProperty('stroke', line, 'important');
  });
}

async function renderContainer(container, messages, generation) {
  const isCurrent = () => renderGenerations.get(container) === generation;
  if (!isCurrent()) return;
  const diagrams = [...container.querySelectorAll('.mermaid-diagram:not([data-mermaid-rendered="true"])')];
  if (!diagrams.length) return;
  let engine;
  try {
    engine = await mermaidEngine();
    if (!isCurrent()) return;
    configureMermaid(engine);
  } catch (error) {
    for (const element of diagrams) showRenderError(element, error, messages);
    return;
  }
  for (const element of diagrams) {
    if (!isCurrent()) return;
    if (!element.isConnected) continue;
    const source = sourceFrom(element).trim();
    if (!source) continue;
    element.dataset.mermaidType = diagramType(source);
    const id = `quillite-mermaid-${Date.now()}-${++renderSequence}`;
    element.classList.add('mermaid-rendering');
    element.setAttribute('aria-busy', 'true');
    try {
      const { svg } = await engine.render(id, source);
      if (!isCurrent()) return;
      if (!element.isConnected) continue;
      const safeSVG = DOMPurify.sanitize(svg, {
        USE_PROFILES: { svg: true, svgFilters: true },
        FORBID_TAGS: ['script', 'foreignObject', 'iframe', 'object', 'embed'],
        FORBID_ATTR: ['onload', 'onclick', 'onerror']
      });
      element.innerHTML = safeSVG;
      normalizeSVGTypography(element.querySelector('svg'), element.dataset.mermaidType);
      element.dataset.mermaidRendered = 'true';
      element.classList.remove('mermaid-rendering', 'mermaid-error');
      element.setAttribute('aria-label', messages.diagramLabel);
    } catch (error) {
      if (!element.isConnected) continue;
      showRenderError(element, error, messages);
    } finally {
      element.removeAttribute('aria-busy');
    }
    // Give scrolling, typing and window painting a chance between expensive
    // diagrams instead of monopolising the WebView for a long document.
    await new Promise(resolve => setTimeout(resolve, 0));
  }
}

function showRenderError(element, error, messages) {
  if (!element?.isConnected) return;
  const detail = error instanceof Error ? error.message : String(error || '');
  element.classList.remove('mermaid-rendering');
  element.classList.add('mermaid-error');
  element.innerHTML = `<strong>${messages.errorTitle}</strong><span>${messages.errorHint}</span><pre></pre>`;
  element.querySelector('pre').textContent = detail;
  element.dataset.mermaidRendered = 'error';
  element.removeAttribute('aria-busy');
}

export function cancelMermaidRendering(container) {
  renderGenerations.set(container, (renderGenerations.get(container) || 0) + 1);
}

export function renderMermaidDiagrams(container, messages) {
  const generation = (renderGenerations.get(container) || 0) + 1;
  renderGenerations.set(container, generation);
  renderQueue = renderQueue.catch(() => {}).then(() => renderContainer(container, messages, generation));
  return renderQueue;
}

export async function refreshMermaidDiagrams(container, messages) {
  if (!container) return;
  const diagrams = [...container.querySelectorAll('.mermaid-diagram')];
  if (!diagrams.length) return;
  resolvedColorCache.clear();
  configuredThemeSignature = '';
  for (const diagram of diagrams) {
    const height = Math.ceil(diagram.getBoundingClientRect().height);
    if (height > 0) diagram.style.minHeight = `${height}px`;
    delete diagram.dataset.mermaidRendered;
    diagram.classList.remove('mermaid-error');
    diagram.replaceChildren();
  }
  await renderMermaidDiagrams(container, messages);
  diagrams.forEach(diagram => { diagram.style.minHeight = ''; });
}

export function svgToPNGDataURL(svg, label = 'diagram', backgroundColor = 'transparent', requestedSize = null) {
  return new Promise((resolve, reject) => {
    const clone = svg.cloneNode(true);
    clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
    const box = svg.viewBox?.baseVal;
    const bounds = svg.getBoundingClientRect();
    // Detached SVG elements do not have reliable layout bounds in WebView2.
    // ECharts export supplies the exact renderer dimensions so the PNG keeps
    // the wide chart aspect ratio instead of silently falling back to 320x320.
    const requestedWidth = Number(requestedSize?.width);
    const requestedHeight = Number(requestedSize?.height);
    const hasRequestedSize = Number.isFinite(requestedWidth) && requestedWidth > 0
      && Number.isFinite(requestedHeight) && requestedHeight > 0;
    const sourceWidth = hasRequestedSize ? requestedWidth : (box?.width || bounds.width || 900);
    const sourceHeight = hasRequestedSize ? requestedHeight : (box?.height || bounds.height || 500);
    const width = Math.max(320, Math.min(1800, Math.ceil(sourceWidth)));
    const height = Math.max(160, Math.min(3200, Math.ceil(sourceHeight * (width / sourceWidth))));
    if (hasRequestedSize) {
      clone.setAttribute('viewBox', `0 0 ${sourceWidth} ${sourceHeight}`);
      clone.setAttribute('preserveAspectRatio', 'xMidYMid meet');
    }
    clone.setAttribute('width', String(width));
    clone.setAttribute('height', String(height));
    const svgText = new XMLSerializer().serializeToString(clone);
    const bytes = new TextEncoder().encode(svgText);
    let binary = '';
    for (let offset = 0; offset < bytes.length; offset += 0x8000) {
      binary += String.fromCharCode(...bytes.subarray(offset, offset + 0x8000));
    }
    // The application CSP permits data images but intentionally does not
    // permit blob URLs. A data URI therefore works consistently in WebView2,
    // WKWebView and standalone browser exports.
    const url = `data:image/svg+xml;base64,${btoa(binary)}`;
    const image = new Image();
    image.onload = () => {
      try {
        const scale = 2;
        const canvas = document.createElement('canvas');
        canvas.width = width * scale;
        canvas.height = height * scale;
        const context = canvas.getContext('2d');
        context.scale(scale, scale);
        if (backgroundColor && backgroundColor !== 'transparent') {
          context.fillStyle = backgroundColor;
          context.fillRect(0, 0, width, height);
        }
        context.drawImage(image, 0, 0, width, height);
        resolve(canvas.toDataURL('image/png'));
      } catch (error) {
        reject(error);
      }
    };
    image.onerror = () => {
      reject(new Error(`Unable to convert ${label} to PNG`));
    };
    image.src = url;
  });
}

export async function convertMermaidDiagramsToImages(container, altText) {
  for (const diagram of container.querySelectorAll('.mermaid-diagram[data-mermaid-rendered="true"]')) {
    const svg = diagram.querySelector('svg');
    if (!svg) continue;
    const image = document.createElement('img');
    image.src = await svgToPNGDataURL(svg, 'Mermaid diagram');
    image.alt = altText;
    image.className = 'mermaid-export-image';
    diagram.replaceChildren(image);
  }
}
