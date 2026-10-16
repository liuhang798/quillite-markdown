// Isolated, real UI checks for obsolete validation feedback and Gantt neutrals.
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import {createServer} from 'vite';
const {chromium}=createRequire(import.meta.url)(process.env.PLAYWRIGHT_MODULE||'playwright');
const server=await createServer({root:fileURLToPath(new URL('..',import.meta.url)),server:{host:'127.0.0.1',port:0,watch:null,hmr:false},logLevel:'error'});
let browser,page,failures=0;
try{
 await server.listen();browser=await chromium.launch({headless:true,executablePath:process.env.BROWSER_EXECUTABLE||undefined});page=await browser.newPage({viewport:{width:1600,height:1000}});page.setDefaultTimeout(20000);
 const errors=[];page.on('pageerror',e=>errors.push(e.message));await page.goto(server.resolvedUrls.local[0]+'tests/fixtures/app-drag-audit.html');const app=page.frameLocator('iframe');
 await app.locator('#newFileButton').click();await app.locator('#hideLivePreviewButton').click();if(process.env.AUDIT_THEME==='dark')await app.locator('#colorModeButton').click();
 const source=app.locator('#diagramSource'),editor=app.locator('#markdownEditor > .cm-editor');
 const read=()=>editor.evaluate(async el=>{const{EditorView}=await import('/node_modules/@codemirror/view/dist/index.js');return EditorView.findFromDOM(el).state.doc.toString();});
 const shot=async name=>{if(process.env.AUDIT_OUTPUT)await page.screenshot({path:`${process.env.AUDIT_OUTPUT}/${name}.png`});};
 const check=(condition,message)=>{if(!condition)failures++;console.log(JSON.stringify({check:message,pass:condition}));if(process.env.AUDIT_STRICT==='1')assert.ok(condition,message);};
 for(const [id,label,invalid,error]of [['gantt','甘特图','not-a-diagram','图表语法有误'],['bar-chart','柱状图','{invalid','数据图表配置有误']]){
  await app.locator('[data-format="diagram-builder"]').click();await app.locator('[data-diagram-category="all"]').click();await app.locator('#diagramSearch').fill(label);await app.locator(`[data-diagram-template="${id}"]`).click();if(!await source.isVisible())await app.locator('#flowchartSourceMode').click();
  const original=await source.inputValue();await source.fill(invalid);await app.locator('#insertDiagram').click();await app.locator('#toastMessage').filter({hasText:error}).waitFor({state:'visible'});await app.locator('#insertDiagram:not(:disabled)').waitFor();assert.equal(await read(),'');await shot('01-error-'+id);
  await source.fill(original);await app.locator('#insertDiagram').click();await app.locator('#diagramDialog').waitFor({state:'hidden'});const card=editor.locator('.cm-diagram-card');await card.locator('svg,canvas').first().waitFor();await shot('02-saved-'+id);check(!await app.locator('#toast').isVisible(),id+' obsolete warning cleared on save');
  const saved=await read();assert.ok(saved.includes(original.trim()));
  if(id==='gantt'){
   const colors=await card.locator('.exclude-range').first().evaluate(el=>({excluded:getComputedStyle(el).fill,panel:getComputedStyle(document.documentElement).getPropertyValue('--panel').trim(),excludedOpacity:getComputedStyle(el).opacity}));console.log(JSON.stringify(colors));
   const resolved=await card.evaluate(el=>{const probe=document.createElement('span');probe.style.color='var(--line)';el.append(probe);const value=getComputedStyle(probe).color;probe.remove();return value;});
   check(colors.excluded===resolved,'excluded dates use theme line neutral');
   await app.locator('#colorModeButton').click();
   const excluded=card.locator('.exclude-range').first();
   for(let i=0;i<60;i++){if(await excluded.count()&&await excluded.evaluate(el=>getComputedStyle(el).fill)!==colors.excluded)break;await page.waitForTimeout(50);}
   const switched=await excluded.evaluate(el=>getComputedStyle(el).fill);
   check(switched!==colors.excluded,'theme switch refreshes excluded-date color');assert.equal(await read(),saved);
   await shot('04-theme-switched');await app.locator('#colorModeButton').click();
   for(let i=0;i<60;i++){if(await excluded.count()&&await excluded.evaluate(el=>getComputedStyle(el).fill)===colors.excluded)break;await page.waitForTimeout(50);}
   check(await excluded.evaluate(el=>getComputedStyle(el).fill)===colors.excluded,'theme switch restores original neutral');assert.equal(await read(),saved);
  }
  await card.focus();await page.keyboard.press('Enter');if(!await source.isVisible())await app.locator('#flowchartSourceMode').click();await source.fill(invalid);await app.locator('#insertDiagram').click();await app.locator('#toastMessage').filter({hasText:error}).waitFor({state:'visible'});await app.locator('#insertDiagram:not(:disabled)').waitFor();await app.locator('#cancelDiagram').click();check(!await app.locator('#toast').isVisible(),id+' obsolete warning cleared on cancel');assert.equal(await read(),saved);await shot('03-cancelled-'+id);
  await editor.locator('> .cm-scroller > .cm-content').focus();await page.keyboard.press('Control+z');assert.equal(await read(),'');await app.locator('#newFileButton').click();
 }
 assert.deepEqual(errors,[]);console.log(JSON.stringify({PASS:failures===0,failures,pageErrors:errors}));
}catch(e){if(page&&process.env.AUDIT_OUTPUT)await page.screenshot({path:`${process.env.AUDIT_OUTPUT}/failure.png`});throw e;}
finally{await browser?.close();await server.close();}
