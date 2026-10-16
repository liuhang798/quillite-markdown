import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
const source=readFileSync(new URL('../src/renderer.js',import.meta.url),'utf8');
const between=(a,b)=>source.slice(source.indexOf(a),source.indexOf(b,source.indexOf(a)));
const deferred=()=>{let resolve,reject;const promise=new Promise((r,j)=>{resolve=r;reject=j;});return{promise,resolve,reject};};
function harness() {
 const state={root:'Saved',explorerRequest:0,explorerFiles:[{name:'original.md'}],sidebarMode:'explorer',documentOpenRequest:0,documentSession:0};
 const lists=[],frames=[],notices=[],opens=[];
 const context=vm.createContext({state,console:{warn(){},error(){}},window:{quilliteMarkdown:{listFolder:root=>{const d=deferred();lists.push({root,...d});return d.promise;},openFolder:()=>{const d=deferred();opens.push(d);return d.promise;},readFile:async path=>({path})}},requestAnimationFrame:fn=>frames.push(fn),setSidebarMode:mode=>{state.sidebarMode=mode;},reportSilentError(){},showToast:k=>notices.push(k),t:k=>k,isMissingDocumentError:()=>false,maybeDiscardChanges:()=>true,displayDocument:doc=>{state.currentFile=doc;state.documentSession++;}});
 vm.runInContext(between('function beginDocumentOpen(', 'function syncDocumentAccessControls(')+between('async function refreshExplorer()', 'function renderFileRow(')+between('async function openFolder()', 'async function openReferenceDocument('),context);
 const paint=()=>{const first=frames.shift();first?.();const second=frames.shift();return second?.();};
 return{state,context,lists,notices,opens,paint};
}
for(const failure of [false,true])test(`older refresh ${failure?'failure':'success'} cannot replace a newer result`,async()=>{
 const h=harness(),a=h.context.refreshExplorer(),b=h.context.refreshExplorer();
 h.lists[1].resolve({files:[{name:'new.md'}]});await b;
 failure?h.lists[0].reject(Error('old')):h.lists[0].resolve({files:[{name:'stale.md'}]});await a;
 assert.equal(h.state.explorerFiles[0].name,'new.md');assert.deepEqual(h.notices,[]);
});
for(const mode of ['recent','favorites'])test(`refresh retains the user's ${mode} tab`,async()=>{
 const h=harness(),a=h.context.refreshExplorer();h.state.sidebarMode=mode;h.lists[0].resolve({files:[{name:'fresh.md'}]});await a;
 assert.equal(h.state.sidebarMode,mode);assert.equal(h.state.explorerFiles[0].name,'fresh.md');
});
test('current refresh failure still reports and preserves existing files',async()=>{
 const h=harness(),a=h.context.refreshExplorer();h.lists[0].reject(Error('current'));await a;
 assert.deepEqual(h.notices,['folderOpenFailed']);assert.equal(h.state.explorerFiles[0].name,'original.md');
});
for(const root of ['Saved','Chosen'])for(const failure of [false,true])test(`restore ${failure?'error':'result'} cannot overwrite a newly selected ${root} folder`,async()=>{
 const h=harness();h.context.restoreExplorerAfterFirstPaint('Saved');const restoration=h.paint();
 const opening=h.context.openFolder();h.opens[0].resolve({root,files:[{path:root+'/fresh.md',name:'fresh.md'}]});await opening;
 failure?h.lists[0].reject(Error('stale')):h.lists[0].resolve({root:'Saved',files:[{name:'stale.md'}]});await restoration;
 assert.equal(h.state.root,root);assert.equal(h.state.explorerFiles[0].name,'fresh.md');assert.equal(h.state.sidebarMode,'explorer');assert.deepEqual(h.notices,[]);
});
test('a folder selection pending before the next paint invalidates queued restoration',async()=>{
 const h=harness();h.context.restoreExplorerAfterFirstPaint('Saved');const opening=h.context.openFolder();await h.paint();assert.equal(h.lists.length,0);
 h.opens[0].resolve(null);await opening;assert.equal(h.state.root,'Saved');assert.equal(h.state.explorerFiles[0].name,'original.md');
});
for(const mode of ['explorer','favorites'])test(`current missing startup folder clears its root, retaining ${mode} unless it needs fallback`,async()=>{
 const h=harness();h.context.restoreExplorerAfterFirstPaint('Saved');const a=h.paint();h.state.sidebarMode=mode;h.lists[0].reject(Error('missing'));await a;
 assert.equal(h.state.root,null);assert.equal(h.state.explorerFiles.length,0);assert.equal(h.state.sidebarMode,mode==='explorer'?'recent':mode);
});
test('normal startup restoration still displays the saved folder',async()=>{
 const h=harness();h.context.restoreExplorerAfterFirstPaint('Saved');const a=h.paint();h.lists[0].resolve({root:'Saved',files:[{name:'loaded.md'}]});await a;
 assert.equal(h.state.explorerFiles[0].name,'loaded.md');assert.equal(h.state.sidebarMode,'explorer');
});
