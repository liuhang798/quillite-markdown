// Fresh browser context and synthetic documents only.
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import {createServer} from 'vite';
const {chromium}=createRequire(import.meta.url)(process.env.PLAYWRIGHT_MODULE||'playwright');
const server=await createServer({root:fileURLToPath(new URL('..',import.meta.url)),server:{host:'127.0.0.1',port:0,watch:null,hmr:false},logLevel:'error'});
let browser,page;
try {
  await server.listen();browser=await chromium.launch({headless:true,executablePath:process.env.BROWSER_EXECUTABLE||undefined});
  page=await browser.newPage({viewport:{width:1600,height:1100}});page.setDefaultTimeout(10000);const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto(server.resolvedUrls.local[0]+'tests/fixtures/app-drag-audit.html');const app=page.frameLocator('iframe');await app.getByRole('button',{name:'新建文档',exact:true}).click();
  const editor=app.locator('#markdownEditor > .cm-editor'),content=editor.locator('> .cm-scroller > .cm-content'),reading=app.locator('#editorPreviewContent .footnotes');
  const read=()=>editor.evaluate(async el=>{const{EditorView}=await import('/node_modules/@codemirror/view/dist/index.js');return EditorView.findFromDOM(el).state.doc.toString();});
  const shot=async name=>{if(process.env.AUDIT_OUTPUT){await page.waitForTimeout(100);await page.screenshot({path:`${process.env.AUDIT_OUTPUT}/${name}.png`});}};
  const ref=server.resolvedUrls.local[0]+'tests/fixtures/sample-image.svg';
  for(const [kind,img,link] of [['full','![Sample][image]','[Website][site]'],['collapsed','![image][]','[site][]'],['shortcut','![image]','[site]']]) {
    const defs=`[image]: ${ref} "Picture"\n[site]: https://example.com/one "Website"`;
    const doc=`Before[^n]\n\n[^n]: Intro\n    \n    ${link}\n    \n    ${img}\n    \n    Tail\n\n${defs}\n\nAfter`;
    await app.getByRole('button',{name:'源码',exact:true}).click();await content.focus();await page.keyboard.press('Control+a');await page.keyboard.insertText(doc);
    for(let i=0;i<100&&await read()!==doc;i++)await page.waitForTimeout(20);assert.equal(await read(),doc);
    await page.keyboard.press('Control+Home');await app.getByRole('button',{name:'即时渲染',exact:true}).click();
    const note=editor.locator('.cm-live-footnote-definition');await note.waitFor({state:'visible'});await note.locator('.cm-embedded-image img').waitFor({state:'visible'});
    await shot(kind+'-01-loaded');
    if(process.env.AUDIT_BASELINE){console.log(kind,JSON.stringify({imageReading:await reading.locator('img').count(),linkReading:await reading.locator('a[href="https://example.com/one"]').count(),linkLive:await note.locator('.cm-live-link').count()}));continue;}
    await reading.locator('img').waitFor({state:'visible'});await reading.locator('a[href="https://example.com/one"]').waitFor({state:'visible'});await note.locator('.cm-live-link').waitFor({state:'visible'});
    assert.equal(await reading.locator('img').getAttribute('src'),ref);assert.equal(await reading.locator('img').getAttribute('title'),'Picture');
    await note.locator('.cm-live-link').click();await page.keyboard.press('Control+k');await app.locator('#linkDialog').waitFor({state:'visible'});
    console.log(kind+' link dialog',JSON.stringify({label:await app.locator('#linkLabel').inputValue(),url:await app.locator('#linkDestination').inputValue()}));await shot(kind+'-04-link-dialog');
    if(!process.env.AUDIT_LINK_PROBE)assert.equal(await app.locator('#linkDestination').inputValue(),'https://example.com/one');
    await page.keyboard.press('Escape');assert.equal(await read(),doc);
    if(!process.env.AUDIT_LINK_PROBE) {
      await note.locator('.cm-live-link').click();await page.keyboard.press('Control+k');await app.locator('#linkDialog').waitFor({state:'visible'});
      await app.locator('#linkDestination').fill('https://example.com/two');await app.locator('#linkTitle').fill('Updated link');await app.locator('#linkForm button[type="submit"]').click();
      await app.locator('#linkDialog').waitFor({state:'hidden'});
      assert.equal(await read(),doc.replace('[site]: https://example.com/one "Website"','[site]: <https://example.com/two> "Updated link"'));
      await reading.locator('a[href="https://example.com/two"][title="Updated link"]').waitFor({state:'visible'});await shot(kind+'-05-link-saved');
      await page.keyboard.press('Control+z');assert.equal(await read(),doc);await reading.locator('a[href="https://example.com/one"]').waitFor({state:'visible'});
    }
    const image=note.locator('.cm-embedded-image');await image.hover();await image.locator('[data-image-action="source"]').click();await image.locator('[data-image-action="source"]').click();assert.equal(await read(),doc);
    const defLine=content.locator('> .cm-line').filter({hasText:'[image]:'});await defLine.click();await page.keyboard.press('Home');await page.keyboard.press('Shift+End');
    const changed=`[image]: ${ref}?updated=1 "Updated"`;await page.keyboard.insertText(changed);
    assert.equal(await read(),doc.replace(defs.split('\n')[0],changed));await image.locator('img[src$="?updated=1"]').waitFor({state:'visible'});await reading.locator('img[src$="?updated=1"]').waitFor({state:'visible'});
    await shot(kind+'-02-updated');await page.keyboard.press('Control+z');assert.equal(await read(),doc);
    await image.locator('img[title="Picture"]').waitFor({state:'visible'});await reading.locator('img[title="Picture"]').waitFor({state:'visible'});
    // Definition removal must remove live styling, not leave a stale link.
    const linkLine=content.locator('> .cm-line').filter({hasText:'[site]:'});await linkLine.click();await page.keyboard.press('Home');await page.keyboard.press('Shift+End');await page.keyboard.press('Backspace');
    assert.equal(await read(),doc.replace(defs.split('\n')[1],''));await note.locator('.cm-live-link').waitFor({state:'detached'});await reading.locator('a[href="https://example.com/one"]').waitFor({state:'detached'});
    await page.keyboard.press('Control+z');assert.equal(await read(),doc);await note.locator('.cm-live-link').waitFor({state:'visible'});await reading.locator('a[href="https://example.com/one"]').waitFor({state:'visible'});
    await shot(kind+'-03-restored');console.log(kind+': shared image/link rendering, source return, definition update/removal and exact undo passed');
  }
  assert.deepEqual(errors,[]);
}catch(e){if(page&&process.env.AUDIT_OUTPUT)await page.screenshot({path:`${process.env.AUDIT_OUTPUT}/failure.png`});throw e;}
finally{await browser?.close();await server.close();}
