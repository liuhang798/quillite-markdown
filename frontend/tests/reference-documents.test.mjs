import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, resolve } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { DIAGRAM_CATEGORIES, DIAGRAM_TEMPLATES, diagramTemplateSource } from '../src/diagram-templates.js';
import { FORMULA_GROUP_LABELS, FORMULA_TEMPLATES, buildFormulaExpression, formulaValues } from '../src/formula-templates.js';
import { prepareFootnotes } from '../src/markdown-formats.js';
import { marked } from 'marked';
import { REFERENCE_ADDITIONS } from '../../scripts/reference-additions.mjs';

const frontend = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const root = resolve(frontend, '..');
const docs = resolve(root, 'docs', 'reference');

test('reference rendering can pin dates without changing new-diagram defaults', () => {
  const template = { source: { zh: '任务 {{date}}', en: 'Task {{date}}' } };
  assert.equal(diagramTemplateSource(template, 'zh', '2026-08-21'), '任务 2026-08-21');
  assert.equal(diagramTemplateSource(template, 'en', '2030-02-03'), 'Task 2030-02-03');
  const before = new Date().toISOString().slice(0, 10);
  const source = diagramTemplateSource(template, 'en');
  const after = new Date().toISOString().slice(0, 10);
  assert.ok([`Task ${before}`, `Task ${after}`].includes(source));
});

test('generated reference documents cover every current chart and formula template', t => {
  const generated = mkdtempSync(resolve(tmpdir(), 'quillite-reference-test-'));
  t.after(() => rmSync(generated, { recursive: true, force: true }));
  execFileSync(process.execPath, [resolve(root, 'scripts', 'generate-reference-docs.mjs'), generated], { cwd: root });
  const charts = readFileSync(resolve(generated, '图表案例.MD'), 'utf8');
  assert.ok(charts.includes('需求分析 :done, plan, 2026-08-21, 2d'), 'reference dates are stable across generation days');
  const formulas = readFileSync(resolve(generated, '科学公式案例.MD'), 'utf8');

  // The desktop embeds these tracked files, not the generator's in-memory result.
  // A template change must regenerate the actual shipped reference documents.
  for (const [name, content] of [['图表案例.MD', charts], ['科学公式案例.MD', formulas]]) {
    assert.equal(readFileSync(resolve(docs, name), 'utf8').replaceAll('\r\n', '\n'), content.replaceAll('\r\n', '\n'), `${name} is stale; run node scripts/generate-reference-docs.mjs`);
  }

  assert.ok(!formulas.includes('undefined'), 'formula reference contains an undefined template value');

  assert.equal((charts.match(/^### \d+\./gm) || []).length, DIAGRAM_TEMPLATES.length);
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
  for (const [kind, templates, content, level, expectedCount] of [
    ['diagrams', DIAGRAM_TEMPLATES, charts, '###', 4],
    ['formulas', FORMULA_TEMPLATES, formulas, '###', 16],
  ]) {
    const additions = REFERENCE_ADDITIONS[kind];
    assert.equal(additions.size, expectedCount);
    for (const id of additions) assert.ok(templates.some(template => template.id === id), `unknown new template ${id}`);
    assert.doesNotMatch(content, /本次新增|新增 \/ New|New additions/);
    const headings = content.split('\n').filter(line => line.startsWith(`${level} `) && /^#+ \d+\./.test(line));
    for (const template of templates) {
      const heading = headings.find(line => line.replace(/^#+ \d+\. /, '').replace(/ <span class="reference-new-badge">NEW<\/span>$/, '') === template.name.zh);
      assert.ok(heading, `missing heading ${template.id}`);
      assert.equal(heading.endsWith(' <span class="reference-new-badge">NEW</span>'), additions.has(template.id), `incorrect new marker ${template.id}`);
      const expectedGroup = kind === 'diagrams'
        ? DIAGRAM_CATEGORIES.find(category => category.id === template.category).name.zh
        : FORMULA_GROUP_LABELS[template.group].zh;
      const precedingGroups = content.slice(0, content.indexOf(heading)).split('\n').filter(line => line.startsWith('## '));
      assert.equal(precedingGroups.at(-1), `## ${expectedGroup}`, `wrong reference category ${template.id}`);
    }
    assert.equal(headings.filter(line => line.endsWith(' <span class="reference-new-badge">NEW</span>')).length, expectedCount);
    assert.ok(marked.parse(content).includes('<span class="reference-new-badge">NEW</span></h3>'), 'new badge must survive standard Markdown rendering');
    assert.doesNotMatch(content, /🆕|✨/);
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
  assert.match(renderer, /readDocumentForOpen\(request, \(\) => window.quilliteMarkdown.openReferenceDocument\(kind\), \{addToLibrary: false\}\)/);
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
