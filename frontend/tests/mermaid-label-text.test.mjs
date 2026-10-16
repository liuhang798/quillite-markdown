import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { encodeMindmapLabel, decodeMindmapLabel, decodeMermaidTextEntities } from '../src/mermaid-label-text.js';
import { patchMermaidSVGEntities } from '../scripts/mermaid-svg-entities.mjs';
import { patchSankeyUnicode } from '../scripts/mermaid-sankey-unicode.mjs';
import { parseStructuredDiagram, serializeStructuredDiagram } from '../src/structured-diagram-editor.js';

const labels = ['计划 (阶段1) [待办] "重点" {A} & <B> 🚀', '*原文* _保留_ ~~划线~~ `代码`', '%% comment :::class ::icon(fa fa-book)', '#40; &#34; &quot; #copy;', '  leading and trailing  ', '第一行\n第二行\tTab', 'C:\\notes\\file.md', '<img src=x onerror=alert(1)>', '😀 + 𠮷', 'mindmap', 'Mindmap topic', 'MINDMAP-topic'];

test('mindmap label escapes preserve literal text and do not create syntax or inline Markdown', () => {
  for (const label of labels) {
    const encoded = encodeMindmapLabel(label);
    assert.equal(decodeMindmapLabel(encoded), label);
    assert.doesNotMatch(encoded, /[()[\]{}"`<>%:*_~\\\r\n\t]/u);
    assert.doesNotMatch(encoded, /^mindmap\b/iu);
    assert.equal(encodeMindmapLabel(decodeMindmapLabel(encoded)), encoded);
  }
});

test('mindmap new and existing shapes round-trip punctuation over repeated edits', () => {
  for (const label of labels) {
    for (const body of ['root((根))', 'root[根]', 'root(根)', '根']) {
      const parsed = parseStructuredDiagram('mindmap', `mindmap\n  ${body}\n    child`);
      assert.equal(parsed.valid, true);
      parsed.model.rows[0].label = label;
      parsed.model.rows[1].label = label;
      const serialized = serializeStructuredDiagram('mindmap', parsed.model);
      const reopened = parseStructuredDiagram('mindmap', serialized);
      assert.equal(reopened.valid, true, serialized);
      assert.deepEqual(reopened.model.rows.map(row => row.label), [label, label]);
      assert.equal(serializeStructuredDiagram('mindmap', reopened.model), serialized);
      assert.equal(reopened.model.rows[0].syntax.shape, parsed.model.rows[0].syntax.shape);
    }
    const added = serializeStructuredDiagram('mindmap', { settings: {}, rows: [{ level: 0, label }, { level: 1, label }] });
    assert.deepEqual(parseStructuredDiagram('mindmap', added).model.rows.map(row => row.label), [label, label]);
  }
});

test('SVG text entity decoder is single-pass, Unicode-safe and never interprets HTML', () => {
  assert.equal(decodeMermaidTextEntities('&quot;hi&apos; &#40;x&#41; &#x1f680;'), '"hi\' (x) 🚀');
  assert.equal(decodeMermaidTextEntities('&amp;#34; &amp;quot;'), '&#34; &quot;');
  assert.equal(decodeMermaidTextEntities('&#60;script&#62;alert(1)&#60;/script&#62;'), '<script>alert(1)</script>');
  for (const invalid of ['&#0;', '&#55296;', '&#1114112;', '&#99999999999999999999999;', '&unknown;']) assert.equal(decodeMermaidTextEntities(invalid), invalid);
});

test('production Mermaid decoder patch is narrow, fail-closed and compatible with the Sankey patch', () => {
  const original = readFileSync(new URL('../node_modules/mermaid/dist/mermaid.min.js', import.meta.url), 'utf8');
  const patched = patchMermaidSVGEntities(patchSankeyUnicode(original));
  assert.equal(patched.includes('/&(amp|lt|gt);/g'), false);
  assert.throws(() => patchMermaidSVGEntities('changed bundle'), /decoder changed/);
  assert.throws(() => patchMermaidSVGEntities(original + original), /decoder changed/);
  assert.throws(() => patchMermaidSVGEntities(patched), /decoder changed/);
  const start = patched.indexOf('function ', patched.indexOf('else return u.node()}'));
  const end = patched.indexOf('\n}', start) + 2;
  const decoder = patched.slice(start, end);
  assert.match(decoder, /Keep|String\(value\)/);
  const name = decoder.match(/^function ([\w$]+)/u)[1];
  const context = vm.createContext({});
  vm.runInContext(decoder, context);
  assert.equal(context[name]('&#34;正常&#34; &#128640;'), '"正常" 🚀');
  assert.doesNotMatch(decoder, /innerHTML|document\.|eval\(/);
});
