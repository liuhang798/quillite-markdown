import assert from 'node:assert/strict';
import test from 'node:test';
import {
  addFlowchartEdge,
  addFlowchartNode,
  findCanvasDiagramFenceAt,
  findFlowchartFenceAt,
  flowchartNodeSize,
  layoutFlowchart,
  parseFlowchartSource,
  removeFlowchartEdge,
  removeFlowchartNode,
  removeMindmapSelection,
  serializeFlowchart
} from '../src/flowchart-designer.js';

test('mindmap deletions preserve a rooted tree, surviving descendants and the root', () => {
  const nodes = ['root', 'a', 'b', 'c', 'sibling'].map(id => ({ id, label: id, mindmapRoot: id === 'root' }));
  const edges = [['root', 'a'], ['a', 'b'], ['b', 'c'], ['a', 'sibling']].map(([from, to], i) => ({ id: `e${i}`, from, to, style: 'line' }));
  const model = { canvasType: 'mindmap', nodes, edges }, snapshot = JSON.stringify(model);
  const deleted = removeMindmapSelection(model, { type: 'node', id: 'b' });
  assert.equal(deleted.edges.find(edge => edge.to === 'c').from, 'a');
  assert.equal(deleted.edges.find(edge => edge.to === 'sibling').from, 'a');
  const multi = removeMindmapSelection(model, { type: 'nodes', ids: ['root', 'a', 'b'] });
  assert.deepEqual(multi.nodes.map(node => node.id), ['root', 'c', 'sibling']);
  assert.ok(multi.edges.every(edge => edge.from === 'root'));
  assert.deepEqual(removeMindmapSelection(model, { type: 'node', id: 'root' }), model);
  const promoted = removeMindmapSelection(model, { type: 'edge', id: 'e1' });
  assert.equal(promoted.edges.find(edge => edge.to === 'b').from, 'root');
  assert.equal(promoted.edges.find(edge => edge.to === 'c').from, 'b');
  const all = removeMindmapSelection(model, { type: 'nodes', ids: nodes.map(node => node.id) });
  assert.deepEqual(all.nodes.map(node => node.id), ['root']);
  assert.deepEqual(all.edges, []);
  assert.equal(JSON.stringify(model), snapshot);
});

test('canvas fence lookup recognises flowcharts, state diagrams, and mindmaps', () => {
  for (const [templateId, diagram] of [['flowchart', 'flowchart LR\n A --> B'], ['state', 'stateDiagram-v2\n A --> B'], ['mindmap', 'mindmap\n  root((A))']]) {
    const document = `before\n\`\`\`mermaid\n${diagram}\n\`\`\`\nafter`;
    assert.equal(findCanvasDiagramFenceAt(document, document.indexOf(diagram)).templateId, templateId);
  }
});

const source = `flowchart LR
    A([收到需求]) --> B{资料是否完整}
    B -- 是 --> C[进入开发]
    B -- 否 --> D[补充资料]
    D --> B
    C -.-> E[[测试验收]]
    E ==> F[(发布数据)]`;

test('finds the Mermaid flowchart fence containing the editor cursor', () => {
  const document = `开头\n\n\`\`\`mermaid\nflowchart LR\n  A --> B\n\`\`\`\n\n结尾`;
  const cursor = document.indexOf('A --> B') + 2;
  const fence = findFlowchartFenceAt(document, cursor);
  assert.ok(fence);
  assert.equal(fence.from, document.indexOf('```mermaid'));
  assert.equal(fence.to, document.lastIndexOf('```') + 3);
  assert.equal(fence.source, 'flowchart LR\n  A --> B');
  assert.equal(findFlowchartFenceAt(document, 0), null);
});

