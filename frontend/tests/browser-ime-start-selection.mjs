// Protocol/DOM regression, not a substitute for native macOS Pinyin acceptance.
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import {createServer} from 'vite';
const playwright = createRequire(import.meta.url)(process.env.PLAYWRIGHT_MODULE || 'playwright');
const server = await createServer({root:fileURLToPath(new URL('..',import.meta.url)),server:{host:'127.0.0.1',port:0,watch:null,hmr:false},logLevel:'error'});
let browser;
try {
  await server.listen();
  const engine = process.env.IME_BROWSER || 'chromium';
  browser = await playwright[engine].launch({headless:true,...(engine==='chromium' && process.env.BROWSER_EXECUTABLE ? {executablePath:process.env.BROWSER_EXECUTABLE} : {})});
  const page = await browser.newPage();
  const errors=[];page.on('pageerror',error=>errors.push(error.message));
  await page.addInitScript(()=>{window.EditContext=undefined;});
  await page.route('**/*',route=>new URL(route.request().url()).hostname==='127.0.0.1'?route.continue():route.abort());
  await page.goto(server.resolvedUrls.local[0]+'tests/fixtures/live-editing-audit.html');
  await page.waitForFunction(()=>window.liveAudit);
  await page.evaluate(()=>{
    const view=liveAudit.view;
    view.dispatch({changes:{from:0,to:view.state.doc.length,insert:'text'},selection:{anchor:4}});view.focus();
  });
  await page.waitForTimeout(100);
  const result=await page.evaluate(()=>{
    const view=liveAudit.view,selection=getSelection(),node=view.contentDOM.querySelector('.cm-line').firstChild;
    // The browser may establish its marked-text selection before the editor
    // receives compositionstart. It is not yet a CodeMirror selection change.
    selection.setBaseAndExtent(node,3,node,4);
    let updates=0;const dispatch=view.dispatchTransactions;
    view.dispatchTransactions=(...args)=>{updates++;return dispatch(...args);};
    view.contentDOM.dispatchEvent(new CompositionEvent('compositionstart',{bubbles:true,data:''}));
    const result={updates,anchor:selection.anchorOffset,head:selection.focusOffset,sameNode:selection.anchorNode===node&&selection.focusNode===node};
    view.dispatchTransactions=dispatch;
    view.contentDOM.dispatchEvent(new CompositionEvent('compositionend',{bubbles:true,data:''}));
    return result;
  });
  assert.deepEqual(result,{updates:0,anchor:3,head:4,sameNode:true},'compositionstart must not redraw or overwrite the native marked-text selection');
  assert.deepEqual(errors,[]);
  console.log('PASS',engine,'compositionstart preserves native selection without an editor update');
} finally {await browser?.close();await server.close();}
