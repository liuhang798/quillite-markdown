// Actual clicks/keys in a fresh browser context; only synthetic documents.
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import {createServer} from 'vite';
import {FORMULA_TEMPLATES} from '../src/formula-templates.js';
const {chromium}=createRequire(import.meta.url)(process.env.PLAYWRIGHT_MODULE||'playwright');
const server=await createServer({root:fileURLToPath(new URL('..',import.meta.url)),server:{host:'127.0.0.1',port:0,watch:null,hmr:false},logLevel:'error'});
let browser,page;
try {
 await server.listen();browser=await chromium.launch({headless:true,executablePath:process.env.BROWSER_EXECUTABLE||undefined});
 page=await browser.newPage({viewport:{width:1600,height:1000}});page.setDefaultTimeout(10000);
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.route('**/*',r=>new URL(r.request().url()).hostname==='127.0.0.1'?r.continue():r.abort());
 await page.goto(server.resolvedUrls.local[0]+'tests/fixtures/app-drag-audit.html');const frame=page.frames().find(f=>f.parentFrame());await frame.evaluate(async()=>{await import('/src/main.js');});const app=page.frameLocator('iframe');
 await app.locator('#newFileButton').click();await app.locator('#hideLivePreviewButton').click();
 const editor=app.locator('#markdownEditor > .cm-editor');
 const read=()=>editor.evaluate(async el=>{const{EditorView}=await import('/node_modules/@codemirror/view/dist/index.js');return EditorView.findFromDOM(el).state.doc.toString();});
 const shot=async name=>{if(process.env.AUDIT_OUTPUT){await page.waitForTimeout(250);await page.screenshot({path:`${process.env.AUDIT_OUTPUT}/${name}.png`});}};
 const widget=()=>editor.locator('.cm-formula-render').first();
 const reopen=async()=>{await widget().focus();await page.keyboard.press('Enter');await app.locator('#formulaDialog').waitFor({state:'visible'});};
 const save=async()=>{assert.equal(await app.locator('#insertFormula').isEnabled(),true);await app.locator('#insertFormula').click();await app.locator('#formulaDialog').waitFor({state:'hidden'});await widget().waitFor();};
 const history=async key=>{await editor.locator('> .cm-scroller > .cm-content').focus();await page.keyboard.press(key);await page.waitForTimeout(300);};
 const templates=process.env.AUDIT_LIMIT?FORMULA_TEMPLATES.slice(0,Number(process.env.AUDIT_LIMIT)):FORMULA_TEMPLATES;
 await shot('01-empty');
 for(const [index,template] of templates.entries()){
  assert.equal(await read(),'');
  await app.locator('[data-format="formula-builder"]').click();await app.locator('[data-formula-discipline="all"]').click();
  await app.locator('#formulaSearch').fill(template.name.zh);await app.locator(`[data-formula-template="${template.id}"]`).click();
  await app.locator('[data-formula-mode="block"]').click();
  const original=await app.locator('#formulaMarkdownSource').inputValue();assert.match(original,/^\$\$/);
  assert.equal(await app.locator('#formulaPreview .katex').count()>0,true,template.id+' preview');
  if(index===0)await shot('02-template');
  await save();const inserted=await read();assert.equal(inserted.trim(),original.trim(),template.id+' inserted source');
  if(index===0)await shot('03-inserted');
  await reopen();assert.equal((await app.locator('#formulaMarkdownSource').inputValue()).trim(),original.trim(),template.id+' reopen');
  // A no-op save must not add a transaction to undo history.
  await save();await history('Control+z');assert.equal(await read(),'');await history('Control+y');assert.equal(await read(),inserted);
  await reopen();await app.locator('#formulaAdvanced > summary').click();
  const changed=original.replace(/\$\$\s*$/, ()=>'\\quad + 1\n$$');
  await app.locator('#formulaMarkdownSource').fill(changed);
  if(index===0)await shot('04-edit-source');
  await save();const edited=await read();assert.equal(edited.trim(),changed.trim(),template.id+' edit');
  await reopen();assert.equal((await app.locator('#formulaMarkdownSource').inputValue()).trim(),changed.trim(),template.id+' changed reopen');
  await app.locator('#formulaAdvanced > summary').click();await app.locator('#formulaMarkdownSource').fill('$$x+999$$');await app.locator('#cancelFormula').click();assert.equal(await read(),edited,template.id+' cancel');
  await widget().hover();await widget().locator('[data-formula-action="source"]').click();assert.match(await widget().getAttribute('class'),/is-source-open/);
  if(index===0)await shot('05-source-open');
  await widget().locator('[data-formula-action="source"]').click();assert.doesNotMatch(await widget().getAttribute('class'),/is-source-open/);assert.equal(await read(),edited);
  await app.locator('[data-editor-presentation="source"]').click();assert.equal(await read(),edited);await app.locator('[data-editor-presentation="live"]').click();await widget().waitFor();
  await history('Control+z');assert.equal(await read(),inserted,template.id+' single undo');await history('Control+y');assert.equal(await read(),edited,template.id+' single redo');
  if(index===0)await shot('06-restored');
  await history('Control+z');await history('Control+z');assert.equal(await read(),'');
  // Starting another document also clears the previous document's redo history.
  await app.locator('#newFileButton').click();await history('Control+y');assert.equal(await read(),'');
  console.log(`${index+1}/${templates.length} ${template.id}: insert, no-op, edit, cancel, source toggles, undo/redo, document isolation passed`);
 }
 assert.deepEqual(errors,[]);console.log(`PASS ${templates.length}/${FORMULA_TEMPLATES.length} current formula templates (block mode, default parameters, advanced source editing)`);
}catch(error){if(page&&process.env.AUDIT_OUTPUT)await page.screenshot({path:`${process.env.AUDIT_OUTPUT}/failure.png`});throw error;}
finally{await browser?.close();await server.close();}
