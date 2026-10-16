// Isolated UI audit: all document writes use keyboard or visible controls.
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import {createServer} from 'vite';
const{chromium}=createRequire(import.meta.url)(process.env.PLAYWRIGHT_MODULE||'playwright');
const server=await createServer({root:fileURLToPath(new URL('..',import.meta.url)),server:{host:'127.0.0.1',port:0,watch:null,hmr:false},logLevel:'error'});
const cases=[
 ['table','| Head | Other |\n| --- | --- |\n| needle needle | needle |'],
 ['code','```text\nneedle needle\n```'],
 ['details','<details open>\n<summary>Section</summary>\n\nneedle needle\n\n</details>'],
 ['nested','<details open>\n<summary>Section</summary>\n\n| Head | Other |\n| --- | --- |\n| needle needle | needle |\n\n</details>'],
 ['html','<div>\n\nneedle needle\n\n</div>'],
 ['footnote','Note[^n]\n\n[^n]: needle needle'],
 ['summary','<details open>\n<summary>needle needle</summary>\n\nBody\n\n</details>'],
 ['comment','<!-- needle needle -->'],
];
let browser,page;
try{
 await server.listen();browser=await chromium.launch({headless:true,executablePath:process.env.BROWSER_EXECUTABLE||undefined});page=await browser.newPage({viewport:{width:1500,height:1000}});page.setDefaultTimeout(10000);const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.route('**/*',route=>new URL(route.request().url()).hostname==='127.0.0.1'?route.continue():route.abort());await page.goto(server.resolvedUrls.local[0]+'tests/fixtures/app-drag-audit.html');const app=page.frameLocator('iframe');await app.locator('#newFileButton').evaluate(async()=>{await import('/src/main.js');});await app.locator('#newFileButton').click();await app.locator('#hideLivePreviewButton').click();
 const editor=app.locator('#markdownEditor > .cm-editor'),content=editor.locator('> .cm-scroller > .cm-content');
 const read=()=>editor.evaluate(async el=>{const{EditorView}=await import('/node_modules/@codemirror/view/dist/index.js');const s=EditorView.findFromDOM(el).state;return{doc:s.doc.toString(),ranges:s.selection.ranges.map(r=>[r.from,r.to])};});
 const shot=async name=>{if(process.env.AUDIT_OUTPUT)await page.screenshot({path:`${process.env.AUDIT_OUTPUT}/${name}.png`});};
 for(const[kind,body]of cases)for(const nestedOnly of [false,true]){
  const name=kind+(nestedOnly?'-only':'-mixed');console.log('START',name);const doc=(nestedOnly?'Before':'Before needle')+'\n\n'+body+'\n\n'+(nestedOnly?'After':'After needle'),matches=[...doc.matchAll(/needle/g)].map(m=>[m.index,m.index+6]);
  await app.locator('[data-editor-presentation="source"]').click();await content.focus();await page.keyboard.press('Control+a');await page.keyboard.insertText(doc);await page.keyboard.press('Control+Home');await app.locator('[data-editor-presentation="live"]').click();await content.focus();await page.keyboard.press('Control+f');
  const panel=editor.locator(':scope > .cm-panels .cm-search');await panel.locator('input[name="search"]').fill('needle');await page.keyboard.press('End');await content.locator('.cm-searchMatch').first().waitFor();await page.waitForTimeout(100);await shot(kind+'-01-matches');
  const highlighted=await content.locator('.cm-searchMatch').evaluateAll(nodes=>nodes.filter(n=>n.textContent==='needle'&&n.getBoundingClientRect().width>0).length);
  console.log('MATCHES',kind,{expected:matches.length,highlighted});if(!process.env.AUDIT_SKIP_HIGHLIGHT)assert.equal(highlighted,matches.length,kind+': visible results include all nested fields');
  await panel.locator('input[name="re"]').check();await panel.locator('input[name="search"]').fill('needle$');await page.keyboard.press('End');await page.waitForTimeout(100);
  assert.equal(await content.locator('.cm-searchMatch').count(),[...doc.matchAll(/needle$/gm)].length,name+': regex anchors use original source, not synthetic cell boundaries');
  await panel.locator('input[name="re"]').uncheck();await panel.locator('input[name="search"]').fill('needle');await page.keyboard.press('End');
  await panel.locator('button[name="select"]').click();assert.deepEqual((await read()).ranges,matches);await page.waitForTimeout(100);
  assert.equal(await content.locator('.cm-searchMatch-selected').count(),matches.length,name+': every selected match has visible feedback');
  await page.keyboard.press('Escape');await shot(name+'-02-selected');assert.deepEqual((await read()).ranges,matches,name+': closing search retains all selected matches');
  await page.keyboard.insertText('MATCH');assert.equal((await read()).doc,doc.replaceAll('needle','MATCH'),kind+': input changes every selected result exactly');
  await page.keyboard.press('Control+z');assert.equal((await read()).doc,doc);await page.keyboard.press('Control+y');assert.equal((await read()).doc,doc.replaceAll('needle','MATCH'));await shot(name+'-03-typed');
  if(kind==='table'||kind==='nested'){
   await page.keyboard.press('Control+z');assert.deepEqual((await read()).ranges,matches);await page.keyboard.insertText('|');
   const expected=(nestedOnly?'Before':'Before |')+'\n\n'+body.replaceAll('needle','\\|')+'\n\n'+(nestedOnly?'After':'After |');assert.equal((await read()).doc,expected,name+': typing a pipe preserves table columns');
   await page.keyboard.press('Control+z');assert.equal((await read()).doc,doc);
  }
  console.log('PASS',name);
 }
 assert.deepEqual(errors,[]);console.log(JSON.stringify({PASS:cases.length*2,pageErrors:errors}));
}catch(e){if(page&&process.env.AUDIT_OUTPUT)await page.screenshot({path:`${process.env.AUDIT_OUTPUT}/failure.png`});throw e;}finally{await browser?.close();await server.close();}
