import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';
const {chromium}=createRequire(import.meta.url)(process.env.PLAYWRIGHT_MODULE || 'playwright');
const server=await createServer({root:fileURLToPath(new URL('..',import.meta.url)),server:{host:'127.0.0.1',port:0,watch:null,hmr:false},logLevel:'error'});
let browser;
try {
  await server.listen();browser=await chromium.launch({headless:true,executablePath:process.env.BROWSER_EXECUTABLE || undefined});
  const page=await browser.newPage({viewport:{width:1280,height:1100}}),errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  await page.goto(server.resolvedUrls.local[0]+'tests/fixtures/live-editing-audit.html');
  const read=()=>page.getByLabel('当前源码',{exact:true}).textContent();
  const code=page.getByRole('textbox',{name:'Code content',exact:true});
  const shot=async name=>{if(process.env.AUDIT_OUTPUT)await page.screenshot({path:`${process.env.AUDIT_OUTPUT}/${name}.png`});};
  const point=async(locator,offset)=>{
    await locator.scrollIntoViewIfNeeded();
    return locator.evaluate((el,index)=>{const w=document.createTreeWalker(el,NodeFilter.SHOW_TEXT);let n;while((n=w.nextNode())){if(index<=n.length){const r=document.createRange();r.setStart(n,index);r.collapse(true);const b=r.getBoundingClientRect();return{x:b.x,y:b.y+b.height/2};}index-=n.length;}throw new Error('Missing text');},offset);
  };
  const drag=async(a,b)=>{
    await page.mouse.move(a.x,a.y);await page.mouse.down();await page.mouse.move(a.x+7,a.y+7,{steps:3});
    await page.mouse.move(b.x,b.y,{steps:25});await page.mouse.move(b.x+1,b.y);await page.mouse.up();
    await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
  };
  const click=async(text,offset)=>{
    const locator=code.getByText(text,{exact:true});await locator.scrollIntoViewIfNeeded();
    const p=await locator.evaluate((el,index)=>{const w=document.createTreeWalker(el,NodeFilter.SHOW_TEXT);let n;while((n=w.nextNode())){if(index<=n.length){const r=document.createRange();r.setStart(n,index);r.collapse(true);const b=r.getBoundingClientRect();return{x:b.x,y:b.y+b.height/2};}index-=n.length;}throw new Error('Missing text');},offset);
    await page.mouse.click(p.x,p.y);
  };
  for(const [kind,prefix] of Object.entries({quote:'> ',list:'  ','quote-list':'>   ','list-quote':'  > ','nested-list':'    ',ordered:'     ',task:'  '})) {
    await page.getByLabel('拖放目标类型').selectOption(kind);await page.getByRole('button',{name:'加载容器代码样例'}).click();
    const original=await read();assert.equal(await code.count(),1);assert.equal(await code.innerText(),'ABC\nDEF');await shot(`${kind}-rendered`);
    await click('DEF',1);await page.keyboard.insertText('字');assert.equal(await read(),original.replace('DEF','D字EF'));
    await page.keyboard.press('Control+z');assert.equal(await read(),original);
    await click('DEF',1);await page.keyboard.press('Enter');await page.keyboard.insertText('NEW');
    assert.equal(await read(),original.replace('DEF','D\n'+prefix+'NEWEF'));await shot(`${kind}-newline`);
    await page.keyboard.press('Control+z');assert.equal(await read(),original);
    await click('DEF',0);await page.keyboard.press('Backspace');assert.equal(await read(),original.replace('ABC\n'+prefix+'DEF','ABCDEF'));
    await page.keyboard.press('Control+z');assert.equal(await read(),original);
    await page.getByRole('button',{name:'View source',exact:true}).click();assert.equal(await code.count(),0);
    await page.getByRole('button',{name:'Return to rendered view',exact:true}).click();assert.equal(await code.innerText(),'ABC\nDEF');assert.equal(await read(),original);
    await click('DEF',0);await page.keyboard.insertText('```\n');
    const widened=original.replace('```text','````text').replace('DEF\n'+prefix+'```','```\n'+prefix+'DEF\n'+prefix+'````');
    assert.equal(await read(),widened);assert.equal(await code.count(),1);await shot(`${kind}-fence`);
    await page.keyboard.press('Control+z');assert.equal(await read(),original);
    // Native pointer selection crosses hidden Markdown prefixes on both lines.
    await page.getByRole('button',{name:'加载容器代码样例'}).click();
    await drag(await point(code.getByText('ABC',{exact:true}),1),await point(code.getByText('DEF',{exact:true}),2));
    await page.keyboard.insertText('X');assert.equal(await read(),original.replace('ABC\n'+prefix+'DEF','AXF'));
    await page.keyboard.press('Control+z');assert.equal(await read(),original);
    // Selected literal code must not carry the hidden container prefix to prose.
    await click('ABC',1);await page.keyboard.down('Shift');
    const end=await point(code.getByText('DEF',{exact:true}),2);await page.mouse.click(end.x,end.y);await page.keyboard.up('Shift');
    await drag(await point(code.getByText('ABC',{exact:true}),2),await point(page.getByText('后文',{exact:true}),2));
    assert.equal(await read(),original.replace('ABC\n'+prefix+'DEF','AF').replace('后文','后文BC\nDE'));
    await shot(`${kind}-text-moved`);await page.keyboard.press('Control+z');assert.equal(await read(),original);
    // Cross-owner pointer selection keeps the retained fence and exact source coordinates.
    await page.getByRole('button',{name:'加载容器代码样例'}).click();
    await drag(await point(code.getByText('DEF',{exact:true}),2),await point(page.getByText('后文',{exact:true}),2));
    const selection=JSON.parse(await page.getByLabel('选区状态',{exact:true}).textContent());
    assert.equal(selection.anchor,original.indexOf('DEF')+2);assert.equal(selection.head,original.indexOf('后文')+2);
    await page.keyboard.insertText('X');assert.equal(await read(),original.replace('DEF','DEX').replace('后文',''));
    await shot(`${kind}-cross-selection`);await page.keyboard.press('Control+z');assert.equal(await read(),original);
    await click('ABC',1);await page.keyboard.down('Shift');
    const proseEnd=await point(page.getByText('后文',{exact:true}),2);await page.mouse.click(proseEnd.x,proseEnd.y);await page.keyboard.up('Shift');
    await page.keyboard.down('Control');
    await drag(await point(code.getByText('ABC',{exact:true}),2),await point(page.getByText('开头',{exact:true}),2));
    await page.keyboard.up('Control');
    assert.equal(await read(),original.replace('开头','开头BC\nDEF\n\n后文'));
    assert.equal(await code.locator('xpath=..').locator('.cm-selectionBackground').count(),0,'Original code cannot retain a stale painted selection after copying elsewhere');
    await shot(`${kind}-cross-copy`);await page.keyboard.press('Control+z');assert.equal(await read(),original);
    console.log(`${kind}: render, second-line typing, Enter, line join, source return, fence and undo passed.`);
  }
  await page.getByLabel('空代码块').check();await page.getByLabel('拖放目标类型').selectOption('quote');await page.getByRole('button',{name:'加载容器代码样例'}).click();
  const empty=await read();await code.click();await page.keyboard.insertText('空块');assert.equal(await read(),empty.replace('> ```text\n> ```','> ```text\n> 空块\n> ```'));
  await shot('empty-quote');await page.keyboard.press('Control+z');assert.equal(await read(),empty);
  assert.deepEqual(errors,[]);console.log('Empty quoted code input and undo passed.');
} finally {await browser?.close();await server.close();}
