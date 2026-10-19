import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { TABLE_CHART_IDS } from '../src/chart-data-editor.js';
import { diagramTemplateById, diagramTemplateSource } from '../src/diagram-templates.js';
import { parseStructuredDiagram, structuredDiagramDefinition, validateStructuredDiagram } from '../src/structured-diagram-editor.js';

const renderer = readFileSync(new URL('../src/renderer.js', import.meta.url), 'utf8');
const functionSource = (name, next) => renderer.slice(renderer.indexOf(`function ${name}(`), renderer.indexOf(`function ${next}(`));
const actionSource = functionSource('updateDiagramActionLabels', 'openDiagramDialog');
const columnSource = functionSource('refreshStructuredDiagramColumnLabels', 'renderStructuredDiagramEditor');
const modelFor = (id, locale) => parseStructuredDiagram(id, diagramTemplateSource(diagramTemplateById(id), locale)).model;

function actionHarness(id, model) {
  const controls = new Map();
  const $ = selector => {
    if (!controls.has(selector)) controls.set(selector, {});
    return controls.get(selector);
  };
  const context = vm.createContext({ $, t: key => key, diagramTemplateById, validateStructuredDiagram,
    diagramWizardState: { templateId: id, editRange: null, saveRequest: null },
    flowchartDesignerState: { mode: 'visual' }, structuredDiagramState: { model } });
  vm.runInContext(actionSource, context);
  return { context, buttons: [$('#insertDiagram'), $('#insertDiagramFullscreen')] };
}

test('actual diagram action controls reject invalid numeric cells and recover after correction in both locales', () => {
  for (const id of TABLE_CHART_IDS) for (const locale of ['zh', 'en']) {
    const model = modelFor(id, locale), definition = structuredDiagramDefinition(id, locale, model);
    const field = definition.columns.find(field => field.type === 'number').key;
    const original = model.rows[0][field];
    const { context, buttons } = actionHarness(id, model);
    context.updateDiagramActionLabels();
    assert.ok(buttons.every(button => !button.disabled), id);
    for (const invalid of ['', 'NaN', Infinity]) {
      model.rows[0][field] = invalid;
      context.updateDiagramActionLabels();
      assert.ok(buttons.every(button => button.disabled), `${id}/${locale}/${invalid}`);
    }
    model.rows[0][field] = original;
    context.updateDiagramActionLabels();
    assert.ok(buttons.every(button => !button.disabled), id);
    context.diagramWizardState.editRange = {};
    context.updateDiagramActionLabels();
    assert.equal(buttons[0].textContent, 'saveDiagramChanges');
    context.diagramWizardState.saveRequest = {};
    context.updateDiagramActionLabels(true);
    assert.ok(buttons.every(button => button.disabled), 'valid draft cannot bypass pending render validation');
    assert.equal(buttons[0].textContent, 'diagramChecking');
  }
});

test('action controls handle empty rows, invalid dates, duplicate series, source mode and stale models', () => {
  const model = modelFor('stacked-bar-chart', 'zh');
  const { context, buttons } = actionHarness('stacked-bar-chart', model);
  model.settings.name1 = model.settings.name0;
  context.updateDiagramActionLabels(); assert.ok(buttons.every(button => button.disabled));
  context.flowchartDesignerState.mode = 'source';
  context.updateDiagramActionLabels(); assert.ok(buttons.every(button => !button.disabled));
  context.flowchartDesignerState.mode = 'visual';
  context.diagramWizardState.templateId = 'flowchart';
  context.updateDiagramActionLabels(); assert.ok(buttons.every(button => !button.disabled), 'canvas ignores previous table draft');
  context.diagramWizardState.templateId = 'calendar-chart';
  context.structuredDiagramState.model = modelFor('calendar-chart', 'zh');
  context.structuredDiagramState.model.rows[0].label = '2026-02-30';
  context.updateDiagramActionLabels(); assert.ok(buttons.every(button => button.disabled));
  context.structuredDiagramState.model.rows = [];
  context.updateDiagramActionLabels(); assert.ok(buttons.every(button => button.disabled));
  context.structuredDiagramState.model = null;
  context.updateDiagramActionLabels(); assert.ok(buttons.every(button => !button.disabled));
  assert.match(functionSource('checkStructuredDiagramDraft', 'syncStructuredDiagramSource'), /updateDiagramActionLabels\(result.valid\)/);
  assert.match(functionSource('showFlowchartEditorMode', 'configureFlowchartEditor'), /updateDiagramActionLabels\(\)/);
});

test('renaming series refreshes headers, accessible cell names and validation labels without rebuilding inputs', () => {
  for (const locale of ['zh', 'en']) for (const id of ['stacked-bar-chart', 'combo-chart', 'scatter-chart']) {
    const model = modelFor(id, locale);
    const definition = structuredDiagramDefinition(id, locale, model);
    const inputs = model.rows.flatMap((row, rowIndex) => definition.columns.map(field => ({
      dataset: { row: String(rowIndex), field: field.key }, value: row[field.key],
      attributes: {}, setAttribute(name, value) { this.attributes[name] = value; }
    })));
    const originalInputs = [...inputs], originalValues = inputs.map(input => input.value);
    const headers = definition.columns.map(() => ({}));
    const context = vm.createContext({ structuredDiagramState: { model, definition },
      diagramWizardState: { templateId: id }, diagramLocale: () => locale, structuredDiagramDefinition,
      els: { structuredDiagramHead: { children: headers }, structuredDiagramRows: { querySelectorAll: () => inputs } } });
    vm.runInContext(columnSource, context);
    model.settings.name0 = '更新 series';
    context.refreshStructuredDiagramColumnLabels();
    const columns = context.structuredDiagramState.definition.columns;
    for (let i = 0; i < columns.length; i++) assert.equal(headers[i].textContent, columns[i].label);
    for (const input of inputs) {
      const field = columns.find(field => field.key === input.dataset.field);
      assert.equal(input.attributes['aria-label'], `${Number(input.dataset.row) + 1} · ${field.label}`);
    }
    assert.deepEqual(inputs, originalInputs, 'keep input identity and focus');
    assert.deepEqual(inputs.map(input => input.value), originalValues, 'do not change data');
    if (id !== 'scatter-chart') assert.equal(columns[1].label, '更新 series');
    else assert.equal(columns[0].label, 'X', 'scatter columns are coordinates, not series names');
  }
});
