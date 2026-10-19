// Isolated synthetic document only. Editing uses pointer/keyboard UI events.
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import {createServer} from 'vite';
const {chromium}=createRequire(import.meta.url)(process.env.PLAYWRIGHT_MODULE||'playwright');
const server=await createServer({root:fileURLToPath(new URL('..',import.meta.url)),server:{host:'127.0.0.1',port:0,watch:null,hmr:false},logLevel:'error'});
let browser,page;
try{
  await server.listen();browser=await chromium.launch({headless:true,executablePath:process.env.BROWSER_EXECUTABLE||undefined});
  page=await browser.newPage({viewport:{width:1500,height:1000}});page.setDefaultTimeout(8000);
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto(server.resolvedUrls.local[0]+'tests/fixtures/app-drag-audit.html');
  const app=page.frameLocator('iframe');await app.getByRole('button',{name:'新建文档',exact:true}).click();
  const editor=app.locator('#markdownEditor > .cm-editor'),content=editor.locator('> .cm-scroller > .cm-content');
  const read=()=>editor.evaluate(async el=>{const{EditorView}=await import('/node_modules/@codemirror/view/dist/index.js');return EditorView.findFromDOM(el).state.doc.toString();});
  const shot=async name=>{if(process.env.AUDIT_OUTPUT){await page.waitForTimeout(100);await page.screenshot({path:`${process.env.AUDIT_OUTPUT}/${name}.png`});}};
  const doc='Before[^b] again[^a]\n\n[^a]: First **bold**\n[^b]: Second\n    continuation\n\nAfter';
  await app.getByRole('button',{name:'源码',exact:true}).click();await content.focus();await page.keyboard.press('Control+a');await page.keyboard.insertText(doc);
  for(let i=0;i<100&&(await read())!==doc;i++)await page.waitForTimeout(20);assert.equal(await read(),doc);
  await page.keyboard.press('Control+Home');await app.getByRole('button',{name:'即时渲染',exact:true}).click();await page.waitForTimeout(150);await shot('01-definition-blocks');
  const blocks=editor.locator('.cm-live-footnote-definition'), first=blocks.nth(0).locator('.cm-content'), second=blocks.nth(1).locator('.cm-content');
  assert.equal(await blocks.count(),2);assert.deepEqual(await blocks.locator('.cm-live-footnote-number').allTextContents(),['2','1']);
  if(process.env.AUDIT_MEASURE)console.log(await blocks.first().evaluate(el=>[el,...el.querySelectorAll('.cm-live-block-content,.cm-editor,.cm-scroller,.cm-content,.cm-line')].map(n=>({cls:n.className,height:n.getBoundingClientRect().height,padding:getComputedStyle(n).padding,margin:getComputedStyle(n).margin,minHeight:getComputedStyle(n).minHeight}))));
  assert.equal(await first.innerText(),'First bold');assert.equal(await second.innerText(),'Second\ncontinuation');
  assert.equal(await first.getAttribute('aria-label'),'脚注正文');
  await second.click();await page.keyboard.press('Control+End');await page.keyboard.press('Enter');await page.keyboard.insertText('new line');
  assert.equal(await read(),doc.replace('    continuation','    continuation\n    new line'));
  assert.equal(await second.innerText(),'Second\ncontinuation\nnew line');await shot('02-multiline-edit');
  // The reference dialog must read the updated authoritative definition.
  await editor.locator('.cm-live-footnote button').first().click();await app.locator('#footnoteDialog').waitFor({state:'visible'});
  assert.equal(await app.locator('#footnoteBody').inputValue(),'Second\ncontinuation\nnew line');await page.keyboard.press('Escape');
  await second.click();await page.keyboard.press('Control+Home');await page.keyboard.press('Backspace');
  assert.ok((await read()).includes('[^b]: Second'),'Backspace at definition start must keep its marker');
  await second.click();await page.keyboard.press('Control+End');await page.keyboard.press('Home');await page.keyboard.press('Shift+End');await page.keyboard.insertText('replacement');
  assert.equal(await read(),doc.replace('    continuation','    continuation\n    replacement'));
  await page.keyboard.press('Control+z');assert.equal(await read(),doc.replace('    continuation','    continuation\n    new line'));
  // Explicit source mode is reversible and never rewrites the original source.
  const current=await read();await blocks.nth(1).hover();await blocks.nth(1).getByRole('button',{name:'查看源码',exact:true}).click();
  assert.equal(await blocks.count(),1);await editor.getByRole('button',{name:'返回渲染',exact:true}).click();
  assert.equal(await blocks.count(),2);assert.equal(await read(),current);await shot('03-source-return');
  // Paste through the real clipboard; embedded new-definition text must stay
  // within the existing note, not replace the unrelated alpha definition.
  await page.context().grantPermissions(['clipboard-read','clipboard-write']);
  await page.evaluate(()=>navigator.clipboard.writeText('pasted\n[^a]: not another note'));
  await second.click();await page.keyboard.press('Control+End');await page.keyboard.press('Enter');await page.keyboard.press('Control+v');
  await page.waitForTimeout(150);assert.equal(await read(),current.replace('    new line','    new line\n    pasted\n    [^a]: not another note'));
  assert.equal(await blocks.count(),2);assert.equal(await first.innerText(),'First bold');
  await shot('04-paste-contained');await page.keyboard.press('Control+z');
  assert.equal(await read(),current.replace('    new line','    new line\n    '));
  await page.keyboard.press('Control+z');assert.equal(await read(),current);
  // Cross-block keyboard selection retains the first marker when replacing
  // only the tail of a definition and removes a fully selected next block.
  await first.click();await page.keyboard.press('Control+End');await page.keyboard.press('Shift+ArrowRight');
  await page.keyboard.press('Shift+ArrowRight');await page.keyboard.insertText('X');
  assert.ok((await read()).includes('[^a]: First **bold**X'),'partial definition keeps wrapper');
  await page.keyboard.press('Control+z');assert.equal(await read(),current);
  // Native held-button drag across two projected editors, then cut and undo.
  const point=async (locator,offset)=>{
    const local=await locator.evaluate((el,offset)=>{const w=document.createTreeWalker(el,NodeFilter.SHOW_TEXT);let n;while(n=w.nextNode()){if(offset<=n.length){const r=document.createRange();r.setStart(n,offset);r.setEnd(n,offset);const b=r.getBoundingClientRect();return{x:b.x,y:b.y+b.height/2};}offset-=n.length;}throw Error('missing text offset');},offset);
    const frame=await page.locator('iframe').boundingBox();return{x:local.x+frame.x,y:local.y+frame.y};
  };
  await first.scrollIntoViewIfNeeded();const start=await point(first.locator('.cm-line').first(),2),end=await point(second.locator('.cm-line').nth(1),4);
  await page.mouse.move(start.x,start.y);await page.mouse.down();await page.mouse.move(end.x,end.y,{steps:20});await page.mouse.up();
  const selected=await editor.evaluate(async el=>{const{EditorView}=await import('/node_modules/@codemirror/view/dist/index.js');const s=EditorView.findFromDOM(el).state;return{from:s.selection.main.from,to:s.selection.main.to};});
  assert.deepEqual(selected,{from:current.indexOf('First')+2,to:current.indexOf('continuation')+4});
  await shot('05-cross-definition-selection');await page.keyboard.press('Control+x');await page.waitForTimeout(100);
  assert.equal(await read(),current.replace('First **bold**\n[^b]: Second\n    cont','Fi\n[^b]: '));
  await page.keyboard.press('Control+z');assert.equal(await read(),current);
  assert.deepEqual(errors,[]);console.log('definition blocks: pointer edit, multiline, marker safety, source return, clipboard isolation, cross-boundary and undo passed');
}catch(e){if(page&&process.env.AUDIT_OUTPUT)await page.screenshot({path:`${process.env.AUDIT_OUTPUT}/failure.png`});throw e;}
finally{await browser?.close();await server.close();}
