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
 const reset=async doc=>{await app.locator('[data-editor-presentation="source"]').click();await content.focus();await page.keyboard.press('Control+a');await page.keyboard.insertText(doc);await page.keyboard.press('Control+Home');await app.locator('[data-editor-presentation="live"]').click();await page.waitForTimeout(100);};
 const contexts=[['root',t=>t],['details',t=>'<details open>\n<summary>Title</summary>\n\n'+t+'\n\n</details>'],['table',t=>'| Head |\n| --- |\n| '+t+' |'],['footnote',t=>'Note[^n]\n\n[^n]: '+t]];
 const cases=[];
 for(const fence of ['`','``'])for(const offset of [0,2,5])for(const inserted of ['`','``'])cases.push({id:`code-${fence.length}-${offset}-${inserted.length}`,original:fence+'ALPHA'+fence,label:'ALPHA',offset,inserted,code:true});
 for(const label of ['https://example.com/ALPHA','www.example.com/ALPHA','ALPHA@example.com','<https://example.com/ALPHA>'])for(const inserted of ['xy','_v2'])cases.push({id:`url-${cases.length}`,original:label,label:'ALPHA',offset:2,inserted});
 let passed=0;
 for(const[kind,wrap]of contexts)for(const item of cases){
  const id=`${kind}-${item.id}`;if(process.env.AUDIT_CASE&&!id.includes(process.env.AUDIT_CASE))continue;
  const result=body=>'Before\n\n'+wrap(body)+'\n\nAfter',doc=result(item.original);await reset(doc);const field=kind==='root'?editor:editor.locator('.cm-live-inner').last();await field.waitFor();
  const point=await field.evaluate(async(el,{label,offset})=>{const{EditorView}=await import('/node_modules/@codemirror/view/dist/index.js');const v=EditorView.findFromDOM(el),r=v.coordsAtPos(v.state.doc.toString().indexOf(label)+offset);return{x:r.left+.2,y:(r.top+r.bottom)/2};},item);
  await page.mouse.click(point.x,point.y);await shot(id+'-01-positioned');await page.keyboard.type(item.inserted,{delay:80});await page.waitForTimeout(100);await shot(id+'-02-edited');const after=await read();console.log(id,JSON.stringify({after}));
  const text='ALPHA'.slice(0,item.offset)+item.inserted+'ALPHA'.slice(item.offset),expectedURL=item.original.replace('ALPHA',text);
  const semantics=await field.evaluate(async(el)=>{const{EditorView}=await import('/node_modules/@codemirror/view/dist/index.js');const{marked}=await import('/node_modules/marked/lib/marked.esm.js');const source=EditorView.findFromDOM(el).state.doc.toString(),parsed=new DOMParser().parseFromString(marked.parse(source),'text/html');return{source,codes:[...parsed.querySelectorAll('code')].map(e=>e.textContent),links:[...parsed.querySelectorAll('a')].map(e=>[e.textContent,e.getAttribute('href')]),visible:EditorView.findFromDOM(el).contentDOM.innerText};});
  if(!process.env.AUDIT_BASELINE){
   const codeSource=body=>{let length=item.original.match(/^`+/)[0].length;for(const run of body.matchAll(/`+/g))length=Math.max(length,run[0].length+1);const fence='`'.repeat(length),pad=body.startsWith('`')||body.endsWith('`')?' ':'';return fence+pad+body+pad+fence;};
   if(item.code){assert.equal(after,result(codeSource(text)),id+' source');assert.deepEqual(semantics.codes,[text],id);assert.ok(semantics.visible.includes(text),id+JSON.stringify(semantics));}
   else {assert.equal(after,result(expectedURL),id);const label=expectedURL.replace(/^<|>$/g,''),href=label.startsWith('www.')?'http://'+label:label.includes('@')?'mailto:'+label:label;assert.ok(semantics.links.some(([t,url])=>t===label&&url===href),id+JSON.stringify(semantics));}
   await page.waitForTimeout(600);await page.keyboard.insertText('Q');await shot(id+'-03-follow-up');const followed=await read();
   const actualText=text.slice(0,item.offset+item.inserted.length)+'Q'+text.slice(item.offset+item.inserted.length);
   if(item.code){assert.equal(followed,result(codeSource(actualText)),id+' follow-up source');const actual=await field.evaluate(async el=>{const{EditorView}=await import('/node_modules/@codemirror/view/dist/index.js');const{marked}=await import('/node_modules/marked/lib/marked.esm.js');return new DOMParser().parseFromString(marked.parse(EditorView.findFromDOM(el).state.doc.toString()),'text/html').querySelector('code')?.textContent;});assert.equal(actual,actualText,id+' caret');}
   else assert.equal(followed,result(item.original.replace('ALPHA',actualText)),id+' caret');
   await page.keyboard.press('Control+z');assert.equal(await read(),after,id+' undo followup');await page.keyboard.press('Control+z');assert.equal(await read(),doc,id+' undo typing');await page.keyboard.press('Control+y');assert.equal(await read(),after,id+' redo');
  }
  passed++;
 }
 assert.deepEqual(errors,[]);console.log(JSON.stringify({passed,pageErrors:errors}));
}catch(error){if(page&&process.env.AUDIT_OUTPUT)await page.screenshot({path:`${process.env.AUDIT_OUTPUT}/failure.png`});throw error;}finally{await browser?.close();await server.close();}
