// Isolated synthetic documents only; every backend write is mocked.
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import {createServer} from 'vite';
const pw=createRequire(import.meta.url)(process.env.PLAYWRIGHT_MODULE||'playwright');
const engine=process.env.BROWSER_ENGINE||'chromium';
const server=await createServer({root:fileURLToPath(new URL('..',import.meta.url)),server:{host:'127.0.0.1',port:0,watch:null,hmr:false},logLevel:'error',plugins:[{
 name:'large-document-regression',enforce:'pre',transform(code,id){
  if(id.replaceAll('\\','/').endsWith('/src/renderer.js'))return code+`\nwindow.largeAudit={
   open:doc=>displayDocument(doc,{addToLibrary:false}), edit:()=>toggleEditor(true),
   append:()=>codeEditor.dispatch({changes:{from:codeEditor.state.doc.length,insert:'\\n\\nAPPENDED_END'}}),
   source:()=>codeEditor.state.doc.toString(), state:()=>({editing:state.editing,source:state.currentFile.content}),
   exportHTML:()=>cleanRenderedHTMLForExport(els.content),save:()=>saveDocument(false)
  };`;
 }
}]});
let browser,bs;
const timer=setTimeout(()=>{console.error('Large document regression timed out');process.exitCode=1;void bs?.kill();},180000);
try{
 await server.listen();bs=await pw[engine].launchServer({headless:true,...(engine==='chromium'?{executablePath:process.env.BROWSER_EXECUTABLE||undefined}:{})});
 browser=await pw[engine].connect(bs.wsEndpoint());
 const page=await browser.newPage({viewport:{width:1400,height:900}});const errors=[];
 page.on('pageerror',e=>errors.push(e.message));
 await page.route('**/*',r=>new URL(r.request().url()).hostname==='127.0.0.1'?r.continue():r.abort());
 await page.goto(server.resolvedUrls.local[0]);await page.waitForFunction(()=>window.largeAudit);
 await page.evaluate(()=>{
  window.quilliteMarkdown.reportErrorLog=async()=>{};
  window.quilliteMarkdown.canEditFile=async()=>true;
  window.quilliteMarkdown.saveFile=async(path,content)=>{window.savedSource=content;return {path,name:'large.md',directory:'.',content,revision:'b'.repeat(64)};};
 });
 for(const kind of ['prose-1.5M','embedded-image','prose-12M']){
  const info=await page.evaluate(async kind=>{
   let body;
   if(kind==='embedded-image'){
    const canvas=document.createElement('canvas');canvas.width=800;canvas.height=800;
    const ctx=canvas.getContext('2d'),data=ctx.createImageData(800,800);let seed=7;
    for(let i=0;i<data.data.length;i++){seed=(Math.imul(seed,1664525)+1013904223)|0;data.data[i]=i%4===3?255:seed>>>24;}
    ctx.putImageData(data,0,0);window.testImage=canvas.toDataURL();
    body='![embedded]('+window.testImage+')\n\n中文正文 **加粗**';
   }else body=('ordinary paragraph 中文测试 without formulas or resources. '.repeat(8)+'\n\n').repeat(kind==='prose-12M'?25000:3000);
   const source='# START_MARKER\n\n'+body+'\n\n## END_MARKER\n\nlast paragraph';window.expectedSource=source;
   const start=performance.now();window.largeAudit.open({path:'test-large.md',name:'large.md',directory:'.',content:source,revision:'a'.repeat(64)});
   await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));
   return {kind,bytes:new Blob([source]).size,paintMs:Math.round(performance.now()-start)};
  },kind);
  assert.equal(await page.locator('[data-safe-reader]').count(),0);
  assert.equal(await page.locator('#markdownContent h2').last().textContent(),'END_MARKER');
  assert.equal(await page.locator('#editButton').isDisabled(),false);
  assert.equal(await page.evaluate(()=>window.largeAudit.state().source===window.expectedSource),true);
  assert.equal(await page.evaluate(async()=>(await window.largeAudit.exportHTML()).includes('END_MARKER')),true);
  if(kind==='embedded-image'){
   await page.locator('#markdownContent img').scrollIntoViewIfNeeded();
   await page.waitForFunction(()=>document.querySelector('#markdownContent img')?.naturalWidth===800);
   assert.equal(await page.locator('#markdownContent img').getAttribute('src'),await page.evaluate(()=>window.testImage));
  }
  await page.evaluate(()=>window.largeAudit.edit());
  assert.equal(await page.evaluate(()=>window.largeAudit.state().editing),true);
  assert.equal(await page.evaluate(()=>window.largeAudit.source()===window.expectedSource),true);
  await page.evaluate(()=>window.largeAudit.append());
  await page.evaluate(()=>window.largeAudit.save());
  assert.equal(await page.evaluate(()=>window.savedSource===window.expectedSource+'\n\nAPPENDED_END'),true);
  console.log('PASS',JSON.stringify(info),'complete render/edit/save/export');
 }
 assert.deepEqual(errors,[]);
}finally{clearTimeout(timer);await bs?.kill();await server.close();}
