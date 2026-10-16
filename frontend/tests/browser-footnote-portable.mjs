// Authorized isolated synthetic page. Only native image/read/save bridges are
// doubled; editing, export controls, conversion and failure UI are production.
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import {createServer} from 'vite';
const {chromium}=createRequire(import.meta.url)(process.env.PLAYWRIGHT_MODULE||'playwright');
const server=await createServer({root:fileURLToPath(new URL('..',import.meta.url)),server:{host:'127.0.0.1',port:0,watch:null,hmr:false},logLevel:'error'});
let browser,page;
try{
  await server.listen();browser=await chromium.launch({headless:true,executablePath:process.env.BROWSER_EXECUTABLE||undefined});
  page=await browser.newPage({viewport:{width:1600,height:1100}});page.setDefaultTimeout(10000);
  const errors=[];page.on('pageerror',error=>errors.push(error.message));
  await page.route('https://example.invalid/**',route=>route.abort());
  await page.goto(server.resolvedUrls.local[0]+'tests/fixtures/app-drag-audit.html');
  const app=page.frameLocator('iframe');await app.getByRole('button',{name:'新建文档',exact:true}).click();
  const editor=app.locator('#markdownEditor > .cm-editor'),content=editor.locator('> .cm-scroller > .cm-content');
  const read=()=>editor.evaluate(async el=>{const{EditorView}=await import('/node_modules/@codemirror/view/dist/index.js');return EditorView.findFromDOM(el).state.doc.toString();});
  const shot=async name=>{if(process.env.AUDIT_OUTPUT){await page.waitForTimeout(250);await page.screenshot({path:`${process.env.AUDIT_OUTPUT}/${name}.png`});}};
  await editor.evaluate(()=>{
    const data='data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aCh0AAAAASUVORK5CYII=';
    window.portableAudit={data,reads:[],writes:[],cancel:false};
    window.quilliteMarkdown.readImageData=async()=>data;
    window.quilliteMarkdown.readPortableImage=async ref=>{window.portableAudit.reads.push(ref);if(ref.includes('missing'))throw Error('PORTABLE_IMAGE_MISSING');return data;};
    window.quilliteMarkdown.exportPortableMarkdown=async(path,content)=>{window.portableAudit.writes.push({path,content});return window.portableAudit.cancel?'':'isolated-copy.md';};
  });
  const reset=async source=>{
    if(await app.locator('#exportCenterDialog').isVisible())await app.locator('#closeExportCenter').click();
    if(await app.locator('#closeToast').isVisible())await app.locator('#closeToast').click();
    await app.getByRole('button',{name:'源码',exact:true}).click();await content.focus();await page.keyboard.press('Control+a');await page.keyboard.insertText(source);
    for(let i=0;i<100&&await read()!==source;i++)await page.waitForTimeout(20);assert.equal(await read(),source);
    await page.keyboard.press('Control+Home');await app.getByRole('button',{name:'即时渲染',exact:true}).click();
    await editor.evaluate(()=>{window.portableAudit.reads=[];window.portableAudit.writes=[];window.portableAudit.cancel=false;});
  };
  const exportCopy=async()=>{
    await app.locator('#moreButton').click();await app.locator('#moreMenu [data-action="export-center"]').click();
    await app.locator('#exportCenterDialog').waitFor({state:'visible'});await app.locator('[data-export-format="markdown-portable"]').click();
    await app.locator('#confirmExportCenter').click();
    for(let i=0;i<200&&await app.locator('#confirmExportCenter').getAttribute('aria-busy')==='true';i++)await page.waitForTimeout(20);
    assert.equal(await app.locator('#confirmExportCenter').getAttribute('aria-busy'),'false');
    return editor.evaluate(()=>window.portableAudit);
  };
  const bodies=[['plain','![Photo](assets/photo.png)'],['quote','> ![Photo](assets/photo.png)'],['table','| Photo | Text |\n| --- | --- |\n| ![Photo](assets/photo.png) | Cell |'],['details','<details open>\n<summary>More</summary>\n\n![Photo](assets/photo.png)\n\n</details>'],['html','<img src="assets/photo.png" width="120" alt="Photo">'],['reference','![Photo][pic]']];
  for(const[kind,body]of bodies){
    const source=`Outside[^n]\n\n[^n]: Intro\n    \n    ${body.replaceAll('\n','\n    ')}\n    \n    Tail\n\n[pic]: assets/photo.png "Shared"\n\nAfter`;
    await reset(source);const result=await exportCopy();assert.equal(result.writes.length,1);assert.equal(await read(),source);
    const output=result.writes[0].content;console.log(kind,JSON.stringify({reads:result.reads,embedded:output.includes(result.data),unchanged:output===source}));
    await shot(kind+'-01-exported');
    if(!process.env.AUDIT_BASELINE){assert.deepEqual(result.reads,['assets/photo.png']);assert.ok(output.includes(result.data));assert.ok(output.includes('    Tail'));}
    await reset(output);await app.locator('#editorPreviewContent .footnotes img').waitFor({state:'visible'});await shot(kind+'-02-copy');
    if(!process.env.AUDIT_BASELINE){const img=app.locator('#editorPreviewContent .footnotes img');assert.equal(await img.getAttribute('src'),result.data);assert.ok(await img.evaluate(el=>el.complete&&el.naturalWidth>0));}
  }
  for(const[kind,body,message]of [['remote','![Photo](https://example.invalid/photo.png)','文档含在线图片'],['missing','![Photo](missing.png)','图片无法读取'],['complex','<img src="assets/photo.png" srcset="assets/large.png 2x">','图片包含 srcset']]){
    const source='Outside[^n]\n\n[^n]: Intro\n    \n    '+body+'\n    \n    Tail';
    await reset(source);const result=await exportCopy();console.log(kind,JSON.stringify({reads:result.reads,writes:result.writes.length}));await shot(kind+'-03-blocked');
    if(!process.env.AUDIT_BASELINE){assert.equal(result.writes.length,0);assert.ok(await app.locator('#exportCenterDialog').isVisible());await app.getByText(message,{exact:false}).waitFor({state:'visible'});assert.equal(await read(),source);}
  }
  if(!process.env.AUDIT_BASELINE){
    const source='Outside[^n]\n\n[^n]: Intro\n    \n    ![Photo](assets/photo.png)';await reset(source);await editor.evaluate(()=>window.portableAudit.cancel=true);
    const result=await exportCopy();assert.equal(result.writes.length,1);assert.equal(await read(),source);assert.ok(await app.locator('#exportCenterDialog').isVisible());assert.equal(await app.locator('[data-export-format="markdown-portable"]').getAttribute('aria-checked'),'true');await shot('cancel-04-options-retained');
  }
  assert.deepEqual(errors,[]);
}catch(error){if(page&&process.env.AUDIT_OUTPUT)await page.screenshot({path:`${process.env.AUDIT_OUTPUT}/failure.png`});throw error;}
finally{await browser?.close();await server.close();}
