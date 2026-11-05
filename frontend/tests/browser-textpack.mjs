// Isolated bridge fixtures: actual UI/editor, no native dialogs or user files.
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import {mkdir} from 'node:fs/promises';
import {join} from 'node:path';
import {createServer} from 'vite';
const playwright = createRequire(import.meta.url)(process.env.PLAYWRIGHT_MODULE || 'playwright');
const engine = process.env.TEXTPACK_BROWSER || 'chromium';
const output = process.env.TEXTPACK_OUTPUT_DIR;
const server = await createServer({root:fileURLToPath(new URL('..',import.meta.url)),
  server:{host:'127.0.0.1',port:Number(process.env.TEXTPACK_PORT)||41738,watch:null,hmr:false},logLevel:'error',
  plugins:[{name:'textpack-test-only',enforce:'pre',transform(code,id){
    if(id.replaceAll('\\','/').endsWith('/src/renderer.js'))return code+'\nwindow.packUI={state};';
  }}]});
let browser;
try {
  if(output)await mkdir(output,{recursive:true});
  await server.listen();
  browser=await playwright[engine].launch({headless:true,...(engine==='chromium'&&process.env.BROWSER_EXECUTABLE?{executablePath:process.env.BROWSER_EXECUTABLE}:{})});
  for(const name of ['export-textpack','export-markdown-assets','export-package-markdown','export-cancel','export-stale','export-failed','package-network-permission']){
    const page=await browser.newPage({viewport:{width:1280,height:820}}),errors=[],remote=[],dialogs=[];
    page.on('pageerror',error=>errors.push(error.message));
    page.on('dialog',dialog=>{dialogs.push(dialog.message());return name==='package-network-permission'?dialog.dismiss():dialog.accept();});
    await page.route('**/*',route=>{if(new URL(route.request().url()).hostname==='127.0.0.1')return route.continue();remote.push(route.request().url());return route.abort();});
    await page.addInitScript(()=>{localStorage.setItem('language','zh-CN');localStorage.setItem('editorPresentation','source');localStorage.setItem('editorLayout','editor-only');});
    await page.goto(server.resolvedUrls.local[0]);
    await page.waitForFunction(()=>window.quilliteMarkdown&&window.packUI&&document.querySelector('#fileList')?.childElementCount);
    await page.evaluate(name=>{
      const image='data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a9WQAAAAASUVORK5CYII=';
      const doc=(path,content)=>({path,name:path.split('/').pop(),directory:'/original',content,revision:'a'.repeat(64)});
      const packaged=name.includes('package');
      const initial='# ORIGINAL\n\n![local](assets/ok.png)\n\n![missing](assets/missing.png)\n\n![online](https://image.invalid/remote.png)';
      const original={...doc(packaged?'/original.textpack':'/original.md',initial),...(packaged?{
        bundleKind:'textpack',bundleSessionId:'package-session',resourcePath:'/owned/session/text.md',directory:'/owned/session',packageDirectory:'/'}:{})};
      const audit=window.packAudit={doc,original,next:original,calls:[],pending:null};
      const result={path:'/Export.textpack',assetCount:1,warnings:[{code:'MISSING_IMAGE',reference:'assets/missing.png'}]};
      const exporting=async(kind,path,content,sessionId,images)=>{
        audit.calls.push({kind,path,content,sessionId,images});
        if(name==='export-stale')return new Promise(resolve=>audit.pending=()=>resolve(result));
        if(name==='export-failed')throw Error('TEXTPACK_CONVERSION_INCOMPLETE: MISSING_IMAGE');
        return name==='export-cancel'?null:{...result,path:kind==='markdown-assets'?'/copy/document.md':result.path};
      };
      Object.assign(window.quilliteMarkdown,{
        openFile:async()=>({...audit.next}),canEditFile:async()=>true,readImageData:async()=>image,reportErrorLog:async()=>{},
        exportTextPack:(path,content,images)=>exporting('textpack',path,content,'',images),
        exportMarkdownWithAssets:(path,content,sessionId,images)=>exporting('markdown-assets',path,content,sessionId,images)
      });
    },name);
    await page.locator('#openFileButton').click();
    await page.locator('#markdownContent h1').waitFor();
    assert.equal(await page.locator('[data-action="import-textbundle"], [data-action="open-editable-bundle"]').count(),0);
    if(name.includes('package'))assert.equal(remote.length,0,'opening packages must not fetch network resources');
    await page.locator('#editButton').click();
    const editor=page.locator('#markdownEditor > .cm-editor');
    await editor.waitFor();
    await editor.locator('> .cm-scroller > .cm-content').focus();
    await page.keyboard.press('Control+End');
    await page.keyboard.insertText('\n\nUNSAVED SNAPSHOT');
    const before=await page.evaluate(()=>packUI.state.currentFile.content);
    const originalPath=await page.evaluate(()=>packUI.state.currentFile.path);
    await page.evaluate(()=>document.querySelector('#documentExportButton').click());
    const format=name==='export-textpack'?'textpack':name==='package-network-permission'?'png':'markdown-assets';
    await page.locator('[data-export-format="'+format+'"]').click();
    assert.equal(await page.locator('#pandocExportOptions').isVisible(),false);
    await page.locator('#confirmExportCenter').click();
    if(name==='package-network-permission'){
      await page.waitForFunction(()=>!document.querySelector('#confirmExportCenter').disabled);
      assert(dialogs.some(message=>message.includes('导出／打印')));
      assert.equal(await page.evaluate(()=>packAudit.calls.length),0);
      assert.equal(remote.length,0,'declined rendered export must not load remote resources');
      await page.locator('#cancelExportCenter').click();
    }else{
      await page.waitForFunction(()=>packAudit.calls.length);
      if(name==='export-stale'){
        await page.waitForFunction(()=>packAudit.pending);
        await page.evaluate(()=>{packAudit.next=packAudit.doc('/new.md','# NEW DOCUMENT');document.querySelector('#openFileButton').click();});
        await page.locator('#markdownContent h1').filter({hasText:'NEW DOCUMENT'}).waitFor();
        await page.evaluate(()=>packAudit.pending());
        await page.waitForFunction(()=>!document.querySelector('#confirmExportCenter').disabled);
        assert.equal(await page.locator('#textBundleResultDialog').isVisible(),false);
      }else if(name==='export-cancel'||name==='export-failed'){
        await page.waitForFunction(()=>!document.querySelector('#confirmExportCenter').disabled);
        assert.equal(await page.locator('#exportCenterDialog').isVisible(),true);
        if(name==='export-failed')assert.match(await page.locator('#toast').innerText(),/无法完整收集图片/);
        await page.locator('#cancelExportCenter').click();
      }else{
        await page.locator('#textBundleResultDialog').waitFor({state:'visible'});
        assert.match(await page.locator('#textBundleResultReport').innerText(),/网络图片 1 项.*缺失图片 1 项/);
        assert.match(await page.locator('#textBundleResultReport').innerText(),/不能视为完全离线/);
        if(format==='markdown-assets')assert.match(await page.locator('#textBundleResultTitle').innerText(),/Markdown 和图片已导出/);
        if(output)await page.screenshot({path:join(output,'bundle-'+name+'-'+engine+'.png'),animations:'disabled'});
        await page.locator('#closeTextBundleResult').click();
      }
      const call=await page.evaluate(()=>packAudit.calls[0]);
      assert.match(call.content,/UNSAVED SNAPSHOT/);
      assert.equal(call.images.length,2,'network references are not submitted as files');
      if(format==='markdown-assets'){
        assert.match(call.content,/assets\/quillite-[\w-]+\/image-/);
        assert.equal(call.path,originalPath,'Markdown export targets the selected source session, not an arbitrary workspace file');
        if(name.includes('package'))assert.equal(call.sessionId,'package-session');
      }
    }
    if(name!=='export-stale'){
      assert.equal(await page.evaluate(()=>packUI.state.currentFile.path),originalPath,'export does not switch active documents');
      assert.equal(await page.evaluate(()=>packUI.state.currentFile.content),before,'export preserves unsaved text');
      assert.equal(await page.evaluate(()=>packUI.state.dirty),true);
    }
    assert.deepEqual(errors,[]);
    console.log('PASS '+engine+': '+name);
    await page.close();
  }
}finally{await browser?.close();await server.close();}
