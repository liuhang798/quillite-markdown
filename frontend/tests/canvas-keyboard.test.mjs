import assert from 'node:assert/strict';
import test from 'node:test';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';

const renderer = readFileSync(new URL('../src/renderer.js', import.meta.url), 'utf8');
const source = renderer.slice(renderer.indexOf('function handleFlowchartKeydown('), renderer.indexOf('const FLOWCHART_ZOOM_MIN'));
test('canvas names follow diagram type and keyboard instructions describe the focused canvas', () => {
  const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
  assert.match(html, /id="flowchartCanvas"[^>]*aria-describedby="flowchartCanvasHint"/);
  assert.match(html, /id="flowchartCanvasHint"/);
  const configure = renderer.slice(renderer.indexOf('function configureCanvasToolbar('), renderer.indexOf('function renderFlowchartProperties('));
  const labelCode = configure.slice(configure.indexOf('  const canvasLabel'), configure.indexOf('  els.flowchartCanvasViewport'));
  for (const [type, expected] of [['state', 'canvasStateAria'], ['mindmap', 'canvasMindmapAria'], ['flowchart', 'flowchartCanvasAria']]) {
    const canvas = { dataset: {}, setAttribute(name, value) { this[name] = value; } };
    vm.runInNewContext(labelCode, { type, t: key => `translated:${key}`, els: { flowchartCanvas: canvas } });
    assert.equal(canvas['aria-label'], `translated:${expected}`);
    assert.equal(canvas.dataset.i18nAriaLabel, expected);
  }
});
function setup(type = 'flowchart') {
  const calls = [], model = { canvasType: type, nodes: [{ id: 'a', x: 10, y: 20 }, { id: 'b', x: 30, y: 40 }], edges: [{ id: 'e', from: 'a', to: 'b' }] };
  const state = { model, selection: null, panX: 0, panY: 0, connecting: false };
  const input = name => ({ disabled: false, focus() { calls.push(['edit', name]); }, select() {} });
  const context = vm.createContext({ flowchartDesignerState: state, els: { flowchartNodeLabel: input('node'), flowchartEdgeLabel: input('edge') },
    selectAllFlowchartNodes() { state.selection = { type: 'nodes', ids: ['a', 'b'] }; calls.push(['all']); },
    focusFlowchartElement(...args) { calls.push(['focus', ...args]); },
    handleFlowchartNodeClick(id) { calls.push(['activate', id]); },
    setFlowchartSelection(type, id) { state.selection = { type, id }; calls.push(['select', type, id]); },
    renderFlowchartCanvas() { calls.push(['render']); }, applyFlowchartZoom() { calls.push(['pan']); },
    deleteSelectedFlowchartElement() { calls.push(['delete', JSON.parse(JSON.stringify(state.selection))]); }
  });
  vm.runInContext(source, context);
  function key(key, dataset = {}, extra = {}) {
    let prevented = false, stopped = false;
    context.handleFlowchartKeydown({ key, target: { closest() { return Object.keys(dataset).length ? { dataset } : null; } }, preventDefault() { prevented = true; }, stopPropagation() { stopped = true; }, ...extra });
    return { prevented, stopped };
  }
  return { state, calls, key, context };
}

test('canvas Enter/Space selects nodes and labelled connections; F2 edits supported properties', () => {
  for (const type of ['flowchart', 'state', 'mindmap']) {
    const { key, calls } = setup(type);
    assert.deepEqual(key('Enter', { flowchartNode: 'a' }), { prevented: true, stopped: true });
    key(' ', { flowchartNode: 'b' }); key('Enter', { flowchartEdge: 'e' }); key('F2', { flowchartNode: 'a' }); key('F2', { flowchartEdge: 'e' });
    assert.ok(calls.some(call => call[0] === 'activate' && call[1] === 'a'));
    assert.ok(calls.some(call => call[0] === 'activate' && call[1] === 'b'));
    assert.ok(calls.some(call => call[0] === 'select' && call[1] === 'edge'));
    assert.ok(calls.some(call => call[0] === 'edit' && call[1] === 'node'));
    assert.equal(calls.some(call => call[0] === 'edit' && call[1] === 'edge'), type !== 'mindmap');
  }
});

test('canvas navigation includes edges, restricts connecting to nodes, and pans separately from moving nodes', () => {
  const { key, calls, state } = setup();
  key('ArrowRight', { flowchartNode: 'b' }); assert.deepEqual(calls.pop(), ['focus', 'edge', 'e']);
  state.connecting = true;
  key('ArrowRight', { flowchartNode: 'b' }); assert.deepEqual(calls.pop(), ['focus', 'node', 'a']);
  key('Home'); assert.deepEqual(calls.pop(), ['focus', 'node', 'a']);
  key('End'); assert.deepEqual(calls.pop(), ['focus', 'node', 'b']);
  key('ArrowRight', { flowchartNode: 'a' }, { shiftKey: true }); assert.equal(state.model.nodes[0].x, 20);
  key('a', {}, { ctrlKey: true }); key('ArrowDown', {}, { shiftKey: true });
  assert.deepEqual(Array.from(state.model.nodes, node => node.y), [30, 50]);
  key('ArrowLeft', {}, { altKey: true }); assert.equal(state.panX, 40);
  assert.deepEqual(key('Escape'), { prevented: true, stopped: true }); assert.equal(state.connecting, false);
});

test('Delete acts on the focused item, preserves select-all deletion and ignores composing input', () => {
  const { key, calls, state } = setup();
  state.selection = { type: 'node', id: 'a' };
  key('Delete', { flowchartNode: 'b' }); assert.deepEqual(calls.pop(), ['delete', { type: 'node', id: 'b' }]);
  key('a', {}, { metaKey: true }); key('Backspace'); assert.deepEqual(calls.pop(), ['delete', { type: 'nodes', ids: ['a', 'b'] }]);
  const count = calls.length;
  assert.deepEqual(key('Enter', { flowchartNode: 'a' }, { isComposing: true }), { prevented: false, stopped: false });
  assert.equal(calls.length, count);
});

test('fullscreen delayed focus never steals a subsequent canvas action or reopens a closed dialog', () => {
  const source = renderer.slice(renderer.indexOf('function setDiagramFullscreen('), renderer.indexOf('function toggleDiagramFullscreen('));
  for (const after of ['unchanged', 'node', 'closed', 'exited']) {
    const classes = new Set(), previous = {}, node = {}, body = {}, frames = [];
    let focused = false;
    const document = { activeElement: previous, body };
    const context = vm.createContext({ document, els: { diagramDialog: { classList: { contains: key => classes.has(key), toggle: (key, value) => value ? classes.add(key) : classes.delete(key) } } }, isCanvasDiagram: () => true, flowchartDesignerState: { mode: 'visual' }, updateDiagramFullscreenButton() {}, applyFlowchartZoom() {}, requestAnimationFrame: fn => frames.push(fn), $: () => ({ focus() { focused = true; } }) });
    vm.runInContext(source, context); context.setDiagramFullscreen(true);
    if (after === 'node') document.activeElement = node;
    if (after === 'closed') classes.add('hidden');
    if (after === 'exited') classes.delete('diagram-fullscreen');
    frames[0](); assert.equal(focused, after === 'unchanged');
  }
});
