import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {releaseSummaryForVersion} from '../../scripts/release-summary.mjs';

test('release publishing requires a reviewed bilingual one-line summary for the exact version', () => {
  const catalog = {'3.2.0':{summaryZh:'新增文档包编辑，改进保存。',summaryEn:'Add package editing and improve saving.'}};
  assert.equal(releaseSummaryForVersion(catalog,'v3.2.0').summaryZh,catalog['3.2.0'].summaryZh);
  assert.throws(()=>releaseSummaryForVersion(catalog,'3.2.1'),/Missing/);
  for (const value of ['', 'two\nlines', 'x'.repeat(161), 'nul\0']) {
    assert.throws(()=>releaseSummaryForVersion({'3.2.0':{...catalog['3.2.0'],summaryEn:value}},'3.2.0'),/one nonempty/);
  }
});

test('current release has explicit summaries and workflow validates before publishing', () => {
  const catalog=JSON.parse(readFileSync(new URL('../../release-summaries.json',import.meta.url),'utf8'));
  const version=JSON.parse(readFileSync(new URL('../package.json',import.meta.url),'utf8')).version;
  assert.ok(releaseSummaryForVersion(catalog,version).summaryEn);
  const workflow=readFileSync(new URL('../../.github/workflows/release.yml',import.meta.url),'utf8');
  assert.ok(workflow.indexOf('node scripts/release-summary.mjs')<workflow.indexOf('- name: Publish release assets'));
  assert.match(workflow,/summaryZh:\$summaryZh/);
  assert.match(workflow,/summaryEn:\$summaryEn/);
});
