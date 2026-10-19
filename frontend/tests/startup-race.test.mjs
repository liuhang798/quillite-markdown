import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {partitionRecentFiles} from '../src/library-state.js';
const source=readFileSync(new URL('../src/renderer.js',import.meta.url),'utf8');
const between=(a,b)=>source.slice(source.indexOf(a),source.indexOf(b,source.indexOf(a)));
const deferred=()=>{let resolve;const promise=new Promise(r=>{resolve=r;});return{promise,resolve};};
function harness() {
 const prefs=deferred(),initial=deferred(),mode=deferred(),calls=[];
 const state={documentOpenRequest:0,documentSession:0,explorerRequest:0,currentFile:null,recentFiles:[],pinnedRecentFiles:[],sidebarMode:'recent'};
 const context=vm.createContext({state,partitionRecentFiles,console,els:{usageAnalyticsToggle:{}},window:{quilliteMarkdown:{
  getPreferences:()=>{calls.push('prefs');return prefs.promise;},getInitialFile:()=>{calls.push('initial');return initial.promise;},getStartupMode:()=>mode.promise,
  getImageUploadSettings:async()=>({}),needsLanguageSelection:async()=>false,
 }},maybeDiscardChanges:()=>assert.fail('startup must never request discard of newer content'),
 displayDocument:doc=>{state.currentFile=doc;state.documentSession++;calls.push('display');},toggleEditor:()=>calls.push('edit'),
 applyLibraryPreferences:p=>{state.recentFiles=p.recentFiles||[];state.pinnedRecentFiles=p.pinnedRecentFiles||[];},
 applyRecentPartition:p=>{state.recentFiles=p.files;state.pinnedRecentFiles=p.pinnedPaths;},
 initializeMacSystemColorMode:()=>true,offerRecoverySnapshot:()=>calls.push('recovery'),
 });
 for(const name of ['setAccentTheme','setColorMode','setFontScale','setFontFamily','syncBodyTypography','setDocumentWidth','setEditorLayout','scheduleMacWindowModeSync','applyImageUploadSettings','setLanguage','setSidebarMode','restoreExplorerAfterFirstPaint','openFirstRunLanguageDialog','scheduleAutomaticUpdateCheck'])context[name]=()=>{};
 context.reportSilentError=()=>calls.push('error');context.showToast=()=>calls.push('toast');context.t=k=>k;context.isMissingDocumentError=()=>false;
 vm.runInContext(between('function beginDocumentOpen(', 'function syncDocumentAccessControls(')+between('async function loadInitialDocument(', "$('#newFileButton').addEventListener"),context);
 return {context,state,prefs,initial,mode,calls};
}
const flush=()=>new Promise(r=>setImmediate(r));
for(const completed of [false,true])test(`startup preserves ${completed?'completed':'pending'} user folder selection`,async()=>{
 const h=harness(),init=h.context.initialize();await flush();h.context.beginDocumentOpen();h.state.explorerRequest++;
 h.state.root=completed?'Chosen':null;h.state.explorerFiles=completed?[{path:'Chosen/user.md'}]:[];
 let restores=0;h.context.restoreExplorerAfterFirstPaint=()=>restores++;
 h.prefs.resolve({explorerRoot:'Saved'});await init;
 assert.equal(h.state.root,completed?'Chosen':null);assert.equal(h.state.explorerFiles.length,completed?1:0);assert.equal(restores,0);
});
for(const completed of [false,true])test(`startup does not supersede a ${completed?'completed':'pending'} user request`,async()=>{
 const h=harness(),init=h.context.initialize();await flush();
 const user=h.context.beginDocumentOpen();
 if(completed){h.state.documentSession++;h.state.currentFile={path:'user.md',content:'newly typed'};}
 h.prefs.resolve({});await init;
 assert.equal(h.calls.includes('initial'),false);
 if(completed)assert.equal(h.state.currentFile.content,'newly typed');
 else assert.equal(h.context.canApplyDocumentOpen(user),true);
});
test('startup retains local recent entries, pinning, metadata and ordinary limit',async()=>{
 const h=harness(),init=h.context.initialize();await flush();h.context.beginDocumentOpen();
 const fresh={path:'user.md',name:'fresh'};h.state.recentFiles=[fresh];h.state.pinnedRecentFiles=['user.md'];
 h.prefs.resolve({recentFiles:[{path:'USER.md',name:'stale'},...Array.from({length:14},(_,i)=>({path:`old${i}.md`}))],pinnedRecentFiles:['old0.md']});await init;
 assert.equal(h.state.recentFiles[0],fresh);assert.deepEqual(h.state.pinnedRecentFiles,['user.md','old0.md']);assert.equal(h.state.recentFiles.length,12);
});
test('late initial response cannot replace an already edited document',async()=>{
 const h=harness(),init=h.context.initialize();h.prefs.resolve({});await flush();
 h.context.beginDocumentOpen();h.state.documentSession++;h.state.currentFile={content:'keep input'};
 h.initial.resolve({path:'old.md',content:'old'});await init;assert.equal(h.state.currentFile.content,'keep input');assert.equal(h.calls.includes('display'),false);
});
test('late startup mode cannot edit while a user open is still pending',async()=>{
 const h=harness(),init=h.context.initialize();h.prefs.resolve({});h.initial.resolve({path:'old.md'});await flush();
 h.context.beginDocumentOpen();h.mode.resolve('edit');await init;assert.equal(h.calls.includes('edit'),false);
});
for(const mode of ['edit','preview'])test(`normal startup still opens in ${mode}`,async()=>{
 const h=harness(),init=h.context.initialize();h.prefs.resolve({});h.initial.resolve({path:'old.md',content:'old'});h.mode.resolve(mode);await init;
 assert.equal(h.state.currentFile.path,'old.md');assert.equal(h.calls.includes('edit'),mode==='edit');
});
