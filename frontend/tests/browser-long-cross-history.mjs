// User-authorized isolated full-app pointer audit. No real documents/profile.
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import {createServer} from 'vite';
const {chromium}=createRequire(import.meta.url)(process.env.PLAYWRIGHT_MODULE||'playwright');
const server=await createServer({root:fileURLToPath(new URL('..',import.meta.url)),server:{host:'127.0.0.1',port:0,watch:null,hmr:false},logLevel:'error'});
let browser,page;
try {
 await server.listen();browser=await chromium.launch({headless:true,executablePath:process.env.BROWSER_EXECUTABLE||undefined});
 page=await browser.newPage({viewport:{width:1400,height:1000}});page.setDefaultTimeout(10000);
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto(server.resolvedUrls.local[0]+'tests/fixtures/multiline-edit-audit.html');const app=page.frameLocator('iframe');
 await app.locator('#newFileButton').click();if(process.env.AUDIT_LAYOUT!=='split')await app.locator('#hideLivePreviewButton').click();
 const root=app.locator('#markdownEditor > .cm-editor'),scroller=root.locator('> .cm-scroller'),content=scroller.locator('> .cm-content');
 const read=()=>root.evaluate(async el=>{const{EditorView}=await import('/node_modules/@codemirror/view/dist/index.js');const v=EditorView.findFromDOM(el),s=v.state.selection.main,caret=v.coordsAtPos(s.head),viewport=v.scrollDOM.getBoundingClientRect();return{source:v.state.doc.toString(),anchor:s.anchor,head:s.head,top:v.scrollDOM.scrollTop,focused:el.contains(document.activeElement),caret:caret?{top:caret.top,bottom:caret.bottom}:null,viewport:{top:viewport.top,bottom:viewport.bottom}};});
 const shot=async name=>{if(process.env.AUDIT_OUTPUT)await page.screenshot({path:`${process.env.AUDIT_OUTPUT}/${name}.png`});};
 const point=(locator,offset)=>locator.evaluate((el,i)=>{const w=document.createTreeWalker(el,NodeFilter.SHOW_TEXT);let n;while(n=w.nextNode()){if(i<=n.length){const r=document.createRange();r.setStart(n,i);r.collapse(true);const b=r.getBoundingClientRect();return{x:b.x,y:b.y+b.height/2,hit:el.contains(document.elementFromPoint(b.x,b.y+b.height/2))};}i-=n.length;}throw Error('Missing text');},offset);
 const visible=async locator=>{if(!await locator.count())return false;const b=await locator.boundingBox(),s=await scroller.boundingBox();return b&&b.y>s.y+25&&b.y+b.height<s.y+s.height-25;};
 const wheelTo=async(locator,direction)=>{for(let n=0;n<45&&!await visible(locator);n++){await page.mouse.wheel(0,direction*420);await page.waitForTimeout(60);}assert.ok(await visible(locator),'Endpoint must be visibly reachable');};
 const settle=()=>page.waitForTimeout(200);
 const stable=async phase=>{await settle();const a=await read();await page.waitForTimeout(300);const b=await read();assert.equal(b.source,a.source,phase+' source drift');assert.equal(b.anchor,a.anchor,phase+' anchor drift');assert.equal(b.head,a.head,phase+' head drift');assert.ok(Math.abs(b.top-a.top)<2,phase+' scroll drift');assert.ok(b.focused,phase+' focus');assert.ok(b.caret&&b.caret.top>=b.viewport.top-2&&b.caret.bottom<=b.viewport.bottom+2,phase+' selection head must remain visible: '+JSON.stringify({caret:b.caret,viewport:b.viewport}));return b;};
 const bodies={code:'```text\nALPHA\nBRAVO\n```',quote:'> ```text\n> ALPHA\n> BRAVO\n> ```',table:'| Head | Other |\n| --- | --- |\n| BRAVO | VALUE |',details:'<details open>\n<summary>Section</summary>\n\n| Head | Other |\n| --- | --- |\n| BRAVO | VALUE |\n\n</details>'};
 for(const [kind,body]of Object.entries(bodies))for(const reverse of [false,true])for(const action of ['delete','type']){
  const name=`${kind}-${reverse?'reverse':'forward'}-${action}`;
  if(process.env.AUDIT_CASE&&!name.includes(process.env.AUDIT_CASE))continue;
  const middle=Array.from({length:30},(_,i)=>`## Section ${i}\n\nParagraph ${i} with **bold** and *italic* words, followed by a sufficiently long editable sentence.\n\n`).join('');
  const source='BEGIN\n\n'+body+'\n\n'+middle+'AFTER\n\nFINISH';
  await app.locator('[data-editor-presentation="source"]').click();await content.fill(source);await content.press('Control+Home');await app.locator('[data-editor-presentation="live"]').click();
  const inner=root.locator(kind==='code'||kind==='quote'?'.cm-live-code .cm-line':'td .cm-line').filter({hasText:'BRAVO'}),outer=content.locator('> .cm-line').filter({hasText:/^AFTER$/});
  await inner.waitFor();await settle();const box=await scroller.boundingBox();
  await page.mouse.move(box.x+box.width/2,box.y+box.height/2);
  if(reverse)await wheelTo(outer,1);
  const start=await point(reverse?outer:inner,reverse?3:2);assert.ok(start.hit,'Visible start hit');await shot(name+'-01-start');
  await page.mouse.move(start.x,start.y);await page.mouse.down();
  await page.mouse.move(start.x,reverse?box.y+5:box.y+box.height-5,{steps:12});
  const a=await read();await page.waitForTimeout(250);const b=await read();
  assert.ok(reverse?b.top<a.top-20:b.top>a.top+20,'Held edge should auto-scroll');
  // Keep the mouse held but leave the edge before locating the endpoint.
  // Otherwise auto-scroll can move it between measurement and mouse.move.
  await page.mouse.move(box.x+box.width/2,box.y+box.height/2,{steps:3});
  await settle();const stopped=await read();await page.waitForTimeout(100);
  assert.ok(Math.abs((await read()).top-stopped.top)<2,'Leaving edge stops auto-scroll');
  await wheelTo(reverse?inner:outer,reverse?-1:1);
  const end=await point(reverse?inner:outer,reverse?2:3);assert.ok(end.hit,'Visible endpoint hit');
  await page.mouse.move(end.x,end.y,{steps:5});await page.mouse.up();const selected=await stable(name+' release');await shot(name+'-02-selected');
  assert.equal(selected.source,source);assert.equal(selected.anchor,source.indexOf(reverse?'AFTER':'BRAVO')+(reverse?3:2));assert.equal(selected.head,source.indexOf(reverse?'BRAVO':'AFTER')+(reverse?2:3));
  if(action==='delete')await page.keyboard.press('Backspace');else await page.keyboard.insertText('X');
  const changed=await stable(name+' edit');await shot(name+'-03-changed');
  assert.ok(changed.source.startsWith('BEGIN\n\n'));assert.ok(changed.source.endsWith('ER\n\nFINISH'));assert.ok(!changed.source.includes('Section 0')&&!changed.source.includes('Paragraph 29'));assert.ok(changed.source.includes(action==='type'?'BRX':'BR'));
  await page.keyboard.press('Control+z');const undo=await stable(name+' undo');assert.equal(undo.source,source);await shot(name+'-04-undo');
  await page.keyboard.press('Control+Shift+KeyZ');const redo=await stable(name+' redo');assert.equal(redo.source,changed.source);
  await page.keyboard.insertText('Y');const typed=await stable(name+' continued');assert.equal(typed.source,changed.source.slice(0,redo.head)+'Y'+changed.source.slice(redo.head));
  await shot(name+'-05-continued');console.log(JSON.stringify({name,selectedTop:selected.top,changedTop:changed.top,undoTop:undo.top,redoTop:redo.top,status:'PASS'}));
 }
 assert.deepEqual(errors,[]);
}catch(e){if(page&&process.env.AUDIT_OUTPUT)await page.screenshot({path:`${process.env.AUDIT_OUTPUT}/failure.png`});throw e;}
finally{await browser?.close();await server.close();}
