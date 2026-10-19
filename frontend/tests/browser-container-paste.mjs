// Only synthetic documents in a fresh browser, as explicitly authorized.
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import {createServer} from 'vite';
const {chromium}=createRequire(import.meta.url)(process.env.PLAYWRIGHT_MODULE || 'playwright');
const server=await createServer({root:fileURLToPath(new URL('..',import.meta.url)),server:{host:'127.0.0.1',port:0,hmr:false,watch:null},logLevel:'error'});
let browser;
try {
  await server.listen();browser=await chromium.launch({headless:true,executablePath:process.env.BROWSER_EXECUTABLE || undefined});
  const page=await browser.newPage({viewport:{width:1280,height:1100}}), errors=[],results=[];
  page.on('pageerror',e=>errors.push(e.message));
  await page.route('**/*',r=>new URL(r.request().url()).hostname==='127.0.0.1'?r.continue():r.abort());
  await page.goto(server.resolvedUrls.local[0]+'tests/fixtures/live-editing-audit.html');
  const read=()=>page.getByLabel('当前源码',{exact:true}).textContent();
  const point=(locator,offset)=>locator.evaluate((el,index)=>{
    const walker=document.createTreeWalker(el,NodeFilter.SHOW_TEXT);let node;
    while((node=walker.nextNode())) {if(index<=node.length){const r=document.createRange();r.setStart(node,index);r.collapse(true);const b=r.getBoundingClientRect();return{x:b.x,y:b.y+b.height/2};}index-=node.length;}
    throw new Error('Text coordinate missing');
  },offset);
  const code=page.getByRole('textbox',{name:'Code content',exact:true});
  for(const [kind,prefix] of Object.entries({quote:'> ',list:'  ','quote-list':'>   ','list-quote':'  > ','nested-list':'    ',ordered:'     ',task:'  '})) {
    for(const action of ['out-paste','in-paste','out-fence','out-delete','in-delete']) {
      const literal=action==='out-fence'?'\n```\n尾部':'第一行\n第二行';
      const clip=page.getByLabel('隔离剪贴板文本',{exact:true});await clip.fill(literal);await clip.press('Control+a');await clip.press('Control+c');
      await page.getByLabel('拖放目标类型').selectOption(kind);await page.getByRole('button',{name:'加载容器代码样例'}).click();
      const original=await read(), inward=action.startsWith('in'), deletion=action.endsWith('delete');
      await code.scrollIntoViewIfNeeded();
      const a=await point(code.getByText(inward?'ABC':'DEF',{exact:true}),inward?1:2);
      const b=await point(page.getByText(inward?'开头':'后文',{exact:true}),inward?0:2);
      await page.mouse.move(a.x,a.y);await page.mouse.down();await page.mouse.move(b.x,b.y,{steps:25});await page.mouse.up();
      await page.keyboard.press(deletion?'Backspace':'Control+v');
      await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
      const actual=await read();
      if(process.env.AUDIT_OUTPUT) await page.screenshot({path:`${process.env.AUDIT_OUTPUT}/${kind}-${action}.png`});
      let expected;
      if(inward) {
        const headers={quote:'',list:'-\n','quote-list':'> -\n','list-quote':'-\n','nested-list':'-\n  -\n',ordered:'123.\n',task:'- [x]\n'};
        expected=(deletion?'':literal)+'\n\n'+headers[kind]+prefix+'```text\n'+prefix+original.slice(original.indexOf('ABC')+1);
      } else {
        const insert=deletion?'':literal.replaceAll('\n','\n'+prefix);
        expected=original.replace('DEF','DE'+insert).replace('后文','');
        if(action==='out-fence') expected=expected.replace('```text','````text').replace(prefix+'```\n\n',prefix+'````\n\n');
      }
      assert.equal(await code.count(),1,`${kind} ${action}: retained code must still render`);
      await page.keyboard.press('Control+z');const undo=await read();
      results.push({kind,action,actual,expected,pass:actual===expected,undoExact:undo===original});console.log(JSON.stringify(results.at(-1)));
    }
  }
  const clip=page.getByLabel('隔离剪贴板文本',{exact:true});await clip.fill('第一行\n第二行');await clip.press('Control+a');await clip.press('Control+c');
  await page.goto(server.resolvedUrls.local[0]+'tests/fixtures/app-drag-audit.html');
  const app=page.frameLocator('iframe');await app.locator('body').evaluate(()=>import('/src/main.js'));await app.getByRole('button',{name:'新建文档',exact:true}).click();
  for(const kind of ['quote','nested-list']) {
    await app.getByRole('button',{name:'源码',exact:true}).click();
    const prefix=kind==='quote'?'> ':'    ',intro=kind==='quote'?'':'- 外层\n  - 内层\n\n';
    const original='开头\n\n'+intro+['```text','ABC','DEF','```'].map(line=>prefix+line).join('\n')+'\n\n后文';
    await app.getByRole('textbox').fill(original);await app.getByRole('button',{name:'即时渲染',exact:true}).click();
    const editor=app.getByLabel('Markdown 编辑器',{exact:true}),inner=app.getByRole('textbox',{name:'代码内容',exact:true});
    const inward=kind==='nested-list';
    const a=await point(inner.getByText(inward?'ABC':'DEF',{exact:true}),inward?1:2);
    const b=await point(editor.getByText(inward?'开头':'后文',{exact:true}),inward?0:2);
    await page.mouse.move(a.x,a.y);await page.mouse.down();await page.mouse.move(b.x,b.y,{steps:25});await page.mouse.up();await page.keyboard.press('Control+v');
    await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
    assert.equal(await inner.count(),1);
    const previewCode=app.getByRole('article').locator('pre code'), visibleCode=inward?'BC\nDEF':'ABC\nDE第一行\n第二行';
    // The reading pane refresh is deliberately debounced; capture only after
    // its visible text catches up, not during the old-preview transition.
    for(let attempt=0;attempt<40 && (await previewCode.textContent()).trim()!==visibleCode;attempt++) await page.waitForTimeout(50);
    assert.equal((await previewCode.textContent()).trim(),visibleCode,'Reading preview and live editor must agree');
    if(process.env.AUDIT_OUTPUT) await page.screenshot({path:`${process.env.AUDIT_OUTPUT}/app-${kind}.png`});
    await app.getByRole('button',{name:'源码',exact:true}).click();
    const readApp=async()=>(await app.getByRole('textbox').locator('.cm-line').allTextContents()).join('\n');
    const expected=inward?'第一行\n第二行\n\n-\n  -\n    ```text\n    BC\n    DEF\n    ```\n\n后文':original.replace('DEF','DE第一行\n> 第二行').replace('后文','');
    assert.equal(await readApp(),expected);await app.getByRole('textbox').press('Control+z');assert.equal(await readApp(),original);
    await app.getByRole('button',{name:'即时渲染',exact:true}).click();
    console.log(`Full application ${kind} native clipboard and undo passed.`);
  }
  assert.deepEqual(errors,[]);assert.ok(results.every(r=>r.pass&&r.undoExact),'Cross-container clipboard and deletion must retain structure and single undo');
} finally {await browser?.close();await server.close();}
