// Actual validation controls in an isolated browser, never user documents.
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import {mkdir} from 'node:fs/promises';
import {createServer} from 'vite';
const {chromium}=createRequire(import.meta.url)(process.env.PLAYWRIGHT_MODULE||'playwright');
const server=await createServer({root:fileURLToPath(new URL('..',import.meta.url)),server:{host:'127.0.0.1',port:0,watch:null,hmr:false},logLevel:'error'});
let browser,page;
try{
 if(process.env.AUDIT_OUTPUT)await mkdir(process.env.AUDIT_OUTPUT,{recursive:true});
 await server.listen();browser=await chromium.launch({headless:true,executablePath:process.env.BROWSER_EXECUTABLE||undefined});page=await browser.newPage({viewport:{width:960,height:1100}});page.setDefaultTimeout(12000);const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.route('**/*',r=>new URL(r.request().url()).hostname==='127.0.0.1'?r.continue():r.abort());await page.goto(server.resolvedUrls.local[0]+'tests/fixtures/app-drag-audit.html');const frame=page.frames().find(f=>f.parentFrame());await frame.evaluate(async()=>{await import('/src/main.js');});const app=page.frameLocator('iframe');await app.locator('#newFileButton').click();await app.locator('#hideLivePreviewButton').click();
 let confirmations=0,confirmAnswer='dismiss';page.on('dialog',async dialog=>{confirmations++;console.log(JSON.stringify({dialog:dialog.type(),message:dialog.message(),answer:confirmAnswer}));await dialog[confirmAnswer]();});
 const editor=app.locator('#markdownEditor > .cm-editor');const read=()=>editor.evaluate(async el=>{const{EditorView}=await import('/node_modules/@codemirror/view/dist/index.js');return EditorView.findFromDOM(el).state.doc.toString();});const source=()=>app.locator('#formulaMarkdownSource').inputValue();
 const shot=async name=>{if(process.env.AUDIT_OUTPUT){
  if(name==='01-invalid-variable')await app.locator('#formulaPreview').scrollIntoViewIfNeeded();
  if(name==='03-cancel-protects-source'){await app.locator('#toast').waitFor({state:'hidden'});await app.locator('#formulaMarkdownSource').scrollIntoViewIfNeeded();}
  await page.waitForTimeout(150);await page.screenshot({path:process.env.AUDIT_OUTPUT+'/'+name+'.png'});
 }};
 const open=async id=>{const entry=app.locator('[data-format="formula-builder"]');if(await entry.isVisible())await entry.click();else{await app.locator('#moreFormatButton').click();await app.locator('#moreFormatMenu [data-format-command="formula-builder"]:visible').click();}await app.locator('#formulaSearch').fill(id);await app.locator(`[data-formula-template="${id}"]`).click();};
 const cancel=async()=>{await app.locator('#cancelFormula').click();assert.equal(await read(),'');};
 let passed=0;
 const invalidCases=[
  ['double-integral','variable1','x+y','x_1'],['double-integral','variable2','x,y','\\theta'],
  ['taylor-series','function','f(x)','g'],['taylor-series','variable','x+y','t'],['taylor-series','index','2','k'],
  ['gradient','variables','x,,y','x,y'],['gradient','variables',Array.from({length:17},(_,i)=>'x_'+i).join(','),'x_1,\\theta'],
 ];
 for(const[id,key,bad,good]of Array.from({length:Number(process.env.AUDIT_REPEAT)||1},()=>invalidCases).flat()){
  await open(id);const input=app.locator(`[data-formula-field="${key}"]`);await input.fill(bad);assert.equal(await input.inputValue(),bad);assert.equal(await app.locator('#insertFormula').isEnabled(),false);const message=await app.locator('#formulaPreview').innerText();assert.ok(message.trim());await input.press('Enter');assert.equal(await app.locator('#formulaDialog').isVisible(),true);assert.equal(await read(),'');assert.equal(await input.inputValue(),bad);if(passed===0)await shot('01-invalid-variable');await input.fill(good);assert.equal(await app.locator('#insertFormula').isEnabled(),true);assert.ok(await app.locator('#formulaPreview .katex').count());await cancel();console.log('PASS '+(++passed)+' '+id+'/'+key);
 }
 for(const bad of ['$\\frac{$','$x$ $y$','$\\placeholder{}$']){
  await open('custom');await app.locator('#formulaAdvanced > summary').click();await app.locator('#formulaMarkdownSource').fill(bad);assert.equal(await source(),bad);assert.equal(await app.locator('#insertFormula').isEnabled(),false);await app.locator('#formulaMarkdownSource').press('Control+Enter');assert.equal(await app.locator('#formulaDialog').isVisible(),true);assert.equal(await source(),bad);assert.equal(await read(),'');await app.locator('#formulaMarkdownSource').fill('$u+v$');assert.equal(await app.locator('#insertFormula').isEnabled(),true);await cancel();console.log('PASS '+(++passed)+' invalid source');
 }
 await open('custom');await app.locator('#formulaAdvanced > summary').click();const multiline='$$\nx % comment\n+y\n$$';await app.locator('#formulaMarkdownSource').fill(multiline);await app.locator('[data-formula-mode="inline"]').click();assert.equal(await source(),multiline);assert.equal(await app.locator('[data-formula-mode="block"]').getAttribute('aria-pressed'),'true');await shot('02-multiline-retained');await cancel();console.log('PASS '+(++passed)+' multiline mode guard');
 // Real manual source edits still require explicit confirmation before fields replace them.
 await open('trig-identity');await app.locator('#formulaAdvanced > summary').click();await app.locator('#formulaMarkdownSource').fill('$u+v$');const angle=app.locator('[data-formula-field="angle"]');
 assert.equal(confirmations,0,'no unexpected source confirmation before manual editing');await angle.fill('w');assert.equal(confirmations,1);assert.equal(await source(),'$u+v$');assert.equal(await angle.inputValue(),'x');await shot('03-cancel-protects-source');confirmAnswer='accept';await angle.fill('w');assert.equal(confirmations,2);assert.match(await source(),/\\left\(w\\right\)/);await cancel();console.log('PASS '+(++passed)+' manual source confirmation');
 for(const[markdown,layout]of[['\\( x+y \\)','normal'],['$\\textstyle  x+y$','normal'],['$\\displaystyle x+y$','large'],['\\(\\displaystyle   x+y\\)','large']]){
  await open('custom');await app.locator('#formulaAdvanced > summary').click();await app.locator('#formulaMarkdownSource').fill(markdown);assert.equal(await app.locator(`[data-formula-layout="${layout}"]`).getAttribute('aria-pressed'),'true');await app.locator(`[data-formula-layout="${layout}"]`).click();assert.equal(await source(),markdown);await cancel();console.log('PASS '+(++passed)+' idempotent '+layout);
 }
 assert.deepEqual(errors,[]);console.log(JSON.stringify({PASS:passed,errors}));
}catch(e){if(page&&process.env.AUDIT_OUTPUT)await page.screenshot({path:process.env.AUDIT_OUTPUT+'/failure.png'});throw e;}
finally{await browser?.close();await server.close();}
