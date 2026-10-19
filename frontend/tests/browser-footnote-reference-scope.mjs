// Authorized synthetic-page testing; fresh browser, no real documents/profile.
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import {createServer} from 'vite';
const {chromium}=createRequire(import.meta.url)(process.env.PLAYWRIGHT_MODULE||'playwright');
const server=await createServer({root:fileURLToPath(new URL('..',import.meta.url)),server:{host:'127.0.0.1',port:0,watch:null,hmr:false},logLevel:'error'});
let browser,page;
try {
  await server.listen();browser=await chromium.launch({headless:true,executablePath:process.env.BROWSER_EXECUTABLE||undefined});
  page=await browser.newPage({viewport:{width:1600,height:1200}});page.setDefaultTimeout(10000);const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto(server.resolvedUrls.local[0]+'tests/fixtures/app-drag-audit.html');const app=page.frameLocator('iframe');await app.getByRole('button',{name:'新建文档',exact:true}).click();
  const editor=app.locator('#markdownEditor > .cm-editor'),content=editor.locator('> .cm-scroller > .cm-content'),reading=app.locator('#editorPreviewContent');
  const read=()=>editor.evaluate(async el=>{const{EditorView}=await import('/node_modules/@codemirror/view/dist/index.js');return EditorView.findFromDOM(el).state.doc.toString();});
  const shot=async name=>{if(process.env.AUDIT_OUTPUT){await page.waitForTimeout(150);await page.screenshot({path:`${process.env.AUDIT_OUTPUT}/${name}.png`});}};
  const ref=server.resolvedUrls.local[0]+'tests/fixtures/sample-image.svg';
  const firstURL='https://example.com/one?x=1&not=2&copy=3',nextURL='https://example.com/two?x=1&not=2&copy=3';
  for(const [kind,body] of [['plain','[Note][site]\n\n![Note][image]'],['table','| Link | Picture |\n| --- | --- |\n| [Note][site] | ![Note][image] |'],['details','<details open>\n<summary>More</summary>\n\n[Note][site]\n\n![Note][image]\n\n</details>']]) {
    const defs=`[image]: ${ref} "Shared image"\n[site]: ${firstURL} "Shared site"`;
    const doc=`Outside [Root][site] [^a] [^b]\n\n[^a]: Definitions\n    \n    ${defs.replaceAll('\n','\n    ')}\n    \n    Owner\n\n[^b]: Consumer\n    \n    ${body.replaceAll('\n','\n    ')}\n    \n    Tail\n\nAfter`+(kind==='plain'?`\n\n[image]: ${ref}?fallback=1 "Fallback"`:'');
    await app.getByRole('button',{name:'源码',exact:true}).click();await content.focus();await page.keyboard.press('Control+a');await page.keyboard.insertText(doc);
    for(let i=0;i<100&&await read()!==doc;i++)await page.waitForTimeout(20);assert.equal(await read(),doc);
    await page.keyboard.press('Control+Home');await app.getByRole('button',{name:'即时渲染',exact:true}).click();
    const notes=editor.locator('.cm-live-footnote-definition'),consumer=notes.nth(1);await consumer.waitFor({state:'visible'});await shot(kind+'-01-loaded');
    if(process.env.AUDIT_BASELINE){console.log(kind,JSON.stringify({liveImages:await consumer.locator('img').count(),liveLinks:await editor.locator('.cm-live-link').count(),readingImages:await reading.locator('img').count(),readingLinks:await reading.locator(`a[href="${firstURL}"]`).count()}));continue;}
    await consumer.locator('.cm-embedded-image img').waitFor({state:'visible'});assert.equal(await editor.locator('.cm-live-link').count(),2);
    await reading.locator('img').waitFor({state:'visible'});assert.equal(await reading.locator(`a[href="${firstURL}"]`).count(),2);
    await consumer.locator('.cm-live-link').click();await page.keyboard.press('Control+k');await app.locator('#linkDialog').waitFor({state:'visible'});
    assert.equal(await app.locator('#linkDestination').inputValue(),firstURL);await app.locator('#linkDestination').fill(nextURL);
    await app.locator('#linkForm button[type="submit"]').click();await app.locator('#linkDialog').waitFor({state:'hidden'});
    assert.equal(await read(),doc.replace(firstURL,`<${nextURL}>`));
    await reading.locator(`a[href="${nextURL}"]`).nth(1).waitFor({state:'visible'});await shot(kind+'-02-link-saved');await page.keyboard.press('Control+z');assert.equal(await read(),doc);
    const imageLine=notes.first().locator('.cm-line').filter({hasText:'[image]:'}).last();await imageLine.click();await page.keyboard.press('Home');await page.keyboard.press('Shift+End');
    await page.keyboard.insertText(`[image]: ${ref}?changed=1 "Changed"`);assert.equal(await read(),doc.replace(`[image]: ${ref} "Shared image"`,`[image]: ${ref}?changed=1 "Changed"`));
    await consumer.locator('img[src$="?changed=1"]').waitFor({state:'visible'});await reading.locator('img[src$="?changed=1"]').waitFor({state:'visible'});await shot(kind+'-03-definition-updated');await page.keyboard.press('Control+z');assert.equal(await read(),doc);
    if(kind==='plain') {
      await imageLine.click();await page.keyboard.press('Home');await page.keyboard.press('Shift+End');await page.keyboard.press('Backspace');
      assert.equal(await read(),doc.replace(`[image]: ${ref} "Shared image"`,''));
      await consumer.locator('img[src$="?fallback=1"]').waitFor({state:'visible'});await reading.locator('img[src$="?fallback=1"]').waitFor({state:'visible'});await shot('plain-04-definition-fallback');
      await page.keyboard.press('Control+z');assert.equal(await read(),doc);await consumer.locator('img[title="Shared image"]').waitFor({state:'visible'});await reading.locator('img[title="Shared image"]').waitFor({state:'visible'});
    }
    // Undo updates the document before the nested image has finished loading.
    // Verify the restored resource is ready before testing its hover controls.
    const image=consumer.locator('.cm-embedded-image'),restored=image.locator('img[title="Shared image"]');
    await restored.waitFor({state:'visible'});
    for(let i=0;i<100&&!await restored.evaluate(el=>el.complete&&el.naturalWidth>0);i++)await page.waitForTimeout(20);
    assert.ok(await restored.evaluate(el=>el.complete&&el.naturalWidth>0));
    await image.hover();
    assert.ok(await image.locator('[data-image-action="source"]').evaluate(async button=>{
      let previous='',stable=0;
      for(let i=0;i<180;i++){
        const r=button.getBoundingClientRect(),style=getComputedStyle(button.parentElement),rect=JSON.stringify([r.x,r.y,r.width,r.height]);
        stable=style.opacity==='1'&&style.visibility==='visible'&&rect===previous?stable+1:0;previous=rect;
        if(stable>=3)return true;await new Promise(requestAnimationFrame);
      }return false;
    }),'restored image toolbar settles before clicking');
    await image.locator('[data-image-action="source"]').click();
    assert.equal(await image.locator('[data-image-action="source"]').getAttribute('aria-expanded'),'true');
    await image.locator('[data-image-action="source"]').click();
    assert.equal(await image.locator('[data-image-action="source"]').getAttribute('aria-expanded'),'false');
    await restored.waitFor({state:'visible'});assert.equal(await read(),doc);await shot(kind+'-05-source-returned');
    console.log(kind+': cross-footnote/root references, nested link save/undo, definition image update/undo and source return passed');
  }
  assert.deepEqual(errors,[]);
}catch(e){if(page&&process.env.AUDIT_OUTPUT)await page.screenshot({path:`${process.env.AUDIT_OUTPUT}/failure.png`});throw e;}
finally{await browser?.close();await server.close();}
