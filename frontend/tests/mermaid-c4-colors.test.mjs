import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {patchMermaidC4Colors} from '../scripts/mermaid-c4-colors.mjs';
const original=readFileSync(new URL('../node_modules/mermaid/dist/mermaid.min.js',import.meta.url),'utf8');
test('C4 color metadata fails closed and records explicit/default provenance',()=>{
 const patched=patchMermaidC4Colors(original);
 assert.match(patched,/fontColor==null\?"c4-auto-color":"c4-explicit-color"/);
 assert.match(patched,/attr\("data-c4-border-auto",![\w$]+\.borderColor\)/);
 assert.match(patched,/attr\("data-c4-text-auto",![\w$]+\.fontColor\)/);
 for(const input of ['different',original+original,patched])assert.throws(()=>patchMermaidC4Colors(input),/color structure changed/);
});
