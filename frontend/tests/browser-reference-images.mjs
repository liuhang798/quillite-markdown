// Fresh browser and synthetic documents only; no user profile or real files.
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import {createServer} from 'vite';
const {chromium}=createRequire(import.meta.url)(process.env.PLAYWRIGHT_MODULE || 'playwright');
const server=await createServer({root:fileURLToPath(new URL('..',import.meta.url)),server:{host:'127.0.0.1',port:0,watch:null,hmr:false},logLevel:'error'});
let browser,page;
try {
  await server.listen();browser=await chromium.launch({headless:true,executablePath:process.env.BROWSER_EXECUTABLE || undefined});
  page=await browser.newPage({viewport:{width:1600,height:1100}});page.setDefaultTimeout(8000);
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto(server.resolvedUrls.local[0]+'tests/fixtures/app-drag-audit.html');
  const app=page.frameLocator('iframe');await app.getByRole('button',{name:'新建文档',exact:true}).click();
  const read=()=>app.locator('#markdownEditor > .cm-editor').evaluate(async el=>{const {EditorView}=await import('/node_modules/@codemirror/view/dist/index.js');return EditorView.findFromDOM(el).state.doc.toString();});
  const shot=async name=>{if(process.env.AUDIT_OUTPUT)await page.screenshot({path:`${process.env.AUDIT_OUTPUT}/${name}.png`});};
  const ref=server.resolvedUrls.local[0]+'tests/fixtures/sample-image.svg';
  for(const [kind,token] of [['full','![图][shared]'],['collapsed','![shared][]'],['shortcut','![shared]']])
  for(const [container,intro,prefix,suffix] of [['plain','','',''],['quote','','> ',''],['list','- 条目\n\n','  ',''],['details','<details open>\n<summary>标题</summary>\n\n','','\n\n</details>']]) {
    const name=kind+'-'+container, definition=`[shared]: ${ref} "共享图片"`;
    const source='前文\n\n'+intro+['| 公式 | 图片 |','| --- | --- |',`| $x^2$ | ${token} |`].map(l=>prefix+l).join('\n')+suffix+'\n\n'+definition+'\n\n后文';
    await app.getByRole('button',{name:'源码',exact:true}).click();await app.getByRole('textbox').fill(source);await page.keyboard.press('Control+Home');await app.getByRole('button',{name:'即时渲染',exact:true}).click();
    const editor=app.locator('#markdownEditor'),reading=app.getByRole('article');
    await reading.locator('td img').waitFor({state:'visible'});await shot(name+'-01-loaded');
    const table=editor.locator('.cm-live-table'),image=table.locator('.cm-embedded-image');
    assert.equal(await table.count(),1);assert.equal(await image.count(),1);
    assert.equal(await image.locator('img').getAttribute('src'),ref);assert.equal(await image.locator('img').getAttribute('title'),'共享图片');
    assert.equal(await editor.locator('.cm-embedded-image').count(),1,'Exactly one owner');
    await image.hover();await image.locator('[data-image-action="source"]').click();await image.locator('[data-image-action="source"]').click();assert.equal(await read(),source);
    // Change only the external definition through the live editable line. No
    // mode switch or reload may mask stale references in retained cell views.
    const defLine=editor.locator('.cm-line').filter({hasText:definition}).last();
    await defLine.click();await page.keyboard.press('Home');await page.keyboard.press('Shift+End');
    const changed=definition.replace(ref,ref+'?version=2').replace('共享图片','更新图片');
    await page.keyboard.insertText(changed);assert.equal(await read(),source.replace(definition,changed));
    await image.locator('img[src$="?version=2"]').waitFor({state:'visible'});
    await reading.locator('td img[src$="?version=2"]').waitFor({state:'visible'});
    assert.equal(await image.locator('img').getAttribute('title'),'更新图片');await shot(name+'-02-updated');
    await page.keyboard.press('Control+z');assert.equal(await read(),source);
    await image.locator(`img[src="${ref}"]`).waitFor({state:'visible'});
    await defLine.click();await page.keyboard.press('Home');await page.keyboard.press('Shift+End');
    const titleOnly=definition.replace('共享图片','只改标题');await page.keyboard.insertText(titleOnly);
    await image.locator('img[title="只改标题"]').waitFor({state:'visible'});assert.equal(await image.locator('img').getAttribute('src'),ref);
    await page.keyboard.press('Control+z');assert.equal(await read(),source);await image.locator('img[title="共享图片"]').waitFor({state:'visible'});
    await defLine.click();await page.keyboard.press('Home');await page.keyboard.press('Shift+End');await page.keyboard.press('Backspace');
    assert.equal(await read(),source.replace(definition,''));
    await image.waitFor({state:'detached'});await reading.locator('td img').waitFor({state:'detached'});
    assert.equal(await table.count(),1);await shot(name+'-03-undefined');
    await page.keyboard.press('Control+z');assert.equal(await read(),source);await image.waitFor({state:'visible'});
    await image.hover();await image.locator('[data-image-action="right"]').click();
    const aligned=await read();assert.match(aligned,/margin-left:auto/);assert.ok(aligned.includes(definition),'Formatting one use must retain shared definition');
    await page.keyboard.press('Control+z');assert.equal(await read(),source);
    await table.hover();await table.locator(':scope > .cm-live-block-actions').getByRole('button',{name:'查看源码',exact:true}).click();
    await app.getByRole('button',{name:'返回渲染',exact:true}).click();assert.equal(await read(),source);await image.waitFor({state:'visible'});
    await shot(name+'-04-returned');console.log(name+': render, source-return, external definition update/delete/undo, layout undo passed');
  }
  // A definition edited in one projected body must refresh all uses in a
  // different body, including a second-level table, without changing either use.
  const definition=`[shared]: ${ref} "共用"`;
  const source=`<details open>\n<summary>定义</summary>\n\n定义说明\n\n${definition}\n\n</details>\n\n<details open>\n<summary>图片</summary>\n\n![外层][shared]\n\n| 图片 |\n| --- |\n| ![单元格][shared] |\n\n</details>`;
  await app.getByRole('button',{name:'源码',exact:true}).click();await app.getByRole('textbox').fill(source);await page.keyboard.press('Control+Home');await app.getByRole('button',{name:'即时渲染',exact:true}).click();
  const editor=app.locator('#markdownEditor'),images=editor.locator('.cm-embedded-image img');
  await images.nth(1).waitFor({state:'visible'});assert.equal(await images.count(),2);
  const defLine=editor.locator('.cm-line').filter({hasText:definition}).last();
  await defLine.click();await page.keyboard.press('Home');await page.keyboard.press('Shift+End');
  const changed=definition.replace(ref,ref+'?shared=2');await page.keyboard.insertText(changed);
  assert.equal(await read(),source.replace(definition,changed));
  await editor.locator('.cm-embedded-image img[src$="?shared=2"]').nth(1).waitFor({state:'visible'});
  await app.getByRole('article').locator('img[src$="?shared=2"]').nth(1).waitFor({state:'visible'});
  await shot('shared-05-nested-definition');await page.keyboard.press('Control+z');assert.equal(await read(),source);
  await editor.locator(`.cm-embedded-image img[src="${ref}"]`).nth(1).waitFor({state:'visible'});
  const table=editor.locator('.cm-live-table');await table.hover();await table.getByRole('button',{name:'编辑表格',exact:true}).click();
  const dialog=app.getByRole('dialog',{name:'编辑表格',exact:true});await dialog.waitFor({state:'visible'});
  await dialog.getByRole('button',{name:'添加行',exact:true}).click();
  await dialog.locator('[data-table-cell-row="2"][data-table-cell-column="0"]').fill('![新增][shared]');
  await dialog.locator('#confirmTable').click();await dialog.waitFor({state:'hidden'});
  const saved=await read();for(const text of [definition,'![外层][shared]','![单元格][shared]','![新增][shared]'])assert.ok(saved.includes(text),text);
  await editor.locator('.cm-embedded-image img').nth(2).waitFor({state:'visible'});
  await app.getByRole('article').locator('img').nth(2).waitFor({state:'visible'});
  await shot('shared-06-structural-save');await page.keyboard.press('Control+z');assert.equal(await read(),source);
  console.log('nested-definition: edit in one body refreshes both uses in another body/table; new reference row and exact undo passed');
  assert.deepEqual(errors,[]);
}catch(error){if(page&&process.env.AUDIT_OUTPUT)await page.screenshot({path:`${process.env.AUDIT_OUTPUT}/failure.png`});throw error;}
finally{await browser?.close();await server.close();}
