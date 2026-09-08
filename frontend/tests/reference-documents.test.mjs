import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, resolve } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { DIAGRAM_TEMPLATES, diagramTemplateSource } from '../src/diagram-templates.js';
import { FORMULA_TEMPLATES, buildFormulaExpression, formulaValues } from '../src/formula-templates.js';
import { prepareFootnotes } from '../src/markdown-formats.js';
import { marked } from 'marked';

const frontend = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const root = resolve(frontend, '..');
const docs = resolve(root, 'docs', 'reference');

test('generated reference documents cover every current chart and formula template', t => {
  const generated = mkdtempSync(resolve(tmpdir(), 'quillite-reference-test-'));
  t.after(() => rmSync(generated, { recursive: true, force: true }));
  execFileSync(process.execPath, [resolve(root, 'scripts', 'generate-reference-docs.mjs'), generated], { cwd: root });
  const charts = readFileSync(resolve(generated, '图表案例.MD'), 'utf8');
  const formulas = readFileSync(resolve(generated, '科学公式案例.MD'), 'utf8');

  assert.ok(!formulas.includes('undefined'), 'formula reference contains an undefined template value');

  assert.equal((charts.match(/^## \d+\./gm) || []).length, DIAGRAM_TEMPLATES.length);
  assert.equal((formulas.match(/^### \d+\./gm) || []).length, FORMULA_TEMPLATES.length);
  for (const template of DIAGRAM_TEMPLATES) {
    assert.ok(charts.includes(template.name.zh), `missing diagram heading: ${template.id}`);
    const distinctiveLine = diagramTemplateSource(template, 'zh-CN').split('\n').find(line => line.trim())?.trim();
    assert.ok(distinctiveLine && charts.includes(distinctiveLine), `missing diagram source: ${template.id}`);
  }
  for (const template of FORMULA_TEMPLATES) {
    const expression = buildFormulaExpression(template, formulaValues(template));
    assert.ok(formulas.includes(expression), `missing formula expression: ${template.id}`);
  }
});

test('format example and sidebar expose every requested built-in reference', () => {
  const formats = readFileSync(resolve(docs, '常规内容案例.MD'), 'utf8');
  const index = readFileSync(resolve(frontend, 'index.html'), 'utf8');
  const renderer = readFileSync(resolve(frontend, 'src', 'renderer.js'), 'utf8');
  const styles = readFileSync(resolve(frontend, 'src', 'styles.css'), 'utf8');
  const main = readFileSync(resolve(frontend, 'src', 'main.js'), 'utf8');

  for (const marker of ['# 一级标题', '**粗体文字**', '*斜体文字*', '~~删除线文字~~', '<mark>高亮文字</mark>', 'data-md-color', '- [x]', '| 对齐方式 |', '```javascript', '> 一级引用', '<details>', '![轻阅 Markdown']) {
    assert.ok(formats.includes(marker), `missing formatting example: ${marker}`);
  }
  assert.ok(formats.includes('\\*不是斜体\\*、\\# 不是标题、\\[不是链接\\]'), 'escaped Markdown example was generated incorrectly');
  assert.ok(formats.includes('https://qm.ssssa.cn/product/appicon.png'), 'format example must use the current website image');
  assert.ok(!formats.includes('/favicon.svg'), 'format example still contains the removed favicon URL');
  const prepared = prepareFootnotes(formats);
  const rendered = marked.parse(prepared.markdown);
  assert.ok(rendered.length > 2500, 'format example unexpectedly rendered as empty or incomplete HTML');
  for (const renderedMarker of ['<h1>Markdown 常规内容格式大全</h1>', '<table>', '<details>', '<pre><code class="language-javascript">']) {
    assert.ok(rendered.includes(renderedMarker), `rendered format example is missing: ${renderedMarker}`);
  }
  assert.equal((index.match(/data-reference-document=/g) || []).length, 6);
  assert.equal((index.match(/data-home-reference-document=/g) || []).length, 3);
  assert.ok(index.indexOf('data-reference-document="formats"') < index.indexOf('id="folderCta"'));
  assert.match(renderer, /displayDocument\(doc, \{ addToLibrary: false \}\)/);
  assert.match(renderer, /state\.currentFile\.readOnly/);
  assert.match(renderer, /els\.editButton\.disabled = !state\.currentFile \|\| readOnly/);
  assert.match(renderer, /els\.documentView\.classList\.toggle\('reference-document', readOnly\)/);
  assert.match(styles, /\.document-view\.reference-document \.breadcrumb,[\s\S]*\.document-view\.reference-document #revealButton \{ display: none; \}/);
  assert.match(main, /Backend\.OpenReferenceDocument\(kind\)/);
});

test('home exposes the shortcut guide and reading view can return home', () => {
  const index = readFileSync(resolve(frontend, 'index.html'), 'utf8');
  const renderer = readFileSync(resolve(frontend, 'src', 'renderer.js'), 'utf8');

  assert.match(index, /id="closePreviewButton"/);
  assert.match(index, /id="welcomeShortcutsTitle"/);
  /* Replaced by platform-aware shortcut assertions below.
  for (const shortcut of ['Ctrl \/ Cmd + N', 'Ctrl \/ Cmd + O', 'Ctrl \/ Cmd + Shift + O', 'Ctrl \/ Cmd + S', 'Ctrl \/ Cmd + Shift + S', 'Ctrl \/ Cmd + E', 'Ctrl \/ Cmd + F', 'Ctrl \/ Cmd + B', 'Ctrl \/ Cmd + I', 'Ctrl \/ Cmd + K']) {
    assert.ok(index.includes(shortcut), `missing shortcut on home: ${shortcut}`);
  }
  */
  for (const shortcut of ['N', 'O', 'Shift + O', 'S', 'Shift + S', 'E', 'F', 'B', 'I', 'K']) {
    assert.ok(index.includes(`data-shortcut="${shortcut}"`), `missing shortcut on home: ${shortcut}`);
  }
  assert.match(renderer, /const modifier = isMac \? 'Cmd' : 'Ctrl'/);
  assert.match(renderer, /element\.textContent = `\$\{modifier\} \+ \$\{element\.dataset\.shortcut\}`/);
  assert.match(renderer, /homeShortcutsDescriptionMac/);
  assert.match(renderer, /homeShortcutsDescriptionWindows/);
  assert.match(renderer, /function closePreview\(\)[\s\S]*state\.currentFile = null[\s\S]*els\.documentView\.classList\.add\('hidden'\)[\s\S]*els\.welcome\.classList\.remove\('hidden'\)/);
  assert.match(renderer, /\$\('#closePreviewButton'\)\.addEventListener\('click', closePreview\)/);
});
