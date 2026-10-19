// UI-only edits of synthetic documents; CodeMirror access is read-only assertion data.
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import {createServer} from 'vite';
import {DIAGRAM_TEMPLATES} from '../src/diagram-templates.js';
const {chromium}=createRequire(import.meta.url)(process.env.PLAYWRIGHT_MODULE||'playwright');
const server=await createServer({root:fileURLToPath(new URL('..',import.meta.url)),server:{host:'127.0.0.1',port:0,watch:null,hmr:false},logLevel:'error'});
const replacements={flowchart:['收到需求','收到审计需求'],sequence:['选择 Markdown 文档','选择审计文档'],gantt:['需求分析','审计需求分析'],state:['打开文档','打开审计文档'],journey:['选择文件','选择审计文件'],timeline:['Markdown 阅读','Markdown 审计阅读'],kanban:['撰写功能需求','撰写审计需求'],class:['renderPreview','renderAuditPreview'],er:['string title','string audit_title'],requirement:['Preview_updates_within_300_ms','Preview_updates_within_250_ms'],gitgraph:['开发图表功能','开发审计图表'],block:['解析器','审计解析器'],packet:['源端口','审计端口'],architecture:['[Editor]','[AuditEditor]'],c4:['官方网站','审计网站'],pie:['45','48'],quadrant:['0.92','0.82'],xy:['45, 62','48, 62'],sankey:['Parser,Preview,70','Parser,Preview,73'],radar:['95, 90','92, 90'],treemap:['35','38'],mindmap:['实时预览','审计预览']};
const visualFields={sequence:'label',gantt:'task',timeline:'event',kanban:'task',class:'name',er:'name',pie:'value',sankey:'value'};
let browser,page;
try{
 await server.listen();browser=await chromium.launch({headless:true,executablePath:process.env.BROWSER_EXECUTABLE||undefined});
 page=await browser.newPage({viewport:{width:1600,height:1000}});page.setDefaultTimeout(20000);
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.route('**/*',r=>new URL(r.request().url()).hostname==='127.0.0.1'?r.continue():r.abort());
 await page.goto(server.resolvedUrls.local[0]+'tests/fixtures/app-drag-audit.html');const frame=page.frames().find(f=>f.parentFrame());await frame.evaluate(async()=>{await import('/src/main.js');});const app=page.frameLocator('iframe');
 await app.locator('#newFileButton').click();await app.locator('#hideLivePreviewButton').click();
 if(process.env.AUDIT_THEME==='dark')await app.locator('#colorModeButton').click();
 const editor=app.locator('#markdownEditor > .cm-editor'),card=()=>editor.locator('.cm-diagram-card').first(),source=app.locator('#diagramSource');
 const read=()=>editor.evaluate(async el=>{const{EditorView}=await import('/node_modules/@codemirror/view/dist/index.js');return EditorView.findFromDOM(el).state.doc.toString();});
 const shot=async name=>{if(process.env.AUDIT_OUTPUT){await page.waitForTimeout(400);await page.screenshot({path:`${process.env.AUDIT_OUTPUT}/${name}.png`});}};
 const showSource=async()=>{if(!await source.isVisible())await app.locator('#flowchartSourceMode').click();await source.waitFor({state:'visible'});};
 const save=async()=>{await app.locator('#insertDiagram').click();await app.locator('#diagramDialog').waitFor({state:'hidden'});await card().locator('svg').first().waitFor();assert.doesNotMatch(await card().getAttribute('class'),/is-error/);};
 const reopen=async()=>{await card().focus();await page.keyboard.press('Enter');await app.locator('#diagramDialog').waitFor({state:'visible'});};
 const history=async key=>{await editor.locator('> .cm-scroller > .cm-content').focus();await page.keyboard.press(key);await page.waitForTimeout(250);};
 const visible=async label=>{await page.waitForTimeout(250);const r=await card().evaluate(el=>{const b=el.getBoundingClientRect(),p=el.closest('.cm-scroller').getBoundingClientRect();return{top:b.top,bottom:b.bottom,portTop:p.top,portBottom:p.bottom};});assert.ok(Math.min(r.bottom,r.portBottom)-Math.max(r.top,r.portTop)>=Math.min(r.bottom-r.top,r.portBottom-r.portTop)*.9,label+' '+JSON.stringify(r));};
 const all=DIAGRAM_TEMPLATES.filter(t=>t.engine!=='echarts');const templates=process.env.AUDIT_CASE?all.filter(t=>t.id===process.env.AUDIT_CASE):all;
 let visualCount=0;
 for(const t of templates){
  console.log('START',t.id);
  await app.locator('[data-format="diagram-builder"]').click();await app.locator('[data-diagram-category="all"]').click();await app.locator('#diagramSearch').fill(t.name.zh);await app.locator(`[data-diagram-template="${t.id}"]`).click();await showSource();
  const original=await source.inputValue();await shot('01-source-'+t.id);await save();const inserted=await read();assert.equal(inserted.trim(),'```mermaid\n'+original.trim()+'\n```');
  await reopen();assert.equal(await source.inputValue(),original);await save();await history('Control+z');assert.equal(await read(),'');await history('Control+y');assert.equal(await read(),inserted);
  await reopen();await showSource();await source.fill('invalid-mermaid-audit');await app.locator('#insertDiagram').click();assert.equal(await app.locator('#diagramDialog').isVisible(),true);assert.equal(await read(),inserted);
  if(t.id==='flowchart')await shot('02-invalid');
  const [before,after]=replacements[t.id];assert.ok(original.includes(before),t.id+' mutation target');const changed=original.replace(before,after);await source.fill(changed);await save();const edited=await read();assert.equal(edited.trim(),'```mermaid\n'+changed.trim()+'\n```');
  await reopen();assert.equal(await source.inputValue(),changed);await showSource();await source.fill('invalid-cancelled');await app.locator('#cancelDiagram').click();assert.equal(await read(),edited);
  await card().hover();await card().locator('[data-diagram-action="source"]').click();await editor.locator('.cm-live-source-panel button').click();await card().locator('svg').first().waitFor();await visible(t.id+' source return');assert.equal(await read(),edited);
  await page.keyboard.press('Enter');await app.locator('#diagramDialog').waitFor({state:'visible'});assert.equal(await source.inputValue(),changed);await app.locator('#cancelDiagram').click();
  await history('Control+z');assert.equal(await read(),inserted);await history('Control+y');assert.equal(await read(),edited);await visible(t.id+' redo');await shot('03-returned-'+t.id);
  if(t.visualEditor){
   visualCount++;await reopen();if(await source.isVisible())await app.locator('#flowchartVisualMode').click();
   let field,oldValue,value;
   if(t.visualEditor==='canvas'){
    const node=app.locator('#flowchartNodeLayer [data-flowchart-node]:not(.state-terminal-node)').first();await node.click();field=app.locator('#flowchartNodeLabel');oldValue=await field.inputValue();value='审计节点';
   }else{
    field=app.locator(`#structuredDiagramRows input[data-field="${visualFields[t.id]}"]:not(:disabled)`).first();oldValue=await field.inputValue();value=await field.getAttribute('type')==='number'?String(Number(oldValue)+7):['class','er'].includes(t.id)?'audit_member':'审计字段';
   }
   await field.fill(value);const visualSource=await source.inputValue();assert.notEqual(visualSource,changed);assert.ok(visualSource.includes(value),t.id+' visual value serialized');await shot('04-visual-'+t.id);await save();const visualDoc=await read();
   assert.equal(visualDoc.trim(),'```mermaid\n'+visualSource.trim()+'\n```');await reopen();assert.equal(await source.inputValue(),visualSource);
   if(await source.isVisible())await app.locator('#flowchartVisualMode').click();
   if(t.visualEditor==='canvas')await app.locator('#flowchartNodeLayer [data-flowchart-node]:not(.state-terminal-node)').first().click();
   assert.equal(await field.inputValue(),value,t.id+' reopened visual value');await field.fill(oldValue);await app.locator('#cancelDiagram').click();assert.equal(await read(),visualDoc);
   await history('Control+z');assert.equal(await read(),edited);await history('Control+y');assert.equal(await read(),visualDoc);await visible(t.id+' visual redo');
  }
  const finalDoc=await read();await app.locator('[data-editor-presentation="source"]').click();assert.equal(await read(),finalDoc);await app.locator('[data-editor-presentation="live"]').click();await card().waitFor();
  const discard=d=>d.accept();page.on('dialog',discard);try{await app.locator('#newFileButton').click();}finally{page.off('dialog',discard);}assert.equal(await read(),'');await history('Control+y');assert.equal(await read(),'');
  console.log(JSON.stringify({id:t.id,sourceEdit:true,invalidRejected:true,noOp:true,cancel:true,sourceReturn:true,history:true,visual:!!t.visualEditor}));
 }
 assert.deepEqual(errors,[]);console.log(JSON.stringify({PASS:templates.length,visualCount,pageErrors:errors}));
}catch(e){if(page&&process.env.AUDIT_OUTPUT)await page.screenshot({path:`${process.env.AUDIT_OUTPUT}/failure.png`});throw e;}
finally{await browser?.close();await server.close();}
