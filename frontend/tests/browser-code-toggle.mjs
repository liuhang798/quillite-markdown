import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import {createServer} from 'vite';
const {chromium}=createRequire(import.meta.url)(process.env.PLAYWRIGHT_MODULE||'playwright');
const server=await createServer({root:fileURLToPath(new URL('..',import.meta.url)),server:{host:'127.0.0.1',port:0,watch:null,hmr:false},logLevel:'error'});
let browser,page;
try{
 await server.listen();browser=await chromium.launch({headless:true,executablePath:process.env.BROWSER_EXECUTABLE||undefined});page=await browser.newPage({viewport:{width:1500,height:1000}});const errors=[];page.on('pageerror',e=>errors.push(e.message));await page.goto(server.resolvedUrls.local[0]+'tests/fixtures/cross-format-audit.html');const app=page.frameLocator('iframe');await app.locator('#newFileButton').click();await app.locator('#hideLivePreviewButton').click();const editor=app.locator('#markdownEditor > .cm-editor'),content=editor.locator('> .cm-scroller > .cm-content');
 page.on('pageerror',e=>console.log(e.stack));
 const read=()=>editor.evaluate(async el=>{const{EditorView}=await import('/node_modules/@codemirror/view/dist/index.js');return EditorView.findFromDOM(el).state.doc.toString();});
 const shot=async name=>{if(process.env.AUDIT_OUTPUT)await page.screenshot({path:`${process.env.AUDIT_OUTPUT}/${name}.png`});};
 const contexts=[['root',t=>t],['details',t=>'<details open>\n<summary>Title</summary>\n\n'+t+'\n\n</details>'],['table',t=>'| Head |\n| --- |\n| '+t+' |'],['footnote',t=>'Note[^n]\n\n[^n]: '+t]];let passed=0;
 for(const[kind,wrap]of contexts)for(const[index,body]of ['AL`PHA','`ALPHA','ALPHA`',' ALPHA '].entries())for(const reverse of [false,true]){
  const id=`${kind}-${index}-${reverse}`;if(process.env.AUDIT_CASE&&!id.includes(process.env.AUDIT_CASE))continue;
  const pad=index?' ':'',raw='``'+pad+body+pad+'``',result=raw=>'Before\n\n'+wrap(raw)+'\n\nAfter',doc=result(raw);await app.locator('[data-editor-presentation="source"]').click();await content.focus();await page.keyboard.press('Control+a');await page.keyboard.insertText(doc);await page.keyboard.press('Control+Home');await app.locator('[data-editor-presentation="live"]').click();await page.waitForTimeout(100);const field=kind==='root'?editor:editor.locator('.cm-live-inner').last();
  const points=await field.evaluate(async(el,{raw,body,pad,reverse})=>{const{EditorView}=await import('/node_modules/@codemirror/view/dist/index.js');const v=EditorView.findFromDOM(el),start=v.state.doc.toString().indexOf(raw)+2+pad.length,positions=[start,start+body.length];if(reverse)positions.reverse();return positions.map(pos=>{const r=v.coordsAtPos(pos);return{x:r.left+.2,y:(r.top+r.bottom)/2};});},{raw,body,pad,reverse});await page.mouse.move(points[0].x,points[0].y);await page.mouse.down();await page.mouse.move(points[1].x,points[1].y,{steps:12});await page.mouse.up();await shot(id+'-01-selected');await app.locator('[data-format="inline-code"]').first().click();await page.waitForTimeout(100);await shot(id+'-02-toggled');const after=await read();console.log(id,JSON.stringify({doc,after}));
  if(!process.env.AUDIT_BASELINE){assert.equal(after,result(body.replace(/[\\`]/g,'\\$&')));assert.equal(await field.locator('.cm-live-inline-code').count(),0);await page.keyboard.press('Control+z');assert.equal(await read(),doc);await page.keyboard.press('Control+y');assert.equal(await read(),after);}
  if(process.env.AUDIT_REAPPLY){
   await page.waitForTimeout(150);
   console.log(id+' selection',await editor.evaluate(async el=>{const{EditorView}=await import('/node_modules/@codemirror/view/dist/index.js');return EditorView.findFromDOM(el).state.selection.ranges.map(r=>({from:r.from,to:r.to,anchor:r.anchor,head:r.head}));}));
   await app.locator('[data-format="inline-code"]').first().click();await page.waitForTimeout(100);await shot(id+'-03-reapplied');const reapplied=await read();console.log(id+' reapply',JSON.stringify({reapplied}));
   assert.deepEqual(errors,[]);
   if(!process.env.AUDIT_BASELINE){
    const actual=await field.evaluate(async el=>{const{EditorView}=await import('/node_modules/@codemirror/view/dist/index.js');const{marked}=await import('/node_modules/marked/lib/marked.esm.js');return new DOMParser().parseFromString(marked.parse(EditorView.findFromDOM(el).state.doc.toString()),'text/html').querySelector('code')?.textContent;});assert.equal(actual,body,id+' reapply');
    await page.keyboard.press('Control+z');assert.equal(await read(),after);await page.keyboard.press('Control+y');assert.equal(await read(),reapplied);
   }
  }
  passed++;
 }
 assert.deepEqual(errors,[]);console.log(JSON.stringify({passed,pageErrors:errors}));
}finally{await browser?.close();await server.close();}
