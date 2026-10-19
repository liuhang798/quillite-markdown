// Authorized isolated browser only; all documents are synthetic.
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
  const read=()=>editor.evaluate(async el=>{const {EditorView}=await import('/node_modules/@codemirror/view/dist/index.js');const s=EditorView.findFromDOM(el).state;return{doc:s.doc.toString(),ranges:s.selection.ranges.map(r=>({anchor:r.anchor,head:r.head}))};});
  const waitDoc=async expected=>{for(let i=0;i<100;i++){if((await read()).doc===expected)return;await page.waitForTimeout(20);}assert.equal((await read()).doc,expected);};
  const shot=async name=>{if(process.env.AUDIT_OUTPUT){await page.waitForTimeout(150);await page.screenshot({path:`${process.env.AUDIT_OUTPUT}/${name}.png`});}};
  const reset=async doc=>{await app.getByRole('button',{name:'源码',exact:true}).click();await content.focus();await page.keyboard.press('Control+a');await page.keyboard.insertText(doc);await waitDoc(doc);};
  const word=async(doc,text)=>{
    await content.focus();await page.keyboard.press('Control+Home');
    const before=doc.slice(0,doc.indexOf(text)),lines=before.split('\n');
    for(let i=1;i<lines.length;i++)await page.keyboard.press('ArrowDown');await page.keyboard.press('Home');
    for(let i=0;i<lines.at(-1).length;i++)await page.keyboard.press('ArrowRight');
    await page.keyboard.press('Control+d');
  };
  for(const mode of ['source','live']) {
    const doc='> style\n\n> target';await reset(doc);await word(doc,'style');await app.locator('#formatPainterButton').click();
    // Keep the modifier held while moving/selecting so the brush waits for release.
    await page.keyboard.down('Control');await content.focus();await page.keyboard.press('Home');await page.keyboard.up('Control');
    await page.keyboard.press('ArrowDown');await page.keyboard.press('ArrowDown');await page.keyboard.press('Home');
    await page.keyboard.press('ArrowRight');await page.keyboard.press('ArrowRight');
    if(mode==='live')await app.getByRole('button',{name:'即时渲染',exact:true}).click();
    await content.focus();await page.keyboard.press('Control+d');await page.waitForTimeout(250);
    await shot(`01-repeat-quote-${mode}`);console.log('repeat quote',mode,JSON.stringify(await read()));
    if(!process.env.AUDIT_BASELINE){assert.equal((await read()).doc,doc);assert.equal(await app.locator('#formatPainterButton').getAttribute('aria-pressed'),'false');}
    for(const prefix of ['> ','- ','> - ','- [x] ','>   - ']) {
      const source=prefix+'target\n\nKeep';await reset(source);await word(source,'target');
      if(mode==='live')await app.getByRole('button',{name:'即时渲染',exact:true}).click();
      const selected=await read();await app.locator('#headingSelect').selectOption('## ');
      await shot(`02-heading-${mode}-${prefix.length}`);console.log('nested heading',mode,JSON.stringify(await read()));
      if(!process.env.AUDIT_BASELINE){
        const container=prefix.replace(/\[[ x]\] /,'');
        assert.equal((await read()).doc,container+'## target\n\nKeep');
        await app.locator('#editorPreviewContent h2').filter({hasText:'target'}).waitFor({state:'visible'});
        await app.locator('#headingSelect').selectOption('');assert.equal((await read()).doc,container+'target\n\nKeep');
        await page.keyboard.press('Control+z');assert.equal((await read()).doc,container+'## target\n\nKeep');
        await page.keyboard.press('Control+z');assert.deepEqual(await read(),selected);
      }
    }
    if(!process.env.AUDIT_BASELINE){
      for(const [source,expected] of [['- target','- > target'],['- [x] target','> - [x] target']]){
        await reset(source);await word(source,'target');if(mode==='live')await app.getByRole('button',{name:'即时渲染',exact:true}).click();
        const before=await read();
        const quote=app.locator('[data-format="quote"]:visible');
        if(await quote.count())await quote.first().click();else {await app.locator('#moreFormatButton').click();await app.locator('[data-format-command="quote"]:visible').click();}
        await waitDoc(expected);await shot(`04-list-quote-${mode}-${source.length}`);
        await page.keyboard.press('Control+z');assert.deepEqual(await read(),before);
      }
      for(const [styled,expected] of [['> - ## style','## target'],['> - [x] style','- [ ] target'],['> 9. style','1. target']]){
        const doc=styled+'\n\ntarget';await reset(doc);await word(doc,'style');await app.locator('#formatPainterButton').click();
        await content.focus();await page.keyboard.press('Control+End');await page.keyboard.press('Home');
        if(mode==='live')await app.getByRole('button',{name:'即时渲染',exact:true}).click();
        await content.focus();await page.keyboard.press('Control+d');await waitDoc(styled+'\n\n'+expected);
        await shot(`03-nested-painter-${mode}-${styled.length}`);
        await page.keyboard.press('Control+z');assert.equal((await read()).doc,doc);
      }
      for(const source of ['```md\n# target\n```','    # target','| target |\n|---|']){
        await reset(source);await word(source,'target');if(mode==='live')await app.getByRole('button',{name:'即时渲染',exact:true}).click();
        await app.locator('#headingSelect').selectOption('## ');assert.equal((await read()).doc,source);
        await shot(`05-protected-${mode}-${source.startsWith('|')?'table':source.startsWith(' ')?'indented':'fenced'}`);
      }
      console.log(mode+': nested brush source detection, protected code/table and undo passed');
    }
  }
  assert.deepEqual(errors,[]);
} catch(e) {if(page&&process.env.AUDIT_OUTPUT)await page.screenshot({path:`${process.env.AUDIT_OUTPUT}/failure.png`});throw e;}
finally {await browser?.close();await server.close();}
