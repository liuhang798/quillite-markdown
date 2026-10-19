import test from 'node:test';
import assert from 'node:assert/strict';
import {marked} from 'marked';
import {EditorState} from '@codemirror/state';
import {markdownReferenceDefinitions} from '../src/reference-definitions.js';
import {markdownImageDefinitions} from '../src/portable-images.js';
import {prepareFootnotes} from '../src/markdown-formats.js';
import {renderPreparedFootnotes} from '../src/footnote-rendering.js';
import {findMarkdownLinkAt,linkEdit} from '../src/link-editing.js';
const render=source=>renderPreparedFootnotes(prepareFootnotes(source),marked,'Notes');

test('ordinary query parameter names are not decoded as unterminated HTML entities',()=>{
  const url='https://example.com/?a=1&not=2&copy=3',source='[Root][ref] [^n]\n\n[^n]: [Note][ref]\n    \n    [ref]: '+url+' "not=2 &copy=3"';
  assert.equal(markdownReferenceDefinitions(source).get('ref').ref,url);assert.equal(markdownImageDefinitions(source).get('ref').ref,url);
  for(const token of ['Root','Note']){const link=findMarkdownLinkAt(source,source.indexOf(token)+1);assert.equal(link.url,url);assert.equal(link.title,'not=2 &copy=3');}
  assert.doesNotMatch(render(source),/[¬©]/);
  const inline='[link]('+url+')';assert.equal(findMarkdownLinkAt(inline,2).url,url);
  assert.equal(markdownReferenceDefinitions('[r]: https://example.com/?a=1&amp;b=2').get('r').ref,'https://example.com/?a=1&b=2');
});

test('definitions inside footnotes resolve from the root and a different footnote with exact edit coordinates',()=>{
  const source='😀 [Root][ref] [^a] [^b]\n\n[^a]: A\n\t\n\t[ref]: <https://example.com/a> "A &amp; B"\n\n[^b]: B\n    \n    [Note][ref] ![Picture][ref]';
  const target=markdownReferenceDefinitions(source).get('ref');assert.equal(target.ref,'https://example.com/a');
  assert.equal(source.slice(target.urlFrom,target.urlTo),'<https://example.com/a>');assert.equal(source.slice(target.titleFrom,target.titleTo),'"A &amp; B"');
  assert.deepEqual(markdownImageDefinitions(source).get('ref'),{ref:target.ref,title:target.title});
  const html=render(source);assert.equal((html.match(/href="https:\/\/example.com\/a"/g)||[]).length,2);assert.match(html,/<img src="https:\/\/example.com\/a"/);
  for(const token of ['Root','Note']) {
    const link=findMarkdownLinkAt(source,source.indexOf(token)+1);assert.equal(link.url,target.ref);assert.equal(link.title,'A & B');
    const edit=linkEdit(source,{}, {...link,url:'https://example.com/b'},link),result=EditorState.create({doc:source}).update(edit).newDoc.toString();
    assert.equal(result,source.replace('<https://example.com/a>','<https://example.com/b>'));
  }
});
test('first definition follows source order, not note citation order or root-versus-note scope',()=>{
  const first='[ref]: https://example.com/first',later='[ref]: https://example.com/later';
  for(const source of [
    `[Root][ref] [^b] [^a]\n\n[^a]: A\n    \n    ${first}\n\n[^b]: [ref]\n\n${later}`,
    `${first}\n\n[Root][ref] [^n]\n\n[^n]: [ref]\n    \n    ${later}`,
    `[Root][ref] [^b] [^a]\n\n[^a]: A\n    \n    ${first}\n\n[^b]: [ref]\n    \n    ${later}`
  ]) {
    assert.equal(markdownReferenceDefinitions(source).get('ref').ref,'https://example.com/first');
    const html=render(source);assert.match(html,/href="https:\/\/example.com\/first"/);assert.doesNotMatch(html,/href="https:\/\/example.com\/later"/);
    const link=findMarkdownLinkAt(source,source.indexOf('Root')+1);assert.equal(source.slice(link.urlFrom,link.urlTo),'https://example.com/first');
  }
});
test('code, formulas and comments in notes never publish reference definitions',()=>{
  for(const fake of ['```md\n[ref]: https://example.com/fake\n```','    [ref]: https://example.com/fake','$$\n[ref]: https://example.com/fake\n$$','<!--\n[ref]: https://example.com/fake\n-->']) {
    const source='[ref] [^n]\n\n[^n]: Text\n    \n    '+fake.replaceAll('\n','\n    ');
    assert.equal(markdownReferenceDefinitions(source).size,0,fake);assert.equal(markdownImageDefinitions(source).size,0);
    assert.equal(findMarkdownLinkAt(source,2),null);
  }
});
test('literal labels, prototype-like keys, and note deletion cannot leak definitions',()=>{
  const source='[X][a&amp;b] [^n]\n\n[^n]: Text\n    \n    [a&amp;b]: https://example.com/entity\n    [__proto__]: https://example.com/proto\n    [constructor]: https://example.com/ctor';
  const refs=markdownReferenceDefinitions(source);assert.equal(refs.get('a&amp;b').ref,'https://example.com/entity');assert.equal(refs.has('a&b'),false);
  assert.equal(refs.get('__proto__').ref,'https://example.com/proto');assert.match(render(source),/href="https:\/\/example.com\/entity"/);
  assert.equal(markdownReferenceDefinitions('[ref]').size,0);assert.doesNotMatch(render('[ref]'),/example.com/);
});
