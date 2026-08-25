export const FLOWCHART_DIRECTIONS = ['LR', 'TD', 'RL', 'BT'];

export const FLOWCHART_SHAPES = [
  { id: 'process', zh: '处理步骤', en: 'Process' },
  { id: 'decision', zh: '判断分支', en: 'Decision' },
  { id: 'terminal', zh: '开始／结束', en: 'Start / end' },
  { id: 'round', zh: '圆角步骤', en: 'Rounded step' },
  { id: 'subroutine', zh: '子流程', en: 'Subroutine' },
  { id: 'database', zh: '数据存储', en: 'Database' },
  { id: 'circle', zh: '连接点', en: 'Connector' }
];

const SHAPE_PATTERNS = [
  ['terminal', /^\(\[([\s\S]*?)\]\)$/u],
  ['subroutine', /^\[\[([\s\S]*?)\]\]$/u],
  ['database', /^\[\(([\s\S]*?)\)\]$/u],
  ['circle', /^\(\(([\s\S]*?)\)\)$/u],
  ['decision', /^\{([\s\S]*?)\}$/u],
  ['round', /^\(([\s\S]*?)\)$/u],
  ['process', /^\[([\s\S]*?)\]$/u]
];

function plainLabel(value, fallback = '') {
  const normalized = String(value ?? '').replace(/[\r\n\t]+/gu, ' ').replace(/\s{2,}/gu, ' ').trim();
  return normalized || fallback;
}

function parseNodeToken(rawToken) {
  const token = String(rawToken || '').trim().replace(/;$/u, '').trim();
  const match = token.match(/^([A-Za-z_][\w-]*)([\s\S]*)$/u);
  if (!match) return null;
  const id = match[1];
  const notation = match[2].trim();
  if (!notation) return { id, label: id, shape: 'process', defined: false };
  for (const [shape, pattern] of SHAPE_PATTERNS) {
    const shapeMatch = notation.match(pattern);
    if (shapeMatch) return { id, label: plainLabel(shapeMatch[1], id), shape, defined: true };
  }
  return null;
}

function parseEdgeLine(line) {
  const labelled = line.match(/^([\s\S]*?)\s+--\s*(.*?)\s*-->\s*([\s\S]*?)\s*;?$/u);
  if (labelled) {
    const from = parseNodeToken(labelled[1]);
    const to = parseNodeToken(labelled[3]);
    if (from && to) return { from, to, label: plainLabel(labelled[2]), style: 'solid' };
  }
  const standard = line.match(/^([\s\S]*?)\s*(-->|-\.->|==>|---)\s*(?:\|([^|]*)\|\s*)?([\s\S]*?)\s*;?$/u);
  if (!standard) return null;
  const from = parseNodeToken(standard[1]);
  const to = parseNodeToken(standard[4]);
  if (!from || !to) return null;
  return {
    from,
    to,
    label: plainLabel(standard[3]),
    style: standard[2] === '-.->' ? 'dashed' : standard[2] === '==>' ? 'thick' : standard[2] === '---' ? 'line' : 'solid'
  };
}

function upsertNode(nodes, candidate) {
  const existing = nodes.find(node => node.id === candidate.id);
  if (!existing) {
    nodes.push({ id: candidate.id, label: candidate.label, shape: candidate.shape, x: 0, y: 0 });
    return;
  }
  if (candidate.defined) {
    existing.label = candidate.label;
    existing.shape = candidate.shape;
  }
}

