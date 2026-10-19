// Only synthetic documents and this isolated page's own clipboard fixture.
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import {createServer} from 'vite';
import {findEditableTableAt} from '../src/table-editing.js';
const {chromium}=createRequire(import.meta.url)(process.env.PLAYWRIGHT_MODULE||'playwright');
const server=await createServer({root:fileURLToPath(new URL('..',import.meta.url)),server:{host:'127.0.0.1',port:0,watch:null,hmr:false},logLevel:'error'});
let browser,page;
try{
 await server.listen();browser=await chromium.launch({headless:true,executablePath:process.env.BROWSER_EXECUTABLE||undefined});page=await browser.newPage({viewport:{width:1500,height:1000}});page.setDefaultTimeout(8000);
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.route('**/*',r=>new URL(r.request().url()).hostname==='127.0.0.1'?r.continue():r.abort());
 await page.goto(server.resolvedUrls.local[0]+'tests/fixtures/table-paste-audit.html');const app=page.frameLocator('iframe');await app.locator('body').evaluate(()=>import('/src/main.js'));await app.locator('#newFileButton').click();
 const editor=app.locator('#markdownEditor > .cm-editor'),content=editor.locator('> .cm-scroller > .cm-content');
 const read=()=>editor.evaluate(async el=>{const{EditorView}=await import('/node_modules/@codemirror/view/dist/index.js');return EditorView.findFromDOM(el).state.doc.toString();});
 const trace=async stage=>{if(process.env.AUDIT_TRACE)console.log(stage,await editor.evaluate(async el=>{const{EditorView}=await import('/node_modules/@codemirror/view/dist/index.js');const root=EditorView.findFromDOM(el),active=EditorView.findFromDOM(el.ownerDocument.activeElement);return JSON.stringify({root:root.state.selection.toJSON(),active:active?.state.selection.toJSON(),text:active?.state.doc.toString(),label:el.ownerDocument.activeElement.getAttribute('aria-label')});}));};
 const shot=async name=>{if(process.env.AUDIT_OUTPUT){await page.waitForTimeout(200);await page.screenshot({path:`${process.env.AUDIT_OUTPUT}/${name}.png`});}};
 const table='| A | B | C |\n| --- | ---: | :---: |\n| one | two | three |\n| four | five | six |';
 for(const kind of process.env.AUDIT_CASE?[process.env.AUDIT_CASE]:['plain','quote','list','details','footnote'])for(const mode of ['tsv','expand','html','blank','drag','reverse','invalid','limit','merged','mixed','media']){
  const name=kind+'-'+mode;
  const block=kind==='quote'?table.replace(/^/gm,'> '):kind==='list'?'- Intro\n\n'+table.replace(/^/gm,'  '):kind==='details'?'<details open>\n<summary>More</summary>\n\n'+table+'\n\n</details>':kind==='footnote'?'Ref[^n]\n\n[^n]: Intro\n    \n'+table.replace(/^/gm,'    '):table;
  const original='Before\n\n'+block+'\n\nAfter';
  await app.getByRole('button',{name:'源码',exact:true}).click();await content.fill(original);await content.press('Control+Home');await app.getByRole('button',{name:'即时渲染',exact:true}).click();
  const richLabel={html:'隔离表格',merged:'合并表格',mixed:'混合表格',media:'图片表格'}[mode];
  const clip=page.getByLabel(richLabel||'隔离剪贴板',{exact:true});
  if(!richLabel)await clip.fill(mode==='expand'?'甲\t乙\t丙\n丁\t戊\t己\n庚\t辛\t壬':mode==='blank'?'\t\n丙\t丁':mode==='invalid'?'甲\t乙\n丙':mode==='limit'?Array(13).fill('甲').join('\t'):'甲\t乙\n丙\t丁');
  await clip.focus();await clip.press('Control+a');await clip.press('Control+c');
  const cell=editor.getByRole('textbox',{name:'表格单元格 2, 2',exact:true});await cell.click();
  if(['drag','reverse'].includes(mode)){
    const point=async(locator,end)=>locator.evaluate((el,end)=>{const node=el.firstChild,r=document.createRange();r.setStart(node,end?node.length:0);r.collapse(true);const b=r.getBoundingClientRect();return{x:b.x,y:b.y+b.height/2};},end);
    const first=await point(cell.locator('.cm-line'),false),last=await point(editor.getByRole('textbox',{name:'表格单元格 3, 3',exact:true}).locator('.cm-line'),true);
    const[a,b]=mode==='reverse'?[last,first]:[first,last];await page.mouse.move(a.x,a.y);await page.mouse.down();await page.mouse.move(b.x,b.y,{steps:20});await page.mouse.up();
  }
  await shot(name+'-01-start');await page.keyboard.press('Control+v');await shot(name+'-02-pasted');
  const actual=await read();
  if(['invalid','limit','merged','mixed','media'].includes(mode)){
   assert.equal(actual,original,name+' rejected paste must be atomic');assert.equal(await app.locator('#toast').isVisible(),true);
   const retry=page.getByLabel('隔离剪贴板',{exact:true});await retry.fill('甲\t乙\n丙\t丁');await retry.focus();await retry.press('Control+a');await retry.press('Control+c');
   await cell.click();await page.keyboard.press('Control+v');assert.notEqual(await read(),original,name+' valid retry changes cells');
   assert.equal(await app.locator('#toast').isVisible(),false,name+' valid retry removes stale paste rejection');await shot(name+'-03-retried');
   await page.keyboard.press('Control+z');assert.equal(await read(),original,name+' retry still has one undo');
   console.log('PASS',name);continue;
  }
  const model=findEditableTableAt(actual,actual.indexOf('| A')).model;
  const expected=mode==='expand'?[['A','B','C',''],['one','甲','乙','丙'],['four','丁','戊','己'],['','庚','辛','壬']]:[['A','B','C'],['one',mode==='blank'?'':mode==='html'?'**甲**':'甲',mode==='blank'?'':'乙'],['four','丙',mode==='html'?'*丁*':'丁']];
  assert.deepEqual(model.cells,expected,name+' matrix paste must fill cells');
  await trace(name+' paste');await page.keyboard.press('Control+z');await trace(name+' undo');assert.equal(await read(),original,name+' one undo');await page.keyboard.press('Control+Shift+KeyZ');await trace(name+' redo');assert.equal(await read(),actual,name+' redo');await page.keyboard.insertText('X');assert.ok((await read()).includes(mode==='expand'?'壬X':mode==='html'?'*丁*X':'丁X'),name+' caret at pasted last cell');console.log('PASS',name);
 }
 assert.deepEqual(errors,[]);
}catch(error){if(page&&process.env.AUDIT_OUTPUT)await page.screenshot({path:`${process.env.AUDIT_OUTPUT}/failure.png`});throw error;}
finally{await browser?.close();await server.close();}