test('flowchart fence lookup preserves indentation and marker style', () => {
  const document = `~~~mermaid\nsequenceDiagram\n  A->>B: Hi\n~~~\n\n  ~~~~mermaid\n  graph TD\n    A --> B\n  ~~~~`;
  const fence = findFlowchartFenceAt(document, document.indexOf('graph TD'));
  assert.ok(fence);
  assert.equal(fence.indent, '  ');
  assert.equal(fence.marker, '~~~~');
  assert.equal(fence.source, 'graph TD\n  A --> B');
  assert.equal(findFlowchartFenceAt(document, document.indexOf('sequenceDiagram')), null);
});

test('flowchart source becomes a visual node and edge model', () => {
  const parsed = parseFlowchartSource(source);
  assert.equal(parsed.valid, true);
  assert.equal(parsed.model.direction, 'LR');
  assert.deepEqual(parsed.model.nodes.map(node => [node.id, node.shape]), [
    ['A', 'terminal'], ['B', 'decision'], ['C', 'process'], ['D', 'process'], ['E', 'subroutine'], ['F', 'database']
  ]);
  assert.deepEqual(parsed.model.edges.map(edge => [edge.from, edge.to, edge.label, edge.style]), [
    ['A', 'B', '', 'solid'], ['B', 'C', '是', 'solid'], ['B', 'D', '否', 'solid'], ['D', 'B', '', 'solid'], ['C', 'E', '', 'dashed'], ['E', 'F', '', 'thick']
  ]);
  assert.ok(parsed.model.nodes.every(node => Number.isFinite(node.x) && Number.isFinite(node.y)));
});

test('visual model serializes to portable Mermaid and parses again', () => {
  const parsed = parseFlowchartSource(source);
  const serialized = serializeFlowchart(parsed.model);
  assert.match(serialized, /^flowchart LR/m);
  assert.match(serialized, /A\(\[收到需求\]\)/);
  assert.match(serialized, /B\{资料是否完整\}/);
  assert.match(serialized, /B -- 是 --> C/);
  assert.match(serialized, /C -\.-> E/);
  assert.match(serialized, /E ==> F/);
  const reparsed = parseFlowchartSource(serialized);
  assert.equal(reparsed.valid, true);
  assert.equal(reparsed.model.nodes.length, 6);
  assert.equal(reparsed.model.edges.length, 6);
});

test('visual labels cannot break generated Mermaid notation', () => {
  const serialized = serializeFlowchart({
    direction: 'LR',
    nodes: [{ id: 'A', label: '输入 [a|b] <script>', shape: 'process', x: 0, y: 0 }],
    edges: []
  });
  assert.match(serialized, /A\[输入 ［a｜b］ ＜script＞\]/);
  assert.equal(parseFlowchartSource(serialized).valid, true);
});

test('visual operations add and remove nodes and connections safely', () => {
  let model = { direction: 'TD', nodes: [], edges: [] };
  const first = addFlowchartNode(model, 'terminal', '开始');
  model = first.model;
  const second = addFlowchartNode(model, 'decision', '是否继续');
  model = second.model;
  model = addFlowchartEdge(model, first.node.id, second.node.id);
  model = addFlowchartEdge(model, first.node.id, second.node.id);
  assert.equal(model.edges.length, 1, 'duplicate connections are ignored');
  model = removeFlowchartEdge(model, model.edges[0].id);
  assert.equal(model.edges.length, 0);
  model = addFlowchartEdge(model, first.node.id, second.node.id);
  model = removeFlowchartNode(model, second.node.id);
  assert.equal(model.nodes.length, 1);
  assert.equal(model.edges.length, 0, 'connections belonging to a removed node are removed');
});

test('unsupported Mermaid stays in source mode instead of being lost', () => {
  const parsed = parseFlowchartSource(`flowchart LR
    subgraph Group
      A[One] --> B[Two]
    end`);
  assert.equal(parsed.valid, false);
  assert.deepEqual(parsed.unsupportedLines.map(line => line.trim()), ['subgraph Group', 'end']);

  const configured = parseFlowchartSource(`%%{init: { 'flowchart': { 'curve': 'basis' } }}%%
flowchart LR
    A[One] --> B[Two]
    %% keep this note`);
  assert.equal(configured.valid, false);
  assert.deepEqual(configured.unsupportedLines.map(line => line.trim()), [
    "%%{init: { 'flowchart': { 'curve': 'basis' } }}%%",
    '%% keep this note'
  ]);
});

