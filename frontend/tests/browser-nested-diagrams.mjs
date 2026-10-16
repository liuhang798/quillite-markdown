// Isolated synthetic documents; UI input only. Editor internals are read for assertions.
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import {createServer} from 'vite';
const {chromium}=createRequire(import.meta.url)(process.env.PLAYWRIGHT_MODULE||'playwright');
const server=await createServer({root:fileURLToPath(new URL('..',import.meta.url)),server:{host:'127.0.0.1',port:0,watch:null,hmr:false},logLevel:'error'});
const details=body=>'<details open>\n<summary>Nested diagram</summary>\n\n'+body+'\n\n</details>';
const indent=(body,prefix)=>body.split('\n').map(line=>prefix+line).join('\n');
const wrappers=[
 ['root',body=>body],['quote',body=>indent(body,'> ')],
 ['list',body=>'- Container\n\n'+indent(body,'  ')],
 ['details',details],['html-details',body=>'<div>\n\n'+details(body)+'\n\n</div>'],
 ['footnote-details',body=>'Ref[^diagram]\n\n[^diagram]: Note\n\n'+indent(details(body),'    ')],
 ['quote-details',body=>indent(details(body),'> ')]
];
if(process.env.AUDIT_PREFIXES==='1')wrappers.splice(0,wrappers.length,
 ['list-first',body=>'- '+body.replace(/\n/g,'\n  ')],
 ['ordered-first',body=>'12. '+body.replace(/\n/g,'\n    ')],
 ['quote-list',body=>indent('- '+body.replace(/\n/g,'\n  '),'> ')],
 ['list-quote',body=>'- Container\n\n'+indent(indent(body,'> '),'  ')],
 ['compact-quote',body=>body.split('\n').map(line=>(/^\s/.test(line)?'> ':'>')+line).join('\n')],
 ['mixed-quote',body=>body.split('\n').map((line,i)=>(i%2&&!/^\s/.test(line)?'>':'> ')+line).join('\n')],
 ['tab-list',body=>'- Container\n\n'+indent(body,'\t')]
);
const sources=[
 ['mermaid','---\ntitle: Advanced source\n---\nflowchart LR\n  %% Preserve comments and identifiers\n  subgraph Group[Group]\n    A["Original 中文"] -->|edge| B["End"]\n  end\n  classDef custom fill:#cceedd,stroke:#336655\n  class A custom'],
 ['echarts',JSON.stringify({title:{text:'Original 中文'},dataset:{source:[['label','value'],['Alpha',12],['Beta',21]]},xAxis:{type:'category'},yAxis:{},series:[{type:'bar',encode:{x:'label',y:'value'},markLine:{data:[{type:'average',name:'Average'}]}}],dataZoom:[{type:'inside'}],__quillite:{auditNote:'Retain arbitrary metadata'}},null,2)]
];
let browser,page;
try{
 await server.listen();browser=await chromium.launch({headless:true,executablePath:process.env.BROWSER_EXECUTABLE||undefined});page=await browser.newPage({viewport:{width:1600,height:1200}});page.setDefaultTimeout(15000);
 const errors=[];page.on('pageerror',e=>errors.push(e.message));await page.goto(server.resolvedUrls.local[0]+'tests/fixtures/app-drag-audit.html');const app=page.frameLocator('iframe');
 await app.locator('#newFileButton').click();await app.locator('#hideLivePreviewButton').click();if(process.env.AUDIT_THEME==='dark')await app.locator('#colorModeButton').click();
 const editor=app.locator('#markdownEditor > .cm-editor'),content=editor.locator('> .cm-scroller > .cm-content');
 const read=()=>editor.evaluate(async el=>{const{EditorView}=await import('/node_modules/@codemirror/view/dist/index.js');return EditorView.findFromDOM(el).state.doc.toString();});
 const shot=async name=>{if(process.env.AUDIT_OUTPUT){await page.waitForTimeout(300);await page.screenshot({path:`${process.env.AUDIT_OUTPUT}/${name}.png`});}};
 const history=async key=>{await content.focus();await page.keyboard.press(key);await page.waitForTimeout(150);};
 let count=0,failures=0;
 const check=(pass,label,detail={})=>{console.log(JSON.stringify({check:label,pass,...detail}));if(!pass)failures++;if(process.env.AUDIT_STRICT==='1')assert.ok(pass,label);};
 for(const [engine,original]of sources)for(const[name,wrap]of wrappers){
  const id=engine+'-'+name;if(process.env.AUDIT_CASE&&!id.includes(process.env.AUDIT_CASE))continue;
  const fence=source=>'~~~~'+engine+'\n'+source+'\n~~~~';
  const doc='BEFORE\n\n'+fence(original)+'\n\nBETWEEN\n\n'+wrap(fence(original))+'\n\nAFTER';
  await app.locator('[data-editor-presentation="source"]').click();await content.focus();await page.keyboard.press('Control+a');await page.keyboard.insertText(doc);assert.equal(await read(),doc);await page.keyboard.press('Control+End');await app.locator('[data-editor-presentation="live"]').click();
  const card=()=>editor.locator('.cm-diagram-card').last();await card().waitFor();await card().scrollIntoViewIfNeeded();await card().locator('svg,canvas').first().waitFor();await shot(id+'-01-rendered');assert.equal(await editor.locator('.cm-diagram-card').count(),2,id+' both identical charts must render before targeting the second');
  await card().focus();await page.keyboard.press('Enter');await app.locator('#diagramDialog').waitFor({state:'visible'});
  const source=app.locator('#diagramSource');assert.equal(await source.isVisible(),true,id+' advanced source fallback');assert.equal(await source.inputValue(),original,id+' opens intended source');
  if(await app.locator('#flowchartVisualMode').isVisible()){await app.locator('#flowchartVisualMode').click();assert.equal(await source.isVisible(),true,id+' lossy visual switch rejected');assert.equal(await source.inputValue(),original);}
  await shot(id+'-02-source');
  const changed=original.replace('Original 中文','Edited 中文');await source.fill(changed);await app.locator('#insertDiagram').click();await app.locator('#diagramDialog').waitFor({state:'hidden'});
  const expected='BEFORE\n\n'+fence(original)+'\n\nBETWEEN\n\n'+wrap(fence(changed))+'\n\nAFTER';
  assert.equal(await read(),expected,id+' exact target only, wrapper and identical sibling retained');
  check(await app.locator('#toast').evaluate(el=>el.classList.contains('hidden')),id+' obsolete visual warning cleared on save');
  await card().scrollIntoViewIfNeeded();await card().locator('svg,canvas').first().waitFor();await shot(id+'-03-saved');
  await card().focus();await page.keyboard.press('Enter');await app.locator('#diagramDialog').waitFor({state:'visible'});assert.equal(await source.inputValue(),changed,id+' reopen');await app.locator('#insertDiagram').click();await app.locator('#diagramDialog').waitFor({state:'hidden'});assert.equal(await read(),expected,id+' no-op');
  await card().focus();await page.keyboard.press('Enter');await app.locator('#diagramDialog').waitFor({state:'visible'});if(await app.locator('#flowchartVisualMode').isVisible())await app.locator('#flowchartVisualMode').click();await source.fill('invalid draft');await app.locator('#cancelDiagram').click();assert.equal(await read(),expected,id+' cancel');
  check(await app.locator('#toast').evaluate(el=>el.classList.contains('hidden')),id+' obsolete visual warning cleared on cancel');
  await card().hover();await card().locator('[data-diagram-action="source"]').click();
  const back=editor.getByRole('button',{name:'返回渲染',exact:true});await back.waitFor({state:'visible'});assert.equal(await back.count(),1,id+' single return control');await shot(id+'-04-inline-source');
  if(process.env.AUDIT_NEWLINE==='1'){
    const line=editor.locator('.cm-line').filter({hasText:'Edited 中文'}).last();await line.scrollIntoViewIfNeeded();await line.click();await page.keyboard.press('End');
    const at=expected.indexOf('\n',expected.lastIndexOf('Edited 中文')),start=expected.lastIndexOf('\n',at-1)+1;
    const prefix=/^[>\t ]*/.exec(expected.slice(start,at))[0];
    await page.keyboard.press('Enter');await shot(id+'-04b-newline');
    assert.equal(await read(),expected.slice(0,at)+'\n'+prefix+expected.slice(at),id+' Enter keeps container and source indentation');
    await page.keyboard.press('Control+z');assert.equal(await read(),expected,id+' source Enter undo');
  }
  await back.click();await card().locator('svg,canvas').first().waitFor();assert.equal(await read(),expected,id+' source return');
  await card().focus();await page.keyboard.press('Delete');const from=expected.lastIndexOf('~~~~'+engine),to=expected.lastIndexOf('~~~~')+4;assert.equal(await read(),expected.slice(0,from)+expected.slice(to),id+' delete target only');
  await page.waitForTimeout(350);
  const caret=await editor.evaluate(async el=>{const{EditorView}=await import('/node_modules/@codemirror/view/dist/index.js');const root=EditorView.findFromDOM(el),active=EditorView.findFromDOM(document.activeElement),r=active?.coordsAtPos(active.state.selection.main.head),p=root.scrollDOM.getBoundingClientRect();return {focused:!!active&&el.contains(document.activeElement),top:r?.top,bottom:r?.bottom,viewportTop:p.top,viewportBottom:p.bottom};});
  check(caret.focused&&caret.top>=caret.viewportTop&&caret.bottom<=caret.viewportBottom,id+' deletion caret visible without manual scroll',caret);
  await shot(id+'-05-deleted');
  const deleted=await read();await page.keyboard.insertText('Continue');assert.equal(await read(),deleted.slice(0,from)+'Continue'+deleted.slice(from),id+' immediate typing stays at deletion target');
  await history('Control+z');assert.equal(await read(),deleted,id+' typing undo');await history('Control+z');assert.equal(await read(),expected,id+' undo delete');
  await history('Control+z');assert.equal(await read(),doc,id+' undo exact, no-op adds no history');await history('Control+y');assert.equal(await read(),expected,id+' redo exact');
  await app.locator('[data-editor-presentation="source"]').click();await app.locator('[data-editor-presentation="live"]').click();assert.equal(await read(),expected,id+' global mode unchanged');await card().scrollIntoViewIfNeeded();await card().locator('svg,canvas').first().waitFor();await shot(id+'-06-restored');
  const accept=dialog=>dialog.accept();page.on('dialog',accept);try{await app.locator('#newFileButton').click();}finally{page.off('dialog',accept);}await history('Control+y');assert.equal(await read(),'');
  count++;console.log(JSON.stringify({id,exactSource:true,targetOnly:true,advancedFallback:true,noOp:true,cancel:true,sourceReturn:true,deleteUndo:true,undoRedo:true,newDocumentIsolated:true}));
 }
 assert.deepEqual(errors,[]);console.log(JSON.stringify({cases:count,PASS:failures===0,failures,pageErrors:errors}));
}catch(e){if(page&&process.env.AUDIT_OUTPUT)await page.screenshot({path:`${process.env.AUDIT_OUTPUT}/failure.png`});throw e;}
finally{await browser?.close();await server.close();}
