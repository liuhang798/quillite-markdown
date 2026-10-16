import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
import { FORMULA_TEMPLATES, buildFormulaExpression, buildFormulaMarkdown, resolveFormulaOutput, parseFormulaMarkdown, formulaInlineLayout, applyFormulaInlineLayout } from '../src/formula-templates.js';
import { formulaMarkdownMatches, renderLatexResult } from '../src/math-rendering.js';
import { hasFormulaPlaceholders } from '../src/formula-visual-policy.js';
import { tableFormulaConstraint } from '../src/formula-editing.js';

test('clicking an unchanged inline layout preserves exact source and template edit state', () => {
  const renderer = readFileSync(new URL('../src/renderer.js', import.meta.url), 'utf8');
  const fn = renderer.slice(renderer.indexOf('function chooseFormulaInlineLayout('), renderer.indexOf('\nfunction openFormulaDialog('));
  for (const [source, layout] of [['\\( x+y \\)', 'normal'], ['$\\textstyle  x+y$', 'normal'], ['$\\displaystyle x+y$', 'large'], ['\\(\\displaystyle   x+y\\)', 'large']]) {
    for (const sourceEdited of [false, true]) {
      let updates = 0;
      const context = { els: {formulaMarkdownSource: {value: source}}, formulaWizardState: {mode: 'inline', sourceEdited},
        parseFormulaMarkdown, formulaInlineLayout, applyFormulaInlineLayout, buildFormulaMarkdown, formulaInlineHasNewline: () => false,
        updateFormulaPreviewFromMarkdown() { updates++; } };
      vm.runInNewContext(fn + `\nchooseFormulaInlineLayout('${layout}');`, context);
      assert.equal(context.els.formulaMarkdownSource.value, source);
      assert.equal(context.formulaWizardState.sourceEdited, sourceEdited);
      assert.equal(updates, 0);
    }
  }
});

test('changing inline layout still updates the expression and preview once', () => {
  const renderer = readFileSync(new URL('../src/renderer.js', import.meta.url), 'utf8');
  const fn = renderer.slice(renderer.indexOf('function chooseFormulaInlineLayout('), renderer.indexOf('\nfunction openFormulaDialog('));
  let updates = 0;
  const context = {els: {formulaMarkdownSource: {value: '$x+y$'}}, formulaWizardState: {mode: 'inline'},
    parseFormulaMarkdown, formulaInlineLayout, applyFormulaInlineLayout, buildFormulaMarkdown, formulaInlineHasNewline: () => false,
    updateFormulaPreviewFromMarkdown() { updates++; }};
  vm.runInNewContext(fn + "\nchooseFormulaInlineLayout('large');", context);
  assert.equal(context.els.formulaMarkdownSource.value, '$\\displaystyle x+y$');
  assert.equal(updates, 1);
});

test('formula dialog rejects structural table breaks without rewriting LaTeX', () => {
  for(const prefix of ['', '> ', '  ']) for(const eol of ['\n','\r\n']) {
    const source=(prefix==='  '?'1. 表格'+eol+eol:'')+['| 内容 | 另一列 |','| --- | --- |','| $x$ | 保留 |'].map(line=>prefix+line).join(eol)+eol+eol+'正文 $y$';
    const from=source.indexOf('$x$'),range={from,to:from+3};
    for(const markdown of ['$x$','$x\\vert y$','$x\\|y$','$\\displaystyle x^2$']) assert.equal(tableFormulaConstraint(source,range,{markdown,displayMode:false}),null);
    for(const markdown of ['$x|y$','$x\\\\|y$']) assert.equal(tableFormulaConstraint(source,range,{markdown,displayMode:false}),'formulaTablePipe');
    for(const markdown of ['$$\nx^2\n$$','\\[x^2\\]','$x\ny$']) assert.equal(tableFormulaConstraint(source,range,{markdown,displayMode:markdown!=='$x\ny$'}),'formulaTableInline');
    assert.equal(tableFormulaConstraint(source,{from:source.indexOf('$y$'),to:source.length},{markdown:'$$\nx\n$$',displayMode:true}),null);
    assert.equal(tableFormulaConstraint(source,{from:0,to:source.length},{markdown:'$$\nx\n$$',displayMode:true}),null);
  }
});

