// Fresh isolated application and local dictionaries; no user files or profile.
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import {createServer} from 'vite';
const {chromium}=createRequire(import.meta.url)(process.env.PLAYWRIGHT_MODULE||'playwright');
const server=await createServer({root:fileURLToPath(new URL('..',import.meta.url)),server:{host:'127.0.0.1',port:0,watch:null,hmr:false},logLevel:'error'});
let browser,page;
try{
 await server.listen();browser=await chromium.launch({headless:true,executablePath:process.env.BROWSER_EXECUTABLE||undefined});page=await browser.newPage({viewport:{width:1400,height:1000}});page.setDefaultTimeout(10000);
 const errors=[];page.on('pageerror',e=>{errors.push(e.message);console.error('PAGEERROR',e.message);});page.on('console',m=>{if(m.type()==='error')console.error('CONSOLE',m.text());});await page.route('**/favicon.ico',route=>route.fulfill({status:204}));await page.route('**/*',route=>new URL(route.request().url()).hostname==='127.0.0.1'?route.continue():route.abort());await page.goto(server.resolvedUrls.local[0]+'tests/fixtures/multiline-edit-audit.html');const app=page.frameLocator('iframe');await app.locator('#newFileButton').evaluate(async()=>{await import('/src/main.js');});
 // The preview bridge otherwise always returns the same path. Simulate only
 // the backend's unique-new-file receipt; all editing remains via actual UI.
 await app.locator('#newFileButton').evaluate(()=>{let serial=0;window.quilliteMarkdown.newFile=async()=>({path:`/isolated-spelling-${++serial}.md`,name:`isolated-spelling-${serial}.md`,directory:'/',content:'',draft:true});});
 await app.locator('#newFileButton').click();await app.locator('#hideLivePreviewButton').click();
 const root=app.locator('#markdownEditor > .cm-editor'),content=root.locator('> .cm-scroller > .cm-content');
 const read=()=>root.evaluate(async el=>{const{EditorView}=await import('/node_modules/@codemirror/view/dist/index.js');return EditorView.findFromDOM(el).state.doc.toString();});
 const shot=async name=>{if(process.env.AUDIT_OUTPUT)await page.screenshot({path:`${process.env.AUDIT_OUTPUT}/${name}.png`});};
 const reset=async source=>{await app.locator('[data-editor-presentation="source"]').click();await content.fill(source);await content.press('Control+Home');await app.locator('[data-editor-presentation="live"]').click();await page.waitForTimeout(700);};
 const newDocument=async()=>{const accept=d=>d.accept();page.on('dialog',accept);try{await app.locator('#newFileButton').click();}finally{page.off('dialog',accept);}};
 const menu=async()=>{if(!await app.locator('#moreMenu').isVisible())await app.locator('#moreButton').click();};
 const marked=()=>root.locator('.cm-spelling-error').filter({hasText:/^wurld$/});
 const cases={plain:'Hello wurld.',emoji:'😀 Hello wurld.',bold:'Hello **wurld**.',quote:'> Hello wurld.',table:'| Word | Other |\n| --- | --- |\n| wurld | Hello |',details:'<details open>\n<summary>Hello</summary>\n\nHello wurld.\n\n</details>',summary:'<details open>\n<summary>Hello wurld</summary>\n\nHello world.\n\n</details>',footnote:'Hello[^n]\n\n[^n]: Hello wurld.',nested:'Hello[^n]\n\n[^n]: Hello\n    \n    | Word | Other |\n    | --- | --- |\n    | wurld | Hello |'};
 for(const[kind,source]of Object.entries(cases)){
  if(process.env.AUDIT_CASE&&process.env.AUDIT_CASE!==kind)continue;
  await reset(source);
  await page.waitForTimeout(1200);await shot(kind+'-01-marked');
  const misspelled=root.locator('.cm-spelling-error').filter({hasText:/^wurld$/});console.log(JSON.stringify({kind,marks:await misspelled.count()}));
  if(process.env.AUDIT_DEBUG)console.log(await root.evaluate(async el=>{const{EditorView}=await import('/node_modules/@codemirror/view/dist/index.js'),{spellingDecorations}=await import('/src/spelling-decorations.js');return [el,...el.querySelectorAll('.cm-editor')].map(dom=>{const v=EditorView.findFromDOM(dom),ranges=[];v.state.field(spellingDecorations,false)?.between(0,v.state.doc.length,(from,to)=>ranges.push({from,to}));return {text:v.state.doc.toString(),ranges};});}));
  assert.equal(await misspelled.count(),1,kind+' must mark the visible prose word');
  await misspelled.click({button:'right'});await app.locator('#spellcheckContextMenu').waitFor({state:'visible'});assert.equal(await app.locator('#spellingContextWord').textContent(),'wurld');await shot(kind+'-02-menu');
  await app.locator('#spellingSuggestions').getByRole('menuitem',{name:'world',exact:true}).click();assert.equal(await read(),source.replace('wurld','world'));
  // Source changes immediately; marks refresh on the normal spelling debounce.
  await root.locator('.cm-spelling-error').filter({hasText:/^world$/}).waitFor({state:'detached'});await shot(kind+'-03-corrected');
  await page.keyboard.press('Control+z');assert.equal(await read(),source,kind+' undo');await page.keyboard.press('Control+Shift+KeyZ');assert.equal(await read(),source.replace('wurld','world'),kind+' redo');
  console.log('PASS',kind);
 }
 if(!process.env.AUDIT_CASE){
  const source='| Word | Other |\n| --- | --- |\n| wurld | wurld |';await reset(source);assert.equal(await marked().count(),2);
  await marked().first().click({button:'right'});await app.locator('[data-spelling-action="ignore"]').click();await page.waitForTimeout(300);assert.equal(await marked().count(),0);assert.equal(await read(),source);console.log('PASS ignore all occurrences without source changes');
  await newDocument();await reset(source);assert.equal(await marked().count(),2,'Ignore does not leak into a new document');
  await marked().first().click({button:'right'});await app.locator('[data-spelling-action="add"]').click();await page.waitForTimeout(300);assert.equal(await marked().count(),0);assert.equal(await read(),source);await shot('dictionary-01-added');
  await newDocument();await reset(source);assert.equal(await marked().count(),0,'Personal dictionary applies to another document');
  await menu();page.once('dialog',d=>d.dismiss());await app.locator('[data-spellcheck-clear]').click();await page.keyboard.press('Escape');assert.equal(await marked().count(),0,'Cancel preserves dictionary');
  await menu();page.once('dialog',d=>d.accept());await app.locator('[data-spellcheck-clear]').click();await page.keyboard.press('Escape');await page.waitForTimeout(800);assert.equal(await marked().count(),2);assert.equal(await read(),source);console.log('PASS personal dictionary add, new document, cancel and clear');
  await menu();await app.locator('[data-spellcheck-toggle]').click();await page.keyboard.press('Escape');await page.waitForTimeout(300);assert.equal(await marked().count(),0);
  await menu();await app.locator('[data-spellcheck-toggle]').click();await page.keyboard.press('Escape');await page.waitForTimeout(800);assert.equal(await marked().count(),2,'Re-enable restores cached dictionary marks without typing');console.log('PASS disable and re-enable');
  const ignored='Hello world.\n\n`wurld`\n\n```text\nwurld\n```\n\n> ```text\n> wurld\n> ```\n\n    wurld\n\n$wurld$\n\n[Hello](https://wurld.example)';await reset(ignored);assert.equal(await marked().count(),0,'Code, formulas and URLs are not spelling prose');assert.equal(await read(),ignored);console.log('PASS non-prose exclusions');
  await reset('Hello colour.');
  for(const [language,count]of [['en-US',1],['en-GB',0]]){await menu();await app.locator('[data-settings-submenu="dictionary"]').click();await app.locator(`[data-spellcheck-language="${language}"]`).click();await page.keyboard.press('Escape');await page.waitForTimeout(1200);assert.equal(await root.locator('.cm-spelling-error').filter({hasText:/^colour$/}).count(),count,language);}
  await shot('dictionary-02-british');console.log('PASS US and UK dictionaries');
 }
 assert.deepEqual(errors,[]);
}catch(e){if(page&&process.env.AUDIT_OUTPUT)await page.screenshot({path:`${process.env.AUDIT_OUTPUT}/failure.png`});throw e;}
finally{await browser?.close();await server.close();}
