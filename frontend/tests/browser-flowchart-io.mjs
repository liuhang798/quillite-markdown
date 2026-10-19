import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import {createServer} from 'vite';
import {DIAGRAM_TEMPLATES} from '../src/diagram-templates.js';
const {chromium}=createRequire(import.meta.url)(process.env.PLAYWRIGHT_MODULE||'playwright');
const server=await createServer({root:fileURLToPath(new URL('..',import.meta.url)),server:{host:'127.0.0.1',port:0,watch:null,hmr:false},logLevel:'error'});
let browser;
try {
 await server.listen();browser=await chromium.launch({headless:true,executablePath:process.env.BROWSER_EXECUTABLE||undefined});
 for(const theme of ['light','dark']) {
  const page=await browser.newPage({viewport:{width:1500,height:1000}});page.setDefaultTimeout(15000);const errors=[];
  page.on('pageerror',e=>errors.push(e.message));await page.route('**/*',r=>new URL(r.request().url()).hostname==='127.0.0.1'?r.continue():r.abort());
  await page.goto(server.resolvedUrls.local[0]);await page.locator('body').evaluate(()=>import('/src/main.js'));
  await page.locator('#newFileButton').click();if(theme==='dark')await page.locator('#colorModeButton').click();
  const editor=page.locator('#markdownEditor > .cm-editor'),nodes=page.locator('#flowchartNodeLayer [data-flowchart-node]'),edges=page.locator('#flowchartEdgeLayer [data-flowchart-edge]'),source=page.locator('#diagramSource');
  const read=()=>editor.evaluate(async el=>{const {EditorView}=await import('/node_modules/@codemirror/view/dist/index.js');return EditorView.findFromDOM(el).state.doc.toString();});
  const select=async node=>{await node.focus();await node.press('F2');};
  const entry=page.locator('[data-format="diagram-builder"]');
  if(await entry.isVisible())await entry.click();else{await page.locator('#moreFormatButton').click();await page.locator('#moreFormatMenu [data-format-command="diagram-builder"]').click();}
  await page.locator('#diagramSearch').fill('流程图');await page.locator('[data-diagram-template="flowchart"]').click();
  await page.locator('#flowchartSourceMode').click();await source.fill(DIAGRAM_TEMPLATES[0].examples[0].source.zh);await page.locator('#flowchartVisualMode').click();
  assert.equal(await nodes.count(),5);assert.equal(await edges.count(),4);
  assert.equal(await nodes.locator('polygon.flowchart-node-shape').count(),2);
  await page.locator('[data-flowchart-add="input-output"]').click();assert.equal(await page.locator('#flowchartNodeLabel').inputValue(),'输入／输出');
  await page.locator('#flowchartNodeLabel').fill('非常长的输入输出说明用于测试文字换行不超出平行四边形的斜边范围以及省略显示');
  const long=nodes.last();assert.equal(await long.locator('text tspan').count(),3);assert.match(await long.locator('text').textContent(),/…$/);
  assert.equal(await long.evaluate(el=>{const s=el.querySelector('polygon').getBBox(),t=el.querySelector('text').getBBox(),cx=s.x+s.width/2,cy=s.y+s.height/2;return [t.x,t.x+t.width].every(x=>[t.y,t.y+t.height].every(y=>Math.abs(x-cx+24*(y-cy)/s.height)<=(s.width-24)/2+1&&Math.abs(y-cy)<=s.height/2));}),true);
  await page.locator('#flowchartDeleteSelection').click();assert.equal(await nodes.count(),5);
  await select(nodes.filter({hasText:'计算 sum'}));await page.locator('#flowchartNodeShape').selectOption('input-output');
  assert.ok((await source.inputValue()).includes('C[/计算 sum = a + b/]'));assert.equal(await edges.count(),4);
  await page.locator('#flowchartNodeShape').selectOption('process');
  for(const direction of ['LR','RL','BT','TD'])await page.locator('#flowchartDirection').selectOption(direction);
  if(process.env.AUDIT_OUTPUT)await page.screenshot({path:process.env.AUDIT_OUTPUT+'/io-canvas-'+theme+'.png'});
  const saved=await source.inputValue();await page.locator('#insertDiagram').click();await page.locator('#diagramDialog').waitFor({state:'hidden'});
  assert.equal((await read()).trim(),'```mermaid\n'+saved+'\n```');
  const card=editor.locator('.cm-diagram-card');await card.locator('svg').first().waitFor();
  await page.locator('#editorPreviewContent svg').first().waitFor();assert.doesNotMatch(await card.getAttribute('class'),/is-error/);
  assert.ok(await card.locator('svg polygon').count()>=2);
  await card.focus();await card.press('Enter');await page.locator('#diagramDialog').waitFor({state:'visible'});
  if(await source.isVisible())await page.locator('#flowchartVisualMode').click();
  assert.equal(await nodes.locator('polygon.flowchart-node-shape').count(),2);assert.equal(await edges.count(),4);
  await page.locator('#cancelDiagram').click();
  // Exercise the real export preparation, capturing only its backend boundary.
  await page.evaluate(()=>{window.quilliteMarkdown.exportHTML=async(...args)=>{window.__ioExport=args[2];return '';};});
  await page.locator('#moreButton').click();await page.locator('[data-action="export-center"]').click();
  await page.locator('[data-export-format="html"]').click();
  await page.locator('#confirmExportCenter').click();
  await page.waitForFunction(()=>typeof window.__ioExport==='string');
  const output=await page.evaluate(()=>window.__ioExport);assert.match(output,/<svg|data:image\/(?:svg\+xml|png)/);
  assert.deepEqual(errors,[]);console.log('PASS '+theme+': add, convert, long text bounds, directions, rendered preview, reopen, export preparation');
  await page.close();
 }
} finally {await browser?.close();await server.close();}
