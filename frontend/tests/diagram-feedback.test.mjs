import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
const renderer=readFileSync(new URL('../src/renderer.js',import.meta.url),'utf8');
const toastFunctions=renderer.slice(renderer.indexOf('let toastPlacement;'),renderer.indexOf('function updateAccentSelection('));
const closeFunction=renderer.slice(renderer.indexOf('function closeDiagramDialog('),renderer.indexOf('function replaceExistingFlowchart('));
const element=()=>{const classes=new Set();return{dataset:{},style:{setProperty(){}},setAttribute(){},classList:{add:(...v)=>v.forEach(x=>classes.add(x)),remove:(...v)=>v.forEach(x=>classes.delete(x)),contains:x=>classes.has(x)}};};
function fixture(){
 const toast=element(),dialog=element(),nodes=new Map(),placement={starts:0,stops:0,start(){this.starts++;},stop(){this.stops++;}};let timer;
 const context=vm.createContext({els:{toast,diagramDialog:dialog},diagramWizardState:{saveRequest:{},editRange:{}},diagramPreviewTimer:0,
  document:{body:element()},createToastPlacement:()=>placement,setDiagramFullscreen(){},updateDiagramActionLabels(){},focusCodeEditor(){},
  $:selector=>{if(!nodes.has(selector))nodes.set(selector,element());return nodes.get(selector);},t:x=>x,
  clearTimeout(){},setTimeout:fn=>{timer=fn;return 1;}});
 vm.runInContext(toastFunctions+closeFunction,context);
 return{context,toast,dialog,placement,expire:()=>timer()};
}
test('closing a diagram clears only its owned obsolete validation toast',()=>{
 for(const scenario of ['own','paste','newer','same-text-unowned','other-owner']){
  const{context:c,toast}=fixture();c.showToast('invalid diagram','warning',undefined,c.diagramWizardState);
  if(scenario==='paste')c.showToast('invalid paste','warning',undefined,'diagram-paste');
  if(scenario==='newer')c.showToast('Save conflict','error');
  if(scenario==='same-text-unowned')c.showToast('invalid diagram','warning');
  if(scenario==='other-owner')c.showToast('invalid diagram','warning',undefined,{});
  c.closeDiagramDialog();assert.equal(toast.classList.contains('hidden'),scenario==='own'||scenario==='paste',scenario);
  assert.equal(c.diagramWizardState.saveRequest,null);assert.equal(c.diagramWizardState.editRange,null);
 }
});
test('toast expiry and manual dismissal release ownership before the next toast',()=>{
 for(const method of ['expire','manual']){
  const f=fixture(),c=f.context;c.showToast('invalid','warning',undefined,c.diagramWizardState);
  assert.equal(f.placement.starts,1);
  if(method==='expire')f.expire();else c.hideToast();assert.equal(c.showToast.owner,null);assert.equal(f.placement.stops,1);
  c.showToast('new warning','warning');c.closeDiagramDialog();assert.equal(f.toast.classList.contains('hidden'),false);
 }
});

test('canvas and structured visual-mode rejection warnings belong to their dialog',()=>{
 const functions=[['initialiseFlowchartVisual','parseCanvasDiagramSource'],['initialiseStructuredDiagramVisual','parseStructuredDiagram']];
 for(const [name,parser]of functions)for(const notify of [false,true]){
  const start=renderer.indexOf('function '+name+'('),end=renderer.indexOf('\nfunction ',start+1),calls=[];
  const owner={templateId:'flowchart'};
  const c=vm.createContext({diagramWizardState:owner,flowchartDesignerState:{},structuredDiagramState:{},[parser]:()=>({valid:false}),showToast:(...args)=>calls.push(args),t:key=>key});
  vm.runInContext(renderer.slice(start,end),c);assert.equal(c[name]('advanced',{notify}),false);
  assert.equal(calls.length,notify?1:0);if(notify)assert.equal(calls[0][3],owner);
 }
});
test('all source-validation failures are owned but stale-document warnings remain independent',()=>{
 const fn=renderer.slice(renderer.indexOf('function insertGeneratedDiagram('),renderer.indexOf('function openTableDialog('));
 assert.match(fn,/showToast\(t\('diagramInvalid'\), 'warning', undefined, diagramWizardState\)/);
 assert.match(fn,/dataChartRenderError[^\n]+undefined, diagramWizardState/);
 assert.match(fn,/mermaidRenderError[^\n]+undefined, diagramWizardState/);
 assert.match(fn,/showToast\(t\('diagramSourceChanged'\), 'warning'\)/);
 assert.match(fn,/showToast\(t\('diagramDraftChanged'\), 'warning'\)/);
});
test('Gantt excluded, alternate and completed regions do not inherit fixed white defaults',()=>{
 const source=readFileSync(new URL('../src/mermaid-diagrams.js',import.meta.url),'utf8');
 for(const [key,token]of [['excludeBkgColor','--line'],['altSectionBkgColor','--panel'],['doneTaskBkgColor','--panel'],['doneTaskBorderColor','--muted']])assert.ok(source.includes(`${key}: color('${token}'`),key);
});
