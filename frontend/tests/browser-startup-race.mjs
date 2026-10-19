// User-authorized isolated browser. All document responses are synthetic.
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import {createServer} from 'vite';
const {chromium}=createRequire(import.meta.url)(process.env.PLAYWRIGHT_MODULE||'playwright');
const server=await createServer({root:fileURLToPath(new URL('..',import.meta.url)),server:{host:'127.0.0.1',port:0,watch:null,hmr:false},logLevel:'error'});
let browser,page;
const cases=['new-pending','new-typed','open-typed','initial-pending','mode-pending','normal-preview','normal-edit'];
try {
 await server.listen();
 browser=await chromium.launch({headless:true,executablePath:process.env.BROWSER_EXECUTABLE||undefined});
 for(const name of cases.filter(n=>!process.env.AUDIT_CASE||n===process.env.AUDIT_CASE)) {
  page=await browser.newPage({viewport:{width:1440,height:950}});page.setDefaultTimeout(10000);
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.route('**/*',route=>new URL(route.request().url()).hostname==='127.0.0.1'?route.continue():route.abort());
  await page.addInitScript(({name})=>{
   const gates={},calls=[],finished=[];
   const wait=key=>new Promise(resolve=>{gates[key]=resolve;});
   const doc=(id,content='')=>({path:`${id}.md`,name:`${id}.md`,directory:'.',content});
   window.startupAudit={calls,finished,release:key=>gates[key]?.()};
   Object.defineProperty(window,'quilliteMarkdown',{configurable:true,set(bridge){
    Object.defineProperty(window,'quilliteMarkdown',{value:bridge,configurable:true});
    const prefs=bridge.getPreferences;
    bridge.getPreferences=async()=>{calls.push('prefs');const result=await prefs();if(['new-pending','new-typed','open-typed'].includes(name))await wait('prefs');finished.push('prefs');return result;};
    bridge.newFile=async()=>{calls.push('new');if(name==='new-pending')await wait('new');finished.push('new');return {...doc('User-new'),draft:true};};
    bridge.openFile=async()=>{calls.push('open');if(name==='mode-pending')await wait('open');finished.push('open');return doc('User-open','USER BODY');};
    bridge.getInitialFile=async()=>{calls.push('initial');if(name==='initial-pending')await wait('initial');finished.push('initial');return doc('Startup-old','OLD BODY');};
    bridge.getStartupMode=async()=>{calls.push('mode');if(name==='mode-pending')await wait('mode');finished.push('mode');return name==='normal-preview'?'preview':'edit';};
    bridge.getRecoverySnapshot=async()=>{calls.push('recovery');return null;};
    // Never write even the synthetic browser recovery snapshot during this test.
    bridge.saveRecoverySnapshot=async()=>{};
   }});
  },{name});
  await page.goto(server.resolvedUrls.local[0]);
  const waitCall=key=>page.waitForFunction(key=>window.startupAudit?.calls.includes(key),key);
  const release=key=>page.evaluate(key=>window.startupAudit.release(key),key);
  const editor=page.locator('#markdownEditor > .cm-editor');
  const content=editor.locator('> .cm-scroller > .cm-content');
  const read=()=>editor.evaluate(async el=>{const{EditorView}=await import('/node_modules/@codemirror/view/dist/index.js');return EditorView.findFromDOM(el).state.doc.toString();});
  const shot=async suffix=>{if(process.env.AUDIT_OUTPUT)await page.screenshot({path:`${process.env.AUDIT_OUTPUT}/${name}-${suffix}.png`});};
  if(name.startsWith('normal')) {
   await waitCall('recovery');
   assert.match(await page.locator('#documentView').innerText(),/OLD BODY/);
   assert.equal(await editor.isVisible(),name==='normal-edit');
  } else if(name==='mode-pending') {
   await waitCall('mode');await page.locator('#openFileButton').click();await waitCall('open');
   await shot('01-pending');await release('mode');await waitCall('recovery');
   assert.equal(await editor.isVisible(),false,'stale startup mode must not enter editor during a newer open request');
   await release('open');await page.locator('#documentView').getByText('USER BODY',{exact:true}).waitFor();
  } else {
   await waitCall(name==='initial-pending'?'initial':'prefs');
   await page.locator(name==='open-typed'?'#openFileButton':'#newFileButton').click();
   if(name==='new-pending') {
    await waitCall('new');await shot('01-pending');await release('prefs');await waitCall('recovery');await release('new');
    await content.waitFor({state:'visible'});assert.equal(await read(),'');
   } else {
    if(name==='open-typed') {await page.locator('#documentView').getByText('USER BODY',{exact:true}).waitFor();await page.locator('#editButton').click();}
    await content.waitFor({state:'visible'});await content.focus();await page.keyboard.press('Control+End');await page.keyboard.insertText('USER TYPED');
    const before=await read();await shot('01-typed');await release(name==='initial-pending'?'initial':'prefs');await waitCall('recovery');
    assert.equal(await read(),before,'startup must preserve user input');
    assert.ok(await page.locator('#fileList').innerText().then(t=>t.includes(name==='open-typed'?'User-open':'User-new')),'newly opened document remains in recent files');
   }
  }
  await shot('02-result');assert.deepEqual(errors,[]);console.log('PASS',name,await page.evaluate(()=>window.startupAudit.calls));
  await page.close();page=null;
 }
} catch(error) {if(page&&process.env.AUDIT_OUTPUT)await page.screenshot({path:`${process.env.AUDIT_OUTPUT}/failure.png`});throw error;}
finally {await browser?.close();await server.close();}
