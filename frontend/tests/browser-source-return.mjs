// Synthetic isolated documents only. Source edits and return use real UI input.
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import {createServer} from 'vite';
const {chromium}=createRequire(import.meta.url)(process.env.PLAYWRIGHT_MODULE||'playwright');
const server=await createServer({root:fileURLToPath(new URL('..',import.meta.url)),server:{host:'127.0.0.1',port:0,watch:null,hmr:false},logLevel:'error'});
let browser,page;
try {
 await server.listen();browser=await chromium.launch({headless:true,executablePath:process.env.BROWSER_EXECUTABLE||undefined});
 page=await browser.newPage({viewport:{width:Number(process.env.AUDIT_WIDTH)||1500,height:1000}});page.setDefaultTimeout(10000);const errors=[];page.on('pageerror',error=>errors.push(error.message));
 await page.goto(server.resolvedUrls.local[0]+'tests/fixtures/app-drag-audit.html');const app=page.frameLocator('iframe');await app.getByRole('button',{name:'新建文档',exact:true}).click();
 if(process.env.AUDIT_THEME==='dark')await app.locator('#colorModeButton').click();
 const editor=app.locator('#markdownEditor > .cm-editor'),content=editor.locator('> .cm-scroller > .cm-content');
 const read=()=>editor.evaluate(async el=>{const {EditorView}=await import('/node_modules/@codemirror/view/dist/index.js');const state=EditorView.findFromDOM(el).state;return{doc:state.doc.toString(),anchor:state.selection.main.anchor,head:state.selection.main.head};});
 const caretInfo=()=>editor.evaluate(async el=>{const {EditorView}=await import('/node_modules/@codemirror/view/dist/index.js');const view=EditorView.findFromDOM(document.activeElement),root=EditorView.findFromDOM(el),rect=view?.coordsAtPos(view.state.selection.main.head),port=root.scrollDOM.getBoundingClientRect();return {visible:!!rect&&rect.top>=port.top&&rect.bottom<=port.bottom,rect:rect&&{top:rect.top,bottom:rect.bottom},viewport:{top:port.top,bottom:port.bottom}};});
 const shot=async name=>{if(process.env.AUDIT_OUTPUT){await page.waitForTimeout(180);await page.screenshot({path:`${process.env.AUDIT_OUTPUT}/${name}.png`});}};
 const lines=Array.from({length:120},(_,i)=>'LINE '+i).join('\n')+'\nLAST';
 const code='```text\n'+lines+'\n```';
 const details=body=>'<details open>\n<summary>Title</summary>\n\n'+body+'\n\n</details>';
 const note=body=>'Ref[^n]\n\n[^n]: '+body.replaceAll('\n','\n    ');
 const cases=[['short-code','```text\n流程第一步\n\nLAST\n```','.cm-live-code'],['code',code,'.cm-live-code'],['table','| Head |\n| --- |\n'+Array.from({length:50},(_,i)=>'| Row '+i+' |').join('\n')+'\n| LAST |','.cm-live-table'],['details',details(lines),'.cm-live-details'],['nested-code',details(code),'.cm-live-code'],['footnote-code',note(details(code)),'.cm-live-code']];
 for(const[name,body,selector]of cases){
  const source='BEFORE\n\n'+Array.from({length:25},(_,i)=>'Before paragraph '+i).join('\n\n')+'\n\n'+body+'\n\nOUTSIDE\n\n'+Array.from({length:30},(_,i)=>'After paragraph '+i).join('\n\n');
  await app.getByRole('button',{name:'源码',exact:true}).click();await content.focus();await page.keyboard.press('Control+a');await page.keyboard.insertText(source);assert.equal((await read()).doc,source);await page.keyboard.press('Control+Home');for(let row=0;row<52;row++)await page.keyboard.press('ArrowDown');await app.getByRole('button',{name:'即时渲染',exact:true}).click();
  const block=editor.locator(selector).last();await block.waitFor({state:'visible'});
  const inner=name==='table'?block.locator('td .cm-content').last():name==='details'?block.locator('.cm-live-details-body > .cm-editor > .cm-scroller > .cm-content'):block.locator('.cm-content');
  await inner.click({position:{x:10,y:10}});await page.keyboard.press('Control+End');
  const blockBackground=await block.evaluate(el=>getComputedStyle(el).backgroundColor);
  const viewportBefore=await editor.locator('> .cm-scroller').boundingBox();
  assert.equal((await read()).head,source.indexOf('LAST')+4,name+' initial caret');
  await block.hover({position:{x:10,y:10}});
  await block.locator('> .cm-live-block-actions button').last().scrollIntoViewIfNeeded();
  await page.waitForTimeout(100);
  const sourceTopBefore=(await block.boundingBox()).y;
  await block.locator('> .cm-live-block-actions button').last().click();
  const back=editor.getByRole('button',{name:'返回渲染',exact:true});await back.waitFor({state:'visible'});
  const viewportAfter=await editor.locator('> .cm-scroller').boundingBox();
  assert.equal(viewportAfter.y,viewportBefore.y,name+' opening source must not shift the editor viewport');
  assert.equal(viewportAfter.height,viewportBefore.height,name+' no header takes editor space');
  assert.equal(await editor.locator('.cm-panels .cm-live-source-panel').count(),0,name+' source action is not a panel');
  const surfaces=editor.locator('.cm-line.cm-live-source-line');
  assert.ok(await surfaces.count()>0,name+' source surface exists');
  const colors=await surfaces.evaluateAll(lines=>lines.map(line=>getComputedStyle(line).backgroundColor));
  assert.ok(colors.every(color=>color===colors[0]&&color!=='rgba(0, 0, 0, 0)'),name+' continuous nontransparent source surface');
  if(name.includes('code'))assert.equal(colors[0],blockBackground,name+' preserves rendered code background');
  if(name==='short-code'){
   const overlay=editor.locator('.cm-live-source-panel');
   await page.mouse.move(5,5);await page.waitForTimeout(50);
   assert.equal(await overlay.evaluate(el=>getComputedStyle(el).opacity),'0','action hides away from source');
   await surfaces.first().hover();await page.waitForTimeout(50);
   assert.equal(await overlay.evaluate(el=>getComputedStyle(el).opacity),'1','action appears over source');
  }
  const visible=()=>back.evaluate(button=>{const b=button.getBoundingClientRect(),editor=button.closest('.cm-editor').getBoundingClientRect();return b.width>0&&b.height>0&&b.top>=Math.max(0,editor.top)&&b.bottom<=Math.min(innerHeight,editor.bottom)&&b.left>=0&&b.right<=innerWidth&&button.contains(document.elementFromPoint(b.x+b.width/2,b.y+b.height/2));});
  assert.equal(await visible(),true,name+' return must be clickable without scrolling');await page.waitForTimeout(200);
  const sourceTopAfter=(await editor.locator('.cm-live-source-first').last().boundingBox()).y;
  assert.ok(Math.abs(sourceTopAfter-sourceTopBefore)<3,name+' block stays in place: '+JSON.stringify({sourceTopBefore,sourceTopAfter}));
  await shot(name+'-01-source');
  // Keep the existing source caret while the panel remains visible. Clicking
  // the panel must not turn this presentation change into an undoable edit.
  assert.equal((await read()).head,source.indexOf('LAST')+4);
  await page.keyboard.insertText('X');const edited=source.replace('LAST','LASTX');assert.equal((await read()).doc,edited);
  await page.waitForTimeout(100);assert.equal((await caretInfo()).visible,true,name+' typing resumes caret navigation');
  const viewport=await editor.boundingBox();await page.mouse.move(viewport.x+viewport.width/2,viewport.y+viewport.height/2);await page.mouse.wheel(0,700);await page.waitForTimeout(100);
  await surfaces.last().hover();await page.waitForTimeout(100);assert.equal(await visible(),true,name+' hovered source action after scroll');
  if(name==='nested-code'){await back.focus();await page.keyboard.press('Enter');}else await back.click();
  await block.waitFor({state:'visible'});assert.equal((await read()).doc,edited);assert.equal((await read()).head,edited.indexOf('LASTX')+5,name+' preserved return caret');
  await page.waitForTimeout(200);
  const caret=await caretInfo();
  assert.equal(caret.visible,true,name+' returned caret must stay in viewport: '+JSON.stringify(caret));await shot(name+'-02-returned');
  await page.keyboard.press('Control+z');assert.equal((await read()).doc,source);await page.keyboard.press('Control+Shift+KeyZ');assert.equal((await read()).doc,edited);await page.keyboard.press('Control+z');assert.equal((await read()).doc,source);
  console.log(name+': visible return, source edit, preserved caret, undo/redo passed');
 }
 // Switching documents while a source panel is open must discard its target.
 const block=editor.locator('.cm-live-code').last();await block.hover({position:{x:20,y:10}});await block.locator('> .cm-live-block-actions button').click();await editor.getByRole('button',{name:'返回渲染',exact:true}).waitFor({state:'visible'});
 const current=(await read()).doc;await app.getByRole('button',{name:'源码',exact:true}).click();assert.equal(await editor.locator('.cm-live-source-panel:visible').count(),0);assert.equal((await read()).doc,current);await app.getByRole('button',{name:'即时渲染',exact:true}).click();assert.equal(await editor.locator('.cm-live-source-panel:visible').count(),0);await block.hover({position:{x:20,y:10}});await block.locator('> .cm-live-block-actions button').click();await editor.getByRole('button',{name:'返回渲染',exact:true}).waitFor({state:'visible'});
 page.once('dialog',dialog=>dialog.accept());await app.getByRole('button',{name:'新建文档',exact:true}).click();await page.waitForTimeout(150);assert.equal((await read()).doc,'');assert.equal(await editor.locator('.cm-live-source-panel:visible').count(),0);await content.focus();await page.keyboard.press('Control+z');assert.equal((await read()).doc,'');console.log('mode/document switch: stale panel cleared, undo isolated');
 assert.deepEqual(errors,[]);
}catch(error){if(page&&process.env.AUDIT_OUTPUT)await page.screenshot({path:`${process.env.AUDIT_OUTPUT}/failure.png`});throw error;}
finally{await browser?.close();await server.close();}
