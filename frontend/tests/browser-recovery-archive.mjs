// Synthetic Safety Center data; save-copy is intercepted, never a disk write.
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import {createServer} from 'vite';
const{chromium}=createRequire(import.meta.url)(process.env.PLAYWRIGHT_MODULE||'playwright');
const server=await createServer({root:fileURLToPath(new URL('..',import.meta.url)),server:{host:'127.0.0.1',port:0,watch:null,hmr:false},logLevel:'error'});
let browser,page;
try {
 await server.listen();browser=await chromium.launch({headless:true,executablePath:process.env.BROWSER_EXECUTABLE||undefined});
 for(const lang of ['zh-CN','en']) {
  page=await browser.newPage({viewport:{width:1440,height:1000}});page.setDefaultTimeout(10000);const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.route('**/*',route=>new URL(route.request().url()).hostname==='127.0.0.1'?route.continue():route.abort());
  await page.addInitScript(({lang})=>{
   localStorage.setItem('language',lang);window.archiveAudit={copies:[],reads:[]};
   Object.defineProperty(window,'quilliteMarkdown',{configurable:true,set(b){
    Object.defineProperty(window,'quilliteMarkdown',{value:b});
    b.getStartupRecoverySnapshot=async()=>{window.archiveReady=true;return null;};
    b.getRecoveryBackup=async()=>({path:'current.md',name:'current.md',content:'CURRENT INPUT',updatedAt:'2026-10-15'});
    b.listRecoveryArchives=async()=>[{id:'a'.repeat(64),name:'old <draft>.md',size:16,updatedAt:'2026-10-14'}];
    b.readRecoveryArchive=async id=>{archiveAudit.reads.push(id);return{path:'old.md',name:'old.md',content:'OLD <script>alert(1)</script> DRAFT'};};
    b.saveConflictCopy=async(path,content)=>{archiveAudit.copies.push({path,content});return{path:'new-copy.md'};};
   }});
  },{lang});
  await page.goto(server.resolvedUrls.local[0]);await page.waitForFunction(()=>window.archiveReady);await page.locator('#moreButton').click();await page.locator('[data-action="document-tools"]').click();
  const dialog=page.locator('#documentToolsDialog'),en=lang==='en';
  await dialog.getByRole('button',{name:en?'Safety':'文档安全',exact:true}).click();
  await dialog.getByRole('button',{name:en?'Load recovery and current history':'读取恢复备份与当前文档历史',exact:true}).click();
  await dialog.locator('summary').filter({hasText:'old <draft>.md'}).click();
  const copy=dialog.getByRole('button',{name:en?'Save preserved draft (no overwrite)':'另存旧草稿（不覆盖）',exact:true});await copy.waitFor();
  assert.ok((await dialog.innerText()).includes('OLD <script>alert(1)</script> DRAFT'));assert.equal(await dialog.locator('script').count(),0);
  if(process.env.AUDIT_OUTPUT)await page.screenshot({path:`${process.env.AUDIT_OUTPUT}/${lang}-01-archives.png`});
  await copy.click();await page.waitForFunction(()=>archiveAudit.copies.length===1);
  assert.deepEqual(await page.evaluate(()=>archiveAudit.copies),[{path:'old.md',content:'OLD <script>alert(1)</script> DRAFT'}]);
  assert.deepEqual(errors,[]);console.log('PASS',lang,'archive preview, safe text and create-only copy payload');await page.close();page=null;
 }
} catch(error){if(page&&process.env.AUDIT_OUTPUT)await page.screenshot({path:`${process.env.AUDIT_OUTPUT}/failure.png`});throw error;}
finally{await browser?.close();await server.close();}
