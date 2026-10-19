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
 const rich=page.getByLabel('隔离富文本',{exact:true});await rich.click();await rich.press('Control+a');await rich.press('Control+c');
 const app=page.frameLocator('iframe');await app.locator('#newFileButton').click();await app.locator('#hideLivePreviewButton').click();const editor=app.locator('#markdownEditor > .cm-editor'),content=editor.locator('> .cm-scroller > .cm-content');
 const read=()=>editor.evaluate(async el=>{const{EditorView}=await import('/node_modules/@codemirror/view/dist/index.js');const s=EditorView.findFromDOM(el).state;return{doc:s.doc.toString(),ranges:s.selection.ranges.map(r=>[r.anchor,r.head])};});
 const shot=async name=>{if(process.env.AUDIT_OUTPUT)await page.screenshot({path:`${process.env.AUDIT_OUTPUT}/${name}.png`});};
 const reset=async doc=>{await app.locator('[data-editor-presentation="source"]').click();await content.focus();await page.keyboard.press('Control+a');await page.keyboard.insertText(doc);await page.keyboard.press('Control+Home');await app.locator('[data-editor-presentation="live"]').click();await page.waitForTimeout(100);};
 const contexts=[['root',t=>t],['details',t=>'<details open>\n<summary>Title</summary>\n\n'+t+'\n\n</details>'],['table',t=>'| Head |\n| --- |\n| '+t+' |'],['footnote',t=>'Note[^n]\n\n[^n]: '+t.replaceAll('\n','\n    ')]];
 const url='https://example.com/path';
 const formats=[
  {name:'full-reference',text:'[ALPHA][ref] gap *OMEGA*',left:'[AL][ref]',right:'<em>GA</em>',definition:`\n\n[ref]: ${url} "Shared"`,link:['AL',url]},
  {name:'collapsed-reference',text:'[ALPHA][] gap *OMEGA*',left:'[AL][ALPHA]',right:'<em>GA</em>',definition:`\n\n[ALPHA]: ${url} "Shared"`,link:['AL',url]},
  {name:'shortcut-reference',text:'[ALPHA] gap *OMEGA*',left:'[AL][ALPHA]',right:'<em>GA</em>',definition:`\n\n[ALPHA]: ${url} "Shared"`,link:['AL',url]},
  {name:'right-reference',text:'**ALPHA** gap [OMEGA][]',left:'<strong>AL</strong>',right:'[GA][OMEGA]',definition:`\n\n[OMEGA]: ${url} "Shared"`,link:['GA',url]},
  {name:'left-auto',text:'<https://example.com/ALPHA> gap *OMEGA*',left:'[https://example.com/AL](<https://example.com/ALPHA>)',right:'<em>GA</em>',link:['https://example.com/AL','https://example.com/ALPHA']},
  {name:'right-auto',text:'**ALPHA** gap <https://example.com/OMEGA>',left:'<strong>AL</strong>',right:'[GA](<https://example.com/OMEGA>)',link:['GA','https://example.com/OMEGA']},
  {name:'email-auto',text:'<ALPHA@example.com> gap *OMEGA*',left:'[AL](<mailto:ALPHA@example.com>)',right:'<em>GA</em>',link:['AL','mailto:ALPHA@example.com']},
  {name:'punctuation-auto',text:'<https://example.com/*bold*/[a]?x=1&copy;ALPHA> gap *OMEGA*',left:'[https://example.com/&#42;bold&#42;/&#91;a&#93;?x&#61;1&#38;copy;AL](<https://example.com/*bold*/[a]?x=1&amp;copy;ALPHA>)',right:'<em>GA</em>',link:['https://example.com/*bold*/[a]?x=1&copy;AL','https://example.com/*bold*/%5Ba%5D?x=1&copy;ALPHA']},
  {name:'left-code',text:'`ALPHA` gap *OMEGA*',left:'`AL`',right:'<em>GA</em>',plain:true},
  {name:'right-code',text:'**ALPHA** gap `OMEGA`',left:'<strong>AL</strong>',right:'`GA`'},
  {name:'paragraphs',text:'**ALPHA**\n\nMiddle\n\n*OMEGA*',left:'<strong>AL</strong>',right:'<em>GA</em>',multiline:true},
 ];let passed=0;
 for(const[kind,wrap]of contexts)for(const scenario of formats)for(const reverse of [false,true])for(const action of ['paste','delete']){
  if(kind==='table'&&scenario.multiline)continue;
  const id=`${kind}-${scenario.name}-${reverse?'backward':'forward'}-${action}`;if(process.env.AUDIT_CASE&&!id.includes(process.env.AUDIT_CASE))continue;
  const suffix=scenario.definition||'',doc='Before\n\n'+wrap(scenario.text)+'\n\nAfter'+suffix;await reset(doc);const field=kind==='root'?editor:editor.locator('.cm-live-inner').last();await field.waitFor();
  const points=await field.evaluate(async el=>{const{EditorView}=await import('/node_modules/@codemirror/view/dist/index.js');const v=EditorView.findFromDOM(el),source=v.state.doc.toString();return[source.indexOf('ALPHA')+2,source.indexOf('OMEGA')+3].map(at=>{const r=v.coordsAtPos(at);return{x:r.left+.2,y:(r.top+r.bottom)/2};});});if(reverse)points.reverse();
  await page.mouse.move(points[0].x,points[0].y);await page.mouse.down();await page.mouse.move(points[1].x,points[1].y,{steps:15});await page.mouse.up();await shot(id+'-01-selected');const before=await read();assert.ok(before.ranges[0][0]!==before.ranges[0][1]);await page.keyboard.press(action==='delete'?'Backspace':'Control+v');await page.waitForTimeout(150);await shot(id+'-02-result');const after=await read();console.log(id,JSON.stringify({before,after}));
  if(!process.env.AUDIT_BASELINE){
   const insert=action==='delete'?'':scenario.plain?'RICH TEXT':'**RICH** *TEXT*',expected='Before\n\n'+wrap(scenario.left+insert+scenario.right)+'\n\nAfter'+suffix;
   assert.equal(after.doc,expected);
   if(scenario.link){const visible=await field.evaluate(async el=>{const{EditorView}=await import('/node_modules/@codemirror/view/dist/index.js');return EditorView.findFromDOM(el).contentDOM.innerText;});assert.ok(visible.includes(scenario.link[0]),`${id}: visible label ${JSON.stringify(visible)}`);}
   // Parse the actual editable body with its inherited definitions. Bare marked
   // does not implement our footnote extension and mistakes [^n]: for a link definition.
   if(scenario.link){const links=await field.evaluate(async(el,suffix)=>{const{EditorView}=await import('/node_modules/@codemirror/view/dist/index.js');const{marked}=await import('/node_modules/marked/lib/marked.esm.js');const html=marked.parse(EditorView.findFromDOM(el).state.doc.toString()+suffix);const parsed=new DOMParser().parseFromString(html,'text/html');return [...parsed.querySelectorAll('a')].map(a=>[a.textContent,a.getAttribute('href')]);},kind==='root'?'':suffix);assert.ok(links.some(([label,url])=>label===scenario.link[0]&&url===scenario.link[1]),JSON.stringify(links));}
   await page.waitForTimeout(600);await page.keyboard.insertText('Q');await shot(id+'-03-follow-up');assert.equal((await read()).doc,'Before\n\n'+wrap(scenario.left+insert+'Q'+scenario.right)+'\n\nAfter'+suffix);
   await page.keyboard.press('Control+z');assert.equal((await read()).doc,expected);await page.keyboard.press('Control+z');assert.equal((await read()).doc,doc);await page.keyboard.press('Control+y');assert.equal((await read()).doc,expected);
  }
  passed++;
 }
 assert.deepEqual(errors,[]);console.log(JSON.stringify({passed,pageErrors:errors}));
}catch(error){if(page&&process.env.AUDIT_OUTPUT)await page.screenshot({path:`${process.env.AUDIT_OUTPUT}/failure.png`});throw error;}finally{await browser?.close();await server.close();}
