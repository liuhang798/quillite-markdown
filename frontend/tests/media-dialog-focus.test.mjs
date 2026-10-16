import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
const renderer=readFileSync(new URL('../src/renderer.js',import.meta.url),'utf8');
function fixture(extra={}) {
 const queued=[],events=[];let active=null;
 const input=name=>({focus(){active=name;events.push(name);},select(){events.push('select');}});
 const context=vm.createContext({requestAnimationFrame:cb=>queued.push(cb),...extra});
 return {context,queued,events,input,get active(){return active;}};
}
test('image dialog focuses its visible URL immediately and leaves later caption focus alone',()=>{
 const f=fixture({state:{currentFile:{},editing:true},preferredImageWidth:()=>100,updateImageWidthLabel(){},releaseImageInsertion(){},captureImageInsertion:()=>({}),
  codeEditor:{state:{selection:{main:{from:0,to:3}},doc:{sliceString:()=> 'alt'}}},
  document:{body:{classList:{add(){}}}}});
 f.context.els={imageUrl:f.input('url'),imageWidth:{},imageAltInput:f.input('alt'),imageDialog:{classList:{remove(){f.events.push('visible');}}}};
 vm.runInContext(renderer.slice(renderer.indexOf('function openImageDialog()'),renderer.indexOf('\nfunction closeImageDialog()')),f.context);
 f.context.openImageDialog();assert.equal(f.active,'url');assert.deepEqual(f.events,['visible','url']);
 assert.equal(f.context.els.imageAltInput.value,'alt');assert.equal(f.queued.length,0);
 f.context.els.imageAltInput.focus();f.queued.forEach(cb=>cb());assert.equal(f.active,'alt');
 f.context.state.currentFile=null;f.context.openImageDialog();assert.equal(f.active,'alt');
});
test('mindmap new-node label focuses and selects after rendering, without a pending request',()=>{
 const f=fixture({flowchartDesignerState:{model:{canvasType:'mindmap',nodes:[{id:'root',mindmapRoot:true}],edges:[]}},t:k=>k,
  addFlowchartNode:model=>{const node={id:'child'};return {node,model:{...model,nodes:[...model.nodes,node]}};},
  addFlowchartEdge:(model,from,to)=>({...model,edges:[...model.edges,{from,to}]}),syncFlowchartSource(){}});
 f.context.renderFlowchartCanvas=()=>f.events.push('render');f.context.els={flowchartNodeLabel:f.input('label')};
 const start=renderer.indexOf('function addFlowchartNodeAt('),end=renderer.indexOf('\nfunction ',start+1);
 vm.runInContext(renderer.slice(start,end),f.context);f.context.addFlowchartNodeAt('process');
 assert.deepEqual(f.events,['render','label','select']);assert.equal(f.queued.length,0);
 f.input('search').focus();f.queued.forEach(cb=>cb());assert.equal(f.active,'search');
 assert.equal(f.context.flowchartDesignerState.model.edges[0].to,'child');
});
test('structured row focuses its attached field immediately and enforces row limit',()=>{
 const f=fixture({structuredDiagramState:{model:{rows:[]},definition:{empty:{label:''}}},t:k=>k,
  renderStructuredDiagramEditor(){},syncStructuredDiagramSource(){},showToast(){}});
 let click;f.context.$=()=>({addEventListener:(name,cb)=>click=cb});
 f.context.els={structuredDiagramRows:{lastElementChild:{querySelector:()=>f.input('new-row')}}};
 const start=renderer.indexOf("$('#addStructuredDiagramRow').addEventListener('click', () => {");
 vm.runInContext(renderer.slice(start,renderer.indexOf('\nels.structuredDiagramRows.addEventListener',start)),f.context);
 click();assert.equal(f.active,'new-row');assert.equal(f.context.structuredDiagramState.model.rows.length,1);assert.equal(f.queued.length,0);
 f.input('chosen-row').focus();f.queued.forEach(cb=>cb());assert.equal(f.active,'chosen-row');
 f.context.structuredDiagramState.model.rows.length=2000;click();assert.equal(f.active,'chosen-row');assert.equal(f.context.structuredDiagramState.model.rows.length,2000);
});

for(const canvasType of ['flowchart','state'])test(`${canvasType} node insertion focuses immediately without a stale request`,()=>{
 const f=fixture({flowchartDesignerState:{model:{canvasType,nodes:[{id:'root',label:'Existing'}],edges:[]}},t:k=>k,
  addFlowchartNode:(model,shape,label)=>{const node={id:'child',shape,label};return{node,model:{...model,nodes:[...model.nodes,node]}};},syncFlowchartSource(){}});
 f.context.renderFlowchartCanvas=()=>f.events.push('render');f.context.els={flowchartNodeLabel:f.input('label')};
 const start=renderer.indexOf('function addFlowchartNodeAt('),end=renderer.indexOf('\nfunction ',start+1);
 vm.runInContext(renderer.slice(start,end),f.context);f.context.addFlowchartNodeAt('process');
 assert.deepEqual(f.events,['render','label','select']);assert.equal(f.queued.length,0);
 f.input('search').focus();f.queued.forEach(cb=>cb());assert.equal(f.active,'search');
 assert.equal(f.context.flowchartDesignerState.model.nodes.length,2);
});
