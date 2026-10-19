import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
const renderer=readFileSync(new URL('../src/renderer.js',import.meta.url),'utf8');
const preview=renderer.slice(renderer.indexOf('function renderFormulaPreview('),renderer.indexOf('\nfunction updateFormulaPreviewFromMarkdown'));
const close=renderer.slice(renderer.indexOf('function closeFormulaDialog('),renderer.indexOf('\nfunction insertGeneratedFormula('));
const insert=renderer.slice(renderer.indexOf('function insertGeneratedFormula('),renderer.indexOf('\nconst diagramWizardState'));
function fixture(){
 const button={},calls=[];
 const showToast=(message,kind,duration,owner=null)=>{showToast.owner=owner;calls.push({message,owner});};
 const c=vm.createContext({els:{formulaMarkdownSource:{value:'',focus(){}},formulaPreview:{append(){}},formulaDialog:{classList:{contains:()=>false,add(){}}}},
  formulaWizardState:{},formulaVisualRequest:0,formulaVisualEditor:null,formulaInertElements:[],
  document:{querySelector:()=>null,body:{classList:{remove(){}}},createElement:()=>({})},
  focusCodeEditor(){},$:()=>button,t:k=>k,showToast,hideToast:()=>{calls.push('hide');showToast.owner=null;},
  hasFormulaPlaceholders:expression=>expression==='placeholder',formulaMarkdownMatches:expression=>expression!=='boundary',
  renderLatexResult:expression=>({valid:expression!=='invalid',html:'rendered'}),DOMPurify:{sanitize:html=>html}});
 vm.runInContext(preview+close+insert,c);return{c,calls,button,showToast};
}
test('formula validation warning clears after valid correction without modifying the document',()=>{
 const f=fixture();f.c.insertGeneratedFormula();assert.equal(f.showToast.owner,f.c.formulaWizardState);
 f.c.renderFormulaPreview('x',false);assert.equal(f.button.disabled,false);assert.equal(f.calls.at(-1),'hide');
});
test('invalid, incomplete and mismatched formulas keep their validation warning',()=>{
 for(const [expression,markdown]of [['invalid',''],['placeholder',''],['x','boundary']]){
  const f=fixture();f.c.insertGeneratedFormula();f.c.renderFormulaPreview(expression,false,markdown);
  assert.equal(f.button.disabled,true);assert.equal(f.showToast.owner,f.c.formulaWizardState);assert.ok(!f.calls.includes('hide'));
 }
});
test('closing the formula dialog clears only its validation warning',()=>{
 const f=fixture();f.c.insertGeneratedFormula();f.c.closeFormulaDialog(false);assert.equal(f.calls.at(-1),'hide');
});
test('valid correction and dialog close preserve newer or unrelated warnings',()=>{
 for(const owner of [null,{},'table-paste']){
  const f=fixture();f.c.insertGeneratedFormula();f.showToast('formulaInvalid','warning',undefined,owner);
  f.c.renderFormulaPreview('x',false);f.c.closeFormulaDialog(false);
  assert.equal(f.showToast.owner,owner);assert.ok(!f.calls.includes('hide'));
 }
});