test('final Markdown must contain exactly one complete formula with identical content and mode', () => {
  for (const expression of [String.raw`\text{$x$}`, String.raw`\text{a $x$ b}`]) {
    assert.equal(renderLatexResult(expression, false).valid, true);
    assert.equal(formulaMarkdownMatches(`$${expression}$`, expression, false), false);
    assert.equal(formulaMarkdownMatches(`\\(${expression}\\)`, expression, false), true);
    assert.equal(formulaMarkdownMatches(`$$\n${expression}\n$$`, expression, true), true);
  }
  for (const [markdown, expression, display] of [
    ['$x$ trailing', 'x', false], ['$x$ $y$', 'x', false],
    ['$x$', 'y', false], ['$x$', 'x', true], ['$$x$$', 'x', false],
    ['`$x$`', 'x', false], ['<span>$x$</span>', 'x', false],
    ['> $x$', 'x', false], ['x', 'x', false], ['$x\\$', 'x\\', false],
  ]) assert.equal(formulaMarkdownMatches(markdown, expression, display), false, markdown);
  for (const [markdown, expression, display] of [
    ['$x$', 'x', false], [String.raw`$\text{a\$b}$`, String.raw`\text{a\$b}`, false],
    ['$$\r\nx% comment\r\n+y\r\n$$', 'x% comment\r\n+y', true],
    [String.raw`\[x\tag{A}\]`, String.raw`x\tag{A}`, true],
  ]) assert.equal(formulaMarkdownMatches(markdown, expression, display), true, markdown);
  assert.equal(formulaMarkdownMatches('> '.repeat(4000) + '$x$', 'x', false), false);
  assert.equal(formulaMarkdownMatches('$' + 'x'.repeat(65536) + '$', 'x', false), false);
});

test('all 79 templates preserve their actual Markdown grammar in normal/large and three output modes', () => {
  for (const template of FORMULA_TEMPLATES) for (const mode of ['inline', 'block', 'numbered']) {
    const expression = buildFormulaExpression(template);
    if (mode === 'inline' && /[\r\n]/.test(expression)) continue;
    for (const value of [expression, `\\displaystyle ${expression}`]) {
      const output = resolveFormulaOutput(buildFormulaMarkdown(mode, value, 'A'), mode);
      assert.equal(formulaMarkdownMatches(output.markdown, output.expression, output.displayMode), true, `${template.id}:${mode}`);
    }
  }
});

test('actual preview disables submission without losing the draft; compatible wrappers and bare input work', () => {
  const renderer = readFileSync(new URL('../src/renderer.js', import.meta.url), 'utf8');
  const preview = renderer.slice(renderer.indexOf('function renderFormulaPreview('), renderer.indexOf('\nfunction chooseFormulaTemplate('));
  for (const [input, blocked] of [
    [String.raw`\text{$x$}`, true], [String.raw`$\text{$x$}$`, true],
    [String.raw`\(\text{$x$}\)`, false], ['$$\n\\text{$x$}\n$$', false],
    [String.raw`\text{a\$b}`, false], ['x+y', false],
  ]) {
    const button = { classList: { toggle() {} } };
    const context = {
      els: { formulaMarkdownSource: { value: input }, formulaPreview: {} },
      formulaWizardState: { mode: 'inline' },
      formulaMarkdownMatches, renderLatexResult, resolveFormulaOutput, hasFormulaPlaceholders,
      parseFormulaMarkdown,
      formulaInlineHasNewline: value => /[\r\n]/.test(value),
      formulaInlineLayout,
      renderFormulaOutputModes() {}, $: () => button, t: key => key, showToast() {},
      DOMPurify: { sanitize: html => html },
    };
    vm.runInNewContext(preview + '\nupdateFormulaPreviewFromMarkdown();', context);
    assert.equal(button.disabled, blocked, input);
    assert.equal(context.els.formulaMarkdownSource.value, input);
    if (blocked) assert.equal(context.els.formulaPreview.textContent, 'formulaDelimiterInvalid');
    else assert.match(context.els.formulaPreview.innerHTML, /class="katex"/);
  }
});
