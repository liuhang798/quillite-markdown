import assert from 'node:assert/strict';
import test from 'node:test';
import {Marked} from 'marked';
import {marked} from 'marked';
import {createPreviewSourceMap} from '../src/preview-source-map.js';
import {highlightExtension, prepareFootnotes} from '../src/markdown-formats.js';
import {renderPreparedFootnotes} from '../src/footnote-rendering.js';
import {mathExtensions,collectFormulaRendering} from '../src/math-rendering.js';

test('registered renderer links use the current parser on first and repeated renders',()=>{
  const parser=new Marked({gfm:true,renderer:{link({href,tokens}){
    return `<a href="${href}">${this.parser.parseInline(tokens)}</a>`;
  }}});
  parser.Lexer=marked.Lexer;parser.Renderer=marked.Renderer;
  const base=parser.defaults.renderer;
  const before=Object.getOwnPropertyDescriptors(base);
  for(const source of ['[**link**](https://example.com)', 'https://example.com', '> [link][r]\n\n[r]: https://example.com', '| link |\n|---|\n| [link](https://example.com) |']){
    const html=createPreviewSourceMap(parser).parse(source);
    assert.match(html,/href="https:\/\/example.com"/);
    assert.match(html,/data-qm-source/);
    assert.deepEqual(Object.getOwnPropertyDescriptors(base),before);
  }
  assert.doesNotMatch(parser.parse('[plain](https://example.com)'),/data-qm-source/);
});

test('renderer context and decorations restore after failure and nested mapped parse',()=>{
  let nested=false;
  const parser=new Marked({renderer:{link({href,tokens}){
    if(href==='fail')throw Error('synthetic-render-failure');
    if(!nested){nested=true;createPreviewSourceMap(parser).parse('nested');}
    return `<a href="${href}">${this.parser.parseInline(tokens)}</a>`;
  }}});
  parser.Lexer=marked.Lexer;parser.Renderer=marked.Renderer;
  const base=parser.defaults.renderer,before=Object.getOwnPropertyDescriptors(base);
  assert.throws(()=>createPreviewSourceMap(parser).parse('[x](fail)'),/synthetic-render-failure/);
  assert.deepEqual(Object.getOwnPropertyDescriptors(base),before);
  assert.match(createPreviewSourceMap(parser).parse('[ok](https://example.com)'),/>ok</);
  assert.deepEqual(Object.getOwnPropertyDescriptors(base),before);
});

