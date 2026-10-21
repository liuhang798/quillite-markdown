import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import {createServer} from 'vite';
const playwright=createRequire(import.meta.url)(process.env.PLAYWRIGHT_MODULE||'playwright');
// On macOS a real Control-click is a context click, not a selection click.
const primary=process.platform==='darwin'?'Meta':'Control';
const server=await createServer({root:fileURLToPath(new URL('..',import.meta.url)),server:{host:'127.0.0.1',port:0,watch:null,hmr:false},logLevel:'error',plugins:[{
 name:'isolated-recent-selection',enforce:'pre',transform(code,id){if(id.replaceAll('\\','/').endsWith('/src/renderer.js'))return code+`\nwindow.recentAudit={seed(prefs){applyLibraryPreferences(prefs);setSidebarMode('recent');},snapshot(){return {selection:state.recentSelection,dirty:state.dirty,current:state.currentFile?.path,text:codeEditor?editorContent():null,favorites:state.favoriteFiles.map(f=>f.path),pins:state.pinnedRecentFiles};}};`;}
}]});
let browser;
try{
 const engine=process.env.RECENT_BROWSER||'chromium';
 await server.listen();browser=await playwright[engine].launch({headless:true,...(engine==='chromium'?{executablePath:process.env.BROWSER_EXECUTABLE||undefined}:{})});
 const page=await browser.newPage({viewport:{width:1450,height:1000}}),errors=[];
 page.on('pageerror',e=>errors.push(e.message));
 // Model a desktop WebView without a JavaScript confirm delegate. No entry
 // point may depend on native confirm, including retry and keyboard removal.
 await page.addInitScript(()=>{window.confirm=()=>{throw Error('Native confirm unavailable');};});
 await page.route('**/*',r=>new URL(r.request().url()).hostname==='127.0.0.1'?r.continue():r.abort());
 await page.goto(server.resolvedUrls.local[0]);await page.waitForFunction(()=>window.recentAudit&&window.quilliteMarkdown);
 await page.evaluate(()=>{
  window.recentPrefs={recentFiles:['C:/pinned.md','C:/keep.md','C:/missing.md','C:/fail.md'],pinnedRecentFiles:['C:/pinned.md'],favoriteFiles:['C:/pinned.md'],recentFileStatuses:[{path:'C:/missing.md',exists:false}]};
  window.removed=[];window.opened=[];window.failRemoval=true;
  window.quilliteMarkdown.getPreferences=async()=>window.recentPrefs;
  window.quilliteMarkdown.removeRecent=async path=>{window.removed.push(path);await new Promise(r=>setTimeout(r,60));if(path==='C:/fail.md'&&window.failRemoval)throw Error('Synthetic preference failure');window.recentPrefs.recentFiles=window.recentPrefs.recentFiles.filter(p=>p!==path);window.recentPrefs.pinnedRecentFiles=window.recentPrefs.pinnedRecentFiles.filter(p=>p!==path);return window.recentPrefs;};
  window.quilliteMarkdown.openRecentFile=async path=>{window.opened.push(path);return{path,name:path.split('/').at(-1),directory:'C:/',content:'# Original',revision:'a'.repeat(64)};};
  window.quilliteMarkdown.reportErrorLog=async()=>{};
  window.recentAudit.seed(window.recentPrefs);
 });
 const row=name=>page.locator('.file-item').filter({has:page.locator('strong',{hasText:name})});
 const selected=()=>page.evaluate(()=>recentAudit.snapshot().selection);
 await row('pinned.md').click({modifiers:[primary]});
 await row('missing.md').click({modifiers:[primary,'Shift']});
 assert.deepEqual(await selected(),['C:/pinned.md','C:/keep.md','C:/missing.md']);
 assert.deepEqual(await page.evaluate(()=>window.opened),[]);
 // Shift alone replaces a range, keeping the original anchor for shrink/extend.
 await row('keep.md').click({modifiers:['Shift']});
 assert.deepEqual(await selected(),['C:/pinned.md','C:/keep.md']);
 await row('keep.md').press('Escape');
 await row('missing.md').click({modifiers:['Meta']});
 await row('pinned.md').click({modifiers:['Meta','Shift']});
 assert.deepEqual(await selected(),['C:/pinned.md','C:/keep.md','C:/missing.md']);
 await row('pinned.md').press('Escape');
 // Existing non-contiguous selection remains when adding a new range.
 await row('fail.md').click({modifiers:[primary]});
 await row('pinned.md').click({modifiers:[primary]});
 await row('keep.md').press(`${primary}+Shift+Space`);
 assert.deepEqual(await selected(),['C:/pinned.md','C:/keep.md','C:/fail.md']);
 await page.locator('#cancelRecentSelection').click();
 await row('missing.md').click({modifiers:[primary,'Shift']});
 assert.deepEqual(await selected(),['C:/missing.md'],'cancel resets the range anchor');
 await row('missing.md').press('Escape');
 await row('pinned.md').click({modifiers:[primary]});
 await row('keep.md').click({modifiers:['Meta']});
 assert.equal(await page.locator('.bulk-selected').count(),2);
 assert.deepEqual(await page.evaluate(()=>window.opened),[]);
 await row('keep.md').click({modifiers:['Meta']});assert.equal(await page.locator('.bulk-selected').count(),1);
 await row('pinned.md').press('Escape');assert.equal(await page.locator('.bulk-selected').count(),0);
 await row('keep.md').press(`${primary}+Space`);assert.equal(await page.locator('.bulk-selected').count(),1);
 await row('pinned.md').click();await page.locator('#markdownContent h1').waitFor();
 assert.equal(await page.locator('.bulk-selected').count(),0);
 await page.locator('#editButton').click();await page.locator('[data-editor-presentation="source"]').click();
 await page.locator('#markdownEditor > .cm-editor > .cm-scroller > .cm-content').fill('# Unsaved original');
 const before=await page.evaluate(()=>window.recentAudit.snapshot());assert.equal(before.dirty,true);
 for(const name of ['pinned.md','missing.md','fail.md'])await row(name).click({modifiers:[primary]});
 assert.equal(await page.locator('.bulk-selected').count(),3);
 await page.locator('#clearSelectedRecent').click();
 await page.locator('#recentClearDialog').waitFor();
 assert.equal(await page.locator('#cancelRecentClear').evaluate(el=>el===document.activeElement),true);
 assert.ok((await page.locator('#recentClearDescription').textContent()).includes('3'));
 if(process.env.AUDIT_OUTPUT)await page.screenshot({path:`${process.env.AUDIT_OUTPUT}/recent-clear-${engine}.png`,animations:'disabled'});
 // Confirmation is modal; shortcut events must not act on the background.
 await page.locator('#cancelRecentClear').press(`${primary}+e`);
 assert.equal(await page.locator('#editorView').isVisible(),true);
 await page.locator('#cancelRecentClear').press('Escape');
 await page.waitForFunction(()=>!document.querySelector('#clearSelectedRecent').disabled);
 assert.equal(await page.locator('.bulk-selected').count(),3);
 assert.deepEqual(await page.evaluate(()=>window.removed),[]);
 await page.locator('#clearSelectedRecent').click();
 await page.locator('#cancelRecentClear').click();
 await page.waitForFunction(()=>!document.querySelector('#clearSelectedRecent').disabled);
 assert.deepEqual(await page.evaluate(()=>window.removed),[]);
 await page.locator('#clearSelectedRecent').click();
 // Reentrant action must not open a second dialog or duplicate writes.
 await page.locator('#clearSelectedRecent').evaluate(el=>el.dispatchEvent(new MouseEvent('click',{bubbles:true})));
 await page.locator('#confirmRecentClear').click();
 await page.waitForFunction(()=>!document.querySelector('#clearSelectedRecent').disabled);
 assert.deepEqual(await page.evaluate(()=>window.removed),['C:/pinned.md','C:/missing.md','C:/fail.md']);
 assert.equal(await page.locator('.file-item').count(),2);assert.equal(await page.locator('.bulk-selected').count(),1);
 const after=await page.evaluate(()=>window.recentAudit.snapshot());
 assert.equal(after.text,before.text);assert.equal(after.dirty,true);assert.equal(after.current,before.current);
 assert.deepEqual(after.favorites,['C:/pinned.md']);assert.deepEqual(after.pins,[]);
 await page.locator('#favoritesTab').click();assert.equal(await page.locator('#recentSelectionActions').isVisible(),false);
 assert.equal(await page.locator('.file-item').count(),1);
 await page.locator('#recentTab').click();assert.equal(await page.locator('.bulk-selected').count(),0);
 await row('fail.md').click({modifiers:[primary]});await row('fail.md').click({button:'right'});
 await page.evaluate(()=>window.failRemoval=false);
 await page.locator('#recentRemoveAction').click();
 await page.locator('#confirmRecentClear').click();await page.waitForFunction(()=>document.querySelectorAll('.file-item').length===1);
 assert.equal(await page.locator('.file-item strong').textContent(),'keep.md');
 await row('keep.md').click({modifiers:[primary]});await row('keep.md').press('Delete');
 await page.locator('#confirmRecentClear').click();
 await page.locator('.empty-list').waitFor();
 assert.equal((await page.evaluate(()=>window.recentAudit.snapshot())).text,before.text);
 await page.locator('#recentTab').click();assert.equal(await page.locator('.file-item').count(),0);
 assert.deepEqual(errors,[]);
 console.log(`PASS ${engine}: Ctrl/Meta toggle, keyboard, no native confirm, modal cancel/Escape/reentrancy, toolbar/context menu/Delete, partial failure/retry, pinned/missing records, favorites and dirty document preserved, empty-list persistence`);
}finally{await browser?.close();await server.close();}
