import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {writeFile} from 'node:fs/promises';
import {createServer} from 'vite';
import {fileURLToPath} from 'node:url';
const {chromium}=createRequire(import.meta.url)(process.env.PLAYWRIGHT_MODULE || 'playwright');
const output=process.env.AUDIT_OUTPUT;
const server=await createServer({root:fileURLToPath(new URL('..',import.meta.url)),server:{host:'127.0.0.1',port:0,watch:null,hmr:false},logLevel:'error',
 plugins:[{name:'formula-diagnostic-only',enforce:'pre',transform(code,id){
  if(id.replaceAll('\\','/').endsWith('/src/renderer.js'))return code+`
window.mathAudit={
 open:displayDocument,toggle:toggleEditor,mode:setEditorPresentation,formula:setEditorFormulaDisplay,editor:()=>codeEditor,
 raw(){return codeEditor?.state.doc.toString();},
 end(){codeEditor.dispatch({selection:{anchor:codeEditor.state.doc.length},scrollIntoView:true});},
 inspect(){const f=codeEditor?.state.field(editorFormulaField,false);return {mode:state.editorPresentation,formula:state.formulaDisplay,fallback:editorSourceFallback,items:f?.items.length??null,enabled:f?.enabled??null,
  editorKatex:document.querySelectorAll('#markdownEditor .katex').length,readerKatex:document.querySelectorAll('#markdownContent .katex').length,
  errors:document.querySelectorAll('#markdownEditor .is-error').length,chars:codeEditor?.state.doc.length};}
};`;
 }}]});
