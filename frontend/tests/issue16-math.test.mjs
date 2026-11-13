import test from 'node:test';
import assert from 'node:assert/strict';
import { Marked } from 'marked';
import { mathExtensions, renderLatex } from '../src/math-rendering.js';
import { scanMarkdownFormulas } from '../src/formula-editing.js';
import { buildLivePlan } from '../src/editor-live-preview.js';
import { hasRichClipboardHTML, htmlToMarkdown, selectClipboardMarkdown } from '../src/rich-clipboard.js';
import { readFileSync } from 'node:fs';

const parser = new Marked({ gfm: true, breaks: true, extensions: mathExtensions });
const fixture = readFileSync(new URL('./fixtures/issue16-doubao.md', import.meta.url), 'utf8');

test('issue 16 exact Markdown renders every Doubao formula, including Chinese and bold lists', () => {
  const html = parser.parse(fixture);
  assert.equal((html.match(/class="math-inline"/g) || []).length, 11);
  assert.doesNotMatch(html, /class="katex-error"/);
  const formulas = scanMarkdownFormulas(fixture);
  assert.equal(formulas.length, 11);
  assert.ok(formulas.every(item => fixture.slice(item.from, item.to) === item.raw));
  const plan = buildLivePlan(fixture);
  assert.ok(formulas.every(formula => !plan.hides.some(range => range.from < formula.to && range.to > formula.from)),
    'live mode must not hide formula backslashes as Markdown escapes');
});

test('rich text clipboard keeps explicit LaTeX delimiters and commands instead of double escaping', () => {
  const text = String.raw`若在 \(\mathbb R\) 上函数 \(\varphi'(x)=0\)，则 \(\varphi(x)=C\)（常数）；`;
  const source = htmlToMarkdown(`<blockquote><p>${text}</p></blockquote>`);
  assert.equal(source, '> ' + text);
  assert.equal((parser.parse(source).match(/class="math-inline"/g) || []).length, 3);
  assert.equal(scanMarkdownFormulas(source).length, 3);
});

test('rich math clipboard preserves explicit display math while escaping surrounding Markdown punctuation', () => {
  const source = htmlToMarkdown(String.raw`<p>plain_underscore * literal</p><p>\[\frac{a_1}{b^2}\]</p>`);
  assert.match(source, /plain\\_underscore \\[*] literal/);
  assert.match(source, /\\\[\\frac\{a_1\}\{b\^2\}\\\]/);
  assert.equal((parser.parse(source).match(/class="math-block"/g) || []).length, 1);
});

test('rich clipboard preserves dollar-delimited subscripts, fractions and escaped dollars', () => {
  const inline = String.raw`\frac{a_1}{b^2} + \text{\$5}`;
  const display = String.raw`\frac{x_1}{y^2}`;
  const source = htmlToMarkdown('<p>plain_text and $x_1$ then $' + inline + '$.</p><p>$$' + display + '$$</p>');
  assert.equal(source, 'plain\\_text and $x_1$ then $' + inline + '$.\n\n$$' + display + '$$');
  const rendered = parser.parse(source);
  assert.deepEqual(scanMarkdownFormulas(source).map(formula => formula.source), ['x_1', inline, display]);
  assert.equal((rendered.match(/<msub>/g) || []).length, 3);
  assert.equal((rendered.match(/<mfrac>/g) || []).length, 2);
  assert.doesNotMatch(rendered, /class="katex-error"/);
});

test('dollar preservation leaves prices, escaped dollars, incomplete formulas and code literal', () => {
  const source = htmlToMarkdown(String.raw`<p>Prices $5 and $10.</p><p>Literal \$x_1$.</p><p>Unclosed $x_2.</p><p><code>$\frac{x_3}{y}$</code></p><pre><code>$$x_4$$</code></pre>`);
  assert.match(source, /Prices \$5 and \$10\./);
  assert.match(source, /Unclosed \$x\\_2\./);
  assert.ok(source.includes(String.raw`$\frac{x_3}{y}$`));
  assert.equal(scanMarkdownFormulas(source).length, 0);
  assert.doesNotMatch(parser.parse(source), /class="math-(?:inline|block)"/);
});

test('rich clipboard recovers one original formula from KaTeX instead of duplicating MathML and visual layers', () => {
  for (const display of [false, true]) {
    const expression = String.raw`\boldsymbol{f(x)\cdot f(-x)=常数}`;
    const source = htmlToMarkdown(`<p>Before ${renderLatex(expression, display)} After</p>`);
    const formulas = scanMarkdownFormulas(source);
    assert.equal(formulas.length, 1);
    assert.equal(formulas[0].source, expression);
    assert.equal((parser.parse(source).match(/class="katex"/g) || []).length, 1);
  }
});

test('standalone MathML with a TeX annotation is detected and converted to one editable formula', () => {
  const html = '<math display="block"><semantics><msup><mi>x</mi><mn>2</mn></msup><annotation encoding="application/x-tex">x^2</annotation></semantics></math>';
  assert.equal(hasRichClipboardHTML(html), true);
  const source = htmlToMarkdown(html);
  assert.equal(source, '\\[\nx^2\n\\]');
  assert.equal(scanMarkdownFormulas(source).length, 1);
});

test('sanitized application formula markup preserves its encoded source without requiring MathML annotations', () => {
  const expression = String.raw`\varphi'(x)=0`;
  const source = htmlToMarkdown(`<span class="math-inline" role="math" data-math-source="${encodeURIComponent(expression)}"><span class="katex">visual text without an annotation</span></span>`);
  assert.equal(source, `\\(${expression}\\)`);
  assert.equal(scanMarkdownFormulas(source).length, 1);
});