export function layoutFlowchart(model, width = 920, height = 560) {
  const nodes = model.nodes.map(node => ({ ...node }));
  if (!nodes.length) return { ...model, nodes };
  const byId = new Map(nodes.map(node => [node.id, node]));
  const incoming = new Map(nodes.map(node => [node.id, 0]));
  const outgoing = new Map(nodes.map(node => [node.id, []]));
  model.edges.forEach(edge => {
    if (!byId.has(edge.from) || !byId.has(edge.to)) return;
    incoming.set(edge.to, (incoming.get(edge.to) || 0) + 1);
    outgoing.get(edge.from).push(edge.to);
  });
  const roots = nodes.filter(node => (incoming.get(node.id) || 0) === 0).map(node => node.id);
  const queue = (roots.length ? roots : [nodes[0].id]).map(id => ({ id, rank: 0 }));
  const ranks = new Map();
  while (queue.length) {
    const current = queue.shift();
    if (ranks.has(current.id)) continue;
    ranks.set(current.id, current.rank);
    for (const target of outgoing.get(current.id) || []) {
      if (!ranks.has(target)) queue.push({ id: target, rank: current.rank + 1 });
    }
  }
  nodes.forEach(node => {
    if (!ranks.has(node.id)) ranks.set(node.id, Math.max(0, ...ranks.values()) + 1);
  });
  const groups = new Map();
  nodes.forEach(node => {
    const rank = ranks.get(node.id) || 0;
    if (!groups.has(rank)) groups.set(rank, []);
    groups.get(rank).push(node);
  });
  const maxRank = Math.max(0, ...groups.keys());
  const horizontal = model.direction === 'LR' || model.direction === 'RL';
  for (const [rank, group] of groups) {
    group.forEach((node, index) => {
      const primary = 90 + (horizontal ? width - 180 : height - 150) * (maxRank ? rank / maxRank : .5);
      const crossSize = horizontal ? height : width;
      const cross = crossSize * (index + 1) / (group.length + 1);
      node.x = horizontal ? primary : cross;
      node.y = horizontal ? cross : primary;
      if (model.direction === 'RL') node.x = width - node.x;
      if (model.direction === 'BT') node.y = height - node.y;
    });
  }
  return { ...model, nodes };
}

export function parseFlowchartSource(source) {
  const lines = String(source || '').split(/\r?\n/u);
  const headerIndex = lines.findIndex(line => /^(?:flowchart|graph)\s+(?:LR|RL|TD|TB|BT)\s*;?\s*$/iu.test(line.trim()));
  if (headerIndex < 0) return { valid: false, error: 'missing-header', unsupportedLines: [] };
  const directionMatch = lines[headerIndex].trim().match(/\s+(LR|RL|TD|TB|BT)/iu);
  const model = { direction: directionMatch?.[1]?.toUpperCase() === 'TB' ? 'TD' : directionMatch?.[1]?.toUpperCase() || 'LR', nodes: [], edges: [] };
  const unsupportedLines = lines.slice(0, headerIndex).filter(line => line.trim());
  for (const rawLine of lines.slice(headerIndex + 1)) {
    const line = rawLine.trim();
    if (!line) continue;
    if (line.startsWith('%%')) {
      unsupportedLines.push(rawLine);
      continue;
    }
    const edge = parseEdgeLine(line);
    if (edge) {
      upsertNode(model.nodes, edge.from);
      upsertNode(model.nodes, edge.to);
      model.edges.push({ id: `edge-${model.edges.length + 1}`, from: edge.from.id, to: edge.to.id, label: edge.label, style: edge.style });
      continue;
    }
    const node = parseNodeToken(line);
    if (node?.defined) {
      upsertNode(model.nodes, node);
      continue;
    }
    unsupportedLines.push(rawLine);
  }
  if (!model.nodes.length) return { valid: false, error: 'missing-nodes', unsupportedLines };
  return { valid: unsupportedLines.length === 0, model: layoutFlowchart(model), unsupportedLines };
}

function safeLabel(value, fallback) {
  return plainLabel(value, fallback)
    .replaceAll('"', '＂')
    .replaceAll('|', '｜')
    .replaceAll('<', '＜').replaceAll('>', '＞')
    .replaceAll('[', '［').replaceAll(']', '］')
    .replaceAll('{', '｛').replaceAll('}', '｝')
    .replaceAll('(', '（').replaceAll(')', '）');
}

function nodeNotation(node) {
  const label = safeLabel(node.label, node.id);
  if (node.shape === 'decision') return `{${label}}`;
  if (node.shape === 'terminal') return `([${label}])`;
  if (node.shape === 'round') return `(${label})`;
  if (node.shape === 'subroutine') return `[[${label}]]`;
  if (node.shape === 'database') return `[(${label})]`;
  if (node.shape === 'circle') return `((${label}))`;
  return `[${label}]`;
}

export function serializeFlowchart(model) {
  const direction = FLOWCHART_DIRECTIONS.includes(model?.direction) ? model.direction : 'LR';
  const lines = [`flowchart ${direction}`];
  for (const node of model?.nodes || []) lines.push(`    ${node.id}${nodeNotation(node)}`);
  for (const edge of model?.edges || []) {
    const operator = edge.style === 'dashed' ? '-.->' : edge.style === 'thick' ? '==>' : edge.style === 'line' ? '---' : '-->';
    const label = safeLabel(edge.label, '');
    if (label && operator === '-->') lines.push(`    ${edge.from} -- ${label} --> ${edge.to}`);
    else if (label) lines.push(`    ${edge.from} ${operator}|${label}| ${edge.to}`);
    else lines.push(`    ${edge.from} ${operator} ${edge.to}`);
  }
  return lines.join('\n');
}

