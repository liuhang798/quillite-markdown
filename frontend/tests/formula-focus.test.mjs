import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
const renderer=readFileSync(new URL('../src/renderer.js',import.meta.url),'utf8');
const handler=renderer.slice(renderer.indexOf('function scheduleFormulaFocus('),renderer.indexOf('\nfunction chooseFormulaTemplate('));
for(const change of ['none','clicked-field','closed','new-session'])test('formula deferred focus respects '+change,()=>{
 let callback,focused=0,hidden=false;
 const context={formulaWizardState:{context:{}},document:{activeElement:{}},els:{formulaDialog:{classList:{contains:()=>hidden}}},requestAnimationFrame:fn=>{callback=fn;},target:{focus(){focused++;}}};
 vm.runInNewContext(handler+'\nscheduleFormulaFocus(()=>target);',context);
 if(change==='clicked-field')context.document.activeElement={};
 if(change==='closed')hidden=true;
 if(change==='new-session')context.formulaWizardState.context={};
 callback();assert.equal(focused,change==='none'?1:0);
});