test('automatic layout respects all four flow directions', () => {
  const base = parseFlowchartSource('flowchart LR\n A[One] --> B[Two]').model;
  const lr = layoutFlowchart({ ...base, direction: 'LR' });
  const rl = layoutFlowchart({ ...base, direction: 'RL' });
  const td = layoutFlowchart({ ...base, direction: 'TD' });
  const bt = layoutFlowchart({ ...base, direction: 'BT' });
  assert.ok(lr.nodes[0].x < lr.nodes[1].x);
  assert.ok(rl.nodes[0].x > rl.nodes[1].x);
  assert.ok(td.nodes[0].y < td.nodes[1].y);
  assert.ok(bt.nodes[0].y > bt.nodes[1].y);
});

test('automatic layout does not squeeze long chains or wide levels into overlapping nodes', () => {
  const nodes = Array.from({ length: 16 }, (_, index) => ({ id: `N${index}`, label: `节点 ${index}`, shape: index % 2 ? 'decision' : 'process', x: 0, y: 0 }));
  for (const direction of ['LR', 'RL', 'TD', 'BT']) for (const kind of ['chain', 'fanout', 'disconnected', 'cycle']) {
    const edges = kind === 'disconnected' ? [] : nodes.slice(1).map((node, index) => ({ id: `e${index}`, from: kind === 'fanout' ? 'N0' : `N${index}`, to: node.id }));
    if (kind === 'cycle') edges.push({ id: 'cycle', from: 'N15', to: 'N0' });
    const original = { direction, nodes, edges }, snapshot = JSON.stringify(original);
    const result = layoutFlowchart(original);
    assert.equal(JSON.stringify(original), snapshot, 'layout must not mutate the graph');
    assert.equal(serializeFlowchart(result), serializeFlowchart(original), 'layout must preserve graph semantics');
    for (let i = 0; i < result.nodes.length; i++) for (const other of result.nodes.slice(i + 1)) {
      const node = result.nodes[i];
      assert.ok(Math.abs(node.x - other.x) >= 200 || Math.abs(node.y - other.y) >= 120, `${direction}/${kind}: ${node.id} overlaps ${other.id}`);
    }
    assert.deepEqual(layoutFlowchart(result), result, 'automatic layout is deterministic');
  }
});

test('shared layout leaves real shape bounds separated for flow, state and mindmap canvases', () => {
  for (const canvasType of ['flowchart', 'state', 'mindmap']) for (const direction of ['LR', 'RL', 'TD', 'BT']) {
    const shapes = ['process', 'decision', 'terminal', 'round', 'subroutine', 'database', 'circle'];
    const nodes = Array.from({ length: 30 }, (_, i) => ({ id: `N${i}`, label: `N${i}`, shape: shapes[i % shapes.length],
      ...(canvasType === 'state' ? { diagramNodeType: 'state', stateToken: i === 0 ? '[*]' : '' } : {}),
      ...(canvasType === 'mindmap' && i === 0 ? { mindmapRoot: true } : {}) }));
    const edges = nodes.slice(1).map(node => ({ from: 'N0', to: node.id }));
    const result = layoutFlowchart({ canvasType, direction, nodes, edges }, 320, 240);
    for (let i = 0; i < result.nodes.length; i++) for (const b of result.nodes.slice(i + 1)) {
      const a = result.nodes[i], as = flowchartNodeSize(a), bs = flowchartNodeSize(b);
      assert.ok(Math.abs(a.x - b.x) >= (as.width + bs.width) / 2 + 39 || Math.abs(a.y - b.y) >= (as.height + bs.height) / 2 + 39, `${canvasType}/${direction}/${a.id}/${b.id}`);
    }
  }
});
