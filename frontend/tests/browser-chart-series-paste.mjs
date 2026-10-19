// Real UI interactions on synthetic documents in a fresh browser context.
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import {createServer} from 'vite';
import {DIAGRAM_TEMPLATES} from '../src/diagram-templates.js';
const {chromium}=createRequire(import.meta.url)(process.env.PLAYWRIGHT_MODULE||'playwright');
const server=await createServer({root:fileURLToPath(new URL('..',import.meta.url)),server:{host:'127.0.0.1',port:0,watch:null,hmr:false},logLevel:'error'});
let browser,page;
try{
 await server.listen();browser=await chromium.launch({headless:true,executablePath:process.env.BROWSER_EXECUTABLE||undefined});
 page=await browser.newPage({viewport:{width:1600,height:1000}});page.setDefaultTimeout(15000);
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.route('**/*',r=>new URL(r.request().url()).hostname==='127.0.0.1'?r.continue():r.abort());
 await page.goto(server.resolvedUrls.local[0]+'tests/fixtures/app-drag-audit.html');const app=page.frameLocator('iframe');
 await app.locator('body').evaluate(()=>import('/src/main.js'));
 await app.locator('#newFileButton').click();await app.locator('#hideLivePreviewButton').click();
 if(process.env.AUDIT_THEME==='dark')await app.locator('#colorModeButton').click();
 const editor=app.locator('#markdownEditor > .cm-editor'),card=()=>editor.locator('.cm-diagram-card').first();
 const read=()=>editor.evaluate(async el=>{const{EditorView}=await import('/node_modules/@codemirror/view/dist/index.js');return EditorView.findFromDOM(el).state.doc.toString();});
 const source=()=>app.locator('#diagramSource').inputValue();
 const rows=()=>app.locator('#structuredDiagramRows tr').evaluateAll(rs=>rs.map(r=>[...r.querySelectorAll('input')].map(i=>({value:i.value,type:i.type}))));
 const values=async()=>(await rows()).map(r=>r.map(c=>c.value));
 const shot=async name=>{if(process.env.AUDIT_OUTPUT){await page.waitForTimeout(350);await page.screenshot({path:`${process.env.AUDIT_OUTPUT}/${name}.png`});}};
 const save=async()=>{assert.equal(await app.locator('#insertDiagram').isEnabled(),true);await app.locator('#insertDiagram').click();await app.locator('#diagramDialog').waitFor({state:'hidden'});await card().waitFor();};
 const reopen=async()=>{await card().focus();await page.keyboard.press('Enter');await app.locator('#structuredDiagramEditor').waitFor({state:'visible'});};
 const history=async key=>{await editor.locator('> .cm-scroller > .cm-content').focus();await page.keyboard.press(key);await page.waitForTimeout(200);};
 const paste=async(text,header=false)=>{const panel=app.locator('#diagramPastePanel');if(!await panel.evaluate(el=>el.open))await panel.locator('summary').click();await app.locator('#diagramPasteHeader').setChecked(header);await app.locator('#diagramPasteText').fill(text);await app.locator('#applyDiagramPaste').click();};
 const templates=DIAGRAM_TEMPLATES.filter(t=>t.engine==='echarts'&&t.visualEditor==='structured').slice(0,Number(process.env.AUDIT_LIMIT)||undefined);
 let seriesCount=0;
 for(const [index,t] of templates.entries()){
  await app.locator('[data-format="diagram-builder"]').click();await app.locator('[data-diagram-category="all"]').click();await app.locator('#diagramSearch').fill(t.name.zh);await app.locator(`[data-diagram-template="${t.id}"]`).click();await app.locator('#structuredDiagramEditor').waitFor({state:'visible'});
  if(index===0){
   const n=app.locator('#structuredDiagramRows input[type="number"]').first(),v=await n.inputValue();await n.fill('');await shot('01-invalid');
   const colors=await app.locator('#structuredDiagramError').evaluate(el=>({foreground:getComputedStyle(el).color,background:getComputedStyle(el.parentElement).backgroundColor,border:getComputedStyle(document.querySelector('#structuredDiagramRows [aria-invalid="true"]')).borderTopColor}));
   const rgb=s=>s.match(/[\d.]+/g).slice(0,3).map(Number),lum=s=>rgb(s).map(x=>x/255).map(x=>x<=.04045?x/12.92:((x+.055)/1.055)**2.4).reduce((a,x,i)=>a+x*[.2126,.7152,.0722][i],0);
   const l=[lum(colors.foreground),lum(colors.background)].sort((a,b)=>b-a);const ratio=(l[0]+.05)/(l[1]+.05);console.log(JSON.stringify({contrast:ratio,...colors}));
   if(process.env.AUDIT_CONTRAST==='strict'){assert.ok(ratio>=4.5,'error text contrast');assert.equal(colors.border,colors.foreground,'focused invalid field retains error border');}
   await n.fill(v);
  }
  const before=await source(),beforeRows=await values();await paste('"unterminated');assert.equal(await source(),before);assert.deepEqual(await values(),beforeRows);
  const sample=(await rows()).slice(0,3).map((r,ri)=>r.map((c,ci)=>c.type==='number'?String(Number(c.value)+11+ri+ci):c.value));
  if(t.id!=='calendar-chart'&&sample[0]?.length>1&&(await rows())[0][0].type==='text')sample[0][0]='中文, "quoted" label';
  const csv=sample.map(r=>r.map(v=>'"'+v.replaceAll('"','""')+'"').join(',')).join('\r\n');
  await paste(csv);assert.deepEqual(await values(),sample,t.id+' CSV');if(index===0)await shot('02-csv');
  assert.equal(await app.locator('#toast').isVisible(),false,t.id+' successful retry clears obsolete paste warning');
  const reversed=sample.toReversed();const header=reversed[0].map((_,i)=>'列'+i).join('\t');
  await paste(header+'\r\n'+reversed.map(r=>r.map(v=>v.includes('"')?'"'+v.replaceAll('"','""')+'"':v).join('\t')).join('\r\n'),true);assert.deepEqual(await values(),reversed,t.id+' TSV with header');
  await save();const inserted=await read();await reopen();assert.deepEqual(await values(),reversed,t.id+' reopened paste');
  const count=reversed.length;await app.locator('#addStructuredDiagramRow').click();assert.equal((await values()).length,count+1);await app.locator(`[data-structured-remove="${count}"]`).click();assert.deepEqual(await values(),reversed);
  if(await app.locator('#addDiagramSeries').isVisible()){
   seriesCount++;const oldOption=JSON.parse(await source()),oldCount=oldOption.series.length;
   await app.locator('#addDiagramSeries').click();let option=JSON.parse(await source());assert.equal(option.series.length,oldCount+1);
   const names=app.locator('#structuredDiagramSettings input[type="text"]');const newName=names.last(),originalName=await newName.inputValue();
   await newName.fill(option.series[0].name);assert.equal(await app.locator('#insertDiagram').isDisabled(),true);await newName.fill('新增系列审计');assert.equal(await app.locator('#insertDiagram').isEnabled(),true);
   assert.ok((await app.locator('#structuredDiagramHead').innerText()).includes('新增系列审计'));
   const last=app.locator('#structuredDiagramRows tr').first().locator('input').last();await last.fill('123');
   if(index===0)await shot('03-added-series');
   await save();const withSeries=await read();await reopen();option=JSON.parse(await source());assert.equal(option.series.length,oldCount+1);assert.equal(option.series.at(-1).name,'新增系列审计');assert.equal((await values())[0].at(-1),'123');
   page.once('dialog',d=>d.dismiss());await app.locator('#removeDiagramSeries').click();assert.equal(JSON.parse(await source()).series.length,oldCount+1);
   page.once('dialog',d=>d.accept());await app.locator('#removeDiagramSeries').click();assert.equal(JSON.parse(await source()).series.length,oldCount);if(index===0)await shot('04-deleted-series');
   await save();const removed=await read();await history('Control+z');assert.equal(await read(),withSeries);await history('Control+y');assert.equal(await read(),removed);
   await reopen();await app.locator('#addDiagramSeries').click();await app.locator('#cancelDiagram').click();assert.equal(await read(),removed);
   assert.ok(originalName);
  }else{await app.locator('#cancelDiagram').click();assert.equal(await read(),inserted);await history('Control+z');assert.equal(await read(),'');await history('Control+y');assert.equal(await read(),inserted);}
  // The synthetic document is dirty: explicitly accept its discard prompt.
  const discardSynthetic=d=>d.accept();page.on('dialog',discardSynthetic);
  try{await app.locator('#newFileButton').click();}finally{page.off('dialog',discardSynthetic);}
  for(let wait=0;wait<30&&(await read())!=='';wait++)await page.waitForTimeout(100);
  assert.equal(await read(),'');await history('Control+y');assert.equal(await read(),'');
  console.log(JSON.stringify({id:t.id,CSV:true,TSV:true,malformedAtomic:true,rows:true,reopen:true,history:true}));
 }
 assert.deepEqual(errors,[]);console.log(JSON.stringify({PASS:templates.length,seriesCount,pageErrors:errors}));
}catch(e){if(page&&process.env.AUDIT_OUTPUT)await page.screenshot({path:`${process.env.AUDIT_OUTPUT}/failure.png`});throw e;}
finally{await browser?.close();await server.close();}
