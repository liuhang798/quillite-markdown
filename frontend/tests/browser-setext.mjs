// Explicitly authorized isolated browser, synthetic documents only.
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
  await page.goto(server.resolvedUrls.local[0]+'tests/fixtures/app-drag-audit.html');const app=page.frameLocator('iframe');
  await app.getByRole('button',{name:'新建文档',exact:true}).click();
  const editor=app.locator('#markdownEditor > .cm-editor'),content=editor.locator('> .cm-scroller > .cm-content');
  const read=()=>editor.evaluate(async el=>{const{EditorView}=await import('/node_modules/@codemirror/view/dist/index.js');const s=EditorView.findFromDOM(el).state;return{doc:s.doc.toString(),ranges:s.selection.ranges.map(r=>({anchor:r.anchor,head:r.head}))};});
  const waitDoc=async doc=>{for(let i=0;i<100;i++){if((await read()).doc===doc)return;await page.waitForTimeout(20);}assert.equal((await read()).doc,doc);};
  const shot=async name=>{if(process.env.AUDIT_OUTPUT){await page.waitForTimeout(150);await page.screenshot({path:`${process.env.AUDIT_OUTPUT}/${name}.png`});}};
  const reset=async(doc,mode)=>{await app.getByRole('button',{name:'源码',exact:true}).click();await content.focus();await page.keyboard.press('Control+a');await page.keyboard.insertText(doc);await waitDoc(doc);await page.keyboard.press('Control+Home');if(mode==='live')await app.getByRole('button',{name:'即时渲染',exact:true}).click();await content.focus();};
  const cases=[
    {name:'single',source:'Title\n=====\nNext',heading:p=>p+'Title\n\nNext',plain:'Title\n\nNext'},
    {name:'multi',source:'Title\nsecond\n---\nNext',heading:p=>p+'Title second\n\nNext',plain:'Title\nsecond\n\nNext'},
    {name:'quote',source:'> Title\n> second\n> ===\n> Next',heading:p=>'> '+p+'Title second\n> \n> Next',plain:'> Title\n> second\n> \n> Next'},
    {name:'list',source:'- Title\n  second\n  ---\n  Next',heading:p=>'- '+p+'Title second\n  \n  Next',plain:'- Title\n  second\n  \n  Next'},
    {name:'hardbreak',source:'Title  \nsecond\n===\nNext',heading:p=>p+'Title<br>second\n\nNext',plain:'Title  \nsecond\n\nNext'},
  ];
  for(const mode of ['source','live'])for(const item of cases){
    if(mode==='live'&&!process.env.AUDIT_BASELINE){
      await reset(item.source,mode);
      for(const text of ['Title',...(item.source.includes('second')?['second']:[])]){
        const point=await editor.locator('.cm-line').filter({hasText:text}).last().evaluate((el,text)=>{
          const walker=document.createTreeWalker(el,NodeFilter.SHOW_TEXT);let node;while((node=walker.nextNode()))if(node.textContent.includes(text))break;
          const range=document.createRange(),offset=node.textContent.indexOf(text)+2;range.setStart(node,offset);range.setEnd(node,offset+1);
          const b=range.getBoundingClientRect();return{x:b.left+.1,y:(b.top+b.bottom)/2};
        },text);
        await page.mouse.click(point.x,point.y);const position=item.source.indexOf(text)+2;
        assert.equal((await read()).ranges[0].head,position,item.name+' '+text+' click');
        await page.keyboard.insertText('X');await waitDoc(item.source.slice(0,position)+'X'+item.source.slice(position));
        await page.keyboard.press('Control+z');await waitDoc(item.source);
      }
      await shot(`04-click-edit-${item.name}`);
    }
    const levels=process.env.AUDIT_BASELINE?[3]:[1,2,3,4,5,6,0];
    for(const level of levels){
      await reset(item.source,mode);if(level===3)await shot(`01-${mode}-${item.name}`);
      const before=await read(),prefix=level?'#'.repeat(level)+' ':'';
      await app.locator('#headingSelect').selectOption(prefix);await page.waitForTimeout(150);
      console.log(mode,item.name,level,JSON.stringify(await read()));
      if(level===3||level===0)await shot(`02-${mode}-${item.name}-${level}`);
      if(!process.env.AUDIT_BASELINE){
        const expected=level?item.heading(prefix):item.plain;assert.equal((await read()).doc,expected);
        if(level)await app.locator(`#editorPreviewContent h${level}`).filter({hasText:'Title'}).waitFor({state:'visible'});
        assert.equal(await app.locator('#editorPreviewContent hr').count(),0);
        await page.keyboard.press('Control+z');assert.deepEqual(await read(),before);
        await page.keyboard.press('Control+y');await waitDoc(expected);
        if(mode==='live'&&item.name==='hardbreak'&&level===3){
          assert.equal(await editor.locator('.cm-live-break br').count(),1);
          // Click the visible second line at an exact text boundary; inspect
          // model state only for assertions, never dispatch into the editor.
          const point=await editor.locator('.cm-line').filter({hasText:'Titlesecond'}).evaluate(el=>{
            const walker=document.createTreeWalker(el,NodeFilter.SHOW_TEXT);let node;
            while((node=walker.nextNode()))if(node.textContent.includes('second'))break;
            const range=document.createRange();range.setStart(node,node.textContent.indexOf('second'));range.setEnd(node,node.textContent.indexOf('second')+1);
            const rect=range.getBoundingClientRect();return{x:rect.left+.1,y:(rect.top+rect.bottom)/2};
          });
          await page.mouse.click(point.x,point.y);assert.equal((await read()).ranges[0].head,expected.indexOf('second'));
          await page.keyboard.insertText('X');await waitDoc(expected.replace('second','Xsecond'));
          await page.keyboard.press('Control+z');await waitDoc(expected);
          await page.mouse.click(point.x,point.y);await page.keyboard.press('Backspace');await waitDoc(expected.replace('<br>',''));
          await page.keyboard.press('Control+z');await waitDoc(expected);await shot('03-hardbreak-caret');
        }
      }
    }
  }
  assert.deepEqual(errors,[]);
} catch(e){if(page&&process.env.AUDIT_OUTPUT)await page.screenshot({path:`${process.env.AUDIT_OUTPUT}/failure.png`});throw e;}
finally{await browser?.close();await server.close();}
