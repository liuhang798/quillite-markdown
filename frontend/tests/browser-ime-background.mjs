// Exercises real EditorViews and native DOM selections, not a native OS IME.
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import {createServer} from 'vite';
const playwright=createRequire(import.meta.url)(process.env.PLAYWRIGHT_MODULE||'playwright');
const server=await createServer({root:fileURLToPath(new URL('..',import.meta.url)),server:{host:'127.0.0.1',port:0,watch:null,hmr:false},logLevel:'error'});
let browser;
try {
 await server.listen();const engine=process.env.IME_BROWSER||'chromium';
 browser=await playwright[engine].launch({headless:true,...(engine==='chromium'&&process.env.BROWSER_EXECUTABLE?{executablePath:process.env.BROWSER_EXECUTABLE}:{})});
 const page=await browser.newPage(),errors=[];page.on('pageerror',error=>errors.push(error.message));
 await page.addInitScript(()=>{window.EditContext=undefined;});
 await page.route('**/*',route=>new URL(route.request().url()).hostname==='127.0.0.1'?route.continue():route.abort());
 await page.goto(server.resolvedUrls.local[0]+'tests/fixtures/ime-background-audit.html');await page.waitForFunction(()=>window.imeAudit);
 for(const kind of ['table','code']){
  await page.evaluate(kind=>imeAudit.create(kind==='table'?'| cell |\n| --- |\n| text |\n\nend':'```text\ncell\n```\n\nend'),kind);
  await page.waitForTimeout(150);
  await page.evaluate(()=>{
   const a=imeAudit;a.start(a.inner());
   a.forwardEditableEffects(a.view,[a.effect.of('first')]);
   a.forwardEditableEffects(a.view,[a.effect.of('last')]);
  });
  await page.waitForTimeout(180);
  assert.deepEqual(await page.evaluate(()=>imeAudit.snapshot()),{sameNode:true,anchor:3,head:4},kind+' metadata must not disturb composition');
  assert.equal(await page.evaluate(()=>imeAudit.watch.effects.some(e=>e.is(imeAudit.effect))),false,'metadata stays queued');
  await page.evaluate(()=>imeAudit.end());await page.waitForTimeout(180);
  assert.deepEqual(await page.evaluate(()=>imeAudit.watch.effects.filter(e=>e.is(imeAudit.effect)).map(e=>e.value)),['first','last'],kind+' queued effects apply in order');
  await page.evaluate(()=>imeAudit.stop());
 }
 await page.evaluate(()=>imeAudit.create('![image](data:image/png;base64,iVBORw0KGgo=)\n\ntext'));
 await page.waitForTimeout(150);
 await page.evaluate(()=>{
  const a=imeAudit;a.view.dispatch({changes:{from:a.view.state.doc.length,insert:'x'}});a.start(a.view);
 });
 await page.waitForTimeout(400);
 assert.deepEqual(await page.evaluate(()=>imeAudit.snapshot()),{sameNode:true,anchor:4,head:5},'image scan waits without resetting native selection');
 assert.equal(await page.evaluate(()=>imeAudit.watch.effects.some(e=>e.is(imeAudit.refreshImagePreviews))),false,'image scan stays queued');
 await page.evaluate(()=>imeAudit.end());await page.waitForTimeout(180);
 assert.ok(await page.evaluate(()=>imeAudit.watch.effects.some(e=>e.is(imeAudit.refreshImagePreviews))),'deferred scan eventually runs');
 await page.evaluate(()=>imeAudit.stop());
 for(const reject of [false,true]){
  await page.evaluate(()=>{imeAudit.create('```mermaid\ngraph TD\nA-->B\n```\n\ntext',()=>new Promise((resolve,reject)=>{imeAudit.renderResult={resolve,reject};}));});
  await page.waitForFunction(()=>imeAudit.renderResult);
  await page.evaluate(reject=>{imeAudit.start(imeAudit.view);if(reject)imeAudit.renderResult.reject(Error('isolated failure'));else imeAudit.renderResult.resolve(false);},reject);
  await page.waitForTimeout(180);
  assert.deepEqual(await page.evaluate(()=>imeAudit.snapshot()),{sameNode:true,anchor:3,head:4},'diagram failure waits without resetting native selection');
  assert.equal(await page.evaluate(()=>imeAudit.watch.effects.some(e=>e.is(imeAudit.diagramRenderFailed))),false,'diagram failure stays queued');
  await page.evaluate(()=>imeAudit.end());await page.waitForTimeout(180);
  assert.ok(await page.evaluate(()=>imeAudit.watch.effects.some(e=>e.is(imeAudit.diagramRenderFailed))),'diagram failure reported after commit');
  await page.evaluate(()=>{imeAudit.stop();delete imeAudit.renderResult;});
 }
 assert.deepEqual(errors,[]);console.log('PASS',engine,'nested metadata, image scans and diagram completions preserve IME selection and replay after commit');
} finally {await browser?.close();await server.close();}
