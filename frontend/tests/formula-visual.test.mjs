import test from 'node:test';
import assert from 'node:assert/strict';
import { validateLatex, convertLatexToMarkup } from 'mathlive/ssr';
import { canLoadVisualFormula, visualFormulaValue, hasFormulaPlaceholders, isMatrixCellPosition, FORMULA_STRUCTURES } from '../src/formula-visual-policy.js';
import { FORMULA_TEMPLATES, buildFormulaExpression, buildFormulaMarkdown, parseFormulaMarkdown, formulaInlineLayout } from '../src/formula-templates.js';
import { renderLatex } from '../src/math-rendering.js';
import { scanMarkdownFormulas, formulaReplacement } from '../src/formula-editing.js';
import { EditorState } from '@codemirror/state';
import { history, undo } from '@codemirror/commands';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

for (const template of FORMULA_TEMPLATES) test(`visual formula catalog: ${template.id} / ${template.name.zh}`, () => {
  const expression = buildFormulaExpression(template);
  assert.ok(canLoadVisualFormula(expression));
  assert.deepEqual(validateLatex(expression), []);
  assert.ok(convertLatexToMarkup(expression));
  for (const mode of ['inline', 'block', 'numbered']) {
    const source = buildFormulaMarkdown(mode, expression, 'B-2');
    const parsed = parseFormulaMarkdown(source);
    assert.doesNotMatch(renderLatex(parsed.expression, parsed.displayMode), /katex-error/);
    const range = scanMarkdownFormulas(source)[0];
    assert.ok(range);
    assert.equal(formulaReplacement(source, range, source, source), source);
    const edited = buildFormulaMarkdown(mode, `${expression}+0`, 'B-2');
    assert.doesNotMatch(renderLatex(parseFormulaMarkdown(edited).expression, mode !== 'inline'), /katex-error/);
    let state = EditorState.create({ doc: `before\n\n${source}\n\nafter`, extensions: [history()] });
    const original = state.doc.toString();
    state = state.update({ changes: { from: 8, to: 8 + source.length, insert: edited } }).state;
    const view = { state }; view.dispatch = transaction => { view.state = transaction.state; };
    assert.ok(undo(view));
    assert.equal(view.state.doc.toString(), original);
  }
});

test('visual formula no-op and undo retain exact source rather than normalized serialization', () => {
  for (const source of ['x + y', '\\frac { a } { b }', '\\ce{2 H2 + O2 -> 2 H2O}']) {
    assert.equal(visualFormulaValue(source, 'canonical', 'canonical'), source);
    assert.equal(visualFormulaValue(source, 'canonical', 'changed'), 'changed');
  }
});
test('visual formula parser rejects external commands, comments and unbounded input without changing source', () => {
  for (const source of ['x% comment\n+y', '\\href{https://example.org}{x}', '\\htmlClass{a}{x}', '\\includegraphics{x}', 'x'.repeat(8193), '{'.repeat(65) + 'x' + '}'.repeat(65)]) {
    assert.equal(canLoadVisualFormula(source), false);
    assert.equal(visualFormulaValue(source, 'unchanged', 'unchanged'), source);
  }
});
test('structure toolbar actions are fixed local LaTeX structures, not arbitrary commands', () => {
  assert.equal(new Set(FORMULA_STRUCTURES.map(([key]) => key)).size, FORMULA_STRUCTURES.length);
  for (const [_key, source] of FORMULA_STRUCTURES) assert.ok(canLoadVisualFormula(source));
});

test('unfilled structure slots are recognized without matching escaped or longer commands', () => {
  for (const value of [String.raw`\placeholder{}`, String.raw`\frac{x}{\placeholder{}}`, String.raw`\begin{matrix}a\\\placeholder{}\end{matrix}`]) {
    assert.equal(hasFormulaPlaceholders(value), true);
  }
  for (const value of ['x', String.raw`\frac{x}{2}`, String.raw`\\placeholder{}`, String.raw`\placeholderOther{}`]) {
    assert.equal(hasFormulaPlaceholders(value), false);
  }
});

test('matrix commands require a caret inside a matrix and never a neighbouring or selected block', () => {
  const atoms = [{ depth: 0, latex: '' }, { depth: 2, latex: 'a' }, { depth: 2, latex: 'b' },
    { depth: 1, latex: String.raw`\frac{a}{b}` }, { depth: 1, latex: 'c' },
    { depth: 0, latex: String.raw`\begin{bmatrix}\frac{a}{b}&c\end{bmatrix}` },
    { depth: 0, latex: '+x' }, { depth: 1, latex: 'z' }, { depth: 0, latex: String.raw`\sqrt{z}` }];
  const field = { position: 0, lastOffset: atoms.length - 1, selectionIsCollapsed: true, getElementInfo: offset => atoms[offset] };
  for (const position of [1, 2, 3, 4]) { field.position = position; assert.equal(isMatrixCellPosition(field), true); }
  for (const position of [0, 5, 6, 7, 8]) { field.position = position; assert.equal(isMatrixCellPosition(field), false); }
  field.position = 1; field.selectionIsCollapsed = false;
  assert.equal(isMatrixCellPosition(field), false);
  const source = readFileSync(new URL('../src/formula-visual-editor.js', import.meta.url), 'utf8');
  assert.ok(source.indexOf('!isMatrixCellPosition(field)') < source.indexOf('field.executeCommand(command)'));
});

