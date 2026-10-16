import test from 'node:test';
import assert from 'node:assert/strict';
import { EditorState } from '@codemirror/state';
import { marked } from 'marked';
import { blockDropPrefix } from '../src/block-drop-context.js';
import { textDragTransaction } from '../src/editable-text-drag.js';

test('drop prefixes follow real list, quote and nested ancestors',()=>{
  for (const [source,prefix] of [
    ['> TARGET','> '],['>> TARGET','>> '],['- TARGET','  '],['123. TARGET','     '],
    ['- [x] TARGET','  '],['> - TARGET','>   '],['- > TARGET','  > '],
    ['- parent\n  - TARGET','    '],['> paragraph\nTARGET','> '],
    ['- paragraph\nTARGET','  '],['  - TARGET','    '],['-\tTARGET','    '],
  ]) assert.equal(blockDropPrefix(source,source.indexOf('TARGET')+2),prefix,source);
});
test('plain text and code do not acquire quote or list prefixes',()=>{
  for (const source of ['TARGET','-TARGET','>TARGET\n\nTARGET','```\n> TARGET\n```','    - TARGET']) {
    const at=source.lastIndexOf('TARGET');assert.equal(blockDropPrefix(source,at+2),'',source);
  }
});
test('whole-block drops stay inside quote/list targets and preserve literal content',()=>{
  const code='```text\nABC\nDEF\n```',payload='start\n\n'+code+'\n\n';
  for (const target of ['> TARGET\n> end','- TARGET\n- next','> - TARGET\n> - next','- > TARGET\n- next','- parent\n  - TARGET\n  - next']) {
    const source=payload+'divider\n\n'+target,at=source.indexOf('TARGET')+2;
    const from=source.indexOf('```'),blocks=[{kind:'code',from,to:from+code.length,contentFrom:from+8,contentTo:from+15}];
    for (const move of [true,false]) {
      const tr=textDragTransaction(source,{from:0,to:payload.length},at,move,blocks);
      const result=EditorState.create({doc:source}).update(tr).newDoc.toString();
      const prefix=blockDropPrefix(source,at);
      const insertion=('\n\n'+payload).replaceAll('\n','\n'+prefix);
      assert.equal(result,(move?'':payload)+'divider\n\n'+target.replace('TARGET','TA'+insertion+'RGET'));
      // Rendered structure, not only a source-string snapshot: the moved code
      // must belong to a quote/list token, never become a top-level code block.
      const tokens=marked.lexer(result);assert.equal(tokens.filter(x=>x.type==='code').length,move?0:1);
      const html=marked.parse(result);assert.match(html,/<code class="language-text">ABC\nDEF\n<\/code>/);
    }
  }
});
