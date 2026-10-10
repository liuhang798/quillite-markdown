import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
import { buildFormulaExpression, buildFormulaMarkdown, formulaInlineHasNewline, formulaTemplateById, parseFormulaMarkdown, formulaInlineLayout, resolveFormulaOutput } from '../src/formula-templates.js';
import { renderLatex, renderLatexResult, formulaMarkdownMatches } from '../src/math-rendering.js';
import { scanMarkdownFormulas, formulaEditIsCurrent, formulaInsertion, formulaReplacement } from '../src/formula-editing.js';
const renderer = readFileSync(new URL('../src/renderer.js', import.meta.url), 'utf8');
const build = (id, values) => buildFormulaExpression(formulaTemplateById(id), values);

test('gradient follows the variable names and number of dimensions, never hardcodes xyz', () => {
  for (const variables of ['u', 'u,v', 'u, v, w, t', '\\theta,x_1', 'u，v']) {
    const parts = variables.split(/[,，]/).map(value => value.trim());
    const expression = build('gradient', { function: 'g', variables });
    assert.equal(expression, `\\nabla g=\\left(${parts.map(value => `\\frac{\\partial g}{\\partial ${value}}`).join(',')}\\right)`);
    assert.doesNotMatch(renderLatex(expression, true), /katex-error/);
  }
});

test('invalid gradient lists and variable expressions are rejected, not silently altered', () => {
  for (const variables of ['', ' ', ',u', 'u,', 'u,,v', Array(17).fill('u').join(',')]) {
    assert.throws(() => build('gradient', { variables }), /FORMULA_VARIABLES_INVALID/);
  }
  for (const variables of ['u+v', 'g(u)', 'theta', 'u,2']) {
    assert.throws(() => build('gradient', { variables }), /FORMULA_VARIABLE_INVALID/);
  }
});

test('double integral includes both differentials with editable independent variables', () => {
  assert.equal(build('double-integral'), '\\iint_{D} f(x,y)\\,dx\\,dy');
  assert.equal(build('double-integral', { domain: '\\Omega', expression: 'h(u,v)', variable1: 'u', variable2: 'v' }), '\\iint_{\\Omega} h(u,v)\\,du\\,dv');
  assert.equal(build('double-integral', { variable1: '\\theta', variable2: 'x_{12}' }), '\\iint_{D} f(x,y)\\,d\\theta\\,dx_{12}');
  assert.throws(() => build('double-integral', { variable1: '' }), /FORMULA_VARIABLE_INVALID/);
  assert.throws(() => build('double-integral', { variable2: 'x+y' }), /FORMULA_VARIABLE_INVALID/);
});

