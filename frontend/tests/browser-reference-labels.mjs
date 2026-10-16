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
 const formats=[['full','[ALPHA][ref]','ref'],['collapsed','[ALPHA][]','ALPHA'],['shortcut','[ALPHA]','ALPHA'],['inline','[ALPHA](https://example.com)',null,'ALPHA'],['auto','<https://example.com/ALPHA>',null,'https://example.com/ALPHA'],['email','<ALPHA@example.com>',null,'ALPHA@example.com']];
 const actions=[['type',2,null,'ALxyPHA',4],['end',5,null,'ALPHAxy',7],['back',2,null,'APHA',1],['delete',2,null,'ALHA',2],['replace',1,4,'AXA',2],['enter',2,null,'AL\nPHA',3],['boundary-back',0,null,'ALPHA',0],['boundary-delete',5,null,'ALPHA',5]];
 const suffix='\n\nShared [ALPHA]\n\n[ALPHA]: https://example.com/shared "Shared"\n[ref]: https://example.com/shared "Shared"';let passed=0;
 for(const[kind,wrap]of contexts)for(const[format,initial,reference,boundaryLabel]of formats)for(const[action,initialOffset,end,initialResult,initialCaret]of actions){
  if(reference===null&&!action.startsWith('boundary-'))continue;
  const label=boundaryLabel??initialResult,offset=boundaryLabel&&action==='boundary-delete'?label.length:initialOffset,caret=boundaryLabel&&action==='boundary-delete'?label.length:initialCaret;
  if(kind==='table'&&action==='enter')continue;
  const id=`${kind}-${format}-${action}`;if(process.env.AUDIT_CASE&&!id.includes(process.env.AUDIT_CASE))continue;
  const doc='Before\n\n'+wrap(initial)+suffix;await reset(doc);const field=kind==='root'?editor:editor.locator('.cm-live-inner').last();await field.waitFor();
  const points=await field.evaluate(async(el,{offsets,label})=>{const{EditorView}=await import('/node_modules/@codemirror/view/dist/index.js');const v=EditorView.findFromDOM(el),base=v.state.doc.toString().indexOf(label);return offsets.map(at=>{const r=v.coordsAtPos(base+at);return{x:r.left+.2,y:(r.top+r.bottom)/2};});},{offsets:end===null?[offset]:[offset,end],label:boundaryLabel??'ALPHA'});
  await page.mouse.click(points[0].x,points[0].y);
  if(end!==null){await page.mouse.move(points[0].x,points[0].y);await page.mouse.down();await page.mouse.move(points[1].x,points[1].y,{steps:12});await page.mouse.up();}
  await shot(id+'-01-positioned');const before=await read();
  if(action==='type'||action==='end')await page.keyboard.type('xy',{delay:60});
  else if(action==='replace')await page.keyboard.insertText('X');
  else await page.keyboard.press({back:'Backspace',delete:'Delete',enter:'Enter','boundary-back':'Backspace','boundary-delete':'Delete'}[action]);
  await page.waitForTimeout(100);await shot(id+'-02-edited');const after=await read();console.log(id,JSON.stringify({before,after}));
  if(!process.env.AUDIT_BASELINE){
   const boundary=action.startsWith('boundary-'),result=text=>'Before\n\n'+wrap(boundary?text:`[${text}][${reference}]`)+suffix,expected=result(label);assert.equal(after.doc,expected);
   const visible=await field.evaluate(async el=>{const{EditorView}=await import('/node_modules/@codemirror/view/dist/index.js');return EditorView.findFromDOM(el).contentDOM.innerText;});assert.ok(visible.includes(label),JSON.stringify(visible));
   const links=await field.evaluate(async(el,suffix)=>{const{EditorView}=await import('/node_modules/@codemirror/view/dist/index.js');const{marked}=await import('/node_modules/marked/lib/marked.esm.js');const parsed=new DOMParser().parseFromString(marked.parse(EditorView.findFromDOM(el).state.doc.toString()+suffix),'text/html');return [...parsed.querySelectorAll('a')].map(a=>[a.textContent,a.getAttribute('href')]);},kind==='root'?'':suffix);if(!boundary)assert.ok(links.some(([text,url])=>text===label&&url==='https://example.com/shared'),JSON.stringify(links));
   await page.waitForTimeout(600);await page.keyboard.insertText('Q');await shot(id+'-03-follow-up');assert.equal((await read()).doc,result(label.slice(0,caret)+'Q'+label.slice(caret)));
   await page.keyboard.press('Control+z');assert.equal((await read()).doc,expected);await page.keyboard.press('Control+z');assert.equal((await read()).doc,doc);await page.keyboard.press('Control+y');assert.equal((await read()).doc,expected);
  }
  passed++;
 }
 assert.deepEqual(errors,[]);console.log(JSON.stringify({passed,pageErrors:errors}));
}catch(error){if(page&&process.env.AUDIT_OUTPUT)await page.screenshot({path:`${process.env.AUDIT_OUTPUT}/failure.png`});throw error;}finally{await browser?.close();await server.close();}
