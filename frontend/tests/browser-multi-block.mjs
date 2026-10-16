// Explicitly authorized isolated browser; synthetic content only.
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import {createServer} from 'vite';
const {chromium}=createRequire(import.meta.url)(process.env.PLAYWRIGHT_MODULE||'playwright');
const server=await createServer({root:fileURLToPath(new URL('..',import.meta.url)),server:{host:'127.0.0.1',port:0,watch:null,hmr:false},logLevel:'error'});
let browser,page;
try{
  await server.listen();browser=await chromium.launch({headless:true,executablePath:process.env.BROWSER_EXECUTABLE||undefined});
  page=await browser.newPage({viewport:{width:1500,height:1000}});page.setDefaultTimeout(8000);const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.route('**/*',route=>new URL(route.request().url()).hostname==='127.0.0.1'?route.continue():route.abort());await page.goto(server.resolvedUrls.local[0]+'tests/fixtures/app-drag-audit.html');const app=page.frameLocator('iframe');await app.locator('#newFileButton').evaluate(async()=>{await import('/src/main.js');});
  await app.getByRole('button',{name:'新建文档',exact:true}).click();const editor=app.locator('#markdownEditor > .cm-editor');
  const read=()=>editor.evaluate(async el=>{const{EditorView}=await import('/node_modules/@codemirror/view/dist/index.js');const s=EditorView.findFromDOM(el).state;return{doc:s.doc.toString(),main:s.selection.mainIndex,ranges:s.selection.ranges.map(r=>({anchor:r.anchor,head:r.head,text:s.sliceDoc(r.from,r.to)}))};});
  const waitDoc=async expected=>{for(let i=0;i<100;i++){if((await read()).doc===expected)return;await page.waitForTimeout(20);}assert.equal((await read()).doc,expected);};
  const shot=async name=>{if(process.env.AUDIT_OUTPUT){await page.waitForTimeout(150);await page.screenshot({path:`${process.env.AUDIT_OUTPUT}/${name}.png`});}};
  const reset=async(content,mode='live')=>{
    await app.getByRole('button',{name:'源码',exact:true}).click();await app.getByRole('textbox').focus();
    await page.keyboard.press('Control+a');await page.keyboard.insertText(content);await waitDoc(content);
    if(mode==='live')await app.getByRole('button',{name:'即时渲染',exact:true}).click();
    await editor.locator('> .cm-scroller > .cm-content').focus();await page.keyboard.press('Control+Home');
  };
  const selectThree=async()=>{for(let i=0;i<3;i++)await page.keyboard.press('Control+d');assert.equal((await read()).ranges.length,3);};
  const format=async command=>{
    const direct=app.locator(`[data-format="${command}"]:visible`);
    if(await direct.count())await direct.first().click();
    else{await app.locator('#moreFormatButton').click();await app.locator(`#moreFormatMenu [data-format-command="${command}"]:visible`).click();}
  };
  const original='alpha one\n\nKeep this\n\nalpha two\n\nalpha three';
  await reset(original);await selectThree();const before=await read();await shot('01-selected');
  await app.locator('#headingSelect').selectOption('## ');const after=await read();await shot('02-heading');console.log(JSON.stringify({before,after}));
  if(!process.env.AUDIT_BASELINE){
    assert.equal(after.doc,original.replaceAll('alpha','## alpha'));assert.equal(after.ranges.length,3);
    await page.keyboard.press('Control+z');assert.deepEqual(await read(),before);
    for(const mode of ['live','source'])for(const command of ['h1','h2','h3','h4','h5','h6','quote','unordered-list','ordered-list','task-list']){
      await reset(original,mode);await selectThree();const initial=await read();
      const prefix=command.startsWith('h')?'#'.repeat(Number(command[1]))+' ':({'quote':'> ','unordered-list':'- ','ordered-list':'1. ','task-list':'- [ ] '})[command];
      if(command.startsWith('h'))await app.locator('#headingSelect').selectOption(prefix);else await format(command);
      assert.equal((await read()).doc,original.replaceAll('alpha',prefix+'alpha'),mode+' '+command);assert.equal((await read()).ranges.length,3);
      if(command.startsWith('h')){
        await app.locator('#headingSelect').selectOption('');assert.equal((await read()).doc,original);
        await page.keyboard.press('Control+z');assert.equal((await read()).doc,original.replaceAll('alpha',prefix+'alpha'));
      }
      await page.keyboard.press('Control+z');assert.deepEqual(await read(),initial);
      await page.keyboard.press('Control+y');assert.equal((await read()).doc,original.replaceAll('alpha',prefix+'alpha'));
      console.log(mode+' '+command+': all selected lines, untouched gaps, undo/redo passed');
    }
    for(const mode of ['live','source']){
      const source='- alpha Parent\n  - alpha Child\n    continued\n- Keep\n- alpha Other\n  follow';
      await reset(source,'source');await page.keyboard.press('ArrowRight');await page.keyboard.press('ArrowRight');await selectThree();
      if(mode==='live')await app.getByRole('button',{name:'即时渲染',exact:true}).click();
      const selected=await read();await format('ordered-list');
      assert.equal((await read()).doc,'1. alpha Parent\n   1. alpha Child\n      continued\n- Keep\n1. alpha Other\n   follow');
      assert.equal((await read()).ranges.length,3);await shot(`04-nested-${mode}`);
      await page.keyboard.press('Control+z');assert.deepEqual(await read(),selected);
      await reset('alpha x alpha y alpha',mode);await selectThree();const sameLine=await read();
      await app.locator('#headingSelect').selectOption('## ');assert.equal((await read()).doc,'## alpha x alpha y alpha');
      assert.equal((await read()).ranges.length,1);await page.keyboard.press('Control+z');assert.deepEqual(await read(),sameLine);
      console.log(mode+': nested list markers/continuation and same-line deduplication passed');
    }
  }
  for(const mode of ['source','live'])for(const colored of [false,true]){
    const sourceStyle=colored?'<span data-md-color="red">**style**</span>':'## ***style***';
    const painterSource=sourceStyle+'\n\nalpha one\n\nalpha two\n\nalpha three';await reset(painterSource,'source');
    for(let i=0;i<painterSource.indexOf('style');i++)await page.keyboard.press('ArrowRight');await page.keyboard.press('Control+d');
    assert.equal((await read()).ranges[0].text,'style');await app.locator('#formatPainterButton').click();
    await editor.locator('> .cm-scroller > .cm-content').focus();await page.keyboard.press('Control+Home');
    await page.keyboard.press('ArrowDown');await page.keyboard.press('ArrowDown');await page.keyboard.press('Home');
    if(mode==='live')await app.getByRole('button',{name:'即时渲染',exact:true}).click();
    await editor.locator('> .cm-scroller > .cm-content').focus();
    await page.keyboard.down('Control');
    for(let i=0;i<3;i++){
      await page.keyboard.press('d');await page.waitForTimeout(180);
      if(!process.env.AUDIT_BASELINE)assert.equal((await read()).doc,painterSource,'held modifier must not apply before selection finishes');
    }
    const selected=await read();await page.keyboard.up('Control');
    const expected=sourceStyle+'\n\n'+['one','two','three'].map(t=>colored?`<span data-md-color="red">**alpha**</span> ${t}`:`## ***alpha*** ${t}`).join('\n\n');
    if(!process.env.AUDIT_BASELINE)await waitDoc(expected);else await page.waitForTimeout(250);
    const painted=await read();await shot(`03-painter-${mode}-${colored?'color':'heading'}`);console.log('painter',mode,colored,JSON.stringify(painted));
    if(!process.env.AUDIT_BASELINE){
      assert.equal(painted.doc,expected);assert.equal(painted.ranges.length,3);
      if(mode==='live'&&colored){await page.keyboard.press('Enter');assert.equal((await read()).doc,expected.replaceAll('</span> ','</span>\n'));await page.keyboard.press('Control+z');assert.equal((await read()).doc,expected);}
      await page.keyboard.press('Control+z');assert.deepEqual(await read(),selected);
      await page.keyboard.press('Control+y');assert.equal((await read()).doc,expected);
    }
  }
  if(!process.env.AUDIT_BASELINE){
    const content='**style**\n\nalpha one';await reset(content,'source');
    await page.keyboard.press('ArrowRight');await page.keyboard.press('ArrowRight');await page.keyboard.press('Control+d');
    await app.locator('#formatPainterButton').click();await app.getByRole('button',{name:'即时渲染',exact:true}).click();
    const point=await editor.locator('.cm-line').filter({hasText:'alpha one'}).evaluate(el=>{
      const w=document.createTreeWalker(el,NodeFilter.SHOW_TEXT);let n;while((n=w.nextNode()))if(n.textContent.includes('alpha one'))break;
      const r=document.createRange();r.setStart(n,0);r.setEnd(n,5);const b=r.getBoundingClientRect();return{x:b.left+.1,end:b.right-.1,y:(b.top+b.bottom)/2};
    });
    await page.mouse.move(point.x,point.y);await page.mouse.down();await page.mouse.move(point.end,point.y,{steps:10});
    await page.waitForTimeout(250);assert.equal((await read()).doc,content,'pointer still down must not paint');
    await page.mouse.up();await waitDoc('**style**\n\n**alpha** one');await shot('05-pointer-release');
    await page.keyboard.press('Control+z');assert.equal((await read()).doc,content);
    console.log('Pointer pause, release-to-apply and undo passed');
  }
  assert.deepEqual(errors,[]);
}catch(error){if(page&&process.env.AUDIT_OUTPUT)await page.screenshot({path:`${process.env.AUDIT_OUTPUT}/failure.png`});throw error;}
finally{await browser?.close();await server.close();}
