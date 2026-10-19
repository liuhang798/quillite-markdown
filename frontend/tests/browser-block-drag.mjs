// User-authorized isolated browser; real native drag gestures only.
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';
const require=createRequire(import.meta.url);
const {chromium}=require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const server=await createServer({root:fileURLToPath(new URL('..',import.meta.url)),server:{host:'127.0.0.1',port:0,watch:null,hmr:false},logLevel:'error'});
let browser;
try {
  await server.listen();
  browser=await chromium.launch({headless:true,executablePath:process.env.BROWSER_EXECUTABLE || undefined});
  const page=await browser.newPage({viewport:{width:1280,height:1000}}), errors=[],results=[];
  page.on('pageerror',e=>errors.push(e.message));
  await page.goto(server.resolvedUrls.local[0]+'tests/fixtures/live-editing-audit.html');
  const read=()=>page.getByLabel('当前源码',{exact:true}).textContent();
  const point=(locator,offset)=>locator.evaluate((el,index)=>{
    const walker=document.createTreeWalker(el,NodeFilter.SHOW_TEXT);let node;
    while((node=walker.nextNode())) { if(index<=node.length){const range=document.createRange();range.setStart(node,index);range.collapse(true);const r=range.getBoundingClientRect();return {x:r.x,y:r.y+r.height/2};} index-=node.length; }
    throw new Error('Missing text position');
  },offset);
  const drag=async(from,to)=>{
    await page.mouse.move(from.x,from.y);await page.mouse.down();await page.mouse.move(from.x+10,from.y+10,{steps:3});
    await page.mouse.move(to.x,to.y,{steps:25});await page.mouse.move(to.x+1,to.y);await page.mouse.up();
    await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
  };
  const shot=async name=>{if(process.env.AUDIT_OUTPUT)await page.screenshot({path:`${process.env.AUDIT_OUTPUT}/${name}.png`});};
  for(const kind of ['code','table','details']) for(const variant of ['outside','inside','copy']) {
    await page.getByLabel('整块拖动类型').selectOption(kind);
    await page.getByRole('button',{name:'加载整块拖动样例'}).click();
    await page.getByText('开头',{exact:true}).scrollIntoViewIfNeeded();
    const source=await read(), block=source.slice(4,source.indexOf('\n\n目标段落'));
    const from=await point(page.getByText('开头',{exact:true}),0), to=await point(page.getByText('目标段落',{exact:true}),0);
    await page.mouse.click(from.x,from.y);await page.keyboard.down('Shift');await page.mouse.click(to.x,to.y);await page.keyboard.up('Shift');
    await shot(`${kind}-${variant}-selected`);
    const selection=JSON.parse(await page.getByLabel('选区状态',{exact:true}).textContent());
    assert.equal(selection.anchor,0);assert.equal(selection.head,source.indexOf('目标段落'));
    const origin=variant==='outside' ? page.getByText('开头',{exact:true}) : page.getByText(kind==='code'?'ABC':kind==='table'?'内容':'区块正文',{exact:true});
    if(variant==='copy') await page.keyboard.down('Control');
    await drag(await point(origin,1),await point(page.getByText('目标段落',{exact:true}),2));
    if(variant==='copy') await page.keyboard.up('Control');
    const result=await read(),expected=(variant==='copy'?`开头\n\n${block}\n\n`:'')+`目标\n\n开头\n\n${block}\n\n段落\n\n结束`;
    await shot(`${kind}-${variant}-moved`);
    await page.keyboard.press('Control+z');
    results.push({kind,variant,result,expected,undoExact:await read()===source,pass:result===expected&&await read()===source});
    console.log(JSON.stringify(results.at(-1)));
  }
  await page.getByRole('button',{name:'加载跨块选择样例'}).click();
  const externalSource=await read();
  await page.getByText('OutsideText',{exact:true}).dblclick();
  const extFrom=await point(page.getByText('OutsideText',{exact:true}),4);
  const extTo=await point(page.getByRole('textbox',{name:'Code content',exact:true}).getByText('DEF',{exact:true}),3);
  await drag(extFrom,extTo);
  await shot('external-text-moved');
  assert.equal(await read(),externalSource.replace('DEF','DEFOutsideText'));
  assert.equal(await page.getByText('OutsideText',{exact:true}).textContent(),'OutsideText');
  await page.keyboard.press('Control+z');assert.equal(await read(),externalSource);
  console.log('Real external text drag into code and undo passed.');
  assert.deepEqual(errors,[]);assert.ok(results.every(result=>result.pass),'Whole blocks must remain separated from destination prose');
} finally {await browser?.close();await server.close();}
