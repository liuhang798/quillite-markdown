// Only isolated synthetic documents. Select and drag through real UI events.
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import {createServer} from 'vite';
const{chromium}=createRequire(import.meta.url)(process.env.PLAYWRIGHT_MODULE||'playwright');
const server=await createServer({root:fileURLToPath(new URL('..',import.meta.url)),server:{host:'127.0.0.1',port:0,watch:null,hmr:false},logLevel:'error'});
let browser,page;
try{
 await server.listen();browser=await chromium.launch({headless:true,executablePath:process.env.BROWSER_EXECUTABLE||undefined});
 page=await browser.newPage({viewport:{width:1500,height:1200}});page.setDefaultTimeout(10000);const errors=[],renderIssues=[];let passed=0;page.on('pageerror',e=>errors.push(e.message));
 await page.goto(server.resolvedUrls.local[0]+'tests/fixtures/app-drag-audit.html');const app=page.frameLocator('iframe');await app.getByRole('button',{name:'新建文档',exact:true}).click();
 const editor=app.locator('#markdownEditor > .cm-editor'),content=editor.locator('> .cm-scroller > .cm-content');
 const read=()=>editor.evaluate(async el=>{const{EditorView}=await import('/node_modules/@codemirror/view/dist/index.js');const s=EditorView.findFromDOM(el).state;return{source:s.doc.toString(),anchor:s.selection.main.anchor,head:s.selection.main.head};});
 const point=(locator,offset,needle)=>locator.evaluate((el,{offset:i,needle})=>{const w=document.createTreeWalker(el,NodeFilter.SHOW_TEXT);let n;while(n=w.nextNode()){if(needle){const at=n.textContent.indexOf(needle);if(at<0)continue;i+=at;}if(i<=n.length){const r=document.createRange();r.setStart(n,i);r.collapse(true);const b=r.getBoundingClientRect();return{x:b.x,y:b.y+b.height/2};}i-=n.length;}throw new Error('Missing text position');},{offset,needle});
 const shot=async name=>{if(process.env.AUDIT_OUTPUT){await page.waitForTimeout(180);await page.screenshot({path:`${process.env.AUDIT_OUTPUT}/${name}.png`});}};
 const wrap=body=>'<details open>\n<summary>Destination</summary>\n\n'+body+'\n\n</details>';
 const targets=[['plain','TARGET\n\nAFTER',''],['quote','> TARGET\n>\n> AFTER','> '],['list','- TARGET\n\n  AFTER','  '],['details',wrap('TARGET\n\nAFTER'),''],['details-list',wrap('- TARGET\n\n  AFTER'),'  ']];
 for(const[scope,body,prefix]of targets)for(const[kind,block,selector]of [['code','```text\nALPHA\n```','.cm-live-code'],['table','| Head |\n| --- |\n| ALPHA |','table'],['details','<details open>\n<summary>Title</summary>\n\nALPHA\n\n</details>','.cm-live-details']])for(const copy of [false,true]){
  const name=scope+'-'+kind+(copy?'-copy':'-move'),selected='START\n\n'+block+'\n\n',tail='OUTSIDE\n\nRef[^n]\n\n[^n]: '+body.replaceAll('\n','\n    '),source=selected+tail;
  if(process.env.AUDIT_CASE && !name.includes(process.env.AUDIT_CASE))continue;
  await app.getByRole('button',{name:'源码',exact:true}).click();await content.focus();await page.keyboard.press('Control+a');await page.keyboard.insertText(source);
  for(let i=0;i<100&&(await read()).source!==source;i++)await page.waitForTimeout(20);assert.equal((await read()).source,source);
  await page.keyboard.press('Control+Home');await app.getByRole('button',{name:'即时渲染',exact:true}).click();
  const start=content.locator('> .cm-line').filter({hasText:'START'}),end=content.locator('> .cm-line').filter({hasText:'OUTSIDE'}),note=editor.locator('.cm-live-footnote-definition');
  await note.waitFor({state:'visible'});const a=await point(start,0),b=await point(end,0);
  await page.mouse.click(a.x,a.y);await page.keyboard.down('Shift');await page.mouse.click(b.x,b.y);await page.keyboard.up('Shift');
  assert.equal((await read()).anchor,0);assert.equal((await read()).head,selected.length);await shot(name+'-selected');
  const origin=await point(start,2),target=await point(note.locator('.cm-line').filter({hasText:'TARGET'}),3,'TARGET');
  if(copy)await page.keyboard.down('Control');
  await page.mouse.move(origin.x,origin.y);await page.mouse.down();await page.mouse.move(origin.x+10,origin.y+10,{steps:3});await page.mouse.move(target.x,target.y,{steps:25});await page.mouse.move(target.x+1,target.y);await page.mouse.up();
  if(copy)await page.keyboard.up('Control');
  await page.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));
  const result=(await read()).source;console.log(JSON.stringify({name,result}));await shot(name+'-dropped');
  const inserted=('\n\n'+selected).replaceAll('\n','\n    '+prefix),expected=(copy?selected:'')+tail.replace('TARGET','TAR'+inserted+'GET');
  assert.equal(result,expected,'Whole blocks split destination prose and stay inside the footnote');
  const rendered=await note.locator(selector).count();
  // Continue collecting evidence, but retain a failing final assertion for
  // missing instant-rendered blocks instead of accepting source fallback.
  const expectedRendered=kind==='details'&&scope.startsWith('details')?2:1;
  if(rendered!==expectedRendered)renderIssues.push({name,actual:rendered,expected:expectedRendered});
  await app.locator('#editorPreviewContent .footnotes').locator(kind==='code'?'pre':kind==='table'?'table':'details').last().waitFor({state:'visible'});
  await page.keyboard.press('Control+z');assert.equal((await read()).source,source);await page.keyboard.press('Control+Shift+KeyZ');assert.equal((await read()).source,expected);await page.keyboard.press('Control+z');assert.equal((await read()).source,source);await shot(name+'-restored');passed++;
 }
 assert.ok(passed>0,'At least one case must run');assert.deepEqual(errors,[]);console.log(JSON.stringify({sourceAndHistoryPassed:passed,renderIssues}));assert.deepEqual(renderIssues,[],'All moved blocks must retain instant rendering');
}catch(error){if(page&&process.env.AUDIT_OUTPUT)await page.screenshot({path:`${process.env.AUDIT_OUTPUT}/failure.png`});throw error;}
finally{await browser?.close();await server.close();}
