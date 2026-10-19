// Isolated synthetic documents only, as explicitly authorized by the user.
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import {createServer} from 'vite';
const {chromium}=createRequire(import.meta.url)(process.env.PLAYWRIGHT_MODULE||'playwright');
const server=await createServer({root:fileURLToPath(new URL('..',import.meta.url)),server:{host:'127.0.0.1',port:0,watch:null,hmr:false},logLevel:'error'});
let browser,page;
try{
  await server.listen();browser=await chromium.launch({headless:true,executablePath:process.env.BROWSER_EXECUTABLE||undefined});
  page=await browser.newPage({viewport:{width:1500,height:1000}});page.setDefaultTimeout(8000);const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto(server.resolvedUrls.local[0]+'tests/fixtures/app-drag-audit.html');const app=page.frameLocator('iframe');await app.getByRole('button',{name:'新建文档',exact:true}).click();
  const editor=app.locator('#markdownEditor > .cm-editor'),content=editor.locator('> .cm-scroller > .cm-content');
  const read=()=>editor.evaluate(async el=>{const{EditorView}=await import('/node_modules/@codemirror/view/dist/index.js');const s=EditorView.findFromDOM(el).state;return{doc:s.doc.toString(),ranges:s.selection.ranges.map(r=>({anchor:r.anchor,head:r.head}))};});
  const waitDoc=async doc=>{for(let i=0;i<100;i++){if((await read()).doc===doc)return;await page.waitForTimeout(20);}assert.equal((await read()).doc,doc);};
  const shot=async name=>{if(process.env.AUDIT_OUTPUT){await page.waitForTimeout(150);await page.screenshot({path:`${process.env.AUDIT_OUTPUT}/${name}.png`});}};
  const reset=async(doc,position,mode='live')=>{
    await app.getByRole('button',{name:'源码',exact:true}).click();await content.focus();await page.keyboard.press('Control+a');await page.keyboard.insertText(doc);await waitDoc(doc);
    await page.keyboard.press('Control+Home');for(let i=0;i<position;i++)await page.keyboard.press('ArrowRight');
    if(mode==='live')await app.getByRole('button',{name:'即时渲染',exact:true}).click();await content.focus();
  };
  const format=async kind=>{const button=app.locator(`[data-format="${kind}"]:visible`);if(await button.count())await button.first().click();else{await app.locator('#moreFormatButton').click();await app.locator(`[data-format-command="${kind}"]:visible`).click();}};
  for(const mode of ['source','live'])for(const [name,doc] of [['root','Title\nsecond\n===\nNext'],['quote','> Title\n> second\n> ===\n> Next'],['list','- Title\n  second\n  ===\n  Next']])for(const kind of ['quote','unordered-list','ordered-list','task-list']){
    await reset(doc,doc.indexOf('second')+2,mode);const before=await read();await format(kind);await page.waitForTimeout(150);console.log('format',mode,name,kind,JSON.stringify(await read()));await shot(`01-${mode}-${name}-${kind}`);
    if(!process.env.AUDIT_BASELINE){
      assert.equal(await app.locator('#editorPreviewContent hr').count(),0);
      if(kind!=='task-list')assert.equal(await app.locator('#editorPreviewContent h1').filter({hasText:'Title second'}).count(),1);
      else {assert.equal(await app.locator('#editorPreviewContent h1').count(),0);assert.equal(await app.locator('#editorPreviewContent input[type="checkbox"]').count(),1);}
      await page.keyboard.press('Control+z');assert.deepEqual(await read(),before);
    }
  }
  const boundaryCases=[
    ['setext-end','Title\nsecond\n===\nNext',12,'Enter','Title\nsecond\n===\n\nNext',17],
    ['setext-start','Title\nsecond\n===\nNext',0,'Backspace','Title\nsecond\n\nNext',0],
    ['quote-end','> Title\n> second\n> ===\n> Next',16,'Enter','> Title\n> second\n> ===\n> \n> Next',25],
    ['quote-start','> Title\n> second\n> ===\n> Next',2,'Backspace','> Title\n> second\n> \n> Next',2],
    ['list-end','- Title\n  second\n  ===\n  Next',16,'Enter','- Title\n  second\n  ===\n  \n  Next',25],
    ['list-start','- Title\n  second\n  ===\n  Next',2,'Backspace','- Title\n  second\n  \n  Next',2],
    ['atx-start','## Title\nNext',3,'Backspace','Title\nNext',0],
    ['atx-end','## Title\nNext',8,'Enter','## Title\n\nNext',9],
  ];
  for(const [name,doc,position,key,expected,caret] of boundaryCases){
    await reset(doc,position);const before=await read();await page.keyboard.press(key);await page.waitForTimeout(150);
    console.log('boundary',name,JSON.stringify(await read()));await shot(`02-${name}`);
    if(!process.env.AUDIT_BASELINE){assert.deepEqual(await read(),{doc:expected,ranges:[{anchor:caret,head:caret}]});await page.keyboard.press('Control+z');assert.deepEqual(await read(),before);}
  }
  assert.deepEqual(errors,[]);
}catch(e){if(page&&process.env.AUDIT_OUTPUT)await page.screenshot({path:`${process.env.AUDIT_OUTPUT}/failure.png`});throw e;}
finally{await browser?.close();await server.close();}
