import test from 'node:test';
import assert from 'node:assert/strict';
import { Marked } from 'marked';
import { EditorState } from '@codemirror/state';
import { frontmatterRange, maskFrontmatter, frontmatterRenderSource } from '../src/frontmatter.js';
import { buildLivePlan, livePreviewField } from '../src/editor-live-preview.js';
import { prepareFootnotes } from '../src/markdown-formats.js';
import { renderPreparedFootnotes } from '../src/footnote-rendering.js';
import { scanMarkdownFormulas } from '../src/formula-editing.js';
import { markdownImageRanges } from '../src/portable-images.js';
import { markdownReferenceDefinitions } from '../src/reference-definitions.js';
import { createPreviewSourceMap } from '../src/preview-source-map.js';
import { replaceDynamicTocMarkers } from '../src/toc-tree.js';

const sample = '---\ntitle: Markdown 格式示例\nauthor: 示例作者\ndate: YYYY-MM-DD\ntags:\n  - markdown\n  - 示例\n  - 格式\n---\n\n# Markdown 格式示例\n\n本文档用于演示常见 Markdown 格式。\n\n## 1. 标题\n\n# 一级标题\n## 二级标题\n### 三级标题\n#### 四级标题\n##### 五级标题\n###### 六级标题\n';
test('metadata stays literal in live editing and preview, retaining source and line locations', () => {
  for (const source of [sample, sample.replaceAll('\n','\r\n'), '\uFEFF'+sample]) {
    const range=frontmatterRange(source), plan=buildLivePlan(source);
    assert.ok(range);
    const masked=maskFrontmatter(source);
    assert.equal(masked.length, source.length);
    assert.deepEqual([...masked.matchAll(/\n/g)].map(m=>m.index),[...source.matchAll(/\n/g)].map(m=>m.index));
    assert.equal(plan.lines.filter(line=>line.className==='cm-live-frontmatter').length,9);
    assert.ok(!plan.widgets.some(item=>item.from<range.to));
    assert.ok(!plan.hides.some(item=>item.from<range.to));
    assert.ok(!plan.lines.some(line=>line.from<range.to&&line.className.includes('cm-live-heading')));
    const projected=frontmatterRenderSource(source), prepared=prepareFootnotes(projected);
    const markdown=new Marked({gfm:true,breaks:true}), mapping=createPreviewSourceMap(markdown,prepared.lineMap);
    const html=renderPreparedFootnotes(prepared,markdown,'脚注',mapping.parse);
    assert.match(html,/<pre[^>]*class="markdown-frontmatter"/);
    assert.match(html,/tags:\r?\n  - markdown/);
    assert.equal((html.match(/<h[1-6]\b/g)||[]).length,8);
    const state=EditorState.create({doc:source,extensions:[livePreviewField]});
    assert.equal(state.doc.toString(),source.replaceAll('\r\n','\n'));
  }
});

test('metadata never executes embedded HTML, renders equations/images or declares Markdown references', () => {
  const source='---\ntitle: <img src="x" onerror="alert(1)"> $x$ ![alt](image.png)\n[^note]: not a footnote\n[link]: https://example.com\n---\n\n$x$\n\n![real](real.png)\n';
  assert.equal(scanMarkdownFormulas(source).length,1);
  assert.deepEqual(markdownImageRanges(source).map(image=>image.ref),['real.png']);
  assert.equal(prepareFootnotes(source).definitions.size,0);
  assert.equal(markdownReferenceDefinitions(source).size,0);
  const html=new Marked().parse(frontmatterRenderSource(source));
  assert.ok(html.includes('&lt;img src="x" onerror="alert(1)"&gt;'));
  assert.equal((html.match(/<img /g)||[]).length,1);
});

test('normal rules, setext, code examples and unclosed headers remain untouched', () => {
  for(const source of ['---\n\nText\n---', 'Title\n---', '---\ntitle: unfinished\n# Heading', '```yaml\n---\ntitle: code\n---\n```', 'text\n\n---\ntitle: body\n---']) {
    assert.equal(frontmatterRange(source),null);
    assert.equal(frontmatterRenderSource(source),source);
  }
  assert.ok(frontmatterRange('---\ntitle: test\n...\n# Text'));
});

test('metadata directives stay literal without suppressing the real body outline', () => {
  const source = '---\ntitle: test\n[toc]\n```\n---\n\n[toc]\n\n# Body';
  for (const input of [source, frontmatterRenderSource(source)]) {
    const result = replaceDynamicTocMarkers(input);
    assert.equal((result.match(/data-dynamic-toc/g) || []).length, 1);
    assert.ok(result.includes('\n[toc]\n```\n'));
  }
});

test('heading spacing tracks boundaries without modifying source or decorating metadata', () => {
  const source='# A\n## B\n\n### C\n\n\n#### D';
  const plan=buildLivePlan(source);
  for(const [title,gap]of [['# A','cm-live-heading-first'],['## B','cm-live-heading-gap-0'],['### C','cm-live-heading-gap-1'],['#### D','cm-live-heading-gap-2']]) {
    assert.ok(plan.lines.some(line=>line.from===source.indexOf(title)&&line.className===gap));
  }
});
