// User-authorized isolated synthetic documents; only UI input mutates content.
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
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto(server.resolvedUrls.local[0]+'tests/fixtures/app-drag-audit.html');
  const app=page.frameLocator('iframe');await app.getByRole('button',{name:'新建文档',exact:true}).click();
  const editor=app.locator('#markdownEditor > .cm-editor'),content=editor.locator('> .cm-scroller > .cm-content');
  const read=()=>editor.evaluate(async el=>{const{EditorView}=await import('/node_modules/@codemirror/view/dist/index.js');const s=EditorView.findFromDOM(el).state;return{doc:s.doc.toString(),main:s.selection.mainIndex,ranges:s.selection.ranges.map(r=>({anchor:r.anchor,head:r.head}))};});
  const shot=async name=>{if(process.env.AUDIT_OUTPUT){await page.waitForTimeout(150);await page.screenshot({path:`${process.env.AUDIT_OUTPUT}/${name}.png`});}};
  const reset=async doc=>{
    await app.getByRole('button',{name:'源码',exact:true}).click();await content.focus();await page.keyboard.press('Control+a');await page.keyboard.insertText(doc);
    for(let i=0;i<100&&(await read()).doc!==doc;i++)await page.waitForTimeout(20);
    assert.equal((await read()).doc,doc);await page.keyboard.press('Control+Home');
  };
  const cases=[
    ['mixed-enter','alpha\n===\n\n> alpha\n\nalpha','Enter','alpha\n===\n\n\n> alpha\n> \n\nalpha\n'],
    ['ordered-enter','alpha\n===\n\n1. alpha\n2. alpha\n\nplain alpha','Enter','alpha\n===\n\n\n1. alpha\n2. \n3. alpha\n4. \n\nplain alpha\n'],
    ['mixed-backspace','alpha\n===\n\n> alpha\n\nplain alpha','Backspace','alpha\n\n\nalpha\n\nplainalpha'],
    ['atomic-backspace','alpha\n===\n\nline<br>alpha\n\nplain alpha','Backspace','alpha\n\n\nlinealpha\n\nplainalpha'],
  ];
  for(const[name,doc,key,expected]of cases){
    await reset(doc);const count=doc.match(/alpha/g).length;
    for(let i=0;i<count;i++)await page.keyboard.press('Control+d');
    assert.equal((await read()).ranges.length,count);
    await app.getByRole('button',{name:'即时渲染',exact:true}).click();await content.focus();await page.keyboard.press(key==='Enter'?'ArrowRight':'ArrowLeft');
    const before=await read();await shot(name+'-before');await page.keyboard.press(key);await page.waitForTimeout(150);
    console.log(name,JSON.stringify(await read()));await shot(name+'-after');
    if(!process.env.AUDIT_BASELINE){assert.equal((await read()).doc,expected);assert.equal((await read()).ranges.length,count);await page.keyboard.press('Control+z');assert.deepEqual(await read(),before);}
  }
  for(const[name,doc,pos]of [['atx-middle','## alpha beta\nNext',8],['setext-middle','alpha beta\n===\nNext',5]]){
    await reset(doc);for(let i=0;i<pos;i++)await page.keyboard.press('ArrowRight');
    await app.getByRole('button',{name:'即时渲染',exact:true}).click();await content.focus();
    await page.keyboard.press('Enter');console.log(name,JSON.stringify(await read()));await shot(name);
  }
  assert.deepEqual(errors,[]);
}catch(e){if(page&&process.env.AUDIT_OUTPUT)await page.screenshot({path:`${process.env.AUDIT_OUTPUT}/failure.png`});throw e;}
finally{await browser?.close();await server.close();}
