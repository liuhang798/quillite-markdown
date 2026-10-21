// CDP composition on the contenteditable path, not native macOS IME proof.
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import {createServer} from 'vite';
const {chromium}=createRequire(import.meta.url)(process.env.PLAYWRIGHT_MODULE||'playwright');
const server=await createServer({root:fileURLToPath(new URL('..',import.meta.url)),server:{host:'127.0.0.1',port:0,watch:null,hmr:false},logLevel:'error'});
let browser;
try {
 await server.listen();browser=await chromium.launch({headless:true,executablePath:process.env.BROWSER_EXECUTABLE||undefined});
 const page=await browser.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.addInitScript(()=>{window.EditContext=undefined;});
 await page.route('**/*',r=>new URL(r.request().url()).hostname==='127.0.0.1'?r.continue():r.abort());
 await page.goto(server.resolvedUrls.local[0]+'tests/fixtures/live-editing-audit.html');await page.waitForFunction(()=>window.liveAudit);
 // Reproduce a queued previous commit racing the next compositionstart.
 const rootContent=page.locator('#editor > .cm-editor > .cm-scroller > .cm-content');
 await rootContent.evaluate(el=>{
  el.dispatchEvent(new CompositionEvent('compositionstart',{bubbles:true}));
  el.dispatchEvent(new CompositionEvent('compositionend',{bubbles:true}));
  el.dispatchEvent(new CompositionEvent('compositionstart',{bubbles:true}));
 });
 await page.waitForTimeout(50);
 assert.equal(await page.evaluate(async()=>{const m=await import('/src/editor-composition.js');return m.editorHasComposition(liveAudit.view);}),true,'old end frame must not unfreeze a new composition');
 await rootContent.dispatchEvent('compositionend');await page.waitForFunction(async()=>{const m=await import('/src/editor-composition.js');return !m.editorHasComposition(liveAudit.view);});
 const cdp=await page.context().newCDPSession(page);
 for(const [kind,source,at] of [['plain','text',4],['heading','# text',6],['bold','**text**',6],['list','- text',6],['table','| H |\n| --- |\n| text |',22]]){
  await page.evaluate(async({source,at})=>{
   const v=liveAudit.view;v.dispatch({changes:{from:0,to:v.state.doc.length,insert:source},selection:{anchor:Math.min(at,source.length)}});v.focus();
  },{source,at});
  if(kind==='table'){await page.locator('td .cm-content').first().click();await page.keyboard.press('End');}
  await page.waitForTimeout(50);
  await page.evaluate(()=>window.imeTarget=document.activeElement);
  for(const text of ['n','ni','nih','niha','nihao']){await cdp.send('Input.imeSetComposition',{text,selectionStart:text.length,selectionEnd:text.length});await page.waitForTimeout(250);}
  await cdp.send('Input.insertText',{text:'你好'});await page.waitForTimeout(80);
  for(const text of ['s','shi','shijie']){await cdp.send('Input.imeSetComposition',{text,selectionStart:text.length,selectionEnd:text.length});await page.waitForTimeout(100);}
  await cdp.send('Input.insertText',{text:'世界'});await page.waitForTimeout(80);
  await cdp.send('Input.imeSetComposition',{text:'cancel',selectionStart:6,selectionEnd:6});
  await cdp.send('Input.imeSetComposition',{text:'',selectionStart:0,selectionEnd:0});await page.waitForTimeout(80);
  assert.equal(await page.evaluate(()=>document.activeElement===window.imeTarget),true,kind+' focus retained');
  await page.keyboard.type('123');
  const actual=await page.evaluate(()=>liveAudit.view.state.doc.toString());assert.equal(actual,source.replace('text','text你好世界123'),kind);console.log('PASS composition, cancel and digits',kind);
 }
 assert.deepEqual(errors,[]);
} finally {await browser?.close();await server.close();}
