import test from 'node:test';
import assert from 'node:assert/strict';
import {markdownLanguage, markdown} from '@codemirror/lang-markdown';
import {EditorState} from '@codemirror/state';
import {syntaxTree,ensureSyntaxTree} from '@codemirror/language';
import {marked} from 'marked';
import {markdownParser, tableWhitespace, tableRenderSource} from '../src/markdown-parser.js';
import {buildLivePlan} from '../src/editor-live-preview.js';
import {findMarkdownTables} from '../src/table-designer.js';

test('table whitespace preserves cell offsets in standalone and editor parsers',()=>{
  for(const prefix of ['','> ','> > ','  ']) for(const trailing of ['',' ','  ','\t',' \t']) for(const outer of [true,false]) {
    const lines=outer?['| A | B |','| --- | ---: |','| C | D |']:['A | B','--- | ---:','C | D'];
    const source='😀 intro\n\n'+lines.map(line=>prefix+line+trailing).join('\n')+'\n\nend';
    const item=buildLivePlan(source).widgets.find(item=>item.kind==='table');assert.ok(item,JSON.stringify({prefix,trailing,outer}));
    assert.deepEqual(item.cells.map(c=>source.slice(c.from,c.to)),['A','B','C','D']);
    assert.equal(findMarkdownTables(source).length,1);
    assert.match(marked.parse(tableRenderSource(source)),/<table>/);
    assert.equal(tableRenderSource(source).length,source.length);
    const state=EditorState.create({doc:source,extensions:[markdown({base:markdownLanguage,extensions:[tableWhitespace]})]});
    // State creation may stop at its small parse budget under parallel load.
    // Compare complete trees, not an intentionally partial background parse.
    const parsed=ensureSyntaxTree(state,state.doc.length,5000);assert.ok(parsed);
    assert.equal(parsed.toString(),markdownParser.parse(source).toString());
    assert.equal(state.doc.toString(),source);
    const end=source.indexOf('D |')>=0?source.indexOf('D |')+1:source.indexOf('C | D')+5;
    const next=state.update({changes:{from:end,insert:'字'}}).state;
    const updated=ensureSyntaxTree(next,next.doc.length,5000);assert.ok(updated);
    assert.equal(updated.toString(),markdownParser.parse(next.doc.toString()).toString());
  }
});

test('tables can interrupt prose and retain empty/escaped cells and original body whitespace',()=>{
  const source='intro\n| A | B | \t\n| --- | --- | \t\n| | D\\|E | \t';
  const item=buildLivePlan(source).widgets.find(item=>item.kind==='table');assert.ok(item);
  assert.deepEqual(item.cells.map(c=>source.slice(c.from,c.to)),['A','B','','D\\|E']);
  assert.ok(item.raw.endsWith(' \t'));assert.ok(tableRenderSource(source).endsWith(' \t'));
  assert.equal(findMarkdownTables(source)[0].model.cells[1][1],'D|E');
});

test('render normalization never changes code examples, prose breaks, or invalid delimiter rows',()=>{
  const table='| A | B | \t\n| --- | --- | \t\n| C | D | \t';
  for(const source of ['```md\n'+table+'\n```',table.split('\n').map(l=>'    '+l).join('\n'),'prose  \nnext\t','heading\n===\t',table.replace('--- | ---','--- | nope')]) {
    assert.equal(tableRenderSource(source),source);
    assert.equal(findMarkdownTables(source).length,0);
  }
});
