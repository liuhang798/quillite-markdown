// Compound operands checked through real template controls and exact source oracles.
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import {mkdir,writeFile} from 'node:fs/promises';
import {createServer} from 'vite';
const {chromium}=createRequire(import.meta.url)(process.env.PLAYWRIGHT_MODULE||'playwright');
const cases=[
 ['logarithm',{base:'a+b',value:'u+v'},String.raw`\log_{a+b} \left(u+v\right)`],
 ['eigenvalue',{matrix:'A+B',eigenvalue:'u+v',identity:'I+J'},String.raw`\det\left(\left(A+B\right)-\left(u+v\right)\cdot \left(I+J\right)\right)=0`],
 ['gradient',{function:'u+v',variables:'x,y'},String.raw`\nabla \left(u+v\right)=\left(\frac{\partial \left(u+v\right)}{\partial x},\frac{\partial \left(u+v\right)}{\partial y}\right)`],
 ['mean',{variable:'x+y',count:'n+1'},String.raw`\overline{x+y}=\frac{1}{n+1}\sum_{i=1}^{n+1}\left(x+y\right)_i`],
 ['weighted-mean',{value:'x+y',weight:'w+v',count:'n+1'},String.raw`\overline{x+y}=\frac{\sum_{i=1}^{n+1}\left(w+v\right)_i\cdot \left(x+y\right)_i}{\sum_{i=1}^{n+1}\left(w+v\right)_i}`],
 ['conditional-probability',{eventA:String.raw`A\cup B`,eventB:String.raw`C\cup D`},String.raw`P(A\cup B\mid C\cup D)=\frac{P(\left(A\cup B\right)\cap \left(C\cup D\right))}{P(C\cup D)}`],
 ['quadratic',{a:'u+v',b:'-2',c:'a+b'},String.raw`x = \frac{-\left(-2\right) \pm \sqrt{\left(-2\right)^{2}-4\cdot \left(u+v\right)\cdot \left(a+b\right)}}{2\cdot \left(u+v\right)}`],
 ['normal-distribution',{mean:'u+v',deviation:'a+b'},String.raw`f(x)=\frac{1}{\left(a+b\right)\cdot \sqrt{2\pi}}\exp\left[-\frac{(x-\left(u+v\right))^2}{2\cdot \left(a+b\right)^{2}}\right]`],
 ['power',{base:'x_1',subscript:'i',exponent:'a+b'},String.raw`\left(x_1\right)_{i}^{a+b}`],
 ['mean',{variable:'x_1',count:'n'},String.raw`\bar{x_1}=\frac{1}{n}\sum_{i=1}^{n}\left(x_1\right)_i`],
];
const server=await createServer({root:fileURLToPath(new URL('..',import.meta.url)),server:{host:'127.0.0.1',port:0,watch:null,hmr:false},logLevel:'error'});let browser,page;const results=[];
try{
 if(process.env.AUDIT_OUTPUT)await mkdir(process.env.AUDIT_OUTPUT,{recursive:true});await server.listen();browser=await chromium.launch({headless:true,executablePath:process.env.BROWSER_EXECUTABLE||undefined});page=await browser.newPage({viewport:{width:1200,height:1000}});page.setDefaultTimeout(12000);const errors=[];page.on('pageerror',e=>errors.push(e.message));await page.route('**/*',r=>new URL(r.request().url()).hostname==='127.0.0.1'?r.continue():r.abort());
 await page.goto(server.resolvedUrls.local[0]+'tests/fixtures/app-drag-audit.html');const frame=page.frames().find(f=>f.parentFrame());await frame.evaluate(async()=>{await import('/src/main.js');});const app=page.frameLocator('iframe');await app.locator('#newFileButton').click();await app.locator('#hideLivePreviewButton').click();const editor=app.locator('#markdownEditor > .cm-editor'),content=editor.locator('> .cm-scroller > .cm-content'),widget=editor.locator('.cm-formula-render').first();
 const source=()=>app.locator('#formulaMarkdownSource').inputValue();const read=()=>editor.evaluate(async el=>{const{EditorView}=await import('/node_modules/@codemirror/view/dist/index.js');return EditorView.findFromDOM(el).state.doc.toString();});const shot=async name=>{if(process.env.AUDIT_OUTPUT){await page.waitForTimeout(180);await page.screenshot({path:process.env.AUDIT_OUTPUT+'/'+name+'.png'});}};
 let index=0;
 for(const[id,values,expected]of cases)for(const mode of ['inline','block','numbered']){
  if(process.env.AUDIT_CASE&&process.env.AUDIT_CASE!==id)continue;index++;const label=index+'-'+id+'-'+mode;assert.equal(await read(),'');const entry=app.locator('[data-format="formula-builder"]');if(await entry.isVisible())await entry.click();else{await app.locator('#moreFormatButton').click();await app.locator('#moreFormatMenu [data-format-command="formula-builder"]:visible').click();}await app.locator('#formulaSearch').fill(id);await app.locator(`[data-formula-template="${id}"]`).click();await app.locator(`[data-formula-mode="${mode}"]`).click();if(mode==='numbered')await app.locator('#formulaNumber').fill('C-7');
  for(const[key,value]of Object.entries(values)){const field=app.locator(`[data-formula-field="${key}"]`);await field.fill(value);assert.equal(await field.inputValue(),value,label+' input target');}
  await app.locator('#formulaPreview').scrollIntoViewIfNeeded();await shot(label+'-01-preview');const markdown=mode==='inline'?'$'+expected+'$':'$$\n'+expected+(mode==='numbered'?' \\tag{C-7}':'')+'\n$$';console.log(JSON.stringify({label,actual:await source(),expected:markdown}));assert.equal(await source(),markdown);assert.equal(await app.locator('#insertFormula').isEnabled(),true);assert.ok(await app.locator('#formulaPreview .katex').count());
  await app.locator('#insertFormula').click();await app.locator('#formulaDialog').waitFor({state:'hidden'});await widget.waitFor();const inserted=await read();assert.equal(inserted.trim(),markdown);await shot(label+'-02-inserted');await widget.focus();await page.keyboard.press('Enter');await app.locator('#formulaDialog').waitFor({state:'visible'});assert.equal((await source()).trim(),markdown);await app.locator('#insertFormula').click();await app.locator('#formulaDialog').waitFor({state:'hidden'});await content.focus();await page.keyboard.press('Control+z');assert.equal(await read(),'');await page.keyboard.press('Control+y');assert.equal(await read(),inserted);await page.keyboard.press('Control+z');assert.equal(await read(),'');results.push({id,mode,values,markdown,status:'pass'});console.log('PASS '+label);
 }
 assert.deepEqual(errors,[]);console.log(JSON.stringify({PASS:results.length,errors}));
}catch(e){if(page&&process.env.AUDIT_OUTPUT)await page.screenshot({path:process.env.AUDIT_OUTPUT+'/failure.png'});throw e;}
finally{if(process.env.AUDIT_OUTPUT)await writeFile(process.env.AUDIT_OUTPUT+'/results.json',JSON.stringify(results,null,2));await browser?.close();await server.close();}
