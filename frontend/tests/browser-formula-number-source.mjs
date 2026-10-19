// Real controls and synthetic documents; editor state is read only.
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import {mkdir,writeFile} from 'node:fs/promises';
import {createServer} from 'vite';
const {chromium}=createRequire(import.meta.url)(process.env.PLAYWRIGHT_MODULE||'playwright');
const server=await createServer({root:fileURLToPath(new URL('..',import.meta.url)),server:{host:'127.0.0.1',port:0,watch:null,hmr:false},logLevel:'error'});
let browser,page;const results=[];
try{
 await mkdir(process.env.AUDIT_OUTPUT,{recursive:true});await server.listen();browser=await chromium.launch({headless:true,executablePath:process.env.BROWSER_EXECUTABLE||undefined});
 for(const language of ['zh-CN','en']){
  page=await browser.newPage({viewport:{width:1200,height:1000}});page.setDefaultTimeout(12000);const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.route('**/*',r=>new URL(r.request().url()).hostname==='127.0.0.1'?r.continue():r.abort());
  await page.goto(server.resolvedUrls.local[0]+'tests/fixtures/app-drag-audit.html');const frame=page.frames().find(f=>f.parentFrame());await frame.evaluate(async()=>{await import('/src/main.js');});const app=page.frameLocator('iframe');
  await app.locator('#newFileButton').click();await app.locator('#hideLivePreviewButton').click();
  if(language==='en'){await app.locator('#moreButton').click();await app.locator('[data-settings-submenu="language"]').click();await app.locator('[data-language="en"]').click();}
  const editor=app.locator('#markdownEditor > .cm-editor'),content=editor.locator('> .cm-scroller > .cm-content'),source=app.locator('#formulaMarkdownSource'),number=app.locator('#formulaNumber');
  const read=()=>editor.evaluate(async el=>{const{EditorView}=await import('/node_modules/@codemirror/view/dist/index.js');return EditorView.findFromDOM(el).state.doc.toString();});
  const advanced=async()=>{if(!await app.locator('#formulaAdvanced').evaluate(el=>el.open))await app.locator('#formulaAdvanced > summary').click();};
  const shot=async name=>{await number.scrollIntoViewIfNeeded();await page.waitForTimeout(180);await page.screenshot({path:process.env.AUDIT_OUTPUT+'/'+name+'.png'});};
  for(const wrapper of ['dollars','brackets'])for(const tag of ['验-12','Sec. 2-a']){
   const id=language+'-'+wrapper+'-'+(tag==='验-12'?'unicode':'ascii');
   await app.locator('[data-format="formula-builder"]').click();await app.locator('#formulaSearch').fill('custom');await app.locator('[data-formula-template="custom"]').click();await advanced();
   const original=wrapper==='dollars'?`$$\nx+y \\tag{${tag}}\n$$`:`\\[x+y \\tag{${tag}}\\]`;
   await source.fill(original);await app.locator('#formulaPreview .katex').waitFor();await shot(id+'-01-source-number');
   console.log(JSON.stringify({id,stage:'source',field:await number.inputValue(),source:await source.inputValue()}));
   assert.equal(await number.inputValue(),tag);assert.equal(await source.inputValue(),original,'sync must not rewrite source');assert.equal(await number.isVisible(),true);
   // Visual changes and output-mode changes must keep the manually authored tag.
   const field=app.locator('#formulaMathfield');await field.focus();await page.keyboard.press('End');await page.keyboard.type('+9');
   assert.equal(await number.inputValue(),tag);assert.match(await source.inputValue(),/\+9/);assert.ok((await source.inputValue()).includes(`\\tag{${tag}}`));
   await app.locator('[data-formula-mode="block"]').click();assert.doesNotMatch(await source.inputValue(),/\\tag/);
   await app.locator('[data-formula-mode="numbered"]').click();assert.ok((await source.inputValue()).includes(`\\tag{${tag}}`));assert.equal(await number.inputValue(),tag);
   const revised=tag+'-R';await number.fill(revised);const expected=await source.inputValue();assert.ok(expected.includes(`\\tag{${revised}}`));assert.equal((expected.match(/\\tag\{/g)||[]).length,1);await shot(id+'-02-number-edit');
   await app.locator('#insertFormula').click();await app.locator('#formulaDialog').waitFor({state:'hidden'});const widget=editor.locator('.cm-formula-render').first();await widget.waitFor();const inserted=await read();assert.equal(inserted.trim(),expected.trim());
   await widget.focus();await page.keyboard.press('Enter');await app.locator('#formulaDialog').waitFor({state:'visible'});assert.equal(await number.inputValue(),revised);await advanced();assert.equal((await source.inputValue()).trim(),expected.trim());
   await source.fill('$$\nz \\tag{cancelled}\n$$');assert.equal(await number.inputValue(),'cancelled');await app.locator('#cancelFormula').click();assert.equal(await read(),inserted);
   await content.focus();await page.keyboard.press('Control+z');assert.equal(await read(),'');await page.keyboard.press('Control+y');assert.equal(await read(),inserted);await page.keyboard.press('Control+z');assert.equal(await read(),'');
   results.push({id,source:original,saved:expected,status:'pass'});console.log('PASS '+id);
  }
  assert.deepEqual(errors,[]);await page.close();page=null;
 }
 console.log(JSON.stringify({PASS:results.length}));
}catch(error){if(page)await page.screenshot({path:process.env.AUDIT_OUTPUT+'/failure.png'});throw error;}
finally{await writeFile(process.env.AUDIT_OUTPUT+'/results.json',JSON.stringify(results,null,2));await browser?.close();await server.close();}
