import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import {createServer} from 'vite';
import {DIAGRAM_TEMPLATES,diagramTemplateSource} from '../src/diagram-templates.js';
const {chromium}=createRequire(import.meta.url)(process.env.PLAYWRIGHT_MODULE||'playwright');
const server=await createServer({root:fileURLToPath(new URL('..',import.meta.url)),server:{host:'127.0.0.1',port:0,watch:null,hmr:false},logLevel:'error'});
const source=diagramTemplateSource(DIAGRAM_TEMPLATES.find(t=>t.id==='c4'),'zh');
const cases=[['plain',source],['comment','%% audit\n'+source],['init','%%{init: {"themeVariables":{"fontSize":"14px"}}}%%\n'+source],['frontmatter','---\ntitle: Audit\n---\n'+source],['no-title',source.replace(/^\s*title .+\n/m,'')],['multirow',source+'\nSystem(extra1, "Extra one", "First extra")\nSystem(extra2, "Extra two", "Second extra")\nRel(extra1, extra2, "Connection")']];
let browser,page;
try{
 await server.listen();browser=await chromium.launch({headless:true,executablePath:process.env.BROWSER_EXECUTABLE||undefined});page=await browser.newPage({viewport:{width:1600,height:1000}});page.setDefaultTimeout(20000);const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto(server.resolvedUrls.local[0]+'tests/fixtures/app-drag-audit.html');const app=page.frameLocator('iframe');await app.locator('#newFileButton').click();await app.locator('#hideLivePreviewButton').click();if(process.env.AUDIT_THEME==='dark')await app.locator('#colorModeButton').click();
 const editor=app.locator('#markdownEditor > .cm-editor'),content=editor.locator('> .cm-scroller > .cm-content'),card=editor.locator('.cm-diagram-card');
 const read=()=>editor.evaluate(async el=>{const {EditorView}=await import('/node_modules/@codemirror/view/dist/index.js');return EditorView.findFromDOM(el).state.doc.toString();});
 const shot=async name=>{if(process.env.AUDIT_OUTPUT)await page.screenshot({path:`${process.env.AUDIT_OUTPUT}/${name}.png`});};
 for(const [id,code]of cases){
  const doc='```mermaid\n'+code+'\n```\n\nAFTER';await app.locator('[data-editor-presentation="source"]').click();await content.focus();await page.keyboard.press('Control+a');await page.keyboard.insertText(doc);await page.keyboard.press('Control+End');await app.locator('[data-editor-presentation="live"]').click();await card.locator('svg').waitFor();
  const verify=async()=>{
   assert.equal(await read(),doc);
   const result=await card.evaluate(card=>{
    const svg=card.querySelector('svg'),port=card.querySelector('.cm-diagram-body').getBoundingClientRect(),label=[...svg.querySelectorAll('text')].find(t=>t.textContent==='用户'),rect=label.getBoundingClientRect(),group=svg.querySelector(':scope > [data-c4-compacted]');
    const vb=svg.viewBox.baseVal,b=svg.getBBox();
    return{firstNodeVisible:rect.top>=port.top&&rect.bottom<=port.bottom,compacted:!!group,groups:svg.querySelectorAll('[data-c4-compacted]').length,insideCanvas:b.x>=vb.x-2&&b.y>=vb.y-2&&b.x+b.width<=vb.x+vb.width+2&&b.y+b.height<=vb.y+vb.height+2,svgHeight:svg.getBoundingClientRect().height};
   });console.log(JSON.stringify({id,...result}));assert.ok(result.firstNodeVisible,id+' first node visible without vertical scroll');assert.equal(result.groups,1,id+' exactly one compact body');assert.ok(result.insideCanvas,id+' all geometry inside canvas');
  };
  await verify();await card.hover();await shot(id+'-01-initial');
  await card.locator('[data-diagram-action="source"]').click();await editor.getByRole('button',{name:'返回渲染',exact:true}).click();await card.locator('svg').waitFor();await verify();await shot(id+'-02-returned');
  for(const phase of ['switched','restored']){const prior=await card.locator('svg').getAttribute('id');await app.locator('#colorModeButton').click();for(let i=0;i<100;i++){if(await card.locator('svg').count()&&await card.locator('svg').getAttribute('id')!==prior)break;await page.waitForTimeout(50);}assert.notEqual(await card.locator('svg').getAttribute('id'),prior);await verify();await shot(id+'-03-'+phase);}
  // Exercise the actual horizontal scroller rather than fitting long charts
  // by shrinking text. Offscreen right-hand content must remain reachable.
  const viewport=card.locator('.mermaid-diagram');await viewport.hover();await page.mouse.wheel(1600,0);await page.waitForTimeout(200);
  const scroll=await viewport.evaluate(el=>({left:el.scrollLeft,max:el.scrollWidth-el.clientWidth}));assert.ok(scroll.max<=1||scroll.left>0,id+' horizontal content reachable');assert.equal(await read(),doc);await shot(id+'-04-scrolled');
 }
 assert.deepEqual(errors,[]);console.log(JSON.stringify({PASS:cases.length,pageErrors:errors}));
}catch(e){if(page&&process.env.AUDIT_OUTPUT)await page.screenshot({path:`${process.env.AUDIT_OUTPUT}/failure.png`});throw e;}finally{await browser?.close();await server.close();}
