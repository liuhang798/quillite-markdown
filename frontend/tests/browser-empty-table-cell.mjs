import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import {createServer} from 'vite';
const {chromium}=createRequire(import.meta.url)(process.env.PLAYWRIGHT_MODULE||'playwright');
const server=await createServer({root:fileURLToPath(new URL('..',import.meta.url)),server:{host:'127.0.0.1',port:0,watch:null,hmr:false},logLevel:'error'});
let browser,page;
try{
 await server.listen();browser=await chromium.launch({headless:true,executablePath:process.env.BROWSER_EXECUTABLE||undefined});
 page=await browser.newPage({viewport:{width:1600,height:1000}});page.setDefaultTimeout(8000);const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.route('**/*',r=>new URL(r.request().url()).hostname==='127.0.0.1'?r.continue():r.abort());
 await page.goto(server.resolvedUrls.local[0]+'tests/fixtures/multiline-edit-audit.html');const frame=page.frames().find(f=>f.parentFrame());await frame.evaluate(async()=>{await import('/src/main.js');});
 const app=page.frameLocator('iframe');await app.locator('#newFileButton').click();
 if(process.env.AUDIT_THEME==='dark')await app.locator('#colorModeButton').click();
 const editor=app.locator('#markdownEditor > .cm-editor'),content=editor.locator('> .cm-scroller > .cm-content');
 const read=()=>editor.evaluate(async el=>{const{EditorView}=await import('/node_modules/@codemirror/view/dist/index.js');const v=EditorView.findFromDOM(el);return{doc:v.state.doc.toString(),selection:v.state.selection.toJSON(),focus:document.activeElement?.outerHTML.slice(0,250)};});
 for(const closed of [false,true])for(const suffix of ['', '\n\nAfter'])for(const prefix of ['', '> ', '  '])for(const method of ['Backspace','Delete','selected','cut','ime']){
  if(process.env.AUDIT_QUICK&&(closed||suffix||prefix))continue;
  const table='<!-- quillite-table-widths: 220, 220, 220 -->\n| 第 1 列 | 第 2 列 | 第 3 列 |\n| :--- | :--- | :--- |\n| 我 | 是的 | 阿萨德 |\n| 阿萨德 | 顺丰大 | 暗 '+(closed?'|':'');
  const source='Before\n\n'+(prefix==='  '?'3. 阿斯蒂芬\n\n':'')+prefix+table.replaceAll('\n','\n'+prefix)+suffix;
  await app.locator('[data-editor-presentation="source"]').click();await content.fill(source);await content.press('Control+Home');await app.locator('[data-editor-presentation="live"]').click();
  const cell=editor.getByRole('textbox',{name:'表格单元格 3, 3',exact:true});await cell.click();await page.keyboard.press(method==='Delete'?'Home':'End');
  if(['selected','cut','ime'].includes(method))await page.keyboard.press('Shift+Home');
  await page.keyboard.press(method==='cut'?'Control+x':['selected','ime'].includes(method)?'Backspace':method);await page.waitForTimeout(100);
  console.log(JSON.stringify({method,prefix,suffix,closed}));
  const empty=source.replace('暗 '+(closed?'|':''),' |');
  assert.equal((await read()).doc,empty);assert.equal(await editor.locator('.cm-live-table').count(),1);
  if(process.env.AUDIT_OUTPUT&&!closed&&!suffix&&!prefix&&method==='Backspace')await page.screenshot({path:process.env.AUDIT_OUTPUT+'/empty-cell-'+(process.env.AUDIT_THEME||'light')+'.png'});
  await page.waitForTimeout(600);
  if(method==='ime'){
   const cdp=await page.context().newCDPSession(page);
   await cdp.send('Input.imeSetComposition',{text:'xin',selectionStart:3,selectionEnd:3});
   await cdp.send('Input.insertText',{text:'新内容'});await cdp.detach();
  }else await page.keyboard.insertText('新内容');
  await page.waitForTimeout(100);assert.equal((await read()).doc,empty.replace('顺丰大 | ','顺丰大 | 新内容'));
  await page.keyboard.press('Control+z');await page.keyboard.press('Control+z');assert.equal((await read()).doc,source);
 }
 assert.deepEqual(errors,[]);console.log('PASS empty cell delete/replace/history');
}catch(e){if(page&&process.env.AUDIT_OUTPUT)await page.screenshot({path:process.env.AUDIT_OUTPUT+'/failure.png'});throw e;}
finally{await browser?.close();await server.close();}
