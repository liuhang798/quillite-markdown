import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import {createServer} from 'vite';
const {chromium}=createRequire(import.meta.url)(process.env.PLAYWRIGHT_MODULE || 'playwright');
const server=await createServer({root:fileURLToPath(new URL('..',import.meta.url)),server:{host:'127.0.0.1',port:0,watch:null,hmr:false},logLevel:'error'});
let browser;
try {
  await server.listen();browser=await chromium.launch({headless:true,executablePath:process.env.BROWSER_EXECUTABLE || undefined});
  const page=await browser.newPage({viewport:{width:1280,height:1100}}),errors=[],results=[];
  page.on('pageerror',e=>errors.push(e.message));
  await page.route('**/*',r=>new URL(r.request().url()).hostname==='127.0.0.1'?r.continue():r.abort());
  await page.goto(server.resolvedUrls.local[0]+'tests/fixtures/app-drag-audit.html');
  const rich=page.getByLabel('隔离富文本',{exact:true});await rich.click();await rich.press('Control+a');await rich.press('Control+c');
  const app=page.frameLocator('iframe');await app.locator('body').evaluate(()=>import('/src/main.js'));await app.getByRole('button',{name:'新建文档',exact:true}).click();
  const point=(locator,offset)=>locator.evaluate((el,index)=>{const w=document.createTreeWalker(el,NodeFilter.SHOW_TEXT);let n;while((n=w.nextNode())){if(index<=n.length){const r=document.createRange();r.setStart(n,index);r.collapse(true);const b=r.getBoundingClientRect();return{x:b.x,y:b.y+b.height/2};}index-=n.length;}throw new Error('Missing text');},offset);
  const cases=[
    {name:'cross-code',source:'开头\n\n```text\nABC\nDEF\n```\n\n后文',label:'代码内容',text:'DEF',at:2,cross:true,expected:'开头\n\n```text\nABC\nDERich\nText\n```\n\n'},
    {name:'cross-quote-code',source:'开头\n\n> ```text\n> ABC\n> DEF\n> ```\n\n后文',label:'代码内容',text:'DEF',at:2,cross:true,expected:'开头\n\n> ```text\n> ABC\n> DERich\n> Text\n> ```\n\n'},
    {name:'details-body',source:'开头\n\n<details open>\n<summary>概要</summary>\n\nBODY\n\n</details>\n\n后文',label:'区块正文',text:'BODY',at:4,expected:'开头\n\n<details open>\n<summary>概要</summary>\n\nBODY**Rich**  \n*Text*\n\n</details>\n\n后文'},
    {name:'direct-code',source:'```text\nABC\nDEF\n```',label:'代码内容',text:'DEF',at:2,expected:'```text\nABC\nDERich\nTextF\n```'},
    {name:'source-code',source:'```text\nABC\nDEF\n```',sourceMode:true,text:'DEF',at:2,expected:'```text\nABC\nDERich\nTextF\n```'},
    {name:'nested-code',source:'<details open>\n<summary>概要</summary>\n\n```text\nABC\nDEF\n```\n\n</details>',label:'代码内容',text:'DEF',at:2,expected:'<details open>\n<summary>概要</summary>\n\n```text\nABC\nDERich\nTextF\n```\n\n</details>'},
    {name:'table-cell',source:'| 名称 | 数量 |\n| --- | --- |\n| BODY | 2 |',label:'表格单元格 2, 1',text:'BODY',at:4,expected:'| 名称 | 数量 |\n| --- | --- |\n| BODY**Rich**   *Text* | 2 |'},
    {name:'summary',source:'<details open>\n<summary>BODY</summary>\n\n后文\n\n</details>',label:'折叠标题',text:'BODY',at:4,expected:'<details open>\n<summary>BODYRich Text</summary>\n\n后文\n\n</details>'},
    {name:'prose',source:'BODY\n\n后文',text:'BODY',at:4,expected:'BODY**Rich**  \n*Text*\n\n后文'},
    {name:'inline-code',source:'正文 `BODY`\n\n后文',text:'BODY',at:2,expected:'正文 `BORich`\n`TextDY`\n\n后文'},
  ];
  for(const scenario of cases) {
    await app.getByRole('button',{name:'源码',exact:true}).click();await app.getByRole('textbox').fill(scenario.source);
    if(!scenario.sourceMode) await app.getByRole('button',{name:'即时渲染',exact:true}).click();
    const inner=scenario.label?app.getByRole('textbox',{name:scenario.label,exact:true}):app.getByRole('textbox'),a=await point(inner.getByText(scenario.text,{exact:true}),scenario.at);
    await page.mouse.click(a.x,a.y);
    if(scenario.cross) {const b=await point(app.getByLabel('Markdown 编辑器',{exact:true}).getByText('后文',{exact:true}),2);await page.keyboard.down('Shift');await page.mouse.click(b.x,b.y);await page.keyboard.up('Shift');}
    await page.keyboard.press('Control+v');await app.getByRole('article').getByText(/Rich/).first().waitFor({state:'visible'});
    if(['prose','details-body'].includes(scenario.name)) assert.equal(await app.getByRole('article').locator('br').count(),1,'Explicit clipboard line break must remain visible in reading preview');
    if(scenario.name==='inline-code')assert.deepEqual(await app.getByRole('article').locator('code').allTextContents(),['BORich','TextDY'],'Multiline literal paste stays in separate inline code spans, not a normalized single-space span');
    if(process.env.AUDIT_OUTPUT) await page.screenshot({path:`${process.env.AUDIT_OUTPUT}/${scenario.name}.png`});
    await app.getByRole('button',{name:'源码',exact:true}).click();
    const read=async()=>(await app.getByRole('textbox').locator('.cm-line').allTextContents()).join('\n');
    const actual=await read();await app.getByRole('textbox').press('Control+z');const undone=await read();
    results.push({name:scenario.name,actual,expected:scenario.expected,pass:actual===scenario.expected,undoExact:undone===scenario.source});console.log(JSON.stringify(results.at(-1)));
    await app.getByRole('button',{name:'即时渲染',exact:true}).click();
  }
  assert.deepEqual(errors,[]);assert.ok(results.every(r=>r.pass&&r.undoExact));
} finally {await browser?.close();await server.close();}
