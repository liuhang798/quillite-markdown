// Actual UI and editor, with isolated bridge/recovery fixtures. Does not open
// native pickers, write user documents, use the OS clipboard or upload data.
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { createServer } from 'vite';
const playwright = createRequire(import.meta.url)(process.env.PLAYWRIGHT_MODULE || 'playwright');
const engine = process.env.BUNDLE_BROWSER || 'chromium';
const output = process.env.BUNDLE_OUTPUT_DIR;
const server = await createServer({ root:fileURLToPath(new URL('..',import.meta.url)),
  server:{host:'127.0.0.1',port:Number(process.env.BUNDLE_PORT)||41740,watch:null,hmr:false},logLevel:'error',
  plugins:[{name:'bundle-document-test-only',enforce:'pre',transform(code,id) {
    if (!id.replaceAll('\\','/').endsWith('/src/renderer.js')) return;
    return code + '\nwindow.bundleDocumentUI={state,save:saveDocument,open:displayDocument,'
      + 'replace:text=>codeEditor.dispatch({changes:{from:0,to:codeEditor.state.doc.length,insert:text},selection:{anchor:text.length}}),'
      + 'restore:async snapshot=>{pendingRecoverySnapshot=snapshot;await restoreRecoverySnapshot();},'
      + 'pendingRecovery:()=>pendingRecoverySnapshot};';
  }}] });