test('rich clipboard leaves ordinary, escaped, incomplete parentheses and code literal', () => {
  const literal = String.raw`(x=0) and \\(not_math\\) and \(unclosed`;
  const source = htmlToMarkdown(`<p>${literal}</p><pre><code>${String.raw`\(x_i\)`}</code></pre><p><code>${String.raw`\(y^2\)`}</code></p>`);
  assert.equal(scanMarkdownFormulas(source).length, 0);
  assert.doesNotMatch(parser.parse(source), /class="math-inline"/);
  assert.match(source, /```\n\\\(x_i\\\)\n```/);
  assert.match(source, /`\\\(y\^2\\\)`/);
});

test('math clipboard boundaries do not inject Markdown through untrusted formula annotations', () => {
  const expression = String.raw`x\) **not a formula** \(y`;
  const source = htmlToMarkdown(`<span class="katex"><annotation encoding="application/x-tex">${expression}</annotation></span>`);
  assert.equal(scanMarkdownFormulas(source).length, 0);
  assert.doesNotMatch(parser.parse(source), /<strong>/);
});

const annotation = expression => `<math><semantics><mtext>visible</mtext><annotation encoding="application/x-tex">${expression}</annotation></semantics></math>`;

test('math fragments inside one dollar formula are merged without touching other content', () => {
  const source = htmlToMarkdown(`<p><strong>Given</strong> $h(x)=${annotation('f(x)')}+${annotation('g(x)')}$; also ${annotation('x^2')}.</p>`);
  assert.equal(source, String.raw`**Given** $h(x)=f(x)+g(x)$; also \(x^2\).`);
  assert.equal((parser.parse(source).match(/class="katex"/g) || []).length, 2);
  assert.doesNotMatch(parser.parse(source), /katex-error/);
  const block = htmlToMarkdown(`<p>$$y=${annotation('x_1')}$$</p>`);
  assert.equal(block, '$$y=x_1$$');
  assert.match(parser.parse(block), /class="math-block".*<msub>/);
});

test('merged TeX fragments keep command boundaries and do not admit new delimiter breaks', () => {
  const merged = htmlToMarkdown(`<p>$y=${annotation(String.raw`\sin`)}h$</p>`);
  assert.equal(merged, String.raw`$y=\sin h$`);
  const invalid = htmlToMarkdown(`<p>$y=${annotation(String.raw`\text{a $x$}`)}$</p>`);
  assert.ok(invalid.includes(String.raw`\(\text{a $x$}\)`), 'do not drop delimiters when the outer token would split');
  const price = htmlToMarkdown(`<p>Ticket costs $5 and ${annotation('x')} USD$.</p>`);
  assert.equal(price, String.raw`Ticket costs $5 and \(x\) USD$.`, 'do not merge a price and prose as a formula');
  const link = htmlToMarkdown(`<a href="https://example.test/">$x=${annotation(']')}(file:///secret.png)$</a>`);
  assert.equal(link, String.raw`[$x=\(]\)(file:///secret.png)$](https://example.test/)`);
  assert.equal((parser.parse(link).match(/<a /g) || []).length, 1, 'keep the original link without creating a nested link');
  const bold = htmlToMarkdown(`<strong>$x=${annotation('*')} y$</strong>`);
  assert.equal(bold, String.raw`**$x=\(*\) y$**`);
  assert.match(parser.parse(bold), /<strong>/);
});

test('malformed source already present in plain text nodes or code is not rewritten', () => {
  const malformed = String.raw`$f'(x)=\(f(x)\)$`;
  const literal = htmlToMarkdown(`<p>${malformed}</p><pre><code>${malformed}</code></pre>`);
  assert.equal(literal, malformed + '\n\n```\n' + malformed + '\n```');
});

test('Markdown fallback fixes only matched formulas and keeps all other converted content', () => {
  const damaged = String.raw`**Given** $f'(x)=\(f(x)\)$.`;
  const markdown = String.raw`**Given** \(f'(x)=f(x)\).`;
  const plain = "**Given** $f'(x)=f(x)$.";
  assert.equal(selectClipboardMarkdown(damaged, markdown, plain), markdown);
  assert.equal(selectClipboardMarkdown(damaged, '', plain), plain);
  assert.equal(selectClipboardMarkdown(damaged, markdown + ' ![extra](file:///private.png)', plain), plain);
  assert.equal(selectClipboardMarkdown(damaged, markdown.replace('Given', 'Other'), ''), damaged);
  assert.equal(selectClipboardMarkdown(damaged, '    ' + markdown, ''), damaged);
  assert.equal(selectClipboardMarkdown(damaged, '\r\n' + markdown + '\r\n', ''), markdown);
  assert.equal(selectClipboardMarkdown(damaged, '', "Given $f'(x)=f(x)$."), damaged);
  assert.equal(selectClipboardMarkdown(damaged, '', damaged), damaged);
  assert.equal(selectClipboardMarkdown(plain, markdown, ''), plain);
  assert.equal(selectClipboardMarkdown('`' + damaged + '`', '', '`' + plain + '`'), '`' + damaged + '`');
  const partiallyValid = String.raw`$x=1$ and $\bogus$`;
  assert.equal(selectClipboardMarkdown(partiallyValid, '$x=2$ and $y=3$', ''), partiallyValid);
  assert.equal(selectClipboardMarkdown(partiallyValid, String.raw`$x=1$ and \(\)`, ''), partiallyValid);
  assert.equal(selectClipboardMarkdown(partiallyValid, '$x=1$ and $y=3$', ''), '$x=1$ and $y=3$');
});
