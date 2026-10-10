import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { searchFormulaTemplates, formulaTemplatesForDiscipline, FORMULA_DISCIPLINES } from '../src/formula-templates.js';

const renderer = readFileSync(new URL('../src/renderer.js', import.meta.url), 'utf8');
const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');

test('formula search supports bilingual names, subjects, aliases, fields and fullwidth queries', () => {
  for (const [query, id] of [['牛顿', 'newton-second-law'], ['NEWTON FORCE', 'newton-second-law'], ['ｎｅｗｔｏｎ', 'newton-second-law'], ['高斯', 'normal-distribution'], ['Gaussian', 'normal-distribution'], ['求导', 'derivative'], ['分子', 'fraction'], ['平方根', 'root'], ['ohms-law', 'ohms-law']]) {
    assert.ok(searchFormulaTemplates('all', query).some(item => item.id === id), query);
  }
  const physics = formulaTemplatesForDiscipline('physics');
  assert.deepEqual(searchFormulaTemplates('all', '物理'), physics);
  assert.deepEqual(searchFormulaTemplates('physics', '牛顿').map(item => item.id), ['newton-second-law']);
  assert.deepEqual(searchFormulaTemplates('mathematics', '牛顿'), []);
});

test('empty search preserves catalog order and hostile search strings are literal', () => {
  for (const discipline of FORMULA_DISCIPLINES) {
    assert.deepEqual(searchFormulaTemplates(discipline.id, '  '), formulaTemplatesForDiscipline(discipline.id));
  }
  for (const query of ['no-such-formula', '[.*', '<img onerror=alert(1)>', '__proto__']) {
    assert.deepEqual(searchFormulaTemplates('all', query), []);
  }
  assert.deepEqual(searchFormulaTemplates('missing', '牛顿'), []);
});

test('actual subject/search handlers only filter the catalog and keep the current draft', () => {
  const source = renderer.slice(renderer.indexOf('function chooseFormulaDiscipline('), renderer.indexOf('\nfunction chooseFormulaMode('));
  const field = { value: '牛顿' }, draft = { formula: 'my original expression' };
  const context = {
    FORMULA_DISCIPLINES, formulaWizardState: { discipline: 'mathematics', templateId: 'custom', searchQuery: '', sourceEdited: true, valuesByTemplate: draft },
    $: () => field, renderFormulaDisciplineTabs() {}, renderFormulaTemplateList() {},
  };
  vm.runInNewContext(source + '\nupdateFormulaSearch();', context);
  assert.equal(context.formulaWizardState.discipline, 'all');
  vm.runInNewContext(source + '\nchooseFormulaDiscipline("physics");', context);
  assert.equal(context.formulaWizardState.discipline, 'physics');
  field.value = '牛顿 力';
  vm.runInNewContext(source + '\nupdateFormulaSearch();', context);
  assert.equal(context.formulaWizardState.discipline, 'physics');
  field.value = '';
  vm.runInNewContext(source + '\nupdateFormulaSearch();', context);
  assert.equal(context.formulaWizardState.templateId, 'custom');
  assert.equal(context.formulaWizardState.valuesByTemplate, draft);
  assert.equal(context.formulaWizardState.sourceEdited, true);
});

test('search has translated labels, live result feedback and no accidental submit', () => {
  assert.match(html, /id="formulaSearch"[^>]*type="search"/);
  assert.match(html, /aria-controls="formulaTemplateList"/);
  assert.match(html, /id="formulaSearchStatus"[^>]*role="status"/);
  assert.match(renderer, /empty\.textContent = t\('formulaSearchEmpty'\)/);
  assert.match(renderer, /\$\('#formulaSearch'\)\.addEventListener\('input', updateFormulaSearch\)/);
  assert.doesNotMatch(renderer, /formulaSearch[^\n]*insertGeneratedFormula/);
  for (const key of ['formulaSearchLabel', 'formulaSearchPlaceholder', 'formulaSearchCount', 'formulaSearchEmpty', 'formulaSearchClear']) {
    assert.equal((renderer.match(new RegExp(`${key}:`, 'g')) || []).length, 2, key);
  }
});

test('actual template switch preserves manual source when cancelled and changes only after confirmation', () => {
  const source = renderer.slice(renderer.indexOf('function chooseFormulaTemplate('), renderer.indexOf('\nfunction chooseFormulaDiscipline('));
  const run = accepted => {
    let regenerated = 0;
    const context = {
      formulaTemplateById: id => ({ id }), formulaWizardState: { templateId: 'custom', sourceEdited: true },
      window: { confirm: () => accepted }, t: key => key, rememberFormulaFieldValues() {}, renderFormulaTemplateList() {},
      renderFormulaFields: () => { regenerated++; }, els: { formulaBuilderPanel: { scrollTop: 2 } }, requestAnimationFrame() {},
    };
    vm.runInNewContext(source + '\nchooseFormulaTemplate("newton-second-law");', context);
    return { templateId: context.formulaWizardState.templateId, regenerated };
  };
  assert.deepEqual(run(false), { templateId: 'custom', regenerated: 0 });
  assert.deepEqual(run(true), { templateId: 'newton-second-law', regenerated: 1 });
});
