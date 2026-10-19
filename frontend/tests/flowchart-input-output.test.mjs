import test from 'node:test';
import assert from 'node:assert/strict';
import { FLOWCHART_SHAPES, FLOWCHART_IO_SKEW, flowchartBoundaryPoint, flowchartNodeSize, parseFlowchartSource, serializeFlowchart, addFlowchartNode, layoutFlowchart } from '../src/flowchart-designer.js';
import { DIAGRAM_TEMPLATES } from '../src/diagram-templates.js';

test('input/output shape and bilingual teaching examples round-trip without losing edges',()=>{
  assert.ok(FLOWCHART_SHAPES.some(shape=>shape.id==='input-output'&&shape.zh&&shape.en));
  for(const source of Object.values(DIAGRAM_TEMPLATES.find(t=>t.id==='flowchart').examples[0].source)) {
    const parsed=parseFlowchartSource(source);assert.equal(parsed.valid,true);
    assert.equal(parsed.model.nodes.filter(n=>n.shape==='input-output').length,2);
    const again=parseFlowchartSource(serializeFlowchart(parsed.model));assert.equal(again.valid,true);
    assert.deepEqual(again.model.nodes,parsed.model.nodes);assert.deepEqual(again.model.edges,parsed.model.edges);
    const added=addFlowchartNode(parsed.model,'input-output','输入／输出');assert.equal(added.node.shape,'input-output');
    assert.match(serializeFlowchart(added.model),/\[\/输入／输出\/\]/);
  }
});
for(const direction of ['LR','RL','TD','BT'])test('parallelogram layout avoids overlaps: '+direction,()=>{
  const model=parseFlowchartSource(DIAGRAM_TEMPLATES[0].examples[0].source.zh).model;
  const arranged=layoutFlowchart({...model,direction},400,250);
  for(let i=0;i<arranged.nodes.length;i++)for(let j=i+1;j<arranged.nodes.length;j++) {
    const a=arranged.nodes[i],b=arranged.nodes[j],sa=flowchartNodeSize(a),sb=flowchartNodeSize(b);
    assert.ok(Math.abs(a.x-b.x)>=(sa.width+sb.width)/2||Math.abs(a.y-b.y)>=(sa.height+sb.height)/2);
  }
});
test('connection ray hits actual slanted polygon boundary in every direction',()=>{
  const node={shape:'input-output',x:300,y:200},size=flowchartNodeSize(node);
  for(let deg=0;deg<360;deg+=5) {
    const angle=deg*Math.PI/180,target={x:node.x+300*Math.cos(angle),y:node.y+300*Math.sin(angle)};
    const p=flowchartBoundaryPoint(node,target),x=p.x-node.x,y=p.y-node.y;
    const horizontal=Math.abs(x+FLOWCHART_IO_SKEW*y/size.height)/((size.width-FLOWCHART_IO_SKEW)/2);
    const vertical=Math.abs(y)/(size.height/2);
    assert.ok(Math.abs(Math.max(horizontal,vertical)-1)<1e-9,'boundary '+deg);
    assert.ok(Math.abs(x*(target.y-node.y)-y*(target.x-node.x))<1e-7,'ray '+deg);
  }
});
test('changing an existing shape keeps id, label and connections',()=>{
  const parsed=parseFlowchartSource('flowchart LR\n A[输入文字] --> B[输出文字]').model;
  const changed={...parsed,nodes:parsed.nodes.map(n=>n.id==='A'?{...n,shape:'input-output'}:n)};
  const roundtrip=parseFlowchartSource(serializeFlowchart(changed)).model;
  assert.equal(roundtrip.nodes[0].label,'输入文字');assert.equal(roundtrip.nodes[0].shape,'input-output');
  assert.deepEqual(roundtrip.edges,parsed.edges);
});
