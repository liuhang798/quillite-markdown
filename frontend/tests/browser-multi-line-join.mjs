// User-authorized fresh browser and synthetic documents only.
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import {createServer} from 'vite';
const {chromium}=createRequire(import.meta.url)(process.env.PLAYWRIGHT_MODULE||'playwright');
const server=await createServer({root:fileURLToPath(new URL('..',import.meta.url)),server:{host:'127.0.0.1',port:0,watch:null,hmr:false},logLevel:'error'});
const repeated=(prefix,next=prefix)=>[prefix+'needle\n'+next+'tail',prefix+'needle\n'+next+'tail'].join('\n\n');
const joined=prefix=>[prefix+'needletail',prefix+'needletail'].join('\n\n');
const details=t=>'<details open>\n<summary>Section</summary>\n\n'+t+'\n\n</details>';
const footnote=t=>'Note[^n]\n\n[^n]: '+t.replaceAll('\n','\n    ');
const cases=[...['> ','- ','1. ','- [ ] ','> - '].map((p,i)=>[['quote','list','ordered','task','nested'][i],repeated(p),joined(p)]),
 ['continuation',repeated('- ','  '),joined('- ')],
 ['details',details(repeated('> ')),details(joined('> '))],
 ['footnote',footnote(repeated('- ')),footnote(joined('- '))],
 ['consecutive','> needle\n> needle\n> tail','> needleneedletail'],
 ['mixed-plain','> needle\n> tail\n\nneedleX','> needletail\n\nneedle'],
 ['mixed-code','> needle\n> tail\n\n```text\nneedle\n> tail\n```','> needletail\n\n```text\nneedle> tail\n```'],
 ['mixed-table','> needle\n> tail\n\n| H |\n| --- |\n| needle |','> needletail\n\n| H |\n| --- |\n| needle |'],
 ['mixed-details','> needle\n> tail\n\n'+details('- needle\n- tail'),'> needletail\n\n'+details('- needletail')],
 ['mixed-footnote','> needle\n> tail\n\n'+footnote('- needle\n- tail'),'> needletail\n\n'+footnote('- needletail')],
];
for(const [kind,wrap] of [['root',t=>t],['details',details],['footnote',footnote],['table',t=>'| H |\n| --- |\n| '+t+' |']])for(const [style,open,close]of [['bold','**','**'],['italic','*','*'],['strike','~~','~~'],['highlight','==','=='],['code','```','```'],['color','<span data-md-color="spectrum-3-red">','</span>'],...['u','sup','sub','kbd','mark'].map(t=>[t,'<'+t+'>','</'+t+'>'])])
 cases.push([`format-${kind}-${style}`,'> needle\n> tail\n\n'+wrap(open+'needle'+close),'> needletail\n\n'+wrap('needle')]);
let browser,page;
try{
 await server.listen();browser=await chromium.launch({headless:true,executablePath:process.env.BROWSER_EXECUTABLE||undefined});page=await browser.newPage({viewport:{width:1500,height:1000}});page.setDefaultTimeout(10000);
 const errors=[];page.on('pageerror',e=>errors.push(e.message));await page.goto(server.resolvedUrls.local[0]+'tests/fixtures/app-drag-audit.html');const app=page.frameLocator('iframe');await app.locator('#newFileButton').click();await app.locator('#hideLivePreviewButton').click();const editor=app.locator('#markdownEditor > .cm-editor'),content=editor.locator('> .cm-scroller > .cm-content');
 const read=()=>editor.evaluate(async el=>{const{EditorView}=await import('/node_modules/@codemirror/view/dist/index.js');const s=EditorView.findFromDOM(el).state;return{doc:s.doc.toString(),ranges:s.selection.ranges.map(r=>[r.anchor,r.head]),main:s.selection.mainIndex};});
 const shot=async name=>{if(process.env.AUDIT_OUTPUT)await page.screenshot({path:`${process.env.AUDIT_OUTPUT}/${name}.png`});};let passed=0;
 for(const[id,body,expectedBody]of cases){
  if(process.env.AUDIT_CASE&&!id.includes(process.env.AUDIT_CASE))continue;
  const doc='Before\n\n'+body+'\n\nAfter',expected='Before\n\n'+expectedBody+'\n\nAfter';await app.locator('[data-editor-presentation="source"]').click();await content.focus();await page.keyboard.press('Control+a');await page.keyboard.insertText(doc);await page.keyboard.press('Control+Home');await app.locator('[data-editor-presentation="live"]').click();await content.focus();await page.keyboard.press('Control+f');
  const panel=editor.locator(':scope > .cm-panels .cm-search');await panel.locator('input[name="search"]').fill('needle');await panel.locator('button[name="select"]').click();await page.keyboard.press('Escape');await page.keyboard.press('ArrowRight');await page.waitForTimeout(100);const before=await read();assert.deepEqual(before.ranges,[...doc.matchAll(/needle/g)].map(m=>[m.index+6,m.index+6]));await shot(id+'-01-carets');
  await page.keyboard.press('Delete');await page.waitForTimeout(150);const after=await read();await shot(id+'-02-joined');console.log(id,JSON.stringify({before,after,expected}));
  if(!process.env.AUDIT_BASELINE){
   assert.equal(after.doc,expected,id);assert.equal(after.ranges.length,before.ranges.length,id+' carets retained');assert.equal(after.main,before.main);
   let typed=after.doc;for(const[a,h]of [...after.ranges].reverse()){assert.equal(a,h);typed=typed.slice(0,a)+'Z'+typed.slice(a);}
   await page.waitForTimeout(600);await page.keyboard.insertText('Z');assert.equal((await read()).doc,typed,id+' typing');await page.keyboard.press('Control+z');assert.equal((await read()).doc,after.doc);await page.keyboard.press('Control+z');assert.equal((await read()).doc,doc,id+' undo');await page.keyboard.press('Control+y');assert.equal((await read()).doc,expected,id+' redo');
  }passed++;
 }assert.deepEqual(errors,[]);console.log(JSON.stringify({passed,pageErrors:errors}));
}catch(error){if(page&&process.env.AUDIT_OUTPUT)await page.screenshot({path:`${process.env.AUDIT_OUTPUT}/failure.png`});throw error;}finally{await browser?.close();await server.close();}
