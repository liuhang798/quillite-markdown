// Drive the real preview and HTML export, isolate the WebView profile and mock
// native document I/O. No user's document or saved annotations are accessed.
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import {createServer} from 'vite';
const pw=createRequire(import.meta.url)(process.env.PLAYWRIGHT_MODULE || 'playwright');
const engine=process.env.ANNOTATION_BROWSER || 'chromium';
const server=await createServer({root:fileURLToPath(new URL('..',import.meta.url)),server:{host:'127.0.0.1',port:0,hmr:false,watch:null},logLevel:'error',
  plugins:[{name:'annotation-audit',enforce:'pre',transform(code,id){if(id.replaceAll('\\','/').endsWith('/src/renderer.js'))
    return code+'\nwindow.audit={open:d=>displayDocument(d,{addToLibrary:false}), html:()=>cleanRenderedHTMLForExport(els.content),state,search:performSearch,clear:closeSearch};';}}]});
let browser;
try {
  await server.listen();
  browser=await pw[engine].launch({headless:true,...(engine==='chromium'&&process.env.BROWSER_EXECUTABLE?{executablePath:process.env.BROWSER_EXECUTABLE}:{})});
  const page=await browser.newPage({viewport:{width:1440,height:960}}), errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  await page.route('**/*',r=>new URL(r.request().url()).hostname==='127.0.0.1'?r.continue():r.abort());
  await page.addInitScript(()=>localStorage.setItem('language','en'));
  await page.goto(server.resolvedUrls.local[0]);
  const path='/test/A.textpack', text='# First\n\nRead **this text** here.\n\n## Last\n\nDo not change this file.';
  const load=async(content=text,revision='r1',p=path)=>{
    await page.waitForFunction(()=>window.audit && window.quilliteMarkdown && document.querySelector('#fileList')?.childElementCount);
    await page.evaluate(([path,content,revision])=>audit.open({path,content,revision,name:'test',directory:'/test',readOnly:true,
      ...(path.endsWith('.textpack')?{bundleKind:'textpack',bundleSessionId:'audit'}:{})}),[p,content,revision]);
    await page.waitForFunction(()=>document.querySelector('#markdownContent h1'));
  };
  const markCount=color=>page.evaluate(c=>CSS.highlights.get('quillite-reading-'+c)?.size||0,color);
  const menu=page.locator('#readingMarkMenu');
  const select=async(selector,from,to)=>{
    const pt=await page.locator('#markdownContent '+selector).first().evaluate((el,[a,b])=>{
      const w=document.createTreeWalker(el,NodeFilter.SHOW_TEXT);let n,pos=0;const r=document.createRange();
      while(n=w.nextNode()){
        if(a>=pos && a<pos+n.length) r.setStart(n,a-pos);
        if(b>pos && b<=pos+n.length){r.setEnd(n,b-pos);break;}pos+=n.length;
      }
      const s=getSelection();s.removeAllRanges();s.addRange(r);
      const box=r.getClientRects()[0];return [box.left+box.width/2,box.top+box.height/2];
    },[from,to]);
    await page.mouse.click(...pt,{button:'right'});await menu.waitFor();return pt;
  };
  await load();
  const baseline=await page.evaluate(()=>audit.html());
  const pt=await select('p',0,14);
  await menu.locator('[data-color=yellow]').click();
  assert.equal(await markCount('yellow'),1);
  await page.mouse.click(...pt);await menu.waitFor();await menu.locator('[data-color=mint]').click();
  assert.equal(await markCount('mint'),1);assert.equal(await markCount('yellow'),0);
  await page.evaluate(()=>{const ps=document.querySelectorAll('#markdownContent p'),r=document.createRange();
    r.setStart(ps[0].firstChild,1);r.setEnd(ps[1].firstChild,2);
    getSelection().removeAllRanges();getSelection().addRange(r);ps[0].dispatchEvent(new MouseEvent('contextmenu',{bubbles:true,cancelable:true}));});
  await menu.getByRole('button',{name:'Translate selection',exact:true}).waitFor();
  assert.equal(await menu.getByRole('button').count(),1,'cross-paragraph selection offers translation only, never highlight actions');
  assert.equal(await markCount('mint'),1);
  await page.keyboard.press('Escape');
  await page.evaluate(()=>getSelection().removeAllRanges());
  await select('h1',0,5);await menu.locator('[data-color=purple]').click();
  assert.equal(await page.locator('#toc [data-reading-dot=purple]').count(),1);
  const dot=page.locator('#toc [data-reading-dot=purple]');
  assert.equal(await dot.evaluate(a=>getComputedStyle(a).display),'flex');
  assert.equal(await dot.evaluate(a=>getComputedStyle(a,'::after').width),'7px');
  await page.emulateMedia({media:'print'});
  assert.equal(await dot.evaluate(a=>getComputedStyle(a,'::after').display),'none');
  await page.emulateMedia({media:'screen'});
  assert.equal(await page.evaluate(()=>audit.state.currentFile.content),text);
  assert.equal(await page.evaluate(()=>audit.state.dirty),false);
  assert.equal(await page.evaluate(()=>audit.html()),baseline);
  await menu.waitFor({state:'hidden'});
  const headingRange=await page.evaluate(()=>{const b=[...CSS.highlights.get('quillite-reading-purple')][0].getBoundingClientRect();return [b.left+b.width/2,b.top+b.height/2];});
  await page.mouse.click(...headingRange);await menu.waitFor();
  await page.evaluate(()=>{window.originalStorageSet=Storage.prototype.setItem;Storage.prototype.setItem=function(k,v){if(k.startsWith('quillite.reading-marks.'))throw new Error('quota');return window.originalStorageSet.call(this,k,v);};});
  await menu.locator('[data-color=yellow]').click();assert.equal(await markCount('purple'),1);assert.equal(await markCount('yellow'),0);
  await page.evaluate(()=>Storage.prototype.setItem=window.originalStorageSet);
  await page.evaluate(()=>{document.querySelector('#searchInput').value='this';audit.search();});
  await page.waitForFunction(()=>[...CSS.highlights.get('quillite-reading-mint')][0].toString()==='Read this text');
  await page.evaluate(()=>audit.clear());
  await page.evaluate(()=>window.dispatchEvent(new Event('beforeprint')));
  assert.equal(await markCount('mint'),0);
  await page.evaluate(()=>window.dispatchEvent(new Event('afterprint')));
  assert.equal(await markCount('mint'),1);
  await load(text,'r1','/test/B.md');assert.equal(await markCount('mint'),0);
  await page.reload();await load();assert.equal(await markCount('mint'),1);assert.equal(await markCount('purple'),1);
  const dup=text.replace('## Last','Read **this text** here.\n\n## Last');
  await load(dup,'r2');
  const issues=page.locator('#readingMarkIssues');await issues.waitFor();
  assert.equal(await markCount('mint'),0);
  await issues.locator('summary').click();
  await issues.locator('p').filter({hasText:'Read this text'}).getByRole('button',{name:'Re-anchor',exact:true}).click();
  await select('p:last-child',0,6);await menu.getByRole('button',{name:'Move highlight here'}).click();
  assert.equal(await markCount('mint'),1);
  const p=await page.evaluate(()=>{getSelection().removeAllRanges();const b=[...CSS.highlights.get('quillite-reading-mint')][0].getBoundingClientRect();return [b.left+b.width/2,b.top+b.height/2];});
  await page.mouse.click(...p);await menu.waitFor();await menu.getByRole('button',{name:'Remove highlight'}).click();
  assert.equal(await markCount('mint'),0);
  assert.equal(await page.evaluate(()=>audit.state.currentFile.content),dup);assert.deepEqual(errors,[]);
  console.log('PASS',engine,': add, click/recolor/remove, read-only package, heading dot, search, reload, private export/print, ambiguous quote and manual re-anchor');
} finally {await browser?.close();await server.close();}
