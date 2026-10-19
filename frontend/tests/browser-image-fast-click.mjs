// Isolated synthetic documents only. Real pointer events; no forced click,
// dispatchEvent or waiting for the toolbar's entrance animation to finish.
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import {createServer} from 'vite';
const{chromium}=createRequire(import.meta.url)(process.env.PLAYWRIGHT_MODULE||'playwright');
const server=await createServer({root:fileURLToPath(new URL('..',import.meta.url)),server:{host:'127.0.0.1',port:0,watch:null,hmr:false},logLevel:'error'});
let browser,page;
try{
 await server.listen();browser=await chromium.launch({headless:true,executablePath:process.env.BROWSER_EXECUTABLE||undefined});
 page=await browser.newPage({viewport:{width:Number(process.env.AUDIT_WIDTH)||1500,height:1100},reducedMotion:process.env.AUDIT_REDUCED_MOTION?'reduce':'no-preference'});page.setDefaultTimeout(10000);const errors=[],results=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto(server.resolvedUrls.local[0]+'tests/fixtures/app-drag-audit.html');const app=page.frameLocator('iframe');await app.getByRole('button',{name:'新建文档',exact:true}).click();
 const editor=app.locator('#markdownEditor > .cm-editor'),content=editor.locator('> .cm-scroller > .cm-content');
 const read=()=>editor.evaluate(async el=>{const{EditorView}=await import('/node_modules/@codemirror/view/dist/index.js');const{undoDepth}=await import('/node_modules/@codemirror/commands/dist/index.js');const s=EditorView.findFromDOM(el).state;return{source:s.doc.toString(),undo:undoDepth(s)};});
 const shot=async name=>{if(process.env.AUDIT_OUTPUT)await page.screenshot({path:`${process.env.AUDIT_OUTPUT}/${name}.png`});};
 const ref=server.resolvedUrls.local[0]+'tests/fixtures/sample-image.svg',picture=`<img src="${ref}" width="200" alt="Photo">`;
 const scopes=[['plain',picture],['footnote','Before[^n]\n\n[^n]: Intro\n    \n    '+picture+'\n    \n    Tail'],['table','| Photo | Text |\n| --- | --- |\n| '+picture+' | Cell |'],['details','<details open>\n<summary>More</summary>\n\n'+picture+'\n\n</details>'],['row',`![One](${ref}) ![Two](${ref})`]];
 for(const[kind,body]of scopes)for(const target of ['center','top-edge'])for(const delay of [0,40,100]){
  const name=`${kind}-${target}-${delay}`,source='# Fast image actions\n\n'+body+'\n\nAfter';
  await app.getByRole('button',{name:'源码',exact:true}).click();await content.focus();await page.keyboard.press('Control+a');await page.keyboard.insertText(source);
  for(let i=0;i<100&&(await read()).source!==source;i++)await page.waitForTimeout(20);assert.equal((await read()).source,source);
  await page.keyboard.press('Control+Home');await app.getByRole('button',{name:'即时渲染',exact:true}).click();
  const root=editor.locator('.cm-embedded-image').first(),button=root.locator('[data-image-action="source"]');await root.waitFor({state:'visible'});
  await root.locator('img').first().waitFor({state:'visible'});
  for(let i=0;i<100&&!await root.locator('img').first().evaluate(img=>img.complete&&img.naturalWidth>0);i++)await page.waitForTimeout(20);
  assert.ok(await root.locator('img').first().evaluate(img=>img.complete&&img.naturalWidth>0));
  await page.mouse.move(5,5);await page.waitForTimeout(180);assert.equal(await root.evaluate(el=>el.matches(':focus-within')),false);
  const before=await read(),box=await root.locator('img').first().boundingBox();await page.mouse.move(box.x+box.width/2,box.y+box.height/2);
  // Capture the first visible frame, not a settled frame. The chosen point
  // remains the user's target while their pointer moves and presses down.
  const point=await button.evaluate(async(button,target)=>{
   for(let i=0;i<20;i++){if(Number(getComputedStyle(button.parentElement).opacity)>0)break;await new Promise(requestAnimationFrame);}
   const r=button.getBoundingClientRect();return{x:r.x+r.width/2,y:r.y+(target==='center'?r.height/2:1),top:r.top,opacity:getComputedStyle(button.parentElement).opacity};
  },target);
  await page.mouse.move(point.x,point.y);if(delay)await page.waitForTimeout(delay);
  const hit=await button.evaluate((button,p)=>{const r=button.getBoundingClientRect(),t=document.elementFromPoint(p.x,p.y);return{hit:t===button||button.contains(t),top:r.top,opacity:getComputedStyle(button.parentElement).opacity,tag:t?.tagName,action:t?.dataset.imageAction};},point);
  await page.mouse.down();await page.mouse.up();await page.waitForTimeout(30);
  const opened=await button.getAttribute('aria-expanded')==='true';results.push({name,point,hit,opened});console.log(JSON.stringify(results.at(-1)));
  if(!opened)await shot(name+'-missed');
  if(opened){
   await shot(name+'-opened');await page.mouse.move(5,5);
   // Allow layout measurement of expanded source, not an entrance animation.
   await button.evaluate(el=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
   assert.equal(await button.getAttribute('aria-expanded'),'true');assert.equal(await button.isVisible(),true);
   const close=await button.boundingBox();await page.mouse.click(close.x+close.width/2,close.y+close.height/2);
   assert.equal(await button.getAttribute('aria-expanded'),'false');await shot(name+'-returned');
  }
  assert.deepEqual(await read(),before,name+' source/history unchanged');
 }
 assert.deepEqual(errors,[]);
 if(!process.env.AUDIT_BASELINE){
  assert.ok(results.every(item=>item.hit.hit&&item.opened),'Every visible target receives its first pointer click');
  assert.ok(results.every(item=>Math.abs(item.point.top-item.hit.top)<.1),'Fade does not move a visible target');
 }
 console.log(JSON.stringify({passed:results.filter(item=>item.hit.hit&&item.opened).length,total:results.length,errors}));
}catch(error){if(page&&process.env.AUDIT_OUTPUT)await page.screenshot({path:`${process.env.AUDIT_OUTPUT}/failure.png`});throw error;}
finally{await browser?.close();await server.close();}
