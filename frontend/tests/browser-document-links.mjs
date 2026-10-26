import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import {createServer} from 'vite';
const playwright=createRequire(import.meta.url)(process.env.PLAYWRIGHT_MODULE||'playwright');
const server=await createServer({root:fileURLToPath(new URL('..',import.meta.url)),server:{host:'127.0.0.1',port:0,watch:null,hmr:false},logLevel:'error',plugins:[{
  name:'document-links-audit',enforce:'pre',transform(code,id){if(id.replaceAll('\\','/').endsWith('/src/renderer.js'))return code+'\nwindow.linkAudit={open:displayDocument,state,toggle:toggleEditor,mode:setEditorPresentation,view:()=>codeEditor};';}
}]});
let browser;
try {
  await server.listen();
  const engine=process.env.LINK_BROWSER||'chromium';
  browser=await playwright[engine].launch({headless:true,...(engine==='chromium'?{executablePath:process.env.BROWSER_EXECUTABLE||undefined}:{})});
  const page=await browser.newPage({viewport:{width:1400,height:900}}),errors=[],popups=[];
  page.on('pageerror',error=>errors.push(error.message));page.on('popup',p=>popups.push(p));
  await page.route('**/*',route=>new URL(route.request().url()).hostname==='127.0.0.1'?route.continue():route.abort());
  await page.goto(server.resolvedUrls.local[0]);await page.waitForFunction(()=>window.linkAudit&&window.quilliteMarkdown);
  const initialURL=page.url();
  await page.evaluate(()=>{
    window.linkCalls={local:[],external:[]};
    window.sourceDoc={path:'C:/知识库/首页.md',name:'首页.md',directory:'C:/知识库',content:'# 首页\n\n[中文](04_综合知识/02_网络新技术.md#章节二)\n\n[缺失](missing.md)\n\n[网页](https://example.com/help)\n\n[不支持](file.exe)\n\n[页内](#本页章节)\n\n'+('正文\n\n'.repeat(30))+'## 本页章节\n\n'+('结尾\n\n'.repeat(20))};
    window.targetDoc={path:'C:/知识库/04_综合知识/02_网络新技术.md',name:'02_网络新技术.md',directory:'C:/知识库/04_综合知识',content:'# 网络新技术\n\n[返回](../首页.md)\n\n'+('正文\n\n'.repeat(30))+'## 章节二\n\n'+('结尾\n\n'.repeat(20))};
    window.quilliteMarkdown.openRecentFile=async path=>{
      linkCalls.local.push(path);
      if(path===sourceDoc.path)return {...sourceDoc};
      if(path===targetDoc.path)return {...targetDoc};
      throw new Error('DOCUMENT_NOT_FOUND');
    };
    window.quilliteMarkdown.openExternal=async url=>{linkCalls.external.push(url);};
    window.quilliteMarkdown.canEditFile=async()=>true;
    window.quilliteMarkdown.reportErrorLog=async()=>{};
    linkAudit.open({...sourceDoc});
  });
  const reader=page.locator('#markdownContent');
  await reader.getByRole('link',{name:'中文',exact:true}).click();
  await page.waitForFunction(()=>linkAudit.state.currentFile.path===targetDoc.path);
  assert.deepEqual(await page.evaluate(()=>linkCalls.local),['C:/知识库/04_综合知识/02_网络新技术.md']);
  await page.waitForFunction(()=>document.querySelector('.reader-pane').scrollTop>500);
  await reader.getByRole('link',{name:'返回',exact:true}).click();
  await page.waitForFunction(()=>linkAudit.state.currentFile.path===sourceDoc.path);
  await reader.getByRole('link',{name:'页内',exact:true}).click();
  await page.waitForFunction(()=>document.querySelector('.reader-pane').scrollTop>500);
  await reader.getByRole('link',{name:'网页',exact:true}).click();
  assert.deepEqual(await page.evaluate(()=>linkCalls.external),['https://example.com/help']);
  await reader.getByRole('link',{name:'缺失',exact:true}).click();
  await page.waitForFunction(()=>linkCalls.local.includes('C:/知识库/missing.md'));
  assert.equal(await page.evaluate(()=>linkAudit.state.currentFile.path),'C:/知识库/首页.md');
  await reader.getByRole('link',{name:'不支持',exact:true}).click();
  assert.equal(page.url(),initialURL);
  // Preview links must retain unsaved editor text when leaving is declined.
  await page.evaluate(async()=>{await linkAudit.toggle(true);linkAudit.mode('source');const v=linkAudit.view();v.dispatch({changes:{from:v.state.doc.length,insert:'\n未保存内容'}});});
  let prompts=0;page.on('dialog',async dialog=>{prompts++;await dialog.dismiss();});
  const before=await page.evaluate(()=>linkCalls.local.length);
  await page.locator('#editorPreviewContent').getByRole('link',{name:'中文',exact:true}).click();
  await page.waitForTimeout(150);
  assert.equal(prompts,1);assert.equal(await page.evaluate(()=>linkCalls.local.length),before);
  assert.ok(await page.evaluate(()=>linkAudit.view().state.doc.toString().includes('未保存内容')));
  // Clean preview and middle-click routes to the same in-app loader.
  await page.evaluate(async()=>{linkAudit.open({...sourceDoc});await linkAudit.toggle(true);linkAudit.mode('source');});
  await page.locator('#editorPreviewContent').getByRole('link',{name:'中文',exact:true}).click({button:'middle'});
  await page.waitForFunction(()=>linkAudit.state.currentFile.path===targetDoc.path);
  assert.equal(page.url(),initialURL);assert.equal(popups.length,0);assert.deepEqual(errors,[]);
  console.log(`PASS ${engine}: local Chinese paths, parent links, fragments, missing/unsupported targets, web links, unsaved preview cancellation and middle-click without browser navigation`);
} finally {await browser?.close();await server.close();}