test('incomplete structure shows actionable guidance, blocks insertion, then resumes normal rendering', () => {
  const renderer = readFileSync(new URL('../src/renderer.js', import.meta.url), 'utf8');
  const handler = renderer.slice(renderer.indexOf('function renderFormulaPreview('), renderer.indexOf('\nfunction updateFormulaPreviewFromMarkdown'));
  const preview = { textContent: '', innerHTML: '' }, button = { disabled: false };
  let calls = 0;
  const context = { hasFormulaPlaceholders, els: { formulaPreview: preview, formulaMarkdownSource: { value: '' } },
    $: () => button, t: key => key, formulaMarkdownMatches: () => true, showToast: () => {}, formulaWizardState: {},
    renderLatexResult: () => { calls++; return { valid: true, html: '<span>rendered</span>' }; }, DOMPurify: { sanitize: html => html } };
  vm.runInNewContext(handler, context);
  context.renderFormulaPreview(String.raw`\frac{x}{\placeholder{}}`, false);
  assert.equal(preview.textContent, 'formulaIncomplete');
  assert.equal(button.disabled, true);
  assert.equal(calls, 0);
  context.renderFormulaPreview(String.raw`\frac{x}{2}`, false);
  assert.equal(button.disabled, false);
  assert.equal(preview.innerHTML, '<span>rendered</span>');
  assert.equal(calls, 1);
});

test('late visual imports cannot reopen or overwrite a closed, changed or superseded dialog', async () => {
  const renderer = readFileSync(new URL('../src/renderer.js', import.meta.url), 'utf8');
  const handler = renderer.slice(renderer.indexOf('function syncFormulaVisualEditor()'), renderer.indexOf('\nfunction renderFormulaStructureToolbar()'));
  for (const change of ['close', 'context', 'supersede']) {
    let resolve, loads = [], creates = 0, hidden = false;
    const module = new Promise(done => { resolve = done; });
    const node = { textContent: '', open: false, classList: { toggle() {}, add() {} }, querySelectorAll: () => [] };
    const context = { formulaVisualRequest: 0, formulaVisualEditor: null, formulaVisualModule: module,
      formulaWizardState: { context: {}, mode: 'inline' }, state: { language: 'zh' },
      els: { formulaMarkdownSource: { value: '$x$' }, formulaDialog: { classList: { contains: () => hidden } } },
      $: () => node, t: value => value, parseFormulaMarkdown, formulaInlineLayout, };
    vm.runInNewContext(handler + '\nsyncFormulaVisualEditor();', context);
    if (change === 'close') hidden = true;
    if (change === 'context') context.formulaWizardState.context = {};
    if (change === 'supersede') {
      context.els.formulaMarkdownSource.value = '$y$';
      vm.runInNewContext('syncFormulaVisualEditor();', context);
    }
    resolve({ createFormulaVisualEditor() { creates++; return { load: source => { loads.push(source); return true; } }; } });
    await module; await Promise.resolve();
    assert.equal(creates, change === 'supersede' ? 1 : 0);
    assert.deepEqual(loads, change === 'supersede' ? ['y'] : []);
  }
});

test('offline visual editor disables CDN fonts, sounds and URL actions and keeps chemistry parameters', () => {
  const source = readFileSync(new URL('../src/formula-visual-editor.js', import.meta.url), 'utf8');
  const renderer = readFileSync(new URL('../src/renderer.js', import.meta.url), 'utf8');
  assert.match(source, /fontsDirectory = '\/vendor\/mathlive\/fonts'/);
  assert.match(source, /soundsDirectory = null/);
  assert.match(source, /openUrl = \(\) => \{\}/);
  assert.match(renderer, /formulaParameters'\)\.classList\.toggle\('hidden', template\.id === 'custom'\)/);
  assert.match(renderer, /syncFormulaVisualEditor\(\);\s*formulaInertElements/);
});

test('mathfield opts into pointer selection before mounting despite non-selectable application chrome', () => {
  const css = readFileSync(new URL('../src/styles.css', import.meta.url), 'utf8');
  const source = readFileSync(new URL('../src/formula-visual-editor.js', import.meta.url), 'utf8');
  assert.match(css, /body\s*\{[^}]*user-select:\s*none/);
  assert.match(css, /\.formula-visual-input\s*\{[^}]*-webkit-user-select:\s*text;[^}]*user-select:\s*text;[^}]*--wails-draggable:\s*no-drag/);
  assert.ok(source.indexOf("field.classList.add('formula-visual-input')") < source.indexOf('host.replaceChildren(field)'));
  const fixture = readFileSync(new URL('fixtures/formula-visual-audit.html', import.meta.url), 'utf8');
  assert.match(fixture, /import '\/src\/styles.css'/);
});
