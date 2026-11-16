import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

const renderer = readFileSync(new URL('../src/renderer.js', import.meta.url), 'utf8');
const helper = renderer.slice(renderer.indexOf('function previewFormulaElements('), renderer.indexOf('function openEditorDiagram('));
const { previewFormulaElements } = vm.runInNewContext(helper + '\n({ previewFormulaElements });');

test('split preview indexes all formula origins with one DOM query and keeps render order', () => {
  const formulas = Array.from({ length: 300 }, (_, i) => ({ id: `generated-${i}` }));
  const elements = formulas.map(({ id }) => ({ dataset: { mathOrigin: id } }));
  let queries = 0;
  const container = {
    querySelectorAll(selector) {
      assert.equal(selector, '[data-math-origin]');
      queries++;
      return [...elements].reverse();
    }
  };
  assert.deepEqual([...previewFormulaElements(container, formulas)], elements);
  assert.equal(queries, 1);
  assert.deepEqual([...previewFormulaElements(container, [])], []);
  assert.equal(queries, 1);
});

test('split preview refuses missing and duplicated formula origins', () => {
  const element = { dataset: { mathOrigin: 'valid' } };
  const duplicate = { dataset: { mathOrigin: 'duplicate' } };
  const container = {
    querySelectorAll: () => [element, duplicate, duplicate, duplicate, { dataset: { mathOrigin: 'unknown' } }]
  };
  assert.deepEqual([...previewFormulaElements(container, [
    { id: 'missing' }, { id: 'duplicate' }, { id: 'valid' }
  ])], [null, null, element]);
});
