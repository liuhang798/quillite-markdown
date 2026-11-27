import assert from 'node:assert/strict';
import test from 'node:test';
import {Marked} from 'marked';
import {documentSvgBlock, svgBlockEnd} from '../src/document-svg.js';
const parser = new Marked({breaks:true,extensions:[documentSvgBlock]});

test('consume a complete SVG including blank lines, quoted attributes, comments and nested viewports', () => {
  const raw = '<svg width="680" viewBox="0 0 680 340">\n<!-- </svg> -->\n\n<svg><text data-note=">">x</text></svg>\n\n<text>末行</text>\n</svg>';
  assert.equal(svgBlockEnd(raw + '\n# next'), raw.length);
  assert.deepEqual(parser.lexer(raw+'\n\n# next').filter(t=>t.type!=='space').map(t=>t.type),['html','heading']);
  assert.ok(parser.parse(raw+'\n\n# next').includes(raw));
  assert.equal(svgBlockEnd('<svg/>'),6);
  assert.equal(svgBlockEnd('<svg>\n\ntext'),-1);
  assert.equal(svgBlockEnd('<svg/> trailing prose'),-1);
  assert.equal(svgBlockEnd('<svgish/>'),-1);
});

test('fenced, indented and inline SVG examples remain code', () => {
  for (const example of ['```svg\n<svg/>\n```','    <svg/>','`<svg/>`']) {
    const html = parser.parse(example);
    assert.ok(html.includes('&lt;svg/&gt;'));
    assert.ok(!html.includes('<svg'));
  }
});
