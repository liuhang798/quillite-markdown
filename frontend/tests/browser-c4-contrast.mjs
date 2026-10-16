// UI-only edits of synthetic documents in a new browser; DOM is read-only.
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import {writeFile} from 'node:fs/promises';
import {createServer} from 'vite';
import {diagramContrastRatio,opaqueDiagramRGB} from '../src/diagram-contrast.js';
const {chromium}=createRequire(import.meta.url)(process.env.PLAYWRIGHT_MODULE||'playwright');
const component='C4Component\nContainer_Boundary(app,"Boundary") {\nComponent(a,"Input","JS","Keyboard")\nComponent(b,"Parser","JS","Markdown")\n}\nRel(a,b,"Parses")';
const cases=[
 ['component',component],
 ['container','C4Container\nPerson(a,"Reader","Local user")\nContainer(b,"Editor","JS","Markdown")\nRel(a,b,"Edits")'],
 ['background',component+'\nUpdateElementStyle(a,$bgColor="#ffffff")'],
 ['explicit-white',component+'\nUpdateElementStyle(a,"#ffffff","#ffffff")'],
 ['explicit-black',component+'\nUpdateElementStyle(a,"#ffffff","#000000")\nUpdateElementStyle(app,"none","#000000","#444444")\nUpdateRelStyle(a,b,"#000000","#444444")'],
 ['custom-colors',component+'\nUpdateElementStyle(a,"#ffffff","#bb5588")\nUpdateElementStyle(app,"none","#bb5588","#bb5588")\nUpdateRelStyle(a,b,"#bb5588","#bb5588")'],
 ['mixed-arrows','C4Dynamic\nContainer(a,"Client","JS","Editor")\nContainer(b,"Server","Go","Files")\nContainer(c,"Store","Disk","Local")\nRel(a,b,"Parses")\nRel_Back(a,b,"Reply")\nBiRel(b,c,"Sync")\nRel(c,a,"Load")\nUpdateRelStyle(a,b,"#bb5588","#bb5588")\nUpdateRelStyle(b,c,"#0088cc","#0088cc")']
];
const routingNodes='Container(a,"Client","JS","Editor")\nContainer(b,"Server","Go","Files")\nContainer(c,"Store","Disk","Local")';
cases.push(
 ['routing-vertical',`C4Dynamic\n${routingNodes}\nRel(a,c,"Parses","HTTPS")\nUpdateLayoutConfig("1","1")`],
 ['routing-reverse',`C4Dynamic\n${routingNodes}\nRel_Back(a,c,"Parses")`],
 ['routing-offset',`C4Dynamic\n${routingNodes}\nRel(a,c,"Parses")\nUpdateRelStyle(a,c,"#bb5588","#bb5588","18","-6")`],
 ['routing-context',`C4Container\n${routingNodes}\nRel(a,c,"Parses")`],
 ['routing-parallel',`C4Dynamic\n${routingNodes}\nRel(a,c,"Parses")\nRel(a,c,"Saves")\nRel_Back(a,c,"Reply")`],
 ['routing-self','C4Dynamic\nContainer(a,"Client","JS","Editor")\nRel(a,a,"Parses")'],
 ['routing-parallel-vertical',`C4Dynamic\n${routingNodes}\nRel(a,c,"Parses")\nRel(a,c,"Saves")\nRel_Back(a,c,"Reply")\nUpdateLayoutConfig("1","1")`],
 ['routing-self-repeated','C4Dynamic\nContainer(a,"Client","JS","Editor")\nRel(a,a,"Parses")\nRel_Back(a,a,"Retry")\nBiRel(a,a,"Sync")'],
 ['routing-self-context','C4Container\nContainer(a,"Client","JS","Editor")\nRel(a,a,"Parses")\nUpdateRelStyle(a,a,"#bb5588","#bb5588","12","-6")'],
 ['routing-self-neighbor',`C4Dynamic\n${routingNodes}\nRel(a,a,"Parses")\nRel(a,b,"Sends")`],
 ['routing-multirow',`C4Dynamic\n${Array.from({length:6},(_,i)=>`Container(n${i},"Node ${i}","JS","Editor")`).join('\n')}\nRel(n0,n5,"Parses")\nUpdateLayoutConfig("2","2")`]
);
cases.push(
 ['complex-cross-pairs','C4Dynamic\nContainer(a,"Input","JS","Editor")\nContainer(b,"Parser","Go","Files")\nContainer(c,"Store","Disk","Local")\nContainer(d,"Output","JS","Preview")\nRel(a,d,"Parses")\nRel(b,c,"Saves")\nUpdateLayoutConfig("2","2")'],
 ['complex-long-caption',`C4Dynamic\n${routingNodes}\nRel(a,c,"Parses a long Markdown document with embedded images and scientific formulas","HTTPS")\nRel_Back(a,c,"Returns the rendered Markdown document with tables and diagrams","JSON")`],
 ['complex-shapes','C4Container\nPerson(a,"Reader","Local user")\nContainerDb(b,"Database","SQLite","Documents")\nContainerQueue(c,"Queue","Tasks","Pending work")\nRel(a,c,"Parses")\nRel(c,a,"Reply")'],
 ['complex-person-loop','C4Context\nPerson(a,"Reader","Local user")\nSystem(b,"Editor","Markdown")\nRel(a,a,"Parses")\nRel(a,b,"Edits")'],
 ['complex-person-external-loop','C4Context\nPerson_Ext(a,"Reader","External user")\nSystem(b,"Editor","Markdown")\nRel(a,a,"Parses")\nRel(a,b,"Edits")'],
 ['complex-storage-loops','C4Container\nContainerDb(a,"Database","SQLite","Documents")\nContainerQueue(b,"Queue","Tasks","Pending work")\nRel(a,a,"Parses")\nRel(b,b,"Queues")'],
 ['complex-person-colors','C4Context\nPerson(a,"Reader","Local user")\nPerson_Ext(b,"Reviewer","External user")\nRel(a,b,"Parses")\nUpdateElementStyle(a,$bgColor="#ffffff")\nUpdateElementStyle(b,"#ffffff","#bb5588")']
);
const selected=process.env.AUDIT_CASE?cases.filter(([id])=>id===process.env.AUDIT_CASE):process.env.AUDIT_COMPLEX?cases.filter(([id])=>id.startsWith('complex-')):process.env.AUDIT_OBSTACLES?cases.filter(([id])=>id==='mixed-arrows'||id.startsWith('routing-')):cases;
assert.ok(selected.length);
const server=await createServer({root:fileURLToPath(new URL('..',import.meta.url)),server:{host:'127.0.0.1',port:0,watch:null,hmr:false},logLevel:'error'});let browser,page;
try{
 await server.listen();browser=await chromium.launch({headless:true,executablePath:process.env.BROWSER_EXECUTABLE||undefined});page=await browser.newPage({viewport:{width:1600,height:1000}});page.setDefaultTimeout(20000);const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto(server.resolvedUrls.local[0]+'tests/fixtures/app-drag-audit.html');const app=page.frameLocator('iframe');await app.locator('#newFileButton').click();await app.locator('#hideLivePreviewButton').click();if(process.env.AUDIT_THEME==='dark')await app.locator('#colorModeButton').click();
 const editor=app.locator('#markdownEditor > .cm-editor'),content=editor.locator('> .cm-scroller > .cm-content'),card=editor.locator('.cm-diagram-card');
 const read=()=>editor.evaluate(async el=>{const{EditorView}=await import('/node_modules/@codemirror/view/dist/index.js');return EditorView.findFromDOM(el).state.doc.toString();});
 const shot=async name=>{if(process.env.AUDIT_OUTPUT)await page.screenshot({path:`${process.env.AUDIT_OUTPUT}/${name}.png`});};
 const ready=()=>card.locator('svg').waitFor();
 const verify=async id=>{
  const info=await card.evaluate(el=>{
   const nodes=[...el.querySelectorAll('.c4-shape')].map(n=>{let shape=n.querySelector('.label-container,.basic');if(shape?.tagName==='g')shape=shape.querySelector('rect,path,circle,ellipse');const text=n.querySelector('.label text');return{auto:n.classList.contains('c4-auto-color'),text:n.textContent,fill:shape&&getComputedStyle(shape).fill,color:text&&getComputedStyle(text).fill,html:!shape?n.outerHTML.slice(0,1200):undefined};});
   const boundaries=[...el.querySelectorAll('[data-c4-boundary]')].map(g=>({auto:g.dataset.c4BorderAuto,stroke:getComputedStyle(g.querySelector('rect')).stroke,text:getComputedStyle(g.querySelector('text')).fill}));
   const svg=el.querySelector('svg');
   const relations=[...el.querySelectorAll('[data-c4-relation]')].map(g=>{
    const edge=g.querySelector(':scope > line,:scope > path');
    const arrows=['marker-start','marker-end'].flatMap(attribute=>{
     const ref=edge.getAttribute(attribute);if(!ref||ref==='none')return[];
     const id=ref.match(/#([^"')]+)["']?\)$/)?.[1];
     const marker=[...svg.querySelectorAll('marker')].find(m=>m.id===id),path=marker?.querySelector('path');
     const originalId=marker?.getAttribute('data-c4-original-marker');
     const original=originalId?[...svg.querySelectorAll('marker')].find(m=>m.id===originalId):marker;
     const geometry=m=>m&&JSON.stringify({attrs:['orient','refX','refY','viewBox','markerWidth','markerHeight','markerUnits'].map(a=>m.getAttribute(a)),paths:[...m.querySelectorAll('path')].map(p=>p.getAttribute('d'))});
     return[{attribute,id,fill:path&&getComputedStyle(path).fill,stroke:path&&getComputedStyle(path).stroke,orient:marker?.getAttribute('orient'),d:path?.getAttribute('d'),geometryPreserved:!!original&&geometry(original)===geometry(marker)}];
    });
    const start=edge.getPointAtLength(0),end=edge.getPointAtLength(edge.getTotalLength());
    const owner=[...svg.querySelectorAll('.c4-shape')].find(n=>n.id===`${svg.id}-${g.dataset.c4From}`),body=owner?.querySelector('.basic > rect');let selfBoundary=false;
    if(body&&g.dataset.c4From===g.dataset.c4To){const b=body.getBBox(),m=g.getScreenCTM().inverse().multiply(body.getScreenCTM()),x=m.a*(b.x+b.width)+m.c*(b.y+b.height/2)+m.e,y=m.b*(b.x+b.width)+m.d*(b.y+b.height/2)+m.f;selfBoundary=Math.hypot(start.x-x,start.y-y)<0.1&&Math.hypot(end.x-x,end.y-y)<0.1;}
    return{line:getComputedStyle(edge).stroke,text:getComputedStyle(g.querySelector('text')).fill,mask:!!g.querySelector('[data-c4-label-background]'),arrows,routed:g.hasAttribute('data-c4-routed'),adjusted:g.dataset.c4PortAdjusted,selfBoundary,length:edge.getTotalLength(),portsPreserved:Math.hypot(start.x-Number(g.dataset.c4StartX),start.y-Number(g.dataset.c4StartY))<0.1&&Math.hypot(end.x-Number(g.dataset.c4EndX),end.y-Number(g.dataset.c4EndY))<0.1};
   });
   const nodeBounds=[...svg.querySelectorAll('.c4-shape')].map(n=>({name:n.textContent,rect:n.getBoundingClientRect()}));
   // A person's bounding rectangle contains empty shoulder space. Inspect the
   // actual SVG fills, not empty corners, with an interior tolerance of 1 px.
   const nodeFills=[...svg.querySelectorAll('.c4-shape')].flatMap(n=>[...n.querySelectorAll('.basic:not(g),.basic > rect,.basic > circle,.basic > path')].map(p=>({name:n.textContent,shape:p,m:p.getScreenCTM().inverse()})));
   const blockedLabels=[...svg.querySelectorAll('[data-c4-relation] > text')].flatMap(t=>{
    const a=t.getBoundingClientRect();return nodeBounds.filter(({rect:b})=>Math.min(a.right,b.right)-Math.max(a.left,b.left)>1&&Math.min(a.bottom,b.bottom)-Math.max(a.top,b.top)>1).map(n=>({label:t.textContent,node:n.name}));
   });
   const blockedPaths=[...svg.querySelectorAll('[data-c4-relation] > path,[data-c4-relation] > line')].flatMap(edge=>{
    const length=edge.getTotalLength(),count=Math.max(1,Math.min(10000,Math.ceil(length/3))),m=edge.getScreenCTM(),hits=new Set();
    for(let i=0;i<=count;i++){const p=edge.getPointAtLength(length*i/count),x=m.a*p.x+m.c*p.y+m.e,y=m.b*p.x+m.d*p.y+m.f;for(const node of nodeFills){const inv=node.m;if([[0,0],[-1,0],[1,0],[0,-1],[0,1]].every(([dx,dy])=>{const q=svg.createSVGPoint();q.x=inv.a*(x+dx)+inv.c*(y+dy)+inv.e;q.y=inv.b*(x+dx)+inv.d*(y+dy)+inv.f;return node.shape.isPointInFill(q);}))hits.add(node.name);}}
    return[...hits].map(node=>({label:edge.parentElement.querySelector('text')?.textContent,node}));
   });
   const labelElements=[...svg.querySelectorAll('[data-c4-relation] > text')],overlappingLabels=[];
   for(let i=0;i<labelElements.length;i++)for(let j=i+1;j<labelElements.length;j++){
    const a=labelElements[i].getBoundingClientRect(),b=labelElements[j].getBoundingClientRect();
    if(Math.min(a.right,b.right)-Math.max(a.left,b.left)>1&&Math.min(a.bottom,b.bottom)-Math.max(a.top,b.top)>1)overlappingLabels.push([labelElements[i].textContent,labelElements[j].textContent]);
   }
   const crossedCaptions=[...svg.querySelectorAll('[data-c4-relation] > path,[data-c4-relation] > line')].flatMap(edge=>{
    const length=edge.getTotalLength(),count=Math.max(1,Math.min(10000,Math.ceil(length/3))),m=edge.getScreenCTM(),hits=new Set();
    const others=labelElements.filter(t=>t.parentElement!==edge.parentElement).map(t=>({text:t.textContent,b:t.getBoundingClientRect()}));
    for(let i=0;i<=count;i++){const p=edge.getPointAtLength(length*i/count),x=m.a*p.x+m.c*p.y+m.e,y=m.b*p.x+m.d*p.y+m.f;for(const {text,b}of others)if(x>b.left+1&&x<b.right-1&&y>b.top+1&&y<b.bottom-1)hits.add(text);}
    return [...hits].map(label=>({edge:edge.parentElement.querySelector('text')?.textContent,label}));
   });
   return{nodes,boundaries,relations,blockedLabels,blockedPaths,overlappingLabels,crossedCaptions};
  });console.log(JSON.stringify({id,...info}));
  if(process.env.AUDIT_GEOMETRY)console.log('GEOMETRY',JSON.stringify(await card.evaluate(el=>{const group=el.querySelector('[data-c4-relation]');return{nodes:[...el.querySelectorAll('.c4-shape')].map(n=>({name:n.textContent,parts:[...n.querySelectorAll('.basic:not(g),.basic > rect,.basic > circle')].map(p=>{const b=p.getBBox(),m=group.getScreenCTM().inverse().multiply(p.getScreenCTM());return{tag:p.tagName,x:m.a*b.x+m.c*b.y+m.e,y:m.b*b.x+m.d*b.y+m.f,width:b.width,height:b.height};})})),edges:[...el.querySelectorAll('[data-c4-relation]')].map(g=>({attrs:[...g.attributes].map(a=>[a.name,a.value])}))};})));
  for(const node of info.nodes){assert.ok(node.fill&&node.color);if(node.auto)assert.ok(diagramContrastRatio(opaqueDiagramRGB(node.fill),opaqueDiagramRGB(node.color))>=4.5,'automatic node foreground contrast >= 4.5');}
  if(process.env.AUDIT_OBSTACLES){assert.deepEqual(info.blockedLabels,[],'relationship labels must not cover node text');assert.deepEqual(info.blockedPaths,[],'connections must not cross node interiors');assert.deepEqual(info.overlappingLabels,[],'relationship captions must not overlap');for(const r of info.relations){assert.ok(r.length>10,'visible relationship path');assert.ok(r.portsPreserved||id.startsWith('complex-person-')&&r.adjusted==='person-self-boundary'&&r.selfBoundary,'original ports retained except invalid person self-port corrected to actual body boundary');}}
  for(const rel of info.relations)assert.ok(rel.mask,'all C4 relationships have caption background');
  if(id.startsWith('routing-parallel')||id.startsWith('complex-'))assert.deepEqual(info.crossedCaptions,[],'connections must not run through another caption');
  for(const rel of info.relations)for(const arrow of rel.arrows){assert.ok(arrow.d,'marker resolves within this SVG');assert.ok(arrow.geometryPreserved,'arrow geometry and orientation are unchanged');assert.equal(arrow.fill,rel.line,'arrow fill follows its own connector');assert.equal(arrow.stroke,rel.line,'arrow stroke follows its own connector');}
  if(id==='mixed-arrows'){
   assert.equal(info.relations.length,4);
   assert.deepEqual(info.relations.map(r=>r.arrows.map(a=>a.attribute)),[['marker-end'],['marker-start'],['marker-start','marker-end'],['marker-end']]);
   assert.notEqual(info.relations[0].arrows[0].id,info.relations[2].arrows[1].id,'different colors do not share mutable markers');
  }
  for(const boundary of info.boundaries)if(boundary.auto==='true')assert.notEqual(boundary.stroke,'rgb(68, 68, 68)','default boundary follows theme');
  if(id==='explicit-white')assert.equal(info.nodes[0].color,'rgb(255, 255, 255)');
  if(id==='complex-person-colors'){assert.equal(info.nodes[0].color,'rgb(0, 0, 0)');assert.equal(info.nodes[1].color,'rgb(187, 85, 136)');}
  if(id==='explicit-black'){assert.equal(info.nodes[0].color,'rgb(0, 0, 0)');assert.equal(info.boundaries[0].stroke,'rgb(68, 68, 68)');assert.equal(info.boundaries[0].text,'rgb(0, 0, 0)');assert.equal(info.relations[0].line,'rgb(68, 68, 68)');assert.equal(info.relations[0].text,'rgb(0, 0, 0)');}
  if(id==='custom-colors'){assert.equal(info.nodes[0].color,'rgb(187, 85, 136)');assert.equal(info.boundaries[0].stroke,'rgb(187, 85, 136)');assert.equal(info.relations[0].line,'rgb(187, 85, 136)');}
 };
 for(const[id,code]of selected){
  console.log('START',id);const doc='```mermaid\n'+code+'\n```\n\nAFTER';await app.locator('[data-editor-presentation="source"]').click();await content.focus();await page.keyboard.press('Control+a');await page.keyboard.insertText(doc);await page.keyboard.press('Control+End');await app.locator('[data-editor-presentation="live"]').click();await ready();await shot(id+'-01-rendered');await verify(id);assert.equal(await read(),doc);
  await card.hover();await card.locator('[data-diagram-action="source"]').click();await editor.getByRole('button',{name:'返回渲染',exact:true}).click();await ready();await verify(id);assert.equal(await read(),doc);
  await card.focus();await page.keyboard.press('Enter');await app.locator('#diagramDialog').waitFor({state:'visible'});const field=app.locator('#diagramSource');assert.equal((await field.inputValue()).trim(),code.trim());const changed=code.replace('Parses','Parses edited').replace('Edits','Edits edited');await field.fill(changed);await app.locator('#insertDiagram').click();await app.locator('#diagramDialog').waitFor({state:'hidden'});await ready();assert.equal(await read(),doc.replace(code,changed));await verify(id);
  await content.focus();await page.keyboard.press('Control+z');assert.equal(await read(),doc);await page.keyboard.press('Control+y');assert.equal(await read(),doc.replace(code,changed));await ready();
  for(let n=0;n<2;n++){const before=await card.locator('svg').getAttribute('id');await app.locator('#colorModeButton').click();for(let i=0;i<100;i++){if(await card.locator('svg').count()&&await card.locator('svg').getAttribute('id')!==before)break;await page.waitForTimeout(50);}await ready();assert.notEqual(await card.locator('svg').getAttribute('id'),before);await verify(id);assert.equal(await read(),doc.replace(code,changed));}await shot(id+'-02-restored');console.log('PASS',id);
  if((id==='custom-colors'||process.env.AUDIT_OBSTACLES)&&process.env.AUDIT_OUTPUT){
   const png=await card.locator('svg').evaluate(async svg=>{const{svgToPNGDataURL}=await import('/src/mermaid-diagrams.js');return svgToPNGDataURL(svg,'C4 arrow export');});
   assert.ok(png.startsWith('data:image/png;base64,'));
   await writeFile(`${process.env.AUDIT_OUTPUT}/${id}-03-export.png`,Buffer.from(png.split(',')[1],'base64'));
   assert.equal(await read(),doc.replace(code,changed),'image conversion does not edit the document');
  }
 }assert.deepEqual(errors,[]);console.log(JSON.stringify({PASS:selected.length,pageErrors:errors}));
}catch(e){if(page&&process.env.AUDIT_OUTPUT)await page.screenshot({path:`${process.env.AUDIT_OUTPUT}/failure.png`});throw e;}finally{await browser?.close();await server.close();}
