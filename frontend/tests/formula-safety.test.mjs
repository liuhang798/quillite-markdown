import test from 'node:test';
import assert from 'node:assert/strict';
import { marked } from 'marked';
import { mathExtensions, renderLatex, renderLatexResult, collectFormulaRendering, formulaMarkdownMatches } from '../src/math-rendering.js';
import { scanMarkdownFormulas, formulaEditIsCurrent, formulaReplacement, formulaInsertion, matchPreviewFormulas } from '../src/formula-editing.js';
import { formulaValues, formulaTemplateById, buildFormulaExpression, buildFormulaMarkdown, formulaInlineHasNewline, parseFormulaMarkdown, resolveFormulaOutput } from '../src/formula-templates.js';
import { formulaFallbackSource } from '../src/formula-export.js';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
marked.use({ extensions: mathExtensions });
const renderer = readFileSync(new URL('../src/renderer.js', import.meta.url), 'utf8');

test('actual save handler rejects stale sessions/documents and preserves no-op source', () => {
  const saveSource = renderer.slice(renderer.indexOf('function insertGeneratedFormula()'), renderer.indexOf('\nconst diagramWizardState'));
  const original = '$x$ second', document = { toString: () => original };
  const run = ({ input = '$z$', mode = 'inline', session = 1, path = 'one.md', current = document, unchanged = false } = {}) => {
    const writes = [], messages = [];
    let closed = false;
    const context = {
      els: { formulaMarkdownSource: { value: input, focus() {} } },
      state: { editing: true, documentSession: session, currentFile: { path } },
      formulaWizardState: { mode, initialMarkdown: unchanged ? input : '$x$', editRange: { from: 0, to: 3, raw: '$x$', mode: 'inline' }, context: { session: 1, path: 'one.md', document } },
      codeEditor: { state: { doc: current }, dispatch: value => writes.push(value), focus() {} },
      $: () => ({ value: '1' }), showToast: message => messages.push(message), t: key => key,
      formulaEditIsCurrent, formulaReplacement, formulaInsertion, parseFormulaMarkdown, resolveFormulaOutput,
      buildFormulaMarkdown, formulaInlineHasNewline, renderLatex, renderLatexResult, formulaMarkdownMatches, closeFormulaDialog: () => { closed = true; },
    };
    vm.runInNewContext(saveSource + '\ninsertGeneratedFormula();', context);
    return { writes, messages, closed };
  };
  for (const change of [{ session: 2 }, { path: 'two.md' }, { current: { toString: () => 'SECOND_DOCUMENT_TEXT' } }]) {
    const result = run(change);
    assert.equal(result.writes.length, 0);
    assert.equal(result.closed, false);
    assert.deepEqual(result.messages, ['formulaEditStale']);
  }
  assert.equal(run({ unchanged: true }).writes.length, 0);
  assert.equal(run({ unchanged: true }).closed, true);
  assert.equal(run({ input: 'z^2' }).writes[0].changes.insert, '$z^2$');
  assert.equal(run({ input: '$\\frac{$' }).writes.length, 0);
  for (const input of ['x\\tag{A}', '$x\\tag{A}$', '\\(x\\tag{A}\\)']) {
    const result = run({ input });
    assert.deepEqual(result.messages, ['formulaInvalid']);
    assert.equal(result.writes.length, 0);
    assert.equal(result.closed, false);
  }
  for (const input of ['x\n+y', '$x\n+y$']) {
    const result = run({ input });
    assert.deepEqual(result.messages, ['formulaInlineMultiline']);
    assert.equal(result.writes.length, 0);
  }
  assert.equal(run({ input: 'x\\tag{A}', mode: 'block' }).writes.length, 1);
  assert.equal(run({ input: '$$x\\tag{A}$$' }).writes.length, 1);
  for (const input of ['\\text{katex-error}', '$\\text{katex-error}$', '$$\nx% katex-error\n+y\n$$']) {
    const result = run({ input });
    assert.equal(result.writes.length, 1, input);
    assert.deepEqual(result.messages, []);
  }
  // Validate added numbering too, not just the source before output conversion.
  assert.equal(run({ input: 'x\\tag{A}', mode: 'numbered' }).writes.length, 0);
  for (const input of ['\\text{$x$}', '$\\text{$x$}$', '\\text{a $x$ b}']) {
    const result = run({ input });
    assert.equal(result.writes.length, 0, input);
    assert.equal(result.closed, false);
    assert.deepEqual(result.messages, ['formulaDelimiterInvalid']);
  }
  for (const input of ['\\(\\text{$x$}\\)', '$$\n\\text{$x$}\n$$', '\\text{a\\$b}']) {
    assert.equal(run({ input }).writes.length, 1, input);
  }
});

