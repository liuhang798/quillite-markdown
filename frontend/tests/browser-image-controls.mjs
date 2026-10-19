import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import {createServer} from 'vite';
const {chromium}=createRequire(import.meta.url)(process.env.PLAYWRIGHT_MODULE || 'playwright');
const server=await createServer({root:fileURLToPath(new URL('..',import.meta.url)),server:{host:'127.0.0.1',port:0,watch:null,hmr:false},logLevel:'error'});
let browser,page;
try {
  await server.listen();browser=await chromium.launch({headless:true,executablePath:process.env.BROWSER_EXECUTABLE || undefined});
  page=await browser.newPage({viewport:{width:1400,height:1000}});
  page.setDefaultTimeout(8000);
  const errors=[],results=[];page.on('pageerror',e=>errors.push(e.message));
  await page.route('**/*',r=>new URL(r.request().url()).hostname==='127.0.0.1'?r.continue():r.abort());
  await page.goto(server.resolvedUrls.local[0]+'tests/fixtures/embedded-image-audit.html');
  await page.waitForFunction(()=>!!window.imageAudit);
  const ref=await page.evaluate(()=>imageAudit.view.state.field(imageAudit.imagePreviewField).items[0].images[0].ref);
  await page.goto(server.resolvedUrls.local[0]+'tests/fixtures/app-drag-audit.html');
  const app=page.frameLocator('iframe');await app.locator('body').evaluate(()=>import('/src/main.js'));
  await app.getByRole('button',{name:'新建文档',exact:true}).click();
  const read=()=>app.locator('#markdownEditor > .cm-editor').evaluate(async el=>{
    const {EditorView}=await import('/node_modules/@codemirror/view/dist/index.js');
    return EditorView.findFromDOM(el).state.doc.toString();
  });
  const pointerClick=async locator=>{
    await locator.evaluate(el=>Promise.all(el.closest('.cm-embedded-image').getAnimations({subtree:true}).map(a=>a.finished)));
    const point=await locator.evaluate(el=>{const r=el.getBoundingClientRect(),x=r.x+r.width/2,y=r.y+r.height/2,t=document.elementFromPoint(x,y);return{x,y,hit:el===t||el.contains(t)};});
    assert.equal(point.hit,true,'Visible image action must own its pointer target');
    await page.mouse.click(point.x,point.y);
  };
  for(const width of [1400,1100,820]) {
    await page.setViewportSize({width,height:1000});
    await app.getByRole('button',{name:'源码',exact:true}).click();
    const source=`# 图片操作\n\n<img src="${ref}" width="200" alt="操作测试">\n\n图片下方正文`;
    await app.getByRole('textbox').fill(source);await app.getByRole('button',{name:'即时渲染',exact:true}).click();
    const image=app.locator('.cm-embedded-image').first(),button=image.locator('[data-image-action="source"]');
    await image.hover();
    await button.evaluate(el=>Promise.all(el.parentElement.getAnimations().map(a=>a.finished)));
    const hit=await button.evaluate(el=>{const r=el.getBoundingClientRect(),target=document.elementFromPoint(r.x+r.width/2,r.y+r.height/2);return{x:r.x+r.width/2,y:r.y+r.height/2,hit:target?.outerHTML.slice(0,180),matches:el===target||el.contains(target)};});
    if(process.env.AUDIT_OUTPUT) await page.screenshot({path:`${process.env.AUDIT_OUTPUT}/hover-${width}.png`});
    await page.mouse.click(hit.x,hit.y);
    const opened=await button.getAttribute('aria-expanded')==='true';
    results.push({width,hit,opened});console.log(JSON.stringify(results.at(-1)));
    if(opened) {
      await page.mouse.move(5,5);assert.equal(await button.isVisible(),true);
      await button.evaluate(el=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
      assert.equal(await button.evaluate(el=>{const b=el.getBoundingClientRect(),v=el.closest('.cm-scroller').getBoundingClientRect();return b.top>=v.top&&b.bottom<=v.bottom;}),true,'Return control must be fully inside the visible editor viewport');
      if(width===1100&&process.env.AUDIT_OUTPUT) await page.screenshot({path:`${process.env.AUDIT_OUTPUT}/source-open.png`});
      await button.press('Enter');assert.equal(await image.locator('.cm-image-cards').isVisible(),true);
    }
    assert.ok(await read()===source,'Source toggle must not mutate document');
    await image.evaluate(el=>new Promise(resolve=>{let last='',same=0;const tick=()=>{const r=el.getBoundingClientRect(),key=[r.x,r.y,r.width,r.height].join();same=key===last?same+1:0;last=key;if(same>=4)resolve();else requestAnimationFrame(tick);};requestAnimationFrame(tick);}));
    await image.hover();
    await pointerClick(image.locator('[data-image-action="right"]'));
    assert.equal(await image.evaluate(el=>el.scrollTop),0,'Image wrapper must not scroll when focusing an overlay');
    assert.match(await read(),/margin-left:auto/);
    await app.getByLabel('Markdown 编辑器',{exact:true}).press('Control+z');assert.ok(await read()===source,'Alignment undo');
    await image.hover();await pointerClick(image.locator('[data-image-action="size"]'));
    await image.getByLabel('宽度',{exact:true}).fill('80');
    await image.getByLabel('保持比例',{exact:true}).uncheck();
    await image.getByLabel('高度',{exact:true}).fill('40');
    await pointerClick(image.getByRole('button',{name:'应用尺寸',exact:true}));
    assert.match(await read(),/width="80"/);assert.match(await read(),/height="40"/);
    await app.getByRole('article').locator('img[width="80"][height="40"]').waitFor({state:'visible'});
    if(process.env.AUDIT_OUTPUT) await page.screenshot({path:`${process.env.AUDIT_OUTPUT}/size-${width}.png`});
    const resized=await read();await image.hover();await pointerClick(button);
    assert.equal(await button.getAttribute('aria-expanded'),'true');await button.press('Enter');assert.ok(await read()===resized,'Small-image source round trip');
    await app.getByLabel('Markdown 编辑器',{exact:true}).press('Control+z');assert.ok(await read()===source,'Size undo');
    await app.getByRole('button',{name:'源码',exact:true}).click();
    // Long Base64 lines virtualize the rest of the document out of the DOM.
    const actual=await read();
    if(actual!==source) console.log(JSON.stringify({actual:actual.replaceAll(ref,'[image]'),expected:source.replaceAll(ref,'[image]')}));
    assert.ok(actual===source,'Source toggle must not mutate image alignment or document');
  }
  for(const count of [2,6]) {
    await page.setViewportSize({width:1100,height:1000});
    await app.getByRole('button',{name:'源码',exact:true}).click();
    const source=Array.from({length:count},(_,i)=>`![图片${i+1}](${ref})`).join(' ')+'\n\n下方正文';
    await app.getByRole('textbox').fill(source);await app.getByRole('button',{name:'即时渲染',exact:true}).click();
    const root=app.locator('.cm-embedded-image').first();await root.hover();
    await root.evaluate(el=>Promise.all(el.getAnimations({subtree:true}).map(a=>a.finished)));
    if(process.env.AUDIT_OUTPUT)await page.screenshot({path:`${process.env.AUDIT_OUTPUT}/group-${count}.png`});
    await pointerClick(root.locator('[data-image-action="source"]'));
    assert.equal(await root.locator('[data-image-action="source"]').getAttribute('aria-expanded'),'true');
    await root.locator('[data-image-action="source"]').press('Enter');assert.ok(await read()===source);
    const last=root.locator('.cm-image-card').last();await last.hover();
    await pointerClick(root.locator('[data-image-action="right"]:visible'));assert.match(await read(),/margin-left:auto/);
    await app.getByLabel('Markdown 编辑器',{exact:true}).press('Control+z');assert.ok(await read()===source,'Grouped alignment undo');
    await root.hover();await pointerClick(root.locator('[data-image-action="split"]'));
    assert.equal((await read()).split(ref).length-1,count,'Split keeps every image, including virtualized offscreen widgets');
    assert.equal(await app.locator('.cm-embedded-image.is-image-row').count(),0);
    await app.getByLabel('Markdown 编辑器',{exact:true}).press('Control+z');assert.ok(await read()===source,'Split undo');
    console.log(JSON.stringify({group:count,sourceRoundTrip:true,alignmentAndSplitUndo:true}));
  }
  assert.deepEqual(errors,[]);assert.ok(results.every(r=>r.hit.matches&&r.opened),'All source buttons must receive one real pointer click');
} catch(error) {
  if(page) console.log('FAILURE_GEOMETRY',await page.frameLocator('iframe').locator('.cm-embedded-image').first().evaluate(el=>({scrollTop:el.scrollTop,hover:el.matches(':hover'),focus:el.matches(':focus-within'),active:document.activeElement?.outerHTML.slice(0,150),elements:[el,...el.querySelectorAll('.cm-image-tools,.cm-image-frame,img')].map(e=>({class:e.className,rect:e.getBoundingClientRect().toJSON(),overflow:getComputedStyle(e).overflow,scroll:e.scrollTop}))})).catch(()=>null));
  if(process.env.AUDIT_OUTPUT&&page) await page.screenshot({path:`${process.env.AUDIT_OUTPUT}/failure.png`});
  throw error;
} finally {await browser?.close();await server.close();}
