// Observe every frame and scroll write, not just the final position. Native
// non-cancelable IME may be contained before paint, but no visible jump is allowed.
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import {readFile} from 'node:fs/promises';
import path from 'node:path';
import {createServer} from 'vite';
const {chromium}=createRequire(import.meta.url)(process.env.PLAYWRIGHT_MODULE||'playwright');
const server=await createServer({root:fileURLToPath(new URL('..',import.meta.url)),plugins:process.env.AUDIT_DIST?[{
 name:'production-assets',configureServer(server){server.middlewares.use(async(req,res,next)=>{
  const url=(req.url||'').split('?')[0];if(url!=='/'&&!url.startsWith('/assets/'))return next();
  try{const file=path.resolve(process.env.AUDIT_DIST,url==='/'?'index.html':'.'+url);
   if(!file.startsWith(path.resolve(process.env.AUDIT_DIST)+path.sep))return next();
   res.setHeader('Content-Type',url==='/'?'text/html':url.endsWith('.js')?'text/javascript':url.endsWith('.css')?'text/css':'application/octet-stream');res.end(await readFile(file));
  }catch{next();}
 });}
}]:[],server:{host:'127.0.0.1',port:0,watch:null,hmr:false},logLevel:'error'});
let browser,page;
try{
 await server.listen();browser=await chromium.launch({headless:true,executablePath:process.env.BROWSER_EXECUTABLE});
 page=await browser.newPage({viewport:{width:1500,height:950}});page.setDefaultTimeout(12000);
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.addInitScript(()=>localStorage.setItem('editorLayout','editor-left'));
 await page.route('**/*',route=>new URL(route.request().url()).hostname==='127.0.0.1'?route.continue():route.abort());
 await page.goto(server.resolvedUrls.local[0]+'tests/fixtures/app-drag-audit.html');const app=page.frameLocator('iframe');
 await app.getByRole('button',{name:'新建文档',exact:true}).click();
 if(process.env.AUDIT_THEME==='dark')await app.locator('#colorModeButton').click();
 const root=app.locator('#markdownEditor > .cm-editor'),content=root.locator('> .cm-scroller > .cm-content');
 const read=()=>root.evaluate(async el=>{const{EditorView}=await import('/node_modules/@codemirror/view/dist/index.js');return EditorView.findFromDOM(el).state.doc.toString();});
 const cdp=await page.context().newCDPSession(page);
 const prefix='# Heading\n\n| Field | Description |\n| --- | --- |\n'+Array.from({length:14},(_,i)=>`| ${i} | Text[^n] |`).join('\n')+'\n\n'+'Paragraph\n\n'.repeat(30);
 const wrap={plain:b=>'```text\n'+b+'\n```',quote:b=>('```text\n'+b+'\n```').split('\n').map(l=>'> '+l).join('\n'),list:b=>'- Item\n\n'+('```text\n'+b+'\n```').split('\n').map(l=>'  '+l).join('\n'),details:b=>'<details open>\n<summary>Section</summary>\n\n```text\n'+b+'\n```\n\n</details>',footnote:b=>'Note[^code]\n\n[^code]: Code\n\n'+('```text\n'+b+'\n```').split('\n').map(l=>'    '+l).join('\n'),indented:b=>b.split('\n').map(l=>'    '+l).join('\n')};
 let cases=0;
 for(const kind of Object.keys(wrap))for(const count of [3,80])for(const edge of ['top','middle','bottom']){
  const body=Array.from({length:count},(_,i)=>`ROW_${i} 中文 code content`).join('\n');
  const source=prefix+wrap[kind](body)+'\n\n## FOLLOWING\n\n'+'After\n\n'.repeat(25)+'[^n]: unchanged note';
  await app.getByRole('button',{name:'源码',exact:true}).click();await content.focus();await page.keyboard.press('Control+a');await page.keyboard.insertText(source);
  await root.evaluate(async(el,at)=>{const{EditorView}=await import('/node_modules/@codemirror/view/dist/index.js');EditorView.findFromDOM(el).dispatch({selection:{anchor:at},scrollIntoView:true});},source.indexOf('ROW_0'));
  await app.getByRole('button',{name:'即时渲染',exact:true}).click();
  const inner=root.locator('.cm-live-code .cm-content').first();await inner.waitFor();
  const line=edge==='top'?1:edge==='middle'?Math.ceil(count/2):count;
  await inner.evaluate(async(el,line)=>{const{EditorView}=await import('/node_modules/@codemirror/view/dist/index.js');const v=EditorView.findFromDOM(el);v.dispatch({selection:{anchor:v.state.doc.line(line).from+6}});},line);
  // Put the target line near the bottom edge. Typing and Enter must not trigger
  // automatic reveal, even if the next line moves outside the visible area.
  await root.evaluate(async(el)=>{const{EditorView}=await import('/node_modules/@codemirror/view/dist/index.js');const v=EditorView.findFromDOM(el),inner=EditorView.findFromDOM(el.querySelector('.cm-live-code .cm-content'));const r=inner.coordsAtPos(inner.state.selection.main.head),p=v.scrollDOM.getBoundingClientRect();v.scrollDOM.scrollTop+=r.top-(p.bottom-45);});
  await page.waitForTimeout(180);
  const xy=await inner.evaluate(async el=>{const{EditorView}=await import('/node_modules/@codemirror/view/dist/index.js');const v=EditorView.findFromDOM(el),r=v.coordsAtPos(v.state.selection.main.head);return{x:r.left,y:(r.top+r.bottom)/2};});
  const base=await root.evaluate(el=>{
   const scroller=el.querySelector(':scope > .cm-scroller'),block=el.querySelector('.cm-live-code');
   window.codeScrollTrace={scroller,block,frames:[],writes:[],base:{top:block.getBoundingClientRect().top,scroll:scroller.scrollTop}};
   if(!window.codeScrollHook){const d=Object.getOwnPropertyDescriptor(Element.prototype,'scrollTop');Object.defineProperty(Element.prototype,'scrollTop',{...d,set(value){const t=window.codeScrollTrace;if(t&&this===t.scroller)t.writes.push({old:d.get.call(this),value,stack:new Error().stack});d.set.call(this,value);}});window.codeScrollHook=true;}
   const tick=()=>{const t=window.codeScrollTrace;if(!t)return;t.frames.push({top:t.block.getBoundingClientRect().top,scroll:t.scroller.scrollTop});t.frame=requestAnimationFrame(tick);};tick();return window.codeScrollTrace.base;
  });
  await page.mouse.click(xy.x,xy.y);await page.keyboard.type('abc',{delay:30});
  await cdp.send('Input.imeSetComposition',{text:'zhong',selectionStart:5,selectionEnd:5});await page.waitForTimeout(40);await cdp.send('Input.insertText',{text:'中'});
  await page.keyboard.press('Enter');await page.keyboard.insertText('pasted\nline');await page.keyboard.press('Backspace');await page.waitForTimeout(40);
  await cdp.send('Input.imeSetComposition',{text:'jie',selectionStart:3,selectionEnd:3});await cdp.send('Input.insertText',{text:'界'});await page.waitForTimeout(180);
  const trace=await root.evaluate(()=>{const t=window.codeScrollTrace;cancelAnimationFrame(t.frame);window.codeScrollTrace=null;return{frames:t.frames,writes:t.writes};});
  const name=`${kind}-${count}-${edge}`;
  assert.ok(trace.frames.length>2);
  assert.ok(trace.frames.every(f=>Math.abs(f.top-base.top)<2&&Math.abs(f.scroll-base.scroll)<2),name+': frame moved '+JSON.stringify({base,...trace}));
  assert.ok(trace.writes.every(w=>Math.abs(w.old-w.value)<2||Math.abs(w.value-base.scroll)<2),name+': scroll write '+JSON.stringify(trace.writes));
  const result=await read();assert.ok(result.includes('abc中'));assert.ok(result.includes('## FOLLOWING'));assert.equal((result.match(/```/g)||[]).length,(source.match(/```/g)||[]).length);
  const inside=await inner.innerText();assert.ok(inside.includes('pasted\nlin'),name+': input stays in code');
  if(count===80&&edge==='bottom'){
   const beforeWheel=await root.evaluate(el=>el.querySelector(':scope > .cm-scroller').scrollTop);
   const box=await root.boundingBox();await page.mouse.move(box.x+30,box.y+120);await page.mouse.wheel(0,180);await page.waitForTimeout(150);
   assert.ok((await root.evaluate(el=>el.querySelector(':scope > .cm-scroller').scrollTop))>beforeWheel+30,name+': manual wheel scrolling remains available');
  }
  // Undo/redo still restore exact Markdown; navigation and wheel scrolling are
  // intentional and must not be locked by the typing guard.
  for(let undo=0;undo<10&&(await read())!==source;undo++)await page.keyboard.press('Control+z');
  assert.equal(await read(),source,name+': exact undo');
  await page.keyboard.press('Control+Shift+KeyZ');assert.notEqual(await read(),source);
  if(count===80&&edge==='bottom'){
   await inner.focus();await page.keyboard.press('Control+Home');await page.waitForTimeout(100);
   const visible=await root.evaluate(async el=>{const{EditorView}=await import('/node_modules/@codemirror/view/dist/index.js');const inner=EditorView.findFromDOM(el.querySelector('.cm-live-code .cm-content')),p=el.querySelector(':scope > .cm-scroller').getBoundingClientRect(),r=inner.coordsAtPos(0);return r.top>=p.top-2&&r.bottom<=p.bottom+2;});
   assert.ok(visible,name+': explicit keyboard navigation remains available');
  }
  console.log('PASS '+name);cases++;
 }
 assert.deepEqual(errors,[]);
 if(process.env.AUDIT_OUTPUT)await page.screenshot({path:process.env.AUDIT_OUTPUT+'/code-scroll-'+(process.env.AUDIT_THEME||'light')+'.png'});
 console.log(`PASS ${cases} code scroll cases`);
}catch(error){if(page&&process.env.AUDIT_OUTPUT)await page.screenshot({path:process.env.AUDIT_OUTPUT+'/code-scroll-failure.png'});throw error;}
finally{await browser?.close();await server.close();}
