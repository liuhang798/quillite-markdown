// Isolated synthetic documents; real pointer and Chromium composition input.
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import {createServer} from 'vite';
const {chromium}=createRequire(import.meta.url)(process.env.PLAYWRIGHT_MODULE||'playwright');
const server=await createServer({root:fileURLToPath(new URL('..',import.meta.url)),server:{host:'127.0.0.1',port:0,watch:null,hmr:false},logLevel:'error'});
let browser,page;
try {
 await server.listen();browser=await chromium.launch({headless:true,executablePath:process.env.BROWSER_EXECUTABLE||undefined});
 page=await browser.newPage({viewport:{width:1500,height:950}});page.setDefaultTimeout(10000);
 const errors=[];page.on('pageerror',error=>errors.push(error.message));
 await page.goto(server.resolvedUrls.local[0]+'tests/fixtures/app-drag-audit.html');const app=page.frameLocator('iframe');
 await app.getByRole('button',{name:'新建文档',exact:true}).click();
 if(process.env.AUDIT_THEME==='dark')await app.locator('#colorModeButton').click();
 const editor=app.locator('#markdownEditor > .cm-editor'),content=editor.locator('> .cm-scroller > .cm-content');
 const read=()=>editor.evaluate(async el=>{const{EditorView}=await import('/node_modules/@codemirror/view/dist/index.js');const v=EditorView.findFromDOM(el),active=EditorView.findFromDOM(document.activeElement.closest('.cm-editor')||document.activeElement);return{doc:v.state.doc.toString(),head:v.state.selection.main.head,focus:active===v?'root':active?'inner':'none'};});
 const cdp=await page.context().newCDPSession(page);
 const body='只读审查当前 Git diff，不修改文件。\n重点检查业务回归、权限、异常分支、接口兼容、SQL、安全和测试缺口。\n只报告有明确证据的问题，并给出触发条件、文件位置和影响。';
 for(const long of [false,true]){
  const source=(long?Array.from({length:70},(_,i)=>'## Section '+i+'\n\nParagraph '+i+'\n\n').join(''):'')+'### 开始实施\n\n```text\n按确认后的计划小步修改。\n```\n\n### 审查改动\n\n```text\n'+body+'\n```\n\n### 最终验收\n\n验收内容';
  await app.getByRole('button',{name:'源码',exact:true}).click();await content.focus();await page.keyboard.press('Control+a');await page.keyboard.insertText(source);await page.keyboard.press('Control+End');await app.getByRole('button',{name:'即时渲染',exact:true}).click();
  const inner=editor.locator('.cm-live-code .cm-content').last();await inner.waitFor({state:'visible'});
  const line=inner.locator('.cm-line').first();await line.click({position:{x:210,y:10}});
  await page.waitForTimeout(100);let current=await read();assert.equal(current.focus,'inner');
  let expected=source,position=current.head;assert.ok(position>source.indexOf(body)&&position<source.indexOf(body)+body.length);
  for(const char of 'aaSSD'){
   await page.keyboard.type(char);expected=expected.slice(0,position)+char+expected.slice(position);position++;
   current=await read();assert.equal(current.doc,expected);assert.equal(current.focus,'inner');
  }
  await page.waitForTimeout(1500);
  await cdp.send('Input.imeSetComposition',{text:'f',selectionStart:1,selectionEnd:1});
  await cdp.send('Input.imeSetComposition',{text:'fa',selectionStart:2,selectionEnd:2});
  await cdp.send('Input.imeSetComposition',{text:"fa's",selectionStart:4,selectionEnd:4});
  await cdp.send('Input.insertText',{text:'发送'});await page.waitForTimeout(100);
  expected=expected.slice(0,position)+'发送'+expected.slice(position);position+=2;
  current=await read();assert.equal(current.doc,expected);assert.equal(current.focus,'inner');
  await editor.locator('.cm-live-code').last().hover();
  await editor.locator('.cm-live-code').last().getByRole('button',{name:'查看源码'}).click();
  current=await read();assert.equal(current.focus,'root');assert.equal(current.head,position,'source toggle retains clicked body caret');
  await page.keyboard.type('SSD');expected=expected.slice(0,position)+'SSD'+expected.slice(position);position+=3;
  current=await read();assert.equal(current.doc,expected,'source toggle types inside body');
  await editor.locator('.cm-live-source-line').first().hover();await editor.getByRole('button',{name:'返回渲染'}).click();
  // Repeated pointer placement at the card edge must not target hidden fences.
  const block=editor.locator('.cm-live-code').last();
  await editor.locator('.cm-live-heading').filter({hasText:'审查改动'}).click();
  await block.click({position:{x:5,y:5}});
  current=await read();
  await page.keyboard.type('SSD');
  current=await read();
  assert.equal(current.focus,'inner','card padding retains editable body ownership');
  for(const [xSide,ySide] of [[.5,0],[1,0],[0,1],[.5,1]]){
   await editor.locator('.cm-live-heading').filter({hasText:'审查改动'}).click();
   const box=await block.boundingBox();await block.click({position:{x:2+(box.width-4)*xSide,y:2+(box.height-4)*ySide}});
   const old=await read();await page.keyboard.type('X');const next=await read();
   assert.equal(next.doc,old.doc.slice(0,old.head)+'X'+old.doc.slice(old.head));
   assert.ok(old.head>=old.doc.indexOf('只读审查')&&old.head<=old.doc.indexOf('\n```\n\n### 最终验收'),'padding caret is inside body');
  }
  await line.click({position:{x:210,y:10}});
  const beforeDrift=await read();
  await editor.evaluate(async el=>{
   const {EditorView}=await import('/node_modules/@codemirror/view/dist/index.js');
   const view=EditorView.findFromDOM(el),block=el.querySelectorAll('.cm-live-code')[1];
   // Emulate a browser selection handoff to the outer contenteditable at the
   // noneditable widget boundary; text input below remains real browser input.
   view.contentDOM.focus({preventScroll:true});
   document.getSelection().collapse(block.parentNode,Array.prototype.indexOf.call(block.parentNode.childNodes,block));
  });
  await page.waitForTimeout(100);
  await editor.evaluate(async el=>{
   const {EditorView}=await import('/node_modules/@codemirror/view/dist/index.js');const view=EditorView.findFromDOM(el);
   const {livePreviewField}=await import('/src/editor-live-preview.js');const item=view.state.field(livePreviewField).plan.widgets.filter(w=>w.kind==='code').at(-1);
   // Deterministic replay of the outer DOM observer's lossy collapsed select.
   view.dispatch({selection:{anchor:item.from},userEvent:'select'});view.focus();
  });
  await page.keyboard.type('SSD');
  let afterDrift=beforeDrift.doc.slice(0,beforeDrift.head)+'SSD'+beforeDrift.doc.slice(beforeDrift.head);
  assert.equal((await read()).doc,afterDrift,'native selection handoff must not move input before opening fence');
  await cdp.send('Input.imeSetComposition',{text:"fa's",selectionStart:4,selectionEnd:4});
  await cdp.send('Input.insertText',{text:'发送'});await page.waitForTimeout(100);
  afterDrift=beforeDrift.doc.slice(0,beforeDrift.head)+'SSD发送'+beforeDrift.doc.slice(beforeDrift.head);
  assert.equal((await read()).doc,afterDrift);assert.equal((await read()).focus,'inner');
  assert.equal(await editor.locator('.cm-live-heading').filter({hasText:'最终验收'}).count(),1,'following heading remains prose');
  if(process.env.AUDIT_OUTPUT)await page.screenshot({path:process.env.AUDIT_OUTPUT+`/code-click-${long?'long':'short'}-${process.env.AUDIT_THEME||'light'}.png`});
  await page.keyboard.press('Control+z');const undone=(await read()).doc;assert.notEqual(undone,afterDrift);
  await page.keyboard.press('Control+Shift+KeyZ');assert.equal((await read()).doc,afterDrift,'redo restores only intended body input');
  console.log(`PASS ${long?'long':'short'} document: pointer placement, source toggle, composition, observer echo, fences, undo/redo`);
 }
 assert.deepEqual(errors,[]);
}catch(error){if(page&&process.env.AUDIT_OUTPUT)await page.screenshot({path:process.env.AUDIT_OUTPUT+'/failure.png'});throw error;}
finally{await browser?.close();await server.close();}
