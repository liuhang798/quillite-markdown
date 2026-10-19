import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import {formulaMatrixCell,formulaMatrixRow} from '../src/formula-matrix.js';
import {buildFormulaExpression,formulaTemplateById} from '../src/formula-templates.js';
import {renderLatexResult} from '../src/math-rendering.js';

for(const [row,expected]of [
 [' a , b , c ','a&b&c'],['a，b，c','a&b&c'],
 ['f(x,y),b,c','f(x,y)&b&c'],['(0,1],b,c','(0,1]&b&c'],
 [String.raw`\left[0,1\right),\{a,b\},c`,String.raw`\left[0,1\right)&\{a,b\}&c`],
 [String.raw`\frac{x,y}{z},\text{a(b,c},z`,String.raw`\frac{x,y}{z}&\text{a(b,c}&z`],
 [String.raw`\begin{matrix}a&b\\c&d\end{matrix},1\,000,z`,String.raw`\begin{matrix}a&b\\c&d\end{matrix}&1\,000&z`],
 [String.raw`\substack{a\\b},\langle a,b\rangle,\left|x,y\right|`,String.raw`\substack{a\\b}&\langle a,b\rangle&\left|x,y\right|`],
 [String.raw`\text{50\%},\text{A\&B},{a,b}`,String.raw`\text{50\%}&\text{A\&B}&{a,b}`],
 ])test('matrix row preserves cell scope: '+row,()=>{
  assert.equal(formulaMatrixRow(row),expected);
  const expression=buildFormulaExpression(formulaTemplateById('matrix3'),{row1:row});
  assert.equal(renderLatexResult(expression,true).valid,true,expression);
 });

test('matrix rows reject missing, extra, empty or structurally leaking cells',()=>{
 for(const row of ['','a,b','a,b,c,d','a,,c',',b,c','a,b,','f(x,y,b,c',String.raw`a&b,c,d`,String.raw`a\\b,c,d`,String.raw`a\cr b,c,d`,String.raw`\end{matrix},b,c`,String.raw`\begin{matrix}a,b,c`,String.raw`\begin{matrix}a\end{bmatrix},b,c`,String.raw`\left(a,b,c`,String.raw`\right),b,c`,String.raw`a%comment,b,c`,String.raw`\def\x{&}\x,b,c`])assert.throws(()=>formulaMatrixRow(row),/FORMULA_MATRIX_INVALID/,row);
});

test('matrix cell inputs cannot create new outer rows, columns or environments',()=>{
 for(const value of ['','a&b',String.raw`(a&b)`,String.raw`a\\b`,String.raw`a\newline b`,String.raw`\end{bmatrix}`,String.raw`a%comment`,String.raw`\gdef\x{&}\x`]){
  assert.throws(()=>formulaMatrixCell(value),/FORMULA_MATRIX_INVALID/,value);
  assert.throws(()=>buildFormulaExpression(formulaTemplateById('matrix2'),{a11:value}),/FORMULA_MATRIX_INVALID/);
  assert.throws(()=>buildFormulaExpression(formulaTemplateById('determinant2'),{a11:value}),/FORMULA_MATRIX_INVALID/);
  assert.throws(()=>buildFormulaExpression(formulaTemplateById('inverse2'),{a:value}),/FORMULA_MATRIX_INVALID/);
 }
 for(const value of ['f(x,y)',String.raw`\text{a(b,c}`,String.raw`\begin{matrix}a&b\\c&d\end{matrix}`,String.raw`\substack{a\\b}`])assert.equal(formulaMatrixCell(value),value);
});

test('matrix parser has bounded text and nesting while preserving supported values',()=>{
 assert.throws(()=>formulaMatrixCell('x'.repeat(32769)),/FORMULA_MATRIX_INVALID/);
 assert.throws(()=>formulaMatrixCell('{'.repeat(257)+'x'+'}'.repeat(257)),/FORMULA_MATRIX_INVALID/);
 assert.equal(formulaMatrixCell('{'.repeat(20)+'x'+'}'.repeat(20)),'{'.repeat(20)+'x'+'}'.repeat(20));
});

test('actual preview handler preserves invalid matrix fields and disables writing',()=>{
 const renderer=readFileSync(new URL('../src/renderer.js',import.meta.url),'utf8');
 const handler=renderer.slice(renderer.indexOf('function updateFormulaPreview()'),renderer.indexOf('\nfunction renderFormulaPreview('));
 const fields={row1:'a,b',row2:'d,e,f',row3:'g,h,i'},button={disabled:false};
 const context={formulaTemplateById,buildFormulaExpression,formulaFieldValues:()=>fields,formulaWizardState:{templateId:'matrix3',valuesByTemplate:new Map(),sourceEdited:true},els:{formulaMarkdownSource:{value:'old'},formulaPreview:{textContent:''}},syncFormulaVisualEditor(){},t:key=>key,$:()=>button};
 vm.runInNewContext(handler+'\nupdateFormulaPreview();',context);
 assert.equal(context.els.formulaPreview.textContent,'formulaMatrixInvalid');assert.equal(button.disabled,true);assert.equal(context.els.formulaMarkdownSource.value,'');assert.deepEqual(context.formulaWizardState.valuesByTemplate.get('matrix3'),fields);
});