let browser,page;
const results=[],errors=[];
try{
 await server.listen();
 browser=await chromium.launch({headless:true,executablePath:process.env.BROWSER_EXECUTABLE || undefined});
 page=await browser.newPage({viewport:{width:1450,height:1000}});
 page.setDefaultTimeout(20000);
 page.on('pageerror',e=>{errors.push(e.message);console.error(e.stack);});
 await page.route('**/*',r=>new URL(r.request().url()).hostname==='127.0.0.1'?r.continue():r.abort());
 await page.goto(server.resolvedUrls.local[0]);
 await page.waitForFunction(()=>window.mathAudit&&window.quilliteMarkdown);
 await page.evaluate(()=>{
  window.quilliteMarkdown.canEditFile=async()=>true;
  window.quilliteMarkdown.reportErrorLog=async()=>{};
 });
 const open=async(name,source)=>{
  await page.evaluate(async({name,source})=>{
   await mathAudit.toggle(false);
   mathAudit.formula('preview');
   mathAudit.open({path:name+'.md',name:name+'.md',directory:'.',content:source});
  },{name,source});
  await page.waitForTimeout(400);
  const readingKatex=await page.locator('#markdownContent .katex').count();
  await page.evaluate(async()=>{await mathAudit.toggle(true);mathAudit.mode('live');});
  await page.waitForTimeout(400);
  await page.waitForFunction(()=>{const f=mathAudit.inspect();return f.formula==='source'||f.items>0;});
  await page.waitForTimeout(500);
  const value={...await page.evaluate(()=>mathAudit.inspect()),readingKatex};results.push({name,...value});console.log(name,value);return value;
 };
 for(const [name,source,count] of [
  ['dollar-inline','Before $x^2+y^2=z^2$ after',1],
  ['dollar-block','Before\n\n$$\n\\frac{a}{b}\n$$\n\nAfter',1],
  ['latex-delimiters','Before \\(x^2\\) after\n\n\\[\n\\int_0^1 x\\,dx\n\\]\n\nAfter',2],
  ['nested','> $x^2$\n\n- $y^2$\n\n| A |\n| --- |\n| $z^2$ |',3],
  ['crlf','Before $x$\r\n\r\n$$\r\ny^2\r\n$$\r\n\r\nAfter',2],
 ]){
  const value=await open(name,source);assert.equal(value.editorKatex,count,name);
  await page.locator('[data-editor-presentation="source"]').click();
  assert.equal((await page.evaluate(()=>mathAudit.inspect())).editorKatex,0);
  await page.locator('[data-editor-presentation="live"]').click();
  assert.equal((await page.evaluate(()=>mathAudit.inspect())).editorKatex,count);
 }
 if(output)await page.screenshot({path:output+'/normal-formulas.png'});
 await page.evaluate(()=>mathAudit.formula('source'));
 await page.locator('[data-editor-presentation="live"]').click();
 const setting=await page.evaluate(()=>mathAudit.inspect());
 results.push({name:'persisted-formula-source',...setting});assert.equal(setting.editorKatex,2);
 await page.evaluate(()=>mathAudit.formula('preview'));
 assert.equal((await page.evaluate(()=>mathAudit.inspect())).editorKatex,2);
 const below=await open('below-limit','$x$\n\n'+'plain '.repeat(49998));assert.equal(below.items,1);
 const above=await open('above-limit','$x$\n\n'+'plain '.repeat(50000));assert.equal(above.items,1);assert.equal(above.editorKatex,1);assert.equal(above.readingKatex,1);
 if(output)await page.screenshot({path:output+'/large-document-formulas.png'});
 const many=await open('formula-count-limit',Array(260).fill('$x$').join(' '));assert.equal(many.items,260);
 await page.waitForFunction(()=>mathAudit.inspect().editorKatex===260);
 const spaced=Array.from({length:320},(_,i)=>`Paragraph ${i}: $x_{${i}}$\n\n`).join('');
 await open('scroll-last-equation',spaced);
 await page.evaluate(()=>mathAudit.end());
 await page.locator('#markdownEditor .cm-line').filter({hasText:'Paragraph 319:'}).locator('.katex').waitFor();
 assert.equal(await page.evaluate(()=>mathAudit.raw()),spaced);
 // Source toggle/return and deletion/undo after deferred hydration.
 const last=page.locator('#markdownEditor .cm-line').filter({hasText:'Paragraph 319:'}).locator('.cm-formula-render');
 await last.hover();await last.locator('[data-formula-action="source"]').click();
 await last.locator('[data-formula-action="source"]').click();
 await last.focus();await page.keyboard.press('Delete');
 assert.equal(await page.evaluate(()=>mathAudit.raw()),spaced.replace('$x_{319}$',''));
 await page.locator('#markdownEditor > .cm-editor > .cm-scroller > .cm-content').focus();
 await page.keyboard.press('Control+z');assert.equal(await page.evaluate(()=>mathAudit.raw()),spaced);
 await page.evaluate(()=>mathAudit.end());
 await page.locator('#markdownEditor .cm-line').filter({hasText:'Paragraph 319:'}).locator('.katex').waitFor();
 const huge='$x$\n\n```text\n'+'data '.repeat(430000)+' $notMath$\n```\n\n$$\ny^2\n$$\n\nEnd';
 const hugeState=await open('beyond-two-megabytes',huge);assert.equal(hugeState.items,2);
 await page.evaluate(()=>mathAudit.end());
 await page.locator('#markdownEditor .katex').filter({hasText:'y'}).waitFor();
 // Incremental worker results must match the current document snapshot.
 await page.evaluate(()=>{const e=mathAudit.editor(),s=e.state.doc.toString(),p=s.indexOf('y^2');e.dispatch({changes:{from:p,to:p+3,insert:'z^3'}});});
 await page.locator('#markdownEditor .katex').filter({hasText:'z'}).waitFor();
 assert.equal(await page.evaluate(()=>mathAudit.raw()),huge.replace('y^2','z^3'));
 await page.evaluate(async()=>{
  mathAudit.editor().dispatch({changes:{from:0,insert:'new prefix\n\n'}});
  await mathAudit.toggle(false);
  mathAudit.open({path:'new-session.md',name:'new-session.md',directory:'.',content:'New $q$'});
  await mathAudit.toggle(true);mathAudit.mode('live');
 });
 await page.waitForTimeout(700);
 assert.equal(await page.evaluate(()=>mathAudit.raw()),'New $q$');
 assert.equal((await page.evaluate(()=>mathAudit.inspect())).items,1);
 assert.match(await page.locator('#markdownEditor .katex').textContent(),/q/);
 results.push({name:'page-errors',errors});assert.deepEqual(errors,[]);
 if(output)await writeFile(output+'/results.json',JSON.stringify(results,null,2));
 console.log('All diagnostic assertions passed; formula rendering regression.');
}catch(error){
 console.log(await page?.evaluate(()=>({state:mathAudit.inspect(),viewport:mathAudit.editor().viewport,ranges:mathAudit.editor().visibleRanges,selection:mathAudit.editor().state.selection.main,scroll:mathAudit.editor().scrollDOM.scrollTop,text:document.querySelector('#markdownEditor').innerText.slice(-1200),annotations:[...document.querySelectorAll('#markdownEditor annotation')].map(e=>e.textContent)})));
 if(output&&page)await page.screenshot({path:output+'/failure.png'});
 throw error;
}finally{await browser?.close();await server.close();}
