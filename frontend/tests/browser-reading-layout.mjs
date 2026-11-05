// Synthetic document and isolated Chromium profile; no user files or network.
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import {createServer} from 'vite';
const {chromium}=createRequire(import.meta.url)(process.env.PLAYWRIGHT_MODULE || 'playwright');
const server=await createServer({root:fileURLToPath(new URL('..',import.meta.url)),server:{host:'127.0.0.1',port:41865,strictPort:true,watch:null,hmr:false},logLevel:'error',plugins:[{
  name:'reading-layout-audit',enforce:'pre',transform(code,id){
    if(id.replaceAll('\\','/').endsWith('/src/renderer.js'))return code+`
window.layoutAudit={state, get view(){return codeEditor;}, toggleEditor, setEditorLayout, scrollPreviewToCursor, renderEditorPreview,
  measure(){const v=codeEditor,s=document.querySelector('.editor-preview-scroll'),line=v.state.doc.lineAt(v.state.selection.main.head);
  return {caret:v.coordsAtPos(v.state.selection.main.head), editor:v.scrollDOM.getBoundingClientRect().toJSON(),
    target:previewCursorRect(els.editorPreview,line.number,v.state.selection.main.head-line.from)?.toJSON(),preview:s.getBoundingClientRect().toJSON(),scroll:s.scrollTop};}};`;
  }
}]});
let browser;
try {
  await server.listen();browser=await chromium.launch({headless:true,executablePath:process.env.BROWSER_EXECUTABLE});
  const page=await browser.newPage({viewport:{width:1500,height:950}});page.setDefaultTimeout(15000);
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.route('**/*',r=>new URL(r.request().url()).hostname==='127.0.0.1'?r.continue():r.abort());
  await page.goto(server.resolvedUrls.local[0]);
  await page.waitForFunction(()=>window.layoutAudit);
  assert.equal(await page.locator('#sidebar').evaluate(el=>el.classList.contains('collapsed')),false);
  await page.locator('#collapseSidebar').click();await page.reload();
  await page.waitForFunction(()=>window.layoutAudit);
  assert.equal(await page.locator('#sidebar').evaluate(el=>el.classList.contains('collapsed')),true);
  assert.equal(await page.locator('[data-settings-submenu="sidebar-startup"]').count(),0);
  await page.locator('#expandSidebar').click();await page.reload();
  await page.waitForFunction(()=>window.layoutAudit);
  assert.equal(await page.locator('#sidebar').evaluate(el=>el.classList.contains('collapsed')),false);
  const source=Array.from({length:100},(_,i)=>`## Section ${i}\n\nParagraph ${i} **bold** and ${'wrapped words '.repeat(15)}\n\n`).join('')+'```text\n'+Array.from({length:80},(_,i)=>`code line ${i}`).join('\n')+'\n```\n\n'+('Tail\n\n'.repeat(40));
  await page.evaluate(source=>{window.quilliteMarkdown.openFile=async()=>({path:'layout-audit.md',name:'layout-audit.md',directory:'.',content:source,revision:'a'.repeat(64)});},source);
  await page.locator('#openFileButton').click();
  await page.waitForFunction(()=>window.layoutAudit.state.currentFile?.name==='layout-audit.md');
  await page.evaluate(()=>window.layoutAudit.toggleEditor(true));
  await page.getByRole('button',{name:'源码',exact:true}).click();
  await page.locator('#markdownEditor > .cm-editor > .cm-scroller > .cm-content').focus();
  await page.keyboard.press('ArrowRight');
  for(const layout of ['editor-left','preview-left'])for(const text of ['Paragraph 45','code line 40'])for(const fraction of [.2,.5,.8]) {
    await page.evaluate(async({layout,text,fraction})=>{
      const a=window.layoutAudit;a.setEditorLayout(layout,true);const v=a.view;
      const at=v.state.doc.toString().indexOf(text)+5;v.dispatch({selection:{anchor:at},scrollIntoView:true});
      await new Promise(r=>setTimeout(r,250));
      const caret=v.coordsAtPos(at),editor=v.scrollDOM.getBoundingClientRect();
      v.scrollDOM.scrollTop+=(caret.top+caret.bottom)/2-(editor.top+editor.height*fraction);
      await new Promise(r=>setTimeout(r,250));
      a.scrollPreviewToCursor(true);
    },{layout,text,fraction});
    await page.waitForTimeout(120);
    const m=await page.evaluate(()=>window.layoutAudit.measure());
    const expected=((m.caret.top+m.caret.bottom)/2-m.editor.top)/m.editor.height;
    const actual=(m.target.top+Math.min(m.target.height/2,12)-m.preview.top)/m.preview.height;
    assert.ok(Math.abs(expected-actual)<.025,JSON.stringify({layout,text,fraction,expected,actual,m}));
  }
  const preview=page.locator('.editor-preview-scroll');
  await preview.hover();await page.mouse.wheel(0,230);await page.waitForTimeout(150);
  const manual=await preview.evaluate(el=>el.scrollTop);
  await page.evaluate(async()=>{const a=window.layoutAudit;await a.renderEditorPreview(a.view.state.doc.toString());a.scrollPreviewToCursor(true);});
  await page.waitForTimeout(150);
  assert.ok(Math.abs(await preview.evaluate(el=>el.scrollTop)-manual)<2,'asynchronous render respects manual scroll');
  await page.locator('#markdownEditor > .cm-editor > .cm-scroller > .cm-content').focus();
  await page.keyboard.press('ArrowRight');await page.waitForTimeout(150);
  assert.ok(Math.abs(await preview.evaluate(el=>el.scrollTop)-manual)>30,'editor navigation resumes follow');
  if(process.env.AUDIT_OUTPUT)await page.screenshot({path:process.env.AUDIT_OUTPUT+'/split-alignment.png'});
  await page.evaluate(()=>{const a=window.layoutAudit;a.setEditorLayout('editor-only',true);
    const scroller=document.querySelector('.editor-preview-scroll');window.hiddenScrollWrites=0;scroller.scrollTo=()=>window.hiddenScrollWrites++;a.scrollPreviewToCursor(true);});
  await page.waitForTimeout(100);assert.equal(await page.evaluate(()=>window.hiddenScrollWrites),0);
  assert.equal(await page.evaluate(()=>window.layoutAudit.view.state.doc.toString()),source);
  if(process.env.AUDIT_OUTPUT)await page.screenshot({path:process.env.AUDIT_OUTPUT+'/reading-layout.png'});
  assert.deepEqual(errors,[]);
  console.log('PASS sidebar remembers expand/collapse after reload, removed settings, both split directions, glyph/code positioning, manual scroll, resume, hidden preview, unchanged document');
}finally{await browser?.close();await server.close();}
