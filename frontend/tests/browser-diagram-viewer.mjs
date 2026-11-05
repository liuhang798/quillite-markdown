import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import {createServer} from 'vite';
const {chromium}=createRequire(import.meta.url)(process.env.PLAYWRIGHT_MODULE||'playwright');
const server=await createServer({root:fileURLToPath(new URL('..',import.meta.url)),server:{host:'127.0.0.1',port:41867,strictPort:true,watch:null,hmr:false},logLevel:'error',plugins:[{
 name:'viewer-audit',enforce:'pre',transform(code,id){if(id.replaceAll('\\','/').endsWith('/src/renderer.js'))return code+'\nwindow.viewerAudit={state,toggleEditor,setEditorLayout,setLanguage,exportHTML:renderedHTMLForExport,get editor(){return codeEditor}};';}
}]});
let browser,page;
try{
 await server.listen();browser=await chromium.launch({headless:true,executablePath:process.env.BROWSER_EXECUTABLE});
 page=await browser.newPage({viewport:{width:1450,height:950}});page.setDefaultTimeout(20000);
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.route('**/*',r=>new URL(r.request().url()).hostname==='127.0.0.1'?r.continue():r.abort());
 await page.goto(server.resolvedUrls.local[0]);await page.waitForFunction(()=>window.viewerAudit);
 const chart={xAxis:{type:'category',data:['A','B','C']},yAxis:{type:'value'},series:[{type:'bar',data:[15,30,23]}]};
 const source='# 图表缩放测试\n\n```mermaid\nflowchart LR\n'+Array.from({length:16},(_,i)=>`A${i}["步骤 ${i}"] --> A${i+1}["步骤 ${i+1}"]`).join('\n')+'\n```\n\n```echarts\n'+JSON.stringify(chart)+'\n```\n\n正文保持不变';
 await page.evaluate(source=>{window.quilliteMarkdown.openFile=async()=>({path:'viewer.md',name:'viewer.md',directory:'.',content:source,revision:'a'.repeat(64)});},source);
 await page.locator('#openFileButton').click();
 const mermaid=page.locator('#markdownContent .mermaid-diagram'),echarts=page.locator('#markdownContent .echarts-diagram');
 await mermaid.locator('.diagram-view-button').waitFor();await echarts.locator('.diagram-view-button').waitFor();
 const original=await mermaid.locator('svg').evaluate(el=>el.outerHTML);
 await mermaid.locator('svg').click({position:{x:15,y:15}});
 const dialog=page.locator('#diagramViewer');await dialog.waitFor();
 await page.waitForFunction(()=>{const i=document.querySelector('.diagram-viewer-image');return i.complete&&i.naturalWidth>0;});
 const scale=()=>dialog.locator('output').textContent();
 const fitted=await scale();assert.ok(parseFloat(fitted)<100);
 await dialog.getByRole('button',{name:'原始大小',exact:true}).click();assert.equal(await scale(),'100%');
 const stage=dialog.locator('.diagram-viewer-stage'),image=dialog.locator('img');
 const before=await image.evaluate(el=>el.style.transform),box=await stage.boundingBox();
 await page.mouse.move(box.x+box.width/2,box.y+box.height/2);await page.mouse.down();await page.mouse.move(box.x+box.width/2+130,box.y+box.height/2+40,{steps:6});await page.mouse.up();
 assert.notEqual(await image.evaluate(el=>el.style.transform),before);
 await page.mouse.wheel(0,-100);assert.ok(parseFloat(await scale())>100);
 await dialog.getByRole('button',{name:'适应窗口',exact:true}).click();assert.equal(await scale(),fitted);
 await page.keyboard.press('+');assert.ok(parseFloat(await scale())>parseFloat(fitted));
 if(process.env.AUDIT_OUTPUT)await page.screenshot({path:process.env.AUDIT_OUTPUT+'/diagram-viewer.png'});
 await page.keyboard.press('Escape');await dialog.waitFor({state:'hidden'});
 assert.equal(await mermaid.locator('svg').evaluate(el=>el.outerHTML),original);
 assert.equal(await page.evaluate(()=>window.viewerAudit.state.currentFile.content),source);
 await echarts.locator('.diagram-view-button').click();await dialog.waitFor();
 await page.waitForFunction(()=>{const i=document.querySelector('.diagram-viewer-image');return i.complete&&i.naturalWidth>0;});
 await dialog.getByRole('button',{name:'放大',exact:true}).click();
 await page.setViewportSize({width:520,height:740});await page.waitForTimeout(100);
 assert.ok((await dialog.boundingBox()).width<=520);
 for(const button of await dialog.locator('button').all()){const r=await button.boundingBox();assert.ok(r.x>=0&&r.x+r.width<=520);}
 await dialog.getByRole('button',{name:'适应窗口',exact:true}).click();
 if(process.env.AUDIT_OUTPUT)await page.screenshot({path:process.env.AUDIT_OUTPUT+'/viewer-narrow.png'});
 await dialog.getByRole('button',{name:'关闭',exact:true}).click();await page.setViewportSize({width:1450,height:950});
 assert.equal(await image.getAttribute('src'),null,'close releases the snapshot');
 await page.locator('#colorModeButton').click();
 await echarts.locator('.diagram-view-button').click();await dialog.waitFor();
 await page.waitForFunction(()=>{const i=document.querySelector('.diagram-viewer-image');return i.complete&&i.naturalWidth>0;});
 if(process.env.AUDIT_OUTPUT)await page.screenshot({path:process.env.AUDIT_OUTPUT+'/viewer-dark.png'});
 // Removing the source (document replacement) closes the snapshot immediately.
 await echarts.evaluate(el=>el.remove());await dialog.waitFor({state:'hidden'});assert.equal(await image.getAttribute('src'),null);
 const exported=await page.evaluate(()=>window.viewerAudit.exportHTML());assert.ok(!exported.includes('diagram-view-button'));assert.ok(!exported.includes('diagram-viewer'));
 // Both editor projections use the same viewer without replacing the chart's
 // selection, editing actions or the source document.
 await page.evaluate(()=>window.viewerAudit.toggleEditor(true));
 const live=page.locator('#markdownEditor .cm-diagram-card .diagram-view-button').first();await live.waitFor();
 await live.click();await dialog.waitFor();await page.keyboard.press('Escape');
 assert.equal(await page.evaluate(()=>window.viewerAudit.editor.state.doc.toString()),source);
 assert.equal(await page.evaluate(()=>window.viewerAudit.state.dirty),false);
 await page.getByRole('button',{name:'源码',exact:true}).click();
 const split=page.locator('#editorPreviewContent .diagram-view-button').first();await split.waitFor();await split.click();await dialog.waitFor();
 await page.keyboard.press('Escape');
 await page.evaluate(()=>window.viewerAudit.setLanguage('en',true,false));
 await page.locator('#editorPreviewContent .diagram-view-button').first().click();
 await dialog.getByRole('button',{name:'Fit to window',exact:true}).waitFor();await dialog.getByRole('button',{name:'Close',exact:true}).click();
 assert.deepEqual(errors,[]);
 console.log('PASS Mermaid/ECharts images, wheel/buttons/keys, drag, fit/reset, source/export invariance, live/split editor and English');
}catch(error){if(page&&process.env.AUDIT_OUTPUT)await page.screenshot({path:process.env.AUDIT_OUTPUT+'/viewer-failure.png'});throw error;}
finally{await browser?.close();await server.close();}
