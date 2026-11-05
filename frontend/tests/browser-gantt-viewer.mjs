// Real Mermaid and SVG-image rasterization. Fixed clocks exercise a schedule
// before, after and containing today without touching user files or settings.
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import {createServer} from 'vite';
const {chromium,webkit}=createRequire(import.meta.url)(process.env.PLAYWRIGHT_MODULE||'playwright');
const engine=process.env.GANTT_BROWSER==='webkit'?webkit:chromium;
const server=await createServer({root:process.env.AUDIT_DIST||fileURLToPath(new URL('..',import.meta.url)),
  ...(process.env.AUDIT_DIST?{configFile:false}:{}),server:{host:'127.0.0.1',port:41869,strictPort:true,watch:null,hmr:false},logLevel:'error'});
const source='```mermaid\ngantt\n    title 版本发布计划\n    dateFormat YYYY-MM-DD\n    excludes weekends\n    section 规划\n    需求分析 :done, plan, 2026-08-21, 2d\n    section 实施\n    功能开发 :active, dev, after plan, 4d\n    测试验收 :test, after dev, 2d\n    正式发布 :milestone, release, after test, 0d\n```';
let browser;
try{
  await server.listen();browser=await engine.launch({headless:true,...(engine===chromium&&process.env.BROWSER_EXECUTABLE?{executablePath:process.env.BROWSER_EXECUTABLE}:{})});
  for(const [name,date,visible] of [['past','2026-11-05',false],['future','2026-01-05',false],['current','2026-08-26',true]]){
    const page=await browser.newPage({viewport:{width:1535,height:1000}}),errors=[];
    page.on('pageerror',error=>errors.push(error.message));
    await page.clock.setFixedTime(new Date(date+'T12:00:00Z'));
    await page.route('**/*',r=>new URL(r.request().url()).hostname==='127.0.0.1'?r.continue():r.abort());
    await page.goto(server.resolvedUrls.local[0]);await page.waitForFunction(()=>window.quilliteMarkdown&&document.querySelector('#fileList')?.childElementCount);
    await page.evaluate(content=>{window.quilliteMarkdown.openFile=async()=>({path:'gantt.md',name:'gantt.md',directory:'.',content});},source);
    await page.locator('#openFileButton').click();
    const chart=page.locator('#markdownContent .mermaid-diagram');await chart.locator('.diagram-view-button').waitFor();
    const svg=chart.locator('svg'),original=await svg.evaluate(el=>el.outerHTML);
    assert.equal(await svg.locator('g.today').evaluate(el=>getComputedStyle(el).display!=='none'),visible);
    const width=await svg.evaluate(el=>el.viewBox.baseVal.width);
    assert.ok(width>500&&width<2000,`only the schedule determines the viewport: ${width}`);
    await chart.locator('.diagram-view-button').click();
    const dialog=page.locator('#diagramViewer');await dialog.waitFor();
    await page.waitForFunction(()=>{const i=document.querySelector('.diagram-viewer-image');return i.complete&&i.naturalWidth>0;});
    for(const action of ['适应窗口','原始大小']){
      await dialog.getByRole('button',{name:action,exact:true}).click();
      await page.evaluate(()=>new Promise(requestAnimationFrame));
      const pixels=await page.evaluate(()=>{
        const img=document.querySelector('.diagram-viewer-image'),stage=img.parentElement;
        const canvas=document.createElement('canvas');canvas.width=stage.clientWidth;canvas.height=stage.clientHeight;
        const context=canvas.getContext('2d'),transform=new DOMMatrix(getComputedStyle(img).transform);
        context.setTransform(transform);context.drawImage(img,0,0,img.naturalWidth,img.naturalHeight);
        const data=context.getImageData(0,0,canvas.width,canvas.height).data;
        let left=canvas.width,right=0,count=0;
        for(let i=0;i<data.length;i+=4)if(data[i+3]>32&&Math.min(data[i],data[i+1],data[i+2])<230){const x=i/4%canvas.width;left=Math.min(left,x);right=Math.max(right,x);count++;}
        return {count,width:right-left,stage:canvas.width};
      });
      assert.ok(pixels.count>1000&&pixels.width>pixels.stage*.65,`${name} ${action} must show actual chart content: ${JSON.stringify(pixels)}`);
      if(action==='原始大小')assert.equal(await dialog.locator('output').textContent(),'100%');
      if(process.env.AUDIT_OUTPUT)await page.screenshot({path:process.env.AUDIT_OUTPUT+`/gantt-${name}-${action==='原始大小'?'actual':'fit'}.png`});
    }
    await page.keyboard.press('Escape');await dialog.waitFor({state:'hidden'});
    assert.equal(await svg.evaluate(el=>el.outerHTML),original,'viewing does not mutate the chart');
    assert.deepEqual(errors,[]);console.log(`PASS ${name}: bounded timeline, today-marker visibility, fit and 100% painted content`);
    await page.close();
  }
}finally{await browser?.close();await server.close();}
