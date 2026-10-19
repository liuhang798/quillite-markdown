// Isolated synthetic documents only; no user profile or real files.
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
  page=await browser.newPage({viewport:{width:1700,height:1100}});page.setDefaultTimeout(8000);
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto(server.resolvedUrls.local[0]+'tests/fixtures/app-drag-audit.html');
  const app=page.frameLocator('iframe');await app.getByRole('button',{name:'新建文档',exact:true}).click();
  const read=()=>app.locator('#markdownEditor > .cm-editor').evaluate(async el=>{const {EditorView}=await import('/node_modules/@codemirror/view/dist/index.js');return EditorView.findFromDOM(el).state.doc.toString();});
  const shot=async name=>{if(process.env.AUDIT_OUTPUT)await page.screenshot({path:`${process.env.AUDIT_OUTPUT}/${name}.png`});};
  const ref=server.resolvedUrls.local[0]+'tests/fixtures/sample-image.svg';
  for(const [kind,cell] of [
    ['row',`![甲](${ref}) ![乙](${ref})`],
    ['html-row',`<img src="${ref}" alt="甲" width="120"> <img src="${ref}" alt="乙" width="120">`],
    ['reference-row','![甲][shared] ![乙][shared]'],
    ['mixed',`前言 ![甲](${ref}) 中间 **强调** ![乙](${ref}) 后文`],
    ['linked',`[![甲](${ref})](https://example.com/target) 结尾`],
  ]) for(const [container,intro,prefix,suffix] of [['plain','','',''],['quote','','> ',''],['list','- 条目\n\n','  ',''],['details','<details open>\n<summary>标题</summary>\n\n','','\n\n</details>']]) {
    const name=kind+'-'+container, isRow=kind.endsWith('row'), count=kind==='linked'?1:2;
    const source='前文\n\n'+intro+['| 内容 | 对照 |','| --- | --- |',`| ${cell} | 保留 |`].map(line=>prefix+line).join('\n')+suffix+`\n\n后文\n\n[shared]: ${ref} "共享标题"`;
    await app.getByRole('button',{name:'源码',exact:true}).click();await app.getByRole('textbox').fill(source);await page.keyboard.press('Control+Home');await app.getByRole('button',{name:'即时渲染',exact:true}).click();
    const editor=app.locator('#markdownEditor'),reading=app.getByRole('article'),table=editor.locator('.cm-live-table');
    const images=table.locator('.cm-embedded-image img');
    await images.first().waitFor({state:'visible'});await reading.locator('td img').first().waitFor({state:'visible'});
    await shot(`${name}-01-loaded`);
    assert.equal(await images.count(),count);assert.equal(await read(),source);
    if(isRow) await reading.locator('table.quillite-image-row').waitFor({state:'visible'});
    const first=table.locator('.cm-embedded-image').first();
    await (isRow?first.locator('.cm-image-card').first():first).hover();await first.locator('[data-image-action="right"]').first().click();
    const changed=await read();
    await shot(`${name}-02-aligned`);
    assert.equal(findMarkdownTables(changed).length,1);assert.equal(findMarkdownTables(changed)[0].model.cells[1][1],'保留');
    await images.first().waitFor({state:'visible'});
    assert.equal(await images.count(),count);
    if(kind==='linked') await reading.locator('a[href="https://example.com/target"] > img').waitFor({state:'visible'});
    if(kind==='mixed') {assert.ok(changed.includes('中间 **强调**'));assert.ok(changed.includes('后文'));}
    await table.hover();await table.locator(':scope > .cm-live-block-actions').getByRole('button',{name:'查看源码',exact:true}).click();
    await app.getByRole('button',{name:'返回渲染',exact:true}).click();
    await shot(`${name}-03-remounted`);
    await images.first().waitFor({state:'visible'});assert.equal(await read(),changed);
    assert.equal(await table.locator('> .cm-live-block-content > table > tbody > tr > td > .cm-editor').count(),2);
    await page.keyboard.press('Control+z');assert.equal(await read(),source);
    await first.hover();await first.locator('[data-image-action="source"]').click();await first.locator('[data-image-action="source"]').click();assert.equal(await read(),source);
    await (isRow?first.locator('.cm-image-card').first():first).hover();await first.locator('[data-image-action="size"]').first().click();
    await first.getByLabel('宽度',{exact:true}).first().fill('80');await first.getByLabel('保持比例',{exact:true}).first().uncheck();
    await first.getByLabel('高度',{exact:true}).first().fill('40');await first.getByRole('button',{name:'应用尺寸',exact:true}).first().click();
    await reading.locator('td img[width="80"][height="40"]').waitFor({state:'visible'});
    const resized=await read();assert.equal(findMarkdownTables(resized)[0].model.cells[1][1],'保留');
    await table.hover();await table.locator(':scope > .cm-live-block-actions').getByRole('button',{name:'查看源码',exact:true}).click();
    await app.getByRole('button',{name:'返回渲染',exact:true}).click();await images.first().waitFor({state:'visible'});
    assert.equal(await read(),resized);await page.keyboard.press('Control+z');assert.equal(await read(),source);
    if(isRow) {
      await first.hover();await first.locator('[data-image-action="split"]').click();
      await reading.locator('table.quillite-image-row').waitFor({state:'detached'});
      assert.equal(await table.locator('.cm-line').filter({hasText:'<br>'}).count(),0);
      await shot(`${name}-04-split`);
      assert.equal(await table.locator('.cm-embedded-image').count(),2,'Split must actually produce two independently controlled images');
      const separated=await read();assert.ok(separated.includes('<br><br>'));assert.equal(findMarkdownTables(separated).length,1);
      await first.hover();await first.locator('[data-image-action="join"]').click();
      assert.equal(await table.locator('.cm-embedded-image').count(),1);assert.equal(await images.count(),2);
      await page.keyboard.press('Control+z');assert.equal(await read(),separated);
      await page.keyboard.press('Control+z');assert.equal(await read(),source);
    }
    console.log(name+': alignment, size, remount, source return, split/join where applicable, exact undo passed');
  }
  assert.deepEqual(errors,[]);
}catch(error){if(page&&process.env.AUDIT_OUTPUT)await page.screenshot({path:`${process.env.AUDIT_OUTPUT}/failure.png`});throw error;}
finally{await browser?.close();await server.close();}