test('structured rendering status never confuses text or annotations with errors', () => {
  for (const expression of ['\\text{katex-error}', 'x+\\text{katex-error}', 'x% katex-error\n+y']) {
    const result = renderLatexResult(expression, true);
    assert.equal(result.valid, true, expression);
    assert.equal(result.message, '');
    assert.match(result.html, /katex-error/); // Appears only in user content/annotation.
    assert.doesNotMatch(result.html, /class="katex-error"/);
  }
  assert.equal(renderLatexResult('x\\tag{A}', false).valid, false);
  assert.equal(renderLatexResult('x\\tag{A}', true).valid, true);
  assert.equal(renderLatexResult('\\frac{').valid, false);
});

test('preview and save resolve the same final output including bare source and numbering', () => {
  for (const [source, mode, valid] of [
    ['x\\tag{A}', 'inline', false], ['x\\tag{A}', 'block', true],
    ['$$x\\tag{A}$$', 'inline', true], ['$x\\tag{A}$', 'block', false],
    ['x', 'numbered', true], ['x\\tag{A}', 'numbered', false],
  ]) {
    const output = resolveFormulaOutput(source, mode, 'B');
    assert.deepEqual(parseFormulaMarkdown(output.markdown), { expression: output.expression, displayMode: output.displayMode });
    assert.equal(renderLatexResult(output.expression, output.displayMode).valid, valid);
  }
  assert.throws(() => resolveFormulaOutput('x\n+y', 'inline'), /FORMULA_INLINE_MULTILINE/);
  assert.match(renderer, /const output = resolveFormulaOutput\(els\.formulaMarkdownSource\.value/);
  assert.doesNotMatch(renderer, /\/katex-error\/\.test/);
});

test('actual output-mode handler keeps the manually edited source rather than stale fields', () => {
  const source = renderer.slice(renderer.indexOf('function chooseFormulaMode('), renderer.indexOf('\nfunction openFormulaDialog('));
  const field = { value: '$z^2$' }, number = { value: '3', classList: { toggle() {} } };
  const context = { els: { formulaMarkdownSource: field }, formulaWizardState: { sourceEdited: true }, $: () => number,
    parseFormulaMarkdown: value => ({ expression: value.replace(/^\$+\s*|\s*\$+$/g, ''), displayMode: true }),
    buildFormulaMarkdown, formulaInlineHasNewline, renderFormulaOutputModes() {}, updateFormulaPreview() { assert.fail('must not regenerate old parameters'); }, updateFormulaPreviewFromMarkdown() {} };
  vm.runInNewContext(source + '\nchooseFormulaMode("block");', context);
  assert.equal(field.value, '$$\nz^2\n$$');
  vm.runInNewContext(source + '\nchooseFormulaMode("numbered");', context);
  assert.equal(field.value, '$$\nz^2 \\tag{3}\n$$');
});

test('cursor-only changes reuse the index and document edits invalidate it', () => {
  const source = renderer.slice(renderer.indexOf('function currentFormulaIndex()'), renderer.indexOf('\nfunction updateExistingFlowchartButton('));
  let scans = 0;
  const context = { indexedFormulaDocument: null, indexedFormulas: [], codeEditor: { state: { doc: { toString: () => '$x$' } } }, scanMarkdownFormulas: () => { scans++; return []; } };
  vm.runInNewContext(source + '\nfor(let i=0;i<100;i++)currentFormulaIndex();', context);
  assert.equal(scans, 1);
  context.codeEditor.state.doc = { toString: () => '$y$' };
  vm.runInNewContext(source + '\ncurrentFormulaIndex();', context);
  assert.equal(scans, 2);
});

test('long formula is not truncated; no-op saves preserve exact delimiters, whitespace and CRLF', () => {
  const expression = Array.from({ length: 90 }, (_, i) => `x_{${i}}`).join('+');
  assert.equal(formulaValues(formulaTemplateById('custom'), { formula: expression }).formula, expression);
  for (const raw of [`$${expression}$`, `\\( ${expression} \\)`, `$$\r\n ${expression} \\tag{A} \r\n$$`]) {
    const range = scanMarkdownFormulas(raw)[0];
    assert.ok(range);
    const generated = buildFormulaMarkdown(range.mode, range.source, range.equationNumber);
    assert.equal(formulaReplacement(raw, range, generated, generated), raw);
  }
});

test('shared lexer matches quote/list/table/CRLF formulas and excludes all code forms', () => {
  for (const source of [
    '> $$\n> x^2\n> $$\n\n$y$',
    '$$\r\nx^2\r\n$$\r\n\r\n$y$',
    '> ```tex\n> $notMath$\n> ```\n\n$y$',
    '    $notMath$\n\n$y$', '<pre>$notMath$</pre>\n\n$y$',
    '`code starts\n$notMath$\nends`\n\n$y$',
    '- $x$\n- $y$', '- first\n\n  $$\n  x\n  $$\n\n$y$',
    '| $x$ | $x$ |\n| --- | --- |\n| $y$ | $z$ |',
    '> > $$\n> > x\n> > $$\n\n$y$',
  ]) {
    const rendered = [...marked.parse(source).matchAll(/data-math-source="([^"]+)"/g)].map(item => decodeURIComponent(item[1]));
    const ranges = scanMarkdownFormulas(source);
    assert.deepEqual(ranges.map(item => item.previewExpression), rendered, source);
    for (const range of ranges) assert.equal(source.slice(range.from, range.to), range.raw);
  }
});

test('replacement keeps quote and list continuation prefixes without changing subsequent formulas', () => {
  for (const source of ['> $$\r\n> x\r\n> $$\r\n\r\n$y$', '- first\n\n  $$\n  x\n  $$\n\n$y$']) {
    const range = scanMarkdownFormulas(source)[0];
    const replacement = formulaReplacement(source, range, '$$\nz^2\n$$');
    const result = source.slice(0, range.from) + replacement + source.slice(range.to);
    assert.deepEqual(scanMarkdownFormulas(result).map(item => item.source), ['z^2', 'y']);
    assert.equal(result.slice(-3), '$y$');
  }
});

test('preview matching checks content/mode and refuses ambiguous/reordered duplicates', () => {
  const ranges = scanMarkdownFormulas('$x$ $y$ $x$');
  const previews = ranges.map(item => ({ expression: item.previewExpression, displayMode: false }));
  assert.deepEqual(matchPreviewFormulas(ranges, previews), ranges);
  assert.deepEqual(matchPreviewFormulas(ranges, [previews[1]], false), [ranges[1]]);
  assert.deepEqual(matchPreviewFormulas(ranges, [previews[0]], false), [null]);
  assert.deepEqual(matchPreviewFormulas(ranges, [{ expression: 'wrong', displayMode: false }]), [null]);
  assert.deepEqual(matchPreviewFormulas([ranges[1]], [previews[1], previews[1]]), [null, null]);
});

test('only parser-produced math obtains per-render identity, not author-provided math HTML', () => {
  const input = '<span class="math-inline" data-math-source="x">fake</span> $x$';
  const first = collectFormulaRendering(() => marked.parse(input));
  const second = collectFormulaRendering(() => marked.parse(input));
  assert.equal(first.formulas.length, 1);
  assert.equal(first.formulas[0].expression, 'x');
  assert.notEqual(first.formulas[0].id, second.formulas[0].id);
  assert.equal((first.html.match(/data-math-origin=/g) || []).length, 1);
});

test('editing requires the same document session, path and immutable editor document', () => {
  const document = {}, context = { session: 1, path: 'one.md', document };
  assert.equal(formulaEditIsCurrent(context, context), true);
  for (const change of [{ session: 2 }, { path: 'two.md' }, { document: {} }]) {
    assert.equal(formulaEditIsCurrent(context, { ...context, ...change }), false);
  }
});

test('numeric and compound operands retain mathematical meaning', () => {
  const build = (id, values) => buildFormulaExpression(formulaTemplateById(id), values);
  assert.equal(build('newton-second-law', { mass: '2', acceleration: '3' }), 'F=2\\cdot 3');
  assert.equal(build('newton-second-law', { mass: 'a+b', acceleration: '-3' }), 'F=\\left(a+b\\right)\\cdot \\left(-3\\right)');
  assert.match(build('quadratic', { a: '1', b: '2', c: '3' }), /4\\cdot 1\\cdot 3/);
  assert.match(build('quadratic', { a: '1', b: '2', c: '3' }), /\{2\\cdot 1\}/);
  assert.equal(build('power', { base: 'x+y', exponent: '2', subscript: '' }), '\\left(x+y\\right)^{2}');
  assert.equal(build('power', { base: 'x_i', exponent: '2', subscript: 'j' }), '\\left(x_i\\right)_{j}^{2}');
  assert.equal(build('power', { base: 'x^2', exponent: '3', subscript: '' }), '\\left(x^2\\right)^{3}');
  assert.match(build('kinetic-energy', { mass: '2', velocity: '-3' }), /\\left\(-3\\right\)\^\{2\}/);
});

test('display insertion adds boundaries instead of producing literal dollars in a paragraph', () => {
  const source = 'before after', value = '$$\nx\n$$';
  const inserted = formulaInsertion(source, 7, 7, value);
  const result = source.slice(0, 7) + inserted + source.slice(7);
  assert.equal(scanMarkdownFormulas(result)[0].source, 'x');
  assert.match(marked.parse(result), /class="math-block"/);
  const quote = '> ' + formulaInsertion('> ', 2, 2, value);
  assert.equal(scanMarkdownFormulas(quote)[0].source, 'x');
  for (const before of ['before $x$ after', '> before $x$ after', '- before $x$ after', '> - before $x$ after']) {
    const range = scanMarkdownFormulas(before)[0];
    const replacement = formulaReplacement(before, range, value);
    const changed = before.slice(0, range.from) + replacement + before.slice(range.to);
    assert.equal(scanMarkdownFormulas(changed)[0].mode, 'block', changed);
    assert.match(marked.parse(changed), /class="math-block"/);
  }
});

test('unsafe/deep/long formula rendering never throws, executes commands or loses source', () => {
  for (const source of ['{'.repeat(1000) + 'x' + '}'.repeat(1000), 'x'.repeat(33000), '\\frac{']) {
    let html;
    assert.doesNotThrow(() => { html = renderLatex(source); });
    assert.match(html, /katex-error/);
    assert.ok(html.includes(source));
  }
  assert.doesNotMatch(renderLatex('\\href{javascript:alert(1)}{x}'), /href="javascript:/);
  assert.doesNotMatch(renderLatex('{'.repeat(257) + '<script>'), /<script>/);
});

test('export fallback retains source as text and tolerates malformed encoded attributes', () => {
  const formula = { dataset: { mathSource: encodeURIComponent('\\unsupported{<b>x</b>}') }, querySelector: () => ({ textContent: 'visible error' }) };
  assert.equal(formulaFallbackSource(formula), '\\unsupported{<b>x</b>}');
  formula.dataset.mathSource = '%invalid';
  assert.equal(formulaFallbackSource(formula), 'visible error');
});
