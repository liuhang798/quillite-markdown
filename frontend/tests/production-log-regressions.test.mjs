import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {Marked} from 'marked';
import {largeHeadingTokenizer} from '../src/marked-large-heading.js';
import {normalizeExternalURL, openExternalSafely} from '../src/external-links.js';
import {patchCodeMirrorDOMRange} from '../scripts/codemirror-dom-range.mjs';
import {markdownLinkAttribute} from '../src/markdown-link-attributes.js';

test('large paragraphs and multiline Setext headings retain complete content and default semantics', () => {
  for (const gfm of [true, false]) {
    const original = new Marked({gfm,breaks:true});
    const safe = new Marked({gfm,breaks:true,tokenizer:{lheading:largeHeadingTokenizer}});
    const prefix = 'long text 字😀 '.repeat(3000);
    for (const suffix of ['', '\n---\n', '\nsecond\n===\n\nend', '\n\n---', '\n- item\n---', '\n# h\n---', '\n> quote\n---', '\n    code\n---', '\n```js\n---\n```', '\n|---|\n---', '\n\t\n---', '\n<div>\n---', '\u2028x\n---']) {
      const source = prefix + suffix;
      assert.equal(safe.parse(source), original.parse(source), JSON.stringify(suffix));
    }
    assert.equal(safe.parse('word '.repeat(300000)), '<p>'+'word '.repeat(300000)+'</p>\n');
  }
});

test('large heading path never invokes the full-document Setext regexp', () => {
  const parser = new Marked({tokenizer:{lheading:largeHeadingTokenizer}});
  assert.match(parser.parse('x'.repeat(100000)+'\n---'), /^<h2>x+<\/h2>/);
  assert.equal(largeHeadingTokenizer.call({options:{gfm:true}}, 'x'.repeat(100000)), undefined);
});

test('external links normalize web URLs but reject unsafe/relative/credential URLs', () => {
  assert.equal(normalizeExternalURL(' HTTPS://example.com/中文 '), 'https://example.com/%E4%B8%AD%E6%96%87');
  assert.equal(normalizeExternalURL('mailto:help@example.com'), 'mailto:help@example.com');
  for (const value of ['javascript:alert(1)', 'data:text/html,x', 'file:///C:/a', '/relative', '#anchor', 'https:example.com', 'http://', 'https://user:secret@example.com', 'https://example.com\n', 'mailto:', null]) assert.throws(()=>normalizeExternalURL(value));
});

test('external link opening catches both synchronous and asynchronous failures', async () => {
  let failures=0,calls=0;
  const fail=()=>failures++;
  assert.equal(await openExternalSafely('file:///a',()=>calls++,fail),false);
  assert.equal(calls,0);
  assert.equal(await openExternalSafely('https://example.com',()=>{throw Error('unsupported URL');},fail),false);
  assert.equal(await openExternalSafely('https://example.com',()=>Promise.reject(Error('OS unavailable')),fail),false);
  assert.equal(await openExternalSafely('https://example.com',()=>Promise.resolve(),fail),true);
  assert.equal(failures,3);
});

test('DOMReader rejects unreachable end boundaries instead of reading outside logical bounds', () => {
  const code=readFileSync(new URL('../node_modules/@codemirror/view/dist/index.js',import.meta.url),'utf8');
  const patched=patchCodeMirrorDOMRange(code);
  assert.equal(patchCodeMirrorDOMRange(patched),patched);
  assert.throws(()=>patchCodeMirrorDOMRange('class DOMReader {}'));
  const method=source=>{
    const start=source.indexOf('    readRange(start, end) {',source.indexOf('class DOMReader'));
    const end=source.indexOf('    readTextNode(',start);
    return new Function('Tile','isBlockElement','isEmptyToEnd','return function '+source.slice(start,end).trim())({get:node=>node.cmTile},()=>false,()=>true);
  };
  const parent={contains:node=>node.parentNode===parent}, second={parentNode:parent,nextSibling:null,nodeName:'#text',text:'乙'};
  const first={parentNode:parent,nextSibling:second,nodeName:'#text',text:'甲'};
  const detached={parentNode:null};
  const reader=()=>({text:'',view:{contentDOM:parent},findPointBefore(){},readNode(node){this.text+=node.text;},lineBreak(){this.text+='\n';}});
  assert.throws(()=>method(code).call(reader(),first,detached),/cmTile/);
  for (const boundary of [detached,{parentNode:parent,nextSibling:first}]) {
    const r=reader();method(patched).call(r,first,boundary);assert.equal(r.invalidRange,true);assert.equal(r.text,'');
  }
  const complete=reader();method(patched).call(complete,first,null);assert.equal(complete.text,'甲乙');
  const r=reader();method(patched).call(r,first,second);assert.equal(r.text,'甲');
  const missing=reader();method(patched).call(missing,null,second);assert.equal(missing.invalidRange,true);
  const empty=reader();method(patched).call(empty,second,second);assert.equal(empty.text,'');
  assert.match(patched,/if \(reader.invalidRange\)[\s\S]*this.bounds = null;[\s\S]*this.newSel = null;/);
});

test('Markdown link attributes decode entities once and remain safely quoted',()=>{
 const cases=[['?a=1&amp;b=2','?a=1&amp;b=2'],['A &quot;B&quot;','A &quot;B&quot;'],['&#34; onclick=&#x22;x','&quot; onclick=&quot;x'],['&amp;amp;','&amp;amp;'],['&notit=1','&amp;notit=1'],['%26amp%3B','%26amp%3B'],['<x>\'','&lt;x&gt;&#39;']];
 for(const[input,output]of cases)assert.equal(markdownLinkAttribute(input),output);
});