export function nextFlowchartNodeId(model) {
  const used = new Set((model?.nodes || []).map(node => node.id));
  for (let index = 1; index < 10000; index += 1) {
    const id = `N${index}`;
    if (!used.has(id)) return id;
  }
  return `N${Date.now()}`;
}

export function addFlowchartNode(model, shape = 'process', label = '') {
  const id = nextFlowchartNodeId(model);
  const index = model.nodes.length;
  const node = { id, label: plainLabel(label, id), shape: FLOWCHART_SHAPES.some(option => option.id === shape) ? shape : 'process', x: 150 + (index % 4) * 190, y: 110 + Math.floor(index / 4) * 130 };
  return { model: { ...model, nodes: [...model.nodes, node] }, node };
}

export function removeFlowchartNode(model, nodeId) {
  return { ...model, nodes: model.nodes.filter(node => node.id !== nodeId), edges: model.edges.filter(edge => edge.from !== nodeId && edge.to !== nodeId) };
}

export function addFlowchartEdge(model, from, to) {
  if (!from || !to || from === to || !model.nodes.some(node => node.id === from) || !model.nodes.some(node => node.id === to)) return model;
  if (model.edges.some(edge => edge.from === from && edge.to === to)) return model;
  const nextNumber = model.edges.reduce((maximum, edge) => Math.max(maximum, Number.parseInt(String(edge.id).replace(/\D/gu, ''), 10) || 0), 0) + 1;
  return { ...model, edges: [...model.edges, { id: `edge-${nextNumber}`, from, to, label: '', style: 'solid' }] };
}

export function removeFlowchartEdge(model, edgeId) {
  return { ...model, edges: model.edges.filter(edge => edge.id !== edgeId) };
}

// Locate the fenced Mermaid flowchart that contains the current editor cursor.
// The returned range includes both fence lines so saving can replace the block
// in place without leaving duplicate or partial Markdown behind.
export function findCanvasDiagramFenceAt(source, position) {
  const text = String(source || '');
  const target = Math.max(0, Math.min(text.length, Number(position) || 0));
  const lines = text.match(/.*(?:\r\n|\n|$)/gu) || [];
  let offset = 0;
  let opening = null;

  for (const rawLine of lines) {
    if (!rawLine) continue;
    const line = rawLine.replace(/\r?\n$/u, '');
    const lineEnd = offset + line.length;
    if (!opening) {
      const match = line.match(/^(\s*)(`{3,}|~{3,})\s*mermaid\s*$/iu);
      if (match) {
        opening = {
          from: offset,
          contentFrom: offset + rawLine.length,
          indent: match[1],
          marker: match[2],
          markerCharacter: match[2][0]
        };
      }
    } else {
      const closing = line.match(/^\s*(`{3,}|~{3,})\s*$/u);
      if (closing && closing[1][0] === opening.markerCharacter && closing[1].length >= opening.marker.length) {
        const content = text.slice(opening.contentFrom, offset).replace(/\r?\n$/u, '');
        const normalizedContent = opening.indent
          ? content.split(/\r?\n/u).map(contentLine => contentLine.startsWith(opening.indent) ? contentLine.slice(opening.indent.length) : contentLine).join('\n')
          : content;
        const normalizedStart = normalizedContent.trimStart();
        const templateId = /^(?:flowchart|graph)\s+(?:LR|RL|TD|TB|BT)\b/iu.test(normalizedStart)
          ? 'flowchart'
          : /^stateDiagram-v2\b/iu.test(normalizedStart)
            ? 'state'
            : /^mindmap\b/iu.test(normalizedStart)
              ? 'mindmap'
              : '';
        if (target >= opening.from && target <= lineEnd && templateId) {
          return { ...opening, to: lineEnd, source: normalizedContent, templateId, lineEnding: text.includes('\r\n') ? '\r\n' : '\n' };
        }
        opening = null;
      }
    }
    offset += rawLine.length;
  }
  return null;
}

export function findFlowchartFenceAt(source, position) {
  const result = findCanvasDiagramFenceAt(source, position);
  return result?.templateId === 'flowchart' ? result : null;
}
