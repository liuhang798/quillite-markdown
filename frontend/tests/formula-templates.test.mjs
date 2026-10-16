import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildFormulaExpression,
  buildFormulaMarkdown,
  FORMULA_DISCIPLINES,
  FORMULA_TEMPLATES,
  formulaPreviewExpression,
  formulaTemplateById,
  formulaTemplatesForDiscipline,
  parseFormulaMarkdown,
  safeEquationTag,
} from '../src/formula-templates.js';
import { renderLatex } from '../src/math-rendering.js';

test('vector template commands remain separated from edited plain-letter and compound operands', () => {
  for (const id of ['dot-product', 'cross-product']) {
    for (const values of [
      { left: 'u', right: 'v', angle: 'w' },
      { left: 'a+b', right: 'c+d', angle: '\\alpha+\\beta' },
      { left: '\\vec{u}', right: '\\mathbf{v}', angle: '2\\theta' },
    ]) {
      const expression = buildFormulaExpression(formulaTemplateById(id), values);
      assert.doesNotMatch(expression, /\\(?:lVert|times)[A-Za-z]/);
      assert.match(expression, /\\(?:sin|cos)\\left\(/);
      for (const display of [false, true]) {
        const html = renderLatex(expression, display);
        assert.match(html, /class="katex"/);
        assert.doesNotMatch(html, /katex-error|#cc0000/, `${id}: ${expression}`);
      }
      if (id === 'cross-product' && values.left === 'a+b') {
        assert.ok(expression.includes('\\left(a+b\\right)\\times \\left(c+d\\right)'));
      }
    }
  }
});

test('formula builder provides a broad catalog grouped by academic discipline', () => {
  assert.ok(FORMULA_TEMPLATES.length >= 70);
  assert.ok(FORMULA_DISCIPLINES.length >= 10);
  assert.ok(formulaTemplatesForDiscipline('mathematics').length >= 10);
  assert.ok(formulaTemplatesForDiscipline('calculus').length >= 10);
  assert.ok(formulaTemplatesForDiscipline('linear-algebra').length >= 8);
  assert.ok(formulaTemplatesForDiscipline('probability').length >= 9);
  assert.ok(formulaTemplatesForDiscipline('physics').length >= 8);
  assert.ok(formulaTemplatesForDiscipline('chemistry').length >= 7);
  assert.ok(formulaTemplatesForDiscipline('chemical-reaction').length >= 7);
  assert.equal(formulaTemplatesForDiscipline('all').length, FORMULA_TEMPLATES.length);
});

test('every math template renders edited parameters, not only its defaults', () => {
  for (const template of FORMULA_TEMPLATES.filter(item => item.kind === 'math')) {
    const values = Object.fromEntries(template.fields.map((item, index) => [item.key, 'uvwxyzabc'[index % 9]]));
    if (template.id === 'matrix3') Object.assign(values, {row1:'u,v,w',row2:'x,y,z',row3:'a,b,c'});
    const expression = buildFormulaExpression(template, values);
    for (const display of [false, true]) {
      const html = renderLatex(expression, display);
      assert.match(html, /class="katex"/, template.id);
      assert.doesNotMatch(html, /katex-error|#cc0000/, `${template.id}: ${expression}`);
    }
  }
});

test('every formula template has a unique id and renders its defaults without a KaTeX or mhchem error', () => {
  const ids = new Set();
  for (const template of FORMULA_TEMPLATES) {
    assert.ok(!ids.has(template.id), `duplicate formula id: ${template.id}`);
    ids.add(template.id);
    assert.ok(template.fields.length > 0, `${template.id} has no editable fields`);
    for (const field of template.fields) {
      assert.ok(field.label.zh && field.label.en, `${template.id}.${field.key} is missing a localized label`);
      assert.notEqual(field.value, undefined, `${template.id}.${field.key} is missing a default value`);
      assert.notEqual(field.placeholder, undefined, `${template.id}.${field.key} is missing a placeholder`);
    }

    const expression = buildFormulaExpression(template);
    assert.ok(expression, `${template.id} generated an empty expression`);
    assert.ok(!expression.includes('undefined'), `${template.id} leaked an undefined field into the formula`);

    const inline = renderLatex(expression, false);
    assert.match(inline, /class="katex"/, `${template.id} inline mode did not render with KaTeX`);
    assert.doesNotMatch(inline, /katex-error/, `${template.id} inline mode is invalid`);
    assert.doesNotMatch(inline, /#cc0000/, `${template.id} inline mode contains an unsupported KaTeX command`);

    const rendered = renderLatex(expression, true);
    assert.match(rendered, /class="katex"/, `${template.id} display mode did not render with KaTeX`);
    assert.doesNotMatch(rendered, /katex-error/, `${template.id} display mode is invalid`);
    assert.doesNotMatch(rendered, /#cc0000/, `${template.id} display mode contains an unsupported KaTeX command`);

    const numbered = renderLatex(formulaPreviewExpression('numbered', expression, '1'), true);
    assert.match(numbered, /class="katex"/, `${template.id} numbered mode did not render`);
    assert.doesNotMatch(numbered, /katex-error/, `${template.id} numbered mode is invalid`);
    assert.doesNotMatch(numbered, /#cc0000/, `${template.id} numbered mode contains an unsupported KaTeX command`);
  }
});

test('common formula templates generate valid LaTeX from user values', () => {
  assert.equal(
    buildFormulaExpression(formulaTemplateById('fraction'), { numerator: 'x+1', denominator: 'x-1' }),
    '\\frac{x+1}{x-1}',
  );
  assert.equal(
    buildFormulaExpression(formulaTemplateById('integral'), { lower: '0', upper: '1', expression: 'x^2', variable: 'x' }),
    '\\int_{0}^{1} x^2\\,dx',
  );
  assert.equal(
    buildFormulaExpression(formulaTemplateById('reaction'), { reactants: '2H2 + O2', products: '2H2O' }),
    '\\ce{2H2 + O2 -> 2H2O}',
  );
  assert.equal(
    buildFormulaExpression(formulaTemplateById('eigenvalue')),
    '\\det\\left(A-\\lambda\\cdot I\\right)=0',
  );
});

test('power and subscript builder supports power-only, subscript-only, or combined notation', () => {
  const power = formulaTemplateById('power');
  assert.equal(buildFormulaExpression(power, { base: 'x', exponent: '2', subscript: '' }), 'x^{2}');
  assert.equal(buildFormulaExpression(power, { base: 'x', exponent: '', subscript: 'i' }), 'x_{i}');
  assert.equal(buildFormulaExpression(power, { base: 'x', exponent: '2', subscript: 'i' }), 'x_{i}^{2}');
});

test('formula builder applies one shared inline, block, or numbered output mode to every subject', () => {
  assert.equal(buildFormulaMarkdown('inline', 'x^2'), '$x^2$');
  assert.equal(buildFormulaMarkdown('inline', '\\ce{H2O}'), '$\\ce{H2O}$');
  assert.equal(buildFormulaMarkdown('block', '\\ce{H2O}'), '$$\n\\ce{H2O}\n$$');
  assert.equal(buildFormulaMarkdown('block', 'E=mc^2'), '$$\nE=mc^2\n$$');
  assert.equal(buildFormulaMarkdown('numbered', 'E=mc^2', '2.1'), '$$\nE=mc^2 \\tag{2.1}\n$$');
  assert.equal(formulaPreviewExpression('numbered', 'x=1', 'A'), 'x=1 \\tag{A}');
});

test('equation numbers are constrained before being inserted into LaTeX', () => {
  assert.equal(safeEquationTag('{2}\\bad$'), '2bad');
  assert.equal(safeEquationTag(''), '1');
  assert.equal(safeEquationTag('123456789012345678901234567890'), '123456789012345678901234');
});

test('editable generated Markdown can be parsed back into a live formula preview', () => {
  assert.deepEqual(parseFormulaMarkdown('$x_i^2$'), { expression: 'x_i^2', displayMode: false });
  assert.deepEqual(parseFormulaMarkdown('$$\nx_1+x_2 \\tag{A}\n$$'), { expression: 'x_1+x_2 \\tag{A}', displayMode: true });
  assert.deepEqual(parseFormulaMarkdown('\\[E=mc^2\\]'), { expression: 'E=mc^2', displayMode: true });
  assert.deepEqual(parseFormulaMarkdown('\\(a+b\\)'), { expression: 'a+b', displayMode: false });
  assert.deepEqual(parseFormulaMarkdown('\\frac{1}{2}'), { expression: '\\frac{1}{2}', displayMode: true });
});
