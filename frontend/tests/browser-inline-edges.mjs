import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import {createServer} from 'vite';
const {chromium}=createRequire(import.meta.url)(process.env.PLAYWRIGHT_MODULE||'playwright');
const server=await createServer({root:fileURLToPath(new URL('..',import.meta.url)),server:{host:'127.0.0.1',port:0,watch:null,hmr:false},logLevel:'error'});
let browser,page;
try{
 await server.listen();browser=await chromium.launch({headless:true,executablePath:process.env.BROWSER_EXECUTABLE||undefined});page=await browser.newPage({viewport:{width:1500,height:1000}});page.setDefaultTimeout(10000);
 const errors=[];page.on('pageerror',e=>errors.push(e.message));await page.goto(server.resolvedUrls.local[0]+'tests/fixtures/cross-format-audit.html');
 const app=page.frameLocator('iframe');await app.locator('#newFileButton').click();await app.locator('#hideLivePreviewButton').click();const editor=app.locator('#markdownEditor > .cm-editor'),content=editor.locator('> .cm-scroller > .cm-content');
 const read=()=>editor.evaluate(async el=>{const{EditorView}=await import('/node_modules/@codemirror/view/dist/index.js');const s=EditorView.findFromDOM(el).state;return{doc:s.doc.toString(),ranges:s.selection.ranges.map(r=>[r.anchor,r.head])};});
 const shot=async name=>{if(process.env.AUDIT_OUTPUT)await page.screenshot({path:`${process.env.AUDIT_OUTPUT}/${name}.png`});};
 const reset=async doc=>{await app.locator('[data-editor-presentation="source"]').click();await content.focus();await page.keyboard.press('Control+a');await page.keyboard.insertText(doc);await page.keyboard.press('Control+Home');await app.locator('[data-editor-presentation="live"]').click();await page.waitForTimeout(100);};
 const contexts=[['root',t=>t],['details',t=>'<details open>\n<summary>Title</summary>\n\n'+t+'\n\n</details>'],['table',t=>'| Head |\n| --- |\n| '+t+' |'],['footnote',t=>'Note[^n]\n\n[^n]: '+t.replaceAll('\n','\n    ')]];
 const formats=[['strong','**','**'],['em','*','*'],['strike','~~','~~'],['highlight','==','=='],['color','<span data-md-color="spectrum-3-red">','</span>'],['code','`','`'],['u','<u>','</u>'],['sup','<sup>','</sup>'],['sub','<sub>','</sub>'],['kbd','<kbd>','</kbd>'],['mark','<mark>','</mark>'],['strong-em','***','***'],['nested','**==','==**']];let passed=0;
 for(const[kind,wrap]of contexts)for(const[format,open,close]of formats)for(const action of ['back','delete','enter']){
  if(kind==='table'&&action==='enter')continue;
  const id=`${kind}-${format}-${action}`;if(process.env.AUDIT_CASE&&!id.includes(process.env.AUDIT_CASE))continue;
  const doc='Before\n\n'+wrap(open+'ALPHA'+close)+'\n\nAfter';await reset(doc);const field=kind==='root'?editor:editor.locator('.cm-live-inner').last();await field.waitFor();
  const point=await field.evaluate(async(el,offset)=>{const{EditorView}=await import('/node_modules/@codemirror/view/dist/index.js');const v=EditorView.findFromDOM(el),base=v.state.doc.toString().indexOf('ALPHA'),r=v.coordsAtPos(base+offset);return{x:r.left+.2,y:(r.top+r.bottom)/2};},action==='back'?0:5);
  await page.mouse.click(point.x,point.y);await shot(id+'-01-positioned');const before=await read();
  await page.keyboard.press({back:'Backspace',delete:'Delete',enter:'Enter'}[action]);if(action==='enter')await page.keyboard.press('Enter');
  await page.waitForTimeout(100);await shot(id+'-02-edited');const after=await read();console.log(id,JSON.stringify({before,after}));
  if(!process.env.AUDIT_BASELINE){
   const result=text=>'Before\n\n'+wrap(text)+'\n\nAfter';
   const remaining=format==='strong-em'?'*ALPHA*':format==='nested'?'**ALPHA**':'ALPHA';
   const expected=result(action==='enter'?open+'ALPHA'+close+'\n\n':remaining);assert.equal(after.doc,expected,id);
   const visible=await field.evaluate(async el=>{const{EditorView}=await import('/node_modules/@codemirror/view/dist/index.js');return EditorView.findFromDOM(el).contentDOM.innerText;});assert.ok(visible.includes('ALPHA'),JSON.stringify(visible));
   await page.waitForTimeout(600);await page.keyboard.insertText('Q');await shot(id+'-03-follow-up');
   const follow=action==='enter'?result(open+'ALPHA'+close+'\n\nQ'):result(remaining.replace('ALPHA',action==='back'?'QALPHA':'ALPHAQ'));
   assert.equal((await read()).doc,follow,id+' follow-up');await page.keyboard.press('Control+z');assert.equal((await read()).doc,expected);
   await page.keyboard.press('Control+z');if(action==='enter')await page.keyboard.press('Control+z');assert.equal((await read()).doc,doc,id+' undo');
   await page.keyboard.press('Control+y');if(action==='enter')await page.keyboard.press('Control+y');assert.equal((await read()).doc,expected,id+' redo');
  }
  passed++;
 }
 assert.deepEqual(errors,[]);console.log(JSON.stringify({passed,pageErrors:errors}));
}catch(error){if(page&&process.env.AUDIT_OUTPUT)await page.screenshot({path:`${process.env.AUDIT_OUTPUT}/failure.png`});throw error;}finally{await browser?.close();await server.close();}
