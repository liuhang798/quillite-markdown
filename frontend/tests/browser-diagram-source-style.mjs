// Fresh, isolated browser and synthetic documents. UI writes; DOM/state reads only.
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import {createServer} from 'vite';
const {chromium}=createRequire(import.meta.url)(process.env.PLAYWRIGHT_MODULE||'playwright');
const server=await createServer({root:fileURLToPath(new URL('..',import.meta.url)),server:{host:'127.0.0.1',port:0,watch:null,hmr:false},logLevel:'error'});
const indent=(text,prefix)=>text.replace(/^/gm,prefix);
const wrappers=[['root',text=>text],['quote',text=>indent(text,'> ')],['list',text=>'- Item\n\n'+indent(text,'  ')],['tab-list',text=>'- Item\n\n'+indent(text,'\t')],['quote-list',text=>'> - '+text.replaceAll('\n','\n>   ')],['details',text=>'<details open>\n<summary>Chart</summary>\n\n'+text+'\n\n</details>'],['footnote',text=>'Note[^a]\n\n[^a]: Item\n\n'+indent(text,'    ')]];
let browser,page;
try{
 await server.listen();browser=await chromium.launch({headless:true,executablePath:process.env.BROWSER_EXECUTABLE||undefined});page=await browser.newPage({viewport:{width:1440,height:1100}});page.setDefaultTimeout(15000);
 const errors=[];page.on('pageerror',error=>errors.push(error.message));await page.goto(server.resolvedUrls.local[0]+'tests/fixtures/app-drag-audit.html');const app=page.frameLocator('iframe');
 await app.locator('#newFileButton').click();await app.locator('#hideLivePreviewButton').click();if(process.env.AUDIT_THEME==='dark')await app.locator('#colorModeButton').click();
 const editor=app.locator('#markdownEditor > .cm-editor'),content=editor.locator('> .cm-scroller > .cm-content');
 const read=()=>editor.evaluate(async el=>{const{EditorView}=await import('/node_modules/@codemirror/view/dist/index.js');return EditorView.findFromDOM(el).state.doc.toString();});
 const shot=async name=>{if(process.env.AUDIT_OUTPUT){await page.waitForTimeout(200);await page.screenshot({path:`${process.env.AUDIT_OUTPUT}/${name}.png`});}};
 let cases=0;
 for(const engine of ['mermaid','echarts'])for(const [name,wrap]of wrappers){
  const id=engine+'-'+name;if(process.env.AUDIT_CASE&&!id.includes(process.env.AUDIT_CASE))continue;
  const body=engine==='mermaid'?'flowchart LR\n  A["Visible label"]-->B["End"]':JSON.stringify({title:{text:'Visible label'},xAxis:{data:['One']},yAxis:{},series:[{type:'bar',data:[2]}]},null,2);
  const fence='~~~~'+engine+'\n'+body+'\n~~~~';const doc='> Surrounding **bold** quote\n\n'+wrap(fence)+'\n\nAFTER';
  await app.locator('[data-editor-presentation="source"]').click();await content.focus();await page.keyboard.press('Control+a');await page.keyboard.insertText(doc);await page.keyboard.press('Control+End');await app.locator('[data-editor-presentation="live"]').click();
  const card=()=>editor.locator('.cm-diagram-card');await card().waitFor();await card().scrollIntoViewIfNeeded();await card().locator('svg,canvas').first().waitFor();await shot(id+'-01-rendered');
  await card().hover();await card().locator('[data-diagram-action="source"]').click();const back=editor.getByRole('button',{name:'返回渲染',exact:true});await back.waitFor();
  const line=editor.locator('.cm-line').filter({hasText:'Visible label'});await line.scrollIntoViewIfNeeded();await shot(id+'-02-source');
  const styles=await line.evaluate(el=>{const elements=[el,...el.querySelectorAll('span')];return{line:el.textContent,classes:el.className,fonts:elements.map(node=>{const s=getComputedStyle(node);return{weight:s.fontWeight,style:s.fontStyle,family:s.fontFamily}}),border:getComputedStyle(el).borderLeftWidth,background:getComputedStyle(el).backgroundColor};});
  console.log(JSON.stringify({id,styles}));
  assert.ok(styles.fonts.every(s=>s.weight==='400'&&s.style==='normal'&&/monospace/i.test(s.family)),id+' source has upright normal-weight monospace text');
  assert.equal(styles.border,'0px',id+' no prose quote border');
  const opening=editor.locator('.cm-line').filter({hasText:'~~~~'+engine});assert.equal((await opening.textContent()).trim(),(name==='quote-list'?'> - ':name==='quote'?'> ':'')+'~~~~'+engine,id+' opening prefixes are visible literal source');
  assert.equal(await read(),doc,id+' source reveal does not rewrite document');
  // The unrelated quote remains formatted and does not inherit the source reset.
  assert.ok(await editor.locator('.cm-line.cm-live-quote').filter({hasText:'Surrounding'}).count());
  const point=await line.evaluate(el=>{let offset=el.textContent.indexOf('Visible')+7;const walk=document.createTreeWalker(el,NodeFilter.SHOW_TEXT);let node;while((node=walk.nextNode())){if(offset<=node.length){const range=document.createRange();range.setStart(node,offset);range.collapse(true);const r=range.getBoundingClientRect(),b=el.getBoundingClientRect();return{x:r.x-b.x,y:r.y-b.y+r.height/2};}offset-=node.length;}throw Error('Missing source text');});
  await line.click({position:point});await page.keyboard.insertText('X');assert.equal(await read(),doc.replace('Visible label','VisibleX label'),id+' mouse maps to exact source character');
  const typingLine=editor.locator('.cm-line').filter({hasText:'VisibleX label'});
  assert.ok(await typingLine.evaluate(el=>el.classList.contains('cm-activeLine')),id+' current source line remains highlighted');
  assert.notEqual(await typingLine.evaluate(el=>getComputedStyle(el).backgroundColor),await opening.evaluate(el=>getComputedStyle(el).backgroundColor),id+' source caret line has distinct background');
  await shot(id+'-02b-typed');await page.keyboard.press('Control+z');assert.equal(await read(),doc);
  await line.click();await page.keyboard.press('End');await page.keyboard.insertText(' ');assert.equal(await read(),doc.replace(/([^\n]*Visible label[^\n]*)/, '$1 '));await page.keyboard.press('Control+z');assert.equal(await read(),doc);
  await back.click();await card().locator('svg,canvas').first().waitFor();assert.equal(await read(),doc);await shot(id+'-03-returned');
  await app.locator('[data-editor-presentation="source"]').click();assert.equal(await read(),doc);await app.locator('[data-editor-presentation="live"]').click();await card().waitFor();
  const accept=dialog=>dialog.accept();page.on('dialog',accept);try{await app.locator('#newFileButton').click();}finally{page.off('dialog',accept);}await content.focus();await page.keyboard.press('Control+y');assert.equal(await read(),'');
  cases++;console.log(JSON.stringify({id,PASS:true}));
 }
 assert.deepEqual(errors,[]);console.log(JSON.stringify({cases,PASS:true,pageErrors:errors}));
}catch(error){if(page&&process.env.AUDIT_OUTPUT)await page.screenshot({path:`${process.env.AUDIT_OUTPUT}/failure.png`});throw error;}finally{await browser?.close();await server.close();}
