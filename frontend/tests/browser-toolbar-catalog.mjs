// Fresh isolated app. UI mutations only; editor state is read for assertions.
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import {readFile} from 'node:fs/promises';
import {createServer} from 'vite';
const {chromium}=createRequire(import.meta.url)(process.env.PLAYWRIGHT_MODULE||'playwright');
const root=fileURLToPath(new URL('..',import.meta.url));
const html=await readFile(root+'/index.html','utf8');
const commands=[...new Set([...html.matchAll(/data-format="([^"]+)"/g)].map(m=>m[1]))];
const pairs={bold:['**','**','.cm-live-strong'],italic:['*','*','.cm-live-em'],strikethrough:['~~','~~','.cm-live-strike'],highlight:['==','==','.cm-live-highlight'],'inline-code':['`','`','.cm-live-inline-code'],'bold-italic':['***','***','.cm-live-strong'],underline:['<u>','</u>','.cm-live-u'],superscript:['<sup>','</sup>','.cm-live-sup'],subscript:['<sub>','</sub>','.cm-live-sub'],'keyboard-key':['<kbd>','</kbd>','.cm-live-kbd']};
const dialogs={link:['linkDialog','cancelLink'],'reference-link':['linkDialog','cancelLink'],autolink:['linkDialog','cancelLink'],table:['tableDialog','cancelTable'],image:['imageDialog','cancelImage'],'formula-builder':['formulaDialog','cancelFormula'],'diagram-builder':['diagramDialog','cancelDiagram']};
const server=await createServer({root,server:{host:'127.0.0.1',port:0,watch:null,hmr:false},logLevel:'error'});
let browser,page;
try{
 await server.listen();browser=await chromium.launch({headless:true,executablePath:process.env.BROWSER_EXECUTABLE||undefined});
 page=await browser.newPage({viewport:{width:Number(process.env.AUDIT_WIDTH)||1500,height:1100}});page.setDefaultTimeout(12000);
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 // Local synthetic image response, never a real upload or external request.
 await page.route('**/*',r=>new URL(r.request().url()).hostname==='127.0.0.1'?r.continue():r.abort());
 await page.route('https://toolbar.test/image.png',r=>r.fulfill({contentType:'image/png',body:Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a9f8AAAAASUVORK5CYII=','base64')}));
 await page.goto(server.resolvedUrls.local[0]+'tests/fixtures/multiline-edit-audit.html');const frame=page.frames().find(f=>f.parentFrame());await frame.evaluate(async()=>{await import('/src/main.js');});const app=page.frameLocator('iframe');
 await app.locator('#newFileButton').click();await app.locator('#hideLivePreviewButton').click();
 const editor=app.locator('#markdownEditor > .cm-editor'),content=editor.locator('> .cm-scroller > .cm-content');
 const read=()=>editor.evaluate(async el=>{const{EditorView}=await import('/node_modules/@codemirror/view/dist/index.js');const s=EditorView.findFromDOM(el),r=s.state.selection.main;return{doc:s.state.doc.toString(),from:r.from,to:r.to};});
 const shot=async name=>{if(process.env.AUDIT_OUTPUT){await page.waitForTimeout(220);await page.screenshot({path:process.env.AUDIT_OUTPUT+'/'+name+'.png'});}};
 const reset=async(command)=>{
  const text=command==='escape'?'*Alpha*':command==='autolink'?'https://example.com':'Alpha',doc='Before\n\n'+text+'\n\nAfter';
  await app.locator('[data-editor-presentation="source"]').click();await content.fill(doc);await content.press('Control+Home');await content.press('ArrowDown');await content.press('ArrowDown');await content.press('Home');
  if(['hard-break','horizontal-rule'].includes(command))await content.press('End');else await content.press('Shift+End');
  await app.locator('[data-editor-presentation="live"]').click();await page.waitForTimeout(100);return {doc,text};
 };
 const format=async command=>{
  const button=app.locator('#editorFormatBar [data-format="'+command+'"]');
  if(await button.isVisible())await button.click();else{await app.locator('#moreFormatButton').click();await shot(command+'-01-menu');await app.locator('#moreFormatMenu [data-format-command="'+command+'"]:visible').click();}
 };
 let passed=0;
 for(const command of commands){
  if(process.env.AUDIT_CASE&&process.env.AUDIT_CASE!==command)continue;
  console.log('START',command);const {doc,text}=await reset(command);await shot(command+'-01-selected');
  assert.equal((await read()).doc,doc);await format(command);
  if(dialogs[command]){
   const[id,cancel]=dialogs[command];await app.locator('#'+id).waitFor({state:'visible'});await app.locator('#'+cancel).click();assert.equal((await read()).doc,doc,'Cancel preserves '+command);await format(command);await app.locator('#'+id).waitFor({state:'visible'});
  }
  if(['link','reference-link','autolink'].includes(command)){await app.locator('#linkDestination').fill('https://example.com/a');await app.locator('#linkForm button[type="submit"]').click();}
  if(command==='text-color')await app.locator('#textColorMenu [data-text-color="spectrum-3-red"]').click();
  if(command==='code-block')await app.locator('#codeLangMenu [data-code-lang="js"]').click();
  if(command==='table'){await app.locator('[data-table-cell-row="0"][data-table-cell-column="0"]').fill('Head');await app.locator('[data-table-cell-row="1"][data-table-cell-column="0"]').fill('Cell');await app.locator('#confirmTable').click();}
  if(command==='image'){await app.locator('#imageUrl').fill('https://toolbar.test/image.png');await app.locator('#imageAltInput').fill('Image');await app.locator('#confirmImage').click();}
  if(command==='formula-builder')await app.locator('#insertFormula').click();
  if(command==='diagram-builder')await app.locator('#insertDiagram').click();
  await page.waitForTimeout(250);const changed=await read();console.log('RESULT',command,JSON.stringify(changed));
  assert.notEqual(changed.doc,doc,command+' creates one edit');assert.ok(changed.doc.startsWith('Before\n\n')&&changed.doc.includes('\n\nAfter'),command+' preserves neighboring paragraphs');
  if(pairs[command]){const[a,b,selector]=pairs[command];assert.equal(changed.doc,doc.replace(text,a+text+b));await editor.locator(selector).filter({hasText:'Alpha'}).first().waitFor({state:'visible'});}
  const expected={quote:'> Alpha','unordered-list':'- Alpha','ordered-list':'1. Alpha','task-list':'- [ ] Alpha','text-color':'<span data-md-color="spectrum-3-red">Alpha</span>',escape:'\\*Alpha\\*',comment:'<!-- Alpha -->','html-block':'<div>\n\nAlpha\n\n</div>',collapsible:'<details>\n<summary>折叠标题</summary>\n\nAlpha\n\n</details>',link:'[Alpha](https://example.com/a)',autolink:'<https://example.com/a>'};
  if(command==='link')expected.link='[Alpha](<https://example.com/a>)';
  if(expected[command])assert.equal(changed.doc,doc.replace(text,expected[command]));
  if(command==='hard-break')assert.equal(changed.doc,'Before\n\nAlpha  \n\n\nAfter');
  if(command==='horizontal-rule')assert.equal(changed.doc,'Before\n\nAlpha\n\n---\n\n\n\nAfter');
  const widgets={table:'.cm-live-table',image:'.cm-embedded-image', 'code-block':'.cm-live-code', 'html-block':'.cm-live-html-content',collapsible:'.cm-live-details',footnote:'.cm-live-footnote-definition','formula-builder':'.cm-formula-render','diagram-builder':'.cm-diagram-card'};
  if(widgets[command])await editor.locator(widgets[command]).first().waitFor({state:'visible'});
  await shot(command+'-02-applied');
  // History works from the actual focus returned by the toolbar/dialog.
  await page.keyboard.press('Control+z');assert.equal((await read()).doc,doc,command+' single undo');
  await page.keyboard.press('Control+Shift+KeyZ');assert.equal((await read()).doc,changed.doc,command+' single redo');
  // Source/live switches must not mutate or consume a history step.
  await app.locator('[data-editor-presentation="source"]').click();assert.equal((await read()).doc,changed.doc);await app.locator('[data-editor-presentation="live"]').click();
  await content.focus();await page.keyboard.press('Control+End');await page.keyboard.insertText('Z');assert.equal((await read()).doc,changed.doc+'Z',command+' continued typing');await page.keyboard.press('Control+z');assert.equal((await read()).doc,changed.doc);
  await shot(command+'-03-history');console.log(JSON.stringify({command,cancel:!!dialogs[command],applied:true,history:true,continued:true}));passed++;
 }
 let headings=0;
 if(!process.env.AUDIT_CASE)for(let level=1;level<=6;level++){
  const {doc}=await reset('heading');const prefix='#'.repeat(level)+' ';
  await app.locator('#headingSelect').selectOption(prefix);const heading=doc.replace('Alpha',prefix+'Alpha');assert.equal((await read()).doc,heading);
  const line=editor.locator('.cm-live-h'+level).filter({hasText:'Alpha'});await line.waitFor({state:'visible'});
  assert.ok(Number(await line.evaluate(el=>getComputedStyle(el).fontWeight))>=600);
  await shot('heading-'+level+'-01-applied');await app.locator('#headingSelect').selectOption('');assert.equal((await read()).doc,doc);
  await page.keyboard.press('Control+z');assert.equal((await read()).doc,heading);await page.keyboard.press('Control+Shift+KeyZ');assert.equal((await read()).doc,doc);
  await content.locator('> .cm-line').filter({hasText:/^Alpha$/}).click();await page.keyboard.press('End');await page.keyboard.insertText('Z');assert.equal((await read()).doc,doc.replace('Alpha','AlphaZ'));await page.keyboard.press('Control+z');assert.equal((await read()).doc,doc);
  console.log(JSON.stringify({heading:level,paragraph:true,history:true,continued:true}));headings++;
 }
 assert.deepEqual(errors,[]);console.log(JSON.stringify({PASS:passed,catalog:commands.length,headings,pageErrors:errors}));
}catch(error){if(page&&process.env.AUDIT_OUTPUT)await page.screenshot({path:process.env.AUDIT_OUTPUT+'/failure.png'});throw error;}
finally{await browser?.close();await server.close();}
