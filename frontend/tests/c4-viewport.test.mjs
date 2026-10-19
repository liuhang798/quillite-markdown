import assert from 'node:assert/strict';
import test from 'node:test';
import {c4ViewportPlan,compactC4Viewport} from '../src/c4-viewport.js';

test('C4 viewport compaction removes only the empty leading lane and preserves horizontal canvas',()=>{
 const viewBox=[0,-70,1600,800],title={x:500,y:5,width:180,height:20},body={x:120,y:300,width:1360,height:380};
 const plan=c4ViewportPlan(viewBox,title,body);
 assert.equal(plan.dy,-243);assert.deepEqual(plan.viewBox,[0,-70,1600,531]);
 assert.equal(body.y+plan.dy,title.y+title.height+32);
 assert.ok(body.y+body.height+plan.dy < plan.viewBox[1]+plan.viewBox[3]);
 assert.deepEqual(viewBox,[0,-70,1600,800]);assert.equal(body.y,300);
});

test('C4 viewport plans leave compact, ambiguous and invalid bounds unchanged',()=>{
 const box={x:0,y:20,width:200,height:300};
 assert.equal(c4ViewportPlan([0,0,300,400],null,box),null);
 for(const viewBox of [[],[0,0,0,400],[0,0,300,NaN]])assert.equal(c4ViewportPlan(viewBox,null,box),null);
 assert.equal(c4ViewportPlan([0,0,300,400],null,{...box,y:Infinity}),null);
 assert.equal(c4ViewportPlan([0,0,300,400],{...box,height:-1},box),null);
 const plan=c4ViewportPlan([0,0,300,800],null,{...box,y:250});
 assert.equal(plan.dy,-226);assert.deepEqual(plan.viewBox,[0,0,300,348]);
});

test('C4 compaction ignores empty groups, keeps definitions/title and moves all body elements once',()=>{
 const matrix={a:1,b:0,c:0,d:1,e:0,f:0,inverse(){return this;},multiply(){return this;}};
 const element=(localName,box)=>({localName,getBBox:()=>box,getScreenCTM:()=>matrix});
 const empty=element('g',{x:0,y:0,width:0,height:0});
 const node=element('g',{x:100,y:300,width:300,height:200});
 const edges=element('g',{x:300,y:350,width:400,height:100});
 const title=element('text',{x:250,y:5,width:200,height:20});
 const defs={localName:'defs'},style={localName:'style'};
 const attrs={viewBox:'0 -70 900 800'},groups=[];
 const svg={children:[style,empty,defs,node,edges,title],getScreenCTM:()=>matrix,
  getAttribute:key=>attrs[key],setAttribute:(key,value)=>{attrs[key]=value;},
  querySelector:()=>groups[0]||null,querySelectorAll:()=>[title],
  insertBefore:(group,before)=>{svg.children.splice(svg.children.indexOf(before),0,group);groups.push(group);},
  ownerDocument:{createElementNS:()=>({localName:'g',attrs:{},children:[],setAttribute(key,value){this.attrs[key]=value;},appendChild(child){svg.children=svg.children.filter(item=>item!==child);this.children.push(child);}})}
 };
 compactC4Viewport(svg);
 assert.equal(groups.length,1);assert.deepEqual(groups[0].children,[empty,node,edges]);
 assert.deepEqual(svg.children,[style,groups[0],defs,title]);assert.equal(groups[0].attrs.transform,'translate(0 -243)');
 assert.equal(attrs.viewBox,'0 -70 900 351');assert.equal(attrs.height,'351');
 assert.equal(node.getBBox().y,300);assert.equal(edges.getBBox().y,350);
 compactC4Viewport(svg);assert.equal(groups.length,1);
});
