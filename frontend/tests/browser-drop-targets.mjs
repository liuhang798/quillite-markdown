// Authorized isolated-page native mouse audit. No real user files or profile.
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';
const {chromium}=createRequire(import.meta.url)(process.env.PLAYWRIGHT_MODULE || 'playwright');
const server=await createServer({root:fileURLToPath(new URL('..',import.meta.url)),server:{host:'127.0.0.1',port:0,watch:null,hmr:false},logLevel:'error'});
let browser;
try {
  await server.listen();browser=await chromium.launch({headless:true,executablePath:process.env.BROWSER_EXECUTABLE || undefined});
  const page=await browser.newPage({viewport:{width:1280,height:1200}}), errors=[],results=[];
  page.on('pageerror',e=>errors.push(e.message));
  await page.goto(server.resolvedUrls.local[0]+'tests/fixtures/live-editing-audit.html');
  const read=()=>page.getByLabel('当前源码',{exact:true}).textContent();
  const point=(locator,offset,needle='')=>locator.evaluate((el,{offset:index,needle})=>{
    if(needle){const start=el.textContent.indexOf(needle);if(start<0)throw new Error('Missing target text');index+=start;}
    const walker=document.createTreeWalker(el,NodeFilter.SHOW_TEXT);let node;
    while((node=walker.nextNode())) {if(index<=node.length){const range=document.createRange();range.setStart(node,index);range.collapse(true);const r=range.getBoundingClientRect();return {x:r.x,y:r.y+r.height/2};}index-=node.length;}
    throw new Error('Missing text position');
  },{offset,needle});
  const shot=async name=>{if(process.env.AUDIT_OUTPUT)await page.screenshot({path:`${process.env.AUDIT_OUTPUT}/${name}.png`});};
  const drag=async(from,to)=>{await page.mouse.move(from.x,from.y);await page.mouse.down();await page.mouse.move(from.x+10,from.y+10,{steps:3});await page.mouse.move(to.x,to.y,{steps:30});await page.mouse.move(to.x+1,to.y);await page.mouse.up();await page.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));};
  for(const kind of ['code','table','summary','quote','list','quote-list','list-quote','nested-list','ordered','task']) {
    await page.getByLabel('拖放目标类型').selectOption(kind);await page.getByRole('button',{name:'加载目标区块样例'}).click();
    await page.getByText('开头',{exact:true}).scrollIntoViewIfNeeded();
    const source=await read(),from=await point(page.getByText('开头',{exact:true}),0),to=await point(page.getByText('分界',{exact:true}),0);
    await page.mouse.click(from.x,from.y);await page.keyboard.down('Shift');await page.mouse.click(to.x,to.y);await page.keyboard.up('Shift');
    await shot(`${kind}-selected`);
    await drag(await point(page.getByText('ABC',{exact:true}),1),await point(page.locator('.cm-line').filter({hasText:'目标内容'}),2,'目标内容'));
    const result=await read();await shot(`${kind}-dropped`);
    const expectedPayload='开头\n\n```text\nABC\nDEF\n```\n\n';
    let expected=source.slice(source.indexOf('分界')).replace('目标内容','目标'+(kind==='code'?expectedPayload:expectedPayload.replaceAll('\n',' '))+'内容');
    if(kind==='code') expected=expected.replace('```text\n目标','````text\n目标').replace('结束代码\n```','结束代码\n````');
    if(kind==='quote') expected='分界\n\n> 目标\n> \n> 开头\n> \n> ```text\n> ABC\n> DEF\n> ```\n> \n> 内容\n> 引用末尾\n\n外部结束';
    if(kind==='list') expected='分界\n\n- 目标\n  \n  开头\n  \n  ```text\n  ABC\n  DEF\n  ```\n  \n  内容\n- 列表末尾\n\n外部结束';
    const prefixes={'quote-list':'>   ','list-quote':'  > ','nested-list':'    ',ordered:'     ',task:'  '};
    if(prefixes[kind]) expected=source.slice(source.indexOf('分界')).replace('目标内容','目标'+('\n\n'+expectedPayload).replaceAll('\n','\n'+prefixes[kind])+'内容');
    await page.keyboard.press('Control+z');
    const pass=result===expected&&await read()===source;
    results.push({kind,result,expected,pass});console.log(JSON.stringify(results.at(-1)));
  }
  await page.getByLabel('拖放目标类型').selectOption('code');await page.getByRole('button',{name:'加载目标区块样例'}).click();
  const code=page.getByRole('textbox',{name:'Code content',exact:true}).nth(1);
  const beforeTyping=await read();
  await code.getByText('结束代码',{exact:true}).click();await page.keyboard.press('End');await page.keyboard.press('Enter');
  const beforeFence=await read();await page.keyboard.insertText('```');
  const afterFence=await read();
  assert.equal(afterFence,beforeFence.replace('```text\n目标','````text\n目标').replace('结束代码\n\n```','结束代码\n```\n````'));
  assert.equal(await page.getByRole('textbox',{name:'Code content',exact:true}).count(),2);
  await page.keyboard.insertText('literal');assert.equal(await read(),afterFence.replace('结束代码\n```','结束代码\n```literal'));
  await shot('typed-fence');
  await page.keyboard.press('Control+z');assert.equal(await read(),beforeTyping);
  console.log('Typed fence remains code; following typing, caret and single undo passed.');
  for(const kind of ['code','table','summary','quote','list']) {
    await page.getByLabel('拖放目标类型').selectOption(kind);await page.getByRole('button',{name:'加载目标区块样例'}).click();
    const before=await read();
    await page.getByRole('link',{name:'示例文档',exact:true}).scrollIntoViewIfNeeded();
    const target=page.locator('.cm-line').filter({hasText:'目标内容'});
    assert.equal(await target.count(),1);
    await drag(await point(page.getByRole('link',{name:'示例文档',exact:true}),2),await point(target,2,'目标内容'));
    await shot(`external-link-${kind}`);
    assert.equal(await read(),before.replace('目标内容','目标https://example.com/docs?q=markdown#intro内容'));
    await page.keyboard.press('Control+z');assert.equal(await read(),before);
    console.log(`External link into ${kind} and undo passed.`);
  }
  assert.deepEqual(errors,[]);assert.ok(results.every(x=>x.pass));
} finally {await browser?.close();await server.close();}
