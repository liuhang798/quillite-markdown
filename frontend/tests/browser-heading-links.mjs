// Fresh isolated browser and synthetic documents, authorized by the user.
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
  const url='https://example.com/path',reference='\n\n[ref]: '+url+' "Title"',labelRef='\n\n[alpha beta]: '+url+' "Title"';
  const cases=[
    ['inline','[alpha beta]('+url+')','','[alpha]('+url+')','[beta]('+url+')',url,''],
    ['title','[alpha beta](<'+url+'> "Title")','','[alpha](<'+url+'> "Title")','[beta](<'+url+'> "Title")',url,'Title'],
    ['reference','[alpha beta][ref]',reference,'[alpha][ref]','[beta][ref]',url,'Title'],
    ['collapsed','[alpha beta][]',labelRef,'[alpha][alpha beta]','[beta][alpha beta]',url,'Title'],
    ['shortcut','[alpha beta]',labelRef,'[alpha][alpha beta]','[beta][alpha beta]',url,'Title'],
    ['inner-bold','[**alpha beta**]('+url+')','','[**alpha**]('+url+')','[**beta**]('+url+')',url,''],
    ['outer-bold','**[alpha beta]('+url+')**','','**[alpha]('+url+')**','**[beta]('+url+')**',url,''],
    ['auto','<https://example.com/alphabeta>','','[https://example.com/alpha](<https://example.com/alphabeta>)','[beta](<https://example.com/alphabeta>)','https://example.com/alphabeta',''],
    ['escaped-reference','[alpha beta][a&amp;b]','\n\n[a&amp;b]: '+url,'[alpha][a&amp;b]','[beta][a&amp;b]',url,''],
    ['url-label','[https://example.com/alphabeta]('+url+')','','[https://example.com/alpha]('+url+')','[beta]('+url+')',url,''],
    ['auto-special','<https://example.com/a[1]_x*alphabeta>','','[https://example.com/a\\[1\\]\\_x\\*alpha](<https://example.com/a[1]_x*alphabeta>)','[beta](<https://example.com/a[1]_x*alphabeta>)','https://example.com/a[1]_x*alphabeta',''],
  ];
  for(const setext of [false,true])for(const[name,text,defs,left,right,href,title]of cases){
    const doc=(setext?'':'## ')+text+(setext?'\n===':'')+'\nNext'+defs,pos=doc.indexOf('beta');
    await app.getByRole('button',{name:'源码',exact:true}).click();await content.focus();await page.keyboard.press('Control+a');await page.keyboard.insertText(doc);
    for(let i=0;i<100&&(await read()).doc!==doc;i++)await page.waitForTimeout(20);assert.equal((await read()).doc,doc);
    await page.keyboard.press('Control+Home');for(let i=0;i<pos;i++)await page.keyboard.press('ArrowRight');await app.getByRole('button',{name:'即时渲染',exact:true}).click();await content.focus();const before=await read();
    if(!process.env.AUDIT_BASELINE&&name==='url-label'){
      await page.keyboard.press('Control+k');await app.locator('#linkDialog').waitFor({state:'visible'});
      assert.equal(await app.locator('#linkDestination').inputValue(),url);await shot(`${setext?'setext':'atx'}-url-label-dialog`);
      await page.keyboard.press('Escape');await content.focus();assert.deepEqual(await read(),before);
    }
    await page.keyboard.press('Enter');await page.waitForTimeout(150);const result=await read();console.log(setext,name,JSON.stringify(result));await shot(`${setext?'setext':'atx'}-${name}`);
    if(!process.env.AUDIT_BASELINE){
      assert.equal(result.doc,(setext?'# ':'## ')+left+'\n'+right+(setext?'\n':'')+'\nNext'+defs);
      const links=await app.locator('#editorPreviewContent a').evaluateAll(els=>els.map(el=>({href:el.getAttribute('href'),title:el.getAttribute('title')||''})));assert.deepEqual(links,[{href,title},{href,title}]);
      assert.equal(result.doc.slice(result.ranges[0].head,result.ranges[0].head+4),'beta');
      await page.keyboard.insertText('X');assert.equal((await read()).doc,result.doc.slice(0,result.ranges[0].head)+'X'+result.doc.slice(result.ranges[0].head));await page.keyboard.press('Control+z');assert.deepEqual(await read(),result);
      await page.keyboard.press('Control+z');assert.deepEqual(await read(),before);
    }
  }
  assert.deepEqual(errors,[]);
}catch(e){if(page&&process.env.AUDIT_OUTPUT)await page.screenshot({path:`${process.env.AUDIT_OUTPUT}/failure.png`});throw e;}
finally{await browser?.close();await server.close();}
