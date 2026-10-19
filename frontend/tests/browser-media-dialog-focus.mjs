// Synthetic documents only. Delay just the audited focus callbacks to make
// a click-before-next-paint order deterministic; this is not native IME proof.
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import {createServer} from 'vite';
const {chromium}=createRequire(import.meta.url)(process.env.PLAYWRIGHT_MODULE||'playwright');
const server=await createServer({root:fileURLToPath(new URL('..',import.meta.url)),server:{host:'127.0.0.1',port:0,watch:null,hmr:false},logLevel:'error'});
let browser,page;
const results=[];
try {
 await server.listen();browser=await chromium.launch({headless:true,executablePath:process.env.BROWSER_EXECUTABLE||undefined});
 for(const kind of ['image-open','image-reopen','structured-row','structured-reopen','mindmap-node','mindmap-reopen','flowchart-node','flowchart-reopen','state-node','state-reopen']) {
  page=await browser.newPage({viewport:{width:1500,height:1000}});page.setDefaultTimeout(15000);const errors=[];
  page.on('pageerror',error=>errors.push(error.message));
  await page.route('**/*',route=>new URL(route.request().url()).hostname==='127.0.0.1'?route.continue():route.abort());
  const shot=async suffix=>{if(process.env.AUDIT_OUTPUT)await page.screenshot({path:`${process.env.AUDIT_OUTPUT}/${kind}-${suffix}.png`});};
  try {
   await page.goto(server.resolvedUrls.local[0]);await page.locator('body').evaluate(()=>import('/src/main.js'));
   await page.locator('#newFileButton').click();await page.locator('#hideLivePreviewButton').click();
   const editor=page.locator('#markdownEditor > .cm-editor');
   const read=()=>editor.evaluate(async el=>{const{EditorView}=await import('/node_modules/@codemirror/view/dist/index.js');return EditorView.findFromDOM(el).state.doc.toString();});
   await page.evaluate(()=>{
    const original=requestAnimationFrame.bind(window);window.mediaFocusFrames=[];
    window.requestAnimationFrame=callback=>/els\.(?:imageUrl\.focus|flowchartNodeLabel\.focus|structuredDiagramRows\.lastElementChild)/.test(String(callback))
     ? (window.mediaFocusFrames.push(callback),-window.mediaFocusFrames.length):original(callback);
    window.flushMediaFocusFrames=()=>{const frames=window.mediaFocusFrames.splice(0);frames.forEach(callback=>callback(performance.now()));return frames.length;};
   });
   const openImage=async()=>{await page.locator('[data-format="image"]').click();await page.locator('#imageDialog').waitFor({state:'visible'});};
   const openDiagram=async id=>{
    await page.locator('[data-format="diagram-builder"]').click();await page.locator('#diagramDialog').waitFor({state:'visible'});
    await page.locator('[data-diagram-category="all"]').click();await page.locator('#diagramSearch').fill(({mindmap:'思维导图',flowchart:'流程图',state:'状态图'})[id]||'柱状图');
    await page.locator(`[data-diagram-template="${id}"]`).click();
   };
   let target,cancel,beforeSource;
   if(kind.startsWith('image')) {
    await openImage();if(kind.endsWith('reopen')){await page.locator('#cancelImage').click();await openImage();}
    target=page.locator('#imageAltInput');cancel=page.locator('#cancelImage');
   } else if(kind.startsWith('structured')) {
    await openDiagram('bar-chart');await page.locator('#addStructuredDiagramRow').click();
    if(kind.endsWith('reopen')){await page.locator('#cancelDiagram').click();await openDiagram('bar-chart');}
    target=page.locator('#structuredDiagramRows input[type="text"]').first();cancel=page.locator('#cancelDiagram');
   } else {
    const type=kind.split('-')[0];await openDiagram(type);await page.locator('[data-flowchart-add="process"]').click();
    if(kind.endsWith('reopen')){await page.locator('#cancelDiagram').click();await openDiagram(type);}
    target=page.locator('#diagramSearch');cancel=page.locator('#cancelDiagram');beforeSource=await page.locator('#diagramSource').inputValue();
   }
   await target.click();await target.press('Control+a');await page.keyboard.insertText('Chosen');await shot('01-chosen');
   const queued=await page.evaluate(()=>window.flushMediaFocusFrames());await page.keyboard.insertText(' Z');await shot('02-after-frame');
   assert.equal(await target.inputValue(),'Chosen Z',kind+' must retain the chosen input');
   assert.equal(await target.evaluate(el=>el===document.activeElement),true,kind+' active field');
   if(kind.startsWith('image'))assert.equal(await page.locator('#imageUrl').inputValue(),'');
   if(beforeSource!==undefined)assert.equal(await page.locator('#diagramSource').inputValue(),beforeSource,'search must not change node text');
   await cancel.click();assert.equal(await read(),'');assert.deepEqual(errors,[]);
   results.push({id:kind,status:'passed',queued,pageErrors:errors});
  }catch(error){await shot('failure');results.push({id:kind,status:'failed',error:error.message,pageErrors:errors});}
  console.log(JSON.stringify(results.at(-1)));await page.close();page=null;
 }
 console.log(JSON.stringify({passed:results.filter(r=>r.status==='passed').length,total:results.length}));
 assert.ok(results.every(r=>r.status==='passed'),JSON.stringify(results.filter(r=>r.status!=='passed')));
}finally{await browser?.close();await server.close();}
