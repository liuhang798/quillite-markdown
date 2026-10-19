import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import {createServer} from 'vite';
const {chromium}=createRequire(import.meta.url)(process.env.PLAYWRIGHT_MODULE||'playwright');
const server=await createServer({root:fileURLToPath(new URL('..',import.meta.url)),server:{host:'127.0.0.1',port:0,watch:null,hmr:false},logLevel:'error'});
let browser,page;
try {
  await server.listen();browser=await chromium.launch({headless:true,executablePath:process.env.BROWSER_EXECUTABLE||undefined});
  page=await browser.newPage({viewport:{width:1500,height:1000}});page.setDefaultTimeout(8000);const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto(server.resolvedUrls.local[0]+'tests/fixtures/app-drag-audit.html');const app=page.frameLocator('iframe');await app.getByRole('button',{name:'新建文档',exact:true}).click();
  const editor=app.locator('#markdownEditor > .cm-editor'),content=editor.locator('> .cm-scroller > .cm-content');
  const read=()=>editor.evaluate(async el=>{const{EditorView}=await import('/node_modules/@codemirror/view/dist/index.js');const s=EditorView.findFromDOM(el).state;return{doc:s.doc.toString(),ranges:s.selection.ranges.map(r=>({anchor:r.anchor,head:r.head}))};});
  const shot=async name=>{if(process.env.AUDIT_OUTPUT){await page.waitForTimeout(100);await page.screenshot({path:`${process.env.AUDIT_OUTPUT}/${name}.png`});}};
  for(const [container,continuation,label]of [['','','root'],['> ','> ','quote'],['- ','  ','list']])for(const [type,prefix,suffix]of [['atx','## ',''],['setext','','\n'+continuation+'===']])for(const [style,open,close,selector]of [['plain','','',''],['bold','**','**','strong'],['highlight','==','==','mark'],['color','<span data-md-color="red">','</span>','span[data-md-color]']]){
    const doc=container+prefix+open+'alpha beta'+close+suffix+'\n'+continuation+'Next',pos=doc.indexOf('beta');
    await app.getByRole('button',{name:'源码',exact:true}).click();await content.focus();await page.keyboard.press('Control+a');await page.keyboard.insertText(doc);
    for(let i=0;i<100&&(await read()).doc!==doc;i++)await page.waitForTimeout(20);assert.equal((await read()).doc,doc);
    await page.keyboard.press('Control+Home');for(let i=0;i<pos;i++)await page.keyboard.press('ArrowRight');
    await app.getByRole('button',{name:'即时渲染',exact:true}).click();await content.focus();const before=await read();
    await page.keyboard.press('Enter');await page.waitForTimeout(150);console.log(label,type,style,JSON.stringify(await read()));await shot(`${label}-${type}-${style}`);
    if(!process.env.AUDIT_BASELINE){
      const result=await read();assert.equal(result.doc,container+(type==='atx'?'## ':'# ')+open+'alpha'+close+'\n'+container+open+'beta'+close+(type==='setext'?'\n'+continuation:'')+'\n'+continuation+'Next');
      assert.equal(await app.locator('#editorPreviewContent h1, #editorPreviewContent h2').textContent(),'alpha');
      if(selector)assert.equal(await app.locator(`#editorPreviewContent ${selector}`).count(),2);
      await page.keyboard.insertText('X');assert.equal((await read()).doc,result.doc.replace('beta','Xbeta'));await page.keyboard.press('Control+z');assert.deepEqual(await read(),result);
      await page.keyboard.press('Control+z');assert.deepEqual(await read(),before);
    }
  }
  if(!process.env.AUDIT_BASELINE){
    const doc='one alpha alpha\n===\nNext';
    await app.getByRole('button',{name:'源码',exact:true}).click();await content.focus();await page.keyboard.press('Control+a');await page.keyboard.insertText(doc);
    for(let i=0;i<100&&(await read()).doc!==doc;i++)await page.waitForTimeout(20);assert.equal((await read()).doc,doc);
    await page.keyboard.press('Control+Home');for(let i=0;i<4;i++)await page.keyboard.press('ArrowRight');
    await page.keyboard.press('Control+d');await page.keyboard.press('Control+d');assert.equal((await read()).ranges.length,2);
    await app.getByRole('button',{name:'即时渲染',exact:true}).click();await content.focus();await page.keyboard.press('ArrowLeft');const before=await read();
    await page.keyboard.press('Enter');const split=await read();assert.equal(split.doc,'# one\nalpha\nalpha\n\nNext');assert.equal(split.ranges.length,2);
    await page.keyboard.insertText('X');assert.equal((await read()).doc,'# one\nXalpha\nXalpha\n\nNext');await page.keyboard.press('Control+z');assert.deepEqual(await read(),split);
    await shot('same-heading-two-cursors');await page.keyboard.press('Control+z');assert.deepEqual(await read(),before);
  }
  assert.deepEqual(errors,[]);
}catch(e){if(page&&process.env.AUDIT_OUTPUT)await page.screenshot({path:`${process.env.AUDIT_OUTPUT}/failure.png`});throw e;}
finally{await browser?.close();await server.close();}
