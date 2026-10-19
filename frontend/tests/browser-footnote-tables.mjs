// Only synthetic documents in a fresh isolated browser context.
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import {createServer} from 'vite';
import {prepareFootnotes} from '../src/markdown-formats.js';
import {findMarkdownTables} from '../src/table-designer.js';
const {chromium}=createRequire(import.meta.url)(process.env.PLAYWRIGHT_MODULE||'playwright');
const server=await createServer({root:fileURLToPath(new URL('..',import.meta.url)),server:{host:'127.0.0.1',port:0,watch:null,hmr:false},logLevel:'error'});
let browser,page;
try {
  await server.listen();browser=await chromium.launch({headless:true,executablePath:process.env.BROWSER_EXECUTABLE||undefined});
  page=await browser.newPage({viewport:{width:Number(process.env.AUDIT_WIDTH)||1500,height:1000}});page.setDefaultTimeout(10000);const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto(server.resolvedUrls.local[0]+'tests/fixtures/app-drag-audit.html');const app=page.frameLocator('iframe');await app.getByRole('button',{name:'新建文档',exact:true}).click();
  const editor=app.locator('#markdownEditor > .cm-editor'),content=editor.locator('> .cm-scroller > .cm-content');
  const read=()=>editor.evaluate(async el=>{const{EditorView}=await import('/node_modules/@codemirror/view/dist/index.js');return EditorView.findFromDOM(el).state.doc.toString();});
  const shot=async name=>{if(process.env.AUDIT_OUTPUT){await page.waitForTimeout(250);await page.screenshot({path:`${process.env.AUDIT_OUTPUT}/${name}.png`});}};
  const basic='| Head | Other |\n| --- | ---: |\n| Cell | $x^2$ |';
  for(const [kind,body] of [['plain',basic],['quote',basic.split('\n').map(line=>'> '+line).join('\n')],['details','<details open>\n<summary>More</summary>\n\n'+basic+'\n\n</details>'],...(process.env.AUDIT_TOOLBAR?[['list','- Item\n\n'+basic.split('\n').map(line=>'  '+line).join('\n')],['details-quote','<details open>\n<summary>More</summary>\n\n'+basic.split('\n').map(line=>'> '+line).join('\n')+'\n\n</details>']]:[])]) {
    const source='Before[^n]\n\n[^n]: Intro\n    \n    '+body.replaceAll('\n','\n    ')+'\n    \n    Tail\n\nAfter';
    await app.getByRole('button',{name:'源码',exact:true}).click();await content.focus();await page.keyboard.press('Control+a');await page.keyboard.insertText(source);
    for(let i=0;i<100&&await read()!==source;i++)await page.waitForTimeout(20);assert.equal(await read(),source);
    await page.keyboard.press('Control+Home');await app.getByRole('button',{name:'即时渲染',exact:true}).click();
    const table=editor.locator('.cm-live-footnote-definition .cm-live-table');await table.waitFor({state:'visible'});await table.hover();
    const openToolbar=async()=>{
      const button=app.locator('#editorFormatBar [data-format="table"]');
      if(await button.isVisible())await button.click();
      else {await app.locator('#moreFormatButton').click();await app.locator('#overflowFormatOptions [data-format-command="table"]').click();}
    };
    const openTable=async()=>{
      if(process.env.AUDIT_TOOLBAR){await table.locator('td .cm-content').first().click();await openToolbar();}
      else {await table.hover();await table.getByRole('button',{name:'编辑表格',exact:true}).click();}
    };
    await openTable();
    const dialog=app.locator('#tableDialog');await dialog.waitFor({state:'visible'});await shot(kind+'-01-open');
    const first=await dialog.locator('[data-table-cell-row="0"][data-table-cell-column="0"]').inputValue();
    if(process.env.AUDIT_BASELINE){console.log(kind,JSON.stringify({title:await app.locator('#tableDialogTitle').textContent(),first}));await app.locator('#cancelTable').click();continue;}
    assert.equal(first,'Head','Must edit this table instead of inserting a blank table');
    assert.equal(await dialog.locator('[data-table-cell-row="1"][data-table-cell-column="1"]').inputValue(),'$x^2$');
    await app.locator('#cancelTable').click();assert.equal(await read(),source);
    await openTable();
    await dialog.getByRole('button',{name:'添加行',exact:true}).click();
    await dialog.locator('[data-table-cell-row="2"][data-table-cell-column="0"]').fill('Added');
    await dialog.locator('#confirmTable').click();await dialog.waitFor({state:'hidden'});
    const saved=await read(),note=prepareFootnotes(saved).notes[0],tables=findMarkdownTables(note.text);
    assert.equal(tables.length,1);assert.equal(tables[0].model.cells[1][0],'Cell');assert.equal(tables[0].model.cells[1][1],'$x^2$');assert.equal(tables[0].model.cells[2][0],'Added');
    assert.ok(saved.startsWith('Before[^n]\n\n[^n]: Intro\n'));assert.ok(saved.endsWith('    Tail\n\nAfter'));assert.equal(saved.split('quillite-table-widths').length,2);
    await app.locator('#editorPreviewContent .footnotes td').getByText('Added',{exact:true}).waitFor({state:'visible'});await table.locator('td').getByText('Added',{exact:true}).waitFor({state:'visible'});
    await shot(kind+'-02-saved');
    // Reopening must retain metadata and must not duplicate it on another save.
    await openTable();
    assert.equal(await dialog.locator('[data-table-cell-row="2"][data-table-cell-column="0"]').inputValue(),'Added');
    await dialog.locator('#confirmTable').click();await dialog.waitFor({state:'hidden'});assert.equal(await read(),saved);
    await page.keyboard.press('Control+z');assert.equal(await read(),source);
    await table.hover();await table.locator(':scope > .cm-live-block-actions').getByRole('button',{name:'查看源码',exact:true}).click();
    await app.getByRole('button',{name:'返回渲染',exact:true}).click();assert.equal(await read(),source);await shot(kind+'-03-restored');
    if(process.env.AUDIT_TOOLBAR) {
      await app.getByRole('button',{name:'源码',exact:true}).click();await content.locator('.cm-line').filter({hasText:'| Cell |'}).click();await openToolbar();
      await dialog.waitFor({state:'visible'});assert.equal(await dialog.locator('[data-table-cell-row="0"][data-table-cell-column="0"]').inputValue(),'Head');
      await dialog.locator('[data-table-cell-row="0"][data-table-cell-column="0"]').fill('Renamed');await dialog.locator('#confirmTable').click();await dialog.waitFor({state:'hidden'});
      assert.equal(findMarkdownTables(prepareFootnotes(await read()).notes[0].text)[0].model.cells[0][0],'Renamed');
      await page.keyboard.press('Control+z');assert.equal(await read(),source);
      await app.getByRole('button',{name:'即时渲染',exact:true}).click();
      console.log(kind+': toolbar source-mode edit and exact undo passed');
    }
    console.log(kind+': open/cancel, add row, render, reopen metadata, exact undo and source return passed');
  }
  assert.deepEqual(errors,[]);
}catch(error){if(page&&process.env.AUDIT_OUTPUT)await page.screenshot({path:`${process.env.AUDIT_OUTPUT}/failure.png`});throw error;}
finally{await browser?.close();await server.close();}
