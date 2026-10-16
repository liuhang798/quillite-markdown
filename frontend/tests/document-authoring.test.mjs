import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import {transformMarkdownImages} from '../src/portable-images.js';

const source = readFileSync(new URL('../src/renderer.js', import.meta.url), 'utf8');
function harness() {
 let resolve, reject;
 const promise = new Promise((yes,no)=>{resolve=yes;reject=no;});
 const controls = new Map();
 const control = id => {
  if (!controls.has(id)) controls.set(id, {value:'',textContent:'',classList:{add(){},remove(){}},focus(){},select(){}});
  return controls.get(id);
 };
 const calls=[];
 const state={currentFile:{path:'/old.md',name:'old.md',content:'unsaved',revision:'disk'},savedContent:'baseline',editing:true,dirty:true,documentSession:1};
 const context=vm.createContext({state,$:control,els:{editorFileName:{}},document:{body:{classList:{add(){},remove(){}}},querySelector:()=>null},requestAnimationFrame:callback=>callback(),window:{quilliteMarkdown:{renameDocument:()=>promise}},editorContent:()=>state.currentFile.content,syncDocumentIdentity(){},updateWindowTitle(){},resetDocumentSummary(){},addRecentDocument(){},refreshLibraryAfterReplacement:async()=>{},pathIsInsideRoot:()=>false,refreshExplorer:async()=>{},renderFileList(){},renderCurrentDocument(){},scheduleRecoverySnapshot:()=>calls.push('backup'),showToast:key=>calls.push(key),t:key=>key,authoringError:()=> 'renameFailed',openDocumentConflict:async()=>calls.push('conflict')});
 vm.runInContext(source.slice(source.indexOf('let renameSession = null;'),source.indexOf('function resetDocumentConflict(')),context);
 context.codeEditor={dispatch:transaction=>calls.push(['reconfigure',transaction.effects])};
 context.editorPresentation={reconfigure:value=>value};
 context.editorPresentationExtensions=()=>({session:state.documentSession,path:state.currentFile.path});
 return {context,state,calls,control,resolve,reject};
}

test('rename preserves unsaved content and saved baseline and schedules recovery',async()=>{
 const h=harness(); h.context.openRenameDocument(); h.control('#renameDocumentName').value='new.md';
 const renaming=h.context.confirmRenameDocument();
 h.state.currentFile.content='later edits';
 h.resolve({path:'/new.md',name:'new.md',content:'baseline',revision:'disk'});
 await renaming;
 assert.equal(h.state.currentFile.content,'later edits');
 assert.equal(h.state.savedContent,'baseline');
 assert.equal(h.state.dirty,true);
 assert.equal(h.state.documentSession,2);
 assert.equal(h.state.saving,false);
 assert.ok(h.calls.includes('backup'));
 assert.deepEqual(h.calls.find(call=>Array.isArray(call)),['reconfigure',{session:2,path:'/new.md'}]);
});

test('late rename cannot replace a different or reopened document',async()=>{
 for (const path of ['/other.md','/old.md']) {
  const h=harness(); h.context.openRenameDocument(); const renaming=h.context.confirmRenameDocument();
  h.state.documentSession++; h.state.currentFile={path,content:'other unsaved'};
  h.resolve({path:'/new.md',name:'new.md',content:'disk'}); await renaming;
  assert.equal(h.state.currentFile.path,path); assert.equal(h.state.currentFile.content,'other unsaved');
  assert.deepEqual(h.calls,[]);
 }
});

test('rename cancellation and existing-name rejection preserve editor identity',async()=>{
 const h=harness(); h.context.openRenameDocument(); h.context.closeRenameDocument();
 await h.context.confirmRenameDocument(); assert.equal(h.state.saving,undefined);
 h.context.openRenameDocument(); const renaming=h.context.confirmRenameDocument();
 h.reject(Error('DOCUMENT_COPY_EXISTS')); await renaming;
 assert.equal(h.state.currentFile.path,'/old.md'); assert.equal(h.state.currentFile.content,'unsaved');
 assert.equal(h.state.dirty,true); assert.equal(h.control('#renameDocumentStatus').textContent,'renameFailed');
 assert.equal(h.control('#confirmRenameDocument').disabled,false);
});

