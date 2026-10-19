// Real editor operations on a fresh synthetic document; no user profile.
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import {createServer} from 'vite';
import {DIAGRAM_TEMPLATES,diagramTemplateSource} from '../src/diagram-templates.js';
const {chromium}=createRequire(import.meta.url)(process.env.PLAYWRIGHT_MODULE||'playwright');
const server=await createServer({root:fileURLToPath(new URL('..',import.meta.url)),server:{host:'127.0.0.1',port:0,watch:null,hmr:false},logLevel:'error'});
const expected={flowchart:'flowchart',sequence:'sequence',gantt:'gantt',state:'statediagram',journey:'journey',timeline:'timeline',kanban:'kanban',class:'classdiagram',er:'erdiagram',requirement:'requirementdiagram',gitgraph:'gitgraph',block:'block',packet:'packet',architecture:'architecture',c4:'c4',pie:'pie',quadrant:'quadrantchart',xy:'xychart-beta',sankey:'sankey-beta',radar:'radar',treemap:'treemap-beta',mindmap:'mindmap'};
let browser,page;
try{
 await server.listen();browser=await chromium.launch({headless:true,executablePath:process.env.BROWSER_EXECUTABLE||undefined});page=await browser.newPage({viewport:{width:1600,height:1000}});page.setDefaultTimeout(20000);
 const errors=[];page.on('pageerror',e=>errors.push(e.message));await page.goto(server.resolvedUrls.local[0]+'tests/fixtures/app-drag-audit.html');const app=page.frameLocator('iframe');
 await app.locator('#newFileButton').click();await app.locator('#hideLivePreviewButton').click();if(process.env.AUDIT_THEME==='dark')await app.locator('#colorModeButton').click();
 const editor=app.locator('#markdownEditor > .cm-editor'),content=editor.locator('> .cm-scroller > .cm-content'),card=editor.locator('.cm-diagram-card');
 const read=()=>editor.evaluate(async el=>{const {EditorView}=await import('/node_modules/@codemirror/view/dist/index.js');return EditorView.findFromDOM(el).state.doc.toString();});
 const shot=async name=>{if(process.env.AUDIT_OUTPUT)await page.screenshot({path:`${process.env.AUDIT_OUTPUT}/${name}.png`});};
 let count=0;
 for(const template of DIAGRAM_TEMPLATES.filter(t=>t.engine!=='echarts'&&(!process.env.AUDIT_CASE||t.id===process.env.AUDIT_CASE))){
  for(const [prefixName,prefix]of (process.env.AUDIT_PREFIX==='bare'?[['bare','']]:[['comment','%% Prefix audit\n'],['init','%%{init: {"themeVariables":{"fontSize":"14px"}}}%%\n'],['frontmatter','---\ntitle: Prefix audit\n---\n']])){
   const doc='```mermaid\n'+prefix+diagramTemplateSource(template,'zh')+'\n```\n\nAFTER';
   await app.locator('[data-editor-presentation="source"]').click();await content.focus();await page.keyboard.press('Control+a');await page.keyboard.insertText(doc);await page.keyboard.press('Control+End');await app.locator('[data-editor-presentation="live"]').click();
   await card.locator('svg').first().waitFor();const diagram=card.locator('.mermaid-diagram');assert.equal(await diagram.getAttribute('data-mermaid-type'),expected[template.id],`${template.id}/${prefixName}`);assert.equal(await read(),doc);
   const minWidth={gantt:1480,c4:1400,sequence:680,flowchart:680,er:680,packet:980,architecture:980,journey:980,gitgraph:980,timeline:980}[template.id];
   // Some engines intentionally cap SVG width at its intrinsic size. Preserve
   // that cap instead of requiring small diagrams to upscale just for a test.
   if(minWidth)assert.ok(await card.locator('svg').first().evaluate((svg,min)=>{const cap=Number.parseFloat(getComputedStyle(svg).maxWidth);return svg.getBoundingClientRect().width>=Math.min(min,Number.isFinite(cap)?cap:Infinity)-1;},minWidth),`${template.id}/${prefixName} readable width with intrinsic cap`);
   await card.hover();await shot(`${template.id}-${prefixName}-01-rendered`);
   if(process.env.AUDIT_GEOMETRY==='1')console.log(JSON.stringify({children:await card.locator('svg').first().evaluate(svg=>[...svg.children].map(el=>({tag:el.localName,attrs:[...el.attributes].map(a=>[a.name,a.value]),text:el.localName==='text'?el.textContent:'',box:typeof el.getBBox==='function'?(()=>{const b=el.getBBox();return{x:b.x,y:b.y,width:b.width,height:b.height};})():null})))}));
   if(process.env.AUDIT_GEOMETRY==='1')console.log(JSON.stringify({id:template.id,prefix:prefixName,geometry:await card.locator('svg').first().evaluate(svg=>({viewBox:svg.getAttribute('viewBox'),style:svg.getAttribute('style'),width:svg.getAttribute('width'),height:svg.getAttribute('height'),rect:{width:svg.getBoundingClientRect().width,height:svg.getBoundingClientRect().height},labels:[...svg.querySelectorAll('text')].slice(0,16).map(t=>({text:t.textContent,top:t.getBoundingClientRect().top-svg.getBoundingClientRect().top,left:t.getBoundingClientRect().left-svg.getBoundingClientRect().left,parent:t.parentElement.getAttribute('transform'),box:{x:t.getBBox().x,y:t.getBBox().y,width:t.getBBox().width,height:t.getBBox().height}}))}))}));
   await card.locator('[data-diagram-action="source"]').click();await editor.getByRole('button',{name:'返回渲染',exact:true}).click();await card.locator('svg').first().waitFor();assert.equal(await diagram.getAttribute('data-mermaid-type'),expected[template.id]);assert.equal(await read(),doc);await shot(`${template.id}-${prefixName}-02-returned`);
   count++;console.log(JSON.stringify({id:template.id,prefix:prefixName,type:expected[template.id],sourcePreserved:true,returned:true}));
  }
 }
 assert.deepEqual(errors,[]);console.log(JSON.stringify({PASS:count,pageErrors:errors}));
}catch(e){if(page&&process.env.AUDIT_OUTPUT)await page.screenshot({path:`${process.env.AUDIT_OUTPUT}/failure.png`});throw e;}finally{await browser?.close();await server.close();}
