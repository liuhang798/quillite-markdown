// Real pointer/keyboard operations; synthetic picker and temporary documents only.
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import {readFileSync} from 'node:fs';
import {createServer} from 'vite';
const {chromium}=createRequire(import.meta.url)(process.env.PLAYWRIGHT_MODULE||'playwright');
const output=process.env.AUDIT_OUTPUT;if(!output)throw Error('AUDIT_OUTPUT required');
const asset=fileURLToPath(new URL('../../build/appicon.png',import.meta.url));
const imageData='data:image/png;base64,'+readFileSync(asset).toString('base64');
const server=await createServer({root:fileURLToPath(new URL('..',import.meta.url)),server:{host:'127.0.0.1',port:0,watch:null,hmr:false},logLevel:'error'});
const layouts=[['wide',1400,1000,false,false],['narrow',960,720,false,false],['editor-only',1400,1000,true,false],['english-dark',960,720,false,true]];
let browser;const results=[];
try{
 await server.listen();browser=await chromium.launch({headless:true,executablePath:process.env.BROWSER_EXECUTABLE||undefined});
 for(const[label,width,height,only,dark]of layouts)for(const mode of ['live','source'])for(const timing of ['before','after'])for(const kind of ['success','error']){
  const id=[label,mode,timing,kind].join('-'),page=await browser.newPage({viewport:{width,height}}),errors=[];page.setDefaultTimeout(6000);page.on('pageerror',e=>errors.push(e.message));
  const shot=name=>page.screenshot({path:`${output}/${id}-${name}.png`,animations:'disabled'});
  try{
   await page.route('**/*',r=>{const u=new URL(r.request().url());if(u.hostname!=='127.0.0.1')return r.abort();if(u.pathname==='/assets/synthetic.png')return r.fulfill({path:asset,contentType:'image/png'});return r.continue();});
   await page.addInitScript(dark=>{if(dark){localStorage.setItem('language','en');localStorage.setItem('colorMode','dark');}},dark);
   await page.goto(server.resolvedUrls.local[0]);await page.evaluate(()=>import('/src/main.js'));
   await page.evaluate(({imageData,dark})=>{
    window.toastAudit={pending:[]};Object.assign(window.quilliteMarkdown,{
     openFile:async()=>({path:'Synthetic-toast.md',name:'Synthetic-toast.md',directory:'.',content:'ALPHA\n\nOMEGA',revision:'a'.repeat(64)}),
     selectImage:()=>new Promise((resolve,reject)=>toastAudit.pending.push({resolve,reject})),readImageData:async()=>imageData,
    });
   },{imageData,dark});
   await page.locator('#openFileButton').click();await page.locator('#editButton').click();if(only)await page.locator('#hideLivePreviewButton').click();
   await page.locator(`[data-editor-presentation="${mode}"]`).click();
   if(dark){assert.equal(await page.locator('html').getAttribute('lang'),'en');assert.equal(await page.locator('html').getAttribute('data-color-mode'),'dark');}
   const editor=page.locator('#markdownEditor > .cm-editor'),content=editor.locator('> .cm-scroller > .cm-content');
   const read=()=>editor.evaluate(async el=>{const{EditorView}=await import('/node_modules/@codemirror/view/dist/index.js');const{undoDepth}=await import('/node_modules/@codemirror/commands/dist/index.js');const v=EditorView.findFromDOM(el),s=v.state.selection.main;return{doc:v.state.doc.toString(),undo:undoDepth(v.state),from:s.from,to:s.to,selected:v.state.sliceDoc(s.from,s.to)};});
   await content.click();await page.keyboard.press('Control+Home');await page.keyboard.press('End');
   const entry=page.locator('[data-format="image"]');if(await entry.isVisible())await entry.click();else{await page.locator('#moreFormatButton').click();await page.locator('#moreFormatMenu [data-format-command="image"]:visible').click();}
   await page.locator('#pickLocalImage').click();await page.waitForFunction(()=>toastAudit.pending.length===1);
   const search=page.locator('.cm-search input[name="search"]'),replace=page.locator('.cm-search input[name="replace"]');
   const openSearch=async()=>{await page.keyboard.press('Control+f');await search.fill('OMEGA');await replace.fill('CHANGED');};
   if(timing==='before')await openSearch();
   await page.evaluate(kind=>{const p=toastAudit.pending[0];if(kind==='success')p.resolve('assets/synthetic.png');else p.reject(Error('Synthetic picker failure'));},kind);
   await page.locator('#toast').waitFor({state:'visible'});
   if(timing==='after')await openSearch();
   const state=await read();assert.ok(state.doc.includes('OMEGA'));
   if(kind==='error')assert.equal(state.doc,'ALPHA\n\nOMEGA');
   const clear=async()=>{
    await page.waitForTimeout(80);
    const geometry=await page.evaluate(()=>{
     const t=document.querySelector('#toast'),r=t.getBoundingClientRect(),p=document.querySelector('.cm-search').getBoundingClientRect();
     return{visible:!t.classList.contains('hidden'),overlap:Math.max(0,Math.min(r.right,p.right)-Math.max(r.left,p.left))*Math.max(0,Math.min(r.bottom,p.bottom)-Math.max(r.top,p.top)),toast:r.toJSON(),panel:p.toJSON()};
    });
    assert.equal(geometry.visible,true,'must test while notification is visible');assert.equal(geometry.overlap,0,'notification must leave entire search panel clear');assert.ok(geometry.toast.top>=0);assert.ok(geometry.toast.bottom<=page.viewportSize().height);return geometry;
   };
   const initialGeometry=await clear();assert.equal(await replace.evaluate(el=>el===document.activeElement),true,'notification does not steal focus');await shot('01-clear');
   await page.setViewportSize({width:width===1400?960:1400,height:width===1400?720:1000});await clear();await shot('02-resized');
   await page.setViewportSize({width,height});await clear();assert.deepEqual(await read(),state,'layout does not edit document/history');
   // Find highlights do not select a match. Locate it before replacing it.
   await page.locator('.cm-search button[name="next"]').click();assert.equal((await read()).selected,'OMEGA');
   const button=page.locator('.cm-search button[name="replace"]');
   const hit=await button.evaluate(el=>{const r=el.getBoundingClientRect();return el.contains(document.elementFromPoint(r.x+r.width/2,r.y+r.height/2));});assert.equal(hit,true,'real pointer reaches replace');
   const rect=await button.boundingBox();await page.mouse.click(rect.x+rect.width/2,rect.y+rect.height/2);await page.waitForTimeout(80);
   assert.equal((await read()).doc,state.doc.replace('OMEGA','CHANGED'),'pointer replacement succeeds while toast remains visible');await shot('03-replaced');
   await replace.click();await page.keyboard.type(' MORE');assert.equal(await replace.inputValue(),'CHANGED MORE');assert.equal((await read()).doc,state.doc.replace('OMEGA','CHANGED'));
   await page.locator('.cm-search button[name="close"]').click();await page.waitForTimeout(80);assert.equal(await page.locator('#toast').isVisible(),true);assert.equal(await page.locator('#toast').evaluate(el=>getComputedStyle(el).bottom),'28px','closing search restores default position');
   await page.locator('#toast > button').click();assert.equal(await page.locator('#toast').isVisible(),false);await content.focus();await page.keyboard.press('Control+z');assert.equal((await read()).doc,state.doc,'overlay changes add no undo history');assert.deepEqual(errors,[]);
   results.push({id,passed:true,initialGeometry});
  }catch(error){await shot('failure');results.push({id,passed:false,error:error.message,pageErrors:errors});}
  console.log(JSON.stringify(results.at(-1)));await page.close();
 }
 console.log(JSON.stringify({PASS:results.filter(r=>r.passed).length,total:results.length,transport:'synthetic picker responses'}));assert.ok(results.every(r=>r.passed));
}finally{await browser?.close();await server.close();}
