// Isolated synthetic documents only; native exports and external traffic disabled.
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import {createServer} from 'vite';
const {chromium}=createRequire(import.meta.url)(process.env.PLAYWRIGHT_MODULE || 'playwright');
const server=await createServer({root:fileURLToPath(new URL('..',import.meta.url)),server:{host:'127.0.0.1',port:0,watch:null,hmr:false},logLevel:'error'});
let browser;
try {
 await server.listen();browser=await chromium.launch({headless:true,executablePath:process.env.BROWSER_EXECUTABLE||undefined});
 const page=await browser.newPage();
 await page.route('**/*',r=>new URL(r.request().url()).hostname==='127.0.0.1'?r.continue():r.abort());
 await page.goto(server.resolvedUrls.local[0]);
 await page.evaluate(async()=>{
  await import('/src/main.js');
  window.quilliteMarkdown.reportErrorLog=async()=>{};
  window.quilliteMarkdown.saveFile=async()=>{throw Error('unexpected save');};
  window.printCount=0;window.quilliteMarkdown.print=async()=>{window.printCount++;};
 });
 const open=async(name,text)=>{
  await page.evaluate(({name,text})=>{window.quilliteMarkdown.openFile=async()=>({path:name,name,directory:'.',content:text,revision:'a'.repeat(64)});},{name,text});
  await page.locator('#openFileButton').click();
 };
 await open('links.md','# Link test\n\n[**link**](https://example.com)\nhttps://example.com\n\n> [ref][r]\n\n[r]: https://example.com');
 await page.locator('#markdownContent a').first().waitFor();
 assert.equal(await page.locator('#markdownContent a').count(),3);
 await page.evaluate(()=>{const el=document.querySelector('#markdownContent');const descriptor=Object.getOwnPropertyDescriptor(Element.prototype,'innerHTML');let fail=true;Object.defineProperty(el,'innerHTML',{configurable:true,get(){return descriptor.get.call(this);},set(value){if(fail){fail=false;throw Error('synthetic render failure');}descriptor.set.call(this,value);}});});
 await open('failure.md','# Failure title\n\n[bad](https://example.com)');
 await page.locator('#markdownContent .preview-error').waitFor();
 assert.equal(await page.locator('#markdownContent h1').count(),0);
 assert.ok((await page.locator('#breadcrumb').innerText()).includes('failure.md'));
 assert.equal(await page.locator('#markdownContent').getByText('Link test').count(),0);
 await page.evaluate(()=>{delete document.querySelector('#markdownContent').innerHTML;});
 await open('recovered.md','# Recovered\n\n[ok](https://example.com)');
 await page.locator('#markdownContent a').waitFor();
 for(const [error,expected] of [['PDF_EXPORT_TIMEOUT',1],['PDF_EXPORT_FAILED: synthetic',2],['PDF_ENGINE_NOT_FOUND',3],['Access is denied.',3],['EXPORT_FILE_IN_USE',3]]){
  await page.evaluate(error=>{window.quilliteMarkdown.exportPDF=async()=>{throw Error(error);};document.querySelector('[data-action="export-center"]').click();},error);
  await page.locator('#exportCenterDialog').waitFor({state:'visible'});
  await page.locator('[data-export-format="pdf"]').click();
  await page.locator('#confirmExportCenter').click();
  await page.waitForFunction(()=>!document.querySelector('#confirmExportCenter').disabled);
  assert.equal(await page.evaluate(()=>window.printCount),expected,error);
  if(await page.locator('#exportCenterDialog').isVisible())await page.locator('#closeExportCenter').click();
 }
 await page.evaluate(()=>{window.quilliteMarkdown.exportPDF=()=>new Promise((resolve,reject)=>{window.rejectPDF=reject;});document.querySelector('#documentExportButton').click();});
 await page.locator('[data-export-format="pdf"]').click();
 await page.locator('#confirmExportCenter').click();
 await page.waitForFunction(()=>typeof window.rejectPDF==='function');
 await page.evaluate(()=>{
  window.quilliteMarkdown.openFile=async()=>({path:'recovered.md',name:'recovered.md',directory:'.',content:'# New session',revision:'b'.repeat(64)});
  document.querySelector('#openFileButton').click();
 });
 await page.locator('#markdownContent h1').filter({hasText:'New session'}).waitFor();
 await page.evaluate(()=>window.rejectPDF(Error('PDF_EXPORT_TIMEOUT')));
 await page.waitForFunction(()=>!document.querySelector('#confirmExportCenter').disabled);
 assert.equal(await page.evaluate(()=>window.printCount),3,'late failure must not print a new document session');
 console.log('PASS: first/repeated links, failed switch identity and stale content cleanup, recovery, PDF timeout/failure/missing fallback, destination errors and stale session');
}finally{await browser?.close();await server.close();}
