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
 const cases=[
  {id:'tick',raw:'`ALPHA\nBETA`',label:'BETA',offset:2,insert:'`',expected:['ALPHA','BE`TA']},
  {id:'double-tick',raw:'``ALPHA\nBETA``',label:'BETA',offset:2,insert:'``',expected:['ALPHA','BE``TA']},
  {id:'paste',raw:'`ALPHA`',label:'ALPHA',offset:2,insert:'ONE`\nTWO``\n# THREE',paste:true,expected:['ALONE`','TWO``','# THREEPHA']},
  {id:'enter',raw:'``AL`PHA``',label:'AL`PHA',offset:3,key:'Enter',expected:['AL`','PHA']},
  {id:'end-enter',raw:'``AL`PHA``',label:'AL`PHA',offset:6,key:'Enter',expected:['AL`PHA']},
  {id:'prefix-paste',raw:'`ALPHA`',label:'ALPHA',offset:2,insert:'\n> TEXT\n  MORE',paste:true,expected:['AL','> TEXT','  MOREPHA']},
  {id:'blank-paste',raw:'`ALPHA`',label:'ALPHA',offset:2,insert:'\n\nBETA',paste:true,expected:['AL','BETAPHA']},
 ];let passed=0;
 for(const[kind,wrap]of contexts)for(const item of cases){
  const id=kind+'-'+item.id;if(process.env.AUDIT_CASE&&!id.includes(process.env.AUDIT_CASE))continue;
  const doc='Before\n\n'+wrap(item.raw)+'\n\nAfter';await app.locator('[data-editor-presentation="source"]').click();await content.focus();await page.keyboard.press('Control+a');await page.keyboard.insertText(doc);await page.keyboard.press('Control+Home');await app.locator('[data-editor-presentation="live"]').click();await page.waitForTimeout(100);const field=['root','quote','list'].includes(kind)?editor:editor.locator('.cm-live-inner').last();
  const point=await field.evaluate(async(el,{label,offset})=>{const{EditorView}=await import('/node_modules/@codemirror/view/dist/index.js');const v=EditorView.findFromDOM(el),r=v.coordsAtPos(v.state.doc.toString().indexOf(label)+offset);return{x:r.left+.2,y:(r.top+r.bottom)/2};},item);
  if(item.paste){const clipboard=page.locator('.clipboard');await clipboard.fill(item.insert);await clipboard.focus();await page.keyboard.press('Control+a');await page.keyboard.press('Control+c');}
  await page.mouse.click(point.x,point.y);await shot(id+'-01-before');
  if(item.key)await page.keyboard.press(item.key);else if(item.paste)await page.keyboard.press('Control+v');else await page.keyboard.type(item.insert,{delay:80});
  await page.waitForTimeout(150);await shot(id+'-02-after');const after=await read();
  const semantics=await field.evaluate(async el=>{const{EditorView}=await import('/node_modules/@codemirror/view/dist/index.js');const{marked}=await import('/node_modules/marked/lib/marked.esm.js');const v=EditorView.findFromDOM(el),html=new DOMParser().parseFromString(marked.parse(v.state.doc.toString()),'text/html');return{codes:[...html.querySelectorAll('code')].map(e=>e.textContent),fences:html.querySelectorAll('pre').length,visible:v.contentDOM.innerText,source:v.state.doc.toString()};});console.log(id,JSON.stringify({after,semantics}));
  if(!process.env.AUDIT_BASELINE){
   assert.deepEqual(semantics.codes,item.expected,id);assert.equal(semantics.fences,0,id);assert.deepEqual(errors,[]);
   for(const text of item.expected)assert.ok(semantics.visible.includes(text),id+' visible '+text);
   await page.waitForTimeout(600);await page.keyboard.insertText('Q');const followed=await read();assert.notEqual(followed,after);
   const follow=await field.evaluate(async el=>{const{EditorView}=await import('/node_modules/@codemirror/view/dist/index.js');const{marked}=await import('/node_modules/marked/lib/marked.esm.js');const v=EditorView.findFromDOM(el),pos=v.state.selection.main.head;return{caret:v.state.doc.sliceString(pos-1,pos),codes:[...new DOMParser().parseFromString(marked.parse(v.state.doc.toString()),'text/html').querySelectorAll('code')].map(e=>e.textContent)};});assert.equal(follow.caret,'Q',id+' follow-up caret');
   const expected=[...item.expected],last=expected.length-1;
   if(item.id==='tick')expected[last]='BE`QTA';else if(item.id==='double-tick')expected[last]='BE``QTA';else if(item.id==='enter')expected[last]='QPHA';else if(item.id!=='end-enter')expected[last]=expected[last].replace(/PHA$/,'QPHA');
   assert.deepEqual(follow.codes,expected,id+' follow-up content');
   await shot(id+'-03-follow-up');await page.keyboard.press('Control+z');assert.equal(await read(),after,id+' undo follow-up');await page.keyboard.press('Control+z');assert.equal(await read(),doc,id+' undo original');await page.keyboard.press('Control+y');assert.equal(await read(),after,id+' redo');
  }passed++;
 }
 for(const[kind,wrap]of contexts)for(const operation of ['apply','partial','remove']){
  const id=kind+'-toolbar-'+operation;if(process.env.AUDIT_CASE&&!id.includes(process.env.AUDIT_CASE))continue;
  const raw=operation==='apply'?'ALPHA\nBE``TA':'``ALPHA\nBE`TA``',doc='Before\n\n'+wrap(raw)+'\n\nAfter';await app.locator('[data-editor-presentation="source"]').click();await content.focus();await page.keyboard.press('Control+a');await page.keyboard.insertText(doc);await page.keyboard.press('Control+Home');await app.locator('[data-editor-presentation="live"]').click();await page.waitForTimeout(100);const field=['root','quote','list'].includes(kind)?editor:editor.locator('.cm-live-inner').last();
  const points=await field.evaluate(async(el,operation)=>{const{EditorView}=await import('/node_modules/@codemirror/view/dist/index.js');const v=EditorView.findFromDOM(el),doc=v.state.doc.toString(),from=doc.indexOf('ALPHA'),to=operation==='partial'?from+2:doc.indexOf('TA')+2;return[from,to].map(pos=>{const r=v.coordsAtPos(pos);return{x:r.left+.2,y:(r.top+r.bottom)/2};});},operation);
  await page.mouse.move(points[0].x,points[0].y);await page.mouse.down();await page.mouse.move(points[1].x,points[1].y,{steps:12});await page.mouse.up();await shot(id+'-01-selected');await app.locator('[data-format="inline-code"]').first().click();await page.waitForTimeout(150);await shot(id+'-02-toggled');const after=await read();
  const actual=await field.evaluate(async el=>{const{EditorView}=await import('/node_modules/@codemirror/view/dist/index.js');const{marked}=await import('/node_modules/marked/lib/marked.esm.js');return[...new DOMParser().parseFromString(marked.parse(EditorView.findFromDOM(el).state.doc.toString()),'text/html').querySelectorAll('code')].map(e=>e.textContent);});
  console.log(id,JSON.stringify({after,actual}));assert.deepEqual(actual,operation==='apply'?['ALPHA','BE``TA']:operation==='partial'?['PHA','BE`TA']:[]);await page.keyboard.press('Control+z');assert.equal(await read(),doc,id+' undo');await page.keyboard.press('Control+y');assert.equal(await read(),after,id+' redo');passed++;
 }
 assert.deepEqual(errors,[]);console.log(JSON.stringify({passed,pageErrors:errors}));
}catch(error){if(page&&process.env.AUDIT_OUTPUT)await page.screenshot({path:`${process.env.AUDIT_OUTPUT}/failure.png`});throw error;}finally{await browser?.close();await server.close();}
