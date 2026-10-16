// Isolated real controls; document/MathLive APIs are read-only assertions.
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import {mkdir,writeFile} from 'node:fs/promises';
import {createServer} from 'vite';
const {chromium}=createRequire(import.meta.url)(process.env.PLAYWRIGHT_MODULE||'playwright');
const server=await createServer({root:fileURLToPath(new URL('..',import.meta.url)),server:{host:'127.0.0.1',port:0,watch:null,hmr:false},logLevel:'error'});
let browser,page;const results=[];
try{
 if(process.env.AUDIT_OUTPUT)await mkdir(process.env.AUDIT_OUTPUT,{recursive:true});await server.listen();browser=await chromium.launch({headless:true,executablePath:process.env.BROWSER_EXECUTABLE||undefined});page=await browser.newPage({viewport:{width:1200,height:1000}});page.setDefaultTimeout(12000);const errors=[];page.on('pageerror',e=>errors.push(e.message));await page.route('**/*',r=>new URL(r.request().url()).hostname==='127.0.0.1'?r.continue():r.abort());
 await page.goto(server.resolvedUrls.local[0]+'tests/fixtures/app-drag-audit.html');const frame=page.frames().find(f=>f.parentFrame());await frame.evaluate(async()=>{await import('/src/main.js');});const app=page.frameLocator('iframe');await app.locator('#newFileButton').click();await app.locator('#hideLivePreviewButton').click();
 if(process.env.AUDIT_LANGUAGE==='en'){await app.locator('#moreButton').click();await app.locator('[data-settings-submenu="language"]').click();await app.locator('[data-language="en"]').click();}
 const editor=app.locator('#markdownEditor > .cm-editor'),content=editor.locator('> .cm-scroller > .cm-content'),widget=editor.locator('.cm-formula-render').first();
 const read=()=>editor.evaluate(async el=>{const{EditorView}=await import('/node_modules/@codemirror/view/dist/index.js');return EditorView.findFromDOM(el).state.doc.toString();});const source=()=>app.locator('#formulaMarkdownSource').inputValue();const input=key=>app.locator(`[data-formula-field="${key}"]`);const shot=async name=>{if(process.env.AUDIT_OUTPUT){await app.locator('#formulaPreview').scrollIntoViewIfNeeded();await page.screenshot({path:process.env.AUDIT_OUTPUT+'/'+name+'.png'});}};
 const open=async(id,mode)=>{const entry=app.locator('[data-format="formula-builder"]');if(await entry.isVisible())await entry.click();else{await app.locator('#moreFormatButton').click();await app.locator('[data-format="formula-builder"]:visible, #moreFormatMenu [data-format-command="formula-builder"]:visible').click();}await app.locator('#formulaSearch').fill(id);await app.locator(`[data-formula-template="${id}"]`).click();await app.locator(`[data-formula-mode="${mode}"]`).click();if(mode==='numbered')await app.locator('#formulaNumber').fill('M-3');};
 const cases=[
  {rows:['f(x,y),b,c','d,e,f','g,h,i'],expected:String.raw`\begin{bmatrix}f(x,y)&b&c\\d&e&f\\g&h&i\end{bmatrix}`},
  {rows:[String.raw`\left[0,1\right),\{a,b\},c`,String.raw`\frac{1}{2}，\text{a,b}，f(x,y)`,String.raw`\begin{matrix}a&b\\c&d\end{matrix},1\,000,z`],expected:String.raw`\begin{bmatrix}\left[0,1\right)&\{a,b\}&c\\\frac{1}{2}&\text{a,b}&f(x,y)\\\begin{matrix}a&b\\c&d\end{matrix}&1\,000&z\end{bmatrix}`},
 ];
 for(const mode of ['inline','block','numbered']){
  for(const [index,{rows,expected}]of cases.entries()){
   await open('matrix3',mode);for(let i=0;i<3;i++)await input('row'+(i+1)).fill(rows[i]);await shot(`${mode}-${index}-01-preview`);const markdown=mode==='inline'?'$'+expected+'$':'$$\n'+expected+(mode==='numbered'?' \\tag{M-3}':'')+'\n$$';console.log(JSON.stringify({mode,index,actual:await source(),expected:markdown}));assert.equal(await source(),markdown);assert.equal(await app.locator('#insertFormula').isEnabled(),true);assert.ok(await app.locator('#formulaPreview .katex').count());
   // Numbered equations add an outer full-width layout table; columnalign marks
   // the actual matrix, including when it contains another matrix in a cell.
   const dimensions=await app.locator('#formulaPreview').evaluate(el=>Array.from(el.querySelector('math mtable[columnalign]').children).map(row=>Array.from(row.children).filter(cell=>cell.localName==='mtd').length));assert.deepEqual(dimensions,[3,3,3],'rendered outer matrix dimensions');
   await app.locator('#insertFormula').click();await app.locator('#formulaDialog').waitFor({state:'hidden'});await widget.waitFor();const inserted=await read();assert.equal(inserted.trim(),markdown);if(process.env.AUDIT_OUTPUT)await page.screenshot({path:process.env.AUDIT_OUTPUT+'/'+mode+'-'+index+'-02-inserted.png'});await widget.focus();await page.keyboard.press('Enter');await app.locator('#formulaDialog').waitFor({state:'visible'});assert.equal((await source()).trim(),markdown);await app.locator('#insertFormula').click();await app.locator('#formulaDialog').waitFor({state:'hidden'});await content.focus();await page.keyboard.press('Control+z');assert.equal(await read(),'');await page.keyboard.press('Control+y');assert.equal(await read(),inserted);await page.keyboard.press('Control+z');assert.equal(await read(),'');results.push({mode,index,scope:'valid matrix3',dimensions,status:'pass'});
  }
  await open('matrix3',mode);
  const invalid=['a,b','a,b,c,d','a,,c',',b,c','a,b,','',String.raw`f(x,y,b,c`,String.raw`a&b,c,d`,String.raw`a\\b,c,d`,String.raw`a%comment,b,c`,String.raw`\end{matrix},b,c`,String.raw`\left(a,b,c`,String.raw`\begin{matrix}a&b,c,d`];
  for(const [index,row]of invalid.entries()){
   await input('row1').fill(row);assert.equal(await input('row1').inputValue(),row);await shot(`${mode}-invalid-${index}`);assert.equal(await app.locator('#insertFormula').isEnabled(),false,'invalid row: '+row);assert.match(await app.locator('#formulaPreview').textContent(),/矩阵|matrix/i);await page.keyboard.press('Control+Enter');assert.equal(await read(),'');await input('row1').fill('a,b,c');assert.equal(await app.locator('#insertFormula').isEnabled(),true);results.push({mode,row,scope:'reject and recover',status:'pass'});
  }
  await app.locator('#cancelFormula').click();assert.equal(await read(),'');
  for(const id of ['matrix2','determinant2','inverse2']){
   await open(id,mode);const key=id==='inverse2'?'a':'a11';
   for(const cell of ['a&b',String.raw`a\\b`,String.raw`\end{bmatrix}`,String.raw`a%comment`,'']){
    await input(key).fill(cell);assert.equal(await app.locator('#insertFormula').isEnabled(),false,'invalid cell: '+cell);await page.keyboard.press('Control+Enter');assert.equal(await read(),'');await input(key).fill('a');assert.equal(await app.locator('#insertFormula').isEnabled(),true);results.push({mode,id,cell,scope:'cell isolation',status:'pass'});
   }await app.locator('#cancelFormula').click();
  }
 }
 assert.deepEqual(errors,[]);console.log(JSON.stringify({PASS:results.length,errors}));
}catch(error){if(page&&process.env.AUDIT_OUTPUT)await page.screenshot({path:process.env.AUDIT_OUTPUT+'/failure.png'});throw error;}
finally{if(process.env.AUDIT_OUTPUT)await writeFile(process.env.AUDIT_OUTPUT+'/results.json',JSON.stringify(results,null,2));await browser?.close();await server.close();}
