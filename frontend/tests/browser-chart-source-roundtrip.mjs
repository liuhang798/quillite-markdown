// Source editing via UI only; editor internals are read solely for assertions.
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import {createServer} from 'vite';
import {DIAGRAM_TEMPLATES} from '../src/diagram-templates.js';
const {chromium}=createRequire(import.meta.url)(process.env.PLAYWRIGHT_MODULE||'playwright');
const server=await createServer({root:fileURLToPath(new URL('..',import.meta.url)),server:{host:'127.0.0.1',port:0,watch:null,hmr:false},logLevel:'error'});
const custom=[
 {id:'dataset-encode',option:{title:{text:'Dataset'},dataset:{source:[['类别','数量'],['甲',12],['乙',20]]},xAxis:{type:'category'},yAxis:{},series:[{type:'bar',encode:{x:'类别',y:'数量'}}],dataZoom:[{type:'inside'}]}},
 {id:'object-data',option:{title:{text:'Object items'},xAxis:{type:'category',data:['甲','乙']},yAxis:{},series:[{type:'bar',data:[{value:12,itemStyle:{color:'#3579bd'}},{value:20,label:{show:true}}],markLine:{data:[{type:'average',name:'平均'}]}}]}},
 {id:'mixed-custom',option:{title:{text:'Mixed custom'},series:[{type:'pie',radius:['20%','35%'],data:[{name:'甲',value:3},{name:'乙',value:2}]},{type:'pie',radius:['45%','60%'],data:[{name:'丙',value:7},{name:'丁',value:4}]}]}},
 {id:'title-array',option:{title:[{text:'Primary',left:'center'},{text:'Secondary',left:'right',bottom:0}],xAxis:{type:'category',data:['甲','乙']},yAxis:{},series:[{type:'bar',data:[8,13]}]}}
];
let browser,page;
try{
 await server.listen();browser=await chromium.launch({headless:true,executablePath:process.env.BROWSER_EXECUTABLE||undefined});page=await browser.newPage({viewport:{width:1600,height:1000}});page.setDefaultTimeout(20000);
 const errors=[];page.on('pageerror',e=>errors.push(e.message));await page.route('**/*',r=>new URL(r.request().url()).hostname==='127.0.0.1'?r.continue():r.abort());await page.goto(server.resolvedUrls.local[0]+'tests/fixtures/app-drag-audit.html');const frame=page.frames().find(f=>f.parentFrame());await frame.evaluate(async()=>{await import('/src/main.js');});const app=page.frameLocator('iframe');
 await app.locator('#newFileButton').click();await app.locator('#hideLivePreviewButton').click();
 const editor=app.locator('#markdownEditor > .cm-editor'),card=()=>editor.locator('.cm-diagram-card').first();
 const read=()=>editor.evaluate(async el=>{const{EditorView}=await import('/node_modules/@codemirror/view/dist/index.js');return EditorView.findFromDOM(el).state.doc.toString();});
 const source=app.locator('#diagramSource');
 const shot=async name=>{if(process.env.AUDIT_OUTPUT){await page.waitForTimeout(400);await page.screenshot({path:`${process.env.AUDIT_OUTPUT}/${name}.png`});}};
 const showSource=async()=>{if(!await source.isVisible())await app.locator('#flowchartSourceMode').click();await source.waitFor({state:'visible'});};
 const save=async()=>{await app.locator('#insertDiagram').click();await app.locator('#diagramDialog').waitFor({state:'hidden'});await card().waitFor();assert.doesNotMatch(await card().getAttribute('class'),/is-error/);};
 const reopen=async()=>{await card().focus();await page.keyboard.press('Enter');await app.locator('#diagramDialog').waitFor({state:'visible'});};
 const history=async key=>{await editor.locator('> .cm-scroller > .cm-content').focus();await page.keyboard.press(key);await page.waitForTimeout(250);};
 const assertCardVisible=async label=>{
  await page.waitForTimeout(250);
  const bounds=await card().evaluate(el=>{const r=el.getBoundingClientRect(),p=el.closest('.cm-scroller').getBoundingClientRect();return{top:r.top,bottom:r.bottom,portTop:p.top,portBottom:p.bottom};});
  const visible=Math.max(0,Math.min(bounds.bottom,bounds.portBottom)-Math.max(bounds.top,bounds.portTop));
  assert.ok(visible>=Math.min(bounds.bottom-bounds.top,bounds.portBottom-bounds.portTop)*0.9,label+' visible chart '+JSON.stringify(bounds));
 };
 const catalog=DIAGRAM_TEMPLATES.filter(t=>t.engine==='echarts');const cases=[...catalog,...custom.map(t=>({...t,custom:true,name:{zh:'柱状图'}}))];
 const selected=process.env.AUDIT_CASE?cases.filter(t=>t.id===process.env.AUDIT_CASE):cases;
 for(const [index,t] of selected.entries()){
  await app.locator('[data-format="diagram-builder"]').click();await app.locator('[data-diagram-category="all"]').click();await app.locator('#diagramSearch').fill(t.name.zh);await app.locator(`[data-diagram-template="${t.custom?'bar-chart':t.id}"]`).click();await showSource();
  const base=t.custom?t.option:JSON.parse(await source.inputValue());base.toolbox={show:false,feature:{saveAsImage:{show:false}}};base.__quillite={...base.__quillite,auditNote:'preserve 中文 configuration'};
  const original=JSON.stringify(base,null,2);await source.fill(original);
  if(index===0)await shot('01-source');
  await save();const inserted=await read();assert.equal(inserted.trim(),'```echarts\n'+original+'\n```',t.id+' insertion exact');
  await reopen();assert.equal(await source.inputValue(),original,t.id+' reopen exact');
  if(t.custom){
   assert.equal(await source.isVisible(),true,t.id+' unsupported remains source');
   if(await app.locator('#flowchartVisualMode').isVisible()){await app.locator('#flowchartVisualMode').click();assert.equal(await source.isVisible(),true);assert.equal(await source.inputValue(),original);}
   await shot('custom-'+t.id);
  }
  await save();await history('Control+z');assert.equal(await read(),'');await history('Control+y');assert.equal(await read(),inserted);
  await reopen();await showSource();await source.fill('{invalid JSON');await app.locator('#insertDiagram').click();assert.equal(await app.locator('#diagramDialog').isVisible(),true);assert.equal(await read(),inserted,t.id+' invalid save unchanged');
  if(index===0)await shot('02-invalid-json');
  const editedOption=structuredClone(base);const title=Array.isArray(editedOption.title)?editedOption.title[0]:(editedOption.title??={});title.text='源码编辑审计 '+t.id;
  // Change actual plotted data as well as the title, retaining unrelated options.
  const data=editedOption.series[0].data;
  if(Array.isArray(data)){
   if(typeof data[0]==='number')data[0]+=3;
   else if(Array.isArray(data[0])){const point=data[0],i=point.findLastIndex(v=>typeof v==='number');assert.ok(i>=0,t.id+' numeric point');point[i]+=3;}
   else{assert.equal(typeof data[0].value,'number',t.id+' numeric object');data[0].value+=3;}
  }else{const row=editedOption.dataset.source[1];row[row.length-1]+=3;}
  const changed=JSON.stringify(editedOption,null,2);await source.fill(changed);await save();const edited=await read();assert.equal(edited.trim(),'```echarts\n'+changed+'\n```',t.id+' edited exact');
  await reopen();assert.equal(await source.inputValue(),changed);await showSource();await source.fill('{}');await app.locator('#cancelDiagram').click();assert.equal(await read(),edited,t.id+' cancel');
  await card().hover();await card().locator('[data-diagram-action="source"]').click();
  const returnButton=editor.locator('.cm-live-source-panel button');await returnButton.waitFor({state:'visible'});
  if(index===0||t.id==='heatmap-chart')await shot('03-inline-source-'+t.id);
  await returnButton.click();await card().waitFor();assert.doesNotMatch(await card().getAttribute('class'),/is-source-open/);assert.equal(await read(),edited);
  await assertCardVisible(t.id+' source return');
  if(index===0||t.id==='heatmap-chart')await shot('04-returned-'+t.id);
  await page.keyboard.press('Enter');await app.locator('#diagramDialog').waitFor({state:'visible'});assert.equal(await source.inputValue(),changed);await app.locator('#cancelDiagram').click();
  await app.locator('[data-editor-presentation="source"]').click();assert.equal(await read(),edited);await app.locator('[data-editor-presentation="live"]').click();await card().waitFor();
  await history('Control+z');assert.equal(await read(),inserted);await history('Control+y');assert.equal(await read(),edited);
  await assertCardVisible(t.id+' redo');
  if(index===0)await shot('05-restored');
  await history('Control+z');await history('Control+z');assert.equal(await read(),'');await app.locator('#newFileButton').click();await history('Control+y');assert.equal(await read(),'');
  console.log(JSON.stringify({id:t.id,exactSource:true,dataChanged:true,noOp:true,invalidRejected:true,cancel:true,sourceReturn:true,history:true,customFallback:!!t.custom}));
 }
 assert.deepEqual(errors,[]);console.log(JSON.stringify({PASS:selected.length,catalog:catalog.length,custom:custom.length,pageErrors:errors}));
}catch(e){if(page&&process.env.AUDIT_OUTPUT)await page.screenshot({path:`${process.env.AUDIT_OUTPUT}/failure.png`});throw e;}
finally{await browser?.close();await server.close();}
