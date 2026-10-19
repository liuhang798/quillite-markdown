// Explicitly authorized isolated browser testing; no user profile or documents.
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const server = await createServer({ root:fileURLToPath(new URL('..',import.meta.url)), server:{host:'127.0.0.1',port:0,watch:null,hmr:false},logLevel:'error' });
let browser;
try {
  await server.listen();
  browser = await chromium.launch({ headless:true, executablePath:process.env.BROWSER_EXECUTABLE || undefined });
  const page = await browser.newPage({viewport:{width:1280,height:900}});
  const errors = [], results = [];
  page.on('pageerror',error => errors.push(error.message));
  await page.goto(server.resolvedUrls.local[0]+'tests/fixtures/live-editing-audit.html');
  const read = () => page.getByLabel('当前源码',{exact:true}).textContent();
  const point = (locator, offset) => locator.evaluate((el,index) => {
    const walker = document.createTreeWalker(el,NodeFilter.SHOW_TEXT);
    let node;
    while ((node=walker.nextNode())) {
      if (index<=node.length) { const range=document.createRange(); range.setStart(node,index); range.collapse(true); const r=range.getBoundingClientRect(); return {x:r.x,y:r.y+r.height/2}; }
      index-=node.length;
    }
    throw new Error('Missing visible text');
  },offset);
  const drag = async (from,to) => {
    await page.mouse.move(from.x,from.y); await page.mouse.down();
    await page.mouse.move(from.x+7,from.y+7,{steps:3});
    await page.mouse.move(to.x,to.y,{steps:25});
    await page.mouse.move(to.x+1,to.y); await page.mouse.up();
    await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
  };
  const shot = async name => { if(process.env.AUDIT_OUTPUT) await page.screenshot({path:`${process.env.AUDIT_OUTPUT}/${name}.png`}); };
  const run = async (name, prepare, expected, sample='加载跨块选择样例') => {
    if (sample) await page.getByRole('button',{name:sample}).click(); else await page.reload();
    const source=await read();
    const coordinates=await prepare();
    await shot(name+'-before');
    await drag(coordinates.from,coordinates.to);
    if (coordinates.copy) await page.keyboard.up('Control');
    const result=await read(); await shot(name+'-after');
    await page.keyboard.press('Control+z'); const undone=await read();
    results.push({name,source,result,expected:expected(source),undoExact:undone===source,pass:result===expected(source)&&undone===source});
    console.log(JSON.stringify(results.at(-1)));
  };
  const code=page.getByRole('textbox',{name:'Code content',exact:true});
  const selectABC=async()=>{
    await code.getByText('ABC',{exact:true}).click(); await code.press('Home'); await code.press('Shift+End');
  };
  await run('01-same-code',async()=>{
    await selectABC();
    return {from:await point(code.getByText('ABC',{exact:true}),1),to:await point(code.getByText('DEF',{exact:true}),3)};
  },source=>source.replace('ABC\nDEF','\nDEFABC'));
  await run('02-code-to-prose',async()=>{
    await selectABC();
    return {from:await point(code.getByText('ABC',{exact:true}),1),to:await point(page.getByText('后文',{exact:true}),2)};
  },source=>source.replace('ABC\n','\n').replace('后文','后文ABC'));
  await run('03-prose-to-code',async()=>{
    await page.getByText('后文',{exact:true}).click();
    const outer=page.locator('#editor > .cm-editor > .cm-scroller > .cm-content');
    await outer.press('Home'); await outer.press('Shift+End');
    return {from:await point(page.getByText('后文',{exact:true}),1),to:await point(code.getByText('DEF',{exact:true}),3)};
  },source=>source.replace('DEF','DEF后文').replace('\n后文\n','\n\n'));
  await run('04-copy-code-to-prose',async()=>{
    await selectABC();
    const coordinates={from:await point(code.getByText('ABC',{exact:true}),1),to:await point(page.getByText('后文',{exact:true}),2),copy:true};
    await page.keyboard.down('Control'); return coordinates;
  },source=>source.replace('后文','后文ABC'));
  await run('05-table-cells',async()=>{
    const first=page.getByRole('textbox',{name:'Table cell 2, 1',exact:true}), second=page.getByRole('textbox',{name:'Table cell 2, 2',exact:true});
    await first.click(); await first.press('Home'); await first.press('Shift+End');
    return {from:await point(first.getByText('中文',{exact:true}),1),to:await point(second.getByText('2',{exact:true}),1)};
  },source=>source.replace('| 中文 | 2 |','|  | 2中文 |'),null);
  await run('06-nested-code-to-prose',async()=>{
    await selectABC();
    return {from:await point(code.getByText('ABC',{exact:true}),1),to:await point(page.getByText('后文',{exact:true}),2)};
  },source=>source.replace('ABC\n','\n').replace('\n后文\n','\n后文ABC\n'),'加载嵌套选择样例');
  await run('07-cross-block-range',async()=>{
    await code.getByText('DEF',{exact:true}).click(); await code.press('End'); await code.press('ArrowLeft');
    const end=await point(page.getByText('后文',{exact:true}),2);
    await page.keyboard.down('Shift'); await page.mouse.click(end.x,end.y); await page.keyboard.up('Shift');
    return {from:await point(page.getByText('后文',{exact:true}),1),to:await point(page.getByText('结束',{exact:true}),2)};
  },()=> '前文\n\n```text\nABC\nDE\n```\n\n结束F\n\n后文');
  // User-visible fixture control changes the document while a real native drag
  // is held. No application state is injected from browser automation.
  await page.getByRole('button',{name:'加载跨块选择样例'}).click();
  await page.getByRole('button',{name:'1秒后切换隔离文档'}).click();
  await selectABC();
  const held=await point(code.getByText('ABC',{exact:true}),1);
  await page.mouse.move(held.x,held.y); await page.mouse.down();
  await page.mouse.move(held.x+12,held.y+12,{steps:3});
  await page.getByText('接收位置',{exact:true}).waitFor({state:'visible'});
  const changedSource=await read();
  const destination=await point(page.getByText('接收位置',{exact:true}),4);
  await page.mouse.move(destination.x,destination.y,{steps:15});
  await page.mouse.move(destination.x+1,destination.y); await page.mouse.up();
  await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
  await shot('08-stale-document-drop');
  assert.equal(await read(),changedSource,'Old drag cannot insert into newly opened document');
  await page.locator('#editor > .cm-editor > .cm-scroller > .cm-content').click();
  await page.keyboard.press('Control+z');
  assert.equal(await read(),changedSource,'Undo in the new document cannot restore the old document');
  console.log('Stale drag across document replacement rejected; new document undo remains isolated.');
  // Load the complete renderer inside the isolated fixture, still using a fresh
  // browser context and a synthetic new document, never a disk file.
  await page.goto(server.resolvedUrls.local[0]+'tests/fixtures/app-drag-audit.html');
  const app=page.frameLocator('iframe');
  await app.getByRole('button',{name:'新建文档',exact:true}).click();
  await app.getByRole('button',{name:'源码',exact:true}).click();
  const appSource='前文\n\n```text\nABC\nDEF\n```\n\n后文\n\n结束';
  await app.getByRole('textbox').fill(appSource);
  await app.getByRole('button',{name:'即时渲染',exact:true}).click();
  const appCode=app.getByRole('textbox',{name:'代码内容',exact:true});
  await appCode.getByText('ABC',{exact:true}).click(); await appCode.press('Home'); await appCode.press('Shift+End');
  const appFrom=await point(appCode.getByText('ABC',{exact:true}),1);
  const appTo=await point(app.getByLabel('Markdown 编辑器',{exact:true}).getByText('后文',{exact:true}),2);
  await page.mouse.move(appFrom.x,appFrom.y); await page.mouse.down();
  await page.mouse.move(appFrom.x+12,appFrom.y+12,{steps:3});
  await page.mouse.move(appTo.x,appTo.y,{steps:25});
  await page.mouse.move(appTo.x+1,appTo.y);
  assert.equal(await app.locator('#dropOverlay').isVisible(),false,'Text drag cannot activate the file-import overlay');
  await page.mouse.up();
  await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
  await app.getByRole('article').getByText('后文ABC',{exact:true}).waitFor({state:'visible'});
  await shot('09-full-app-move');
  await app.getByRole('button',{name:'源码',exact:true}).click();
  const readAppSource = async () => (await app.getByRole('textbox').locator('.cm-line').allTextContents()).join('\n');
  assert.equal(await readAppSource(),appSource.replace('ABC\n','\n').replace('后文','后文ABC'));
  await app.getByRole('textbox').press('Control+z');
  assert.equal(await readAppSource(),appSource);
  console.log('Full application text move and undo passed; file-import overlay remains hidden.');
  assert.deepEqual(errors,[]);
  assert.ok(results.every(result=>result.pass),'Text moves must be single-step undoable and exact');
} finally { await browser?.close(); await server.close(); }
