import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { FORMULA_TEMPLATES, buildFormulaExpression, buildFormulaMarkdown, parseFormulaMarkdown, formulaInlineLayout, applyFormulaInlineLayout, formulaInlineHasNewline } from '../src/formula-templates.js';
import { renderLatex } from '../src/math-rendering.js';
import { scanMarkdownFormulas, formulaReplacement } from '../src/formula-editing.js';

for (const template of FORMULA_TEMPLATES) {
  test(`inline layout round trip and valid rendering: ${template.id}`, () => {
    const original = buildFormulaExpression(template);
    const large = applyFormulaInlineLayout(original, 'large');
    assert.equal(large, `\\displaystyle ${original}`);
    assert.equal(applyFormulaInlineLayout(large, 'large'), large);
    assert.equal(applyFormulaInlineLayout(large, 'normal'), original);
    assert.deepEqual(formulaInlineLayout(large), { layout: 'large', expression: original });
    assert.doesNotMatch(renderLatex(large, false), /katex-error|katex-display/);
    assert.doesNotMatch(renderLatex(original, false), /katex-error/);
    if (/[\r\n]/.test(original)) {
      assert.throws(() => buildFormulaMarkdown('inline', large), /FORMULA_INLINE_MULTILINE/);
      return;
    }
    const markdown = buildFormulaMarkdown('inline', large);
    assert.deepEqual(parseFormulaMarkdown(markdown), { expression: large, displayMode: false });
    const doc = `before ${markdown} after`, range = scanMarkdownFormulas(doc)[0];
    assert.equal(range.mode, 'inline');
    assert.equal(range.previewExpression, large);
    assert.equal(formulaReplacement(doc, range, markdown, markdown), markdown);
    assert.equal(doc.slice(0, range.from) + buildFormulaMarkdown('inline', applyFormulaInlineLayout(large, 'normal')) + doc.slice(range.to), `before $${original}$ after`);
  });
}

test('style control changes only a leading complete declaration, never nested commands or comments', () => {
  for (const expression of ['{\\displaystyle x}', 'x+{\\displaystyle y}', '\\displaystyleX', '\\\\displaystyle x', 'x% note\n+y', '\\ce{H2SO4}', 'x_{a}^{n}']) {
    assert.equal(formulaInlineLayout(expression).expression, expression);
    assert.equal(applyFormulaInlineLayout(applyFormulaInlineLayout(expression, 'large'), 'normal'), expression);
  }
  assert.deepEqual(formulaInlineLayout('\\displaystyle\\frac{1}{n}'), { layout: 'large', expression: '\\frac{1}{n}' });
  assert.equal(applyFormulaInlineLayout('\\textstyle x+y', 'large'), '\\displaystyle x+y');
  assert.equal(applyFormulaInlineLayout('', 'large'), '');
  assert.equal(applyFormulaInlineLayout('\\displaystyle ', 'normal'), '');
  assert.throws(() => applyFormulaInlineLayout('x', 'other'), /FORMULA_LAYOUT_INVALID/);
});

test('large inline fractions use full-size terms while ordinary inline fractions remain compact', () => {
  const expression = '\\bar{x}=\\frac{1}{n}\\sum_{i=1}^{n}x_i';
  const normal = renderLatex(expression, false), large = renderLatex(applyFormulaInlineLayout(expression, 'large'), false);
  assert.match(normal, /sizing reset-size6 size3/);
  assert.match(large, /displaystyle="true"/);
  assert.match(large, /op-symbol large-op/);
  assert.doesNotMatch(renderLatex('\\displaystyle \\frac{1}{n}', false), /sizing reset-size6 size3/);
  assert.match(large, /msupsub/); // Scripts keep proper hierarchy; not global scaling.
  assert.doesNotMatch(large, /katex-display/);
});

