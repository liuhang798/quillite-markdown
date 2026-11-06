import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {UPDATE_REMINDER_DAY, updateReminderUntil, updateReminderSuppressed, updateReminderText, updateReleaseSummary, updateReleaseNotes, updateReleaseHistory, updateReleaseCount} from '../src/update-reminder.js';

const renderer = readFileSync(new URL('../src/renderer.js', import.meta.url), 'utf8');
const updateFunctions = renderer.slice(renderer.indexOf('function renderUpdateBanner('), renderer.indexOf('let automaticUpdateScheduled'));
const available = (latestVersion = '3.0.5', extra = {}) => ({checked:true, available:true, currentVersion:'3.0.2', latestVersion,
  summaryZh:'新增原包编辑，优化图片管理。', summaryEn:'Package editing and image improvements.', releaseNotes:'## Latest details', ...extra});
const deferred = () => { let resolve, reject; const promise = new Promise((a,b) => {resolve=a;reject=b;}); return {promise, resolve, reject}; };

function harness(info = available()) {
  const nodes = new Map(), calls = [], time = {now:Date.now()};
  const document = {activeElement:null, documentElement:{dataset:{platform:'windows'}}};
  const node = id => {
    if (nodes.has(id)) return nodes.get(id);
    const classes = new Set(['updateBanner','updateDialog','manualUpdateNotice','updateProgress'].includes(id) ? ['hidden'] : []);
    const element = {id, disabled:false, isConnected:true, textContent:'', innerHTML:'', title:'',
      classList:{contains:cls => classes.has(cls), add:cls => classes.add(cls), remove:cls => classes.delete(cls),
        toggle:(cls, force) => { const add = force === undefined ? !classes.has(cls) : force; add ? classes.add(cls) : classes.delete(cls); return add; }},
      querySelectorAll:() => [], getClientRects:() => classes.has('hidden') ? [] : [{}],
      focus:() => {document.activeElement=element;}, contains:target => element === target || (id==='updateBanner' && target?.id?.startsWith('updateBanner'))};
    nodes.set(id,element); return element;
  };
  document.body=node('body'); document.activeElement=node('editingText');
  const state = {language:'zh-CN',updateInfo:null,updateBannerVisible:false,updateReminderSuppressUntil:0,
    updateDismissPending:false,updateDismissEpoch:0,updateCheckSerial:0,updateManualChecks:0};
  const bridge = {checkForUpdates:async manual => {calls.push(['check',manual]);return info;},
    snoozeUpdates:async days => {calls.push(['snooze',days]);}};
  const context=vm.createContext({state,document,window:{quilliteMarkdown:bridge},els:{updateDialog:node('updateDialog')},
    $:selector => node(selector.replace(/^#/,'')), applyingUpdate:false,
    t:(key,params={}) => key + (Object.keys(params).length ? JSON.stringify(params) : ''),
    showToast:(...args) => calls.push(['toast',...args]),console:{warn:() => {}},openExternal:() => {},
    requestAnimationFrame:callback => callback(),
    Date:class extends Date { static now(){return time.now;} },
    marked:{parse:text => text},DOMPurify:{sanitize:text => text},
    escapeHtml:text => String(text).replace(/[&<>"']/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch])),
    UPDATE_REMINDER_DAY,updateReminderUntil,updateReminderSuppressed:value => updateReminderSuppressed(value,time.now),
    updateReminderText,updateReleaseSummary,updateReleaseNotes,updateReleaseHistory,updateReleaseCount});
  vm.runInContext(updateFunctions,context);
  return {context,state,bridge,node,calls,time,document};
}

test('release summaries are localized plain single-line bounded text with legacy fallback', () => {
  const info = available();
  assert.equal(updateReleaseSummary(info,'en'),info.summaryEn);
  assert.equal(updateReleaseSummary(info,'zh-CN'),info.summaryZh);
  assert.equal(updateReleaseSummary({summaryZh:' \n ',summary:'old summary'},'zh-CN'),'old summary');
  assert.equal(updateReleaseSummary({releaseNotes:'# Not a one-line summary'},'en','generic'),'generic');
  assert.equal(updateReminderText('  A\n\t B\u202eC\u0000 '),'A B C');
  assert.equal(Array.from(updateReminderText('🙂'.repeat(200))).length,181);
  assert.equal(updateReleaseSummary({summaryZh:'<img src="https://no.invalid/x">'},'zh-CN'),'<img src="https://no.invalid/x">');
  assert.equal(updateReleaseSummary({summaryZh:{}},'en','generic'),'generic');
});

test('suppression parses persisted dates and expires exactly at seven days', () => {
  const now=Date.now(), until=now+7*UPDATE_REMINDER_DAY;
  assert.equal(updateReminderUntil('not a date'),0);
  assert.equal(updateReminderUntil(null),0);
  assert.equal(updateReminderSuppressed(until,until-1),true);
  assert.equal(updateReminderSuppressed(until,until),false);
  assert.equal(updateReminderUntil(new Date(until).toISOString()),until);
});

test('late startup preferences cannot erase a fresh dismissal', async () => {
  const h=harness(); await h.context.checkForUpdates(false);
  const oldEpoch=h.state.updateDismissEpoch;
  await h.context.dismissUpdateBanner(); const until=h.state.updateReminderSuppressUntil;
  h.context.applyUpdateReminderPreferences({suppressUpdateUntil:''},oldEpoch);
  assert.equal(h.state.updateReminderSuppressUntil,until);
  const loaded=harness();
  loaded.context.applyUpdateReminderPreferences({suppressUpdateUntil:new Date(until).toISOString()},loaded.state.updateDismissEpoch);
  await loaded.context.checkForUpdates(false);
  assert.equal(loaded.node('updateBanner').classList.contains('hidden'),true);
});

test('history is bounded, deduplicated, newest-first and includes only skipped stable versions', () => {
  const info=available('3.0.10',{updates:[
    {version:'3.0.4',notesEn:' \n ',notesZh:'中文回退'},
    {version:'3.0.10',notesEn:'Latest',summaryEn:'Latest summary'},
    {version:'v3.0.4',notesEn:'duplicate'}, {version:'3.0.40',notesEn:'future'},
    {version:'3.0.2',notesEn:'current'},{version:'3.0.5-beta',notesEn:'preview'}, {version:'bad',notesEn:'bad'}]});
  const history=updateReleaseHistory(info,'en');
  assert.deepEqual(history.map(x=>x.version),['3.0.10','3.0.4']);
  assert.equal(history[1].notes,'中文回退');
  assert.equal(updateReleaseHistory({...info,updates:Array.from({length:50},(_,i)=>({version:'3.0.'+(i+3)})),latestVersion:'3.0.60'},'en').length,12);
  assert.equal(updateReleaseCount({}),0);
  assert.equal(updateReleaseCount({updateCount:'3'}),0);
  assert.equal(updateReleaseCount({updateCount:3}),3);
  const builds=updateReleaseHistory(available('3.0.6',{updates:[{version:'3.0.5+build-1'},{version:'3.0.5+build-2'}]}),'en');
  assert.equal(builds.length,2,'stable build metadata records match server history semantics');
});

test('long Unicode notes have explicit per-version truncation separate from bounded history', async () => {
  const raw='🙂'.repeat(5001), bounded=updateReleaseNotes(raw);
  assert.equal(Array.from(bounded.notes).length,5000);
  assert.equal(bounded.notes.endsWith('🙂'),true);
  assert.equal(bounded.notesTruncated,true);
  const h=harness(available('3.0.20',{updatesTruncated:false,updates:Array.from({length:12},(_,i)=>({version:'3.0.'+(i+3),notesZh:raw,notesEn:raw}))}));
  await h.context.checkForUpdates(true);
  const content=h.node('releaseNotes').innerHTML;
  assert.equal((content.match(/updateNotesTruncated/g)||[]).length,12);
  assert.doesNotMatch(content,/updateHistoryTruncated/);
  assert.match(content,/https:\/\/qm\.ssssa\.cn\/#changelog/);
  const signaled=harness(available('3.0.4',{updates:[{version:'3.0.4',notesZh:'already bounded',notesTruncated:true}]}));
  await signaled.context.checkForUpdates(true); assert.match(signaled.node('releaseNotes').innerHTML,/updateNotesTruncated/);
  const fallback=harness(available('3.0.4',{releaseNotes:raw}));
  await fallback.context.checkForUpdates(true); assert.match(fallback.node('releaseNotes').innerHTML,/updateNotesTruncated/);
});

test('automatic availability creates a quiet banner without opening or focusing a modal', async () => {
  const h=harness();
  await h.context.checkForUpdates(false);
  assert.equal(h.node('updateBanner').classList.contains('hidden'),false);
  assert.equal(h.node('updateDialog').classList.contains('hidden'),true);
  assert.equal(h.document.activeElement.id,'editingText');
  assert.equal(h.node('body').classList.contains('dialog-open'),false);
  assert.equal(h.node('updateBannerVersion').textContent,'v3.0.5');
  assert.equal(h.node('updateBannerSummary').textContent,available().summaryZh);
});

test('banner Update opens the original dialog and returns focus to its button', async () => {
  const h=harness(); await h.context.checkForUpdates(false);
  h.node('updateBannerOpen').focus(); h.context.openUpdateDialog(h.state.updateInfo);
  assert.equal(h.node('updateDialog').classList.contains('hidden'),false);
  assert.equal(h.node('body').classList.contains('dialog-open'),true);
  assert.equal(h.document.activeElement.id,'closeUpdate','opening the dialog must not focus an install action');
  assert.deepEqual(h.calls.filter(x=>x[0]==='snooze'),[],'opening the dialog does not pause the banner');
  assert.equal(h.node('releaseNotes').innerHTML,'## Latest details');
  h.context.closeUpdate(); assert.equal(h.document.activeElement.id,'updateBannerOpen');
});

test('one-click update and its hint appear only on platforms with an available in-app update', async () => {
  for (const platform of ['windows','darwin','linux','browser']) {
    const h=harness();
    h.document.documentElement.dataset.platform=platform;
    await h.context.checkForUpdates(true);
    const canApply=platform==='windows'||platform==='darwin';
    assert.equal(h.node('applyUpdate').classList.contains('hidden'),!canApply,platform);
    assert.equal(h.node('updateInlineHint').classList.contains('hidden'),!canApply,platform);
    assert.equal(h.node('manualUpdateNotice').classList.contains('hidden'),true,platform);
    assert.equal(h.node('openUpdatePage').textContent,'openDownloadPage',platform);
  }
});

test('portable, unsafe Windows and legacy Mac keep their original manual-only guidance', async () => {
  for (const [platform, reason, title, action] of [
    ['windows','windows-portable','portableUpdateTitle','portableUpdateButton'],
    ['windows','windows-unsafe-uninstaller','unsafeWindowsUninstallerTitle','unsafeWindowsUninstallerButton'],
    ['darwin','mac-legacy-updater','manualMacUpdateTitle','manualMacUpdateButton']
  ]) {
    const h=harness(available('3.0.5',{manualInstallRequired:true,manualInstallReason:reason}));
    h.document.documentElement.dataset.platform=platform;
    await h.context.checkForUpdates(true);
    assert.equal(h.node('applyUpdate').classList.contains('hidden'),true,reason);
    assert.equal(h.node('updateInlineHint').classList.contains('hidden'),true,reason);
    assert.equal(h.node('manualUpdateNotice').classList.contains('hidden'),false,reason);
    assert.equal(h.node('manualUpdateTitle').textContent,title,reason);
    assert.equal(h.node('openUpdatePage').textContent,action,reason);
    assert.equal(h.node('openUpdatePage').classList.contains('primary'),true,reason);
  }
});

test('dismiss persists seven days globally and explicit manual checks remain usable', async () => {
  const h=harness(); await h.context.checkForUpdates(false);
  await h.context.dismissUpdateBanner();
  assert.deepEqual(h.calls.filter(x=>x[0]==='snooze'),[['snooze',7]]);
  assert.equal(h.state.updateReminderSuppressUntil,h.time.now+7*UPDATE_REMINDER_DAY);
  h.bridge.checkForUpdates=async()=>available('3.0.6');
  await h.context.checkForUpdates(false);
  assert.equal(h.node('updateBanner').classList.contains('hidden'),true,'new version does not bypass the global interval');
  await h.context.checkForUpdates(true);
  assert.equal(h.node('updateDialog').classList.contains('hidden'),false);
  assert.equal(h.node('latestVersion').textContent,'3.0.6');
  assert.equal(h.node('updateBanner').classList.contains('hidden'),true);
  h.context.closeUpdate(); h.time.now+=7*UPDATE_REMINDER_DAY;
  await h.context.checkForUpdates(false);
  assert.equal(h.node('updateBanner').classList.contains('hidden'),false);
});

test('persisted suppression also hides an unsafe-uninstaller notice but not manual access', async () => {
  const h=harness(available('3.0.2',{available:false,manualInstallRequired:true,manualInstallReason:'windows-unsafe-uninstaller'}));
  h.state.updateReminderSuppressUntil=h.time.now+UPDATE_REMINDER_DAY;
  await h.context.checkForUpdates(false); assert.equal(h.node('updateBanner').classList.contains('hidden'),true);
  await h.context.checkForUpdates(true); assert.equal(h.node('updateDialog').classList.contains('hidden'),false);
  assert.equal(h.node('applyUpdate').classList.contains('hidden'),true);
});

test('late automatic check cannot resurrect a dismissed notice or replace an explicit modal', async () => {
  const h=harness(); await h.context.checkForUpdates(false);
  const pending=deferred(); h.bridge.checkForUpdates=()=>pending.promise;
  const check=h.context.checkForUpdates(false); await h.context.dismissUpdateBanner();
  pending.resolve(available('3.0.7')); await check;
  assert.equal(h.state.updateInfo.latestVersion,'3.0.5');
  assert.equal(h.node('updateBanner').classList.contains('hidden'),true);
  h.state.updateReminderSuppressUntil=0; h.state.updateBannerVisible=true;
  const later=deferred(); h.bridge.checkForUpdates=()=>later.promise;
  const second=h.context.checkForUpdates(false); h.context.openUpdateDialog(h.state.updateInfo);
  later.resolve(available('3.0.8')); await second;
  assert.equal(h.state.updateInfo.latestVersion,'3.0.5');
  assert.equal(h.node('latestVersion').textContent,'3.0.5');
});

test('manual checks take priority over startup automatic checks in either response order', async () => {
  const h=harness(), auto=deferred(), manual=deferred();
  h.bridge.checkForUpdates=force => force?manual.promise:auto.promise;
  const first=h.context.checkForUpdates(false), second=h.context.checkForUpdates(true);
  auto.resolve(available('3.0.9')); await first;
  assert.equal(h.node('updateDialog').classList.contains('hidden'),true);
  manual.resolve(available('3.0.6')); await second;
  assert.equal(h.node('latestVersion').textContent,'3.0.6');
  const other=harness(), pending=deferred(); let checks=0;
  other.bridge.checkForUpdates=()=>{checks++;return pending.promise;};
  const explicit=other.context.checkForUpdates(true); await other.context.checkForUpdates(false);
  assert.equal(checks,1,'scheduled auto must not invalidate a pending manual check');
  pending.resolve(available()); await explicit;
  await other.context.checkForUpdates(false); assert.equal(checks,1,'auto must not mutate an already-open modal');
});

test('double dismissal is serialized and persistence failure restores an actionable notice', async () => {
  const h=harness(); await h.context.checkForUpdates(false);
  const save=deferred(); let calls=0; h.bridge.snoozeUpdates=()=>{calls++;return save.promise;};
  const first=h.context.dismissUpdateBanner(), second=h.context.dismissUpdateBanner(); await second;
  assert.equal(calls,1); save.reject(Error('disk full')); await first;
  assert.equal(h.state.updateReminderSuppressUntil,0);
  assert.equal(h.node('updateBanner').classList.contains('hidden'),false);
  assert.equal(h.node('updateBannerDismiss').disabled,false);
  assert.ok(h.calls.some(x=>x[0]==='toast'&&x[1]==='updateReminderSaveFailed'));
});

test('checks and repeat opens cannot reset an active installer or its chosen metadata', async () => {
  const h=harness(); await h.context.checkForUpdates(false); h.context.openUpdateDialog(h.state.updateInfo);
  h.context.applyingUpdate=true; const current=h.state.updateInfo;
  const before=h.calls.filter(x=>x[0]==='check').length;
  await h.context.checkForUpdates(true); await h.context.checkForUpdates(false);
  h.context.openUpdateDialog(available('3.0.99'));
  assert.equal(h.state.updateInfo,current);
  assert.equal(h.calls.filter(x=>x[0]==='check').length,before);
});

test('history uses independent localized sections and marks bounded history without changing install target', async () => {
  const h=harness(available('3.0.6',{updateCount:9,updatesTruncated:true,updates:[
    {version:'3.0.4',summaryZh:'四',summaryEn:'Four',notesZh:'四说明',notesEn:'Four notes'},
    {version:'3.0.6',summaryZh:'六',summaryEn:'Six',notesZh:'六说明',notesEn:'Six notes'}]}));
  await h.context.checkForUpdates(false);
  assert.match(h.node('updateBannerCount').textContent,/9/);
  h.state.language='en'; h.context.renderUpdateBanner(); h.context.openUpdateDialog(h.state.updateInfo);
  const content=h.node('releaseNotes').innerHTML;
  assert.ok(content.indexOf('v3.0.6')<content.indexOf('v3.0.4'));
  assert.match(content,/Six notes/); assert.match(content,/updateHistoryTruncated/);
  assert.equal(h.node('latestVersion').textContent,'3.0.6');
  assert.equal(h.node('updateBannerSummary').textContent,available().summaryEn);
});
