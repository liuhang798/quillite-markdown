import assert from 'node:assert/strict';
import test from 'node:test';
import vm from 'node:vm';
import {installDocumentLoadingFixture} from './document-loading-fixture.mjs';
import {readFileSync} from 'node:fs';
const source=readFileSync(new URL('../src/renderer.js',import.meta.url),'utf8');
function harness() {
  let resolve,reject;
  const pending=new Promise((yes,no)=>{resolve=yes;reject=no;});
  const calls=[];
  const state={documentSession:1,documentOpenRequest:0,currentFile:{path:'/a.md',content:'original'}};
  const c=vm.createContext({state,allowed:true,calls,els:{content:{}},
    maybeDiscardChanges:()=>c.allowed,
    window:{quilliteMarkdown:{openRecentFile:path=>{calls.push(['read',path]);return pending;}}},
    displayDocument:doc=>{state.currentFile=doc;state.documentSession++;calls.push(['display',doc.path]);},
    scrollDocumentLinkTarget:(_container,fragment)=>calls.push(['anchor',fragment]),
    isMissingDocumentError:()=>true,isMacAccessNotGrantedError:()=>false,
    refreshLibraryFileStatuses:async()=>calls.push(['refresh']),showToast:key=>calls.push(['toast',key]),t:key=>key,
    reportSilentError(){},console:{error(){}}
  });
  installDocumentLoadingFixture(c,source);
  vm.runInContext(source.slice(source.indexOf('function beginDocumentOpen('),source.indexOf('function syncDocumentAccessControls('))
    +source.slice(source.indexOf('async function loadFile('),source.indexOf('async function refreshLibraryAfterReplacement(')),c);
  return {c,state,calls,resolve,reject};
}
test('document links use the authorized open path and scroll only after accepted document load',async()=>{
  const h=harness();const result=h.c.loadFile('/b.md',{fragment:'章节'});
  h.resolve({path:'/b.md',content:'next'});await result;
  assert.deepEqual(h.calls,[['read','/b.md'],['display','/b.md'],['anchor','章节']]);
});
test('declined unsaved-content confirmation never starts a linked document read',async()=>{
  const h=harness();h.c.allowed=false;await h.c.loadFile('/b.md');assert.deepEqual(h.calls,[]);
});
test('new input during linked-file read and stale responses cannot replace the document',async()=>{
  for(const changed of ['input','session']){
    const h=harness();const result=h.c.loadFile('/b.md',{fragment:'section'});
    if(changed==='session')h.state.documentSession++;
    else {h.state.currentFile.content='new input';h.c.allowed=false;}
    h.resolve({path:'/b.md',content:'next'});await result;
    assert.equal(h.state.currentFile.path,'/a.md');assert.deepEqual(h.calls,[['read','/b.md']]);
  }
});
test('missing links retain the document, while stale errors never affect a new session',async()=>{
  for(const stale of [false,true]){
    const h=harness();const result=h.c.loadFile('/missing.md');if(stale)h.state.documentSession++;
    h.reject(new Error('missing'));await result;
    assert.equal(h.state.currentFile.content,'original');
    assert.equal(h.calls.some(call=>call[0]==='toast'),!stale);
  }
});
