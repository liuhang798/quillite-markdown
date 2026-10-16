import test from 'node:test';
import assert from 'node:assert/strict';
import {opaqueDiagramRGB,diagramContrastRatio,automaticDiagramForeground,normalizeFlowchartNodeContrast} from '../src/diagram-contrast.js';

test('automatic diagram foreground only adjusts opaque low-contrast sRGB colours',()=>{
 assert.deepEqual(opaqueDiagramRGB('rgb(255 0 3 / 1)'),[255,0,3]);
 for(const value of ['rgba(255,255,255,.95)','transparent','none','url(#paint)','color(display-p3 1 1 1)','rgb(300,0,0)','rgb(1.2.3,0,0)'])assert.equal(opaqueDiagramRGB(value),null,value);
 assert.equal(diagramContrastRatio([0,0,0],[255,255,255]),21);
 assert.equal(automaticDiagramForeground('rgb(255,255,255)','rgb(236,238,236)'),'#000000');
 assert.equal(automaticDiagramForeground('rgb(17,17,17)','rgb(30,30,30)'),'#FFFFFF');
 assert.equal(automaticDiagramForeground('rgb(255,255,255)','rgb(0,0,0)'),null);
 assert.equal(automaticDiagramForeground('rgba(255,255,255,.95)','rgb(236,238,236)'),null);
 for(let value=0;value<=255;value++){
  const color=automaticDiagramForeground(`rgb(${value},${value},${value})`,`rgb(${value},${value},${value})`);
  assert.ok(diagramContrastRatio([value,value,value],color==='#000000'?[0,0,0]:[255,255,255])>=4.5);
 }
});

test('rendered diagram contrast respects author text colours, opacity and unknown backgrounds',()=>{
 const old=globalThis.getComputedStyle;
 try{
  for(const kind of ['automatic','readable','explicit-label','explicit-text','explicit-attribute','explicit-node','default','alpha','opacity','label-opacity','fill-opacity','mixed']){
   const changed=[];
   const make=(style={},computed={},attrs={})=>({style:{...style,setProperty:(name,value,priority)=>changed.push({name,value,priority})},computed:{opacity:'1',...computed},hasAttribute:name=>name in attrs});
   const svg={},node=make(),shape=make({fill:kind==='default'?'':'#fff'},{fill:kind==='alpha'?'rgba(255,255,255,.9)':'rgb(255,255,255)',fillOpacity:kind==='fill-opacity'?'.4':'1'});
   const label=make(),text=make({}, {fill:kind==='readable'?'rgb(0,0,0)':'rgb(236,238,236)'}),span=make({}, {fill:kind==='mixed'?'rgb(0,0,0)':'rgb(236,238,236)'});
   if(kind==='readable')span.computed.fill='rgb(0,0,0)';
   if(kind==='explicit-label')label.style.color='#eee';if(kind==='explicit-text')text.style.fill='#eee';if(kind==='explicit-node')node.style.color='#eee';
   if(kind==='explicit-attribute')span.hasAttribute=name=>name==='fill';if(kind==='opacity')node.computed.opacity='.4';
   if(kind==='label-opacity')label.computed.opacity='.4';
   shape.parentElement=node;node.parentElement=svg;label.querySelectorAll=()=>[text,span];node.querySelector=s=>s==='.label-container'?shape:label;svg.querySelectorAll=()=>[node];
   globalThis.getComputedStyle=element=>element.computed;normalizeFlowchartNodeContrast(svg);
   assert.equal(changed.length,kind==='automatic'?2:0,kind);
   if(changed.length)assert.deepEqual(changed[0],{name:'fill',value:'#000000',priority:'important'});
  }
 }finally{if(old)globalThis.getComputedStyle=old;else delete globalThis.getComputedStyle;}
});
