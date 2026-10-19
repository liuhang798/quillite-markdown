// Only isolated synthetic documents; never attach to a user profile.
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import {createServer} from 'vite';
import {findMarkdownTables} from '../src/table-designer.js';
const {chromium}=createRequire(import.meta.url)(process.env.PLAYWRIGHT_MODULE || 'playwright');
const server=await createServer({root:fileURLToPath(new URL('..',import.meta.url)),server:{host:'127.0.0.1',port:0,watch:null,hmr:false},logLevel:'error'});
let browser,page;
try {
  await server.listen();browser=await chromium.launch({headless:true,executablePath:process.env.BROWSER_EXECUTABLE || undefined});
  page=await browser.newPage({viewport:{width:1600,height:1100}});page.setDefaultTimeout(8000);
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto(server.resolvedUrls.local[0]+'tests/fixtures/embedded-image-audit.html');
  await page.waitForFunction(()=>!!window.imageAudit);
  const embedded=await page.evaluate(()=>imageAudit.view.state.field(imageAudit.imagePreviewField).items[0].images[0].ref);
  await page.goto(server.resolvedUrls.local[0]+'tests/fixtures/app-drag-audit.html');
  const app=page.frameLocator('iframe');await app.getByRole('button',{name:'新建文档',exact:true}).click();
  const read=()=>app.locator('#markdownEditor > .cm-editor').evaluate(async el=>{const {EditorView}=await import('/node_modules/@codemirror/view/dist/index.js');return EditorView.findFromDOM(el).state.doc.toString();});
  const shot=async name=>{if(process.env.AUDIT_OUTPUT)await page.screenshot({path:`${process.env.AUDIT_OUTPUT}/${name}.png`});};
  const ref=server.resolvedUrls.local[0]+'tests/fixtures/sample-image.svg';
  for(const [kind,imageSource] of [['markdown',`![样图](${ref})`],['html',`<img src="${ref}" alt="样图" width="120">`],['embedded',`<img src="${embedded}" alt="内嵌图" width="120">`]])
  for(const [container,intro,prefix,suffix] of [['plain','','',''],['quote','','> ',''],['list','- 条目\n\n','  ',''],['details','<details open>\n<summary>标题</summary>\n\n','','\n\n</details>']]) {
    const name=kind+'-'+container;
    const source='前文\n\n'+intro+['| 公式 | 图片 |','| --- | --- |',`| $x^2$ | ${imageSource} |`].map(l=>prefix+l).join('\n')+suffix+'\n\n后文';
    await app.getByRole('button',{name:'源码',exact:true}).click();await app.getByRole('textbox').fill(source);await page.keyboard.press('Control+Home');await app.getByRole('button',{name:'即时渲染',exact:true}).click();
    const editor=app.locator('#markdownEditor'),reading=app.getByRole('article');
    await reading.locator('td .katex').waitFor({state:'visible'});await reading.locator('td img').waitFor({state:'visible'});
    await shot(`${name}-loaded`);
    assert.equal(await editor.locator('.cm-live-table').count(),1,'Mixed table must remain a table, not raw pipes');
    assert.equal(await editor.locator('.cm-live-table .cm-formula-render').count(),1);
    assert.equal(await editor.locator('.cm-live-table .cm-embedded-image').count(),1);
    assert.equal(await editor.locator('.cm-formula-render').count(),1,'No duplicate outer formula');
    assert.equal(await editor.locator('.cm-embedded-image').count(),1,'No duplicate outer image');
    const table=editor.locator('.cm-live-table'),formula=table.locator('.cm-formula-render'),image=table.locator('.cm-embedded-image');
    await formula.hover();await formula.locator('[data-formula-action="edit"]').click();
    const dialog=app.locator('#formulaDialog');await dialog.waitFor({state:'visible'});
    await dialog.locator('#formulaAdvanced > summary').click();await dialog.locator('#formulaMarkdownSource').fill('$x^3$');await dialog.locator('#insertFormula').click();await dialog.waitFor({state:'hidden'});
    assert.equal(await read(),source.replace('$x^2$','$x^3$'));await page.keyboard.press('Control+z');assert.equal(await read(),source);
    await formula.click();await page.keyboard.press('Delete');assert.equal(await read(),source.replace('$x^2$',''));await page.keyboard.press('Control+z');assert.equal(await read(),source);
    await formula.hover();await formula.locator('[data-formula-action="source"]').click();
    await formula.locator('[data-formula-action="source"]').click();assert.equal(await read(),source);
    await image.hover();await image.locator('[data-image-action="source"]').click();await image.locator('[data-image-action="source"]').click();assert.equal(await read(),source);
    await image.hover();await image.locator('[data-image-action="right"]').click();
    assert.match(await read(),/margin-left:auto/);assert.equal(await table.count(),1);
    await page.keyboard.press('Control+z');assert.equal(await read(),source);
    await image.hover();await image.locator('[data-image-action="size"]').click();
    await image.getByLabel('宽度',{exact:true}).fill('80');await image.getByLabel('保持比例',{exact:true}).uncheck();
    await image.getByLabel('高度',{exact:true}).fill('40');await image.getByRole('button',{name:'应用尺寸',exact:true}).click();
    assert.match(await read(),/width="80"/);assert.match(await read(),/height="40"/);
    await reading.locator('td img[width="80"][height="40"]').waitFor({state:'visible'});
    await shot(`${name}-resized`);
    await page.keyboard.press('Control+z');assert.equal(await read(),source);
    // Saving a block formula or raw cell separator must not split the table.
    await formula.hover();await formula.locator('[data-formula-action="edit"]').click();
    await dialog.locator('#formulaAdvanced > summary').click();
    await dialog.locator('[data-formula-mode="block"]').click();
    await dialog.locator('#insertFormula').click();
    assert.equal(await dialog.isVisible(),true,'Table block formula must preserve the draft and explain the constraint');
    assert.equal(await read(),source);await shot(`${name}-block-guard`);
    await dialog.locator('[data-formula-mode="inline"]').click();
    await dialog.locator('#formulaMarkdownSource').fill('$x|y$');await dialog.locator('#insertFormula').click();
    assert.equal(await dialog.isVisible(),true);assert.equal(await read(),source);
    await dialog.locator('#formulaMarkdownSource').fill('$x\\vert y$');await dialog.locator('#insertFormula').click();
    await dialog.waitFor({state:'hidden'});assert.equal(await read(),source.replace('$x^2$','$x\\vert y$'));
    await page.keyboard.press('Control+z');assert.equal(await read(),source);
    await table.hover();await table.locator(':scope > .cm-live-block-actions').getByRole('button',{name:'查看源码',exact:true}).click();
    await app.getByRole('button',{name:'返回渲染',exact:true}).click();assert.equal(await read(),source);
    await shot(`${name}-roundtrip`);
    await table.hover();await table.getByRole('button',{name:'编辑表格',exact:true}).click();
    const tableDialog=app.getByRole('dialog',{name:'编辑表格',exact:true});await tableDialog.waitFor({state:'visible'});
    assert.equal(await tableDialog.locator('[data-table-cell-row="1"][data-table-cell-column="1"]').inputValue(),imageSource);
    await tableDialog.getByRole('button',{name:'添加行',exact:true}).click();
    await tableDialog.locator('[data-table-cell-row="2"][data-table-cell-column="0"]').fill('Added');
    await tableDialog.locator('#confirmTable').click();await tableDialog.waitFor({state:'hidden'});
    const saved=findMarkdownTables(await read());assert.equal(saved.length,1);
    assert.equal(saved[0].model.cells[1][0],'$x^2$');assert.equal(saved[0].model.cells[1][1],imageSource);
    assert.equal(saved[0].model.cells[2][0],'Added');
    await reading.locator('td').getByText('Added',{exact:true}).waitFor({state:'visible'});
    assert.equal(await table.locator('.cm-formula-render').count(),1);assert.equal(await table.locator('.cm-embedded-image').count(),1);
    await shot(`${name}-structure`);await page.keyboard.press('Control+z');assert.equal(await read(),source);
    console.log(name+': rendering, formula edit/delete/guards/undo, image size/alignment/undo, all source returns and structural save passed');
  }
  assert.deepEqual(errors,[]);
}catch(error){if(page&&process.env.AUDIT_OUTPUT)await page.screenshot({path:`${process.env.AUDIT_OUTPUT}/failure.png`});throw error;}
finally{await browser?.close();await server.close();}
