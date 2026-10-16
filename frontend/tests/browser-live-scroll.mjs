import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';
import { readFile } from 'node:fs/promises';
import { buildLivePlan } from '../src/editor-live-preview.js';
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const server = await createServer({ root: fileURLToPath(new URL('..', import.meta.url)), server: { host: '127.0.0.1', port: 0, watch: null, hmr: false }, logLevel: 'error' });
await server.listen();
const browser = await chromium.launch({ headless: true, executablePath: process.env.BROWSER_EXECUTABLE || undefined });
try {
  const page = await browser.newPage({viewport:{width:1440,height:950}});
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  const startTrace=()=>page.evaluate(()=>{
    window.scrollWrites=[];window.frameTops=[];
    const original=Object.getOwnPropertyDescriptor(Element.prototype,'scrollTop');
    Object.defineProperty(Element.prototype,'scrollTop',{...original,set(value){if(this===liveAudit.view.scrollDOM)scrollWrites.push({old:original.get.call(this),value});original.set.call(this,value);}});
    const frame=()=>{frameTops.push(document.querySelector('.cm-live-code').getBoundingClientRect().top);window.scrollFrame=requestAnimationFrame(frame);};
    window.scrollFrame=requestAnimationFrame(frame);
  });
  const checkTrace=async(top,phase)=>{
    const trace=await page.evaluate(()=>{cancelAnimationFrame(scrollFrame);return {writes:scrollWrites,tops:frameTops};});
    assert.ok(trace.writes.every(item=>Math.abs(item.value-item.old)<2),`${phase}: transient scroll jump ${JSON.stringify(trace.writes)}`);
    assert.ok(trace.tops.every(value=>Math.abs(value-top)<2),`${phase}: frame position changed`);
  };
  await page.goto(server.resolvedUrls.local[0]+'tests/fixtures/live-editing-audit.html');
  await page.waitForFunction(()=>window.liveAudit);
  const prefix = '# Heading\n\n| 字段 | 说明 |\n| --- | --- |\n' + Array.from({length:12},(_,i)=>`| 字段 ${i} | 中文说明 ${i} |`).join('\n')+'\n\n' + Array.from({length:20},(_,i)=>`段落 ${i}\n\n`).join('');
  const code = ['ERP                              运营平台                            阿里云',...Array.from({length:Number(process.env.SCROLL_CODE_LINES || 18)},(_,i)=>` |---POST /api/File/CreateUploadVideo ${String(i).padStart(2,'0')}---->|                      |`)];
  const doc=process.env.SCROLL_DOCUMENT ? await readFile(process.env.SCROLL_DOCUMENT,'utf8') : prefix+'```text\n'+code.join('\n')+'\n```\n\n## Following\n\n'+('After\n\n'.repeat(30));
  const codeStart=buildLivePlan(doc).widgets.find(item=>item.kind==='code').contentFrom;
  await page.evaluate(({doc,codeStart})=>{const v=liveAudit.view;v.dispatch({changes:{from:0,to:v.state.doc.length,insert:doc},selection:{anchor:codeStart},scrollIntoView:true});},{doc,codeStart});
  await page.locator('.cm-live-code').first().scrollIntoViewIfNeeded();
  // Place the last code row inside the editor viewport, including clipped blocks.
  await page.evaluate(()=>{const outer=liveAudit.view.scrollDOM,block=document.querySelector('.cm-live-code'),r=block.getBoundingClientRect(),p=outer.getBoundingClientRect();outer.scrollTop+=r.bottom-p.bottom+60;});
  await page.waitForTimeout(150);
  const position=await page.locator('.cm-live-code').first().locator('.cm-line').last().evaluate(node=>{const r=node.getBoundingClientRect();return {x:r.left+350,y:r.top+r.height/2};});
  const metric=()=>page.evaluate(()=>{
    const block=document.querySelector('.cm-live-code'),inner=block.querySelector('.cm-content');
    return {top:block.getBoundingClientRect().top,height:block.getBoundingClientRect().height,outer:liveAudit.view.scrollDOM.scrollTop,inner:inner.parentElement.scrollTop,body:window.scrollY,active:document.activeElement.getAttribute('aria-label')};
  });
  const before=await metric();
  await startTrace();
  await page.mouse.click(position.x,position.y);await page.waitForTimeout(150);
  const clicked=await metric();
  await page.keyboard.type('abc',{delay:100});await page.waitForTimeout(150);
  const typed=await metric();
  console.log({before,clicked,typed});
  await checkTrace(before.top,'fixture');
  assert.ok(Math.abs(before.top-clicked.top)<2,'click should not scroll the code block');
  assert.ok(Math.abs(clicked.top-typed.top)<2,'typing should not move the code block');
  await page.goto(server.resolvedUrls.local[0]);
  await page.waitForFunction(()=>window.quilliteMarkdown && document.querySelector('#fileList')?.childElementCount);
  await page.evaluate(doc=>Object.assign(window.quilliteMarkdown,{
    openFile:async()=>({path:'/scroll.md',name:'scroll.md',directory:'/',content:doc,revision:'a'.repeat(64)}),canEditFile:async()=>true,
    saveFile:async(path,content)=>({path,name:'scroll.md',directory:'/',content,revision:'b'.repeat(64)}),
  }),doc);
  await page.locator('#openFileButton').click();await page.locator('#editButton').click();
  await page.locator('#hideLivePreviewButton').click();
  await page.evaluate(async codeStart=>{
    const {EditorView}=await import('/node_modules/@codemirror/view/dist/index.js');
    window.liveAudit={view:EditorView.findFromDOM(document.querySelector('#markdownEditor > .cm-editor'))};
    const v=liveAudit.view;v.dispatch({selection:{anchor:codeStart},scrollIntoView:true});
  },codeStart);
  await page.locator('.cm-live-code').first().scrollIntoViewIfNeeded();
  await page.evaluate(()=>{const outer=liveAudit.view.scrollDOM,block=document.querySelector('.cm-live-code'),r=block.getBoundingClientRect(),p=outer.getBoundingClientRect();outer.scrollTop+=r.bottom-p.bottom+180;});
  await page.waitForTimeout(150);
  const appPosition=await page.locator('.cm-live-code').first().locator('.cm-line').last().evaluate(node=>{const r=node.getBoundingClientRect();return {x:r.left+350,y:r.top+r.height/2};});
  const appBefore=await metric();
  await startTrace();
  await page.mouse.click(appPosition.x,appPosition.y);await page.waitForTimeout(150);
  const appClicked=await metric();
  await page.keyboard.type('abc',{delay:100});await page.waitForTimeout(150);
  const appTyped=await metric();
  console.log({appBefore,appClicked,appTyped});
  await checkTrace(appBefore.top,'app');
  assert.ok(Math.abs(appBefore.top-appClicked.top)<2,'app click should not scroll the code block');
  assert.ok(Math.abs(appClicked.top-appTyped.top)<2,'app typing should not move the code block');
  assert.deepEqual(errors,[]);
  console.log('PASS: code caret placement and typing stay stable across animation frames and scroll writes');
} finally {await browser.close();await server.close();}
