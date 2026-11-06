import test from 'node:test';
import assert from 'node:assert/strict';
import { findFormulaAt, scanMarkdownFormulas, FORMULA_SCAN_DOCUMENT_LIMIT, formulaReplacement, tableFormulaConstraint, tableFormulaExpression, tableFormulaVisualSource } from '../src/formula-editing.js';
import { editorFormulaItems } from '../src/editor-formula-preview.js';

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

test('GFM table formula mapping decodes only cell pipes while retaining exact edit and copy ranges', () => {
  const raw = '$\\left\\|x\\right\\|$', replacement = '$\\left\\|z\\right\\|$';
  const duplicate = '\\(y\\)';
  const markdown = [
    '正文 $\\|x\\|$',
    '',
    '> | 🧪 ' + duplicate + ' | ' + duplicate + ' |',
    '> | --- | --- |',
    '> | ' + raw + ' | **' + duplicate + '** |',
  ].join('\r\n');
  const formulas = scanMarkdownFormulas(markdown);
  assert.deepEqual(formulas.map(item => item.raw), ['$\\|x\\|$', duplicate, duplicate, raw, duplicate]);
  for (const item of formulas) assert.equal(markdown.slice(item.from, item.to), item.raw);
  const ordinary = formulas[0], table = formulas[3];
  assert.equal(ordinary.previewExpression, '\\|x\\|');
  assert.equal(table.previewExpression, '\\left|x\\right|');
  assert.equal(table.source, '\\left\\|x\\right\\|');
  assert.equal(table.from, markdown.indexOf(raw));
  assert.equal(findFormulaAt(markdown, table.from + 7, table.from + 7, formulas), table);
  assert.equal(formulaReplacement(markdown, table, raw, raw), raw);
  assert.equal(tableFormulaConstraint(markdown, table, { markdown: replacement, displayMode: false }), null);
  assert.equal(tableFormulaConstraint(markdown, table, { markdown: '$|z|$', displayMode: false }), 'formulaTablePipe');
  const next = markdown.slice(0, table.from) + formulaReplacement(markdown, table, replacement) + markdown.slice(table.to);
  assert.equal(next, markdown.replace(raw, replacement));
  assert.equal(scanMarkdownFormulas(next)[3].previewExpression, '\\left|z\\right|');
  const live = editorFormulaItems(raw, true)[0];
  assert.equal(live.raw, raw);
  assert.equal(live.previewExpression, table.previewExpression);
  assert.match(live.html, /<mo[^>]*>∣<\/mo>/);
  assert.doesNotMatch(live.html, /<mo[^>]*>∥<\/mo>/);
});

test('GFM formula mapping respects backslash parity, empty cells and omitted outer pipes', () => {
  const triple = '$x' + '\\'.repeat(3) + '|y$';
  const even = 'literal' + '\\'.repeat(2);
  const markdown = [
    'A | B | C',
    '--- | --- | ---',
    even + '| | ' + triple,
    '| ' + triple + ' || \\(z\\) |',
    '| missing | ' + triple,
  ].join('\n');
  const formulas = scanMarkdownFormulas(markdown);
  assert.deepEqual(formulas.map(item => item.raw), [triple, triple, '\\(z\\)', triple]);
  assert.deepEqual(formulas.filter(item => item.raw === triple).map(item => item.previewExpression),
    Array(3).fill('x' + '\\'.repeat(2) + '|y'));
  for (const item of formulas) assert.equal(markdown.slice(item.from, item.to), item.raw);
  assert.deepEqual(scanMarkdownFormulas('$$x$$', { tableCell: true }).map(item => item.mode), ['inline']);
});

test('visual formulas can write new bars without splitting a GFM table cell', () => {
  assert.equal(tableFormulaVisualSource('\\left|x\\right|'), '\\left\\|x\\right\\|');
  assert.equal(tableFormulaVisualSource('\\left\\|x\\right\\|'), '\\left\\Vert x\\right\\Vert');
  assert.equal(tableFormulaExpression(tableFormulaVisualSource('\\left|x\\right|')), '\\left|x\\right|');
});

test('editing a preview formula preserves even GFM tables outside the visual designer grammar', () => {
  const markdown = '| A | B |\n| -- | -- |\n| $x\\|y$ | $z$ |';
  const [range] = scanMarkdownFormulas(markdown);
  assert.equal(range.tableCell, true);
  assert.equal(tableFormulaConstraint(markdown, range, { markdown: '$x|y$', displayMode: false }), 'formulaTablePipe');
  assert.equal(tableFormulaConstraint(markdown, range, { markdown: '$x\\|y$', displayMode: false }), null);
});

test('scanner fails closed for extreme Markdown without leaking partial edit ranges', () => {
  for (const source of ['> '.repeat(4000) + '$x$', '> '.repeat(129) + '$x$',
    ' '.repeat(513) + '$x$', 'x'.repeat(FORMULA_SCAN_DOCUMENT_LIMIT) + '$x$']) {
    assert.deepEqual(scanMarkdownFormulas('$normal$\n\n' + source), []);
    assert.equal(findFormulaAt(source, source.length - 2), null);
  }
  assert.equal(scanMarkdownFormulas('> '.repeat(10) + '$x$').length, 1);
  // Deep inline token recursion is not a container prefix; lexer exceptions
  // must also leave the entire document editable, with no partial formula map.
  assert.doesNotThrow(() => scanMarkdownFormulas('['.repeat(4000) + '$x$' + '](url)'.repeat(4000)));
});
