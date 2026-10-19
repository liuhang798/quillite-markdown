// Isolated real app, synthetic document only. No native dialogs or real files.
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import {createServer} from 'vite';
const {chromium} = createRequire(import.meta.url)(process.env.PLAYWRIGHT_MODULE || 'playwright');
const output = process.env.AUDIT_OUTPUT;
if (!output) throw Error('AUDIT_OUTPUT required');
const source = ['# 标题测试', '', '\\# 字面标题', '我是正文', '', '**我要加粗**', '*我要斜体*', '~~我要删除线~~', '==我要底色==', '<span data-md-color="spectrum-3-red">我要颜色</span>', '', '==阿萨德发啊==', '==ASdaS==', '', '<!-- invisible block -->', '', '[ref]: https://example.com', '', '重复正文', '重复正文', '', '> 引用第一行', '> 引用第二行', '', '- 列表第一项', '- 列表第二项', '', '| 表头甲 | 表头乙 |', '| --- | --- |', '| 单元甲 | 单元乙 |', '', '这是长行用于验证不同宽度自动折行，'.repeat(18), '', '后续定位文字', '', '引用脚注[^n]', '', '[^n]: 脚注内容', '', '末尾定位文字'].join('\n');
const probes = ['# 字面标题','我是正文','我要加粗','我要斜体','我要删除线','我要底色','我要颜色','阿萨德发啊','ASdaS','引用第一行','引用第二行','列表第一项','列表第二项','单元甲','单元乙','后续定位文字','末尾定位文字'];
const server = await createServer({root:process.env.AUDIT_APP_ROOT || fileURLToPath(new URL('..',import.meta.url)),server:{host:'127.0.0.1',port:0,watch:null,hmr:false},logLevel:'error'});
let browser, page; const failures = [];
try {
  await server.listen(); browser = await chromium.launch({headless:true,executablePath:process.env.BROWSER_EXECUTABLE || undefined});
  for (const width of [1500, 1000]) for (const presentation of ['live','source']) for (const layout of ['editor-left','preview-left']) {
    const name = `${width}-${presentation}-${layout}`;
    page = await browser.newPage({viewport:{width,height:950}}); page.setDefaultTimeout(10000);
    const errors=[]; page.on('pageerror', e=>errors.push(e.message));
    await page.addInitScript(({layout})=>{localStorage.setItem('language','zh-CN');localStorage.setItem('editorLayout',layout);}, {layout});
    await page.route('**/*',r=>new URL(r.request().url()).hostname==='127.0.0.1'?r.continue():r.abort());
    try {
      await page.goto(server.resolvedUrls.local[0]);
      await page.evaluate(async text=>{
        await import('/src/main.js');
        window.quilliteMarkdown.openFile=async()=>({path:'synthetic-sync.md',name:'synthetic-sync.md',directory:'.',content:text,revision:'a'.repeat(64)});
        window.quilliteMarkdown.saveFile=async()=>null;
      }, source);
      await page.locator('#openFileButton').click(); await page.locator('#editButton').click();
      await page.locator(`[data-editor-presentation="${presentation}"]`).click();
      if(presentation==='live')await page.locator('#restoreLivePreviewButton').click();
      const editor=page.locator('#markdownEditor > .cm-editor'), preview=page.locator('#editorPreviewContent');
      await preview.getByText('末尾定位文字',{exact:true}).waitFor();
      const read=()=>editor.evaluate(async el=>{const{EditorView}=await import('/node_modules/@codemirror/view/dist/index.js');const v=EditorView.findFromDOM(el);const{undoDepth}=await import('/node_modules/@codemirror/commands/dist/index.js');return {text:v.state.doc.toString(),line:v.state.doc.lineAt(v.state.selection.main.head).number,history:undoDepth(v.state)};});
      const initial=await read();
      const editorBox=await editor.boundingBox(), previewBox=await preview.boundingBox();
      assert.equal(editorBox.x<previewBox.x,layout==='editor-left','requested split layout must actually be active');
      const rows=await preview.evaluate(el=>['我要加粗','我要斜体','我要删除线','我要底色','我要颜色'].map(text=>{
        const walker=document.createTreeWalker(el,NodeFilter.SHOW_TEXT);let node;while(node=walker.nextNode())if(node.textContent===text){const r=document.createRange();r.selectNodeContents(node);return r.getBoundingClientRect().top;}return null;
      }));
      for(let i=1;i<rows.length;i++)assert.ok(rows[i]>rows[i-1]+5,`${name}: physical newlines must remain separate: ${rows}`);
      await page.screenshot({path:`${output}/${name}-01-lines.png`,animations:'disabled'});
      for(const text of probes){
        const expected=source.slice(0,source.indexOf(text)).split('\n').length;
        const target=text==='# 字面标题'?preview.getByText('字面标题',{exact:false}):preview.getByText(text,{exact:true});
        await target.click({button:'right'});
        assert.equal((await read()).line,expected,`${name}: right-click ${text}`);
        assert.equal((await read()).text,source);
      }
      // Duplicate text on consecutive source lines must not map to first match.
      const duplicates=preview.getByText('重复正文',{exact:true});
      for(let i=0;i<2;i++){
        await duplicates.nth(i).click({button:'right'});
        assert.equal((await read()).line,source.slice(0,source.indexOf('重复正文')).split('\n').length+i);
      }
      assert.equal((await read()).history,initial.history,'navigation must not create undo entries');
      // The forward cursor mapping must select the actual rendered line too.
      const line=source.slice(0,source.indexOf('末尾定位文字')).split('\n').length;
      await editor.evaluate(async el=>{const{EditorView}=await import('/node_modules/@codemirror/view/dist/index.js');const v=EditorView.findFromDOM(el);v.dispatch({selection:{anchor:0}});v.focus();});
      await page.waitForTimeout(350);
      await editor.evaluate(async(el,line)=>{const{EditorView}=await import('/node_modules/@codemirror/view/dist/index.js');const v=EditorView.findFromDOM(el);v.dispatch({selection:{anchor:v.state.doc.line(line).from}});v.focus();},line);
      await page.waitForTimeout(450);
      const visible=await preview.getByText('末尾定位文字',{exact:true}).evaluate(el=>{const r=el.getBoundingClientRect(),s=el.closest('.editor-preview-scroll').getBoundingClientRect();return r.top>=s.top&&r.bottom<=s.bottom;});
      assert.equal(visible,true,'cursor destination must be visible in preview');
      await page.keyboard.press('End');await page.keyboard.insertText('新增');
      await preview.getByText('末尾定位文字新增',{exact:true}).waitFor();
      assert.equal((await read()).text,source+'新增');
      await page.keyboard.press('Control+z');
      await preview.getByText('末尾定位文字',{exact:true}).waitFor();
      assert.equal((await read()).text,source);
      await page.screenshot({path:`${output}/${name}-02-located.png`,animations:'disabled'});
      assert.deepEqual(errors,[]);console.log(`PASS ${name}: line breaks, ${probes.length+2} pointer locations, forward sync, unchanged document/history`);
    }catch(error){failures.push(name+': '+error.message);await page.screenshot({path:`${output}/${name}-failure.png`,animations:'disabled'});console.error(failures.at(-1));}
    await page.close();
  }
  assert.deepEqual(failures,[]);
}finally{await browser?.close();await server.close();}
