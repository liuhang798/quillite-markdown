// Synthetic data, isolated browser context, no native writes or external traffic.
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import {createServer} from 'vite';
const {chromium}=createRequire(import.meta.url)(process.env.PLAYWRIGHT_MODULE||'playwright');
const server=await createServer({root:fileURLToPath(new URL('..',import.meta.url)),server:{host:'127.0.0.1',port:0,watch:null,hmr:false},logLevel:'error'});
let browser;
try {
 await server.listen();browser=await chromium.launch({headless:true,executablePath:process.env.BROWSER_EXECUTABLE||undefined});
 const page=await browser.newPage();const errors=[];page.on('pageerror',error=>errors.push(error.message));
 await page.route('**/*',route=>new URL(route.request().url()).hostname==='127.0.0.1'?route.continue():route.abort());
 await page.goto(server.resolvedUrls.local[0]);
 await page.evaluate(async()=>{await import('/src/main.js');window.quilliteMarkdown.reportErrorLog=async()=>{};window.quilliteMarkdown.saveFile=async()=>{throw Error('unexpected write');};window.quilliteMarkdown.openExternal=async()=>{throw Error('unsupported URL');};});
 const open=async text=>{
  await page.evaluate(text=>{window.quilliteMarkdown.openFile=async()=>({path:'log-regression.md',name:'log-regression.md',directory:'.',content:text,revision:'a'.repeat(64)});},text);
  await page.locator('#openFileButton').click();
 };
 const large='long text '.repeat(15000);
 await open('# Large\n\n'+large+'\n\n## End');
 await page.locator('#markdownContent h2').waitFor();
 assert.ok((await page.locator('#markdownContent').textContent()).includes(large));
 await open('# Links\n\n[**link**](https://example.com/?a=1&amp;b=2 "A &quot;B&quot;")\n\n> [reference][r]\n\n[r]: https://example.com/?x=1&#38;y=2 "&#x22;quoted&#34;"\n\n[literal](https://example.com/?x=&amp;amp;)\n\n[unsafe](javascript&#58;alert%281%29)');
 const checkLinks=async selector=>{
  const links=page.locator(selector+' a');
  assert.equal(await links.nth(0).getAttribute('href'),'https://example.com/?a=1&b=2');
  assert.equal(await links.nth(0).getAttribute('title'),'A "B"');
  assert.equal(await links.nth(1).getAttribute('href'),'https://example.com/?x=1&y=2');
  assert.equal(await links.nth(1).getAttribute('title'),'"quoted"');
  assert.equal(await links.nth(2).getAttribute('href'),'https://example.com/?x=&amp;');
  assert.equal(await links.nth(3).getAttribute('href'),null,'encoded unsafe scheme remains sanitized');
  assert.equal(await page.locator(selector+' [onclick]').count(),0);
 };
 await checkLinks('#markdownContent');
 await page.locator('#markdownContent a').first().click();
 await page.waitForFunction(()=>document.querySelector('#toast').textContent.includes('无法打开')||document.querySelector('#toast').textContent.includes('Unable to open'));
 await page.locator('#editButton').click();
 const content=page.locator('#markdownEditor .cm-content[contenteditable=true]');await content.waitFor();
 await page.locator('#editorPreviewContent a').first().waitFor();
 await checkLinks('#editorPreviewContent');
 await content.click();await page.keyboard.press('Control+End');await page.keyboard.type('XYZ');await page.keyboard.press('Control+z');
 assert.ok(!(await content.textContent()).includes('XYZ'));
 assert.deepEqual(errors,[]);
 console.log('PASS: large complete reader, link/parser context in both panes, handled external failure, editor typing and undo');
} finally {await browser?.close();await server.close();}
