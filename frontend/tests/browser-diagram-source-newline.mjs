// Synthetic documents in a fresh browser. All writes are real UI input.
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import {createServer} from 'vite';
const {chromium}=createRequire(import.meta.url)(process.env.PLAYWRIGHT_MODULE||'playwright');
const server=await createServer({root:fileURLToPath(new URL('..',import.meta.url)),server:{host:'127.0.0.1',port:0,watch:null,hmr:false},logLevel:'error'});
const indent=(text,prefix)=>text.replace(/^/gm,prefix);
const wrappers=[['root',x=>x,''],['quote',x=>indent(x,'> '),'> '],['list',x=>'- Item\n\n'+indent(x,'  '),'  '],['tab-list',x=>'- Item\n\n'+indent(x,'\t'),'\t'],['quote-list',x=>'> - '+x.replaceAll('\n','\n>   '),'>   '],['details',x=>'<details open>\n<summary>Chart</summary>\n\n'+x+'\n\n</details>',''],['footnote',x=>'Note[^a]\n\n[^a]: Item\n\n'+indent(x,'    '),'    ']];
let browser,page;
try {
 await server.listen();browser=await chromium.launch({headless:true,executablePath:process.env.BROWSER_EXECUTABLE||undefined});page=await browser.newPage({viewport:{width:1440,height:1100}});page.setDefaultTimeout(15000);
 const errors=[];page.on('pageerror',e=>errors.push(e.message));await page.goto(server.resolvedUrls.local[0]+'tests/fixtures/app-drag-audit.html');const app=page.frameLocator('iframe');
 await app.locator('#newFileButton').click();await app.locator('#hideLivePreviewButton').click();if(process.env.AUDIT_THEME==='dark')await app.locator('#colorModeButton').click();
 const editor=app.locator('#markdownEditor > .cm-editor'),content=editor.locator('> .cm-scroller > .cm-content');
 const read=()=>editor.evaluate(async el=>{const {EditorView}=await import('/node_modules/@codemirror/view/dist/index.js');return EditorView.findFromDOM(el).state.doc.toString();});
 const shot=async name=>{if(process.env.AUDIT_OUTPUT){await page.waitForTimeout(150);await page.screenshot({path:`${process.env.AUDIT_OUTPUT}/${name}.png`});}};
 let cases=0;
 for(const engine of ['mermaid','echarts'])for(const [name,wrap,prefix]of wrappers)for(const action of ['middle','selection','backward','multiline','blank']){
  const id=[engine,name,action].join('-');if(process.env.AUDIT_CASE&&!id.includes(process.env.AUDIT_CASE))continue;
  const body=engine==='mermaid'?'flowchart LR\n  A["Start"];   B["Middle"];\n  C["Tail"]':'{\n  "title": {"text":"Start"},   "animation": false,\n  "xAxis": {"data":["Tail"]},\n  "yAxis": {},\n  "series": [{"type":"bar","data":[2]}]\n}';
  const doc='BEFORE\n\n'+wrap('~~~~'+engine+'\n'+body+'\n~~~~')+'\n\nAFTER';
  await app.locator('[data-editor-presentation="source"]').click();await content.focus();await page.keyboard.press('Control+a');await page.keyboard.insertText(doc);await page.keyboard.press('Control+End');await app.locator('[data-editor-presentation="live"]').click();
  const card=()=>editor.locator('.cm-diagram-card');await card().locator('svg,canvas').first().waitFor();await card().hover();await shot(id+'-01-rendered');await card().locator('[data-diagram-action="source"]').click();
  const back=editor.getByRole('button',{name:'返回渲染',exact:true});await back.waitFor();const line=editor.locator('.cm-line').filter({hasText:'Start'});await line.scrollIntoViewIfNeeded();
  const point=await line.evaluate(el=>{let at=el.textContent.indexOf('   '); // Find the spaces after Start, not a container indent.
   at=el.textContent.indexOf('   ',el.textContent.indexOf('Start'));
   const walk=document.createTreeWalker(el,NodeFilter.SHOW_TEXT);let node;while((node=walk.nextNode())){if(at<=node.length){const r=document.createRange();r.setStart(node,at);r.collapse(true);const b=r.getBoundingClientRect(),o=el.getBoundingClientRect();return{x:b.x-o.x,y:b.y-o.y+b.height/2};}at-=node.length;}throw Error('Missing source position');});
  await line.click({position:point});
  const from=doc.indexOf('   ',doc.indexOf('Start'));let to=from;
  if(action==='selection'){await page.keyboard.down('Shift');for(let i=0;i<3;i++)await page.keyboard.press('ArrowRight');await page.keyboard.up('Shift');to=from+3;}
  if(action==='backward'){for(let i=0;i<3;i++)await page.keyboard.press('ArrowRight');await page.keyboard.down('Shift');for(let i=0;i<3;i++)await page.keyboard.press('ArrowLeft');await page.keyboard.up('Shift');to=from+3;}
  if(action==='multiline'){
   const next=editor.locator('.cm-line').filter({hasText:engine==='mermaid'?'C["Tail"]':'"xAxis"'});
   const leading=await next.evaluate(el=>(/^[\t >]*/.exec(el.textContent)||[''])[0].length);
   await page.keyboard.down('Shift');await page.keyboard.press('End');await page.keyboard.press('ArrowRight');for(let i=0;i<leading;i++)await page.keyboard.press('ArrowRight');await page.keyboard.up('Shift');
   to=doc.indexOf(engine==='mermaid'?'C["Tail"]':'"xAxis"');
  }
  await shot(id+'-02-before-enter');await page.keyboard.press('Enter');
  let expected=doc.slice(0,from)+'\n'+prefix+'  '+doc.slice(to);
  if(action==='blank'){await page.keyboard.press('Enter');expected=doc.slice(0,from)+'\n'+prefix+'  '+'\n'+prefix+'  '+doc.slice(to);}
  await shot(id+'-03-after-enter');assert.equal(await read(),expected,id+' Enter preserves exact container and selection');
  await page.keyboard.press('Control+z');if(action==='blank'){assert.equal(await read(),doc.slice(0,from)+'\n'+prefix+'  '+doc.slice(to));await page.keyboard.press('Control+z');}assert.equal(await read(),doc,id+' isolated undo');
  await page.keyboard.press('Control+y');if(action==='blank')await page.keyboard.press('Control+y');assert.equal(await read(),expected,id+' redo');
  await back.click();await card().locator('svg,canvas').first().waitFor();await shot(id+'-04-returned');assert.equal(await read(),expected);
  const accept=d=>d.accept();page.on('dialog',accept);try{await app.locator('#newFileButton').click();}finally{page.off('dialog',accept);}await content.focus();await page.keyboard.press('Control+y');assert.equal(await read(),'');
  cases++;console.log(JSON.stringify({id,PASS:true}));
 }
 assert.deepEqual(errors,[]);console.log(JSON.stringify({cases,PASS:true,pageErrors:errors}));
}catch(error){if(page&&process.env.AUDIT_OUTPUT)await page.screenshot({path:`${process.env.AUDIT_OUTPUT}/failure.png`});throw error;}finally{await browser?.close();await server.close();}
