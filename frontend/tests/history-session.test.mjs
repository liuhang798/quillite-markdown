import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
const source=readFileSync(new URL('../src/renderer.js',import.meta.url),'utf8');
const deferred=()=>{let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b;});return{promise,resolve,reject};};
function harness(){
 const nodes=new Map(),node=id=>{if(!nodes.has(id)){const classes=new Set(id==='dialog'?['hidden']:[]);nodes.set(id,{textContent:'',disabled:true,replaceChildren(){},querySelectorAll(){return [];},classList:{contains:n=>classes.has(n),add:n=>classes.add(n),remove:n=>classes.delete(n)}});}return nodes.get(id);};
 const context=vm.createContext({documentHistorySession:0,documentHistoryRequest:0,documentVersionRequest:0,documentVersions:[],selectedDocumentVersion:null,
  state:{documentSession:1,editing:true,currentFile:{path:'a.md'}},codeEditor:{},els:{documentHistoryDialog:node('dialog'),documentHistoryList:node('list'),documentHistoryPreview:node('preview'),documentHistoryStatus:node('status'),restoreDocumentHistory:node('restore'),aiSettingsDialog:node('dialog'),aiRewriteDialog:node('dialog'),aiReviewDialog:node('dialog')},
  document:{body:node('body')},window:{quilliteMarkdown:{}},sameDocumentPath:(a,b)=>a===b,t:k=>k,aiErrorMessage:e=>e.message,focusCodeEditor(){},documentHistoryEmpty(title){context.emptyTitle=title;},renderDocumentVersionList(){},renderDocumentVersionPreview(v){context.preview=v;},
 });
 for(const [from,to] of [['function closeDocumentHistory(','function documentHistoryEmpty('],['async function selectDocumentVersion(','async function snoozeUpdates(']])vm.runInContext(source.slice(source.indexOf(from),source.indexOf(to)),context);
 const version=(id,path='a.md')=>({id,path,content:id});
 context.window.quilliteMarkdown.listDocumentVersions=async()=>[{id:'v1'}];
 context.window.quilliteMarkdown.getDocumentVersion=async(p,id)=>version(id,p);
 return{c:context,api:context.window.quilliteMarkdown,version};
}
test('history selection disables previous restore and ignores stale success/error',async()=>{
 for(const fail of [false,true]){
  const{c,api,version}=harness();await c.openDocumentHistory();const pending=deferred();api.getDocumentVersion=async(p,id)=>id==='v2'?pending.promise:version(id,p);
  const old=c.selectDocumentVersion('v2');assert.equal(c.selectedDocumentVersion,null);assert.equal(c.els.restoreDocumentHistory.disabled,true);
  await c.selectDocumentVersion('v3');fail?pending.reject(Error('old error')):pending.resolve(version('v2'));await old;
  assert.equal(c.preview.id,'v3');assert.equal(c.selectedDocumentVersion.id,'v3');assert.equal(c.els.documentHistoryStatus.textContent,'');
 }
});
test('history list from a closed or previous document session cannot replace reopened history',async()=>{
 for(const changeDocument of [false,true])for(const fail of [false,true]){
  const{c,api}=harness(),pending=deferred();api.listDocumentVersions=()=>pending.promise;const old=c.openDocumentHistory();c.closeDocumentHistory();
  if(changeDocument){c.state.documentSession++;c.state.currentFile={path:'b.md'};}
  api.listDocumentVersions=async()=>[{id:'v3'}];await c.openDocumentHistory();fail?pending.reject(Error('old list')):pending.resolve([{id:'v1'}]);await old;
  assert.equal(c.preview.id,'v3');assert.equal(c.selectedDocumentVersion.id,'v3');assert.equal(c.documentVersions[0].id,'v3');assert.equal(c.els.documentHistoryDialog.classList.contains('hidden'),false);assert.equal(c.els.documentHistoryStatus.textContent,'');
 }
});
test('closed history invalidates pending selection even without a different document',async()=>{
 const{c,api,version}=harness();await c.openDocumentHistory();const pending=deferred();api.getDocumentVersion=()=>pending.promise;const old=c.selectDocumentVersion('v2');c.closeDocumentHistory();pending.resolve(version('v2'));await old;assert.equal(c.selectedDocumentVersion,null);assert.equal(c.els.restoreDocumentHistory.disabled,true);
});
test('invalid version identity/content or failed read cannot restore the prior version',async()=>{
 for(const value of [null,{id:'wrong',path:'a.md',content:'bad'},{id:'v2',path:'b.md',content:'bad'},{id:'v2',path:'a.md',content:null},Error('read failed')]){
  const{c,api}=harness();await c.openDocumentHistory();api.getDocumentVersion=async()=>{if(value instanceof Error)throw value;return value;};await c.selectDocumentVersion('v2');assert.equal(c.selectedDocumentVersion,null);assert.equal(c.els.restoreDocumentHistory.disabled,true);assert.ok(c.els.documentHistoryStatus.textContent);assert.equal(c.emptyTitle,'documentHistoryLoadFailed');
 }
});
