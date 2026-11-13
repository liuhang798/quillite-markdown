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
  paste:(html,plain,markdown)=>{const data=new DataTransfer();if(html)data.setData('text/html',html);if(plain)data.setData('text/plain',plain);if(markdown)data.setData('text/markdown',markdown);codeEditor.contentDOM.focus();codeEditor.contentDOM.dispatchEvent(new ClipboardEvent('paste',{clipboardData:data,bubbles:true,cancelable:true}));}
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
  const dollarInline=String.raw`Inline $x_1$ and $\frac{a_1}{b^2}$.`;
  const dollarDisplay=String.raw`$$\frac{a_1}{b^2}$$`;
  const price='Prices $5 and $10.';
  const dollarHTML=`<p>${dollarInline}</p><p>${dollarDisplay}</p><p>${price}</p>`;
  const dollarSource=pasteTarget+[dollarInline,dollarDisplay,price].join('\n\n');
  await page.evaluate(text=>issue16Audit.replace(text),pasteTarget);
  await page.evaluate(html=>issue16Audit.paste(html,'not the rich clipboard payload'),dollarHTML);
  assert.equal(await page.evaluate(()=>issue16Audit.editor()),dollarSource,'rich HTML must preserve dollar-formula delimiters, commands and subscripts exactly');
  const dollarPreview=page.locator('#editorPreviewContent');
  await dollarPreview.locator('.math-block .katex').waitFor();
  assert.deepEqual(await dollarPreview.locator('.math-inline').evaluateAll(nodes=>nodes.map(node=>decodeURIComponent(node.dataset.mathSource))),['x_1',String.raw`\frac{a_1}{b^2}`]);
  assert.equal(await dollarPreview.locator('.math-inline .katex msub').count(),2,'the browser renders the original subscript, not a literal underscore');
  assert.equal(await dollarPreview.locator('.math-block .katex mfrac').count(),1);
  assert.equal(await dollarPreview.locator('.katex-error').count(),0);
  const prices=dollarPreview.getByText(price,{exact:true});
  await prices.waitFor();
  assert.equal(await prices.locator('.katex').count(),0,'prices remain ordinary prose');
  await page.locator('[data-editor-presentation="live"]').click();
  await page.waitForFunction(()=>issue16Audit.formulas().length===3);
  assert.deepEqual((await page.evaluate(()=>issue16Audit.formulas())).map(item=>item.raw),['$x_1$',String.raw`$\frac{a_1}{b^2}$`,dollarDisplay]);
  assert.equal(await page.locator('#markdownEditor .cm-formula-render.is-error').count(),0);
  await page.locator('[data-editor-presentation="source"]').click();
  await page.locator('#markdownEditor > .cm-editor > .cm-scroller > .cm-content').focus();
  await page.keyboard.press(process.platform === 'darwin' ? 'Meta+z' : 'Control+z');
  assert.equal(await page.evaluate(()=>issue16Audit.editor()),pasteTarget,'dollar math paste remains one undo transaction');

  // Synthetic clipboard fixtures: emulate a copy-button payload that mixes
  // Markdown's outer delimiters with individual rendered math nodes.
  const annotatedMath=(visible,tex)=>`<math><semantics><mtext>${visible}</mtext><annotation encoding="application/x-tex">${tex}</annotation></semantics></math>`;
  const mixedHTML=`<p>Given $f'(x)=${annotatedMath('f(x)','f(x)')}$.</p>`;
  const cleanMath="f'(x)=f(x)";
  const cleanDollar=`Given $${cleanMath}$.`;
  const fallbackMath=String.raw`\frac{x}{2}`;
  const fallbackSource=`**Fallback** $${fallbackMath}$.`;
  const fallbackExplicit=String.raw`**Fallback** \(${fallbackMath}\).`;
  const incompleteHTML=String.raw`<p><strong>Fallback</strong> $\frac{${annotatedMath('x','x')}}$.</p>`;
  for (const {name,html,plain,markdown,expected,expression} of [
    {name:'mixed HTML + plain Markdown',html:mixedHTML,plain:cleanDollar,expected:cleanDollar,expression:cleanMath},
    {name:'mixed HTML only',html:mixedHTML,expected:cleanDollar,expression:cleanMath},
    {name:'invalid mixed HTML with an intact plain counterpart',html:incompleteHTML,plain:fallbackSource,expected:fallbackSource,expression:fallbackMath},
    {name:'invalid mixed HTML with explicit Markdown',html:incompleteHTML,plain:'Fallback x divided by 2.',markdown:fallbackExplicit,expected:fallbackExplicit,expression:fallbackMath},
  ]) {
    await page.evaluate(text=>issue16Audit.replace(text),pasteTarget);
    await page.evaluate(({html,plain,markdown})=>issue16Audit.paste(html,plain,markdown),{html,plain,markdown});
    const expectedSource=pasteTarget+expected;
    assert.equal(await page.evaluate(()=>issue16Audit.editor()),expectedSource,name+' preserves exact valid source');
    await page.waitForFunction(expression=>[...document.querySelectorAll('#editorPreviewContent .math-inline')].some(node=>decodeURIComponent(node.dataset.mathSource)===expression),expression);
    assert.equal(await dollarPreview.locator('.math-inline .katex').count(),1,name+' renders one complete formula');
    assert.equal(await dollarPreview.locator('.katex-error').count(),0,name+' does not emit a nested or invalid formula');
    await page.locator('[data-editor-presentation="live"]').click();
    await page.waitForFunction(()=>issue16Audit.formulas().length===1);
    assert.match((await page.evaluate(()=>issue16Audit.formulas()))[0].html,/class="katex"/,name+' renders in live editing');
    assert.equal(await page.evaluate(()=>issue16Audit.editor()),expectedSource,name+' is unchanged by switching editor modes');
    await page.locator('[data-editor-presentation="source"]').click();
    await page.locator('#markdownEditor > .cm-editor > .cm-scroller > .cm-content').focus();
    await page.keyboard.press(process.platform === 'darwin' ? 'Meta+z' : 'Control+z');
    assert.equal(await page.evaluate(()=>issue16Audit.editor()),pasteTarget,name+' remains one undo transaction');
  }

  const tableRaw=String.raw`$\left\|x\right\|$`;
  const tableSource=`| A | B |\n| --- | --- |\n| ${tableRaw} | $y$ |`;
  await page.evaluate(text=>issue16Audit.replace(text),tableSource);
  const tablePreview=dollarPreview.locator('table');
  const tablePreviewFormula=tablePreview.locator('td:first-child .math-inline');
  await tablePreviewFormula.waitFor();
  assert.equal(await tablePreview.locator('td').count(),2);
  const operators=widget=>widget.locator('.katex-mathml mo').allTextContents();
  const previewOperators=await operators(tablePreviewFormula);
  assert.deepEqual(previewOperators,['∣','∣'],'the two Markdown-escaped pipes produce single bars, not LaTeX double bars');
  assert.equal(decodeURIComponent(await tablePreviewFormula.getAttribute('data-math-source')),String.raw`\left|x\right|`);
  assert.match(await tablePreviewFormula.getAttribute('class'),/\beditable-preview-formula\b/,'the displayed equation maps to its exact original source range');
  await tablePreviewFormula.dblclick();
  const formulaDialog=page.locator('#formulaDialog');
  await formulaDialog.waitFor();
  assert.deepEqual(await operators(formulaDialog.locator('#formulaPreview')),previewOperators,'opening from split preview keeps the math meaning');
  await formulaDialog.locator('#insertFormula').click();
  await formulaDialog.waitFor({state:'hidden'});
  assert.equal(await page.evaluate(()=>issue16Audit.editor()),tableSource,'a no-op edit preserves the original escaped formula and other cell');

  await page.locator('[data-editor-presentation="live"]').click();
  const liveTable=page.locator('#markdownEditor .cm-live-table');
  const liveTableFormula=liveTable.locator('.cm-formula-render').first();
  await liveTableFormula.waitFor();
  assert.equal(await liveTable.locator('.cm-formula-render').count(),2);
  assert.deepEqual(await operators(liveTableFormula),previewOperators,'a live table formula renders the same single bars as split preview');
  await liveTableFormula.hover();
  await liveTableFormula.locator('[data-formula-action="edit"]').click();
  await formulaDialog.waitFor();
  await formulaDialog.locator('#formulaAdvanced > summary').click();
  const updatedTableRaw=tableRaw.replace('x','z');
  await formulaDialog.locator('#formulaMarkdownSource').fill(updatedTableRaw);
  assert.deepEqual(await operators(formulaDialog.locator('#formulaPreview')),previewOperators,'editing raw escaped source keeps the same math meaning');
  await formulaDialog.locator('#insertFormula').click();
  await formulaDialog.waitFor({state:'hidden'});
  assert.equal(await page.evaluate(()=>issue16Audit.editor()),tableSource.replace(tableRaw,updatedTableRaw),'changing the variable does not change table boundaries or adjacent content');
  await page.locator('[data-editor-presentation="source"]').click();
  await page.waitForFunction(()=>decodeURIComponent(document.querySelector('#editorPreviewContent td:first-child .math-inline')?.dataset.mathSource||'')==='\\left|z\\right|');
  assert.equal(await tablePreview.locator('td').count(),2);
  assert.equal(decodeURIComponent(await tablePreview.locator('td:last-child .math-inline').getAttribute('data-math-source')),'y');
  assert.deepEqual(errors,[]);
  console.log(`PASS ${engine}: issue 16 original 11 formulas; dollar math, mixed HTML/Markdown paste and undo; escaped GFM table formula preview, no-op and edit`);
} finally {await browser?.close();await server.close();}
