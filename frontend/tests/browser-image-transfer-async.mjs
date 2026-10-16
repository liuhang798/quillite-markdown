// Real clipboard paste, synthetic assets/transport, fresh contexts.
// Optional drop-* cases diagnose the browser's file-drag boundary; they are not OS drag acceptance.
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import {readFileSync} from 'node:fs';
import {createServer} from 'vite';
const {chromium}=createRequire(import.meta.url)(process.env.PLAYWRIGHT_MODULE||'playwright');
const output=process.env.AUDIT_OUTPUT;if(!output)throw Error('AUDIT_OUTPUT required');
const imagePath=fileURLToPath(new URL('../../build/appicon.png',import.meta.url));
const imageData='data:image/png;base64,'+readFileSync(imagePath).toString('base64');
const server=await createServer({root:fileURLToPath(new URL('..',import.meta.url)),server:{host:'127.0.0.1',port:0,watch:null,hmr:false},logLevel:'error'});
let browser;const results=[];
const cases=(process.env.AUDIT_CASES||'paste-caret,paste-prefix,paste-switch,paste-error,paste-upload,paste-upload-switch,paste-upload-fallback,paste-concurrent,paste-details,paste-table').split(',');
try{
 await server.listen();browser=await chromium.launch({headless:true,executablePath:process.env.BROWSER_EXECUTABLE||undefined});
 for(const name of cases){
  const context=await browser.newContext({viewport:{width:1500,height:1100},permissions:['clipboard-read','clipboard-write']}),page=await context.newPage(),errors=[];
  page.setDefaultTimeout(8000);page.on('pageerror',e=>errors.push(e.message));page.on('dialog',d=>d.accept());
  await page.route('**/*',r=>{const u=new URL(r.request().url());if(u.href==='https://example.test/uploaded.png')return r.fulfill({path:imagePath,contentType:'image/png'});if(u.hostname!=='127.0.0.1')return r.abort();if(u.pathname==='/synthetic-image.png'||u.pathname.startsWith('/assets/'))return r.fulfill({path:imagePath,contentType:'image/png'});return r.continue();});
  const app=page.frameLocator('iframe'),editor=app.locator('#markdownEditor > .cm-editor'),content=editor.locator('> .cm-scroller > .cm-content');
  const shot=suffix=>page.screenshot({path:`${output}/${name}-${suffix}.png`,animations:'disabled'});
  try{
   await page.goto(server.resolvedUrls.local[0]+'tests/fixtures/image-transfer-audit.html');await app.locator('body').evaluate(()=>import('/src/main.js'));
   const frame=page.frames().find(f=>{try{return new URL(f.url()).pathname==='/';}catch{return false;}});
   await frame.evaluate(()=>{window.transferEvents=[];for(const type of ['dragenter','dragover','drop'])document.addEventListener(type,e=>{if(type==='dragover'&&transferEvents.some(x=>x.type===type))return;transferEvents.push({type,types:[...e.dataTransfer.types],files:[...e.dataTransfer.files].map(f=>f.name),target:e.target.className});},true);});
   const source=name==='paste-details'?'<details open>\n<summary>Summary</summary>\n\nALPHA\n\n</details>\n\nOMEGA':name==='paste-table'?'| Name |\n| --- |\n| ALPHA |\n\nOMEGA':'ALPHA\n\nOMEGA';
   await frame.evaluate(({source,imageData})=>{
    const doc=(path,body)=>({path,name:path,directory:'.',content:body,revision:'a'.repeat(64)});window.transferAudit={next:doc('A.md',source),calls:[]};
    const pending=(kind,path,input)=>new Promise((resolve,reject)=>transferAudit.calls.push({kind,path,input,resolve,reject}));
    Object.assign(window.quilliteMarkdown,{openFile:async()=>({...transferAudit.next}),pathForFile:f=>f.name==='audit.png'?'C:/synthetic/audit.png':'',readImageData:async()=>imageData,
     importImage:(path,input)=>pending('asset',path,input),savePastedImage:(path,input)=>pending('asset',path,input),
     setImageUploadSettings:async input=>({mode:input.mode,serverUrl:input.serverUrl}),testPicGo:async()=>({connected:true}),uploadImageToPicGo:(path,input)=>pending('upload',path,input),
    });
   },{source,imageData});
   await app.locator('#openFileButton').click();await app.locator('#editButton').click();
   if(name.includes('upload')){
    await app.locator('#moreButton').click();await app.locator('[data-action="image-upload-settings"]').click();await app.locator('[name="imageUploadMode"][value="picgo"]').check();await app.locator('#picGoInstalledNext').click();await app.locator('#saveImageUploadSettings').click();await app.locator('#imageUploadSettingsDialog').waitFor({state:'hidden'});await app.locator('#closeToast').click();
   }
   const read=()=>editor.evaluate(async el=>{const{EditorView}=await import('/node_modules/@codemirror/view/dist/index.js');return EditorView.findFromDOM(el).state.doc.toString();});
   const waitCalls=(kind,count)=>frame.waitForFunction(({kind,count})=>transferAudit.calls.filter(c=>c.kind===kind).length===count,{kind,count});
   const complete=(kind,index,path,fail=false)=>frame.evaluate(({kind,index,path,fail})=>{const c=transferAudit.calls.filter(c=>c.kind===kind)[index];fail?c.reject(Error('Synthetic delayed failure')):c.resolve(path);},{kind,index,path,fail});
   const atEnd=async()=>{await content.focus();await page.keyboard.press('Control+End');};
   if(name.startsWith('paste')){
    await page.locator('#copyImage').click();await page.locator('#status').filter({hasText:'Image copied'}).waitFor();
    const field=name==='paste-details'?app.getByRole('textbox',{name:'区块正文',exact:true}):name==='paste-table'?app.getByRole('textbox',{name:'表格单元格 2, 1',exact:true}):content;
    if(name==='paste-prefix')await atEnd();else{await field.click();await page.keyboard.press('Control+Home');await page.keyboard.press('End');}
    await page.keyboard.press('Control+v');
   }else{
    const drag=await page.locator('#dragImage').boundingBox();const line=content.locator('.cm-line').filter({hasText:'ALPHA'});const box=await line.boundingBox();
    await page.mouse.move(drag.x+drag.width/2,drag.y+drag.height/2);await page.mouse.down();await page.mouse.move(drag.x+10,drag.y+10,{steps:3});await page.mouse.move(box.x+38,box.y+box.height/2,{steps:25});await page.mouse.up();
   }
   await waitCalls('asset',1);await shot('01-pending');
   const originalSelection=await editor.evaluate(async el=>{const{EditorView}=await import('/node_modules/@codemirror/view/dist/index.js');return EditorView.findFromDOM(el).state.selection.main.from;});
   if(name.includes('upload')){await complete('asset',0,'assets/first.png');await waitCalls('upload',1);}
   if(name.includes('switch')||name==='paste-error'){
    await frame.evaluate(()=>{transferAudit.next={path:'B.md',name:'B.md',directory:'.',content:'NEW DOCUMENT',revision:'b'.repeat(64)};});await app.locator('#openFileButton').click();await app.locator('#editButton').click();
   }else if(name==='paste-prefix'){await content.focus();await page.keyboard.press('Control+Home');await page.keyboard.insertText('PREFIX ');}
   else await atEnd();
   if(name==='paste-concurrent'){await page.keyboard.press('Control+v');await waitCalls('asset',2);await complete('asset',1,'assets/second.png');await page.waitForTimeout(150);}
   const beforeComplete=await read();await complete(name.includes('upload')?'upload':'asset',0,name.includes('upload')?'https://example.test/uploaded.png':'assets/first.png',name==='paste-error'||name==='paste-upload-fallback');
   await page.waitForTimeout(250);await shot('02-returned');const actual=await read();
   if(name.includes('switch')||name==='paste-error'){
    assert.equal(actual,'NEW DOCUMENT');assert.equal(await app.locator('#toast').isVisible(),false,'No obsolete insertion notification');assert.equal(await app.locator('#imageUploadProgress').isVisible(),false);
   }else{
    const expectedPath=name.includes('upload')&&name!=='paste-upload-fallback'?'https://example.test/uploaded.png':'assets/first.png';
    assert.ok(actual.includes(expectedPath),'Image must be inserted');
    await frame.waitForFunction(()=>[...document.querySelectorAll('#markdownEditor img')].some(img=>img.complete&&img.naturalWidth>0));await shot('03-image-loaded');
    if(name==='paste-prefix')assert.ok(actual.startsWith('PREFIX ALPHA\n\nOMEGA!['));
    else if(name==='paste-concurrent')assert.match(actual,/ALPHA!\[[^\]]*\]\(assets\/first.png\)\n\nOMEGA!\[[^\]]*\]\(assets\/second.png\)/);
    else if(name==='paste-details')assert.match(actual,/ALPHA!\[[^\]]*\]\(assets\/first.png\)\n\n<\/details>/);
    else if(name==='paste-table')assert.match(actual,/\| ALPHA!\[[^\]]*\]\(assets\/first.png\) \|/);
    else if(name.startsWith('drop'))assert.equal(actual.indexOf('!['),originalSelection,'Drop bookmark must not follow a later caret');
    else assert.ok(actual.startsWith('ALPHA!['));
    await content.focus();await page.keyboard.press('Control+z');assert.equal(await read(),beforeComplete,'One undo removes only this image');await page.keyboard.press('Control+y');assert.equal(await read(),actual);
   }
   assert.deepEqual(errors,[]);results.push({id:name,passed:true});
  }catch(error){await shot('failure');results.push({id:name,passed:false,error:error.message,pageErrors:errors,drag:await app.locator('body').evaluate(()=>window.transferEvents),dragStart:await page.evaluate(()=>window.dragAudit)});}
  console.log(JSON.stringify(results.at(-1)));await context.close();
 }
 console.log(JSON.stringify({PASS:results.filter(r=>r.passed).length,total:results.length,scope:'Native clipboard/mouse events; synthetic transport, not native OS file picker'}));assert.ok(results.every(r=>r.passed));
}finally{await browser?.close();await server.close();}
