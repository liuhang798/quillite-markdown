// Isolated synthetic documents only; edits use actual pointer/keyboard events.
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import {createServer} from 'vite';
const {chromium}=createRequire(import.meta.url)(process.env.PLAYWRIGHT_MODULE||'playwright');
const server=await createServer({root:fileURLToPath(new URL('..',import.meta.url)),server:{host:'127.0.0.1',port:0,watch:null,hmr:false},logLevel:'error'});
let browser,page;
try {
 await server.listen();browser=await chromium.launch({headless:true,executablePath:process.env.BROWSER_EXECUTABLE||undefined});
 page=await browser.newPage({viewport:{width:1500,height:1200}});page.setDefaultTimeout(10000);const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto(server.resolvedUrls.local[0]+'tests/fixtures/app-drag-audit.html');const app=page.frameLocator('iframe');await app.getByRole('button',{name:'新建文档',exact:true}).click();
 const editor=app.locator('#markdownEditor > .cm-editor'),content=editor.locator('> .cm-scroller > .cm-content');
 const read=()=>editor.evaluate(async el=>{const{EditorView}=await import('/node_modules/@codemirror/view/dist/index.js');return EditorView.findFromDOM(el).state.doc.toString();});
 const shot=async name=>{if(process.env.AUDIT_OUTPUT){await page.waitForTimeout(200);await page.screenshot({path:`${process.env.AUDIT_OUTPUT}/${name}.png`});}};
 const wrap=body=>'<details open>\n<summary>Title</summary>\n\n'+body+'\n\n</details>';
 const body='ALPHA\nBETA\n\n```text\n</details>\nCODE\n```\n\n| Head |\n| --- |\n| CELL |';
 const note=x=>'Ref[^n]\n\n[^n]: '+x.replaceAll('\n','\n    ');
 const cases=[['quote','> ',x=>x],['double','> > ',x=>x],['footnote','> ',note],['nested','> ',x=>wrap(x).replace('<summary>Title','<summary>Outer')],['list-quote','  > ',x=>'- Item\n\n'+x],['quote-div','> ',x=>x],['footnote-div','> ',note]];
 for(const[name,prefix,outer]of cases) {
  const isDiv=name.endsWith('-div'),wrapped=isDiv?'<div>\n\n'+body+'\n\n</div>':wrap(body);
  const source='BEFORE\n\n'+outer((wrapped+'\n\nAFTER').split('\n').map(line=>prefix+line).join('\n'))+'\n\nOUTSIDE';
  await app.getByRole('button',{name:'源码',exact:true}).click();await content.focus();await page.keyboard.press('Control+a');await page.keyboard.insertText(source);assert.equal(await read(),source);
  await page.keyboard.press('Control+Home');await app.getByRole('button',{name:'即时渲染',exact:true}).click();
  const block=isDiv?editor.locator('.cm-live-html-content'):editor.locator('.cm-live-details').filter({has:page.locator('.cm-live-details-title').filter({hasText:'Title'})}).last();
  await block.waitFor({state:'visible'});await shot(name+'-01-loaded');
  const title=block.locator('> .cm-live-block-content > .cm-live-details-header .cm-content');
  const bodyContent=block.locator(isDiv?'> .cm-live-block-content > .cm-editor > .cm-scroller > .cm-content':'> .cm-live-block-content > .cm-live-details-body > .cm-editor > .cm-scroller > .cm-content');
  const history=async expected=>{assert.equal(await read(),expected);await page.keyboard.press('Control+z');assert.equal(await read(),source);await page.keyboard.press('Control+Shift+KeyZ');assert.equal(await read(),expected);await page.keyboard.press('Control+z');assert.equal(await read(),source);};
  if(!isDiv){await title.click();await page.keyboard.press('End');await page.keyboard.insertText('-EDIT');await history(source.replace('Title</summary>','Title-EDIT</summary>'));}
  await bodyContent.locator('> .cm-line').filter({hasText:/^ALPHA$/}).click();await page.keyboard.press('End');await page.keyboard.press('Enter');await page.keyboard.insertText('OMEGA');
  await shot(name+'-02-newline');await history(source.replace('ALPHA','ALPHA\n'+(name.startsWith('footnote')?'    ':'')+prefix+'OMEGA'));
  const code=block.locator('.cm-live-code .cm-line').filter({hasText:/^CODE$/});await code.click();await page.keyboard.press('End');await page.keyboard.insertText('X');await history(source.replace('CODE','CODEX'));
  const cell=block.locator('td .cm-content');await cell.click();await page.keyboard.press('End');await page.keyboard.insertText('X');await history(source.replace('CELL','CELLX'));
  if(!isDiv){const toggle=block.locator('> .cm-live-block-content > .cm-live-details-header button');await toggle.click();assert.equal(await toggle.getAttribute('aria-expanded'),'false');await toggle.click();assert.equal(await toggle.getAttribute('aria-expanded'),'true');assert.equal(await read(),source);}
  await block.hover();await block.locator('> .cm-live-block-actions button').click();
  const back=editor.getByRole('button',{name:'返回渲染',exact:true});await back.waitFor({state:'visible'});await shot(name+'-03-source-before-scroll');await back.scrollIntoViewIfNeeded();await shot(name+'-03-source');await back.click();await block.waitFor({state:'visible'});assert.equal(await read(),source);await shot(name+'-04-returned');
  console.log(name+': '+(isDiv?'':'title, collapse, ')+'prose Enter, literal HTML code, table, undo/redo and source return passed');
 }
 assert.deepEqual(errors,[]);
}catch(error){if(page&&process.env.AUDIT_OUTPUT)await page.screenshot({path:`${process.env.AUDIT_OUTPUT}/editing-failure.png`});throw error;}
finally{await browser?.close();await server.close();}
