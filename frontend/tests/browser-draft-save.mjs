import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import {createServer} from 'vite';

// Synthetic documents and mocked file APIs only; exercise the real timer and keyboard handlers.
const playwright=createRequire(import.meta.url)(process.env.PLAYWRIGHT_MODULE||'playwright');
const server=await createServer({root:fileURLToPath(new URL('..',import.meta.url)),server:{host:'127.0.0.1',port:0,watch:null,hmr:false},logLevel:'error',plugins:[{
  name:'draft-save-audit',enforce:'pre',transform(code,id){if(id.replaceAll('\\','/').endsWith('/src/renderer.js'))return code+'\nwindow.draftSaveAudit={state,view:()=>codeEditor,mode:setEditorPresentation};';}
}]});
let browser;
try {
  await server.listen();
  const engine=process.env.SAVE_BROWSER||'chromium';
  browser=await playwright[engine].launch({headless:true,...(engine==='chromium'?{executablePath:process.env.BROWSER_EXECUTABLE||undefined}:{})});
  const page=await browser.newPage(),errors=[];
  page.on('pageerror',error=>errors.push(error.message));
  await page.route('**/*',route=>new URL(route.request().url()).hostname==='127.0.0.1'?route.continue():route.abort());
  for(const mode of ['live','source']) {
    await page.goto(server.resolvedUrls.local[0]);
    await page.waitForFunction(()=>window.draftSaveAudit&&window.quilliteMarkdown);
    await page.evaluate(()=>{
      window.saveAuditCalls={writes:[],copies:0};
      const api=window.quilliteMarkdown;
      api.newFile=async()=>({path:'/synthetic/draft.md',name:'draft.md',directory:'/synthetic',content:'',revision:'initial',draft:true});
      api.canEditFile=async()=>true;
      api.saveFile=async(path,content,revision)=>{
        saveAuditCalls.writes.push({path,content,revision});
        return {path,name:'draft.md',directory:'/synthetic',content,revision:`saved-${saveAuditCalls.writes.length}`,draft:true};
      };
      api.saveAs=async()=>{saveAuditCalls.copies++;return null;};
    });
    await page.locator('#newFileButton').click();
    await page.waitForFunction(()=>draftSaveAudit.state.editing&&draftSaveAudit.view());
    await page.evaluate(mode=>draftSaveAudit.mode(mode),mode);
    const input=page.locator('#markdownEditor > .cm-editor > .cm-scroller > .cm-content');
    await input.click();await page.keyboard.insertText('新文档内容');
    await page.waitForFunction(()=>saveAuditCalls.writes.length===1&&!draftSaveAudit.state.saving,null,{timeout:16000});
    assert.equal(await page.evaluate(()=>saveAuditCalls.copies),0);
    await page.keyboard.press('Control+s');
    await page.waitForFunction(()=>saveAuditCalls.writes.length===2&&!draftSaveAudit.state.saving);
    await page.keyboard.insertText('，继续输入');
    await page.keyboard.press('Control+s');
    await page.waitForFunction(()=>saveAuditCalls.writes.length===3&&!draftSaveAudit.state.saving);
    assert.deepEqual(await page.evaluate(()=>saveAuditCalls.writes),[
      {path:'/synthetic/draft.md',content:'新文档内容',revision:'initial'},
      {path:'/synthetic/draft.md',content:'新文档内容',revision:'saved-1'},
      {path:'/synthetic/draft.md',content:'新文档内容，继续输入',revision:'saved-2'},
    ]);
    assert.equal(await page.evaluate(()=>saveAuditCalls.copies),0);
    await page.keyboard.press('Control+Shift+S');
    await page.waitForFunction(()=>saveAuditCalls.copies===1&&!draftSaveAudit.state.saving);
    await page.locator('#saveAsButton').click();
    await page.waitForFunction(()=>saveAuditCalls.copies===2&&!draftSaveAudit.state.saving);
    assert.equal(await page.evaluate(()=>draftSaveAudit.state.currentFile.path),'/synthetic/draft.md');
    assert.equal(await page.evaluate(()=>draftSaveAudit.view().state.doc.toString()),'新文档内容，继续输入');
    assert.equal(await page.evaluate(()=>draftSaveAudit.state.dirty),false);
  }
  assert.deepEqual(errors,[]);
  console.log(`PASS ${engine}: new document, actual autosave timer, Ctrl+S before/after edits, explicit Save As and cancel in both editor modes`);
} finally {await browser?.close();await server.close();}
