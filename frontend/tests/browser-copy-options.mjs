// Copy only synthetic selections, then paste into this fresh page's own textarea.
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import {createServer} from 'vite';
const {chromium}=createRequire(import.meta.url)(process.env.PLAYWRIGHT_MODULE||'playwright');
const server=await createServer({root:fileURLToPath(new URL('..',import.meta.url)),server:{host:'127.0.0.1',port:0,watch:null,hmr:false},logLevel:'error'});
let browser,page;
try {
 await server.listen();browser=await chromium.launch({headless:true,executablePath:process.env.BROWSER_EXECUTABLE||undefined});
 page=await browser.newPage({viewport:{width:1500,height:1000}});page.setDefaultTimeout(8000);
 const errors=[];page.on('pageerror',error=>errors.push(error.message));
 page.on('dialog',dialog=>dialog.accept());
 await page.route('**/*',r=>new URL(r.request().url()).hostname==='127.0.0.1'?r.continue():r.abort());
 await page.goto(server.resolvedUrls.local[0]+'tests/fixtures/copy-options-audit.html');
 const app=page.frameLocator('iframe');await app.locator('body').evaluate(()=>import('/src/main.js'));await app.locator('#newFileButton').click();
 const editor=app.locator('#markdownEditor > .cm-editor'),content=editor.locator('> .cm-scroller > .cm-content');
 const read=()=>editor.evaluate(async el=>{const {EditorView}=await import('/node_modules/@codemirror/view/dist/index.js');const s=EditorView.findFromDOM(el).state;return{doc:s.doc.toString(),from:s.selection.main.from,to:s.selection.main.to};});
 const shot=async name=>{if(process.env.AUDIT_OUTPUT)await page.screenshot({path:`${process.env.AUDIT_OUTPUT}/${name}.png`});};
 const cases=[
  ['markdown','Text **Bold** and [Link](https://example.com)','Text Bold and Link'],
  ['inline-html','Text <u>Under</u> and <span data-md-color="spectrum-3-red">Red</span>','Text Under and Red'],
  ['entities','Text &lt;tag&gt; &amp; &#x4E2D;','Text <tag> & 中'],
  ['literal-code','Text `<u>literal</u> &amp;`','Text <u>literal</u> &amp;'],
  ['html-break','Text <u>Under</u><br>Next','Text Under\nNext'],
  ['hidden-html','Text <script>hidden</script>After','Text After'],
 ];
 for(const [name,source,plain] of cases)for(const mode of ['source','live'])for(const format of ['markdown','plain']) {
  const id=`${name}-${mode}-${format}`;
  await app.locator('#newFileButton').click();
  await app.getByRole('button',{name:'源码',exact:true}).click();await content.fill(source);
  if(mode==='live')await app.getByRole('button',{name:'即时渲染',exact:true}).click();
  await content.focus();await page.keyboard.press('Control+a');
  const before=await read();assert.equal(before.doc,source);assert.equal(before.from,0);assert.equal(before.to,source.length);
  await content.locator('.cm-line').first().click({button:'right',position:{x:30,y:10}});
  const menu=app.getByRole('menu',{name:'复制选项',exact:true});await menu.waitFor({state:'visible'});await shot(id+'-01-menu');
  await menu.locator(`[data-editor-copy="${format}"]`).click();
  await app.locator('#toast').getByText(format==='plain'?'已复制纯文本':'已复制 Markdown 源码',{exact:true}).waitFor({state:'visible'});
  assert.equal((await read()).doc,source,id+' after menu');
  const target=page.getByRole('textbox',{name:'复制结果',exact:true});await target.fill('');await target.focus();await target.press('Control+v');
  await shot(id+'-02-pasted');const actual=await target.inputValue();console.log(JSON.stringify({id,actual,expected:format==='plain'?plain:source}));
  assert.equal(actual,format==='plain'?plain:source,id);assert.equal((await read()).doc,source,id+' copy must not alter document');
  await content.focus();await page.keyboard.press('Control+z');assert.equal((await read()).doc,'',id+' copy must not add an undo step');
  await page.keyboard.press('Control+Shift+KeyZ');assert.equal((await read()).doc,source,id+' redo');
 }
 assert.deepEqual(errors,[]);console.log('PASS 24 copy option cases');
}catch(error){if(page&&process.env.AUDIT_OUTPUT)await page.screenshot({path:`${process.env.AUDIT_OUTPUT}/failure.png`});throw error;}
finally{await browser?.close();await server.close();}
