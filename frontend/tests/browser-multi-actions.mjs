// User-authorized isolated browser; synthetic documents and clipboard only.
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import {createServer} from 'vite';
const{chromium}=createRequire(import.meta.url)(process.env.PLAYWRIGHT_MODULE||'playwright');
const server=await createServer({root:fileURLToPath(new URL('..',import.meta.url)),server:{host:'127.0.0.1',port:0,watch:null,hmr:false},logLevel:'error'});
const cases=[['table','| Head | Other |\n| --- | --- |\n| needle needle | needle |',' '],['code','```text\nneedle needle\n```','\n'],['details','<details open>\n<summary>Section</summary>\n\nneedle needle\n\n</details>','\n'],['footnote','Note[^n]\n\n[^n]: needle needle','\n    '],['summary','<details open>\n<summary>needle needle</summary>\n\nBody\n\n</details>',' '],['nested','<details open>\n<summary>Section</summary>\n\n| Head | Other |\n| --- | --- |\n| needle needle | needle |\n\n</details>',' ']];
let browser,page;
try{
 await server.listen();browser=await chromium.launch({headless:true,executablePath:process.env.BROWSER_EXECUTABLE||undefined});page=await browser.newPage({viewport:{width:1500,height:1000}});page.setDefaultTimeout(10000);const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.route('**/*',route=>new URL(route.request().url()).hostname==='127.0.0.1'?route.continue():route.abort());await page.goto(server.resolvedUrls.local[0]+'tests/fixtures/app-drag-audit.html');const app=page.frameLocator('iframe');await app.locator('#newFileButton').evaluate(async()=>{await import('/src/main.js');});await app.locator('#newFileButton').click();await app.locator('#hideLivePreviewButton').click();const editor=app.locator('#markdownEditor > .cm-editor'),content=editor.locator('> .cm-scroller > .cm-content');
 const read=()=>editor.evaluate(async el=>{const{EditorView}=await import('/node_modules/@codemirror/view/dist/index.js');const s=EditorView.findFromDOM(el).state;return{doc:s.doc.toString(),ranges:s.selection.ranges.map(r=>[r.from,r.to])};});
 const shot=async name=>{if(process.env.AUDIT_OUTPUT)await page.screenshot({path:`${process.env.AUDIT_OUTPUT}/${name}.png`});};
 const checkCursors=async name=>{
  const result=await editor.evaluate(el=>{
   const ends=[],walk=document.createTreeWalker(el,NodeFilter.SHOW_TEXT);let node;
   while((node=walk.nextNode()))if(node.parentElement.closest('.cm-live-inner .cm-line'))for(const match of node.textContent.matchAll(/needle/g)){
    const r=document.createRange();r.setStart(node,match.index);r.setEnd(node,match.index+6);const box=r.getBoundingClientRect();if(box.width>0)ends.push({x:box.right,y:box.top});
   }
   return{ends,cursors:[...el.querySelectorAll('.cm-cursor')].filter(n=>n.getBoundingClientRect().height>0).map(n=>{const r=n.getBoundingClientRect();return{x:r.x,y:r.y,height:r.height};})};
  });
  console.log('VISIBLE CURSORS',name,JSON.stringify(result));
  assert.ok(result.cursors.length>0,name+': caret remains visible');
  assert.ok(result.cursors.every(c=>c.height<45),name+': no block-height caret');
  if(name.endsWith('-cursor'))for(const end of result.ends)assert.ok(result.cursors.some(c=>Math.abs(c.x-end.x)<2&&Math.abs(c.y-end.y)<2),name+': caret at each selected text end');
 };
 await page.evaluate(()=>{const t=document.createElement('textarea');t.setAttribute('aria-label','隔离纯文本');t.style='position:fixed;bottom:0;right:0;width:100px;height:25px';document.body.append(t);});
 let passed=0;
 for(const[kind,body,newline]of cases)for(const action of ['cursor','Backspace','Delete','Enter','paste','paste-plain']){
  const name=kind+'-'+action,doc='Before\n\n'+body+'\n\nAfter';if(process.env.AUDIT_CASE&&process.env.AUDIT_CASE!==name)continue;console.log('START',name);
  if(action.startsWith('paste')){const clip=page.getByLabel(action==='paste'?'隔离富文本':'隔离纯文本');await clip.fill(action==='paste'?'PASTE':'A|B\nC');await clip.focus();await page.keyboard.press('Control+a');await page.keyboard.press('Control+c');}
  await app.locator('[data-editor-presentation="source"]').click();await content.focus();await page.keyboard.press('Control+a');await page.keyboard.insertText(doc);await page.keyboard.press('Control+Home');await app.locator('[data-editor-presentation="live"]').click();await content.focus();await page.keyboard.press('Control+f');
  const panel=editor.locator(':scope > .cm-panels .cm-search');await panel.locator('input[name="search"]').fill('needle');await panel.locator('button[name="select"]').click();await page.keyboard.press('Escape');await page.waitForTimeout(100);await shot(name+'-01-selected');
  assert.deepEqual((await read()).ranges,[...doc.matchAll(/needle/g)].map(m=>[m.index,m.index+6]));
  if(action==='cursor'){
   const cursors=await editor.evaluate(el=>({native:getComputedStyle(el.querySelector(':scope > .cm-scroller > .cm-content')).caretColor,cursors:[...el.querySelectorAll('.cm-cursor')].map(n=>{const r=n.getBoundingClientRect(),s=getComputedStyle(n);return{height:r.height,width:r.width,display:s.display,visibility:s.visibility,parent:n.parentElement.className};})}));console.log('CURSORS',kind,JSON.stringify(cursors));
   if(!process.env.AUDIT_DIAGNOSTIC)assert.ok(cursors.cursors.every(c=>c.height<45||c.display==='none'||c.visibility==='hidden'),'no block-height cursor');
   await checkCursors(name);
   passed++;
   continue;
  }
  await page.keyboard.press(action.startsWith('paste')?'Control+v':action);await page.waitForTimeout(150);const result=await read();console.log('RESULT',name,JSON.stringify(result));await shot(name+'-02-result');
  if(action==='Backspace'||action==='Delete')assert.equal(result.doc,doc.replaceAll('needle',''));
  if(action==='paste')assert.equal(result.doc,doc.replaceAll('needle',['code','summary'].includes(kind)?'PASTE':'**PASTE**'));
  if(action==='paste-plain')assert.equal(result.doc,doc.replaceAll('needle',['table','nested'].includes(kind)?'A\\|B C':kind==='summary'?'A|B C':kind==='footnote'?'A|B\n    C':'A|B\nC'));
  if(action==='Enter')assert.equal(result.doc,doc.replaceAll('needle',newline));
  const insert=action==='Backspace'||action==='Delete'?'':action==='Enter'?newline:action==='paste'?(['code','summary'].includes(kind)?'PASTE':'**PASTE**'):['table','nested'].includes(kind)?'A\\|B C':kind==='summary'?'A|B C':kind==='footnote'?'A|B\n    C':'A|B\nC';
  assert.deepEqual(result.ranges,[...doc.matchAll(/needle/g)].map((m,i)=>{const p=m.index+(insert.length-6)*i+insert.length;return[p,p];}),name+': exact caret offsets');
  await checkCursors(name);
  // Separate the next keystroke from CM's normal 500 ms history grouping.
  await page.waitForTimeout(600);
  let typed=result.doc;for(const[from,to]of [...result.ranges].reverse())typed=typed.slice(0,from)+'Z'+typed.slice(to);
  await page.keyboard.insertText('Z');assert.equal((await read()).doc,typed,name+': type at all collapsed carets');
  await page.keyboard.press('Control+z');assert.equal((await read()).doc,result.doc,name+': undo follow-up input');
  // CM redo may select restored replacement text; verify immediate typing
  // before undo/redo, and document restoration separately.
  if(result.doc!==doc){await page.keyboard.press('Control+z');assert.equal((await read()).doc,doc,name+': exact undo');await page.keyboard.press('Control+y');assert.equal((await read()).doc,result.doc,name+': exact redo');}
  console.log('PASS',name);
  passed++;
 }
 assert.deepEqual(errors,[]);console.log(JSON.stringify({PASS:passed,pageErrors:errors,filter:process.env.AUDIT_CASE||null}));
}catch(e){console.error('PRIMARY FAILURE',e);if(page&&process.env.AUDIT_OUTPUT)try{await page.screenshot({path:`${process.env.AUDIT_OUTPUT}/failure.png`,timeout:2000});}catch(capture){console.error('FAILURE CAPTURE',capture.message);}throw e;}finally{await browser?.close();await server.close();}
