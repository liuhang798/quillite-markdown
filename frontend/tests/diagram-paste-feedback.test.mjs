import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import {parsePastedTable} from '../src/chart-data-editor.js';
const renderer=readFileSync(new URL('../src/renderer.js',import.meta.url),'utf8');
const source=renderer.slice(renderer.indexOf("$('#applyDiagramPaste').addEventListener"),renderer.indexOf("$('#addDiagramSeries').addEventListener"));
function fixture(){
 const nodes=new Map(),calls=[];let handler;
 const showToast=(message,kind,duration,owner=null)=>{showToast.owner=owner;calls.push(message);};
 const c=vm.createContext({$:id=>{if(!nodes.has(id))nodes.set(id,{value:'',checked:false,addEventListener:(event,fn)=>{handler=fn;}});return nodes.get(id);},
  structuredDiagramState:{model:{rows:[{label:'original',value:1}]},definition:{columns:[{key:'label'},{key:'value',type:'number'}]}},
  diagramWizardState:{templateId:'bar-chart'},parsePastedTable,validateStructuredDiagram:()=>({valid:true}),
  renderStructuredDiagramEditor(){},syncStructuredDiagramSource(){},t:k=>k,showToast,hideToast:()=>{calls.push('hide');showToast.owner=null;}});
 vm.runInContext(source,c);return{c,calls,showToast,paste:text=>{c.$('#diagramPasteText').value=text;handler();}};
}
test('chart paste retry clears its own obsolete warning and applies the new rows',()=>{
 const f=fixture(),original=JSON.stringify(f.c.structuredDiagramState.model);
 f.paste('"unclosed');assert.equal(JSON.stringify(f.c.structuredDiagramState.model),original);assert.equal(f.showToast.owner,'diagram-paste');
 f.paste('new,2');assert.equal(f.c.structuredDiagramState.model.rows[0].label,'new');assert.equal(f.calls.at(-1),'hide');assert.equal(f.showToast.owner,null);
});
test('successful chart paste preserves newer or unrelated warnings',()=>{
 for(const owner of [null,{},'table-paste']){const f=fixture();f.paste('"unclosed');f.showToast('another warning','warning',undefined,owner);f.paste('new,2');assert.equal(f.showToast.owner,owner);assert.ok(!f.calls.includes('hide'));}
});
test('repeated invalid chart paste retains its warning and original data',()=>{
 const f=fixture(),original=JSON.stringify(f.c.structuredDiagramState.model);f.paste('"unclosed');f.paste('missing');assert.equal(JSON.stringify(f.c.structuredDiagramState.model),original);assert.equal(f.showToast.owner,'diagram-paste');assert.ok(!f.calls.includes('hide'));
});
