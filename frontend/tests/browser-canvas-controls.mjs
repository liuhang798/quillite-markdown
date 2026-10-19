// Isolated synthetic documents. Only UI writes; DOM/CodeMirror reads are assertions.
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import {createServer} from 'vite';
const {chromium}=createRequire(import.meta.url)(process.env.PLAYWRIGHT_MODULE||'playwright');
const server=await createServer({root:fileURLToPath(new URL('..',import.meta.url)),server:{host:'127.0.0.1',port:0,watch:null,hmr:false},logLevel:'error'});
const sources={flowchart:'flowchart LR\n  A[Alpha] --> B[Beta]',state:'stateDiagram-v2\n  [*] --> Alpha\n  Alpha --> Beta\n  Beta --> [*]',mindmap:'mindmap\n  root((Root))\n    Alpha\n      Child\n    Beta'};
let browser,page;
try {
 await server.listen();browser=await chromium.launch({headless:true,executablePath:process.env.BROWSER_EXECUTABLE||undefined});
 for(const type of Object.keys(sources)) {
  page=await browser.newPage({viewport:{width:Number(process.env.AUDIT_WIDTH)||1500,height:1000}});page.setDefaultTimeout(12000);const errors=[];
  page.on('pageerror',e=>errors.push(e.message));await page.route('**/*',r=>new URL(r.request().url()).hostname==='127.0.0.1'?r.continue():r.abort());
  await page.goto(server.resolvedUrls.local[0]);await page.locator('body').evaluate(()=>import('/src/main.js'));
  await page.locator('#newFileButton').click();await page.locator('#hideLivePreviewButton').click();
  if(process.env.AUDIT_THEME==='dark')await page.locator('#colorModeButton').click();
  const shot=async name=>{if(process.env.AUDIT_OUTPUT){await page.waitForTimeout(350);await page.screenshot({path:`${process.env.AUDIT_OUTPUT}/${type}-${name}.png`});}};
  const editor=page.locator('#markdownEditor > .cm-editor'),canvas=page.locator('#flowchartCanvas'),nodes=page.locator('#flowchartNodeLayer [data-flowchart-node]'),edges=page.locator('#flowchartEdgeLayer [data-flowchart-edge]'),source=page.locator('#diagramSource'),label=page.locator('#flowchartNodeLabel');
  const read=()=>editor.evaluate(async el=>{const{EditorView}=await import('/node_modules/@codemirror/view/dist/index.js');return EditorView.findFromDOM(el).state.doc.toString();});
  const select=async node=>{await node.focus();await node.press('Enter');};
  const box=node=>node.evaluate(el=>{const b=el.getBBox();return{x:b.x,y:b.y,width:b.width,height:b.height};});
  const allBoxes=()=>nodes.evaluateAll(ns=>ns.map(el=>{const b=el.getBBox();return{id:el.dataset.flowchartNode,x:b.x,y:b.y,width:b.width,height:b.height};}));
  const history=async key=>{await editor.locator('> .cm-scroller > .cm-content').focus();await page.keyboard.press(key);await page.waitForTimeout(150);};
  const entry=page.locator('[data-format="diagram-builder"]');
  if(await entry.isVisible())await entry.click();else{await page.locator('#moreFormatButton').click();await page.locator('[data-format="diagram-builder"]:visible, #moreFormatMenu [data-format-command="diagram-builder"]:visible').click();}
  await page.locator('[data-diagram-category="all"]').click();await page.locator('#diagramSearch').fill({flowchart:'流程图',state:'状态图',mindmap:'思维导图'}[type]);await page.locator(`[data-diagram-template="${type}"]`).click();
  await page.locator('#flowchartSourceMode').click();await source.fill(sources[type]);await page.locator('#flowchartVisualMode').click();await canvas.waitFor({state:'visible'});await shot('01-open');
  const initial=await nodes.count();assert.equal(initial,type==='flowchart'?2:4);
  assert.equal(await page.locator('[data-flowchart-add="input-output"]').isVisible(),type==='flowchart');
  await page.locator('#toggleDiagramFullscreen').click();assert.equal(await page.locator('#diagramDialog').evaluate(el=>el.classList.contains('diagram-fullscreen')),true);
  await canvas.focus();await canvas.press('Home');await page.keyboard.press('Enter');
  if(type==='state'){await page.keyboard.press('F2');assert.equal(await label.isDisabled(),true);await page.keyboard.press('ArrowRight');}
  await page.keyboard.press('F2');assert.equal(await label.evaluate(el=>el===document.activeElement),true);await label.fill('AuditRoot');
  if(type==='mindmap'){const before=await source.inputValue();await nodes.first().focus();await page.keyboard.press('Delete');assert.equal(await source.inputValue(),before);assert.equal(await nodes.count(),initial);}
  const activeRoot=type==='state'?nodes.filter({hasText:'AuditRoot'}):nodes.first();
  await select(activeRoot);await page.locator('[data-flowchart-add="process"]').click();await label.fill('NewChild');assert.equal(await nodes.count(),initial+1);
  let added=nodes.filter({hasText:'NewChild'});await select(added);const b0=await box(added);await added.press('Shift+ArrowRight');const b1=await box(added);assert.equal(b1.x-b0.x,10);
  // Real pointer drag, not a synthetic DOM event.
  await added.focus();const rect=await added.boundingBox();assert.ok(rect);const beforeDrag=await box(added);
  await page.mouse.move(rect.x+rect.width/2,rect.y+rect.height/2);await page.mouse.down();await page.mouse.move(rect.x+rect.width/2+35,rect.y+rect.height/2+20,{steps:8});await page.mouse.up();
  const afterDrag=await box(added);assert.ok(Math.abs(afterDrag.x-beforeDrag.x)>5);assert.ok(Math.abs(afterDrag.y-beforeDrag.y)>5);await page.waitForTimeout(200);
  const beforePan=await canvas.getAttribute('viewBox');await canvas.focus();await canvas.press('Alt+ArrowRight');assert.notEqual(await canvas.getAttribute('viewBox'),beforePan);
  const beforeAll=await allBoxes();await canvas.press('Control+a');await canvas.press('Shift+ArrowDown');const afterAll=await allBoxes();for(let i=0;i<beforeAll.length;i++)assert.equal(afterAll[i].y-beforeAll[i].y,10);
  while(await page.locator('#flowchartZoomOut').isEnabled())await page.locator('#flowchartZoomOut').click();assert.equal(await page.locator('#flowchartZoomValue').innerText(),'50%');
  while(await page.locator('#flowchartZoomIn').isEnabled())await page.locator('#flowchartZoomIn').click();assert.equal(await page.locator('#flowchartZoomValue').innerText(),'200%');await page.locator('#flowchartZoomReset').click();assert.equal(await page.locator('#flowchartZoomValue').innerText(),'100%');
  // Enter on a selected member intentionally retains group selection for dragging.
  // F2 explicitly enters one node's properties before continuing single-node edits.
  await activeRoot.focus();await activeRoot.press('F2');await page.locator('#flowchartAutoLayout').click();
  if(type==='flowchart'){
   for(const direction of ['TD','RL','BT','LR']){await page.locator('#flowchartDirection').selectOption(direction);assert.ok((await source.inputValue()).startsWith('flowchart '+direction));}
   await select(added);const notation={process:'[NewChild]',decision:'{NewChild}','input-output':'[/NewChild/]',terminal:'([NewChild])',round:'(NewChild)',subroutine:'[[NewChild]]',database:'[(NewChild)]',circle:'((NewChild))'};
   const shapes=await page.locator('#flowchartNodeShape option').evaluateAll(os=>os.map(o=>o.value));assert.equal(shapes.length,8);
   for(const shape of shapes){await page.locator('#flowchartNodeShape').selectOption(shape);assert.equal(await page.locator('#flowchartNodeShape').inputValue(),shape);assert.ok((await source.inputValue()).includes(notation[shape]));}
   for(const shape of ['decision','terminal']){await page.locator(`[data-flowchart-add="${shape}"]`).click();await label.fill('Temp'+shape);assert.equal(await nodes.count(),initial+2);await page.locator('#flowchartDeleteSelection').click();assert.equal(await nodes.count(),initial+1);assert.ok(!(await source.inputValue()).includes('Temp'+shape));}
  }
  if(type!=='mindmap'){
   const count=await edges.count();await page.locator('#flowchartConnect').click();await select(activeRoot);await select(added);assert.equal(await edges.count(),count+1);
   const edge=edges.last();await edge.focus();await edge.press('F2');await page.locator('#flowchartEdgeLabel').fill('AuditEdge');assert.ok((await source.inputValue()).includes('AuditEdge'));
   if(type==='flowchart')for(const style of ['dashed','thick','line','solid']){await page.locator('#flowchartEdgeStyle').selectOption(style);assert.equal(await page.locator('#flowchartEdgeStyle').inputValue(),style);assert.ok((await source.inputValue()).includes(({dashed:'-.->|AuditEdge|',thick:'==>|AuditEdge|',line:'---|AuditEdge|',solid:'-- AuditEdge -->'})[style]));}
   else assert.equal(await page.locator('#flowchartEdgeStyle').isVisible(),false);
   await edge.focus();await edge.press('Delete');assert.equal(await edges.count(),count);
   if(type==='state'){
    for(const direction of ['TD','RL','BT','LR']){await page.locator('#flowchartDirection').selectOption(direction);assert.ok((await source.inputValue()).includes('direction '+(direction==='TD'?'TB':direction)));}
    assert.equal(await page.locator('[data-flowchart-add="terminal"]').isDisabled(),true);
    const terminal=page.locator('#flowchartNodeLayer .state-terminal-node').first();await terminal.focus();await terminal.press('Delete');assert.equal(await nodes.count(),initial);
    await select(added);await page.locator('[data-flowchart-add="terminal"]').click();assert.equal(await nodes.count(),initial+1);assert.equal(await page.locator('[data-flowchart-add="terminal"]').isDisabled(),true);
   }
  }else{
   // Add a grandchild, remove its parent, then verify no content disappears.
   await select(added);await page.locator('[data-flowchart-add="process"]').click();await label.fill('Grandchild');await select(added);await page.locator('#flowchartDeleteSelection').click();assert.equal(await nodes.count(),initial+1);assert.ok((await source.inputValue()).includes('Grandchild'));assert.ok(!(await source.inputValue()).includes('NewChild'));
   added=nodes.filter({hasText:'Grandchild'});
   await select(added);await page.locator('[data-flowchart-add="decision"]').click();await label.fill('Sibling');
   const lineIndent=async text=>{const line=(await source.inputValue()).split('\n').find(l=>l.includes(text));assert.ok(line);return line.match(/^\s*/)[0].length;};
   assert.equal(await lineIndent('Grandchild'),await lineIndent('Sibling'));
   const beta=nodes.filter({hasText:'Beta'});await page.locator('#flowchartConnect').click();await select(beta);await select(added);assert.equal(await lineIndent('Grandchild'),await lineIndent('Beta')+2);
   const beforeCycle=await source.inputValue();await page.locator('#flowchartConnect').click();await select(added);await select(beta);assert.equal(await source.inputValue(),beforeCycle,'cycle rejected without source loss');
   // Accessibility labels expose both endpoints; use them to select the actual branch.
   const parentEdge=page.locator('#flowchartEdgeLayer [data-flowchart-edge][aria-label*="Beta"][aria-label*="Grandchild"]');assert.equal(await parentEdge.count(),1);
   await parentEdge.focus();await parentEdge.press('Delete');assert.equal(await lineIndent('Grandchild'),await lineIndent('Beta'));
  }
  // New nodes retain manual layout until the user requests automatic arrangement.
  await page.locator('#flowchartAutoLayout').click();const arranged=await allBoxes();
  for(let i=0;i<arranged.length;i++)for(let j=i+1;j<arranged.length;j++){const a=arranged[i],b=arranged[j];assert.ok(a.x+a.width<=b.x||b.x+b.width<=a.x||a.y+a.height<=b.y||b.y+b.height<=a.y,'arranged nodes must not overlap');}
  while(await page.locator('#flowchartZoomOut').isEnabled())await page.locator('#flowchartZoomOut').click();
  await shot('02-edited');const editedSource=await source.inputValue();assert.ok(editedSource.includes('AuditRoot'));
  await page.locator('#insertDiagramFullscreen').click();await page.locator('#diagramDialog').waitFor({state:'hidden'});const inserted=await read();assert.equal(inserted.trim(),'```mermaid\n'+editedSource.trim()+'\n```');
  const card=editor.locator('.cm-diagram-card').first();await card.locator('svg').first().waitFor();assert.doesNotMatch(await card.getAttribute('class'),/is-error/);await shot('03-inserted');
  await card.focus();await card.press('Enter');await page.locator('#diagramDialog').waitFor({state:'visible'});assert.equal(await source.inputValue(),editedSource);
  if(await source.isVisible())await page.locator('#flowchartVisualMode').click();
  await canvas.waitFor({state:'visible'});await canvas.evaluate(el=>Promise.all(el.closest('#diagramDialog').getAnimations().map(a=>a.finished)));
  await canvas.focus();assert.equal(await canvas.evaluate(el=>el===document.activeElement),true);
  await canvas.press('Control+a');assert.equal(await page.locator('#flowchartNodeLayer .flowchart-node.selected').count(),await nodes.count());
  await canvas.press('Delete');assert.equal(await nodes.count(),type==='mindmap'?1:0);
  await page.locator('#cancelDiagram').click();assert.equal(await read(),inserted);
  await history('Control+z');assert.equal(await read(),'');await history('Control+y');assert.equal(await read(),inserted);await card.locator('svg').first().waitFor();await shot('04-redone');
  assert.deepEqual(errors,[]);console.log(JSON.stringify({id:type,add:true,keyboard:true,pointerDrag:true,groupMove:true,pan:true,zoom:true,structure:true,sourceRoundTrip:true,cancel:true,history:true,pageErrors:errors}));await page.close();page=null;
 }
 console.log(JSON.stringify({PASS:3}));
}catch(error){if(page&&process.env.AUDIT_OUTPUT)await page.screenshot({path:process.env.AUDIT_OUTPUT+'/failure.png'});throw error;}
finally{await browser?.close();await server.close();}