test('portable export cancellation preserves options and missing assets never start writing',async()=>{
 const sourceFunction=source.slice(source.indexOf('async function performExportCenter('),source.indexOf('function openPDFTutorial('));
 for (const missing of [false,true]) {
  let writes=0,closed=false;
  const options={format:'markdown-portable'};
  const context=vm.createContext({state:{editing:false,currentFile:{path:'/a.md',directory:'/',content:'doc'}},els:{exportCenterStatus:{}},setExportInProgress(){},readExportDraft:()=>options,PANDOC_EXPORT_FORMATS:new Set(),transformMarkdownImages:async()=>{if(missing)throw Error('PORTABLE_IMAGE_MISSING');return 'portable';},window:{quilliteMarkdown:{exportPortableMarkdown:async()=>{writes++;return '';}}},showToast(){},authoringError:()=> 'missing',closeExportCenter:()=>{closed=true;},t:key=>key});
  vm.runInContext(sourceFunction,context); await context.performExportCenter();
  assert.equal(writes,missing?0:1); assert.equal(closed,false); assert.equal(context.state.exportDraft,options);
 }
});

test('actual footnote conversion blocks writing for missing, remote and complex images',async()=>{
 const sourceFunction=source.slice(source.indexOf('async function performExportCenter('),source.indexOf('function openPDFTutorial('));
 for(const[body,expected]of [['![x](missing.webp)',0],['![x](https://example.com/x.webp)',0],['<img src="a.webp" srcset="b.webp 2x">',0],['![x](a.webp)',1]]) {
  const doc='X[^n]\n\n[^n]: Intro\n    \n    '+body;let writes=0,closed=false;
  const context=vm.createContext({state:{editing:false,documentSession:1,currentFile:{path:'/a.md',directory:'/',content:doc}},els:{exportCenterStatus:{}},setExportInProgress(){},readExportDraft:()=>({format:'markdown-portable'}),PANDOC_EXPORT_FORMATS:new Set(),transformMarkdownImages,window:{quilliteMarkdown:{readPortableImage:async ref=>ref.includes('missing')?'':'data:image/png;base64,AAAA',exportPortableMarkdown:async(_path,content)=>{writes++;assert.ok(content.includes('data:image'));return '/copy.md';}}},showToast(){},authoringError:()=> 'missing',closeExportCenter:()=>{closed=true;},t:key=>key});
  vm.runInContext(sourceFunction,context);await context.performExportCenter();assert.equal(writes,expected);assert.equal(closed,expected===1);assert.equal(context.state.currentFile.content,doc);
 }
});

test('portable export does not write or update new/reopened document sessions after async work',async()=>{
 const sourceFunction=source.slice(source.indexOf('async function performExportCenter('),source.indexOf('function openPDFTutorial('));
 for(const phase of ['read','write'])for(const path of ['/a.md','/b.md'])for(const outcome of ['success','failure']){
  let release,started,writes=0,closed=false;const wait=new Promise(resolve=>release=resolve),entered=new Promise(resolve=>started=resolve),toasts=[];
  const state={editing:false,documentSession:1,currentFile:{path:'/a.md',directory:'/',content:'old'}};
  const context=vm.createContext({state,els:{exportCenterStatus:{}},setExportInProgress(){},readExportDraft:()=>({format:'markdown-portable'}),PANDOC_EXPORT_FORMATS:new Set(),transformMarkdownImages:async()=>{if(phase==='read'){started();await wait;if(outcome==='failure')throw Error('PORTABLE_IMAGE_MISSING');}return 'copy';},window:{quilliteMarkdown:{exportPortableMarkdown:async()=>{writes++;if(phase==='write'){started();await wait;if(outcome==='failure')throw Error('DOCUMENT_COPY_EXISTS');}return '/copy.md';}}},authoringError:()=> 'old error',showToast:key=>toasts.push(key),closeExportCenter:()=>closed=true,t:key=>key});
  vm.runInContext(sourceFunction,context);const exporting=context.performExportCenter();await entered;
  state.documentSession++;state.currentFile={path,content:'new'};release();await exporting;
  assert.equal(writes,phase==='read'?0:1);assert.equal(closed,false);assert.deepEqual(toasts,[]);assert.equal(state.currentFile.content,'new');
 }
});
