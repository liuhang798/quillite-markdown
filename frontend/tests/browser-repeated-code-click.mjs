import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import {createServer} from 'vite';
import {readFile} from 'node:fs/promises';
import path from 'node:path';
// Real pointer/keyboard/CDP composition regression. AUDIT_DIST tests the exact
// packaged frontend; AUDIT_DOCUMENT is read-only and never included in assertions.
const {chromium}=createRequire(import.meta.url)(process.env.PLAYWRIGHT_MODULE||'playwright');
const server=await createServer({root:fileURLToPath(new URL('..',import.meta.url)),plugins:process.env.AUDIT_DIST?[{name:'production-assets',configureServer(server){server.middlewares.use(async(req,res,next)=>{const url=(req.url||'').split('?')[0];if(url!=='/'&&!url.startsWith('/assets/'))return next();try{const file=path.resolve(process.env.AUDIT_DIST,url==='/'?'index.html':'.'+url);if(!file.startsWith(path.resolve(process.env.AUDIT_DIST)+path.sep))return next();res.setHeader('Content-Type',url==='/'?'text/html':url.endsWith('.js')?'text/javascript':url.endsWith('.css')?'text/css':'application/octet-stream');res.end(await readFile(file));}catch{next();}});}}]:[],server:{host:'127.0.0.1',port:0,watch:null,hmr:false},logLevel:'error'});
let browser,page;
try{
 await server.listen();browser=await chromium.launch({headless:true,executablePath:process.env.BROWSER_EXECUTABLE});
 page=await browser.newPage({viewport:{width:1600,height:1000}});page.setDefaultTimeout(10000);
 const errors=[];page.on('pageerror',error=>errors.push(error.message));
 await page.addInitScript(()=>localStorage.setItem('editorLayout','editor-left'));
 await page.route('**/*',route=>new URL(route.request().url()).hostname==='127.0.0.1'?route.continue():route.abort());
 await page.goto(server.resolvedUrls.local[0]+'tests/fixtures/app-drag-audit.html');const app=page.frameLocator('iframe');
 await app.getByRole('button',{name:'新建文档',exact:true}).click();
 if(process.env.AUDIT_THEME==='dark')await app.locator('#colorModeButton').click();
 const editor=app.locator('#markdownEditor > .cm-editor'),content=editor.locator('> .cm-scroller > .cm-content');
 const read=()=>editor.evaluate(async el=>{const{EditorView}=await import('/node_modules/@codemirror/view/dist/index.js');const v=EditorView.findFromDOM(el);return{doc:v.state.doc.toString(),head:v.state.selection.main.head,active:document.activeElement.className};});
 const bodies=['只读审查当前 Git diff，不修改文件。\n重点检查业务回归、权限、异常分支、接口兼容、SQL、安全和测试缺口。\n只报告有明确证据的问题，并给出触发条件、文件位置和影响。','分别报告：定向测试、受影响项目构建、完整解决方案构建、真实接口验证、数据库核对。\n无法验证的项目必须列为待验证，不能用“应该可以”代替证据。'];
 let expected=Array.from({length:52},(_,i)=>'### Section '+i+'\n\nParagraph '+i+'\n\n').join('')+'---\n\n## 附录\n\n### 分析需求\n\n```text\n先读取项目规则。\n记录数据来源和约束。\n不确定的地方单独列出。\n```\n\n### 开始实施\n\n```text\n按确认后的计划小步修改。\n先补失败测试，再修改实现。\n```\n\n### 审查改动\n\n```text\n'+bodies[0]+'\n```\n\n### 最终验收\n\n```text\n'+bodies[1]+'\n```\n\n## 参考资料\n\n- link one\n- link two';
 if(process.env.AUDIT_DOCUMENT){expected=(await readFile(process.env.AUDIT_DOCUMENT,'utf8')).replace(/\r\n/g,'\n');for(const[index,title]of ['审查改动','最终验收'].entries()){const start=expected.indexOf('```text\n',expected.indexOf('### '+title))+8;const end=expected.indexOf('\n```',start);bodies[index]=expected.slice(start,end);}}
 await app.getByRole('button',{name:'源码',exact:true}).click();await content.focus();await page.keyboard.press('Control+a');await page.keyboard.insertText(expected);await editor.evaluate(async(el,at)=>{const{EditorView}=await import('/node_modules/@codemirror/view/dist/index.js');EditorView.findFromDOM(el).dispatch({selection:{anchor:at},scrollIntoView:true});},expected.indexOf(bodies[0]));await app.getByRole('button',{name:'即时渲染',exact:true}).click();
 const cdp=await page.context().newCDPSession(page);
 for(let i=0;i<40;i++){
  const index=i%2,inner=editor.locator('.cm-live-code .cm-content').filter({hasText:bodies[index].split('\n')[0]}).last();
  await inner.scrollIntoViewIfNeeded();
  const local=Math.min(bodies[index].length-1,index?bodies[index].indexOf('\n')+15:18+i);
  const xy=await inner.evaluate(async(el,local)=>{const{EditorView}=await import('/node_modules/@codemirror/view/dist/index.js');const view=EditorView.findFromDOM(el),rect=view.coordsAtPos(local);return{x:rect.left,y:(rect.top+rect.bottom)/2};},local);
  const clicks=i%4===3?2:i%7===6?3:1;
  await page.mouse.click(xy.x,xy.y,{clickCount:clicks});
  const picked=await inner.evaluate(async el=>{const{EditorView}=await import('/node_modules/@codemirror/view/dist/index.js');const r=EditorView.findFromDOM(el).state.selection.main;return{from:r.from,to:r.to};});
  const at=expected.indexOf(bodies[index])+picked.from,to=expected.indexOf(bodies[index])+picked.to;
  const before=await read();console.log('click',i,{want:at,head:before.head,active:before.active});
  assert.ok(before.head>=at&&before.head<=to,'native click must select the exact body character');
  if(clicks===1)assert.equal(picked.from,local);
  const text=i%3?'aas':'地方';
  await inner.evaluate(el=>{window.clickedCode=el;window.codeBlurred=false;el.addEventListener('blur',()=>window.codeBlurred=true,{once:true});});
  const assertFocused=async()=>assert.equal(await editor.evaluate(()=>document.activeElement===window.clickedCode&&!window.codeBlurred),true,'typing must never detach or blur the clicked editor');
  if(i%3)await page.keyboard.type(text);
  else {await cdp.send('Input.imeSetComposition',{text:'di',selectionStart:2,selectionEnd:2});await assertFocused();await cdp.send('Input.imeSetComposition',{text:'di fang',selectionStart:7,selectionEnd:7});await assertFocused();await cdp.send('Input.insertText',{text});}
  await assertFocused();
  const edited=expected.slice(0,at)+text+expected.slice(to);
  assert.ok((await read()).doc===edited,'repeated clicks and real input must only modify the intended body range');
  await page.keyboard.press('Control+z');assert.ok((await read()).doc===expected,'undo restores exact source');
  await page.keyboard.press('Control+Shift+KeyZ');assert.ok((await read()).doc===edited,'redo restores exact body edit');
  await page.keyboard.press('Control+z');assert.ok((await read()).doc===expected);
 }
 assert.deepEqual(errors,[],'no uncaught application errors');
 if(process.env.AUDIT_OUTPUT)await page.screenshot({path:process.env.AUDIT_OUTPUT+'/success-'+(process.env.AUDIT_THEME||'light')+'.png'});
 console.log('PASS 40 repeated clicks, uninterrupted focus, Latin/IME input, exact undo/redo');
}catch(error){if(page&&process.env.AUDIT_OUTPUT)await page.screenshot({path:process.env.AUDIT_OUTPUT+'/failure.png'});throw error;}
finally{await browser?.close();await server.close();}
