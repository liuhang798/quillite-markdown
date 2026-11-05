// Actual application flow with isolated bridge/clipboard fixtures only.
// No native pickers, user files, OS clipboard writes or external requests.
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { readFileSync } from 'node:fs';
import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { createServer } from 'vite';
const pw = createRequire(import.meta.url)(process.env.PLAYWRIGHT_MODULE || 'playwright');
const engine = process.env.ISSUE16_BROWSER || 'chromium';
const output = process.env.ISSUE16_OUTPUT_DIR;
const source = readFileSync(new URL('./fixtures/issue16-doubao.md', import.meta.url), 'utf8');
const server = await createServer({root:fileURLToPath(new URL('..', import.meta.url)),server:{host:'127.0.0.1',port:41737,watch:null,hmr:false},logLevel:'error',plugins:[{
  name:'issue16-test-only', enforce:'pre', transform(code,id) {
    if (id.replaceAll('\\','/').endsWith('/src/renderer.js')) return code + `
window.issue16Audit={
  source:()=>state.currentFile.content,
  editor:()=>codeEditor.state.doc.toString(),
  formulas:()=>codeEditor.state.field(editorFormulaField).items.map(({raw,html,from,to})=>({raw,html,from,to})),
  replace:text=>codeEditor.dispatch({changes:{from:0,to:codeEditor.state.doc.length,insert:text},selection:{anchor:text.length}}),
  export:()=>{const div=document.createElement('div');renderMarkdownTo(div,state.currentFile,state.currentFile.content);return div.innerHTML;},
  paste:(html,plain)=>{const data=new DataTransfer();data.setData('text/html',html);data.setData('text/plain',plain);codeEditor.contentDOM.focus();codeEditor.contentDOM.dispatchEvent(new ClipboardEvent('paste',{clipboardData:data,bubbles:true,cancelable:true}));}
};`;
  }
}]});
let browser;
try {
  if(output)await mkdir(output,{recursive:true});
  await server.listen();
  browser=await pw[engine].launch({headless:true,...(engine==='chromium'&&process.env.BROWSER_EXECUTABLE?{executablePath:process.env.BROWSER_EXECUTABLE}:{})});
  const page=await browser.newPage({viewport:{width:1600,height:1400}}),errors=[];
  page.on('pageerror',error=>errors.push(error.message));
  await page.route('**/*',route=>new URL(route.request().url()).hostname==='127.0.0.1'?route.continue():route.abort());
  await page.addInitScript(()=>{localStorage.setItem('language','zh-CN');localStorage.setItem('editorPresentation','live');});
  await page.goto(server.resolvedUrls.local[0]);
  await page.waitForFunction(()=>window.issue16Audit&&window.quilliteMarkdown&&document.querySelector('#fileList')?.childElementCount);
  await page.evaluate(source=>{
    Object.assign(window.quilliteMarkdown,{
      openFile:async()=>({path:'/issue16.md',directory:'/',name:'issue16.md',content:source,revision:'a'.repeat(64)}),
      canEditFile:async()=>true,reportErrorLog:async()=>{},
    });
  },source);
  await page.locator('#openFileButton').click();
  await page.waitForFunction(()=>document.querySelectorAll('#markdownContent .math-inline .katex').length===11);
  assert.equal(await page.locator('#markdownContent .katex-error').count(),0);
  assert.equal(await page.evaluate(()=>issue16Audit.source()),source,'opening must not rewrite the document');
  const renderedHTML=await page.evaluate(()=>issue16Audit.export());
  assert.equal((renderedHTML.match(/class="katex"/g)||[]).length,11,'export rendering shares the grammar');
  if(output)await page.screenshot({path:join(output,`issue16-reader-${engine}.png`),animations:'disabled'});
  await page.locator('#editButton').click();await page.locator('#markdownEditor > .cm-editor').waitFor();
  await page.waitForFunction(()=>issue16Audit.formulas().length===11);
  assert.ok((await page.evaluate(()=>issue16Audit.formulas())).every(item=>item.html?.includes('class="katex"')));
  assert.ok(await page.locator('#markdownEditor .cm-formula-content .katex').count()>0,'actual live widgets render');
  assert.equal(await page.locator('#markdownEditor .cm-formula-render.is-error').count(),0);
  assert.equal(await page.evaluate(()=>issue16Audit.editor()),source);
  await page.locator('[data-editor-presentation="source"]').click();
  await page.waitForFunction(()=>document.querySelectorAll('#editorPreviewContent .math-inline .katex').length===11);
  assert.equal(await page.locator('#editorPreviewContent .katex-error').count(),0);
  assert.equal(await page.evaluate(()=>issue16Audit.editor()),source,'presentation switch cannot alter formula delimiters');
  const literal=String.raw`(x=0) \\(not_math\\) and \(unclosed`;
  const guard='## Guards\n\n'+literal+'\n\n`'+String.raw`\(inline_code\)`+'`\n\n```text\n'+String.raw`\(fenced_code\)`+'\n```';
  await page.evaluate(guard=>issue16Audit.replace(guard),guard);
  await page.waitForFunction(()=>document.querySelector('#editorPreviewContent h2')?.textContent==='Guards');
  assert.equal(await page.locator('#editorPreviewContent .math-inline').count(),0);
  assert.match(await page.locator('#editorPreviewContent').innerText(),/inline_code/);
  const pasteTarget='# Clipboard target\n\n';
  for(const [name,html,plain,count] of [
    ['raw-LaTeX',String.raw`<blockquote><p>若在 \(\mathbb R\) 上函数 \(\varphi'(x)=0\)，则 \(\varphi(x)=C\)（常数）；</p></blockquote>`,'clipboard plain fallback',3],
    ['rendered-KaTeX',renderedHTML,source,11],
    ['MathML','<math display="block"><semantics><msup><mi>x</mi><mn>2</mn></msup><annotation encoding="application/x-tex">x^2</annotation></semantics></math>','x^2',1],
  ]) {
    await page.evaluate(text=>issue16Audit.replace(text),pasteTarget);
    await page.evaluate(({html,plain})=>issue16Audit.paste(html,plain),{html,plain});
    await page.waitForFunction(count=>document.querySelectorAll('#editorPreviewContent .math-inline .katex, #editorPreviewContent .math-block .katex').length===count,count);
    const buffer=await page.evaluate(()=>issue16Audit.editor());
    assert.match(buffer,/\\[([]/,name+' preserves explicit LaTeX');
    assert.doesNotMatch(buffer,/\\\\[([]/,name+' must not double-escape delimiters');
    await page.locator('[data-editor-presentation="live"]').click();
    await page.waitForFunction(count=>issue16Audit.formulas().length===count,count);
    assert.equal(await page.locator('#markdownEditor .cm-formula-render.is-error').count(),0);
    assert.equal(await page.evaluate(()=>issue16Audit.editor()),buffer);
    if(output&&name==='rendered-KaTeX')await page.screenshot({path:join(output,`issue16-pasted-live-${engine}.png`),animations:'disabled'});
    await page.locator('[data-editor-presentation="source"]').click();
    await page.locator('#markdownEditor > .cm-editor > .cm-scroller > .cm-content').focus();
    await page.keyboard.press(process.platform === 'darwin' ? 'Meta+z' : 'Control+z');
    assert.equal(await page.evaluate(()=>issue16Audit.editor()),pasteTarget,'paste is one undo-safe transaction');
  }
  await page.evaluate(text=>issue16Audit.replace(text),pasteTarget);
  await page.evaluate(()=>issue16Audit.paste(String.raw`<math><semantics><annotation encoding="application/x-tex">x\) **not a formula** \(y</annotation></semantics></math>`,'unsafe annotation'));
  await page.waitForFunction(()=>document.querySelector('#editorPreviewContent')?.textContent.includes('not a formula'));
  assert.equal(await page.locator('#editorPreviewContent .math-inline').count(),0,'untrusted MathML annotation cannot inject separate formulas');
  assert.equal(await page.locator('#editorPreviewContent strong').count(),0,'untrusted annotation cannot inject surrounding Markdown');
  assert.deepEqual(errors,[]);
  console.log(`PASS ${engine}: issue 16 complete 11-formula sample in reading/export/split/live; rich raw-LaTeX and KaTeX paste, code/literal protection, exact source and undo`);
} finally {await browser?.close();await server.close();}