function render(source, lineMap = null) {
  // The production marked singleton also exposes the lexer/renderer classes.
  const parser = new Marked({gfm:true,breaks:true,extensions:[highlightExtension]});
  parser.Lexer=marked.Lexer;parser.Renderer=marked.Renderer;
  const map=createPreviewSourceMap(parser,lineMap),html=map.parse(source);
  const nodes=[...html.matchAll(/<([a-z0-9]+) data-qm-source="([^"]+)"[^>]*>([^<]*)/g)].map(m=>({tag:m[1],id:m[2],text:m[3],dataset:{},getAttribute(){return this.id;},removeAttribute(){}}));
  map.apply({querySelectorAll:selector=>selector==='[data-line]'?[]:nodes});
  return {html,nodes,line:text=>nodes.find(n=>n.text===text)?.dataset.line,parser};
}
test('soft line breaks render separately with individual source rows',()=>{
  const r=render('正文\n**粗体**\n*斜体*\n~~删除~~\n==底色==\n<span data-md-color="red">颜色</span>');
  assert.equal((r.html.match(/<br>/g)||[]).length,5);
  ['正文','粗体','斜体','删除','底色','颜色'].forEach((text,i)=>assert.equal(r.line(text),String(i+1)));
});
test('comments and definitions do not shift later rendered blocks',()=>{
  const r=render('开头\n\n<!-- hidden -->\n\n[ref]: https://example.com\n\n## 后标题\n\n[链接][ref]\n末尾');
  assert.equal(r.line('后标题'),'7');assert.equal(r.line('链接'),'9');assert.equal(r.line('末尾'),'10');
});
test('repeated content retains each occurrence source line',()=>{
  const r=render('相同\n相同\n\n相同');
  assert.deepEqual(r.nodes.filter(n=>n.text==='相同').map(n=>n.dataset.line),['1','2','4']);
});
test('quotes and lists retain removed structural line prefixes',()=>{
  const r=render('> 引用一\n> 引用二\n\n- 列表一\n- 列表二\n  - 子项');
  for(const[text,line]of [['引用一',1],['引用二',2],['列表一',4],['列表二',5],['子项',6]])assert.equal(r.line(text),String(line),text);
});
test('table cell lines are distinct from delimiters',()=>{
  const r=render('| 甲 | 乙 |\n|---|---|\n| 丙 | 丁 |\n| 戊 | 己 |');
  for(const[text,line]of [['甲',1],['乙',1],['丙',3],['丁',3],['戊',4],['己',4]])assert.equal(r.line(text),String(line));
});
test('CRLF normalisation retains original row numbers',()=>{
  const r=render('# 标题\r\n\r\n第一\r\n第二');assert.equal(r.line('第二'),'4');
});
test('footnote preprocessing projects rows back to source',()=>{
  const r=render('首行\n后行',[0,7]);assert.equal(r.line('首行'),'1');assert.equal(r.line('后行'),'8');
});
test('fenced code remains literal rather than receiving prose breaks',()=>{
  const r=render('```text\n**字面**\n第二行\n```\n\n后文');
  assert.match(r.html,/<code class="language-text">\*\*字面\*\*\n第二行/);assert.equal(r.line('后文'),'6');
});
test('mapping does not alter the parser shared renderer or options',()=>{
  const r=render('第一\n第二');assert.doesNotMatch(r.parser.parse('正常\n后行'),/data-qm-source/);assert.match(r.parser.parse('正常\n后行'),/<br>/);
});
test('custom inline rendering and raw HTML retain their source location',()=>{
  const r=render('开头\n\n==底色==\n\n<div>原生块</div>');
  assert.equal(r.nodes.find(n=>n.tag==='mark')?.dataset.line,'3');
  assert.equal(r.nodes.find(n=>n.tag==='div')?.dataset.line,'5');
});
test('same-row image separator whitespace stays an unwrapped text node',()=>{
  const r=render('![one](a.png) ![two](b.png)');
  assert.match(r.html,/<img[^>]*> <img/);
});
test('formula source identity and custom chart renderers survive mapped parsing',()=>{
  const parser=new Marked({gfm:true,breaks:true,extensions:mathExtensions,renderer:{code({text}){return `<div class="mermaid-diagram" data-mermaid-source="${text}"></div>`;}}});
  parser.Lexer=marked.Lexer;parser.Renderer=marked.Renderer;
  const map=createPreviewSourceMap(parser);
  const result=collectFormulaRendering(()=>map.parse('$x^2$\n$y+1$\n\n$$\nz=3\n$$\n\n```mermaid\nflowchart LR\n```\n\n后文'));
  assert.equal(result.formulas.length,3);
  for(const item of result.formulas)assert.ok(result.html.includes(`data-math-origin="${item.id}"`));
  assert.match(result.html,/<br>/);assert.match(result.html,/class="mermaid-diagram"/);assert.doesNotMatch(result.html,/katex-error/);
});
test('mapped body retains shared references when footnotes are present',()=>{
  const parser=new Marked({gfm:true,breaks:true});parser.Lexer=marked.Lexer;parser.Renderer=marked.Renderer;
  const prepared=prepareFootnotes('正文[^n]\n[链接][ref]\n\n[^n]: 脚注\n\n[ref]: https://example.com');
  const map=createPreviewSourceMap(parser,prepared.lineMap);
  const html=renderPreparedFootnotes(prepared,parser,'脚注',map.parse);
  assert.match(html,/href="https:\/\/example.com"/);assert.match(html,/class="footnotes"/);
});
