import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import {parseFormulaMarkdown,formulaInlineLayout,formulaInlineHasNewline,resolveFormulaOutput,buildFormulaMarkdown} from '../src/formula-templates.js';
const renderer=readFileSync(new URL('../src/renderer.js',import.meta.url),'utf8');
const update=renderer.slice(renderer.indexOf('function updateFormulaPreviewFromMarkdown('),renderer.indexOf('\nfunction scheduleFormulaFocus('));
const choose=renderer.slice(renderer.indexOf('function chooseFormulaMode('),renderer.indexOf('\nfunction chooseFormulaInlineLayout('));
function fixture(source,mode='inline'){
 const number={value:'previous'},visibility=[],previews=[];
 const c=vm.createContext({els:{formulaMarkdownSource:{value:source},formulaPreview:{}},formulaWizardState:{mode},
  $:id=>id==='#formulaNumber'?number:{classList:{toggle:(name,hidden)=>visibility.push(hidden)}},
  parseFormulaMarkdown,formulaInlineLayout,formulaInlineHasNewline,resolveFormulaOutput,buildFormulaMarkdown,
  renderFormulaOutputModes(){},renderFormulaPreview:(...args)=>previews.push(args),t:k=>k});
 vm.runInContext(update+choose,c);return{c,number,visibility,previews};
}
test('manual display tags synchronize the visible number without rewriting Markdown',()=>{
 for(const tag of ['验-12','Sec. 2-a','0',' spaced ',''])for(const wrap of [s=>'$$\n'+s+'\n$$',s=>'\\['+s+'\\]']){
  const source=wrap('x+y \\tag{'+tag+'}'),f=fixture(source);f.c.updateFormulaPreviewFromMarkdown();
  assert.equal(f.number.value,tag);assert.equal(f.c.formulaWizardState.mode,'numbered');assert.equal(f.visibility.at(-1),false);assert.equal(f.c.els.formulaMarkdownSource.value,source);assert.equal(f.previews.at(-1)[2],source);
 }
});
test('temporary unnumbered or inline source retains the remembered number',()=>{
 for(const source of ['$$x+y$$','$x+y$','\\(x+y\\)','x+y']){
  const f=fixture(source);f.c.updateFormulaPreviewFromMarkdown();assert.equal(f.number.value,'previous');assert.equal(f.c.els.formulaMarkdownSource.value,source);
 }
});
test('mode switching retains a manual tag and explicit number input updates it exactly once',()=>{
 const f=fixture('$$\nx+y \\tag{验-12}\n$$');f.c.updateFormulaPreviewFromMarkdown();
 f.c.chooseFormulaMode('block');assert.doesNotMatch(f.c.els.formulaMarkdownSource.value,/\\tag/);assert.equal(f.number.value,'验-12');
 f.c.chooseFormulaMode('numbered');assert.match(f.c.els.formulaMarkdownSource.value,/\\tag\{验-12\}/);
 f.number.value='R-3';f.c.chooseFormulaMode('numbered');assert.equal(f.number.value,'R-3');assert.equal((f.c.els.formulaMarkdownSource.value.match(/\\tag\{/g)||[]).length,1);assert.match(f.c.els.formulaMarkdownSource.value,/\\tag\{R-3\}/);
});
