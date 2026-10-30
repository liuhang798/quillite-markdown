// Runs against a freshly built production frontend, never user documents.
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import {preview} from 'vite';
const playwright=createRequire(import.meta.url)(process.env.PLAYWRIGHT_MODULE||'playwright');
const engine=process.env.ISSUE14_BROWSER||'chromium';
const server=await preview({root:fileURLToPath(new URL('..',import.meta.url)),preview:{host:'127.0.0.1',port:0},logLevel:'error'});
let browser;
try {
 browser=await playwright[engine].launch({headless:true,...(engine==='chromium'&&process.env.BROWSER_EXECUTABLE?{executablePath:process.env.BROWSER_EXECUTABLE}:{})});
 const page=await browser.newPage({viewport:{width:1366,height:768}});
 const errors=[];page.on('pageerror',error=>errors.push(error.message));
 await page.route('**/*',route=>new URL(route.request().url()).hostname==='127.0.0.1'?route.continue():route.abort());
 await page.addInitScript(()=>{localStorage.setItem('language','zh-CN');localStorage.setItem('editorPresentation','source');localStorage.setItem('editorLayout','preview-left');});
 await page.goto(server.resolvedUrls.local[0]);
 await page.waitForFunction(()=>window.quilliteMarkdown&&document.querySelector('#fileList')?.childElementCount);
 const doc='# Issue 14\n\n'+Array.from({length:25},(_,i)=>'段落 '+(i+1)+' 用于验证预览同步。\n\n').join('')+'## 长代码块\n\n~~~text\n'+Array.from({length:100},(_,i)=>'CODE_LINE_'+String(i+1).padStart(3,'0')).join('\n')+'\n~~~\n\n'+('很长的连续文字'.repeat(160))+'WRAPPED_END\n\n结尾\n';
 await page.evaluate(doc=>Object.assign(window.quilliteMarkdown,{
  openFile:async()=>({path:'/issue14.md',name:'issue14.md',directory:'/',content:doc,revision:'a'.repeat(64)}),canEditFile:async()=>true,
 }),doc);
 await page.locator('#openFileButton').click();await page.waitForFunction(()=>!document.querySelector('#editButton').disabled);
 await page.locator('#editButton').click();await page.locator('.cm-editor').first().waitFor();
 if(await page.locator('#restoreLivePreviewButton').isVisible())await page.locator('#restoreLivePreviewButton').click();
 if(await page.evaluate(()=>document.body.dataset.editorLayout!=='preview-left'))await page.locator('#swapEditorLayoutButton').click();
 await page.locator('#collapseSidebar').click();
 const overlap=()=>page.evaluate(()=>{
  const b=document.querySelector('#expandSidebar').getBoundingClientRect();
  const selector=document.body.dataset.editorLayout==='preview-left'?'.split-pane-header>div:first-child':'.editor-header>div:first-child';
  const r=document.querySelector(selector).getBoundingClientRect();
  return Math.min(b.right,r.right)>Math.max(b.left,r.left)&&Math.min(b.bottom,r.bottom)>Math.max(b.top,r.top);
 });
 for(const width of [1366,1000,800]){
  await page.setViewportSize({width,height:768});
  for(let i=0;i<2;i++){
   await page.waitForTimeout(150);assert.equal(await overlap(),false,'collapsed sidebar opener overlaps header');
   await page.locator('#swapEditorLayoutButton').click();
  }
 }
 await page.locator('#hideLivePreviewButton').click();await page.waitForTimeout(100);assert.equal(await overlap(),false);
 await page.locator('#restoreLivePreviewButton').click();
 await page.setViewportSize({width:1366,height:768});
 await page.evaluate(()=>{window.auditView=document.querySelector('.cm-content').cmTile.root.view;});
 const select=async text=>{
  await page.evaluate(text=>{const v=auditView,p=v.state.doc.toString().indexOf(text);v.dispatch({selection:{anchor:p},scrollIntoView:true});v.focus();},text);
  await page.waitForTimeout(200);
 };
 const visible=text=>page.evaluate(text=>{
  const host=document.querySelector('.editor-preview-content'),s=document.querySelector('.editor-preview-scroll').getBoundingClientRect();
  const walker=document.createTreeWalker(host,NodeFilter.SHOW_TEXT);
  for(let n;(n=walker.nextNode());)if(n.textContent.includes(text)){
   const i=n.textContent.indexOf(text),range=document.createRange();range.setStart(n,i);range.setEnd(n,i+text.length);
   const r=range.getBoundingClientRect();return r.top>=s.top&&r.bottom<=s.bottom;
  }
  return false;
 },text);
 await select('段落 25');assert.ok(await visible('段落 25'));
 const top=await page.locator('.editor-preview-scroll').evaluate(el=>el.scrollTop);
 await page.keyboard.press('ArrowRight');assert.equal(await page.locator('.editor-preview-scroll').evaluate(el=>el.scrollTop),top,'visible cursor should not jump');
 await page.locator('.editor-preview-scroll').evaluate(el=>el.scrollTo({top:0,behavior:'instant'}));
 await page.waitForTimeout(200);await page.keyboard.press('ArrowRight');await page.waitForTimeout(200);
 assert.ok(await visible('段落 25'),'same-line movement must recover after manual preview scrolling');
 // Clicking the current line can leave the selection unchanged: pointerup must
 // still bring the preview back without editing or affecting undo history.
 await page.locator('.editor-preview-scroll').evaluate(el=>el.scrollTo({top:0,behavior:'instant'}));
 await page.locator('.cm-line').filter({hasText:'段落 25'}).click();await page.waitForTimeout(200);
 assert.ok(await visible('段落 25'),'source clicks must restore preview visibility');
 await select('CODE_LINE_095');assert.ok(await visible('CODE_LINE_095'),'long code line must be visible');
 await select('WRAPPED_END');assert.ok(await visible('WRAPPED_END'),'column inside wrapped paragraph must be visible');
 assert.equal(await page.evaluate(()=>auditView.state.doc.toString()),doc,'navigation changed document');
 await page.evaluate(()=>{window.quilliteMarkdown.checkForUpdates=async()=>({checked:true,available:true,manualInstallRequired:true,manualInstallReason:'windows-portable',manualInstallerUrl:'https://qm.ssssa.cn/#download',currentVersion:'3.0.2',latestVersion:'3.0.3'});});
 await page.locator('#moreButton').click();await page.locator('[data-action="check-update"]').click();
 await page.locator('#manualUpdateTitle').waitFor();
 assert.equal(await page.locator('#manualUpdateTitle').innerText(),'下载新版便携版');
 assert.equal(await page.locator('#applyUpdate').isVisible(),false);
 assert.match(await page.locator('#openUpdatePage').innerText(),/便携版/);
 assert.deepEqual(errors,[]);
 console.log('PASS '+engine+': sidebar layouts, same-line/click sync, code-line/wrapped-column sync, portable update guidance');
} finally {await browser?.close();await new Promise(resolve=>server.httpServer.close(resolve));}
