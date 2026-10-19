// Fresh browser and synthetic documents only; user-authorized interaction audit.
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import {createServer} from 'vite';
const {chromium}=createRequire(import.meta.url)(process.env.PLAYWRIGHT_MODULE||'playwright');
const server=await createServer({root:fileURLToPath(new URL('..',import.meta.url)),server:{host:'127.0.0.1',port:0,watch:null,hmr:false},logLevel:'error'});
let browser,page;
try{
 await server.listen();browser=await chromium.launch({headless:true,executablePath:process.env.BROWSER_EXECUTABLE||undefined});page=await browser.newPage({viewport:{width:1500,height:1000}});page.setDefaultTimeout(10000);
 const errors=[];page.on('pageerror',e=>errors.push(e.message));await page.goto(server.resolvedUrls.local[0]+'tests/fixtures/cross-format-audit.html');const app=page.frameLocator('iframe');await app.locator('#newFileButton').click();await app.locator('#hideLivePreviewButton').click();const editor=app.locator('#markdownEditor > .cm-editor'),content=editor.locator('> .cm-scroller > .cm-content');
 const read=()=>editor.evaluate(async el=>{const{EditorView}=await import('/node_modules/@codemirror/view/dist/index.js');return EditorView.findFromDOM(el).state.doc.toString();});
 const shot=async name=>{if(process.env.AUDIT_OUTPUT)await page.screenshot({path:`${process.env.AUDIT_OUTPUT}/${name}.png`});};
 const contexts=[['root',t=>t],['quote',t=>'> '+t.replace(/\n/g,'\n> ')],['list',t=>'- '+t.replace(/\n/g,'\n  ')],['details',t=>'<details open>\n<summary>Title</summary>\n\n'+t+'\n\n</details>'],['footnote',t=>'Note[^n]\n\n[^n]: '+t.replace(/\n/g,'\n    ')]];
 const reset=async(doc,kind)=>{await app.locator('[data-editor-presentation="source"]').click();await content.focus();await page.keyboard.press('Control+a');await page.keyboard.insertText(doc);await page.keyboard.press('Control+Home');await app.locator('[data-editor-presentation="live"]').click();await page.waitForTimeout(100);return['root','quote','list'].includes(kind)?editor:editor.locator('.cm-live-inner').last();};
 const coords=(field,labels)=>field.evaluate(async(el,labels)=>{const{EditorView}=await import('/node_modules/@codemirror/view/dist/index.js');const v=EditorView.findFromDOM(el),source=v.state.doc.toString();return labels.map(([label,offset])=>{const pos=source.indexOf(label)+offset,r=v.coordsAtPos(pos);return{x:r.left+.2,y:(r.top+r.bottom)/2};});},labels);
 let passed=0;
 for(const[kind,wrap]of contexts)for(const format of ['plain','bold','code','blank'])for(const reverse of [false,true]){
  const id=`selection-${kind}-${format}-${reverse}`;if(process.env.AUDIT_CASE&&!id.includes(process.env.AUDIT_CASE))continue;
  const words=['ALPHA','BETA','GAMMA'],raw=words.map(w=>format==='bold'?'**'+w+'**':format==='code'?'`'+w+'`':w).join(format==='blank'?'\n\n':'\n'),doc='Before\n\n'+wrap(raw)+'\n\nAfter',field=await reset(doc,kind),points=await coords(field,[['ALPHA',1],['GAMMA',4]]);if(reverse)points.reverse();
  await page.mouse.move(points[0].x,points[0].y);await page.mouse.down();await page.mouse.move(points[1].x,points[1].y,{steps:14});await page.mouse.up();await page.waitForTimeout(150);await shot(id+'-01-selected');
  const paint=await field.evaluate(el=>[...el.querySelectorAll(':scope > .cm-scroller > .cm-layer .cm-selectionBackground')].filter(e=>getComputedStyle(e).visibility==='visible').map(e=>{const r=e.getBoundingClientRect();return{left:r.left,right:r.right,top:r.top,bottom:r.bottom,width:r.width};}));console.log(id,JSON.stringify(paint));
  if(!process.env.AUDIT_BASELINE){
   assert.ok(paint.length>=3,id);assert.ok(paint.every(r=>r.width<130),id+' selection extends beyond short text '+JSON.stringify(paint));assert.equal(await read(),doc);
   const selection=await field.evaluate(async el=>{const{EditorView}=await import('/node_modules/@codemirror/view/dist/index.js');const v=EditorView.findFromDOM(el),s=v.state.selection.main,source=v.state.doc.toString(),layer=el.querySelector(':scope > .cm-scroller > .cm-live-selection-layer');return{from:s.from,to:s.to,expectedFrom:source.indexOf('ALPHA')+1,expectedTo:source.indexOf('GAMMA')+4,measured:el.classList.contains('cm-live-measured-selection'),native:getComputedStyle(v.contentDOM,'::selection').backgroundColor,pointer:layer&&getComputedStyle(layer).pointerEvents};});
   assert.equal(selection.from,selection.expectedFrom,id+' drag start');assert.equal(selection.to,selection.expectedTo,id+' drag end');
   if(selection.measured){assert.equal(selection.native,'rgba(0, 0, 0, 0)',id+' native selection hidden');assert.equal(selection.pointer,'none',id+' selection must not intercept clicks');}
  }
  passed++;
 }
 for(const[kind,wrap]of contexts)for(const key of ['Backspace','Delete'])for(const body of ['ALPHA','AL`PHA','AL``PHA','AL*PHA','AL[PHA','AL&copy;PHA']){
  const id=`join-${kind}-${key}-${body.replace(/[^A-Za-z]/g,c=>c.charCodeAt(0))}`;if(process.env.AUDIT_CASE&&!id.includes(process.env.AUDIT_CASE))continue;
  const raw='```'+body+'```',doc='Before\n\n'+wrap(raw)+'\n\nAfter',field=await reset(doc,kind),[point]=await coords(field,[[body,2]]);await page.mouse.click(point.x,point.y);await page.keyboard.press('Enter');await page.waitForTimeout(100);const split=await read();await shot(id+'-01-split');
  if(key==='Delete'){const[pos]=await coords(field,[['AL',2]]);await page.mouse.click(pos.x,pos.y);}
  await page.waitForTimeout(600); // Explicitly separate Enter from the subsequent deletion event.
  const states=[split];for(let i=0;i<2;i++){await page.keyboard.press(key);await page.waitForTimeout(100);states.push(await read());await shot(id+`-0${i+2}-deleted`);}
  console.log(id,JSON.stringify(states));
  if(!process.env.AUDIT_BASELINE){
   const semantic=await field.evaluate(async el=>{const{EditorView}=await import('/node_modules/@codemirror/view/dist/index.js');const{marked}=await import('/node_modules/marked/lib/marked.esm.js');const v=EditorView.findFromDOM(el),parsed=new DOMParser().parseFromString(marked.parse(v.state.doc.toString()),'text/html');return parsed.body.textContent.replace(/\s/g,'');});
   assert.equal(semantic,['root','quote','list'].includes(kind)?'Before'+body+'After':body,id+' literal content');
   assert.deepEqual(errors,[]);await page.waitForTimeout(600);await page.keyboard.insertText('Q');assert.notEqual(await read(),states[2]);await page.keyboard.press('Control+z');assert.equal(await read(),states[2]);
   // Consecutive deletion may be one history event; undo reaches its exact split baseline.
   await page.keyboard.press('Control+z');const undone=await read();assert.ok([states[0],states[1]].includes(undone),id+' undo');if(undone===states[1])await page.keyboard.press('Control+z');assert.equal(await read(),split);
   await page.keyboard.press('Control+y');if(undone===states[1])await page.keyboard.press('Control+y');assert.equal(await read(),states[2],id+' redo');
  }passed++;
 }
 assert.deepEqual(errors,[]);console.log(JSON.stringify({passed,pageErrors:errors}));
}catch(error){if(page&&process.env.AUDIT_OUTPUT)await page.screenshot({path:`${process.env.AUDIT_OUTPUT}/failure.png`});throw error;}finally{await browser?.close();await server.close();}
