// User-authorized isolated full-app audit, no real documents or browser profile.
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import {createServer} from 'vite';
const {chromium}=createRequire(import.meta.url)(process.env.PLAYWRIGHT_MODULE||'playwright');
const server=await createServer({root:fileURLToPath(new URL('..',import.meta.url)),server:{host:'127.0.0.1',port:0,watch:null,hmr:false},logLevel:'error'});
let browser,page;
try{
 await server.listen();browser=await chromium.launch({headless:true,executablePath:process.env.BROWSER_EXECUTABLE||undefined});page=await browser.newPage({viewport:{width:1400,height:1000}});page.setDefaultTimeout(10000);
 const errors=[];page.on('pageerror',e=>errors.push(e.message));await page.goto(server.resolvedUrls.local[0]+'tests/fixtures/multiline-edit-audit.html');const app=page.frameLocator('iframe');await app.locator('#newFileButton').click();await app.locator('#hideLivePreviewButton').click();
 const root=app.locator('#markdownEditor > .cm-editor'),content=root.locator('> .cm-scroller > .cm-content');
 const read=()=>root.evaluate(async el=>{const{EditorView}=await import('/node_modules/@codemirror/view/dist/index.js');return EditorView.findFromDOM(el).state.doc.toString();});
 const shot=async name=>{if(process.env.AUDIT_OUTPUT){await page.waitForTimeout(150);await page.screenshot({path:`${process.env.AUDIT_OUTPUT}/${name}.png`});}};
 const wrappers={plain:x=>x,quote:x=>x.replace(/^/gm,'> '),list:x=>'- Item\n\n'+x.replace(/^/gm,'  '),details:x=>'<details open>\n<summary>Title</summary>\n\n'+x+'\n\n</details>',footnote:x=>'Note[^n]\n\n[^n]: Note\n    \n'+x.replace(/^/gm,'    ')};
 for(const kind of process.env.AUDIT_CASE?[process.env.AUDIT_CASE]:Object.keys(wrappers))for(const mode of process.env.AUDIT_MODE?[process.env.AUDIT_MODE]:['empty-enter','empty-double','tilde-empty','empty-paste','loose-enter','clear-enter','fence','long','long-pointer']){
  const name=kind+'-'+mode,wrap=body=>'Before\n\n'+wrappers[kind](body)+'\n\nAfter';
  const oldBody=mode==='clear-enter'?'alpha':mode==='fence'?'END':mode.startsWith('long')?'abcdef '.repeat(700)+'END':mode==='loose-enter'?'':null;
  const fence=mode==='tilde-empty'?'~~~':'```';
  const sourceBody=oldBody===null?fence+'text\n'+fence:fence+'text\n'+oldBody+'\n'+fence,original=wrap(sourceBody);
  await app.locator('[data-editor-presentation="source"]').click();await content.fill(original);await content.press('Control+Home');await app.locator('[data-editor-presentation="live"]').click();
  const code=root.getByRole('textbox',{name:'代码内容',exact:true});await code.waitFor();
  if(mode==='empty-paste'||mode==='fence'){const clip=page.getByLabel('隔离纯文本');await clip.fill(mode==='fence'?'```\n~~~\n':'alpha\n');await clip.focus();await clip.press('Control+a');await clip.press('Control+c');}
  await code.click();await code.press(mode.startsWith('long')?'Control+End':'Control+Home');
  if(mode==='long-pointer'){
   const point=await code.locator('.cm-line').evaluate(el=>{const walker=document.createTreeWalker(el,NodeFilter.SHOW_TEXT);let node,last;while((node=walker.nextNode()))last=node;const r=document.createRange();r.setStart(last,last.length-1);r.collapse(true);const b=r.getBoundingClientRect();return{x:b.x,y:b.y+b.height/2,hit:el.contains(document.elementFromPoint(b.x,b.y+b.height/2))};});
   assert.ok(point.hit,name+' click target visible');await page.mouse.click(point.x,point.y);
  }
  if(mode==='clear-enter'){await code.press('Control+a');await code.press('Backspace');}
  await shot(name+'-01-before');
  if(mode==='empty-paste'||mode==='fence')await page.keyboard.press('Control+v');else if(mode!=='long-pointer')await page.keyboard.press('Enter');
  if(mode==='empty-double')await page.keyboard.press('Enter');
  await shot(name+'-02-change');await page.keyboard.insertText('X');await shot(name+'-03-typed');
  const body=mode==='fence'?'```\n~~~\nXEND':mode==='long'?oldBody+'\nX':mode==='long-pointer'?oldBody.slice(0,-1)+'XD':mode==='empty-paste'?'alpha\nX':mode==='empty-double'?'\n\nX':'\nX';
  const expected=wrap((mode==='fence'?'````':fence)+'text\n'+body+'\n'+(mode==='fence'?'````':fence));
  assert.equal(await read(),expected,name+' content and caret');assert.equal(await code.count(),1,name+' code stays editable');
  // Undo is intentionally checked until the exact initial snapshot: adjacent
  // typing may share a group, whereas native paste is its own history event.
  let undos=0;for(;undos<4&&(await read())!==original;undos++)await page.keyboard.press('Control+z');assert.equal(await read(),original,name+' undo restores exact original');
  for(let n=0;n<undos;n++)await page.keyboard.press('Control+Shift+KeyZ');assert.equal(await read(),expected,name+' redo');
  await page.keyboard.insertText('Y');assert.equal(await read(),expected.replace('X','XY'),name+' redo caret');
  console.log('PASS',name);
 }
 assert.deepEqual(errors,[]);
}catch(e){if(page&&process.env.AUDIT_OUTPUT)await page.screenshot({path:`${process.env.AUDIT_OUTPUT}/failure.png`});throw e;}
finally{await browser?.close();await server.close();}
