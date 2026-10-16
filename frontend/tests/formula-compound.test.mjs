import test from 'node:test';
import assert from 'node:assert/strict';
import { buildFormulaExpression, formulaTemplateById, buildFormulaMarkdown, parseFormulaMarkdown } from '../src/formula-templates.js';
import { renderLatexResult } from '../src/math-rendering.js';

// Independent mathematical oracles: balanced TeX alone cannot detect changed precedence.
const cases = [
  ['logarithm', { base: 'a+b', value: 'u+v' }, String.raw`\log_{a+b} \left(u+v\right)`],
  ['eigenvalue', { matrix: 'A+B', eigenvalue: 'u+v', identity: 'I+J' }, String.raw`\det\left(\left(A+B\right)-\left(u+v\right)\cdot \left(I+J\right)\right)=0`],
  ['gradient', { function: 'u+v', variables: 'x,y' }, String.raw`\nabla \left(u+v\right)=\left(\frac{\partial \left(u+v\right)}{\partial x},\frac{\partial \left(u+v\right)}{\partial y}\right)`],
  ['mean', { variable: 'x+y', count: 'n+1' }, String.raw`\overline{x+y}=\frac{1}{n+1}\sum_{i=1}^{n+1}\left(x+y\right)_i`],
  ['weighted-mean', { value: 'x+y', weight: 'w+v', count: 'n+1' }, String.raw`\overline{x+y}=\frac{\sum_{i=1}^{n+1}\left(w+v\right)_i\cdot \left(x+y\right)_i}{\sum_{i=1}^{n+1}\left(w+v\right)_i}`],
  ['conditional-probability', { eventA: String.raw`A\cup B`, eventB: String.raw`C\cup D` }, String.raw`P(A\cup B\mid C\cup D)=\frac{P(\left(A\cup B\right)\cap \left(C\cup D\right))}{P(C\cup D)}`],
  ['mean', { variable: 'x_1', count: 'n' }, String.raw`\bar{x_1}=\frac{1}{n}\sum_{i=1}^{n}\left(x_1\right)_i`],
  ['weighted-mean', { value: 'x_{12}', weight: String.raw`\omega_2`, count: 'n' }, String.raw`\bar{x_{12}}=\frac{\sum_{i=1}^{n}\left(\omega_2\right)_i\cdot \left(x_{12}\right)_i}{\sum_{i=1}^{n}\left(\omega_2\right)_i}`],
];
for (const [id, values, expected] of cases) {
  test(`${id} preserves compound operand scope: ${JSON.stringify(values)}`, () => {
    const expression = buildFormulaExpression(formulaTemplateById(id), values);
    assert.equal(expression, expected);
    for (const mode of ['inline', 'block', 'numbered']) {
      const markdown = buildFormulaMarkdown(mode, expression, 'C-7');
      const parsed = parseFormulaMarkdown(markdown);
      assert.equal(parsed.expression, expression + (mode === 'numbered' ? String.raw` \tag{C-7}` : ''));
      assert.equal(renderLatexResult(parsed.expression, parsed.displayMode).valid, true);
    }
  });
}
