// Only user-authorized isolated synthetic documents; all changes use the UI.
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import {createServer} from 'vite';
const {chromium}=createRequire(import.meta.url)(process.env.PLAYWRIGHT_MODULE||'playwright');
const server=await createServer({root:fileURLToPath(new URL('..',import.meta.url)),server:{host:'127.0.0.1',port:0,watch:null,hmr:false},logLevel:'error'});
let browser,page;
try{
  await server.listen();browser=await chromium.launch({headless:true,executablePath:process.env.BROWSER_EXECUTABLE||undefined});
  page=await browser.newPage({viewport:{width:1500,height:1000}});page.setDefaultTimeout(8000);const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto(server.resolvedUrls.local[0]+'tests/fixtures/app-drag-audit.html');const app=page.frameLocator('iframe');await app.getByRole('button',{name:'新建文档',exact:true}).click();
  const editor=app.locator('#markdownEditor > .cm-editor'),content=editor.locator('> .cm-scroller > .cm-content');
  const read=()=>editor.evaluate(async el=>{const{EditorView}=await import('/node_modules/@codemirror/view/dist/index.js');const s=EditorView.findFromDOM(el).state;return{doc:s.doc.toString(),ranges:s.selection.ranges.map(r=>({anchor:r.anchor,head:r.head}))};});
  const shot=async name=>{if(process.env.AUDIT_OUTPUT){await page.waitForTimeout(100);await page.screenshot({path:`${process.env.AUDIT_OUTPUT}/${name}.png`});}};
  const defs='\n\n[^alpha]: First definition\n[^beta]: **Second** definition\n    continuation';
  for(const[kind,body]of [['heading','# Title[^beta] after\n\nOther[^alpha] again[^beta]'],['quote','> Quote[^beta] after\n\nOther[^alpha] again[^beta]'],['table','| Notes |\n| --- |\n| Cell[^beta] after |\n\nOther[^alpha] again[^beta]'],['details','<details open>\n<summary>Title</summary>\n\nInside[^beta] after\n\n</details>\n\nOther[^alpha] again[^beta]']]){
    const doc=body+defs;
    await app.getByRole('button',{name:'源码',exact:true}).click();await content.focus();await page.keyboard.press('Control+a');await page.keyboard.insertText(doc);
    for(let i=0;i<100&&(await read()).doc!==doc;i++)await page.waitForTimeout(20);assert.equal((await read()).doc,doc);
    await page.keyboard.press('Control+Home');await app.getByRole('button',{name:'即时渲染',exact:true}).click();await page.waitForTimeout(150);await shot(kind+'-loaded');
    if(process.env.AUDIT_BASELINE){console.log(kind,await content.innerText());continue;}
    const refs=editor.locator('.cm-live-footnote button');
    assert.deepEqual(await refs.allTextContents(),['1','2','1']);
    assert.deepEqual(await app.locator('#editorPreviewContent .footnote-ref').allTextContents(),['1','2','1']);
    await refs.first().click();const dialog=app.locator('#footnoteDialog');await dialog.waitFor({state:'visible'});
    assert.equal(await dialog.locator('#footnoteLabel').inputValue(),'beta');
    assert.equal(await dialog.locator('#footnoteBody').inputValue(),'**Second** definition\ncontinuation');await shot(kind+'-dialog');
    await dialog.locator('#footnoteBody').fill('Changed **note**\nnew line');await dialog.getByRole('button',{name:'应用脚注',exact:true}).click();await dialog.waitFor({state:'hidden'});
    assert.equal((await read()).doc,doc.replace('**Second** definition\n    continuation','Changed **note**\n    new line'));
    await app.locator('#editorPreviewContent .footnotes').getByText('note',{exact:true}).waitFor({state:'visible'});
    await page.keyboard.press('Control+z');assert.equal((await read()).doc,doc);
    await refs.first().click();await dialog.waitFor({state:'visible'});await dialog.locator('#footnoteBody').fill('cancelled');await page.keyboard.press('Escape');assert.equal((await read()).doc,doc);
    await page.keyboard.press('Enter');await dialog.waitFor({state:'visible'});assert.equal((await read()).doc,doc);await page.keyboard.press('Escape');
    await refs.first().focus();await page.keyboard.press('Delete');assert.equal((await read()).doc,doc.replace('[^beta]',''));assert.deepEqual(await refs.allTextContents(),['1','2']);await page.keyboard.press('Control+z');assert.equal((await read()).doc,doc);assert.deepEqual(await refs.allTextContents(),['1','2','1']);
    await refs.first().focus();await page.keyboard.press('ArrowRight');const caret=(await read()).ranges[0].head;assert.equal(caret,doc.indexOf('[^beta]')+7);
    await page.keyboard.insertText('X');assert.equal((await read()).doc,doc.slice(0,caret)+'X'+doc.slice(caret));await page.keyboard.press('Control+z');assert.equal((await read()).doc,doc);
    if(kind==='heading'){
      await refs.first().focus();await page.keyboard.press('ArrowRight');await page.keyboard.press('Enter');assert.equal((await read()).doc,doc.replace(' after','\nafter'));await page.keyboard.press('Control+z');assert.equal((await read()).doc,doc);
    }
    await shot(kind+'-restored');console.log(kind+': numbering, edit, cancel, deletion, caret and undo passed');
  }
  if(!process.env.AUDIT_BASELINE){
    await app.locator('#moreButton').click();await app.locator('[data-settings-submenu="language"]').click();await app.locator('[data-language="en"]').click();
    await app.locator('#colorModeButton').click();await page.setViewportSize({width:820,height:720});
    const ref=editor.locator('.cm-live-footnote button').first();await ref.click();const dialog=app.locator('#footnoteDialog');await dialog.waitFor({state:'visible'});
    assert.equal(await dialog.locator('h2').textContent(),'Edit footnote');const unchanged=(await read()).doc;
    await dialog.locator('#footnoteBody').focus();await page.keyboard.press('End');await page.keyboard.press('Enter');await page.keyboard.insertText('test line');assert.equal((await read()).doc,unchanged,'dialog input must not change the background document');
    await dialog.getByRole('button',{name:'Apply footnote',exact:true}).focus();await page.keyboard.press('Tab');assert.equal(await dialog.locator('#footnoteLabel').evaluate(el=>el===document.activeElement),true);
    const box=await dialog.boundingBox();assert.ok(box.x>=0&&box.y>=0&&box.x+box.width<=820&&box.y+box.height<=720);
    await shot('english-dark-compact');await page.keyboard.press('Escape');assert.equal((await read()).doc,unchanged);console.log('English, dark compact dialog, multiline draft isolation and Tab cycle passed');
  }
  assert.deepEqual(errors,[]);
}catch(e){if(page&&process.env.AUDIT_OUTPUT)await page.screenshot({path:`${process.env.AUDIT_OUTPUT}/failure.png`});throw e;}
finally{await browser?.close();await server.close();}
