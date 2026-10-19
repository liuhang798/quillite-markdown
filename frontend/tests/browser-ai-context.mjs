// UI-only document editing; the AI boundary and unique-file receipts are synthetic.
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import {createServer} from 'vite';
const {chromium}=createRequire(import.meta.url)(process.env.PLAYWRIGHT_MODULE||'playwright');
const server=await createServer({root:fileURLToPath(new URL('..',import.meta.url)),server:{host:'127.0.0.1',port:0,watch:null,hmr:false},logLevel:'error'});
let browser,page;
try{
 await server.listen();browser=await chromium.launch({headless:true,executablePath:process.env.BROWSER_EXECUTABLE||undefined});page=await browser.newPage({viewport:{width:Number(process.env.AUDIT_WIDTH)||1500,height:1100}});page.setDefaultTimeout(10000);
 const errors=[];page.on('pageerror',e=>errors.push(e.message));await page.route('**/*',r=>new URL(r.request().url()).hostname==='127.0.0.1'?r.continue():r.abort());await page.goto(server.resolvedUrls.local[0]+'tests/fixtures/multiline-edit-audit.html');const app=page.frameLocator('iframe'),frame=page.frames().find(f=>f.parentFrame());
 // Wait for the already-loading application module to finish attaching UI
 // handlers before clicking its initially visible HTML button.
 await frame.evaluate(async()=>{await import('/src/main.js');});await app.locator('#newFileButton').click();await app.locator('#hideLivePreviewButton').click();
 await frame.evaluate(()=>{const a=window.aiAudit={result:'Beta\nGamma | X',calls:[],mode:'success',pending:[],settings:[],suggestions:[]};let serial=0;Object.assign(window.quilliteMarkdown,{getAISettings:async()=>a.mode==='settings-pending'?new Promise(resolve=>a.settings.push(resolve)):({provider:'deepseek',hasApiKey:true}),rewriteWithAI:async input=>{a.calls.push(input);return a.mode==='pending'?new Promise(resolve=>a.pending.push(resolve)):{text:a.result};},reviewDocumentWithAI:async()=>({suggestions:a.suggestions}),cancelAIRewrite:async()=>{},newFile:async()=>({path:`/isolated-ai-${++serial}.md`,name:`isolated-ai-${serial}.md`,directory:'/',content:'',draft:true})});});
 const root=app.locator('#markdownEditor > .cm-editor'),content=root.locator('> .cm-scroller > .cm-content');
 const read=()=>root.evaluate(async el=>{const{EditorView}=await import('/node_modules/@codemirror/view/dist/index.js');return EditorView.findFromDOM(el).state.doc.toString();});
 const shot=async name=>{if(process.env.AUDIT_OUTPUT){await page.waitForTimeout(150);await page.screenshot({path:process.env.AUDIT_OUTPUT+'/'+name+'.png'});}};
 const reset=async(doc,live=true)=>{await app.locator('[data-editor-presentation="source"]').click();await content.fill(doc);await content.press('Control+Home');for(let i=0;i<doc.indexOf('Alpha');i++)await content.press('ArrowRight');for(let i=0;i<5;i++)await content.press('Shift+ArrowRight');if(live)await app.locator('[data-editor-presentation="live"]').click();};
 const open=async()=>{await app.locator('#aiToolbarButton').click();await app.locator('[data-ai-toolbar-action="edit"]').click();await app.locator('#aiRewriteDialog').waitFor({state:'visible'});};
 const result='Beta\nGamma | X';let passed=0;
 for(const[kind,block,replacement]of[
  ['table','| Head | Other |\n| --- | --- |\n| Alpha | Cell |','Beta Gamma \\| X'],
  ['footnote','Ref[^n]\n\n[^n]: Alpha','Beta\n    Gamma | X'],
  ['deep-table','Ref[^n]\n\n[^n]: Intro\n    \n    | Head | Other |\n    | --- | --- |\n    | Alpha | Cell |','Beta Gamma \\| X'],
  ['details','<details open>\n<summary>Title</summary>\n\nAlpha\n\n</details>',result],
  ['summary','<details open>\n<summary>Alpha</summary>\n\nBody\n\n</details>','Beta Gamma | X'],
  ['quote','> Alpha','Beta\n> Gamma | X'],
  ['list','- Alpha','Beta\n  Gamma | X'],
  ['code','> ```text\n> Alpha\n> ```','Beta\n> Gamma | X'],
  ['source','| Head | Other |\n| --- | --- |\n| Alpha | Cell |',result],
 ]){
  if(process.env.AUDIT_CASE&&process.env.AUDIT_CASE!==kind)continue;
  const doc='Before\n\n'+block+'\n\nAfter';await reset(doc,kind!=='source');await open();await app.locator('#generateAIRewrite').click();await app.locator('#replaceWithAIResult:not([disabled])').waitFor();await shot(kind+'-01-result');await app.locator('#replaceWithAIResult').click();await shot(kind+'-02-applied');const expected=doc.replace('Alpha',replacement);console.log(JSON.stringify({kind,actual:await read(),expected}));assert.equal(await read(),expected);
  await content.focus();await page.keyboard.press('Control+z');assert.equal(await read(),doc);await page.keyboard.press('Control+Shift+KeyZ');assert.equal(await read(),expected);await app.locator('[data-editor-presentation="source"]').click();assert.equal(await read(),expected);await app.locator('[data-editor-presentation="live"]').click();assert.equal(await read(),expected);passed++;console.log('PASS',kind);
 }
 if(!process.env.AUDIT_CASE||process.env.AUDIT_CASE==='session'){
  const doc='Before\n\nAlpha\n\nAfter';await reset(doc);await frame.evaluate(()=>window.aiAudit.mode='pending');await open();await app.locator('#generateAIRewrite').click();await app.locator('#aiRewriteProgress').waitFor({state:'visible'});await app.locator('#cancelAIRewrite').click();page.once('dialog',d=>d.accept());await app.locator('#newFileButton').click();await app.locator('#editorFileName').filter({hasText:'isolated-ai-1'}).waitFor();const fresh=await read();await frame.evaluate(()=>window.aiAudit.pending.shift()({text:'LATE'}));await page.waitForTimeout(200);assert.equal(await read(),fresh);assert.equal(await app.locator('#aiRewriteDialog').isVisible(),false);await shot('session-03-late-result');passed++;console.log('PASS session');
 }
 if(!process.env.AUDIT_CASE||process.env.AUDIT_CASE==='review'){
  const doc='| Head | Other |\n| --- | --- |\n| Alpha | Cell |\n\nRef[^n]\n\n[^n]: Omega';await reset(doc);await frame.evaluate(()=>{window.aiAudit.mode='success';window.aiAudit.suggestions=[{original:'Alpha',replacement:'Beta\nGamma | X',reason:'Table text'},{original:'Omega',replacement:'One\nTwo',reason:'Footnote text'}];});await app.locator('#aiToolbarButton').click();await app.locator('[data-ai-toolbar-action="proofread"]').click();await app.locator('#runAIReview').click();await app.locator('#applyAIReview:not([disabled])').waitFor();await shot('review-01-results');await app.locator('#applyAIReview').click();const expected=doc.replace('Alpha','Beta Gamma \\| X').replace('Omega','One\n    Two');assert.equal(await read(),expected);await content.focus();await page.keyboard.press('Control+z');assert.equal(await read(),doc);await page.keyboard.press('Control+Shift+KeyZ');assert.equal(await read(),expected);await shot('review-02-applied');passed++;console.log('PASS review');
 }
 if(!process.env.AUDIT_CASE||process.env.AUDIT_CASE==='settings-session'){
  await reset('Alpha');await page.waitForTimeout(3100);await frame.evaluate(()=>window.aiAudit.mode='settings-pending');await app.locator('#aiToolbarButton').click();await app.locator('[data-ai-toolbar-action="proofread"]').click();assert.equal(await app.locator('#aiReviewDialog').isVisible(),false);page.once('dialog',d=>d.accept());await app.locator('#newFileButton').click();await app.locator('#editorFileName').filter({hasText:/isolated-ai-/}).waitFor();const fresh=await read();await frame.evaluate(()=>window.aiAudit.settings.shift()({provider:'deepseek',hasApiKey:true}));await page.waitForTimeout(200);await shot('settings-session-03-return');assert.equal(await read(),fresh);assert.equal(await app.locator('#aiReviewDialog').isVisible(),false,'Old settings response must not open review in a new document');passed++;console.log('PASS settings-session');
 }
 assert.deepEqual(errors,[]);console.log(JSON.stringify({PASS:passed,pageErrors:errors}));
}catch(e){if(page&&process.env.AUDIT_OUTPUT)await page.screenshot({path:process.env.AUDIT_OUTPUT+'/failure.png'});throw e;}finally{await browser?.close();await server.close();}
