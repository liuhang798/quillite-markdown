// User-authorized isolated UI. Synthetic file responses; no user document/profile.
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import {createServer} from 'vite';
const {chromium}=createRequire(import.meta.url)(process.env.PLAYWRIGHT_MODULE||'playwright');
const output=process.env.AUDIT_OUTPUT;if(!output)throw Error('AUDIT_OUTPUT required');
const kinds=['formula','nested-formula','diagram','nested-diagram','table','footnote','image'];
const cases=['rename','save-as'].flatMap(mode=>kinds.map(kind=>({name:mode+'-'+kind,mode,kind})));
const server=await createServer({root:fileURLToPath(new URL('..',import.meta.url)),server:{host:'127.0.0.1',port:0,watch:null,hmr:false},logLevel:'error'});
let browser,page;const failures=[];
try{
 await server.listen();browser=await chromium.launch({headless:true,executablePath:process.env.BROWSER_EXECUTABLE||undefined});
 for(const {name,mode,kind} of cases){
  page=await browser.newPage({viewport:{width:1440,height:1000}});page.setDefaultTimeout(5000);
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.route('**/*',r=>new URL(r.request().url()).hostname==='127.0.0.1'?r.continue():r.abort());
  const shot=suffix=>page.screenshot({path:`${output}/${name}-${suffix}.png`,animations:'disabled'});
  try{
   const formula='$$x+1$$',diagram='```mermaid\nflowchart LR\n A[Original] --> B[End]\n```';
   let body=kind.includes('formula')?formula:kind.includes('diagram')?diagram:kind==='table'?'| Name | Value |\n| --- | --- |\n| Original | 1 |':kind==='footnote'?'Ref[^n]\n\n[^n]: Original note':`![Photo](${server.resolvedUrls.local[0]}tests/fixtures/sample-image.svg)`;
   if(kind.startsWith('nested'))body='<details open>\n<summary>Details</summary>\n\n'+body+'\n\n</details>';
   const original='BEFORE\n\n'+body+'\n\nAFTER';
   await page.goto(server.resolvedUrls.local[0]);await page.evaluate(async()=>{await import('/src/main.js');});
   await page.evaluate(({original})=>{
    const doc=(path,content)=>({path,name:path,directory:'.',content,revision:'a'.repeat(64)}),b=window.quilliteMarkdown;
    const audit=window.identityAudit={calls:[]};
    b.openFile=async()=>doc('Original.md',original);
    b.renameDocument=async(...args)=>{audit.calls.push(['rename',...args]);return doc('Renamed.md',original);};
    b.saveAs=async(path,content)=>{audit.calls.push(['save-as',path,content]);return doc('Renamed.md',content);};
    b.saveFile=async(...args)=>{audit.calls.push(['save',...args]);return doc(args[0],args[1]);};
   },{original});
   await page.locator('#openFileButton').click();await page.locator('#editButton').click();
   const editor=page.locator('#markdownEditor > .cm-editor'),content=editor.locator('> .cm-scroller > .cm-content');await content.waitFor();
   if(await page.locator('#hideLivePreviewButton').isVisible())await page.locator('#hideLivePreviewButton').click();
   const read=()=>editor.evaluate(async el=>{const{EditorView}=await import('/node_modules/@codemirror/view/dist/index.js');return EditorView.findFromDOM(el).state.doc.toString();});
   await content.focus();await page.keyboard.press('Control+End');await page.keyboard.insertText(' EDIT');assert.equal(await read(),original+' EDIT');
   await shot('01-before');
   if(mode==='rename'){
    await page.locator('#renameDocumentButton').click();await page.locator('#renameDocumentName').fill('Renamed.md');await shot('02-rename');await page.locator('#confirmRenameDocument').click();await page.locator('#renameDocumentDialog').waitFor({state:'hidden'});
   }else await page.locator('#saveAsButton').click();
   await page.waitForFunction(()=>document.querySelector('#editorFileName').textContent==='Renamed.md');
   assert.equal(await read(),original+' EDIT');
   await shot('03-renamed');
   if(kind.includes('formula')){
    const widget=editor.locator('.cm-formula-render').first();await widget.focus();await page.keyboard.press('Enter');await page.locator('#formulaDialog').waitFor({state:'visible'});await shot('04-edit');
    await page.locator('#formulaAdvanced > summary').click();await page.locator('#formulaMarkdownSource').fill('$$x+2$$');await page.locator('#insertFormula').click();await page.locator('#formulaDialog').waitFor({state:'hidden'});assert.equal(await read(),(original+' EDIT').replace(formula,()=>'$$x+2$$'));
   }else if(kind.includes('diagram')){
    const card=editor.locator('.cm-diagram-card').first();await card.locator('svg,canvas').first().waitFor();await card.focus();await page.keyboard.press('Enter');await page.locator('#diagramDialog').waitFor({state:'visible'});await shot('04-edit');await page.locator('#cancelDiagram').click();assert.equal(await read(),original+' EDIT');
   }else if(kind==='table'){
    const table=editor.locator('.cm-live-table');await table.hover();await table.getByRole('button',{name:'编辑表格',exact:true}).click();await page.locator('#tableDialog').waitFor({state:'visible'});await shot('04-edit');await page.locator('[data-table-cell-row="1"][data-table-cell-column="0"]').fill('Changed');await page.locator('#confirmTable').click();await page.locator('#tableDialog').waitFor({state:'hidden'});assert.match(await read(),/Changed/);
   }else if(kind==='footnote'){
    await editor.locator('.cm-live-footnote button').click();await page.locator('#footnoteDialog').waitFor({state:'visible'});await shot('04-edit');await page.locator('#footnoteBody').fill('Changed note');await page.locator('#footnoteForm button[type="submit"]').click();await page.locator('#footnoteDialog').waitFor({state:'hidden'});assert.match(await read(),/Changed note/);
   }else{
    const image=editor.locator('.cm-embedded-image').first(),toggle=image.locator('[data-image-action="source"]');await image.hover();await toggle.click();assert.equal(await toggle.getAttribute('aria-expanded'),'true');await shot('04-edit');await toggle.click();assert.equal(await toggle.getAttribute('aria-expanded'),'false');assert.equal(await read(),original+' EDIT');
   }
   const edited=await read();await content.focus();
   if(edited!==original+' EDIT'){await page.keyboard.press('Control+z');assert.equal(await read(),original+' EDIT',name+' media edit undo');}
   await page.keyboard.press('Control+z');assert.equal(await read(),original,name+' rename preserves undo');await page.keyboard.press('Control+y');assert.equal(await read(),original+' EDIT');
   if(edited!==original+' EDIT'){await page.keyboard.press('Control+y');assert.equal(await read(),edited,name+' media edit redo');}
   // Redo restores nested focus; click the outer tail before parent typing.
   await content.locator(':scope > .cm-line').filter({hasText:/^AFTER EDIT$/}).click();await page.keyboard.press('End');await page.keyboard.insertText(' CONTINUE');assert.equal(await read(),edited+' CONTINUE');await page.keyboard.press('Control+z');assert.equal(await read(),edited);
   await page.locator('#saveButton').click();await page.waitForFunction(()=>identityAudit.calls.some(c=>c[0]==='save'));const saves=await page.evaluate(()=>identityAudit.calls.filter(c=>c[0]==='save'));assert.equal(saves.at(-1)[1],'Renamed.md');assert.equal(saves.at(-1)[2],edited);
   await shot('05-result');assert.deepEqual(errors,[]);console.log('PASS',name);
  }catch(e){failures.push(name);console.error('FAIL',name,e.stack);try{await shot('failure');}catch{}}
  await page.close();page=null;
 }
 console.log(JSON.stringify({PASS:cases.length-failures.length,total:cases.length,failures}));assert.deepEqual(failures,[]);
}finally{await browser?.close();await server.close();}
