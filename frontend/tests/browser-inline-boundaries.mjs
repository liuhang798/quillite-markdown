// Fresh isolated browser, synthetic documents and real keyboard/clipboard input.
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import {createServer} from 'vite';
const {chromium}=createRequire(import.meta.url)(process.env.PLAYWRIGHT_MODULE||'playwright');
const server=await createServer({root:fileURLToPath(new URL('..',import.meta.url)),server:{host:'127.0.0.1',port:0,watch:null,hmr:false},logLevel:'error'});
let browser,page;
try{
 await server.listen();browser=await chromium.launch({headless:true,executablePath:process.env.BROWSER_EXECUTABLE||undefined});page=await browser.newPage({viewport:{width:1500,height:1000}});page.setDefaultTimeout(10000);
 const errors=[];page.on('pageerror',error=>errors.push(error.message));await page.goto(server.resolvedUrls.local[0]+'tests/fixtures/multiline-edit-audit.html');const app=page.frameLocator('iframe');await app.locator('#newFileButton').click();await app.locator('#hideLivePreviewButton').click();const editor=app.locator('#markdownEditor > .cm-editor'),content=editor.locator('> .cm-scroller > .cm-content');
 const read=()=>editor.evaluate(async el=>{const {EditorView}=await import('/node_modules/@codemirror/view/dist/index.js');const s=EditorView.findFromDOM(el).state;return {doc:s.doc.toString(),ranges:s.selection.ranges.map(r=>[r.anchor,r.head])};});
 const shot=async name=>{if(process.env.AUDIT_OUTPUT)await page.screenshot({path:`${process.env.AUDIT_OUTPUT}/${name}.png`});};
 const reset=async doc=>{await app.locator('[data-editor-presentation="source"]').click();await content.focus();await page.keyboard.press('Control+a');await page.keyboard.insertText(doc);await page.keyboard.press('Control+Home');await app.locator('[data-editor-presentation="live"]').click();await page.waitForTimeout(100);};
 const formats=[['strong','**','**','.cm-live-strong'],['em','*','*','.cm-live-em'],['strong-em','***','***','.cm-live-strong'],['strike','~~','~~','.cm-live-strike'],['highlight','==','==','.cm-live-highlight'],['color','<span data-md-color="spectrum-3-red">','</span>','.cm-live-color'],['link','[','](https://example.com)','.cm-live-link']];
 const contexts=[['root',t=>t],['details',t=>'<details open>\n<summary>Title</summary>\n\n'+t+'\n\n</details>'],['table',t=>'| Head |\n| --- |\n| '+t+' |'],['footnote',t=>'Note[^n]\n\n[^n]: '+t]];
 let passed=0;
 for(const [kind,wrap]of contexts)for(const[format,open,close,selector]of formats)for(const action of ['Backspace','Delete','word-backspace','word-delete','paste','paste-all','paste-indent']){
  const name=`${kind}-${format}-${action}`;if(process.env.AUDIT_CASE&&!name.includes(process.env.AUDIT_CASE))continue;
  if(action.startsWith('paste')){const clip=page.getByLabel('隔离纯文本');await clip.fill(action==='paste-indent'?'    REPLACED ':action==='paste-all'?'  REPLACED  ':'REPLACED');await clip.focus();await page.keyboard.press('Control+a');await page.keyboard.press('Control+c');await page.waitForTimeout(100);}
  const original='alpha omega',doc='Before\n\n'+wrap(open+original+close)+'\n\nAfter';await reset(doc);const field=kind==='root'?editor:editor.locator('.cm-live-inner').last();await field.waitFor();
  const points=await field.evaluate(async(el,{action})=>{const {EditorView}=await import('/node_modules/@codemirror/view/dist/index.js');const v=EditorView.findFromDOM(el),start=v.state.doc.toString().indexOf('alpha omega');return (action.startsWith('paste')?[start+(action==='paste'?6:0),start+11]:[action==='Delete'||action==='word-delete'?start:start+11]).map(p=>{const r=v.coordsAtPos(p);return{x:r.left+.2,y:(r.top+r.bottom)/2};});},{action});
  await page.mouse.click(points[0].x,points[0].y);if(points[1]){await page.keyboard.down('Shift');await page.mouse.click(points[1].x,points[1].y);await page.keyboard.up('Shift');}
  await shot(name+'-01-target');const before=await read();await page.keyboard.press(action==='word-backspace'?'Control+Backspace':action==='word-delete'?'Control+Delete':action.startsWith('paste')?'Control+v':action);await page.waitForTimeout(100);await shot(name+'-02-result');const after=await read();const changed=action==='Backspace'?'alpha omeg':action==='Delete'?'lpha omega':action==='word-backspace'?'alpha ':action==='word-delete'?' omega':action==='paste-indent'?'    REPLACED ':action==='paste-all'?'  REPLACED  ':'alpha REPLACED',normalize=!['color','link'].includes(format),normalized=normalize?(action==='paste-indent'?'&#32;   ':changed.match(/^ */)[0])+open+changed.trim()+close+changed.match(/ *$/)[0]:open+changed+close,expected='Before\n\n'+wrap(normalized)+'\n\nAfter';console.log(name,JSON.stringify({before,after,expected}));
  if(!process.env.AUDIT_BASELINE){assert.equal(after.doc,expected);assert.equal(after.ranges.length,1);assert.ok(await field.locator(selector).count()>0);await page.waitForTimeout(600);await page.keyboard.insertText('Q');assert.equal((await read()).doc,expected.slice(0,after.ranges[0][1])+'Q'+expected.slice(after.ranges[0][1]));await shot(name+'-03-follow-up');await page.keyboard.press('Control+z');assert.equal((await read()).doc,expected);await page.keyboard.press('Control+z');assert.equal((await read()).doc,doc);await page.keyboard.press('Control+y');assert.equal((await read()).doc,expected);}
  passed++;
 }
 assert.deepEqual(errors,[]);console.log(JSON.stringify({passed,pageErrors:errors}));
}catch(error){if(page&&process.env.AUDIT_OUTPUT)await page.screenshot({path:`${process.env.AUDIT_OUTPUT}/failure.png`});throw error;}finally{await browser?.close();await server.close();}
