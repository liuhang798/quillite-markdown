import test from 'node:test';
import assert from 'node:assert/strict';
import { editorOutline, captureEditorPosition } from '../src/editor-navigation.js';

test('editor outline indexes real ATX/setext/nested headings, not code or metadata', () => {
  const source = '---\ntitle: sample\n# metadata\n---\n\n# **First**\n\n```md\n# fake\n```\n\n> ## Quote\n\nSetext\n------\n\n## Duplicate\n\n## Duplicate\n';
  const headings = editorOutline(source);
  assert.deepEqual(headings.map(h => [h.text, h.level]), [['**First**',1],['Quote',2],['Setext',2],['Duplicate',2],['Duplicate',2]]);
  assert.deepEqual(headings.map(h => source.slice(h.from, h.from + 2)), ['# ', '##', 'Se', '##', '##']);
  assert.notEqual(headings[3].from, headings[4].from);
});

test('outline source offsets survive CRLF and escaped inline text', () => {
  const source = '# 中文\r\n\r\n## \u0060code\u0060 & <tag>\r\n';
  assert.equal(editorOutline(source)[1].from, source.indexOf('##'));
});

test('capture skips blank gaps and retains a position descriptor, not editor state', () => {
  const lines = [{from:0,number:1,text:''},{from:1,number:2,text:'## Next'}];
  const view = {documentTop:-500,scrollDOM:{scrollTop:600,getBoundingClientRect:()=>({top:100})},
    state:{doc:{lines:2,lineAt:()=>lines[0],line:n=>lines[n-1]}},
    lineBlockAtHeight:()=>({from:0,top:590,height:30}),lineBlockAt:()=>({from:1,top:620,height:30})};
  assert.deepEqual(captureEditorPosition(view),{line:2,offset:20,scrollTop:600});
});
