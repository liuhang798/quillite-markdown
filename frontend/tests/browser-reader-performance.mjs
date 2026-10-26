// Synthetic documents, isolated browser profile, no external requests or writes.
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import {createServer} from 'vite';
const {chromium}=createRequire(import.meta.url)(process.env.PLAYWRIGHT_MODULE||'playwright');
const server=await createServer({root:fileURLToPath(new URL('..',import.meta.url)),server:{host:'127.0.0.1',port:0,watch:null,hmr:false},logLevel:'error',plugins:[{
 name:'isolated-reader-audit',enforce:'pre',transform(code,id){
  if(id.replaceAll('\\','/').endsWith('/src/renderer.js'))return code+'\nwindow.readerAudit={exportHTML:()=>cleanRenderedHTMLForExport(els.content),print:()=>printCurrentDocument(),cache:readerHTMLCache};';
 }
}]});
let browser;
try{
 await server.listen();browser=await chromium.launch({headless:true,executablePath:process.env.BROWSER_EXECUTABLE||undefined});
 const page=await browser.newPage({viewport:{width:1500,height:950}});
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.route('**/*',r=>new URL(r.request().url()).hostname==='127.0.0.1'?r.continue():r.abort());
 await page.goto(server.resolvedUrls.local[0]);
 await page.evaluate(async()=>{await import('/src/main.js');window.quilliteMarkdown.reportErrorLog=async()=>{};window.quilliteMarkdown.saveFile=async()=>{throw Error('unexpected write');};window.quilliteMarkdown.print=async()=>{window.printed=true;};});
 const source='# Large\n\n[reference][r]\n\n'+Array.from({length:100},(_,i)=>`## Section ${i}\n\n${'ordinary paragraph '.repeat(20)}\n\n\`\`\`javascript\nconst marker${i} = "needle${i}";\n${'console.log("safe");\n'.repeat(10)}\`\`\`\n\n| Name | Value |\n|---|---|\n| Row ${i} | Text |\n\n`).join('')+'## Last heading\n\nEnd[^n]\n\n[r]: https://example.com\n[^n]: Footnote [ref][r]';
 const open=async(text=source)=>{
  await page.evaluate(text=>{window.quilliteMarkdown.openFile=async()=>({path:'large.md',name:'large.md',directory:'.',content:text,revision:'a'.repeat(64)});},text);
  await page.locator('#openFileButton').click();
  await page.locator('.document-loading[hidden]').waitFor({state:'attached'});
  await page.locator('#markdownContent h1').waitFor();
 };
 await open();
 assert.equal(await page.locator('#markdownContent pre code').count(),100);
 assert.ok(await page.locator('#markdownContent code[data-reader-code]').count()>80,'offscreen code must not synchronously highlight');
 await page.waitForFunction(()=>document.querySelector('#markdownContent code .hljs-keyword'));
 assert.ok(await page.locator('#markdownContent .reader-deferred-layout').count()>=100);
 await page.locator('#toc a').filter({hasText:'Last heading'}).click();
 await page.waitForFunction(()=>{const a=[...document.querySelectorAll('#markdownContent h2')].at(-1).getBoundingClientRect(),b=document.querySelector('.reader-pane').getBoundingClientRect();return a.top>=b.top&&a.top<b.bottom;});
 assert.equal(await page.locator('#markdownContent .reader-deferred-layout').count(),0,'explicit navigation must use actual layout');
 await page.locator('#markdownContent pre code').last().scrollIntoViewIfNeeded();
 await page.waitForFunction(()=>[...document.querySelectorAll('#markdownContent pre code')].at(-1).querySelector('.hljs-keyword'));
 assert.ok((await page.locator('#markdownContent pre code').last().textContent()).includes('const marker99'));
 await page.locator('#searchButton').click();
 await page.locator('#searchInput').fill('needle99');
 await page.locator('#markdownContent mark.search-hit').waitFor();
 assert.equal(await page.locator('#markdownContent code[data-reader-code]').count(),0);
 const exported=await page.evaluate(()=>window.readerAudit.exportHTML());
 assert.ok(exported.includes('marker99')&&exported.includes('Last heading')&&exported.includes('Footnote'));
 assert.ok(!exported.includes('reader-deferred-layout')&&!exported.includes('data-reader-code'));
 await page.keyboard.press('Escape');
 await open('# Changed\n\n'+source.slice(source.indexOf('## Section')));
 assert.equal(await page.locator('#markdownContent h1').textContent(),'Changed','same path/revision but edited contents must invalidate');
 await open();
 assert.equal(await page.locator('#markdownContent h1').textContent(),'Large');
 assert.equal(await page.locator('#markdownContent a[href="https://example.com"]').count(),2);
 await page.evaluate(()=>window.readerAudit.print());
 assert.equal(await page.locator('#markdownContent code[data-reader-code]').count(),0);
 assert.equal(await page.evaluate(()=>window.printed),true);
 await open('# Small\n\nNo stale work');
 await page.waitForTimeout(100);
 assert.equal(await page.locator('#markdownContent pre').count(),0);
 assert.equal(await page.locator('#editorPreviewContent *').count(),0);
 assert.deepEqual(errors,[]);
 console.log('PASS: complete DOM, deferred/viewport highlighting, TOC positioning, full-text search, export/print completeness, cache invalidation, switch cancellation');
}finally{await browser?.close();await server.close();}
