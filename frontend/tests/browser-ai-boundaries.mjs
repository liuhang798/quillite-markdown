// Isolated UI regression for literal fence replies and cross-block AI edits.
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import {createServer} from 'vite';
const {chromium}=createRequire(import.meta.url)(process.env.PLAYWRIGHT_MODULE||'playwright');
const server=await createServer({root:fileURLToPath(new URL('..',import.meta.url)),server:{host:'127.0.0.1',port:0,watch:null,hmr:false},logLevel:'error'});
const cases=[
 ['backticks','```text\nAlpha\n```','Alpha','```\nBeta\n```','````text\n```\nBeta\n```\n````','```\nBeta\n```'],
 ['tildes','~~~text\nAlpha\n~~~','Alpha','~~~~\nBeta\n~~~~','~~~~~text\n~~~~\nBeta\n~~~~\n~~~~~','~~~~\nBeta\n~~~~'],
 ['quote','> ```text\n> Alpha\n> ```','Alpha','```\nBeta\n```','> ````text\n> ```\n> Beta\n> ```\n> ````','```\nBeta\n```'],
 ['footnote','Ref[^n]\n\n[^n]: Note\n    \n    ```text\n    Alpha\n    ```','Alpha','```\nBeta\n```','Ref[^n]\n\n[^n]: Note\n    \n    ````text\n    ```\n    Beta\n    ```\n    ````','```\nBeta\n```'],
 ['code-to-prose','```text\nAlpha\nKeep\n```\n\nAfter tail','Alpha\nKeep\n```\n\nAfter','Beta\nGamma','```text\nBeta\nGamma\n```\n\n tail','Beta\nGamma'],
 ['footnote-to-prose','Ref[^n]\n\n[^n]: Alpha\n    Tail\n\nAfter tail','Alpha\n    Tail\n\nAfter','Beta\n    Gamma','Ref[^n]\n\n[^n]: Beta\n    Gamma\n\n tail',null],
 ['quote-code-to-prose','> ```text\n> Alpha\n> Keep\n> ```\n\nAfter tail','Alpha\n> Keep\n> ```\n\nAfter','Beta\n> Gamma','> ```text\n> Beta\n> Gamma\n> ```\n\n tail','Beta\nGamma'],
 ['prose-to-table','Start alpha\n\n| Head | Other |\n| --- | --- |\n| Alpha | Cell |','alpha\n\n| Head | Other |\n| --- | --- |\n| Alpha','Beta\nGamma','Start Beta\nGamma\n\n|  |  |\n| --- | --- |\n|  | Cell |',null],
 ['whole-code','```text\nAlpha\n```','```text\nAlpha\n```','Beta\nGamma','Beta\nGamma',null],
 ['whole-table','| Head | Other |\n| --- | --- |\n| Alpha | Cell |','| Head | Other |\n| --- | --- |\n| Alpha | Cell |','Beta\nGamma','Beta\nGamma',null],
];
for(const kind of ['drag-code-to-prose','drag-reverse-code-to-prose'])cases.push([kind,...cases.find(row=>row[0]==='code-to-prose').slice(1)]);
let browser,page;
try{
 await server.listen();browser=await chromium.launch({headless:true,executablePath:process.env.BROWSER_EXECUTABLE||undefined});page=await browser.newPage({viewport:{width:Number(process.env.AUDIT_WIDTH)||1500,height:1100}});page.setDefaultTimeout(12000);
 const errors=[];page.on('pageerror',e=>errors.push(e.message));await page.route('**/*',r=>new URL(r.request().url()).hostname==='127.0.0.1'?r.continue():r.abort());await page.goto(server.resolvedUrls.local[0]+'tests/fixtures/multiline-edit-audit.html');const frame=page.frames().find(f=>f.parentFrame());await frame.evaluate(async()=>{await import('/src/main.js');});const app=page.frameLocator('iframe');await app.locator('#newFileButton').click();await app.locator('#hideLivePreviewButton').click();
 await frame.evaluate(()=>{window.aiReply='';Object.assign(window.quilliteMarkdown,{getAISettings:async()=>({hasApiKey:true,provider:'deepseek'}),rewriteWithAI:async()=>({text:window.aiReply})});});
 const root=app.locator('#markdownEditor > .cm-editor'),content=root.locator('> .cm-scroller > .cm-content');
 const read=el=>el.evaluate(async dom=>{const{EditorView}=await import('/node_modules/@codemirror/view/dist/index.js');return EditorView.findFromDOM(dom).state.doc.toString();});
 const shot=async name=>{if(process.env.AUDIT_OUTPUT){await page.waitForTimeout(150);await page.screenshot({path:process.env.AUDIT_OUTPUT+'/'+name+'.png'});}};let passed=0;
 for(const[kind,block,selected,reply,revised,code]of cases){
  if(process.env.AUDIT_CASE&&process.env.AUDIT_CASE!==kind)continue;
  const doc='Before\n\n'+block+'\n\nLast',expected='Before\n\n'+revised+'\n\nLast';await app.locator('[data-editor-presentation="source"]').click();await content.fill(doc);await content.press('Control+Home');for(let i=0;i<doc.indexOf(selected);i++)await content.press('ArrowRight');for(let i=0;i<selected.length;i++)await content.press('Shift+ArrowRight');await app.locator('[data-editor-presentation="live"]').click();
  if(kind.startsWith('drag-')){
   const first=root.locator('.cm-live-code .cm-line').filter({hasText:/^Alpha$/}),last=content.locator('> .cm-line').filter({hasText:/^After tail$/});await first.click();
   const point=async(line,offset)=>line.evaluate((el,offset)=>{const walker=el.ownerDocument.createTreeWalker(el,NodeFilter.SHOW_TEXT);let node=walker.nextNode();while(node&&node.textContent.length<offset){offset-=node.textContent.length;node=walker.nextNode();}const r=el.ownerDocument.createRange();r.setStart(node,offset);r.collapse(true);const b=r.getBoundingClientRect();return{x:b.x+.1,y:b.y+b.height/2};},offset);
   const a=await point(first,0),b=await point(last,5),reverse=kind.includes('reverse'),start=reverse?b:a,end=reverse?a:b;
   await page.mouse.move(start.x,start.y);await page.mouse.down();await page.mouse.move(end.x,end.y,{steps:20});await page.mouse.up();await page.waitForTimeout(100);
  }
  await shot(kind+'-01-selection');
  await frame.evaluate(value=>{window.aiReply=value;},reply);await app.locator('#aiToolbarButton').click();await app.locator('[data-ai-toolbar-action="edit"]').click();await app.locator('#aiRewriteDialog').waitFor({state:'visible'});assert.equal(await app.locator('#aiOriginalText').inputValue(),selected);await app.locator('#generateAIRewrite').click();await app.locator('#replaceWithAIResult:not([disabled])').waitFor();await app.locator('#replaceWithAIResult').click();await shot(kind+'-02-result');console.log(JSON.stringify({kind,actual:await read(root),expected}));assert.equal(await read(root),expected);
  if(code!==null){const field=root.locator('.cm-live-code .cm-editor');assert.equal(await field.count(),1);assert.equal(await read(field),code);}
  await content.focus();await page.keyboard.press('Control+z');assert.equal(await read(root),doc);await page.keyboard.press('Control+Shift+KeyZ');assert.equal(await read(root),expected);
  await app.locator('[data-editor-presentation="source"]').click();assert.equal(await read(root),expected);await app.locator('[data-editor-presentation="live"]').click();assert.equal(await read(root),expected);
  await content.locator('> .cm-line').filter({hasText:/^Last$/}).click();await page.keyboard.press('End');await page.keyboard.insertText('Z');assert.equal(await read(root),expected+'Z');await page.keyboard.press('Control+z');assert.equal(await read(root),expected);passed++;console.log('PASS',kind);
 }
 assert.deepEqual(errors,[]);console.log(JSON.stringify({PASS:passed,pageErrors:errors}));
}catch(e){if(page&&process.env.AUDIT_OUTPUT)await page.screenshot({path:process.env.AUDIT_OUTPUT+'/failure.png'});throw e;}finally{await browser?.close();await server.close();}
