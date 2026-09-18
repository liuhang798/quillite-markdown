import test from 'node:test';
import assert from 'node:assert/strict';
import { checkMarkdown, parseCustomTemplates, renderDocumentTemplate, diagnosticSummary, recordToolDiagnostic } from '../src/document-tools-core.js';

test('checker finds unclosed fences and skipped headings without treating code as Markdown', () => {
  const r = checkMarkdown('# One\n\n### Three\n\n```md\n![ignore](none.png)\n');
  assert.deepEqual(r.issues.map(i => i.code).sort(), ['fence','heading']); assert.equal(r.assets.length, 0);
});
test('checker uses application anchors and resolves reference images', () => {
  const r = checkMarkdown('# Hello\n\n[valid](#hello-0) [bad](#missing)\n\n![x][pic]\n\n[pic]: assets/a.png\n');
  assert.equal(r.issues.length,1); assert.equal(r.issues[0].code,'anchor'); assert.equal(r.assets[0].ref,'assets/a.png');
});
test('checker catches table width mismatch and ignores escaped pipes', () => {
  assert.equal(checkMarkdown('| a | b |\n|---|---|\n| c |\n').issues[0].code,'table');
  assert.equal(checkMarkdown('| a | b |\n|---|---|\n| c\\|d | e |\n').issues.length,0);
});
test('checker counts quote and list headings in document order', () => {
  const r = checkMarkdown('> # Quoted\n\n- ## Listed\n\n# Actual\n\n[valid](#actual-2) [also](#listed-1)');
  assert.deepEqual(r.issues, []);
});
test('checker uses rendered IDs without trusting IDs written inside code', () => {
  const r = checkMarkdown('# A &amp; B\n\n[valid](#a-b-0) [bad](#fake)\n\n`id="fake"`', () => new Set(['a-b-0']));
  assert.deepEqual(r.issues.map(i => i.detail), ['fake']);
});
test('checker includes Windows absolute images and file URLs but not remote resources', () => {
  const r=checkMarkdown('![a](C:/pictures/a.png)\n![b](file:///C:/pictures/b.png)\n![c](https://example.invalid/c.png)');
  assert.deepEqual(r.assets.map(a=>a.ref),['C:/pictures/a.png','file:///C:/pictures/b.png']);
  assert.deepEqual(r.assets.map(a=>a.line),[1,2]);
});
test('template variables are local deterministic and literal', () => {
  assert.equal(renderDocumentTemplate('# {{title}}\n{{date}}\n{{unknown}}', '$&', new Date(2026,8,17)), '# $&\n2026-09-17\n{{unknown}}');
  assert.deepEqual(parseCustomTemplates('{broken'),[]);
  assert.deepEqual(parseCustomTemplates('[{"id":"x","name":"y","content":1}]'),[]);
});
test('diagnostics cannot include paths or error messages', () => {
  recordToolDiagnostic('document.save'); recordToolDiagnostic('C:/private/APIKEY');
  const report = JSON.stringify(diagnosticSummary({ path:'C:/secret.md', content:'private', platform:'windows', dirty:true }));
  assert.ok(report.includes('document')); assert.ok(!report.includes('secret')); assert.ok(!report.includes('private')); assert.ok(!report.includes('APIKEY'));
});
