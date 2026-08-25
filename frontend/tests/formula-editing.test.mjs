import test from 'node:test';
import assert from 'node:assert/strict';
import { findFormulaAt, scanMarkdownFormulas } from '../src/formula-editing.js';

test('formula lookup detects inline, display, numbered, and chemistry formulas', () => {
  const markdown = [
    '速度为 $v=at$，能量如下：',
    '',
    '$$',
    'E=mc^2 \\tag{A}',
    '$$',
    '',
    '水是 $\\ce{H2O}$。',
    '',
    '\\(a+b\\)',
  ].join('\n');
  const formulas = scanMarkdownFormulas(markdown);
  assert.equal(formulas.length, 4);
  assert.deepEqual(
    formulas.map(item => [item.source, item.mode, item.equationNumber, item.templateId]),
    [
      ['v=at', 'inline', '1', 'custom'],
      ['E=mc^2', 'numbered', 'A', 'custom'],
      ['H2O', 'inline', '1', 'chem-custom'],
      ['a+b', 'inline', '1', 'custom'],
    ],
  );
  assert.equal(findFormulaAt(markdown, markdown.indexOf('mc^2')).raw, '$$\nE=mc^2 \\tag{A}\n$$');
});

test('formula lookup ignores fenced and inline code and supports a selection inside a formula', () => {
  const markdown = ['```md', '$not_math$', '```', '', '代码 `$also_not_math$`，正文 $x_i^2$ 结束'].join('\n');
  const formulas = scanMarkdownFormulas(markdown);
  assert.equal(formulas.length, 1);
  assert.equal(formulas[0].source, 'x_i^2');
  const selected = findFormulaAt(markdown, markdown.indexOf('x_i'), markdown.indexOf('x_i') + 3);
  assert.deepEqual({ from: selected.from, to: selected.to }, { from: markdown.indexOf('$x_i'), to: markdown.indexOf('$x_i') + 7 });
});

test('formula lookup recognises bracket display formulas and does not treat currency as math', () => {
  const markdown = ['价格为 $12.50，不是公式。', '', '\\[', '\\frac{1}{2}', '\\]'].join('\n');
  const formulas = scanMarkdownFormulas(markdown);
  assert.equal(formulas.length, 1);
  assert.equal(formulas[0].source, '\\frac{1}{2}');
  assert.equal(formulas[0].mode, 'block');
});
