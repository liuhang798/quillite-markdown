import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import {createServer} from 'vite';
const {chromium}=createRequire(import.meta.url)(process.env.PLAYWRIGHT_MODULE||'playwright');
const nodes='Container(a, "Client", "JS", "Editor")\nContainer(b, "Server", "Go", "Storage")';
const cases=[
 ['repeated',`C4Dynamic\n${nodes}\nRel(a,b,"Request")\nRel(a,b,"Confirm")\nRel_Back(a,b,"Response")`,['1: Request','2: Confirm','3: Response']],
 ['reverse',`C4Dynamic\n${nodes}\nRel(a,b,"Request")\nRel(b,a,"Response")`,['1: Request','2: Response']],
 ['technology',`C4Dynamic\n${nodes}\nRel(a,b,"Read document","HTTPS")\nRel(a,b,"Write document","HTTPS")\nRel_Back(a,b,"Operation complete","JSON")`,['1: Read document','2: Write document','3: Operation complete']],
 ['nested',`%% audit prefix\nC4Dynamic\nSystem_Boundary(app,"Application") {\n${nodes}\n}\nRel(a,b,"Request")\nRel_Back(a,b,"Response")`,['1: Request','2: Response']],
 ['styled',`C4Dynamic\n${nodes}\nRel(a,b,"Request")\nRel_Back(a,b,"Response")\nUpdateRelStyle(a,b,"#bb5588","#bb5588")`,['1: Request','2: Response']],
 ['vertical',`C4Dynamic\n${nodes}\nRel(a,b,"Request","HTTPS")\nRel_Back(a,b,"Response","JSON")\nUpdateLayoutConfig("1","1")`,['1: Request','2: Response']],
 ['offset',`C4Dynamic\n${nodes}\nRel(a,b,"Request")\nRel_Back(a,b,"Response")\nUpdateRelStyle(a,b,"#bb5588","#bb5588","18","-6")`,['1: Request','2: Response']]
];
const server=await createServer({root:fileURLToPath(new URL('..',import.meta.url)),server:{host:'127.0.0.1',port:0,watch:null,hmr:false},logLevel:'error'});let browser,page;
const selected=process.env.AUDIT_BASELINE?cases.slice(0,1):process.env.AUDIT_CASE?cases.filter(([id])=>id===process.env.AUDIT_CASE):cases;
assert.ok(selected.length,'at least one selected case');
try{
 await server.listen();browser=await chromium.launch({headless:true,executablePath:process.env.BROWSER_EXECUTABLE||undefined});page=await browser.newPage({viewport:{width:1600,height:1000}});page.setDefaultTimeout(20000);const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto(server.resolvedUrls.local[0]+'tests/fixtures/app-drag-audit.html');const app=page.frameLocator('iframe');await app.locator('#newFileButton').click();await app.locator('#hideLivePreviewButton').click();if(process.env.AUDIT_THEME==='dark')await app.locator('#colorModeButton').click();
 const editor=app.locator('#markdownEditor > .cm-editor'),content=editor.locator('> .cm-scroller > .cm-content'),card=editor.locator('.cm-diagram-card');
 const read=()=>editor.evaluate(async el=>{const{EditorView}=await import('/node_modules/@codemirror/view/dist/index.js');return EditorView.findFromDOM(el).state.doc.toString();});
 const shot=async name=>{if(process.env.AUDIT_OUTPUT)await page.screenshot({path:`${process.env.AUDIT_OUTPUT}/${name}.png`});};
 const ready=()=>card.locator('svg').waitFor();
 const verify=async labels=>{
  assert.equal(await card.locator('.cm-diagram-label').textContent(),'C4 动态图');
  const masks=await card.locator('[data-c4-dynamic-from] > text').evaluateAll(texts=>texts.map(text=>{
   const rect=text.previousElementSibling,a=text.getBoundingClientRect(),b=rect?.getBoundingClientRect();
   return{mask:rect?.hasAttribute('data-c4-label-background'),covers:!!b&&b.left<=a.left&&b.top<=a.top&&b.right>=a.right&&b.bottom>=a.bottom,stroke:rect&&getComputedStyle(rect).stroke,fill:rect&&getComputedStyle(rect).fill,transform:rect?.getAttribute('transform')===text.getAttribute('transform')};
  }));
  for(const mask of masks){assert.ok(mask.mask&&mask.covers&&mask.transform,'caption background covers measured text');assert.equal(mask.stroke,'none');assert.notEqual(mask.fill,'none');}
  const nodeOverlaps=await card.evaluate(el=>{
   const nodes=[...el.querySelectorAll('.c4-shape')].map(n=>n.getBoundingClientRect());
   return [...el.querySelectorAll('[data-c4-label-background]')].some(mask=>{const a=mask.getBoundingClientRect();return nodes.some(b=>a.left<b.right-1&&a.right>b.left+1&&a.top<b.bottom-1&&a.bottom>b.top+1);});
  });assert.equal(nodeOverlaps,false,'caption masks do not cover nodes');
  const offsets=await card.locator('[data-c4-dynamic-from]').evaluateAll(groups=>groups.map(g=>({offset:Number(g.getAttribute('data-c4-offset-x')),text:g.querySelector('text')?.textContent})));
  if(offsets.some(g=>g.offset))assert.equal(offsets[0].offset,18,'explicit horizontal offset retained');
  const centers=await card.locator('[data-c4-dynamic-from]').evaluateAll(groups=>groups.flatMap(g=>{
   const path=g.querySelector(':scope > path,:scope > line'),middle=path.getPointAtLength(path.getTotalLength()/2),offset=Number(g.getAttribute('data-c4-offset-x'))||0;
   return [...g.querySelectorAll(':scope > text')].map(t=>{const b=t.getBBox(),m=t.transform.baseVal.consolidate()?.matrix;return{actual:m?m.a*(b.x+b.width/2)+m.c*(b.y+b.height/2)+m.e:b.x+b.width/2,expected:middle.x+offset};});
  }));for(const center of centers)assert.ok(Math.abs(center.actual-center.expected)<0.5,'visible caption centered on curve plus explicit offset');
  const data=await card.evaluate(el=>{const svg=el.querySelector('svg'),vb=svg.viewBox.baseVal,b=svg.getBBox();return{texts:[...svg.querySelectorAll('text')].map(t=>t.textContent),inside:b.x>=vb.x-2&&b.y>=vb.y-2&&b.x+b.width<=vb.x+vb.width+2&&b.y+b.height<=vb.y+vb.height+2,relations:[...svg.querySelectorAll('[data-c4-dynamic-from]')].map(g=>{const path=g.querySelector(':scope > path,:scope > line');const texts=[...g.querySelectorAll('text')].map(t=>{const r=t.getBoundingClientRect();return{text:t.textContent,x:r.x,y:r.y,right:r.right,bottom:r.bottom};});return{from:g.dataset.c4DynamicFrom,to:g.dataset.c4DynamicTo,d:path?.getAttribute('d'),start:path?.getAttribute('marker-start'),end:path?.getAttribute('marker-end'),texts};})};});
  console.log(JSON.stringify(data));for(const label of labels)assert.ok(data.texts.includes(label),'visible relation '+label);assert.equal(data.relations.length,labels.length);assert.ok(data.inside);assert.equal(new Set(data.relations.map(r=>r.d)).size,labels.length,'distinct paths');
  for(let i=0;i<data.relations.length;i++)for(let j=i+1;j<data.relations.length;j++)for(const a of data.relations[i].texts)for(const b of data.relations[j].texts)assert.ok(a.right<=b.x||b.right<=a.x||a.bottom<=b.y||b.bottom<=a.y,'relation labels do not overlap');
  const paints=await card.locator('[data-c4-dynamic-from] > path,[data-c4-dynamic-from] > line').evaluateAll(paths=>paths.map(p=>({specified:p.getAttribute('stroke'),computed:getComputedStyle(p).stroke})));
  for(const paint of paints){if(paint.specified==='#444444')assert.notEqual(paint.computed,'rgb(68, 68, 68)','default path follows theme');if(paint.specified==='#bb5588')assert.equal(paint.computed,'rgb(187, 85, 136)','explicit stroke preserved');}
  return data;
 };
 for(const[id,code,labels]of selected){
  console.log('START',id);const doc='```mermaid\n'+code+'\n```\n\nAFTER';await app.locator('[data-editor-presentation="source"]').click();await content.focus();await page.keyboard.press('Control+a');await page.keyboard.insertText(doc);await page.keyboard.press('Control+End');await app.locator('[data-editor-presentation="live"]').click();await ready();await shot(id+'-01-rendered');
  if(process.env.AUDIT_BASELINE){console.log(await card.locator('svg').textContent());continue;}
  const data=await verify(labels);assert.equal(await read(),doc);assert.ok(data.relations[0].end,'forward arrow');if(id!=='reverse')assert.ok(data.relations.at(-1).start,'back arrow');
  await card.hover();await card.locator('[data-diagram-action="source"]').click();await editor.getByRole('button',{name:'返回渲染',exact:true}).click();await ready();await verify(labels);assert.equal(await read(),doc);await shot(id+'-02-returned');
  await card.focus();await page.keyboard.press('Enter');await app.locator('#diagramDialog').waitFor({state:'visible'});const field=app.locator('#diagramSource');if(!await field.isVisible())await app.locator('#flowchartSourceMode').click();assert.equal((await field.inputValue()).trim(),code.trim());const changed=code.replace('Request','Request edited').replace('Read document','Read document edited');await field.fill(changed);await app.locator('#insertDiagram').click();await app.locator('#diagramDialog').waitFor({state:'hidden'});await ready();assert.equal(await read(),doc.replace(code,changed));const editedLabels=labels.map(t=>t.replace('Request','Request edited').replace('Read document','Read document edited'));await verify(editedLabels);await shot(id+'-03-edited');
  await content.focus();await page.keyboard.press('Control+z');assert.equal(await read(),doc);await ready();await verify(labels);await page.keyboard.press('Control+y');assert.equal(await read(),doc.replace(code,changed));await ready();await verify(editedLabels);
  for(let n=0;n<2;n++){const before=await card.locator('svg').getAttribute('id');await app.locator('#colorModeButton').click();for(let i=0;i<100;i++){if(await card.locator('svg').count()&&await card.locator('svg').getAttribute('id')!==before)break;await page.waitForTimeout(50);}await ready();assert.notEqual(await card.locator('svg').getAttribute('id'),before);await verify(editedLabels);assert.equal(await read(),doc.replace(code,changed));}await shot(id+'-04-theme-return');console.log('PASS',id);
 }
 assert.deepEqual(errors,[]);console.log(JSON.stringify({PASS:process.env.AUDIT_BASELINE?'baseline-only':selected.length,pageErrors:errors}));
}catch(e){if(page&&process.env.AUDIT_OUTPUT)await page.screenshot({path:`${process.env.AUDIT_OUTPUT}/failure.png`});throw e;}finally{await browser?.close();await server.close();}