let browser;
try {
  if (output) await mkdir(output,{recursive:true});
  await server.listen();
  browser = await playwright[engine].launch({headless:true,...(engine==='chromium'&&process.env.BROWSER_EXECUTABLE?{executablePath:process.env.BROWSER_EXECUTABLE}:{})});
  for (const name of ['save-assets-autosave-copy','textbundle-save','textbundle-folder-open','save-format-cancel','conflict-merge','save-and-recovery-failures','partial-save','session-persistence-warning','recover-conflict','recover-fail-closed','stale-save']) {
    const page = await browser.newPage({viewport:{width:1440,height:940}}), errors=[], remote=[];
    page.on('pageerror',error=>errors.push(error.message));
    page.on('dialog',dialog=>dialog.accept());
    await page.route('**/*',route=>{
      if (new URL(route.request().url()).hostname==='127.0.0.1') return route.continue();
      remote.push(route.request().url());return route.abort();
    });
    await page.addInitScript(()=>{
      localStorage.setItem('language','zh-CN');
      localStorage.setItem('editorPresentation','source');
      localStorage.setItem('editorLayout','editor-only');
    });
    await page.goto(server.resolvedUrls.local[0]);
    await page.waitForFunction(()=>window.quilliteMarkdown&&window.bundleDocumentUI&&document.querySelector('#fileList')?.childElementCount);
    await page.evaluate(()=>{
      const png='data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a9WQAAAAASUVORK5CYII=';
      const initial='# ORIGINAL PACKAGE\n\n![local](assets/original.png)\n\n![online](https://image.invalid/original.png)\n';
      const make=(changes={})=>({path:'/origin/notes.textpack',name:'notes.textpack',directory:'/owned/session-a',
        resourcePath:'/owned/session-a/text.md',packageDirectory:'/origin',bundleKind:'textpack',
        bundleSessionId:'session-a',bundleTextPath:'text.md',revision:'a'.repeat(64),content:initial,...changes});
      const audit=window.bundleAudit={make,initial,writes:[],copies:[],recoveries:[],events:[],imageCalls:[],ordinary:[],
        mode:'normal',recoveryError:false,pending:null,resumeError:false,doc:make()};
      const api=window.quilliteMarkdown;
      Object.assign(api,{
        openFile:async()=>{audit.doc=make(audit.openKind==='textbundle'?{path:'/origin/notes.textbundle',name:'notes.textbundle',bundleKind:'textbundle'}:{});return audit.doc;},
        openFolder:async()=>{audit.doc=make({path:'/origin/notes.textbundle',name:'notes.textbundle',bundleKind:'textbundle'});return {document:audit.doc};},
        canEditFile:async()=>true,reportErrorLog:async()=>{},
        readImageData:async(ref,directory)=>{audit.imageCalls.push([ref,directory]);return png;},
        selectImage:async path=>{audit.imageCalls.push(['select',path]);return 'assets/new.png';},
        saveRecoverySnapshot:async snapshot=>{audit.events.push('recovery');audit.recoveries.push({...snapshot});if(audit.recoveryError)throw Error('recovery disk full');},
        clearRecoverySnapshot:async()=>{audit.events.push('clear-recovery');},
        saveBundleDocument:async(...args)=>{
          audit.events.push('save');audit.writes.push(args);
          if(audit.mode==='error')throw Error('TEXTBUNDLE_SAVE_FAILED');
          if(audit.mode==='partial')throw Error('BUNDLE_PARTIAL_SAVE: DOCUMENT_CONFLICT before Markdown commit');
          if(audit.mode==='conflict')throw Error('DOCUMENT_CONFLICT: metadata changed');
          if(audit.mode==='deferred')return new Promise(resolve=>audit.pending=resolve);
          audit.doc={...audit.doc,path:args[0],content:args[1],revision:'c'.repeat(64),bundleSessionId:args[3],
            warning:audit.mode==='session-warning'?'BUNDLE_SESSION_PERSIST_WARNING':''};
          return audit.doc;
        },
        saveDocumentAsFormat:async(...args)=>{audit.copies.push(args);const kind=args[3];return make({path:'/copies/notes-copy.'+(kind==='markdown'?'md':kind),name:'notes-copy.'+kind,
          bundleKind:kind==='markdown'?'':kind,content:args[1],bundleSessionId:kind==='markdown'?'':'copy-session',directory:'/owned/copied',resourcePath:'/owned/copied/text.md',packageDirectory:'/copies'});},
        readDocumentConflict:async()=>make({content:'# DISK PACKAGE\n\nExternal metadata and text.',revision:'b'.repeat(64),
          bundleSessionId:'disk-session',directory:'/owned/disk',resourcePath:'/owned/disk/text.md'}),
        rebaseBundleDocument:async(...args)=>{audit.rebase=args;audit.mode='normal';audit.doc=make({revision:'b'.repeat(64),
          bundleSessionId:'merged-session',directory:'/owned/merged',resourcePath:'/owned/merged/text.md'});return audit.doc;},
        resumeBundleDocument:async(...args)=>{audit.resumed=args;if(audit.resumeError)throw Error('BUNDLE_SESSION_MISSING');
          return make({bundleSessionId:args[1],revision:args[2],bundleConflict:true,directory:'/owned/recovered',resourcePath:'/owned/recovered/text.md',content:'# BASELINE'});},
        readFile:async()=>{audit.ordinary.push('read');throw Error('unexpected ordinary file read');},
        newFile:async()=>{audit.ordinary.push('new');throw Error('unexpected ordinary draft');},
        saveFile:async()=>{audit.ordinary.push('save');throw Error('unexpected ordinary save');},
        saveAs:async()=>{audit.ordinary.push('copy');throw Error('unexpected ordinary copy');},
        saveConflictCopy:async()=>{audit.ordinary.push('conflict-copy');throw Error('unexpected ordinary conflict copy');}
      });
    });
    const direct = async(kind='textpack')=>{
      await page.evaluate(kind=>bundleAudit.openKind=kind,kind);
      await page.locator(name==='textbundle-folder-open'?'#openFolderButton':'#openFileButton').click();
      await page.waitForFunction(()=>bundleDocumentUI.state.currentFile?.bundleSessionId==='session-a');
      assert.equal(await page.locator('[data-action="open-editable-bundle"], [data-action="import-textbundle"]').count(),0);
      assert.equal(remote.length,0,'direct package opening must not fetch remote resources before consent');
      await page.locator('#editButton').click();
      await page.locator('#markdownEditor > .cm-editor').waitFor();
      assert.match(await page.locator('#editorDocumentLocation').textContent(),/文档位置.*\/origin/);
      assert.doesNotMatch(await page.locator('#editorDocumentLocation').textContent(),/\/owned\//);
    };
    const replace = text=>page.evaluate(text=>bundleDocumentUI.replace(text),text);
    const save = async()=>{
      await page.locator('#saveButton').click();
      await page.waitForFunction(()=>!bundleDocumentUI.state.saving);
    };
    const copy = async(format='textpack')=>{
      await page.evaluate(()=>void bundleDocumentUI.save(true));
      await page.locator('#documentSaveFormatDialog').waitFor({state:'visible'});
      if(output&&name==='save-assets-autosave-copy') {
        await page.setViewportSize({width:800,height:600});
        await page.screenshot({path:join(output,'bundle-save-as-compact-'+engine+'.png'),animations:'disabled'});
        await page.setViewportSize({width:1440,height:940});
      }
      await page.locator(`[data-save-format="${format}"]`).click();
      await page.locator('#confirmDocumentSaveFormat').click();
      await page.waitForFunction(()=>!bundleDocumentUI.state.saving);
    };
    if(name==='save-assets-autosave-copy'||name==='textbundle-save'||name==='textbundle-folder-open') {
      const kind=name==='save-assets-autosave-copy'?'textpack':'textbundle';
      await direct(kind);
      await replace('# EDITED PACKAGE\n\n![local](assets/original.png)');
      await save();
      const first=await page.evaluate(()=>({write:bundleAudit.writes[0],events:bundleAudit.events.slice(),doc:bundleDocumentUI.state.currentFile}));
      assert.equal(first.write[0],'/origin/notes.'+kind);
      assert.equal(first.write[2],'a'.repeat(64));assert.equal(first.write[3],'session-a');
      assert.ok(first.events.indexOf('recovery')<first.events.indexOf('save'),'recovery must complete before committing the package');
      assert.equal(first.doc.bundleKind,kind);
      assert.equal(await page.locator('#renameDocumentButton').isDisabled(),true);
      if(name==='save-assets-autosave-copy') {
        await page.evaluate(()=>document.querySelector('button[data-format="image"]').click());
        await page.locator('#pickLocalImage').click();
        await page.waitForFunction(()=>bundleDocumentUI.state.currentFile.content.includes('assets/new.png'));
        const calls=await page.evaluate(()=>bundleAudit.imageCalls);
        assert.ok(calls.some(x=>x[0]==='select'&&x[1]==='/owned/session-a/text.md'),'image insertion must target the package workspace, not its parent folder');
        await page.waitForFunction(()=>bundleAudit.writes.length>=2,null,{timeout:16000});
        const auto=await page.evaluate(()=>({write:bundleAudit.writes.at(-1),snapshot:bundleAudit.recoveries.at(-1)}));
        assert.equal(auto.write[0],'/origin/notes.textpack');assert.match(auto.write[1],/assets\/new\.png/);
        assert.equal(auto.snapshot.bundleSessionId,'session-a');
        await copy();
        await page.waitForFunction(()=>bundleDocumentUI.state.currentFile.path==='/copies/notes-copy.textpack');
        assert.equal(await page.evaluate(()=>bundleAudit.copies[0][2]),'session-a');
        assert.equal(await page.evaluate(()=>bundleDocumentUI.state.currentFile.bundleSessionId),'copy-session');
        assert.equal(await page.evaluate(()=>bundleAudit.copies[0][3]),'textpack');
      }
    } else if(name==='save-format-cancel') {
      await direct(); await replace('# UNSAVED BEFORE FORMAT');
      await page.locator('#saveAsButton').click();
      await page.locator('#documentSaveFormatDialog').waitFor({state:'visible'});
      assert.equal(await page.locator('[data-save-format="textpack"]').getAttribute('aria-checked'),'true');
      await page.keyboard.press('ArrowLeft');
      assert.equal(await page.locator('[data-save-format="textbundle"]').getAttribute('aria-checked'),'true');
      await page.keyboard.press('Escape');
      await page.waitForFunction(()=>!bundleDocumentUI.state.saving);
      await page.waitForFunction(()=>document.activeElement.id==='saveAsButton');
      assert.equal(await page.evaluate(()=>bundleAudit.copies.length),0);
      assert.equal(await page.evaluate(()=>bundleDocumentUI.state.dirty),true);
      await copy('textbundle');
      assert.equal(await page.evaluate(()=>bundleDocumentUI.state.currentFile.path),'/copies/notes-copy.textbundle');
    } else if(name==='conflict-merge') {
      await direct();await replace('# LOCAL MERGE INPUT');
      await page.evaluate(()=>bundleAudit.mode='conflict');await save();
      await page.locator('#documentConflictDialog').waitFor({state:'visible'});
      assert.equal(await page.evaluate(()=>bundleDocumentUI.state.currentFile.content),'# LOCAL MERGE INPUT');
      await page.evaluate(()=>bundleDocumentUI.save(false,{auto:true}));
      assert.equal(await page.evaluate(()=>bundleAudit.writes.length),1);
      await page.locator('#conflictMerge').click();
      await page.locator('#documentConflictMerge').fill('# MERGED PACKAGE');
      await page.locator('#conflictApply').click();
      await page.waitForFunction(()=>bundleDocumentUI.state.currentFile.bundleSessionId==='merged-session');
      assert.deepEqual(await page.evaluate(()=>bundleAudit.rebase),['session-a','disk-session','b'.repeat(64)]);
      await save();await page.locator('#conflictSave').click();
      await page.waitForFunction(()=>!bundleDocumentUI.state.saving&&!bundleDocumentUI.state.documentConflict);
      const write=await page.evaluate(()=>bundleAudit.writes.at(-1));
      assert.deepEqual(write,['/origin/notes.textpack','# MERGED PACKAGE','b'.repeat(64),'merged-session']);
    } else if(name==='save-and-recovery-failures') {
      await direct();await replace('# RETAINED BUFFER');
      await page.evaluate(()=>bundleAudit.recoveryError=true);await save();
      assert.equal(await page.evaluate(()=>bundleAudit.writes.length),0,'a failed recovery flush must block the original-package write');
      await page.evaluate(()=>{bundleAudit.recoveryError=false;bundleAudit.mode='error';});await save();
      assert.equal(await page.evaluate(()=>bundleDocumentUI.state.dirty),true);
      const count=await page.evaluate(()=>bundleAudit.writes.length);
      await page.evaluate(()=>bundleDocumentUI.save(false,{auto:true}));
      assert.equal(await page.evaluate(()=>bundleAudit.writes.length),count,'autosave remains paused after failure');
      await page.evaluate(()=>bundleAudit.mode='normal');await save();
      assert.equal(await page.evaluate(()=>bundleDocumentUI.state.dirty),false);
    } else if(name==='partial-save') {
      await direct('textbundle');await replace('# UNCONFIRMED PACKAGE BUFFER');
      await page.evaluate(()=>bundleAudit.mode='partial');await save();
      assert.equal(await page.evaluate(()=>bundleDocumentUI.state.currentFile.content),'# UNCONFIRMED PACKAGE BUFFER');
      assert.equal(await page.evaluate(()=>bundleDocumentUI.state.dirty),true);
      assert.equal(await page.evaluate(()=>bundleDocumentUI.state.saveAsRequired),true);
      assert.match(await page.locator('#editorSaveState').textContent(),/附件部分写入/);
      assert.match(await page.locator('#editorSaveState').getAttribute('title'),/已新增部分附件.*尚未确认/);
      assert.equal(await page.evaluate(()=>bundleAudit.events.includes('clear-recovery')),false);
      await page.evaluate(()=>bundleDocumentUI.save(false,{auto:true}));
      assert.equal(await page.evaluate(()=>bundleAudit.writes.length),1);
    } else if(name==='session-persistence-warning') {
      await direct();await replace('# CONFIRMED WRITTEN PACKAGE');
      await page.evaluate(()=>{bundleAudit.mode='session-warning';return bundleDocumentUI.save(false,{auto:true});});
      assert.equal(await page.evaluate(()=>bundleDocumentUI.state.dirty),false);
      assert.equal(await page.evaluate(()=>bundleDocumentUI.state.saveAsRequired),true);
      assert.match(await page.locator('#editorSaveState').textContent(),/已写回.*重新打开原包/);
      assert.match(await page.locator('#editorSaveState').getAttribute('title'),/已成功写回原包.*会话记录保存失败/);
      assert.equal(await page.evaluate(()=>bundleAudit.events.includes('clear-recovery')),false);
      await save();
      await page.evaluate(()=>bundleDocumentUI.save(false,{auto:true}));
      assert.equal(await page.evaluate(()=>bundleAudit.writes.length),1);
      await copy();
      assert.equal(await page.evaluate(()=>bundleDocumentUI.state.currentFile.path),'/copies/notes-copy.textpack');
    } else if(name==='recover-conflict') {
      await page.evaluate(()=>bundleDocumentUI.restore({path:'/origin/notes.textpack',name:'notes.textpack',
        content:'# RECOVERED\n\n![new](assets/new.png)',baseRevision:'a'.repeat(64),bundleKind:'textpack',bundleSessionId:'durable-session'}));
      await page.waitForFunction(()=>bundleDocumentUI.state.currentFile?.bundleSessionId==='durable-session');
      assert.equal(await page.evaluate(()=>bundleDocumentUI.state.currentFile.directory),'/owned/recovered');
      assert.match(await page.evaluate(()=>bundleDocumentUI.state.currentFile.content),/assets\/new\.png/);
      assert.equal(await page.evaluate(()=>bundleDocumentUI.state.currentFile.revision),'a'.repeat(64));
      assert.equal(await page.evaluate(()=>Boolean(bundleDocumentUI.state.documentConflict)),true);
      await page.locator('#conflictKeep').click();
      await page.evaluate(()=>bundleDocumentUI.save(false,{auto:true}));
      assert.equal(await page.evaluate(()=>bundleAudit.writes.length),0);
      await copy();
      assert.equal(await page.evaluate(()=>bundleAudit.copies[0][2]),'durable-session');
    } else if(name==='recover-fail-closed') {
      for (const snapshot of [
        {path:'/origin/notes.textpack',content:'legacy text',baseRevision:'a'.repeat(64)},
        {path:'/origin/notes.textbundle',content:'workspace text',baseRevision:'a'.repeat(64),bundleKind:'textbundle',bundleSessionId:'missing-session'}
      ]) {
        await page.evaluate(snapshot=>{bundleAudit.resumeError=true;return bundleDocumentUI.restore(snapshot);},snapshot);
        assert.equal(await page.evaluate(()=>bundleDocumentUI.pendingRecovery()?.content),snapshot.content);
      }
      assert.equal(await page.evaluate(()=>bundleAudit.writes.length),0);
    } else if(name==='stale-save') {
      await direct();await replace('# OLD SESSION BUFFER');
      await page.evaluate(()=>{bundleAudit.mode='deferred';void bundleDocumentUI.save();});
      await page.waitForFunction(()=>Boolean(bundleAudit.pending));
      await page.evaluate(()=>{
        bundleDocumentUI.open(bundleAudit.make({content:'# NEW SESSION',bundleSessionId:'reopened-session'}));
        bundleAudit.pending(bundleAudit.make({content:'# OLD SESSION BUFFER',bundleSessionId:'old-result'}));
      });
      await page.waitForFunction(()=>!bundleDocumentUI.state.saving);
      assert.equal(await page.evaluate(()=>bundleDocumentUI.state.currentFile.bundleSessionId),'reopened-session');
      assert.equal(await page.evaluate(()=>bundleDocumentUI.state.currentFile.content),'# NEW SESSION');
    }
    assert.deepEqual(await page.evaluate(()=>bundleAudit.ordinary),[],'bundle workflows must not silently use ordinary Markdown APIs');
    assert.deepEqual(errors,[]);
    console.log('PASS '+engine+': '+name);
    await page.close();
  }
} finally {
  await browser?.close();await server.close();
}
