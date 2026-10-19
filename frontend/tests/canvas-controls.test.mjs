import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { parseStructuredDiagram, serializeStructuredDiagram } from '../src/structured-diagram-editor.js';
import { layoutFlowchart } from '../src/flowchart-designer.js';

const renderer = readFileSync(new URL('../src/renderer.js', import.meta.url), 'utf8');
const source = renderer.slice(renderer.indexOf('function updateSelectedFlowchartEdge('), renderer.indexOf('function deleteSelectedFlowchartElement('));

test('mindmap canvas preserves deep parent-child chains across source round trips', () => {
  const context = vm.createContext({ parseStructuredDiagram, serializeStructuredDiagram, layoutFlowchart });
  vm.runInContext(renderer.slice(renderer.indexOf('function mindmapCanvasModel('), renderer.indexOf('function parseCanvasDiagramSource(')), context);
  vm.runInContext(renderer.slice(renderer.indexOf('function serializeMindmapCanvas('), renderer.indexOf('function serializeCanvasDiagram(')), context);
  for (const depth of [7, 16, 40]) {
    const nodes = Array.from({ length: depth + 1 }, (_, index) => ({ id: `N${index}`, label: `主题${index}`, mindmapRoot: index === 0, shape: 'round', x: 0, y: 0 }));
    const edges = nodes.slice(1).map((node, index) => ({ id: `E${index}`, from: nodes[index].id, to: node.id, style: 'line', label: '' }));
    const source = context.serializeMindmapCanvas({ canvasType: 'mindmap', nodes, edges });
    assert.deepEqual(parseStructuredDiagram('mindmap', source).model.rows.map(row => row.level), nodes.map((_, index) => index));
    const restored = context.mindmapCanvasModel(source);
    assert.equal(restored.valid, true);
    assert.equal(restored.model.edges.length, depth);
    restored.model.edges.forEach((edge, index) => {
      assert.equal(restored.model.nodes.find(node => node.id === edge.from).label, `主题${index}`);
      assert.equal(restored.model.nodes.find(node => node.id === edge.to).label, `主题${index + 1}`);
    });
    assert.equal(context.serializeMindmapCanvas(restored.model), source);
  }
});
test('canvas line styles only mutate flowcharts; state transition labels remain editable', () => {
  for (const canvasType of [undefined, 'flowchart', 'state', 'mindmap']) {
    const context = vm.createContext({ flowchartDesignerState: { selection: { type: 'edge', id: 'e' }, model: { canvasType, edges: [{ id: 'e', style: 'solid', label: 'before' }] } }, syncFlowchartSource() {}, renderFlowchartCanvas() {} });
    vm.runInContext(source, context);
    context.updateSelectedFlowchartEdge({ style: 'dashed' });
    assert.equal(context.flowchartDesignerState.model.edges[0].style, !canvasType || canvasType === 'flowchart' ? 'dashed' : 'solid');
    context.updateSelectedFlowchartEdge({ label: 'after' });
    assert.equal(context.flowchartDesignerState.model.edges[0].label, 'after');
  }
  assert.match(renderer, /flowchartEdgeStyle\.closest\('label'\)\.classList\.toggle\('hidden', type !== 'flowchart'\)/);
});

test('mindmap canvas keeps relative parentage and shape syntax through edits and reparenting', () => {
  const context = vm.createContext({ parseStructuredDiagram, serializeStructuredDiagram, layoutFlowchart });
  vm.runInContext(renderer.slice(renderer.indexOf('function mindmapCanvasModel('), renderer.indexOf('function parseCanvasDiagramSource(')), context);
  vm.runInContext(renderer.slice(renderer.indexOf('function serializeMindmapCanvas('), renderer.indexOf('function serializeCanvasDiagram(')), context);
  const source = 'mindmap\ntopic((项目))\n  plan[计划]\n   detail(详情)\n  release((发布))';
  const parsed = context.mindmapCanvasModel(source);
  assert.equal(parsed.valid, true);
  assert.deepEqual(Array.from(parsed.model.nodes, n => [n.label, n.shape]), [['项目', 'circle'], ['计划', 'process'], ['详情', 'round'], ['发布', 'circle']]);
  assert.deepEqual(Array.from(parsed.model.edges, e => [e.from, e.to]), [['M1', 'M2'], ['M2', 'M3'], ['M1', 'M4']]);
  parsed.model.nodes[2].label = 'Edited detail';
  parsed.model.edges[1].from = 'M4';
  const output = context.serializeMindmapCanvas(parsed.model);
  assert.equal(output, 'mindmap\n  topic((项目))\n    plan[计划]\n    release((发布))\n      detail(Edited detail)');
  assert.equal(context.mindmapCanvasModel('mindmap\n root\n  %% comment').valid, false);
});

test('unsupported mindmap conversion keeps the exact source and the editor in source mode', () => {
  for (const extra of ['%% keep this comment', 'node{{Hexagon}}', '::icon(fa fa-book)', ':::important']) {
    const original = `mindmap\n  root((Root))\n    Topic\n    ${extra}\n`;
    const notices = [], state = { mode: 'source', model: null, sourceSnapshot: '' };
    const els = { diagramSource: { value: original } };
    const context = vm.createContext({ parseStructuredDiagram, serializeStructuredDiagram, layoutFlowchart, flowchartDesignerState: state, diagramWizardState: { templateId: 'mindmap' }, els,
      isCanvasDiagram: () => true, diagramTemplateById: () => ({ id: 'mindmap', visualEditor: 'canvas' }), hasStructuredVisualEditor: () => false, showToast: key => notices.push(key), t: key => key,
    });
    vm.runInContext(renderer.slice(renderer.indexOf('function mindmapCanvasModel('), renderer.indexOf('function serializeStateCanvas(')), context);
    vm.runInContext(renderer.slice(renderer.indexOf('function initialiseFlowchartVisual('), renderer.indexOf('function structuredInput(')), context);
    vm.runInContext(renderer.slice(renderer.indexOf('function showFlowchartEditorMode('), renderer.indexOf('function configureFlowchartEditor(')), context);
    assert.equal(context.showFlowchartEditorMode('visual', { notify: true }), false);
    assert.equal(els.diagramSource.value, original);
    assert.equal(state.mode, 'source');
    assert.equal(state.model, null);
    assert.deepEqual(notices, ['diagramVisualUnsupported']);
  }
});
