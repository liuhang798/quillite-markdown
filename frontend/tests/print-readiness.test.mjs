import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
const renderer = readFileSync(new URL('../src/renderer.js', import.meta.url), 'utf8');
const source = renderer.slice(renderer.indexOf('let printRequest = 0;'), renderer.indexOf('function closeDocumentActionsMenu()'));
const deferred = () => { let resolve, reject; const promise = new Promise((a,b) => {resolve=a;reject=b;}); return {promise,resolve,reject}; };
const tick = () => new Promise(resolve => setImmediate(resolve));
function fixture() {
  const reads=deferred(), decodes=deferred(), calls=[], toasts=[];
  const context=vm.createContext({
    state:{currentFile:{path:'a.md'},documentSession:1,editing:false},
    els:{content:{firstChild:{}}}, closeTypographySettings:()=>true,
    toggleEditor:async()=>{calls.push('exit-editor');context.state.editing=false;},
    finishReaderWork:()=>calls.push('highlight'),highlightReaderSource(){},
    requestAnimationFrame:fn=>fn(),renderMermaidDiagrams:async()=>{},renderEChartsDiagrams:async()=>{},
    waitForPreviewImageReads:()=>{calls.push('reads');return reads.promise;},
    waitForPreviewImages:()=>{calls.push('decodes');return decodes.promise;},
    assertExportImagesReady:()=>calls.push('assert-images'),
    createPrintPageStyle:()=>{calls.push('style');return {remove:()=>calls.push('remove-style')};},
    window:{quilliteMarkdown:{print:async()=>calls.push('print')}},
    reportSilentError:()=>calls.push('report'),showToast:key=>toasts.push(key),t:key=>key,
    isExportImageResourceError:e=>e.message.includes('EXPORT_IMAGE_RESOURCE_FAILED')
  });
  vm.runInContext(source,context);
  return {context,reads,decodes,calls,toasts,run:()=>context.printCurrentDocument()};
}
test('printing waits for the whole read queue and image decoding before invoking the bridge',async()=>{
  const f=fixture();f.context.state.editing=true;
  const job=f.run();await tick();assert.deepEqual(f.calls,['exit-editor','highlight','reads']);
  f.reads.resolve();await tick();assert.equal(f.calls.at(-1),'decodes');assert.ok(!f.calls.includes('print'));
  f.decodes.resolve();assert.equal(await job,true);
  assert.deepEqual(f.calls.slice(-4),['assert-images','style','print','remove-style']);
});
for (const failure of ['read timeout','decode failure']) test(`printing fails closed on ${failure}`,async()=>{
  const f=fixture(), job=f.run();await tick();
  if(failure==='read timeout') f.reads.reject(Error('EXPORT_IMAGE_RESOURCE_FAILED: timeout'));
  else {f.context.assertExportImagesReady=()=>{throw Error('EXPORT_IMAGE_RESOURCE_FAILED: decode');};f.reads.resolve();f.decodes.resolve();}
  assert.equal(await job,false);assert.ok(!f.calls.includes('print'));assert.ok(!f.calls.includes('style'));
  assert.deepEqual(f.toasts,['printImagesFailed']);
});
for(const change of ['document session','closed document','editing','rerender']) test(`stale print is cancelled after ${change}`,async()=>{
  const f=fixture(),job=f.run();await tick();
  if(change==='document session') f.context.state.documentSession++;
  if(change==='closed document') f.context.state.currentFile=null;
  if(change==='editing') f.context.state.editing=true;
  if(change==='rerender') f.context.els.content.firstChild={};
  f.reads.resolve();f.decodes.resolve();assert.equal(await job,false);
  assert.ok(!f.calls.includes('print'));assert.deepEqual(f.toasts,[]);
});
test('repeated print requests only invoke the bridge for the newest request',async()=>{
  const f=fixture(),first=f.run();await tick();const second=f.run();await tick();
  f.reads.resolve();f.decodes.resolve();assert.equal(await first,false);assert.equal(await second,true);
  assert.equal(f.calls.filter(c=>c==='print').length,1);
});
test('print bridge rejection is handled and removes temporary print styles',async()=>{
  const f=fixture();f.context.window.quilliteMarkdown.print=async()=>{throw Error('bridge failed');};
  const job=f.run();f.reads.resolve();f.decodes.resolve();assert.equal(await job,false);
  assert.equal(f.calls.at(-1),'remove-style');assert.deepEqual(f.toasts,['printFailed']);
});
