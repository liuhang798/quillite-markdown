// Synthetic document, fresh browser profile, no user files or external traffic.
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import {createServer} from 'vite';
const {chromium}=createRequire(import.meta.url)(process.env.PLAYWRIGHT_MODULE||'playwright');
const output=process.env.AUDIT_OUTPUT;if(!output)throw Error('AUDIT_OUTPUT required');
const tail='\n我是正文\n\n**我要加粗**\n*我要斜体*\n~~我要删除线~~\n==我要底色==\n<span data-md-color="spectrum-3-red">我要颜色</span>\n\n| 表头甲 | 表头乙 |\n| --- | --- |\n| 单元甲 | 单元乙 |\n\n$y=ax+b$\n\n末尾正文';
const broken='<!-- 注释 --># 我是标题'+tail;
const server=await createServer({root:process.env.AUDIT_APP_ROOT||fileURLToPath(new URL('..',import.meta.url)),server:{host:'127.0.0.1',port:0,watch:null,hmr:false},logLevel:'error'});
let browser,page;
try{
 await server.listen();browser=await chromium.launch({headless:true,executablePath:process.env.BROWSER_EXECUTABLE||undefined});
 page=await browser.newPage({viewport:{width:1500,height:1000}});page.setDefaultTimeout(10000);
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.addInitScript(()=>{localStorage.setItem('language','zh-CN');localStorage.setItem('editorLayout','editor-left');});
 await page.route('**/*',r=>new URL(r.request().url()).hostname==='127.0.0.1'?r.continue():r.abort());
 await page.goto(server.resolvedUrls.local[0]);
 await page.evaluate(async text=>{await import('/src/main.js');window.quilliteMarkdown.openFile=async()=>({path:'synthetic-heading.md',name:'synthetic-heading.md',directory:'.',content:text,revision:'a'.repeat(64)});window.quilliteMarkdown.saveFile=async()=>null;},broken);
 await page.locator('#openFileButton').click();await page.locator('#editButton').click();
 const editor=page.locator('#markdownEditor > .cm-editor'),content=editor.locator('> .cm-scroller > .cm-content'),preview=page.locator('#editorPreviewContent');
 const read=()=>editor.evaluate(async el=>{const{EditorView}=await import('/node_modules/@codemirror/view/dist/index.js');const v=EditorView.findFromDOM(el);return {text:v.state.doc.toString(),head:v.state.selection.main.head};});
 const reset=async text=>{await page.locator('[data-editor-presentation="source"]').click();await content.fill(text);await content.press('Control+Home');await page.locator('[data-editor-presentation="live"]').click();await page.waitForTimeout(150);assert.equal((await read()).text,text);};
 const shot=async name=>{await page.waitForTimeout(200);await page.screenshot({path:output+'/'+name+'.png'});};
 await editor.getByText('我是正文',{exact:true}).click();await shot('01-before-repair');
 assert.equal(await editor.locator('.cm-live-html').count(),0,'mixed comment/title must never become an opaque HTML widget');
 const repair=editor.getByRole('button',{name:'分离注释，恢复标题',exact:true});
 await repair.click();const fixed='<!-- 注释 -->\n# 我是标题'+tail;
 assert.equal((await read()).text,fixed);await editor.locator('.cm-live-h1').filter({hasText:'我是标题'}).waitFor();await preview.locator('h1').filter({hasText:'我是标题'}).waitFor();
 await shot('02-repaired');
 await page.keyboard.press('Control+z');assert.equal((await read()).text,broken);await page.keyboard.press('Control+Shift+KeyZ');assert.equal((await read()).text,fixed);
 // Real click at the rendered title's right edge, delete one character and undo.
 const heading=editor.locator('.cm-live-h1').filter({hasText:'我是标题'});await heading.click();await page.keyboard.press('End');await page.keyboard.press('Backspace');
 assert.equal((await read()).text,fixed.replace('我是标题','我是标'));await page.keyboard.press('Control+z');assert.equal((await read()).text,fixed);
 // Delete title text by keyboard selection. Surrounding source stays byte-identical.
 await heading.click();await page.keyboard.press('End');for(let i=0;i<4;i++)await page.keyboard.press('Shift+ArrowLeft');await page.keyboard.press('Backspace');
 assert.equal((await read()).text,fixed.replace('我是标题',''));await page.keyboard.press('Control+z');assert.equal((await read()).text,fixed);
 console.log('PASS repair, title positioning, character/selection deletion and one-step undo/redo');
 // Delete the entire erroneous comment prefix; heading returns on both sides.
 await reset(broken);await content.press('Control+Home');for(let i=0;i<11;i++)await page.keyboard.press('Shift+ArrowRight');await page.keyboard.press('Backspace');
 assert.equal((await read()).text,'# 我是标题'+tail);await preview.locator('h1').filter({hasText:'我是标题'}).waitFor();await page.keyboard.press('Control+z');assert.equal((await read()).text,broken);
 // Backspace on a single closing delimiter must not swallow all following blocks.
 await content.press('Control+Home');for(let i=0;i<11;i++)await page.keyboard.press('ArrowRight');await page.keyboard.press('Backspace');
 assert.equal((await read()).text,' 注释 # 我是标题'+tail);await editor.locator('.cm-live-strong').filter({hasText:'我要加粗'}).waitFor();await preview.locator('strong').filter({hasText:'我要加粗'}).waitFor();await shot('03-boundary-delete');await page.keyboard.press('Control+z');assert.equal((await read()).text,broken);
 console.log('PASS whole-comment deletion, delimiter deletion, following blocks and undo');
 // New comments inserted before a title may not recreate the old glued syntax.
 await reset('# 我是标题'+tail);await editor.locator('.cm-live-h1').click();await page.keyboard.press('End');
 await page.locator('#moreFormatButton').click();await page.locator('#moreFormatMenu [data-format-command="comment"]:visible').click();
 const inserted=(await read()).text;assert.match(inserted,/^<!-- 注释 -->\n\n# 我是标题/);assert.ok(inserted.endsWith(tail));
 await preview.locator('h1').filter({hasText:'我是标题'}).waitFor();await shot('04-safe-insertion');await page.keyboard.press('Control+z');assert.equal((await read()).text,'# 我是标题'+tail);
 console.log('PASS toolbar comment insertion preserves title and document with single undo');
 // Deliberately unfinished source stays visible/editable, not an empty widget.
 await reset('<!-- unfinished\n# 我是标题'+tail);assert.equal(await editor.locator('.cm-live-html').count(),0);await content.press('Control+End');await page.keyboard.insertText('Z');assert.equal((await read()).text,'<!-- unfinished\n# 我是标题'+tail+'Z');
 assert.deepEqual(errors,[]);console.log('PASS incomplete source remains editable; no page errors');
}catch(error){await page?.screenshot({path:output+'/failure.png'});throw error;}finally{await browser?.close();await server.close();}