test('Taylor series uses the chosen function, variable and summation index consistently', () => {
  assert.equal(build('taylor-series', { function: 'g', variable: 't', index: 'k', center: 'a+b' }),
    'g(t)=\\sum_{k=0}^{\\infty}\\frac{g^{(k)}(a+b)}{k!}\\left(t-\\left(a+b\\right)\\right)^{k}');
  const expression = build('taylor-series', { function: '\\phi', variable: 'u', center: '-2' });
  assert.match(expression, /\\phi\(u\)/);
  assert.match(expression, /u-\\left\(-2\\right\)/);
  assert.doesNotMatch(expression, /f\^|\(x-/);
  assert.throws(() => build('taylor-series', { function: 'g(t)' }), /FORMULA_VARIABLE_INVALID/);
});

test('corrected calculus formulas render and round-trip in all three output modes', () => {
  const expressions = [build('gradient', { function: 'g', variables: 'u,v' }),
    build('double-integral', { expression: 'g(u,v)', variable1: 'u', variable2: 'v' }),
    build('taylor-series', { function: 'g', variable: 't', center: 'a+b' })];
  for (const expression of expressions) for (const mode of ['inline', 'block', 'numbered']) {
    const markdown = buildFormulaMarkdown(mode, expression, '4');
    const parsed = parseFormulaMarkdown(markdown);
    assert.doesNotMatch(renderLatex(parsed.expression, parsed.displayMode), /katex-error/);
    assert.equal(scanMarkdownFormulas(markdown).length, 1);
    assert.equal(scanMarkdownFormulas(markdown)[0].mode, mode);
  }
});

test('inline generation rejects LF and CRLF without changing comments or block source', () => {
  for (const expression of ['a\n+b', 'a\r\n+b', 'a % keep this comment\n+b']) {
    assert.equal(formulaInlineHasNewline(expression), true);
    assert.throws(() => buildFormulaMarkdown('inline', expression), /FORMULA_INLINE_MULTILINE/);
    assert.equal(parseFormulaMarkdown(buildFormulaMarkdown('block', expression)).expression, expression);
  }
  assert.equal(buildFormulaMarkdown('inline', '\n x \n'), '$x$');
});

test('actual mode handler refuses multiline inline conversion and preserves exact source', () => {
  const source = renderer.slice(renderer.indexOf('function chooseFormulaMode('), renderer.indexOf('\nfunction openFormulaDialog('));
  for (const sourceEdited of [true, false]) {
    const original = '$$\r\na % comment\r\n+b\r\n$$', messages = [];
    const context = { els: { formulaMarkdownSource: { value: original } }, formulaWizardState: { mode: 'block', sourceEdited },
      parseFormulaMarkdown, formulaInlineHasNewline, t: key => key, showToast: key => messages.push(key),
      $() { assert.fail('must not change mode controls'); }, renderFormulaOutputModes() { assert.fail(); } };
    vm.runInNewContext(source + '\nchooseFormulaMode("inline");', context);
    assert.equal(context.els.formulaMarkdownSource.value, original);
    assert.equal(context.formulaWizardState.mode, 'block');
    assert.equal(context.formulaWizardState.sourceEdited, sourceEdited);
    assert.deepEqual(messages, ['formulaInlineMultiline']);
  }
});

test('actual manual preview blocks multiline inline source, including undelimited drafts', () => {
  const source = renderer.slice(renderer.indexOf('function updateFormulaPreviewFromMarkdown('), renderer.indexOf('\nfunction chooseFormulaTemplate('));
  for (const input of ['$a\n+b$', '\\(a\r\n+b\\)', 'a\n+b']) {
    const button = { classList: { toggle() {} } }, context = { els: { formulaMarkdownSource: { value: input }, formulaPreview: {} },
      formulaWizardState: { mode: 'inline' }, parseFormulaMarkdown, formulaInlineHasNewline, formulaInlineLayout, renderFormulaOutputModes() {}, $: () => button, t: key => key,
      renderFormulaPreview() { assert.fail('must not show a misleading successful preview'); } };
    vm.runInNewContext(source + '\nupdateFormulaPreviewFromMarkdown();', context);
    assert.equal(button.disabled, true);
    assert.equal(context.els.formulaPreview.textContent, 'formulaInlineMultiline');
    assert.equal(context.els.formulaMarkdownSource.value, input);
  }
});

test('multiline manual display and numbered previews remain supported', () => {
  const source = renderer.slice(renderer.indexOf('function updateFormulaPreviewFromMarkdown('), renderer.indexOf('\nfunction chooseFormulaTemplate('));
  for (const input of ['$$\na % comment\n+b\n$$', '$$\na\n+b \\tag{2}\n$$', '\\[a\r\n+b\\]', 'a\n+b']) {
    const previews = [], context = { els: { formulaMarkdownSource: { value: input } },
      formulaWizardState: { mode: 'block' }, parseFormulaMarkdown, resolveFormulaOutput, formulaInlineHasNewline, formulaInlineLayout,
      $: () => ({ classList: { toggle() {} } }), renderFormulaOutputModes() {},
      renderFormulaPreview: (expression, displayMode) => previews.push({ expression, displayMode }) };
    vm.runInNewContext(source + '\nupdateFormulaPreviewFromMarkdown();', context);
    assert.equal(previews.length, 1);
    assert.equal(previews[0].displayMode, true);
    assert.equal(previews[0].expression, parseFormulaMarkdown(input).expression);
  }
});

test('actual field preview handles invalid variables and keeps custom multiline fields intact', () => {
  const source = renderer.slice(renderer.indexOf('function updateFormulaPreview('), renderer.indexOf('\nfunction renderFormulaPreview('));
  for (const [templateId, values, message] of [['gradient', { function: 'g', variables: 'u,' }, 'formulaVariablesInvalid'],
    ['taylor-series', { function: 'g(t)', variable: 't', center: 'a', index: 'n' }, 'formulaVariableInvalid'],
    ['custom', { formula: 'a % comment\n+b' }, 'formulaInlineMultiline']]) {
    const button = {}, context = { els: { formulaMarkdownSource: {}, formulaPreview: {} },
      formulaWizardState: { templateId, mode: 'inline', valuesByTemplate: new Map(), sourceEdited: true },
      formulaTemplateById, buildFormulaExpression, formulaInlineHasNewline, formulaFieldValues: () => values,
      $: () => button, t: key => key, renderFormulaPreview() { assert.fail(); } };
    vm.runInNewContext(source + '\nupdateFormulaPreview();', context);
    assert.equal(button.disabled, true);
    assert.equal(context.els.formulaPreview.textContent, message);
    assert.equal(context.formulaWizardState.valuesByTemplate.get(templateId), values);
    assert.equal(context.formulaWizardState.sourceEdited, false);
    if (templateId === 'custom') assert.equal(context.els.formulaMarkdownSource.value, values.formula);
  }
});

test('actual save handler cannot bypass multiline inline guard or write any document changes', () => {
  const source = renderer.slice(renderer.indexOf('function insertGeneratedFormula()'), renderer.indexOf('\nconst diagramWizardState'));
  for (const input of ['$a\n+b$', '\\(a\r\n+b\\)', 'a\n+b']) {
    const document = { toString: () => 'keep original' }, writes = [], messages = [];
    const context = { els: { formulaMarkdownSource: { value: input } }, state: { editing: true, documentSession: 1, currentFile: { path: 'one.md' } },
      codeEditor: { state: { doc: document }, dispatch: value => writes.push(value) },
      formulaWizardState: { mode: 'inline', context: { session: 1, path: 'one.md', document, selection: { from: 0, to: 0 } } },
      formulaEditIsCurrent, formulaInsertion, formulaReplacement, parseFormulaMarkdown, resolveFormulaOutput, formulaInlineHasNewline,
      $: () => ({ value: '1' }), buildFormulaMarkdown, renderLatex, renderLatexResult, formulaMarkdownMatches, showToast: key => messages.push(key), t: key => key,
      closeFormulaDialog() { assert.fail('must keep the dialog and draft open'); } };
    vm.runInNewContext(source + '\ninsertGeneratedFormula();', context);
    assert.equal(writes.length, 0);
    assert.deepEqual(messages, ['formulaInlineMultiline']);
  }
});
