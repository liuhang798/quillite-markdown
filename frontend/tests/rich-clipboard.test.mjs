import assert from 'node:assert/strict';
import test from 'node:test';
import { hasRichClipboardHTML, htmlToMarkdown, markdownToPlainText } from '../src/rich-clipboard.js';

test('web HTML becomes portable Markdown with GFM tables and formatting', () => {
  const markdown = htmlToMarkdown(`
    <h1>网页标题</h1>
    <p><strong>粗体</strong>、<em>斜体</em>和<a href="https://example.com/docs">链接</a></p>
    <ul><li>第一项</li><li><del>第二项</del></li></ul>
    <table><thead><tr><th>名称</th><th>状态</th></tr></thead><tbody><tr><td>轻阅</td><td>完成</td></tr></tbody></table>
  `);
  assert.match(markdown, /^# 网页标题/m);
  assert.match(markdown, /\*\*粗体\*\*/);
  assert.match(markdown, /\*斜体\*/);
  assert.match(markdown, /\[链接\]\(https:\/\/example\.com\/docs\)/);
  assert.match(markdown, /- 第一项/);
  assert.match(markdown, /~{2}第二项~{2}/);
  assert.match(markdown, /\| 名称 \| 状态 \|/);
  assert.match(markdown, /\| 轻阅 \| 完成 \|/);
});

test('Word list paragraphs and inline styles become Markdown instead of Office markup', () => {
  const markdown = htmlToMarkdown(`
    <p class="MsoListParagraphCxSpFirst" style="mso-list:l0 level1 lfo1"><span style="mso-list:Ignore">· </span><span style="font-weight:700">重点</span></p>
    <p class="MsoListParagraphCxSpLast" style="mso-list:l0 level1 lfo1"><span style="mso-list:Ignore">· </span><span style="font-style:italic">说明</span></p>
  `);
  assert.equal(markdown, '- **重点**\n- *说明*');
  assert.doesNotMatch(markdown, /mso-|MsoList/);
});

test('unsafe clipboard links and local images are not written into Markdown', () => {
  const markdown = htmlToMarkdown('<p><a href="javascript:alert(1)">危险链接</a><img src="file:///C:/secret.png" alt="本地图片"><img src="https://img.example/a.png" alt="在线图片"></p>');
  assert.match(markdown, /危险链接/);
  assert.doesNotMatch(markdown, /javascript:|file:\/\//);
  assert.match(markdown, /!\[在线图片\]\(https:\/\/img\.example\/a\.png\)/);
});

test('plain-text copy removes Markdown markers but keeps readable structure', () => {
  const plain = markdownToPlainText('# 标题\n\n- **第一项**\n- [链接](https://example.com)\n\n| 名称 | 状态 |\n| --- | --- |\n| 轻阅 | 完成 |');
  assert.equal(plain, '标题\n- 第一项\n- 链接\n名称\t状态\n轻阅\t完成');
});

test('rich clipboard detection ignores empty and unformatted text', () => {
  assert.equal(hasRichClipboardHTML(''), false);
  assert.equal(hasRichClipboardHTML('普通文本'), false);
  assert.equal(hasRichClipboardHTML('<p>网页段落</p>'), true);
  assert.equal(hasRichClipboardHTML(`<p>${'a'.repeat(5 * 1024 * 1024)}</p>`), false);
});
