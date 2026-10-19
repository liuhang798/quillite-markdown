// User-authorized isolated synthetic documents; real pointer/keyboard input.
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import {createServer} from 'vite';
const{chromium}=createRequire(import.meta.url)(process.env.PLAYWRIGHT_MODULE||'playwright');
const server=await createServer({root:fileURLToPath(new URL('..',import.meta.url)),server:{host:'127.0.0.1',port:0,watch:null,hmr:false},logLevel:'error'});
let browser,page;
try{
 await server.listen();browser=await chromium.launch({headless:true,executablePath:process.env.BROWSER_EXECUTABLE||undefined});
 page=await browser.newPage({viewport:{width:1500,height:1200}});page.setDefaultTimeout(10000);const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto(server.resolvedUrls.local[0]+'tests/fixtures/app-drag-audit.html');const app=page.frameLocator('iframe');await app.getByRole('button',{name:'新建文档',exact:true}).click();
 const editor=app.locator('#markdownEditor > .cm-editor'),content=editor.locator('> .cm-scroller > .cm-content');
 const read=()=>editor.evaluate(async el=>{const{EditorView}=await import('/node_modules/@codemirror/view/dist/index.js');const{crossSelectionField}=await import('/src/editable-cross-selection.js');const s=EditorView.findFromDOM(el).state;return{source:s.doc.toString(),anchor:s.selection.main.anchor,head:s.selection.main.head,cross:s.field(crossSelectionField,false),focused:el.contains(document.activeElement)};});
 const shot=async name=>{if(process.env.AUDIT_OUTPUT){await page.waitForTimeout(150);await page.screenshot({path:`${process.env.AUDIT_OUTPUT}/${name}.png`});}};
 const point=(locator,offset)=>locator.evaluate((el,i)=>{const walker=document.createTreeWalker(el,NodeFilter.SHOW_TEXT);let node;while(node=walker.nextNode()){if(i<=node.length){const r=document.createRange();r.setStart(node,i);r.collapse(true);const b=r.getBoundingClientRect();return{x:b.x,y:b.y+b.height/2};}i-=node.length;}throw new Error('Missing visible offset');},offset);
 const details=body=>'<details open>\n<summary>Section</summary>\n\n'+body+'\n\nTAIL\n\n</details>';
 const code='```text\nALPHA\nBRAVO\n```';
 const footnote=body=>'Before[^n]\n\n[^n]: Intro\n    \n    '+body.replaceAll('\n','\n    ');
 const cases=[['footnote-details-code',footnote(details(code)),'.cm-live-code'],['footnote-details-table',footnote(details('| Head | Other |\n| --- | --- |\n| BRAVO | CHARLIE |')),'td'],['details-list-code',details('- Item\n\n'+code.split('\n').map(l=>'  '+l).join('\n')),'.cm-live-code'],['footnote-details-quote-code',footnote(details(code.split('\n').map(l=>'> '+l).join('\n'))),'.cm-live-code']];
 cases.push(['footnote-double-details-code',footnote(details(details(code))),'.cm-live-code'],['footnote-double-details-table',footnote(details(details('| Head | Other |\n| --- | --- |\n| BRAVO | CHARLIE |'))),'td']);
 for(const[kind,body,selector]of cases)for(const reverse of [false,true])for(const action of ['type','delete']){
  const name=`${kind}-${reverse?'reverse':'forward'}-${action}`,source=body+'\n\nAFTER\n\nFINISH';
  await app.getByRole('button',{name:'源码',exact:true}).click();await content.focus();await page.keyboard.press('Control+a');await page.keyboard.insertText(source);
  for(let i=0;i<100&&(await read()).source!==source;i++)await page.waitForTimeout(20);assert.equal((await read()).source,source);
  await page.keyboard.press('Control+Home');await app.getByRole('button',{name:'即时渲染',exact:true}).click();
  const inner=editor.locator(selector+' .cm-line').filter({hasText:'BRAVO'}),outer=content.locator('> .cm-line').filter({hasText:'AFTER'});
  await inner.waitFor({state:'visible'});await outer.waitFor({state:'visible'});
  const a=await point(inner,2),b=await point(outer,3),start=reverse?b:a,end=reverse?a:b;
  assert.ok(a.y>160&&b.y<1150,'Both endpoints are visible without auto-scroll');
  await page.mouse.move(start.x,start.y);await page.mouse.down();await page.mouse.move(end.x,end.y,{steps:30});await page.mouse.up();
  await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
  const selection=await read();console.log(JSON.stringify({name,selection}));await shot(name+'-selected');
  assert.equal(selection.anchor,reverse?source.indexOf('AFTER')+3:source.indexOf('BRAVO')+2);
  assert.equal(selection.head,reverse?source.indexOf('BRAVO')+2:source.indexOf('AFTER')+3);assert.equal(selection.cross,true);
  if(action==='type')await page.keyboard.insertText('X');else await page.keyboard.press('Backspace');
  const result=(await read()).source;console.log(JSON.stringify({name,result}));await app.locator('#editorPreviewContent').getByText('ER',{exact:true}).waitFor({state:'visible'});await shot(name+'-changed');
  assert.ok(result.includes(action==='type'?'BRX':'BR'),'Unselected prefix survives');
  assert.ok(result.endsWith('ER\n\nFINISH'),'Unselected suffix survives');
  assert.ok(!result.includes('AVO')&&!result.includes('TAIL')&&!result.includes('CHARLIE'),'Selected text is removed');
  assert.equal((result.match(/<details open>/g)||[]).length,(source.match(/<details open>/g)||[]).length);assert.equal((result.match(/<\/details>/g)||[]).length,(source.match(/<\/details>/g)||[]).length);
  if(selector==='td'){assert.ok(result.includes('| --- | --- |'));await editor.locator('td .cm-line').filter({hasText:action==='type'?'BRX':'BR'}).waitFor({state:'visible'});}
  else {assert.equal((result.match(/```/g)||[]).length,2);await editor.locator('.cm-live-code .cm-line').filter({hasText:action==='type'?'BRX':'BR'}).waitFor({state:'visible'});}
  await page.keyboard.press('Control+z');console.log(JSON.stringify({name,stage:'undone',state:await read()}));assert.equal((await read()).source,source,'Single undo restores exact document');assert.equal((await read()).focused,true,'Undo keeps editor focus');
  await page.keyboard.press('Control+Shift+KeyZ');assert.equal((await read()).source,result,'Single redo restores exact change');
  await page.keyboard.press('Control+z');assert.equal((await read()).source,source);await app.locator('#editorPreviewContent').getByText('AFTER',{exact:true}).waitFor({state:'visible'});await shot(name+'-restored');
 }
 assert.deepEqual(errors,[]);console.log(`PASS: ${cases.length*4} deep forward/reverse drag, replacement/deletion and undo/redo cases`);
}catch(error){if(page&&process.env.AUDIT_OUTPUT)await page.screenshot({path:`${process.env.AUDIT_OUTPUT}/failure.png`});throw error;}
finally{await browser?.close();await server.close();}
