import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import {createServer} from 'vite';
const playwright=createRequire(import.meta.url)(process.env.PLAYWRIGHT_MODULE||'playwright');
const server=await createServer({root:fileURLToPath(new URL('..',import.meta.url)),server:{host:'127.0.0.1',port:0,watch:null,hmr:false},logLevel:'error',plugins:[{
  name:'diagram-selection-audit',enforce:'pre',transform(code,id){if(id.replaceAll('\\','/').endsWith('/src/renderer.js'))return code+'\nwindow.diagramSelectionAudit={open:displayDocument,toggle:toggleEditor,mode:setEditorPresentation,theme:setColorMode,view:()=>codeEditor,undo:()=>undo(codeEditor)};';}
}]});
let browser;
try {
  await server.listen();
  const engine=process.env.DIAGRAM_BROWSER||'chromium';
  browser=await playwright[engine].launch({headless:true,...(engine==='chromium'?{executablePath:process.env.BROWSER_EXECUTABLE||undefined}:{})});
  const page=await browser.newPage({viewport:{width:1440,height:1000}}),errors=[];
  page.on('pageerror',error=>errors.push(error.message));
  await page.route('**/*',route=>new URL(route.request().url()).hostname==='127.0.0.1'?route.continue():route.abort());
  await page.goto(server.resolvedUrls.local[0]);
  await page.waitForFunction(()=>window.diagramSelectionAudit&&window.quilliteMarkdown);
  await page.evaluate(()=>{window.quilliteMarkdown.canEditFile=async()=>true;window.quilliteMarkdown.reportErrorLog=async()=>{};});
  const fence=body=>'```'+body+'\n```';
  const charts=[['mermaid',fence('mermaid\nflowchart TB\n A[Start] --> B[End]')],['echarts',fence('echarts\n{"xAxis":{"data":["A","B"]},"yAxis":{},"series":[{"type":"bar","data":[2,4]}]}')]];
  const editor=page.locator('#markdownEditor > .cm-editor');
  const paint=()=>editor.evaluate(el=>[...el.querySelectorAll(':scope > .cm-scroller > .cm-layer .cm-selectionBackground')].filter(node=>{
    const r=node.getBoundingClientRect(),s=getComputedStyle(node);return r.width>0&&r.height>0&&s.visibility!=='hidden'&&s.display!=='none';
  }).map(node=>{const r=node.getBoundingClientRect();return{width:r.width,height:r.height};}));
  const read=()=>page.evaluate(()=>diagramSelectionAudit.view().state.doc.toString());
  const settle=()=>page.waitForTimeout(180);
  for(const theme of ['light','dark'])for(const [kind,chart]of charts){
    const doc='BEFORE alpha\n\n'+chart+'\n\nAFTER omega';
    await page.evaluate(async({doc,theme,kind})=>{
      diagramSelectionAudit.theme(theme);diagramSelectionAudit.open({path:`${theme}-${kind}.md`,name:`${kind}.md`,directory:'.',content:doc});
      await diagramSelectionAudit.toggle(true);diagramSelectionAudit.mode('live');
    },{doc,theme,kind});
    const card=editor.locator('.cm-diagram-card');await card.locator('svg,canvas').first().waitFor();
    await card.click({position:{x:25,y:70}});await settle();
    assert.equal(await card.evaluate(el=>el.classList.contains('is-selected')),true);
    const selected=await page.evaluate(()=>{const v=diagramSelectionAudit.view(),s=v.state.selection.main;return v.state.sliceDoc(s.from,s.to);});
    assert.equal(selected,chart,'selecting a diagram retains its exact Markdown range');
    if(process.env.AUDIT_OUTPUT)await page.screenshot({path:`${process.env.AUDIT_OUTPUT}/diagram-${kind}-${theme}-${engine}.png`,animations:'disabled'});
    assert.deepEqual(await paint(),[],`${kind}/${theme}: a selected rendered diagram must not paint text-selection bars`);
    const copied=await card.evaluate(el=>{const data=new DataTransfer();el.dispatchEvent(new ClipboardEvent('copy',{clipboardData:data,bubbles:true,cancelable:true}));return data.getData('text/plain');});
    assert.equal(copied,chart);
    await card.locator('[data-diagram-action="edit"]').click();await page.locator('#diagramDialog').waitFor();
    await page.locator('#cancelDiagram').click();await settle();assert.deepEqual(await paint(),[],'closing the chart editor must not restore bars');
    await card.locator('[data-diagram-action="source"]').click();
    const back=editor.getByRole('button',{name:'返回渲染',exact:true});await back.waitFor();
    await page.evaluate(({from,to})=>{const v=diagramSelectionAudit.view();v.dispatch({selection:{anchor:from,head:to}});v.focus();},{from:doc.indexOf(chart),to:doc.indexOf(chart)+chart.length});
    await settle();assert.ok((await paint()).length>0,'exposed diagram source keeps text-selection highlighting');
    await back.click();await card.locator('svg,canvas').first().waitFor();await settle();
    assert.deepEqual(await paint(),[],'return from source keeps the logical selection without bars');
    assert.equal(await read(),doc);
    // Text ranges stay painted, including ranges crossing the chart.
    for(const range of [{anchor:1,head:6},{anchor:1,head:doc.length-1}]){
      await page.evaluate(range=>{const v=diagramSelectionAudit.view();v.dispatch({selection:range});v.focus();},range);await settle();
      assert.ok((await paint()).length>0,'ordinary/cross-chart text selection remains visible');
    }
    await page.evaluate(({from,to})=>{const v=diagramSelectionAudit.view(),EditorSelection=v.state.selection.constructor;v.dispatch({selection:EditorSelection.create([EditorSelection.range(1,6),EditorSelection.range(from,to)],1)});v.focus();},{from:doc.indexOf(chart),to:doc.indexOf(chart)+chart.length});
    await settle();const multi=await paint();assert.ok(multi.length>0&&multi.every(r=>r.width<150&&r.height<50),'mixed multi-selection paints only its text range');
    // Deletion/undo still operate on the chart, never the surrounding prose.
    await card.click({position:{x:25,y:70}});await card.press('Delete');
    assert.equal(await read(),doc.replace(chart,''));await page.evaluate(()=>diagramSelectionAudit.undo());
    assert.equal(await read(),doc);
  }
  const pair='Before\n\n'+charts[0][1]+'\n\n'+charts[1][1]+'\n\nAfter';
  await page.evaluate(async doc=>{diagramSelectionAudit.open({path:'pair.md',name:'pair.md',directory:'.',content:doc});await diagramSelectionAudit.toggle(true);diagramSelectionAudit.mode('live');},pair);
  await editor.locator('.cm-diagram-card svg, .cm-diagram-card canvas').first().waitFor();
  await page.evaluate(ranges=>{const v=diagramSelectionAudit.view(),S=v.state.selection.constructor;v.dispatch({selection:S.create(ranges.map(r=>S.range(r.from,r.to)))});v.focus();},charts.map(([,chart])=>({from:pair.indexOf(chart),to:pair.indexOf(chart)+chart.length})));
  await settle();assert.equal(await editor.locator('.cm-diagram-card.is-selected').count(),2,'all independently selected cards get their own border');
  assert.deepEqual(await paint(),[],'two card selections have no stray text-selection paint');
  await page.evaluate(()=>diagramSelectionAudit.view().dispatch({selection:{anchor:0}}));await settle();
  assert.equal(await editor.locator('.cm-diagram-card.is-selected').count(),0,'card borders clear when selection leaves');
  assert.deepEqual(errors,[]);console.log(`PASS ${engine}: diagram selection bars, source/edit return, text/cross/multi selection, copy, delete and undo in both themes`);
}finally{await browser?.close();await server.close();}
