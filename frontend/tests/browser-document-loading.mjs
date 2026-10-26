import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import {createServer} from 'vite';
const pw=createRequire(import.meta.url)(process.env.PLAYWRIGHT_MODULE||'playwright');
const engine=process.env.BROWSER_ENGINE||'chromium';
const server=await createServer({root:fileURLToPath(new URL('..',import.meta.url)),server:{host:'127.0.0.1',port:0,watch:null,hmr:false},logLevel:'error',plugins:[{
 name:'loading-audit',enforce:'pre',transform(code,id){if(id.replaceAll('\\','/').endsWith('/src/renderer.js'))return code+`\nwindow.loadingAudit={load:loadFile,close:closePreview,source:()=>state.currentFile?.content,language:value=>state.language=value,edit:()=>toggleEditor(true),type:()=>codeEditor.dispatch({changes:{from:codeEditor.state.doc.length,insert:'UNSAVED_KEEP'}}),editorSource:()=>codeEditor.state.doc.toString()};`;}
}]});
let browser;
try{
 await server.listen();browser=await pw[engine].launch({headless:true,...(engine==='chromium'?{executablePath:process.env.BROWSER_EXECUTABLE||undefined}:{})});
 const page=await browser.newPage({viewport:{width:1400,height:900}}),errors=[];
 page.on('pageerror',e=>errors.push(e.message));
 await page.route('**/*',r=>new URL(r.request().url()).hostname==='127.0.0.1'?r.continue():r.abort());
 await page.goto(server.resolvedUrls.local[0]);await page.waitForFunction(()=>window.loadingAudit);
 await page.evaluate(()=>{
  window.quilliteMarkdown.reportErrorLog=async()=>{};
  window.pendingReads={};window.quilliteMarkdown.openRecentFile=path=>new Promise((resolve,reject)=>{window.pendingReads[path]={resolve,reject};});
  window.doc=(name,content='# '+name)=>({path:name+'.md',name:name+'.md',directory:'.',content,revision:'a'.repeat(64)});
 });
 const begin=path=>page.evaluate(path=>{window.loadPromise=window.loadingAudit.load(path);},path);
 const resolve=(path,name)=>page.evaluate(({path,name})=>window.pendingReads[path].resolve(window.doc(name)),{path,name});
 const complete=()=>page.evaluate(()=>window.loadPromise);
 await begin('old');await resolve('old','Old');await complete();
 await begin('slow');
 assert.equal(await page.locator('.document-loading').evaluate(el=>getComputedStyle(el).opacity),'0');
 await page.waitForFunction(()=>getComputedStyle(document.querySelector('.document-loading')).opacity==='1');
 assert.equal(await page.locator('#markdownContent h1').textContent(),'Old','previous content stays intact while reading');
 const before=await page.locator('.document-loading-spinner').evaluate(el=>getComputedStyle(el).transform);
 await page.waitForTimeout(120);
 assert.notEqual(await page.locator('.document-loading-spinner').evaluate(el=>getComputedStyle(el).transform),before);
 await page.locator('.document-loading-hint:not([hidden])').waitFor();
 assert.match(await page.locator('.document-loading-hint').textContent(),/请稍候/);
 assert.equal(await page.locator('.reader-pane').getAttribute('aria-busy'),'true');
 if(process.env.LOADING_SCREENSHOT)await page.screenshot({path:process.env.LOADING_SCREENSHOT});
 await resolve('slow','Slow');await complete();
 assert.equal(await page.locator('.document-loading').isHidden(),true);
 assert.equal(await page.locator('.reader-pane').getAttribute('aria-busy'),null);
 // Latest request wins even when the old response arrives after the new one.
 await begin('stale');await begin('latest');await resolve('latest','Latest');await complete();
 await resolve('stale','Stale');await page.waitForTimeout(150);
 assert.equal(await page.locator('#markdownContent h1').textContent(),'Latest');
 assert.equal(await page.locator('.document-loading').isHidden(),true);
 // Closing during an outstanding read must not resurrect its document.
 await begin('closed');await page.evaluate(()=>window.loadingAudit.close());await resolve('closed','Closed');await complete();
 assert.equal(await page.locator('.document-loading').isHidden(),true);assert.equal(await page.evaluate(()=>window.loadingAudit.source()),undefined);
 await begin('failure');await page.waitForTimeout(350);await page.evaluate(()=>window.pendingReads.failure.reject(Error('synthetic failure')));await complete();
 assert.equal(await page.locator('.document-loading').isHidden(),true);
 // Actual synchronous Markdown preparation, not a simulated timer delay.
 await page.evaluate(()=>{
  window.paintStates=[];const overlay=document.querySelector('.document-loading');
  window.observer=new MutationObserver(()=>window.paintStates.push({hidden:overlay.hidden,phase:overlay.textContent}));
  window.observer.observe(overlay,{attributes:true,subtree:true,childList:true});
  window.quilliteMarkdown.openRecentFile=async()=>window.doc('Large','# Large\n\n'+('正文 paragraph '.repeat(40)+'\n\n').repeat(16000)+'\n\n## COMPLETE_END');
 });
 await page.evaluate(()=>window.loadingAudit.load('large'));
 assert.equal(await page.locator('#markdownContent h2').textContent(),'COMPLETE_END');
 assert.ok(await page.evaluate(()=>window.paintStates.some(s=>!s.hidden&&s.phase.includes('处理'))));
 assert.equal(await page.locator('.document-loading').isHidden(),true);
 await page.evaluate(()=>{window.observer.disconnect();window.loadingAudit.language('en');window.quilliteMarkdown.openRecentFile=()=>new Promise(resolve=>window.resolveEnglish=resolve);});
 await begin('english');await page.waitForFunction(()=>document.querySelector('.document-loading').textContent.includes('Opening document'));
 await page.waitForTimeout(350);assert.match(await page.locator('.document-loading').textContent(),/Opening document/);
 await page.emulateMedia({reducedMotion:'reduce'});
 assert.equal(await page.locator('.document-loading-spinner').evaluate(el=>getComputedStyle(el).animationName),'none');
 await page.evaluate(()=>window.resolveEnglish(null));await complete();
 assert.equal(await page.locator('.document-loading').isHidden(),true);assert.deepEqual(errors,[]);
 await page.evaluate(async()=>{
  window.quilliteMarkdown.canEditFile=async()=>true;
  window.quilliteMarkdown.openRecentFile=async()=>window.doc('Editable','# Editable\n\n'+'paragraph '.repeat(11000));
  await window.loadingAudit.load('editable');await window.loadingAudit.edit();
  window.quilliteMarkdown.openRecentFile=()=>new Promise(resolve=>window.resolvePendingEdit=resolve);
  window.confirmations=0;window.confirm=()=>{window.confirmations++;return false;};
  window.loadPromise=window.loadingAudit.load('other');window.loadingAudit.type();
  window.resolvePendingEdit(window.doc('MustNotReplace'));await window.loadPromise;
 });
 assert.ok(await page.evaluate(()=>window.confirmations>0));
 assert.ok((await page.evaluate(()=>window.loadingAudit.editorSource())).endsWith('UNSAVED_KEEP'));
 assert.equal(await page.locator('.document-loading').isHidden(),true);assert.deepEqual(errors,[]);
 console.log('PASS',engine,'delayed indicator, animation, long wait, complete large rendering, latest request, close/error cleanup, bilingual/reduced motion');
}finally{await browser?.close();await server.close();}
