// Isolated synthetic documents only. UI drives every document mutation.
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import {createServer} from 'vite';
const {chromium}=createRequire(import.meta.url)(process.env.PLAYWRIGHT_MODULE||'playwright');
const server=await createServer({root:fileURLToPath(new URL('..',import.meta.url)),server:{host:'127.0.0.1',port:0,watch:null,hmr:false},logLevel:'error'});
let browser,page;
try {
  await server.listen();browser=await chromium.launch({headless:true,executablePath:process.env.BROWSER_EXECUTABLE||undefined});
  page=await browser.newPage({viewport:{width:1500,height:1000}});page.setDefaultTimeout(8000);const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto(server.resolvedUrls.local[0]+'tests/fixtures/app-drag-audit.html');const app=page.frameLocator('iframe');await app.getByRole('button',{name:'新建文档',exact:true}).click();
  const editor=app.locator('#markdownEditor > .cm-editor'),content=editor.locator('> .cm-scroller > .cm-content');
  const read=()=>editor.evaluate(async el=>{const{EditorView}=await import('/node_modules/@codemirror/view/dist/index.js');const s=EditorView.findFromDOM(el).state;return{doc:s.doc.toString(),ranges:s.selection.ranges.map(r=>({anchor:r.anchor,head:r.head}))};});
  const shot=async name=>{if(process.env.AUDIT_OUTPUT){await page.waitForTimeout(100);await page.screenshot({path:`${process.env.AUDIT_OUTPUT}/${name}.png`});}};
  const ref=server.resolvedUrls.local[0]+'tests/fixtures/sample-image.svg';
  for(const setext of [false,true])for(const[kind,media,defs]of [['formula','$x^2$',''],['image',`<img src="${ref}" width="50" alt="sample">`,''],['footnote','[^note]','\n\n[^note]: Definition']])for(const[style,open,close,css,selector]of [['bold','**','**','strong','strong'],['highlight','==','==','highlight','mark'],['color','<span data-md-color="red">','</span>','color','span[data-md-color]'],['underline','<u>','</u>','u','u']]){
    const name=(setext?'setext':'atx')+'-'+kind+'-'+style,doc=(setext?'':'## ')+open+'alpha '+media+' beta'+close+(setext?'\n===':'')+'\n\nNext'+defs;
    await app.getByRole('button',{name:'源码',exact:true}).click();await content.focus();await page.keyboard.press('Control+a');await page.keyboard.insertText(doc);
    for(let i=0;i<100&&(await read()).doc!==doc;i++)await page.waitForTimeout(20);assert.equal((await read()).doc,doc);
    await page.keyboard.press('Control+Home');await app.getByRole('button',{name:'即时渲染',exact:true}).click();
    await page.waitForTimeout(120);await shot(name+'-loaded');
    const visible=await content.innerText();console.log(name,'visible',JSON.stringify(visible));
    assert.ok(!visible.includes('**'),'Surrounding bold markers must be hidden');
    if(!process.env.AUDIT_BASELINE)assert.equal(await editor.locator('.cm-live-'+css).count()>0,true,'surrounding style remains rendered');
    if(!process.env.AUDIT_BASELINE&&kind==='formula')assert.equal(await editor.locator('.cm-formula-render').evaluate(el=>getComputedStyle(el).fontSize===getComputedStyle(el.closest('.cm-line')).fontSize),true,'equation follows heading size through nested wrappers');
    // Read the rendered glyph rectangle, then place the actual mouse before beta.
    const rect=await content.evaluate(el=>{const w=document.createTreeWalker(el,NodeFilter.SHOW_TEXT);for(let n=w.nextNode();n;n=w.nextNode()){const i=n.textContent.indexOf('beta');if(i<0)continue;const r=document.createRange();r.setStart(n,i);r.setEnd(n,i+1);const b=r.getBoundingClientRect();return{x:b.x+.2,y:b.y+b.height/2};}throw Error('beta glyph missing');});
    const frame=await page.locator('iframe').boundingBox();await page.mouse.click(frame.x+rect.x,frame.y+rect.y);
    const before=await read();assert.equal(before.ranges[0].head,doc.indexOf('beta'));
    await page.keyboard.insertText('X');assert.equal((await read()).doc,doc.replace('beta','Xbeta'));await page.keyboard.press('Control+z');assert.deepEqual(await read(),before);
    await page.keyboard.press('Enter');const split=await read();
    console.log(name,'split',JSON.stringify(split));await shot(name+'-split');
    if(process.env.AUDIT_BASELINE)continue;
    assert.equal(split.doc,(setext?'# ':'## ')+open+'alpha '+media+close+'\n'+open+'beta'+close+(setext?'\n':'')+'\n\nNext'+defs);
    await shot(name+'-split');assert.equal(await app.locator('#editorPreviewContent '+selector).count(),2);
    await page.keyboard.press('Control+z');assert.deepEqual(await read(),before);
    if(kind==='formula'){
      const formula=editor.locator('.cm-formula-render');await formula.click();await page.keyboard.press('Enter');
      const dialog=app.locator('#formulaDialog');await dialog.waitFor({state:'visible'});await page.keyboard.press('Escape');assert.equal((await read()).doc,doc);
      await formula.click();await page.keyboard.press('Delete');assert.equal((await read()).doc,doc.replace(media,''));await page.keyboard.press('Control+z');assert.equal((await read()).doc,doc);
      await formula.hover();await formula.locator('[data-formula-action="source"]').click();await formula.locator('[data-formula-action="source"]').click();assert.equal((await read()).doc,doc);
    }else if(kind==='image'){
      const image=editor.locator('.cm-embedded-image');await image.hover();await image.locator('[data-image-action="source"]').click();await image.locator('[data-image-action="source"]').click();assert.equal((await read()).doc,doc);
    }
    console.log(name+': mouse caret, input, split, styles and undo passed');
  }
  assert.deepEqual(errors,[]);
}catch(e){if(page&&process.env.AUDIT_OUTPUT)await page.screenshot({path:`${process.env.AUDIT_OUTPUT}/failure.png`});throw e;}
finally{await browser?.close();await server.close();}
