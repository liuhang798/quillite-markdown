import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import {createServer} from 'vite';
const {chromium}=createRequire(import.meta.url)(process.env.PLAYWRIGHT_MODULE || 'playwright');
const server=await createServer({root:fileURLToPath(new URL('..',import.meta.url)),server:{host:'127.0.0.1',port:0,watch:null,hmr:false},logLevel:'error'});
let browser,page;
try {
  await server.listen();browser=await chromium.launch({headless:true,executablePath:process.env.BROWSER_EXECUTABLE || undefined});
  page=await browser.newPage({viewport:{width:1400,height:1000}});page.setDefaultTimeout(8000);
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  page.on('console',m=>{if(m.type()==='error'&&!m.text().includes('Failed to load resource'))errors.push(m.text());});
  await page.goto(server.resolvedUrls.local[0]+'tests/fixtures/app-drag-audit.html');
  const app=page.frameLocator('iframe');await app.getByRole('button',{name:'新建文档',exact:true}).click();
  const read=()=>app.locator('#markdownEditor > .cm-editor').evaluate(async el=>{
    const {EditorView}=await import('/node_modules/@codemirror/view/dist/index.js');return EditorView.findFromDOM(el).state.doc.toString();
  });
  const cases={plain:['','    '],tab:['','\t'],quote:['','>     '],list:['- 条目\n\n','      '],nested:['- 外层\n  - 内层\n\n','        '],ordered:['123. 条目\n\n','         '],task:['- [x] 条目\n\n','      '],quotedList:['> - 条目\n>\n','>       '],listQuote:['- 条目\n\n','  >     ']};
  for(const [name,[intro,prefix]] of Object.entries(cases)) {
    const source='开头\n\n'+intro+prefix+'ABC\n'+prefix+'DEF\n\n后文';
    await app.getByRole('button',{name:'源码',exact:true}).click();await app.getByRole('textbox').fill(source);
    await app.getByRole('button',{name:'即时渲染',exact:true}).click();
    const code=app.getByRole('textbox',{name:'代码内容',exact:true});
    if(!process.env.AUDIT_EXPECT_SOURCE) await code.scrollIntoViewIfNeeded();
    if(process.env.AUDIT_OUTPUT) await page.screenshot({path:`${process.env.AUDIT_OUTPUT}/${name}-rendered.png`});
    if(process.env.AUDIT_EXPECT_SOURCE) {console.log(JSON.stringify({name,editors:await code.count()}));continue;}
    assert.equal(await code.innerText(),'ABC\nDEF');
    const click=async(text,offset)=>{await code.scrollIntoViewIfNeeded();const p=await code.getByText(text,{exact:true}).evaluate((el,index)=>{const r=document.createRange();r.setStart(el.firstChild,index);r.collapse(true);const b=r.getBoundingClientRect(),x=b.x,y=b.y+b.height/2;return{x,y,hit:el.contains(document.elementFromPoint(x,y))};},offset);assert.ok(p.hit,'pointer must hit the visible code line');await page.mouse.click(p.x,p.y);};
    await click('DEF',1);await page.keyboard.insertText('字');assert.equal(await read(),source.replace('DEF','D字EF'));
    await page.keyboard.press('Control+z');assert.equal(await read(),source);
    await click('DEF',1);await page.keyboard.press('Enter');await page.keyboard.insertText('NEW');
    assert.equal(await read(),source.replace('DEF','D\n'+prefix+'NEWEF'));
    await page.keyboard.press('Control+z');assert.equal(await read(),source);
    await click('DEF',0);await page.keyboard.press('Backspace');assert.equal(await read(),source.replace('ABC\n'+prefix+'DEF','ABCDEF'));
    await page.keyboard.press('Control+z');assert.equal(await read(),source);
    await click('DEF',3);await page.keyboard.press('Enter');await page.keyboard.insertText('END');
    assert.equal(await read(),source.replace('DEF','DEF\n'+prefix+'END'));
    await app.getByRole('article').locator('pre code').getByText(/END/).waitFor({state:'visible'});
    if(process.env.AUDIT_OUTPUT) await page.screenshot({path:`${process.env.AUDIT_OUTPUT}/${name}-newline.png`});
    await page.keyboard.press('Control+z');assert.equal(await read(),source);
    await app.locator('.cm-live-code').getByRole('button',{name:'查看源码',exact:true}).click();
    await app.getByRole('button',{name:'返回渲染',exact:true}).click();assert.equal(await code.innerText(),'ABC\nDEF');assert.equal(await read(),source);
    const point=async(locator,offset)=>{await locator.scrollIntoViewIfNeeded();return locator.evaluate((el,index)=>{const walker=document.createTreeWalker(el,NodeFilter.SHOW_TEXT);let n;while((n=walker.nextNode())){if(index<=n.length){const r=document.createRange();r.setStart(n,index);r.collapse(true);const b=r.getBoundingClientRect();return{x:b.x,y:b.y+b.height/2};}index-=n.length;}throw Error('Missing text');},offset);};
    const drag=async(a,b)=>{await page.mouse.move(a.x,a.y);await page.mouse.down();await page.mouse.move(a.x+7,a.y+7,{steps:3});await page.mouse.move(b.x,b.y,{steps:25});await page.mouse.up();};
    await drag(await point(code.getByText('ABC',{exact:true}),1),await point(code.getByText('DEF',{exact:true}),2));
    await page.keyboard.insertText('X');assert.equal(await read(),source.replace('ABC\n'+prefix+'DEF','AXF'));
    await page.keyboard.press('Control+z');assert.equal(await read(),source);
    await click('DEF',2);
    await drag(await point(code.getByText('DEF',{exact:true}),2),await point(app.locator('#markdownEditor').getByText('后文',{exact:true}),2));
    await page.keyboard.insertText('X');assert.equal(await read(),source.replace('DEF','DEX').replace('后文',''));
    await app.getByRole('article').locator('pre code').getByText(/DEX/).waitFor({state:'visible'});
    await code.scrollIntoViewIfNeeded();
    if(process.env.AUDIT_OUTPUT)await page.screenshot({path:`${process.env.AUDIT_OUTPUT}/${name}-cross-selection.png`});
    await page.keyboard.press('Control+z');assert.equal(await read(),source);
    await click('ABC',1);await page.keyboard.press('Control+a');
    await page.keyboard.press('Backspace');
    assert.equal(await read(),source.replace('ABC\n'+prefix+'DEF',''));
    await page.keyboard.insertText('RESTORED');assert.equal(await read(),source.replace('ABC\n'+prefix+'DEF','RESTORED'));
    await app.getByRole('article').locator('pre code').getByText('RESTORED',{exact:true}).waitFor({state:'visible'});
    if(process.env.AUDIT_OUTPUT && name==='quote')await page.screenshot({path:`${process.env.AUDIT_OUTPUT}/quote-clear-and-retype.png`});
    await page.keyboard.press('Control+z');assert.equal(await read(),source);
    console.log(JSON.stringify({name,typing:true,newline:true,join:true,trailingNewline:true,sourceRoundTrip:true,drag:true,crossSelection:true,clearAndRetype:true,undo:true}));
  }
  assert.deepEqual(errors,[]);
} catch(error) {if(page&&process.env.AUDIT_OUTPUT)await page.screenshot({path:`${process.env.AUDIT_OUTPUT}/failure.png`});throw error;}
finally {await browser?.close();await server.close();}
