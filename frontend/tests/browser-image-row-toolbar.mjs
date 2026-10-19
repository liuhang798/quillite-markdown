// Local isolated UI only. Never connect to a user profile/document.
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import {createServer} from 'vite';
import {editorImageItems, imageDimensions} from '../src/image-layout.js';
const {chromium}=createRequire(import.meta.url)(process.env.PLAYWRIGHT_MODULE || 'playwright');
const server=await createServer({root:fileURLToPath(new URL('..',import.meta.url)),server:{host:'127.0.0.1',port:0,watch:null,hmr:false},logLevel:'error'});
let browser,page;
try {
  await server.listen();browser=await chromium.launch({headless:true,executablePath:process.env.BROWSER_EXECUTABLE || undefined});
  page=await browser.newPage({viewport:{width:1700,height:1000}});page.setDefaultTimeout(8000);
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto(server.resolvedUrls.local[0]+'tests/fixtures/app-drag-audit.html');
  const app=page.frameLocator('iframe');await app.getByRole('button',{name:'新建文档',exact:true}).click();
  const ref=server.resolvedUrls.local[0]+'tests/fixtures/sample-image.svg';
  const read=()=>app.locator('#markdownEditor > .cm-editor').evaluate(async el=>{const {EditorView}=await import('/node_modules/@codemirror/view/dist/index.js');return EditorView.findFromDOM(el).state.doc.toString();});
  const shot=async name=>{if(process.env.AUDIT_OUTPUT)await page.screenshot({path:`${process.env.AUDIT_OUTPUT}/${name}.png`});};
  const hit=async root=> {
    await root.evaluate(el=>Promise.all(el.getAnimations({subtree:true}).map(a=>a.finished)));
    const visible=await root.locator('button,select,input:not(:disabled)').evaluateAll(controls=>controls.filter(b=>b.checkVisibility({checkVisibilityCSS:true})).map(b=>{
      const r=b.getBoundingClientRect(),target=document.elementFromPoint(r.x+r.width/2,r.y+r.height/2);
      const chain=el=>{const result=[];for(;el;el=el.parentElement){const s=getComputedStyle(el);result.push([el.className,s.position,s.zIndex,s.transform]);}return result;};
      return{text:b.textContent||b.getAttribute('aria-label'),disabled:b.disabled,hit:target===b||b.contains(target),occluder:target?.className,...(target!==b&&!b.contains(target)?{buttonParents:chain(b),targetParents:chain(target)}:{})};
    }));
    assert.ok(visible.every(b=>b.disabled||b.hit),JSON.stringify(visible));
  };
  for(const width of (process.env.AUDIT_WIDTH?[Number(process.env.AUDIT_WIDTH)]:[1700,1100,820])) for(const count of [2,6]) for(const inTable of [false,true]) {
  await page.setViewportSize({width,height:1000});
  const name=`${width}-${count}-${inTable?'table':'plain'}`;
  const row=Array.from({length:count},(_,i)=>`![图片${i+1}](${ref})`).join(' ');
  const source=`前文\n\n${inTable?'| 图片 | 对照 |\n| --- | --- |\n| '+row+' | 保留 |':row}\n\n后文`;
  await app.getByRole('button',{name:'源码',exact:true}).click();await app.getByRole('textbox').fill(source);await app.getByRole('button',{name:'即时渲染',exact:true}).click();
  const root=app.locator('.cm-embedded-image').first();await root.locator('img').first().waitFor({state:'visible'});
  const before=await root.boundingBox();
  await root.locator('.cm-image-card').first().hover();
  await hit(root);await shot(`${name}-01-hover`);
  const after=await root.boundingBox();assert.ok(Math.abs(before.height-after.height)<1,'Hover must not move document layout');
  const last=root.locator('.cm-image-card').last(),picker=root.getByLabel('操作图片',{exact:true});
  await last.hover();assert.equal(await picker.inputValue(),String(count-1));assert.equal(await read(),source);
  await root.locator('[data-image-action="right"]:visible').click();
  const aligned=editorImageItems(await read());assert.equal(aligned[count-1].alignment,'right');assert.ok(aligned.slice(0,-1).every(i=>i.alignment==='center'));
  await page.keyboard.press('Control+z');assert.equal(await read(),source);
  await last.click();await last.press('Enter');assert.equal(await picker.evaluate(el=>el===document.activeElement),true);
  await picker.press('ArrowUp');assert.equal(await picker.inputValue(),String(count-2));assert.equal(await read(),source);
  for(let i=0;i<4;i++)await page.keyboard.press('Tab');
  assert.equal(await root.locator('[data-image-action="size"]:visible').evaluate(el=>el===document.activeElement),true);
  await page.keyboard.press('Space');
  const panel=root.locator('.cm-image-item-tools:not([hidden])');
  assert.equal(await panel.getByLabel('宽度',{exact:true}).evaluate(el=>el===document.activeElement),true);
  await panel.getByLabel('宽度',{exact:true}).fill('55');await panel.getByLabel('保持比例',{exact:true}).uncheck();await panel.getByLabel('高度',{exact:true}).fill('30');
  await hit(root);await shot(`${name}-02-size`);
  await panel.getByRole('button',{name:'应用尺寸',exact:true}).click();
  const sized=editorImageItems(await read());assert.deepEqual(imageDimensions(sized[count-2]),{width:'55',height:'30'});assert.ok(sized.filter((_,i)=>i!==count-2).every(i=>!imageDimensions(i).width));
  await page.keyboard.press('Control+z');assert.equal(await read(),source);
  await root.hover();await root.locator('[data-image-action="source"]').click();
  await page.mouse.move(0,0);assert.equal(await root.locator('[data-image-action="source"]').isVisible(),true);
  await root.locator('[data-image-action="source"]').press('Enter');assert.equal(await read(),source);
  await last.click();await last.press('Enter');await page.keyboard.press('Escape');assert.equal(await last.evaluate(el=>el===document.activeElement),true);
  await last.press('Escape');await page.mouse.move(0,0);
  await root.locator(':scope > .cm-image-tools').waitFor({state:'hidden'});
  await root.hover();await page.setViewportSize({width:width+20,height:1000});await hit(root);
  console.log(`${name}: non-overlap, image targeting, keyboard size/escape, exact undo, source return, resize passed`);
  }
  // A focused popup must not remain floating over unrelated content after a
  // wheel scroll moves its owning image outside the visible editor.
  await page.setViewportSize({width:1100,height:800});
  const longSource=`![甲](${ref}) ![乙](${ref})\n\n`+Array.from({length:100},(_,i)=>`段落 ${i}\n\n`).join('');
  await app.getByRole('button',{name:'源码',exact:true}).click();await app.getByRole('textbox').fill(longSource);await page.keyboard.press('Control+Home');await app.getByRole('button',{name:'即时渲染',exact:true}).click();
  const scrollRoot=app.locator('.cm-embedded-image').first();await scrollRoot.locator('img').first().waitFor({state:'visible'});
  await scrollRoot.locator('.cm-image-card').last().click();await scrollRoot.locator('.cm-image-card').last().press('Enter');
  const viewport=await app.locator('#markdownEditor > .cm-editor > .cm-scroller').boundingBox();
  await page.mouse.move(viewport.x+viewport.width-15,viewport.y+viewport.height-50);await page.mouse.wheel(0,800);
  await scrollRoot.locator(':scope > .cm-image-tools').waitFor({state:'hidden'});
  await shot('scroll-03-hidden');assert.equal(await read(),longSource);
  console.log('scroll: focused image controls hide when the owner leaves the viewport');
  assert.deepEqual(errors,[]);
}catch(error){if(page&&process.env.AUDIT_OUTPUT)await page.screenshot({path:`${process.env.AUDIT_OUTPUT}/failure.png`});throw error;}
finally{await browser?.close();await server.close();}
