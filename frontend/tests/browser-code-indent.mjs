// Fresh isolated page and synthetic documents only; native clipboard and keys.
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import {createServer} from 'vite';
const {chromium}=createRequire(import.meta.url)(process.env.PLAYWRIGHT_MODULE||'playwright');
const server=await createServer({root:fileURLToPath(new URL('..',import.meta.url)),server:{host:'127.0.0.1',port:0,watch:null,hmr:false},logLevel:'error'});
let browser,page;
try{
 await server.listen();browser=await chromium.launch({headless:true,executablePath:process.env.BROWSER_EXECUTABLE||undefined});page=await browser.newPage({viewport:{width:1400,height:1000}});page.setDefaultTimeout(8000);
 const errors=[];page.on('pageerror',e=>errors.push(e.message));await page.goto(server.resolvedUrls.local[0]+'tests/fixtures/multiline-edit-audit.html');const app=page.frameLocator('iframe');await app.locator('#newFileButton').click();await app.locator('#hideLivePreviewButton').click();
 const root=app.locator('#markdownEditor > .cm-editor'),content=root.locator('> .cm-scroller > .cm-content');
 const read=()=>root.evaluate(async el=>{const{EditorView}=await import('/node_modules/@codemirror/view/dist/index.js');return EditorView.findFromDOM(el).state.doc.toString();});
 const shot=async name=>{if(process.env.AUDIT_OUTPUT){await page.waitForTimeout(150);await page.screenshot({path:`${process.env.AUDIT_OUTPUT}/${name}.png`});}};
 const wrappers={plain:x=>'```text\n'+x+'\n```',quote:x=>'> ```text\n'+x.replace(/^/gm,'> ')+'\n> ```',list:x=>'- Item\n\n  ```text\n'+x.replace(/^/gm,'  ')+'\n  ```',details:x=>'<details open>\n<summary>Title</summary>\n\n```text\n'+x+'\n```\n\n</details>',footnote:x=>'Note[^n]\n\n[^n]: Note\n    \n    ```text\n'+x.replace(/^/gm,'    ')+'\n    ```',indented:x=>x.replace(/^/gm,'    ')};
 for(const kind of process.env.AUDIT_CASE?[process.env.AUDIT_CASE]:Object.keys(wrappers))for(const mode of process.env.AUDIT_MODE?[process.env.AUDIT_MODE]:['paste','tab','indent','reverse-indent','midtab','multi','escape']){
  const name=kind+'-'+mode,wrap=wrappers[kind],original='Before\n\n'+wrap('alpha\nbeta')+'\n\nAfter';
  await app.locator('[data-editor-presentation="source"]').click();await content.fill(original);await content.press('Control+Home');await app.locator('[data-editor-presentation="live"]').click();
  const code=root.getByRole('textbox',{name:'代码内容',exact:true});await code.waitFor();
  const clip=page.getByLabel('隔离纯文本');await clip.fill('  one\n\t two\n\nthree');await clip.focus();await clip.press('Control+a');await clip.press('Control+c');assert.equal(await clip.inputValue(),'  one\n\t two\n\nthree');
  await code.click();await code.press('Control+Home');
  if(mode==='indent'){await code.press('Control+a');}
  if(mode==='reverse-indent'){await code.press('Control+End');await code.press('Control+Shift+Home');}
  if(mode==='midtab')await code.press('ArrowRight');
  if(mode==='multi'){
   const points=await code.locator('.cm-line').evaluateAll(lines=>lines.map(el=>{const r=document.createRange();r.setStart(el.firstChild,1);r.collapse(true);const b=r.getBoundingClientRect();return{x:b.x,y:b.y+b.height/2};}));
   await page.mouse.click(points[0].x,points[0].y);await page.keyboard.down('Control');await page.mouse.click(points[1].x,points[1].y);await page.keyboard.up('Control');
  }
  if(mode==='escape'){
   await code.press('Escape');await shot(name+'-02-exit');assert.equal(await code.evaluate(el=>el===el.ownerDocument.activeElement),false,name+' keyboard exit');assert.equal(await read(),original);console.log('PASS',name);continue;
  }
  await shot(name+'-01-before');await page.keyboard.press(mode==='paste'?'Control+v':'Tab');await shot(name+'-02-after');
  const body=mode==='paste'?'  one\n\t two\n\nthreealpha\nbeta':['tab','midtab'].includes(mode)?'  alpha\nbeta':'  alpha\n  beta';
  const expected='Before\n\n'+wrap(body)+'\n\nAfter';assert.equal(await read(),expected,name+' exact source');assert.equal((await code.locator('.cm-line').allTextContents()).join('\n'),body,name+' visible code');
  if(['indent','reverse-indent'].includes(mode)){
   const visual=await code.evaluate(el=>{const owner=el.closest('.cm-editor');return{native:getComputedStyle(el,'::selection').backgroundColor,widths:[...owner.querySelectorAll('.cm-live-selection-layer .cm-selectionBackground')].map(r=>r.getBoundingClientRect().width)};});
   assert.equal(visual.native,'rgba(0, 0, 0, 0)',name+' no duplicate native selection');assert.equal(visual.widths.length,2,name+' each line selected');assert.ok(visual.widths.every(width=>width>0&&width<100),name+' no full-width selection fill');
  }
  await page.keyboard.press('Control+z');assert.equal(await read(),original,name+' undo');await page.keyboard.press('Control+Shift+KeyZ');assert.equal(await read(),expected,name+' redo');
  if(['indent','reverse-indent'].includes(mode)){await page.keyboard.press('Shift+Tab');assert.equal(await read(),original,name+' unindent');}
  else {await page.keyboard.insertText('X');assert.equal(await read(),'Before\n\n'+wrap(mode==='paste'?'  one\n\t two\n\nthreeXalpha\nbeta':mode==='multi'?'  aXlpha\n  bXeta':mode==='midtab'?'  aXlpha\nbeta':'  Xalpha\nbeta')+'\n\nAfter',name+' follow-up caret');}
  console.log('PASS',name);
 }
 assert.deepEqual(errors,[]);
}catch(e){if(page&&process.env.AUDIT_OUTPUT)await page.screenshot({path:`${process.env.AUDIT_OUTPUT}/failure.png`});throw e;}
finally{await browser?.close();await server.close();}
