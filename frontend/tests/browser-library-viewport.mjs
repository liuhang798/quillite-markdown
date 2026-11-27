// Real sidebar rendering with isolated files and a controllable search bridge.
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';

const pw = createRequire(import.meta.url)(process.env.PLAYWRIGHT_MODULE || 'playwright');
const engine = process.env.FILE_TYPE_BROWSER || 'chromium';
const server = await createServer({root: fileURLToPath(new URL('..', import.meta.url)),
  server: {host: '127.0.0.1', watch: null, hmr: false}, logLevel: 'error',
  plugins: [{name:'library-viewport-test', enforce:'pre', transform(code, id) {
    if (id.replaceAll('\\','/').endsWith('/src/renderer.js')) return code + '\nwindow.ui = {state,setSidebarMode,setFontScale};';
  }}]});
let browser;
try {
  await server.listen();
  browser = await pw[engine].launch({headless:true, ...(engine === 'chromium' ? {ignoreDefaultArgs:['--hide-scrollbars'],executablePath:process.env.BROWSER_EXECUTABLE || undefined} : {})});
  const page = await browser.newPage({viewport:{width:1280,height:900}}), errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.route('**/*', r => new URL(r.request().url()).hostname === '127.0.0.1' ? r.continue() : r.abort());
  await page.goto(server.resolvedUrls.local[0]);
  await page.waitForFunction(() => window.ui && document.querySelector('#fileList').childElementCount);
  await page.evaluate(() => {
    const files = window.notes = Array.from({length:800}, (_,i) => ({
      path:'/bench/note-'+i+'.md',directory:'/bench',name:'note-'+i+'.md',exists:true,
    }));
    Object.assign(ui.state,{recentFiles:files.slice(0,100),favoriteFiles:[],pinnedRecentFiles:[],explorerFiles:files,root:'/bench'});
    window.batches = [];
    window.quilliteMarkdown.searchLibraryFiles = async (mode,root,q,paths,id,batch) => {
      if (q !== 'body') return {paths:[],skipped:0};
      return new Promise(resolve => batches.push({batch,resolve}));
    };
    window.quilliteMarkdown.getPreferences = async () => ({ recentFiles:notes.slice(0,100).map(f=>f.path), favoriteFiles:[],pinnedRecentFiles:ui.state.pinnedRecentFiles });
  });
  if (engine === 'chromium') {
    const original = await page.evaluate(() => {
      ui.setSidebarMode('recent');
      return document.documentElement.dataset.colorMode;
    });
    const stats = () => page.locator('#fileList').evaluate(el => {
      const thumb=getComputedStyle(el,'::-webkit-scrollbar-thumb');
      const ctx=document.createElement('canvas').getContext('2d');
      ctx.fillStyle=thumb.backgroundColor; ctx.fillRect(0,0,1,1);
      return {alpha:ctx.getImageData(0,0,1,1).data[3]/255,
        width:parseFloat(getComputedStyle(el,'::-webkit-scrollbar').width)-2*parseFloat(thumb.borderLeftWidth),
        listWidth:el.clientWidth, top:el.scrollTop, overflowing:el.scrollHeight>el.clientHeight};
    });
    const capture=async (name)=>{
      if(process.env.SCROLLBAR_CAPTURE)await page.locator('#sidebar').screenshot({path:process.env.SCROLLBAR_CAPTURE+'/'+name+'.png'});
    };
    for(const mode of ['dark','light']){
      await page.evaluate(m=>{document.documentElement.dataset.colorMode=m;},mode);
      await page.mouse.move(650,450);await page.waitForTimeout(250);
      const idle=await stats();assert.ok(idle.overflowing);assert.equal(idle.width,6);assert.ok(idle.alpha>0 && idle.alpha<.15);
      await capture(mode+'-idle');
      await page.locator('.sidebar-heading').hover();await page.waitForTimeout(250);
      const active=await stats();assert.ok(active.alpha>idle.alpha+.4);assert.equal(active.listWidth,idle.listWidth);
      await capture(mode+'-hover');
      await page.mouse.move(650,450);await page.waitForTimeout(250);
      assert.deepEqual(await stats(),idle);
    }
    await page.emulateMedia({reducedMotion:'reduce'});
    assert.equal(await page.locator('#fileList').evaluate(el=>getComputedStyle(el).transitionDuration),'0s');
    await page.locator('#librarySearchInput').focus();await page.keyboard.press('Tab');
    assert.ok(await page.locator('#fileList :focus-visible').count());assert.ok((await stats()).alpha>.5);
    await page.evaluate(m=>{document.activeElement.blur();if(m)document.documentElement.dataset.colorMode=m;else delete document.documentElement.dataset.colorMode;},original);
    await page.emulateMedia({reducedMotion:'no-preference'});
    console.log('PASS 6px library thumb: light/dark hover and leave, unchanged layout, keyboard and reduced motion');
  }
  for (const [scope,n] of [['recent',100],['explorer',800]]) {
    const samples = await page.evaluate(async ([scope,n]) => {
      const input = document.querySelector('#librarySearchInput'), list = document.querySelector('#fileList');
      const change = q => { input.value=q; input.dispatchEvent(new Event('input',{bubbles:true})); };
      change(''); ui.setSidebarMode(scope); const hits=[], mounted=[];
      for(let i=0;i<5;i++) {
        change('not-a-filename'); await new Promise(requestAnimationFrame);
        const start=performance.now(); change('note'); list.lastElementChild.getBoundingClientRect();
        hits.push(Math.round(performance.now()-start)); mounted.push(list.querySelectorAll('.file-row').length);
        if (ui.state.librarySearch.visible.length !== n) throw Error('logical result count');
      }
      return {hits,mounted};
    },[scope,n]);
    assert.ok(samples.mounted.every(n => n>0 && n<40));
    console.log(engine,scope,n,'filename redraw ms:', samples.hits,'mounted:',samples.mounted);
    const end = '/bench/note-'+(n-1)+'.md';
    const items = page.locator('#fileList .file-item');
    if(scope==='recent') await items.first().click({modifiers:['Control']});
    if(scope==='explorer') {
      const next=await items.last().evaluate(el=>{
        el.focus({preventScroll:true});
        return notes[notes.findIndex(f=>f.path===decodeURIComponent(el.dataset.path))+1].path;
      });
      await page.keyboard.press('Tab');
      assert.equal(await page.evaluate(()=>decodeURIComponent(document.activeElement.dataset.path)),next);
    }
    await page.locator('#fileList').evaluate(el=>{el.scrollTop=el.scrollHeight;});
    await page.waitForFunction(path => [...document.querySelectorAll('#fileList .file-item')].some(e=>decodeURIComponent(e.dataset.path)===path),end);
    if(scope==='recent') {
      await items.last().click({modifiers:['Shift']});
      assert.equal(await page.evaluate(()=>ui.state.recentSelection.length),100);
    }
  }
  const input=page.locator('#librarySearchInput');
  await input.fill('body'); await page.waitForFunction(()=>batches.length===1);
  await page.evaluate(()=>batches[0].batch(notes.slice(300,420).map(f=>f.path)));
  await page.waitForFunction(()=>ui.state.librarySearch.pending && ui.state.librarySearch.visible.length===120);
  await page.locator('#fileList').evaluate(el=>el.scrollTop=2500);
  await page.waitForFunction(()=>document.querySelector('.file-row[data-path="%2Fbench%2Fnote-350.md"]'));
  const anchor=await page.evaluate(()=>{
    const list=document.querySelector('#fileList'),top=list.getBoundingClientRect().top;
    const row=[...list.querySelectorAll('.file-row')].find(r=>r.getBoundingClientRect().bottom>top);
    const before=row.getBoundingClientRect().top, path=row.dataset.path;
    batches[0].batch(notes.slice(0,50).map(f=>f.path));
    return [before,list.querySelector('.file-row[data-path="'+path+'"]').getBoundingClientRect().top];
  });
  assert.ok(Math.abs(anchor[0]-anchor[1])<=1,'later matches keep the visible scroll anchor');
  await page.locator('#recentTab').click(); await page.waitForFunction(()=>batches.length===2);
  await page.evaluate(()=>{
    batches[0].batch([notes[799].path]); batches[0].resolve({paths:[notes[799].path],skipped:0});
    batches[1].batch([notes[55].path]);
  });
  await page.waitForFunction(()=>ui.state.librarySearch.visible.length===1 && ui.state.librarySearch.visible[0].path===notes[55].path && ui.state.librarySearch.pending);
  // Deliver the final batch during a click; retain the original button until
  // activation. Ctrl+click uses the production selection path without native file IO.
  const hitBox=await page.locator('#fileList .file-item').first().boundingBox();
  await page.keyboard.down('Control'); await page.mouse.move(hitBox.x+50,hitBox.y+12); await page.mouse.down();
  await page.evaluate(()=>batches[1].resolve({paths:[notes[55].path,notes[99].path],skipped:0}));
  await page.mouse.up(); await page.keyboard.up('Control');
  await page.waitForFunction(()=>!ui.state.librarySearch.pending && ui.state.librarySearch.visible.length===2);
  assert.deepEqual(await page.evaluate(()=>ui.state.recentSelection),['/bench/note-55.md']);
  await input.press('Escape');
  await page.evaluate(()=>{
    ui.state.pinnedRecentFiles=notes.slice(0,90).map(f=>f.path);
    window.quilliteMarkdown.reorderPinnedRecent=async paths=>{
      window.savedOrder=paths.slice();
      return {pinnedRecentFiles:paths};
    };
    ui.setSidebarMode('recent'); document.querySelector('#fileList').scrollTop=0;
  });
  const pins=page.locator('#fileList .file-row.pinned');
  const from=await pins.nth(0).boundingBox(),to=await pins.nth(2).boundingBox();
  await page.mouse.move(from.x+60,from.y+10); await page.mouse.down();
  await page.mouse.move(to.x+60,to.y+to.height-2,{steps:5}); await page.mouse.up();
  await page.waitForFunction(()=>window.savedOrder?.length===90);
  assert.deepEqual(await page.evaluate(()=>savedOrder.slice(0,4)),['/bench/note-1.md','/bench/note-2.md','/bench/note-0.md','/bench/note-3.md']);
  assert.equal(await page.evaluate(()=>new Set(savedOrder).size),90);
  await page.waitForFunction(()=>document.querySelectorAll('.file-row.pinned').length<40);
  await page.evaluate(()=>ui.setFontScale(1.5,true));
  const gap=await pins.nth(0).evaluate(row=>row.nextElementSibling.getBoundingClientRect().top-row.getBoundingClientRect().top);
  assert.equal(gap,70);
  // The screenshot case: two identical prefixes in different folders, plus
  // content matches whose original list positions would otherwise come first.
  const original=['pinned.md','double-dic.md','z/dict.txt','notes.md','a/dict.txt'];
  const ranked=['z/dict.txt','a/dict.txt','double-dic.md'];
  const shown=()=>page.locator('#fileList .file-item').evaluateAll(rows=>rows.map(row=>decodeURIComponent(row.dataset.path)));
  await page.evaluate(paths=>{
    const files=paths.map(path=>({path,name:path.split('/').at(-1),exists:true}));
    Object.assign(ui.state,{recentFiles:files,favoriteFiles:files,explorerFiles:files,pinnedRecentFiles:['pinned.md']});
    window.searchRuns=[];
    window.quilliteMarkdown.searchLibraryFiles=async (mode,root,q,paths,id,batch)=>{
      if (!q) return {paths:[],skipped:0};
      return new Promise(resolve=>searchRuns.push({mode,paths,batch,resolve}));
    };
  },original);
  for (const scope of ['explorer','favorites','recent']) {
    await page.evaluate(s=>ui.setSidebarMode(s),scope);
    await input.fill('DIC');
    assert.deepEqual(await shown(),ranked);
    await page.waitForFunction(s=>searchRuns.at(-1)?.mode===s,scope);
    assert.deepEqual(await page.evaluate(()=>searchRuns.at(-1).paths),['pinned.md','notes.md']);
    await page.evaluate(()=>searchRuns.at(-1).batch(['notes.md']));
    assert.deepEqual(await shown(),[...ranked,'notes.md']);
    await page.evaluate(()=>searchRuns.at(-1).resolve({paths:['notes.md','pinned.md'],skipped:0}));
    await page.waitForFunction(()=>!ui.state.librarySearch.pending);
    assert.deepEqual(await shown(),[...ranked,'pinned.md','notes.md']);
    if(scope==='recent'){
      assert.equal(await page.locator('.file-row.pinned .pin-marker').count(),1);
      assert.equal(await page.locator('.pin-drag-handle').count(),0);
      const rows=page.locator('#fileList .file-item');
      await rows.first().click({modifiers:['Control']}); await rows.nth(3).click({modifiers:['Shift']});
      assert.deepEqual(await page.evaluate(()=>ui.state.recentSelection),[...ranked,'pinned.md']);
    }
    await input.fill('');
    assert.deepEqual(await shown(),original);
  }
  assert.equal(await page.locator('.pinned-file-group .pin-drag-handle').count(),1);
  assert.deepEqual(errors,[]);
  console.log('PASS',engine,'progress before completion, stale exclusion, deep rows, selection range, full pin reorder, zoom');
} finally { await browser?.close(); await server.close(); }
