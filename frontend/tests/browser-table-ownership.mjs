// User-authorized isolated full-app test; never connect to a user's profile.
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
  await page.goto(server.resolvedUrls.local[0]+'tests/fixtures/app-drag-audit.html');
  const app=page.frameLocator('iframe');await app.getByRole('button',{name:'新建文档',exact:true}).click();
  const read=()=>app.locator('#markdownEditor > .cm-editor').evaluate(async el=>{const {EditorView}=await import('/node_modules/@codemirror/view/dist/index.js');return EditorView.findFromDOM(el).state.doc.toString();});
  const point=async(locator,index)=>{await locator.scrollIntoViewIfNeeded();return locator.evaluate((el,index)=>{const walker=document.createTreeWalker(el,NodeFilter.SHOW_TEXT);let n;while((n=walker.nextNode())){if(index<=n.length){const r=document.createRange();r.setStart(n,index);r.collapse(true);const b=r.getBoundingClientRect();return{x:b.x,y:b.y+b.height/2};}index-=n.length;}throw Error('Missing text');},index);};
  const click=async p=>page.mouse.click(p.x,p.y);
  const select=async(a,b)=>{await click(a);await page.keyboard.down('Shift');await click(b);await page.keyboard.up('Shift');};
  const shot=async name=>{if(process.env.AUDIT_OUTPUT)await page.screenshot({path:`${process.env.AUDIT_OUTPUT}/${name}.png`});};
  for(const [name,intro,prefix] of [['plain','',''],['quote','','> '],['list','- 条目\n\n','  '],['nested','> - 条目\n>\n','>   ']]) {
    const table=['<!-- quillite-table-widths: 310, 190 -->','| A | B |','| --- | --- |','| Cell | D |'].map(l=>prefix+l).join('\n');
    const other='<!-- quillite-table-widths: 210, 240 -->\n| E | F |\n| --- | --- |\n| G | H |';
    const source='前文\n\n'+intro+table+'\n\n后文\n\n目标段落\n\n'+other;
    for(const mode of ['partial','reverse','move','copy','delete']) {
      await app.getByRole('button',{name:'源码',exact:true}).click();await app.getByRole('textbox').fill(source);await page.keyboard.press('Control+Home');
      await app.getByRole('button',{name:'即时渲染',exact:true}).click();
      const editor=app.locator('#markdownEditor'),cell=editor.getByRole('textbox',{name:'表格单元格 2, 1',exact:true}).first();
      await cell.waitFor({state:'visible'});
      const tableWidget=editor.locator('.cm-live-table').first();await tableWidget.hover();
      await tableWidget.getByRole('button',{name:'查看源码',exact:true}).click();
      await app.getByRole('button',{name:'返回渲染',exact:true}).click();assert.equal(await read(),source);
      const start=await point(editor.getByText('前文',{exact:true}),0);
      const end=await point(mode==='partial'||mode==='reverse'?cell:editor.getByText('后文',{exact:true}),mode==='partial'||mode==='reverse'?1:0);
      await select(mode==='reverse'?end:start,mode==='reverse'?start:end);
      await shot(`${name}-${mode}-selected`);
      if(['move','copy'].includes(mode)) {
        const a=await point(cell,2),b=await point(editor.getByText('目标段落',{exact:true}),2);
        if(mode==='copy')await page.keyboard.down('Control');
        await page.mouse.move(a.x,a.y);await page.mouse.down();await page.mouse.move(a.x+8,a.y+6,{steps:3});await page.mouse.move(b.x,b.y,{steps:25});await page.mouse.move(b.x+1,b.y);await page.mouse.up();
        if(mode==='copy')await page.keyboard.up('Control');
      } else await page.keyboard.press('Backspace');
      const result=await read(),tables=findMarkdownTables(result);
      if(['move','copy'].includes(mode)) {
        const selected=source.slice(0,source.indexOf('后文'));
        const remaining=mode==='copy'?source:source.slice(source.indexOf('后文'));
        assert.equal(result,remaining.replace('目标段落','目标\n\n'+selected+'段落'),'The drag must actually move/copy the whole selection');
      }
      console.log(JSON.stringify({name,mode,widths:tables.map(t=>t.model.widths),metadata:tables.map(t=>t.hasWidthMetadata)}));
      assert.equal(tables.length,mode==='copy'?3:mode==='delete'?1:2);
      assert.ok(tables.every(t=>t.hasWidthMetadata),'A surviving table must retain its own metadata');
      assert.deepEqual(tables.at(-1).model.widths,[210,240],'Unrelated table widths must not change');
      if(mode!=='delete')assert.deepEqual(tables[0].model.widths,[310,190]);
      if(mode==='copy')assert.deepEqual(tables[1].model.widths,[310,190]);
      assert.equal((result.match(/quillite-table-widths/g)||[]).length,tables.length,'No orphan or duplicate metadata');
      const reading=app.getByRole('article');
      if(['partial','reverse'].includes(mode))await reading.getByText('ell',{exact:true}).waitFor({state:'visible'});
      else if(mode==='delete')await reading.getByText('Cell',{exact:true}).waitFor({state:'hidden'});
      else await reading.getByText('目标',{exact:true}).waitFor({state:'visible'});
      const widths=tables.flatMap(t=>t.model.widths.map(w=>w+'px'));
      assert.deepEqual(await reading.locator('col').evaluateAll(cols=>cols.map(c=>c.style.width)),widths);
      assert.deepEqual(await editor.locator('.cm-live-table col').evaluateAll(cols=>cols.map(c=>c.style.width)),widths);
      await shot(`${name}-${mode}-result`);
      await page.keyboard.press('Control+z');assert.equal(await read(),source,'Single undo must recover exact source');
    }
  }
  assert.deepEqual(errors,[]);
} catch(error){if(page)await shotFailure();throw error;}
finally {await browser?.close();await server.close();}
async function shotFailure(){if(process.env.AUDIT_OUTPUT)await page.screenshot({path:`${process.env.AUDIT_OUTPUT}/failure.png`});}
