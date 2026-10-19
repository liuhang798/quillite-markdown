// Authorized isolated synthetic app only; never connect to a real profile.
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import {createServer} from 'vite';
const {chromium}=createRequire(import.meta.url)(process.env.PLAYWRIGHT_MODULE || 'playwright');
const server=await createServer({root:fileURLToPath(new URL('..',import.meta.url)),server:{host:'127.0.0.1',port:0,watch:null,hmr:false},logLevel:'error'});
let browser,page;
try {
  await server.listen();browser=await chromium.launch({headless:true,executablePath:process.env.BROWSER_EXECUTABLE || undefined});
  page=await browser.newPage({viewport:{width:1100,height:1000}});page.setDefaultTimeout(8000);
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto(server.resolvedUrls.local[0]+'tests/fixtures/app-drag-audit.html');
  const app=page.frameLocator('iframe');await app.getByRole('button',{name:'新建文档',exact:true}).click();
  const ref=server.resolvedUrls.local[0]+'tests/fixtures/sample-image.svg';
  const read=()=>app.locator('#markdownEditor > .cm-editor').evaluate(async el=>{const {EditorView}=await import('/node_modules/@codemirror/view/dist/index.js');return EditorView.findFromDOM(el).state.doc.toString();});
  const shot=async name=>{if(process.env.AUDIT_OUTPUT)await page.screenshot({path:`${process.env.AUDIT_OUTPUT}/${name}.png`});};
  const cases=process.env.AUDIT_BASELINE?[[1100,6,'plain']]:[... [1700,1100,820].flatMap(w=>[1,2,6].map(n=>[w,n,'plain'])),...[ 'quote','list','details','linked','mixed','widths'].map(kind=>[1100,2,kind])];
  for(const [width,count,kind] of cases) {
    await page.setViewportSize({width,height:1000});
    const row=Array.from({length:count},(_,i)=>`![图片${i+1}](${ref})`).join(' ');
    const cell=kind==='linked'?`[${row.split(' ')[0]}](https://example.com/)`:kind==='mixed'?`说明 ${row} 末尾`:row;
    let table=`| 图片 | 对照说明 |\n| --- | --- |\n| ${cell} | 保留文字 |`;
    if(kind==='quote')table=table.split('\n').map(l=>'> '+l).join('\n');
    if(kind==='list')table='- 条目\n\n'+table.split('\n').map(l=>'  '+l).join('\n');
    if(kind==='details')table='<details open>\n<summary>标题</summary>\n\n'+table+'\n\n</details>';
    const source='前文\n\n'+table+'\n\n后文';
    await app.getByRole('button',{name:'源码',exact:true}).click();await app.getByRole('textbox').fill(source);await page.keyboard.press('Control+Home');await app.getByRole('button',{name:'即时渲染',exact:true}).click();
    const reading=app.getByRole('article'),outer=reading.locator('table:not(.quillite-image-row)').first();
    await outer.locator('img').first().waitFor({state:'visible'});
    await outer.locator('img').evaluateAll(imgs=>Promise.all(imgs.map(img=>img.decode().catch(()=>{}))));
    const geometry=await outer.evaluate(el=>{const cells=[...el.rows[1].cells],r=el.getBoundingClientRect();return{table:r.width,columns:cells.map(c=>c.getBoundingClientRect().width),images:[...el.querySelectorAll('img')].map(img=>({width:img.getBoundingClientRect().width,height:img.getBoundingClientRect().height})),layout:getComputedStyle(el).tableLayout};});
    const name=`${width}-${count}-${kind}`;console.log(JSON.stringify({name,...geometry}));await shot(`${name}-01-reading`);
    if(process.env.AUDIT_BASELINE)continue;
    assert.ok(geometry.columns[1]>=Math.min(100,geometry.table*.4),`${name}: image squeezes neighboring text`);
    assert.ok(Math.abs(geometry.columns[0]-geometry.columns[1])<3,`${name}: default columns differ from editor`);
    assert.ok(geometry.images.every(i=>i.width>10&&i.height>5),`${name}: images collapsed`);
    assert.equal(await outer.evaluate(el=>getComputedStyle(el.rows[1].cells[1]).verticalAlign),'top');
    assert.equal(await read(),source);
    const target=app.getByRole('textbox',{name:'表格单元格 2, 2',exact:true});
    await target.click();await page.keyboard.press('End');await page.keyboard.insertText('编辑');
    await outer.getByText('保留文字编辑',{exact:true}).waitFor({state:'visible'});
    assert.equal(await read(),source.replace('保留文字','保留文字编辑'));
    await page.keyboard.press('Control+z');assert.equal(await read(),source);
    if(kind==='widths') {
      const editTable=app.locator('.cm-live-table');await editTable.hover();await editTable.getByRole('button',{name:'编辑表格',exact:true}).click();
      const dialog=app.getByRole('dialog',{name:'编辑表格',exact:true}),resizer=dialog.locator('[data-resize-table-column="0"]');
      await resizer.scrollIntoViewIfNeeded();const r=await resizer.boundingBox();await page.mouse.move(r.x+r.width/2,r.y+r.height/2);await page.mouse.down();await page.mouse.move(r.x+r.width/2+100,r.y+r.height/2,{steps:15});await page.mouse.up();
      await dialog.locator('#confirmTable').click();await dialog.waitFor({state:'hidden'});
      await outer.locator('col').first().waitFor({state:'attached'});
      const widths=await outer.locator('col').evaluateAll(cols=>cols.map(c=>parseFloat(c.style.width)));
      assert.ok(widths[0]>widths[1]);
      const actual=await outer.evaluate(el=>[...el.rows[1].cells].map(c=>c.getBoundingClientRect().width));
      assert.ok(Math.abs(actual[0]-widths[0])<3);assert.ok(Math.abs(actual[1]-widths[1])<3);
      const scroll=reading.locator('.markdown-table-scroll'),box=await scroll.boundingBox();
      await page.mouse.move(box.x+box.width/2,box.y+box.height/2);await page.mouse.wheel(700,0);
      for(let n=0;n<20&&(await scroll.evaluate(el=>el.scrollLeft))===0;n++)await page.waitForTimeout(30);
      assert.ok(await scroll.evaluate(el=>el.scrollLeft>0));
      const text=await outer.getByText('保留文字',{exact:true}).boundingBox();assert.ok(text.x>=box.x&&text.x+text.width<=box.x+box.width+2);
      await shot(`${name}-02-explicit-widths-scrolled`);await page.keyboard.press('Control+z');assert.equal(await read(),source);
    }
    await app.getByRole('button',{name:'源码',exact:true}).click();await app.getByRole('button',{name:'即时渲染',exact:true}).click();assert.equal(await read(),source);
    if(count===6&&kind==='plain') {
      await page.keyboard.press('Control+e');
      const full=app.getByRole('article').locator('table:not(.quillite-image-row)').first();await full.getByText('保留文字',{exact:true}).waitFor({state:'visible'});
      const widths=await full.evaluate(el=>[...el.rows[1].cells].map(c=>c.getBoundingClientRect().width));
      assert.ok(Math.abs(widths[0]-widths[1])<3);await shot(`${name}-03-full-reading`);
      await page.keyboard.press('Control+e');await app.getByRole('button',{name:'源码',exact:true}).waitFor({state:'visible'});assert.equal(await read(),source);
    }
    console.log(name+': readable columns, image bounds, direct edit, exact undo and mode round trip passed');
  }
  if(!process.env.AUDIT_BASELINE) {
    const plain='| 短 | 长文字说明列 |\n| --- | --- |\n| A | a fairly long text description |';
    await app.getByRole('button',{name:'源码',exact:true}).click();await app.getByRole('textbox').fill(plain);await app.getByRole('button',{name:'即时渲染',exact:true}).click();
    const plainTable=app.getByRole('article').locator('table');await plainTable.getByText('A',{exact:true}).waitFor({state:'visible'});
    assert.equal(await plainTable.evaluate(el=>getComputedStyle(el).tableLayout),'auto');assert.equal(await read(),plain);
    console.log('text-only table: existing automatic layout unchanged');
    await page.setViewportSize({width:820,height:1000});
    const missing='| 图片 | 对照 |\n| --- | --- |\n| ![缺失图片](assets/audit-missing.png) | 保留 |';
    await app.getByRole('button',{name:'源码',exact:true}).click();await app.getByRole('textbox').fill(missing);await app.getByRole('button',{name:'即时渲染',exact:true}).click();
    const errorImage=app.getByRole('article').locator('img.local-image-error');await errorImage.waitFor({state:'visible'});
    assert.ok(await errorImage.evaluate(img=>img.getBoundingClientRect().width<=img.closest('td').getBoundingClientRect().width));
    assert.equal(await read(),missing);await shot('820-missing-04-fallback');
    console.log('missing local image: fallback stays inside the cell without changing source');
  }
  assert.deepEqual(errors,[]);
}catch(error){if(page&&process.env.AUDIT_OUTPUT)await page.screenshot({path:`${process.env.AUDIT_OUTPUT}/failure.png`});throw error;}
finally{await browser?.close();await server.close();}
