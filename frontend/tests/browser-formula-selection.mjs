// Selected plain TeX conversion, using real controls in isolated documents.
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import {createServer} from 'vite';
const {chromium}=createRequire(import.meta.url)(process.env.PLAYWRIGHT_MODULE||'playwright');
const server=await createServer({root:fileURLToPath(new URL('..',import.meta.url)),server:{host:'127.0.0.1',port:0,watch:null,hmr:false},logLevel:'error'});
let browser,page;
try{
 await server.listen();browser=await chromium.launch({headless:true,executablePath:process.env.BROWSER_EXECUTABLE||undefined});page=await browser.newPage({viewport:{width:1500,height:1100}});page.setDefaultTimeout(12000);
 const errors=[];page.on('pageerror',e=>errors.push(e.message));await page.goto(server.resolvedUrls.local[0]+'tests/fixtures/multiline-edit-audit.html');const app=page.frameLocator('iframe');await app.locator('#newFileButton').click();await app.locator('#hideLivePreviewButton').click();
 const editor=app.locator('#markdownEditor > .cm-editor'),content=editor.locator('> .cm-scroller > .cm-content');
 const read=()=>editor.evaluate(async el=>{const{EditorView}=await import('/node_modules/@codemirror/view/dist/index.js');const s=EditorView.findFromDOM(el).state;return{doc:s.doc.toString(),selected:s.sliceDoc(s.selection.main.from,s.selection.main.to)};});
 const shot=async name=>{if(process.env.AUDIT_OUTPUT){await page.waitForTimeout(200);await page.screenshot({path:process.env.AUDIT_OUTPUT+'/'+name+'.png'});}};
 const open=async()=>{const b=app.locator('[data-format="formula-builder"]');if(await b.isVisible())await b.click();else{await app.locator('#moreFormatButton').click();await app.locator('#moreFormatMenu [data-format-command="formula-builder"]:visible').click();}await app.locator('#formulaDialog').waitFor({state:'visible'});};
 const cases=[['plain','x^2',x=>x],['quote','x^2',x=>'> '+x],['list','x^2',x=>'- '+x],['table','x^2',x=>'| Head |\n| --- |\n| '+x+' |'],['details','x^2',x=>'<details open>\n<summary>Title</summary>\n\n'+x+'\n\n</details>'],['footnote','x^2',x=>'Ref[^n]\n\n[^n]: '+x],['fraction','\\frac{a}{b}',x=>x],['chemistry','\\ce{H2O}',x=>x]];
 for(const[kind,raw,wrap]of cases){
  const source='Before\n\n'+wrap(raw)+'\n\nAfter';await app.locator('[data-editor-presentation="source"]').click();await content.fill(source);await content.press('Control+Home');
  for(let i=0;i<source.indexOf(raw);i++)await content.press('ArrowRight');for(let i=0;i<raw.length;i++)await content.press('Shift+ArrowRight');
  assert.equal((await read()).selected,raw);await app.locator('[data-editor-presentation="live"]').click();await shot(kind+'-01-selected');
  await open();assert.equal(await app.locator('#formulaDialogTitle').textContent(),'选择并生成公式');await app.locator('#cancelFormula').click();assert.equal((await read()).doc,source);
  await open();await app.locator('[data-formula-mode="inline"]').click();const markdown=(await app.locator('#formulaMarkdownSource').inputValue()).trim();assert.equal(markdown,'$'+raw+'$');await shot(kind+'-02-dialog');
  await app.locator('#insertFormula').click();await app.locator('#formulaDialog').waitFor({state:'hidden'});const expected=source.replace(raw,markdown);assert.equal((await read()).doc,expected);
  const formula=editor.locator('.cm-formula-render').first();await formula.waitFor({state:'visible'});await shot(kind+'-03-converted');
  // An existing formula's untouched save must remain a genuine no-op.
  await formula.focus();await page.keyboard.press('Enter');await app.locator('#formulaDialog').waitFor({state:'visible'});await app.locator('#insertFormula').click();await app.locator('#formulaDialog').waitFor({state:'hidden'});
  await content.focus();await page.keyboard.press('Control+z');assert.equal((await read()).doc,source,kind+' one undo after no-op');await page.keyboard.press('Control+Shift+KeyZ');assert.equal((await read()).doc,expected);
  // Ctrl+End inside a table intentionally stays in that cell. Explicitly click
  // the following paragraph to verify leaving the nested field and continuing.
  await content.locator('> .cm-line').filter({hasText:/^After$/}).click();await page.keyboard.press('End');await page.keyboard.insertText('Z');assert.equal((await read()).doc,expected+'Z');await page.keyboard.press('Control+z');assert.equal((await read()).doc,expected);console.log('PASS',kind);
 }
 assert.deepEqual(errors,[]);console.log(JSON.stringify({PASS:cases.length,pageErrors:errors}));
}catch(e){if(page&&process.env.AUDIT_OUTPUT)await page.screenshot({path:process.env.AUDIT_OUTPUT+'/failure.png'});throw e;}finally{await browser?.close();await server.close();}
