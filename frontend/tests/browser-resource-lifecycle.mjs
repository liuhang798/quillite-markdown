// Real chart instances and bounded image reads, isolated synthetic documents.
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import {execFileSync} from 'node:child_process';
import {createServer} from 'vite';
const {chromium} = createRequire(import.meta.url)(process.env.PLAYWRIGHT_MODULE || 'playwright');
const baseline = process.env.RESOURCE_BASELINE === '1';
const root = fileURLToPath(new URL('..', import.meta.url));
const server = await createServer({root, server:{host:'127.0.0.1', port:0, watch:null, hmr:false}, logLevel:'error', plugins:[{
  name:'resource-lifecycle-audit', enforce:'pre', transform(code, id) {
    if (id.replaceAll('\\','/').endsWith('/src/echarts-diagrams.js')) return code + '\nwindow.resourceECharts=echarts;';
    if (!id.replaceAll('\\','/').endsWith('/src/renderer.js')) return;
    if (baseline) code = execFileSync('git', ['show', 'HEAD:frontend/src/renderer.js'], {cwd:root, encoding:'utf8', maxBuffer:8*1024*1024});
    return code + `\nwindow.resourceAudit={
      updateDiagram:async(source)=>{diagramWizardState.templateId='bar-chart';els.diagramSource.value=source;els.diagramDialog.classList.remove('hidden');await updateDiagramPreview();},
      closeDiagram:closeDiagramDialog,
      render:(source,path='memory.md')=>renderMarkdownTo(els.content,{path,directory:'.'},source),
      close:closePreview, cache:readerHTMLCache, waitImages:waitForPreviewImages,
      open:displayDocument, toggle:toggleEditor, exportHTML:renderedHTMLForExport, print:printCurrentDocument, state
    };`;
  }
}]});
let browser;
try {
  await server.listen();
  browser = await chromium.launch({headless:true, executablePath:process.env.BROWSER_EXECUTABLE || undefined});
  const page = await browser.newPage({viewport:{width:1450,height:950}}), errors=[];
  page.on('pageerror', e => errors.push(e.message));
  await page.route('**/*', r => new URL(r.request().url()).hostname === '127.0.0.1' ? r.continue() : r.abort());
  await page.goto(server.resolvedUrls.local[0]);
  await page.evaluate(async () => {
    await import('/src/main.js');
    window.quilliteMarkdown.reportErrorLog = async () => {};
    window.quilliteMarkdown.saveFile = async () => { throw Error('unexpected write'); };
  });
  await page.locator('#newFileButton').click();
  const counts = await page.evaluate(async () => {
    const echarts = window.resourceECharts;
    const charts = [];
    for (let i=0;i<20;i++) {
      await window.resourceAudit.updateDiagram(JSON.stringify({xAxis:{data:['A','B']},yAxis:{},series:[{type:'bar',data:[i,2]}]}));
      charts.push(echarts.getInstanceByDom(document.querySelector('#diagramPreview .echarts-diagram')));
    }
    const liveAfterEdits = charts.filter(chart => !chart.isDisposed()).length;
    window.resourceAudit.closeDiagram();
    const liveAfterClose = charts.filter(chart => !chart.isDisposed()).length;
    const chartSource = '\x60\x60\x60echarts\n'+JSON.stringify({xAxis:{data:['A']},yAxis:{},series:[{type:'bar',data:[1]}]})+'\n\x60\x60\x60';
    await window.resourceAudit.render(chartSource);
    const readerChart = echarts.getInstanceByDom(document.querySelector('#markdownContent .echarts-diagram'));
    await window.resourceAudit.render('plain text', 'memory.txt');
    const disposedOnPlainText = Boolean(readerChart.isDisposed());
    return {liveAfterEdits, liveAfterClose, disposedOnPlainText};
  });
  console.log(JSON.stringify({baseline, charts:counts}));
  if (!baseline) assert.deepEqual(counts, {liveAfterEdits:1,liveAfterClose:0,disposedOnPlainText:true});
  const imageCounts = await page.evaluate(async () => {
    const reads = [], resolvers = [];
    window.quilliteMarkdown.readImageData = ref => {
      reads.push(ref); return new Promise(resolve => resolvers.push(resolve));
    };
    const images = Array.from({length:100}, (_, i) => `![${i}](assets/${i}.png)`).join('\n\n');
    await window.resourceAudit.render(images);
    const beforeClose = reads.length;
    window.resourceAudit.close();
    resolvers.forEach(resolve => resolve('data:image/png;base64,YQ=='));
    await new Promise(resolve => setTimeout(resolve,30));
    return {beforeClose,afterClose:reads.length,cacheBytes:window.resourceAudit.cache.bytes};
  });
  console.log(JSON.stringify({baseline,images:imageCounts}));
  if (!baseline) assert.deepEqual(imageCounts,{beforeClose:4,afterClose:4,cacheBytes:0});
  // Export image waits must remove the losing listener and their timeout too.
  const listeners = await page.evaluate(async () => {
    const container = document.createElement('div'), img = document.createElement('img');
    img.classList.add('local-image-loading'); container.append(img);
    let active = 0;
    const add = img.addEventListener.bind(img), remove = img.removeEventListener.bind(img);
    img.addEventListener = (...args) => {active++;add(...args);};
    img.removeEventListener = (...args) => {active--;remove(...args);};
    await window.resourceAudit.waitImages(container, 5);
    return active;
  });
  console.log(JSON.stringify({baseline,exportWaitListenersAfterTimeout:listeners}));
  if (!baseline) assert.equal(listeners,0);
  if (!baseline) {
    await page.evaluate(async () => {
      const png='data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aN3cAAAAASUVORK5CYII=';
      window.imageReads=0;
      window.quilliteMarkdown.readImageData=async () => {window.imageReads++;return png;};
      window.quilliteMarkdown.canEditFile=async () => true;
      const content='# Current document\n\n'+Array.from({length:12},(_,i)=>`![image](assets/${i%3}.png)`).join('\n\n');
      window.resourceAudit.open({path:'images.md',name:'images.md',directory:'.',content,revision:'a'.repeat(64)});
    });
    await page.waitForFunction(()=>[...document.querySelectorAll('#markdownContent img')].length===12 && [...document.querySelectorAll('#markdownContent img')].every(img=>img.complete && img.naturalWidth));
    assert.equal(await page.evaluate(()=>window.imageReads),3,'duplicate images share reads');
    for (const theme of ['light','dark']) {
      if (theme==='dark') await page.locator('#colorModeButton').click();
      await page.evaluate(()=>window.resourceAudit.toggle(true));
      assert.equal(await page.locator('#markdownContent *').count(),0,'hidden reader DOM is released');
      await page.locator('[data-editor-presentation="live"]').click();
      const exported=await page.evaluate(()=>window.resourceAudit.exportHTML());
      assert.ok(exported.includes('Current document'));
      assert.equal((exported.match(/<img /g)||[]).length,12,'hidden-reader export is rebuilt completely');
      await page.locator('[data-editor-presentation="source"]').click();
      await page.locator('#editorPreviewContent h1').waitFor();
      await page.evaluate(()=>window.resourceAudit.toggle(false));
      assert.equal(await page.locator('#editorPreviewContent *').count(),0,'hidden split preview is released');
      assert.equal(await page.locator('#markdownContent h1').textContent(),'Current document');
    }
    const queuedExport = await page.evaluate(async () => {
      const png='data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aN3cAAAAASUVORK5CYII=';
      window.quilliteMarkdown.readImageData=()=>new Promise(resolve=>setTimeout(()=>resolve(png),650));
      const content=Array.from({length:20},(_,i)=>`![image](assets/slow${i}.png)`).join('\n\n');
      window.resourceAudit.open({path:'queued.md',name:'queued.md',directory:'.',content});
      return window.resourceAudit.exportHTML();
    });
    assert.equal((queuedExport.match(/src="data:image/g)||[]).length,20,'export waits for the whole queue, even beyond the decode timeout');
    await page.evaluate(()=>{
      window.quilliteMarkdown.readImageData=async()=>'';
      window.resourceAudit.open({path:'missing.md',name:'missing.md',directory:'.',content:'![missing](assets/missing.png)'});
    });
    await assert.rejects(page.evaluate(()=>window.resourceAudit.exportHTML()),/EXPORT_IMAGE_RESOURCE_FAILED/);
    const printing = await page.evaluate(async () => {
      const png='data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aN3cAAAAASUVORK5CYII=';
      const printed=[];
      window.quilliteMarkdown.print=async()=>printed.push([...document.querySelectorAll('#markdownContent img')].filter(img=>img.complete&&img.naturalWidth>0).length);
      window.quilliteMarkdown.readImageData=()=>new Promise(resolve=>setTimeout(()=>resolve(png),650));
      window.resourceAudit.open({path:'print.md',name:'print.md',directory:'.',content:Array.from({length:20},(_,i)=>`![image](assets/print${i}.png)`).join('\n\n')});
      await window.resourceAudit.toggle(true);
      const success=await window.resourceAudit.print();
      const failed=[];
      for(const value of ['', 'data:image/png;base64,YQ==']) {
        window.quilliteMarkdown.readImageData=async()=>value;
        window.resourceAudit.open({path:'bad.md',name:'bad.md',directory:'.',content:'![bad](assets/bad.png)'});
        failed.push(await window.resourceAudit.print());
      }
      let finish;
      window.quilliteMarkdown.readImageData=()=>new Promise(resolve=>{finish=resolve;});
      window.resourceAudit.open({path:'old.md',name:'old.md',directory:'.',content:'![old](assets/old.png)'});
      const stale=window.resourceAudit.print();
      await new Promise(resolve=>setTimeout(resolve,80));
      window.resourceAudit.open({path:'new.md',name:'new.md',directory:'.',content:'# New document'});
      finish(png);
      return {success,printed,failed,stale:await stale};
    });
    assert.deepEqual(printing,{success:true,printed:[20],failed:[false,false],stale:false});
    console.log('PASS: printing waits for 20 queued images, exits editing, rejects missing/invalid images, and cancels stale documents');
    console.log('PASS: image deduplication, light/dark mode transitions, hidden DOM release, complete image export');
  }
  assert.deepEqual(errors,[]);
} finally { await browser?.close(); await server.close(); }
