// Authorized isolated synthetic-page testing; no real documents/profile.
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import {createServer} from 'vite';
import {prepareFootnotes} from '../src/markdown-formats.js';
import {findEditableTableAt} from '../src/table-editing.js';
const {chromium}=createRequire(import.meta.url)(process.env.PLAYWRIGHT_MODULE||'playwright');
const server=await createServer({root:fileURLToPath(new URL('..',import.meta.url)),server:{host:'127.0.0.1',port:0,watch:null,hmr:false},logLevel:'error'});
let browser,page;
try{
  await server.listen();browser=await chromium.launch({headless:true,executablePath:process.env.BROWSER_EXECUTABLE||undefined});
  page=await browser.newPage({viewport:{width:1700,height:1100}});page.setDefaultTimeout(10000);const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto(server.resolvedUrls.local[0]+'tests/fixtures/app-drag-audit.html');const app=page.frameLocator('iframe');await app.getByRole('button',{name:'新建文档',exact:true}).click();
  const editor=app.locator('#markdownEditor > .cm-editor'),content=editor.locator('> .cm-scroller > .cm-content'),reading=app.locator('#editorPreviewContent');
  const read=()=>editor.evaluate(async el=>{const{EditorView}=await import('/node_modules/@codemirror/view/dist/index.js');return EditorView.findFromDOM(el).state.doc.toString();});
  const shot=async name=>{if(process.env.AUDIT_OUTPUT){await page.waitForTimeout(250);await page.screenshot({path:`${process.env.AUDIT_OUTPUT}/${name}.png`});}};
  const cases=[['plain','Insert\n\nTail','table'],['quote','> Insert\n>\n> Tail','blockquote table'],['list','- Insert\n\n  Tail','li table'],['quote-list','> - Insert\n>\n>   Tail','blockquote li table'],['details','<details open>\n<summary>More</summary>\n\nInsert\n\nTail\n\n</details>','details table']];
  for(const footnote of [false,true])for(const[kind,body,selector]of cases){
    const name=(footnote?'footnote-':'root-')+kind;
    const source=footnote?'Before[^n]\n\n[^n]: Intro\n    \n    '+body.replaceAll('\n','\n    ')+'\n\nAfter':'Before\n\n'+body+'\n\nAfter';
    await app.getByRole('button',{name:'源码',exact:true}).click();await content.focus();await page.keyboard.press('Control+a');await page.keyboard.insertText(source);
    for(let i=0;i<100&&await read()!==source;i++)await page.waitForTimeout(20);assert.equal(await read(),source);
    await page.keyboard.press('Control+Home');await app.getByRole('button',{name:'即时渲染',exact:true}).click();
    await editor.locator('.cm-line').filter({hasText:/Insert$/}).click();await page.keyboard.press('End');
    const position=process.env.AUDIT_POSITION||'end';
    if(['start','middle','selected'].includes(position)){
      const point=await editor.locator('.cm-line').filter({hasText:/Insert$/}).evaluate((el,index)=>{
        const walker=document.createTreeWalker(el,NodeFilter.SHOW_TEXT);let node;
        while((node=walker.nextNode())){const at=node.textContent.indexOf('Insert');if(at>=0){const r=document.createRange();r.setStart(node,at+index);r.collapse(true);const b=r.getBoundingClientRect();return{x:b.x,y:b.y+b.height/2};}}
        throw Error('Missing insertion text');
      },position==='middle'?3:0);await page.mouse.click(point.x+.5,point.y);
    }
    if(position==='blank'){await page.keyboard.press('ArrowDown');await page.keyboard.press('End');}
    if(position==='selected')await page.keyboard.press('Shift+End');
    const selected=await editor.evaluate(async el=>{const{EditorView}=await import('/node_modules/@codemirror/view/dist/index.js');const r=EditorView.findFromDOM(el).state.selection.main;return{from:r.from,to:r.to};});
    if(position==='selected')assert.equal(source.slice(selected.from,selected.to),'Insert');
    if(position==='start')assert.equal(selected.from,source.indexOf('Insert'));
    if(position==='middle')assert.equal(selected.from,source.indexOf('Insert')+3);
    const button=app.locator('#editorFormatBar [data-format="table"]');
    if(await button.isVisible())await button.click();else{await app.locator('#moreFormatButton').click();await app.locator('#overflowFormatOptions [data-format-command="table"]').click();}
    const dialog=app.locator('#tableDialog');await dialog.waitFor({state:'visible'});
    await dialog.locator('[data-table-cell-row="0"][data-table-cell-column="0"]').fill('Head');
    await dialog.locator('[data-table-cell-row="1"][data-table-cell-column="0"]').fill('Cell');
    await dialog.locator('#confirmTable').click();await dialog.waitFor({state:'hidden'});
    await reading.locator('table').waitFor({state:'visible'});await shot(name+'-01-inserted');const saved=await read();
    const actualSelector=(footnote?'.footnotes ':'')+selector;
    console.log(name,JSON.stringify({ownedTables:await reading.locator(actualSelector).count(),liveTables:await editor.locator(footnote?'.cm-live-footnote-definition .cm-live-table':'.cm-live-table').count(),saved}));
    if(process.env.AUDIT_BASELINE)continue;
    assert.equal(await reading.locator(actualSelector).count(),1,name+' table must stay inside its container');
    assert.equal(await editor.locator(footnote?'.cm-live-footnote-definition .cm-live-table':'.cm-live-table').count(),1);
    assert.ok(saved.startsWith(source.slice(0,selected.from)));assert.ok(saved.endsWith(source.slice(selected.to)));
    assert.ok(findEditableTableAt(saved,saved.indexOf('| Head'))?.hasWidthMetadata,name+' retains width metadata');
    if(footnote){const note=prepareFootnotes(saved).notes[0];assert.ok(note.text.includes('Head'));assert.ok(note.text.includes('Tail'));}
    await page.keyboard.press('Control+z');assert.equal(await read(),source);await shot(name+'-02-undone');
  }
  assert.deepEqual(errors,[]);
}catch(e){if(page&&process.env.AUDIT_OUTPUT)await page.screenshot({path:`${process.env.AUDIT_OUTPUT}/failure.png`});throw e;}
finally{await browser?.close();await server.close();}