test('inline layout controls are bilingual, accessible and confined to the current equation dialog', () => {
  const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
  const renderer = readFileSync(new URL('../src/renderer.js', import.meta.url), 'utf8');
  assert.match(html, /id="formulaInlineLayouts"[^>]*role="group"[^>]*data-i18n-aria-label="formulaInlineLayout"/);
  for (const layout of ['normal', 'large']) assert.match(html, new RegExp(`data-formula-layout="${layout}"`));
  assert.match(renderer, /formulaLayoutLarge: '大号排版'/);
  assert.match(renderer, /formulaLayoutLarge: 'Large layout'/);
  assert.match(renderer, /button\.setAttribute\('aria-pressed', String\(active\)\)/);
  assert.match(renderer, /formulaWizardState\.inlineLayout = formulaInlineLayout\(selected\.source\)\.layout/);
  assert.match(renderer, /const layout = formulaInlineLayout\(parsed\.expression\)\.layout/);
});

test('actual layout handler updates only the current inline draft and rejects multiline or display input', () => {
  const renderer = readFileSync(new URL('../src/renderer.js', import.meta.url), 'utf8');
  const handler = renderer.slice(renderer.indexOf('function chooseFormulaInlineLayout('), renderer.indexOf('\nfunction openFormulaDialog('));
  for (const [mode, initial, change] of [['inline', '$\\frac{1}{n}$', true], ['block', '$$\nx\n$$', false], ['inline', '$x%comment\n+y$', false]]) {
    let updates = 0;
    const context = { formulaWizardState: { mode }, els: { formulaMarkdownSource: { value: initial } },
      parseFormulaMarkdown, applyFormulaInlineLayout, formulaInlineHasNewline, buildFormulaMarkdown,
      updateFormulaPreviewFromMarkdown() { updates++; }, showToast() {}, t: key => key };
    vm.runInNewContext(handler + '\nchooseFormulaInlineLayout("large");', context);
    assert.equal(updates, change ? 1 : 0);
    assert.equal(context.els.formulaMarkdownSource.value, change ? '$\\displaystyle \\frac{1}{n}$' : initial);
    vm.runInNewContext('chooseFormulaInlineLayout("normal");', context);
    assert.equal(context.els.formulaMarkdownSource.value, initial);
  }
});

test('actual visual callback preserves large inline layout across edits and undo', () => {
  const renderer = readFileSync(new URL('../src/renderer.js', import.meta.url), 'utf8');
  const handler = renderer.slice(renderer.indexOf('function syncFormulaVisualEditor()'), renderer.indexOf('\nfunction renderFormulaStructureToolbar()'));
  let callback, loaded;
  const node = { textContent: '', classList: { toggle() {}, add() {} }, querySelectorAll: () => [], value: '1' };
  const context = { formulaVisualRequest: 0, formulaVisualEditor: null, formulaVisualModule: null,
    formulaWizardState: { context: {}, mode: 'inline' }, state: { language: 'zh' },
    els: { formulaMarkdownSource: { value: '$\\displaystyle \\frac{1}{n}$' }, formulaDialog: { classList: { contains: () => false } } },
    $: () => node, t: key => key, parseFormulaMarkdown, formulaInlineLayout, applyFormulaInlineLayout, buildFormulaMarkdown,
    renderFormulaOutputModes() {}, updateFormulaPreviewFromMarkdown() {} };
  // Resolve the dynamic module synchronously without importing a browser runtime.
  context.formulaVisualModule = { then(apply) {
    apply({ createFormulaVisualEditor(_host, onChange) { callback = onChange; return { load(source) { loaded = source; return true; } }; } });
    return { catch() {} };
  } };
  vm.runInNewContext(handler + '\nsyncFormulaVisualEditor();', context);
  assert.equal(loaded, '\\frac{1}{n}');
  callback('\\frac{2}{n}');
  assert.equal(context.els.formulaMarkdownSource.value, '$\\displaystyle \\frac{2}{n}$');
  callback('\\frac{1}{n}');
  assert.equal(context.els.formulaMarkdownSource.value, '$\\displaystyle \\frac{1}{n}$');
  // Advanced source can change delimiters before the mode controls refresh.
  context.formulaVisualEditor = null;
  context.els.formulaMarkdownSource.value = '$$\n\\textstyle \\frac{1}{n}\n$$';
  vm.runInNewContext('syncFormulaVisualEditor();', context);
  assert.equal(loaded, '\\textstyle \\frac{1}{n}');
});
