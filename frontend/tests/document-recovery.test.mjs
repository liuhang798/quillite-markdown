import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const main = readFileSync(new URL('../src/main.js', import.meta.url), 'utf8');
const renderer = readFileSync(new URL('../src/renderer.js', import.meta.url), 'utf8');

test('crash recovery has a manual restore-or-later startup flow', () => {
  assert.match(html, /id="recoveryDialog"/);
  assert.match(html, /id="discardRecovery"/);
  assert.match(html, /id="restoreRecovery"/);
  assert.match(main, /saveRecoverySnapshot:\s*input/);
  assert.match(main, /getRecoverySnapshot:/);
  assert.match(main, /clearRecoverySnapshot:/);
  assert.match(renderer, /async function offerRecoverySnapshot\(\)/);
  assert.match(renderer, /async function restoreRecoverySnapshot\(\)/);
  assert.match(renderer, /scheduleRecoverySnapshot\(performance\)/);
});

test('successful saves and explicit discards clear recovery data', () => {
  assert.match(renderer, /if \(unchangedSinceSave\)\s*{\s*if \(typeof clearRecoverySnapshot === 'function'\) await clearRecoverySnapshot/);
  assert.match(renderer, /if \(state\.dirty\) void clearRecoverySnapshot\(\)/);
  assert.match(renderer, /#discardRecovery[^\n]+discardRecoverySnapshot/);
});

test('opening any document suspends the hidden editor preview instead of rendering twice', () => {
  const opening = renderer.slice(renderer.indexOf('function displayDocument('), renderer.indexOf('function closePreview('));
  assert.match(opening, /suspendEditorPreview\(\)/);
  assert.doesNotMatch(opening, /renderEditorPreview\(/);
  assert.match(renderer, /function suspendEditorPreview\(\)[\s\S]*?cancelMermaidRendering\(els.editorPreview\)[\s\S]*?releaseEChartsDiagrams\(els.editorPreview\)[\s\S]*?els.editorPreview.replaceChildren\(\)/);
});

function recoveryHarness(snapshot, disk) {
  const calls = [];
  const state = { documentSession: 1, documentOpenRequest: 0, currentFile: null, editing: false };
  let timer;
  const context = vm.createContext({
    state, pendingRecoverySnapshot: snapshot, recoveryRestoreRequest: 0, lastRecoveryContent: '', lastRecoveryContext: '',
    setRecoveryBusy: value => calls.push(['busy', value]),
    beginDocumentOpen: () => ({id:++state.documentOpenRequest,session:state.documentSession,content:state.currentFile?.content}),
    $: () => ({}), window: { quilliteMarkdown: {
      readFile: async () => disk,
      saveRecoverySnapshot: async input => calls.push(['backup', input]),
      clearRecoverySnapshot: async () => calls.push(['clear']),
    } },
    displayDocument: doc => { state.currentFile = { ...doc }; state.documentSession++; state.documentConflict = null; state.saveAsRequired = false; },
    toggleEditor: async () => { state.editing = true; },
    editorContent: () => state.currentFile.content,
    setDirty: value => { state.dirty = Boolean(value) || Boolean(state.documentConflict); },
    closeRecoveryDialog() {}, showToast() {}, t: key => key, reportSilentError() {},
    openDocumentConflict: async () => calls.push(['compare']),
    codeEditor: { state: { doc: { length: 10 } } },
    documentPerformanceProfile: () => ({ recoveryDelay: 0 }),
    sameDocumentPath: (a, b) => a === b,
    clearTimeout() {}, setTimeout: callback => { timer = callback; },
  });
  vm.runInContext(renderer.slice(renderer.indexOf('function cancelScheduledRecoverySnapshot('), renderer.indexOf('function maybeDiscardChanges(')), context);
  vm.runInContext(renderer.slice(renderer.indexOf('async function restoreRecoverySnapshot('), renderer.indexOf('function closeDocumentHistory(')), context);
  return { context, state, calls, tick: async () => { if (timer) await timer(); } };
}

test('recovery pauses conflicts, legacy snapshots, invalid revisions and changed baselines', async () => {
  const disk = { path: '/a.md', content: 'disk', revision: 'b'.repeat(64) };
  for (const meta of [{}, { baseRevision: 'invalid' }, { baseRevision: 'a'.repeat(64) }, { baseRevision: disk.revision, conflict: true }]) {
    const h = recoveryHarness({ path: disk.path, content: 'unconfirmed local', ...meta }, disk);
    await h.context.restoreRecoverySnapshot();
    assert.equal(h.state.currentFile.content, 'unconfirmed local');
    assert.ok(h.state.documentConflict);
    assert.equal(h.state.saveAsRequired, true);
    assert.equal(h.state.dirty, true);
    assert.ok(h.calls.some(call => call[0] === 'compare'));
    await h.tick();
    const backup = h.calls.find(call => call[0] === 'backup')[1];
    assert.equal(backup.conflict, true);
    assert.equal(backup.content, 'unconfirmed local');
  }
});

test('unchanged known recovery baseline keeps normal revision-protected saving', async () => {
  const disk = { path: '/a.md', content: 'disk', revision: 'b'.repeat(64) };
  const h = recoveryHarness({ path: disk.path, content: 'local', baseRevision: disk.revision }, disk);
  await h.context.restoreRecoverySnapshot();
  assert.equal(h.state.documentConflict, null);
  assert.equal(h.state.currentFile.revision, disk.revision);
  assert.equal(h.state.dirty, true);
  assert.ok(!h.calls.some(call => call[0] === 'compare'));
});

test('conflicted content equal to original baseline stays backed up, and changed metadata bypasses dedupe', async () => {
  const disk = { path: '/a.md', content: 'original', revision: 'a'.repeat(64) };
  const h = recoveryHarness({ path: disk.path, content: 'original', baseRevision: disk.revision, conflict: true }, disk);
  await h.context.restoreRecoverySnapshot();
  await h.tick();
  assert.equal(h.state.dirty, true);
  assert.ok(!h.calls.some(call => call[0] === 'clear'));
  assert.equal(h.calls.filter(call => call[0] === 'backup').length, 1);
  h.context.scheduleRecoverySnapshot();
  await h.tick();
  assert.equal(h.calls.filter(call => call[0] === 'backup').length, 1);
  h.state.currentFile.revision = 'c'.repeat(64);
  h.context.scheduleRecoverySnapshot();
  await h.tick();
  assert.equal(h.calls.filter(call => call[0] === 'backup').length, 2);
});

test('recovery ignores a late disk read after switching document sessions', async () => {
  const h = recoveryHarness({ path: '/a.md', content: 'old' }, null);
  let resolve;
  h.context.window.quilliteMarkdown.readFile = () => new Promise(done => { resolve = done; });
  const restoring = h.context.restoreRecoverySnapshot();
  h.state.documentSession++;
  h.state.currentFile = { path: '/b.md', content: 'new' };
  resolve({ path: '/a.md', content: 'disk', revision: 'a'.repeat(64) });
  await restoring;
  assert.equal(h.state.currentFile.content, 'new');
  assert.deepEqual(h.calls, [['busy', true], ['busy', false]]);
});

test('leaving editing mode does not stop unresolved conflict backups', async () => {
  const disk = { path: '/a.md', content: 'external', revision: 'b'.repeat(64) };
  const h = recoveryHarness({ path: disk.path, content: 'local', conflict: true }, disk);
  await h.context.restoreRecoverySnapshot();
  h.state.editing = false;
  h.context.editorContent = () => { throw new Error('hidden editor may be stale'); };
  await h.tick();
  const backup = h.calls.find(call => call[0] === 'backup')[1];
  assert.equal(backup.content, 'local');
  assert.equal(backup.conflict, true);
});

test('dirty editor prevents recovery from reading or replacing the current document',async()=>{
 const h=recoveryHarness({path:'/old.md',content:'old'},null);h.state.currentFile={path:'/current.md',content:'new unsaved'};h.state.dirty=true;
 h.context.window.quilliteMarkdown.readFile=()=>assert.fail('dirty recovery must not read');
 await h.context.restoreRecoverySnapshot();assert.equal(h.state.currentFile.content,'new unsaved');
});
for(const change of ['content','request'])test(`late recovery checks ${change} even within the same session`,async()=>{
 const h=recoveryHarness({path:'/old.md',content:'old'},null);h.state.currentFile={path:'/current.md',content:'saved'};
 let resolve;h.context.window.quilliteMarkdown.readFile=()=>new Promise(r=>{resolve=r;});const work=h.context.restoreRecoverySnapshot();
 if(change==='content')h.state.currentFile.content='just typed';else h.state.documentOpenRequest++;
 resolve({path:'/old.md',content:'disk'});await work;assert.equal(h.state.currentFile.path,'/current.md');assert.equal(h.state.currentFile.content,change==='content'?'just typed':'saved');
});
test('typing while recovery editor mounts is not overwritten on return',async()=>{
 const h=recoveryHarness({path:'/a.md',content:'old',baseRevision:'a'.repeat(64)},{path:'/a.md',content:'disk',revision:'a'.repeat(64)});
 h.context.toggleEditor=async()=>{h.state.editing=true;h.state.currentFile.content='old plus new typing';};await h.context.restoreRecoverySnapshot();assert.equal(h.state.currentFile.content,'old plus new typing');assert.equal(h.state.dirty,true);
});

test('recovery cancellation is hidden once content is applied, before asynchronous editor mounting',async()=>{
 const h=recoveryHarness({path:'/a.md',content:'old',baseRevision:'a'.repeat(64)},{path:'/a.md',content:'disk',revision:'a'.repeat(64)});
 let hidden=false;h.context.closeRecoveryDialog=()=>{hidden=true;};h.context.toggleEditor=async()=>{assert.equal(hidden,true);assert.equal(h.state.currentFile.content,'old');h.state.editing=true;};
 await h.context.restoreRecoverySnapshot();
});

for(const phase of ['read','create'])for(const reject of [false,true])test(`cancelled recovery ignores late ${phase} ${reject?'failure':'success'}`,async()=>{
 const h=recoveryHarness({path:'/old.md',content:'old'},null);let finish,startedResolve;
 const started=new Promise(resolve=>{startedResolve=resolve;});
 const pending=()=>new Promise((resolve,fail)=>{finish=reject?()=>fail(Error('late failure')):()=>resolve({path:'/new.md',content:'',draft:true});startedResolve();});
 h.context.window.quilliteMarkdown.readFile=phase==='read'?pending:async()=>{throw Error('missing');};
 h.context.window.quilliteMarkdown.newFile=phase==='create'?pending:()=>assert.fail('cancelled read cannot create a draft');
 const work=h.context.restoreRecoverySnapshot();await started;
 h.context.recoveryRestoreRequest++;h.state.currentFile={path:'/current.md',content:'new input'};finish();await work;
 assert.equal(h.state.currentFile.content,'new input');assert.deepEqual(h.calls,[['busy',true]],'stale finally cannot unlock a newer operation');
});

test('unreadable source restores to a separate revision-protected draft without false conflict',async()=>{
 const h=recoveryHarness({path:'/old.md',content:'old',baseRevision:'a'.repeat(64),conflict:true},null);
 h.context.window.quilliteMarkdown.readFile=async()=>{throw Error('missing');};
 h.context.window.quilliteMarkdown.newFile=async()=>({path:'/new.md',content:'',draft:true,revision:'b'.repeat(64)});
 await h.context.restoreRecoverySnapshot();assert.equal(h.state.currentFile.path,'/new.md');assert.equal(h.state.currentFile.content,'old');assert.equal(h.state.currentFile.draft,true);assert.equal(h.state.currentFile.revision,'b'.repeat(64));assert.equal(h.state.documentConflict,null);assert.equal(h.state.dirty,true);assert.ok(!h.calls.some(c=>c[0]==='compare'));
 await h.tick();const backup=h.calls.find(c=>c[0]==='backup')[1];assert.equal(backup.baseRevision,'b'.repeat(64));assert.equal(backup.conflict,false);
});

for(const target of [{path:'/old.md',draft:true},{path:'/existing.md',draft:false},null])test(`invalid fallback target is never adopted: ${target?.path||'null'}`,async()=>{
 const h=recoveryHarness({path:'/old.md',content:'old'},null);h.state.currentFile={path:'/current.md',content:'current'};
 h.context.window.quilliteMarkdown.readFile=async()=>{throw Error('missing');};h.context.window.quilliteMarkdown.newFile=async()=>target;
 await h.context.restoreRecoverySnapshot();assert.equal(h.state.currentFile.path,'/current.md');assert.equal(h.state.currentFile.content,'current');
});
