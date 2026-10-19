// Isolated UI audit: synthetic documents and mocked AI transport, never real keys.
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import {createServer} from 'vite';
const {chromium}=createRequire(import.meta.url)(process.env.PLAYWRIGHT_MODULE||'playwright');
const server=await createServer({root:fileURLToPath(new URL('..',import.meta.url)),server:{host:'127.0.0.1',port:0,watch:null,hmr:false},logLevel:'error'});
let browser,page;
try {
 await server.listen();
 browser=await chromium.launch({headless:true,executablePath:process.env.BROWSER_EXECUTABLE||undefined});
 page=await browser.newPage({viewport:{width:Number(process.env.AUDIT_WIDTH)||1500,height:1100}});page.setDefaultTimeout(12000);
 const errors=[],blocked=[];page.on('pageerror',e=>errors.push(e.message));
 await page.route('**/*',route=>{const u=new URL(route.request().url());if(u.hostname==='127.0.0.1')return route.continue();blocked.push(u.origin);return route.abort();});
 await page.goto(server.resolvedUrls.local[0]+'tests/fixtures/multiline-edit-audit.html');
 const app=page.frameLocator('iframe');await page.frames().find(f=>f.parentFrame()).evaluate(async()=>{await import('/src/main.js');});await app.locator('#newFileButton').click();await app.locator('#hideLivePreviewButton').click();
 const frame=page.frames().find(f=>f.parentFrame());
 await frame.evaluate(()=>{
  const audit=window.aiAudit={calls:[],cancelled:0,mode:'success',result:'Beta',pending:[],listener:null,suggestions:[]};
  const request=(kind,input)=>{audit.calls.push({kind,...input});if(audit.mode==='pending')return new Promise((resolve,reject)=>audit.pending.push({resolve,reject}));if(audit.mode==='failure')return Promise.reject(new Error('Synthetic service failure'));return Promise.resolve(kind==='rewrite'?{text:audit.mode==='echo'?input.text.replace('Alpha','Beta'):audit.result}:{suggestions:audit.suggestions});};
  Object.assign(window.quilliteMarkdown,{
   getAISettings:async()=>({provider:'deepseek',model:'synthetic-local',hasApiKey:true}),
   rewriteWithAI:input=>request('rewrite',input),reviewDocumentWithAI:input=>request('review',input),
   cancelAIRewrite:async()=>{audit.cancelled++;},cancelAIDocumentReview:async()=>{audit.cancelled++;},
   onAIRewriteChunk:listener=>{audit.listener=listener;return()=>{audit.listener=null;};}
  });
 });
 const editor=app.locator('#markdownEditor > .cm-editor'),content=editor.locator('> .cm-scroller > .cm-content');
 const read=()=>editor.evaluate(async el=>{const{EditorView}=await import('/node_modules/@codemirror/view/dist/index.js');const s=EditorView.findFromDOM(el).state;return{doc:s.doc.toString(),selected:s.sliceDoc(s.selection.main.from,s.selection.main.to)};});
 const shot=async name=>{if(process.env.AUDIT_OUTPUT){await page.waitForTimeout(200);await page.screenshot({path:process.env.AUDIT_OUTPUT+'/'+name+'.png'});}};
 const setMock=values=>frame.evaluate(values=>Object.assign(window.aiAudit,values),values);
 const calls=()=>frame.evaluate(()=>window.aiAudit.calls);
 const prepare=async(source,target='Alpha')=>{
  await app.locator('[data-editor-presentation="source"]').click();await content.fill(source);await content.press('Control+Home');
  for(let i=0;i<source.indexOf(target);i++)await content.press('ArrowRight');for(let i=0;i<target.length;i++)await content.press('Shift+ArrowRight');
  assert.equal((await read()).selected,target);await app.locator('[data-editor-presentation="live"]').click();await setMock({calls:[],mode:'success',result:'Beta'});
 };
 const open=async action=>{await app.locator('#aiToolbarButton').click();await app.locator('[data-ai-toolbar-action="'+action+'"]').click();await app.locator(action==='proofread'?'#aiReviewDialog':'#aiRewriteDialog').waitFor({state:'visible'});};
 const history=async(original,expected)=>{await content.focus();await page.keyboard.press('Control+z');assert.equal((await read()).doc,original,'one undo');await page.keyboard.press('Control+Shift+KeyZ');assert.equal((await read()).doc,expected,'redo');};
 const source='Before\n\nAlpha\n\nAfter';let passed=0;
 for(const action of ['edit','translate','concise','expand','custom','generate','continue']){
  if(process.env.AUDIT_CASE&&process.env.AUDIT_CASE!==action)continue;
  await prepare(source);await open(action);await shot(action+'-01-open');assert.equal((await calls()).length,0,'opening never sends');
  await app.locator('#cancelAIRewrite').click();assert.equal((await read()).doc,source);await open(action);
  if(await app.locator('#aiInstruction').isVisible())await app.locator('#aiInstruction').fill('Rewrite the synthetic example');
  if(action==='translate')await app.locator('#aiTargetLanguage').selectOption('English');
  await app.locator('#aiCloudConsent').uncheck();await app.locator('#generateAIRewrite').click();assert.equal((await calls()).length,0,'unchecked consent blocks');
  await app.locator('#aiCloudConsent').check();await app.locator('#generateAIRewrite').click();await app.locator('#replaceWithAIResult:not([disabled])').waitFor();
  const req=(await calls()).at(-1);assert.equal(req.text,action==='generate'?'':action==='continue'?'Before\n\nAlpha':'Alpha');if(action==='translate')assert.equal(req.targetLanguage,'English');
  await shot(action+'-02-result');await app.locator('#replaceWithAIResult').click();await app.locator('#aiRewriteDialog').waitFor({state:'hidden'});
  const expected=action==='generate'||action==='continue'?source.replace('Alpha','AlphaBeta'):source.replace('Alpha','Beta');assert.equal((await read()).doc,expected);await history(source,expected);
  await content.locator('> .cm-line').filter({hasText:/^After$/}).click();await page.keyboard.press('End');await page.keyboard.insertText('Z');assert.equal((await read()).doc,expected+'Z');await page.keyboard.press('Control+z');assert.equal((await read()).doc,expected);
  passed++;console.log('PASS',action);
 }
 if(!process.env.AUDIT_CASE||process.env.AUDIT_CASE==='proofread'){
  await prepare(source);await setMock({suggestions:[{original:'Alpha',replacement:'Beta',reason:'Synthetic correction'},{original:'After',replacement:'Later',reason:'Optional correction'}]});await open('proofread');await shot('proofread-01-open');assert.equal((await calls()).length,0);
  await app.locator('#aiReviewConsent').uncheck();await app.locator('#runAIReview').click();assert.equal((await calls()).length,0);await app.locator('#aiReviewConsent').check();await app.locator('#runAIReview').click();await app.locator('#applyAIReview:not([disabled])').waitFor();assert.equal((await calls()).at(-1).text,source);
  await app.locator('#clearAllAIReview').click();assert.equal(await app.locator('#applyAIReview').isDisabled(),true);await app.locator('[data-ai-review-index="0"]').check();await shot('proofread-02-choice');await app.locator('#applyAIReview').click();const expected=source.replace('Alpha','Beta');assert.equal((await read()).doc,expected);await history(source,expected);passed++;console.log('PASS proofread');
 }
 if(!process.env.AUDIT_CASE||process.env.AUDIT_CASE==='cancel'){
  await prepare(source);await setMock({mode:'pending'});await open('edit');await app.locator('#generateAIRewrite').click();await app.locator('#aiRewriteProgress').waitFor({state:'visible'});
  await frame.evaluate(()=>{const a=window.aiAudit;a.listener?.({requestId:a.calls.at(-1).requestId,text:'Partial'});});assert.equal(await app.locator('#aiResultText').inputValue(),'Partial');assert.equal(await app.locator('#replaceWithAIResult').isDisabled(),true);await shot('cancel-01-stream');
  await app.locator('#cancelAIRewrite').click();assert.equal(await frame.evaluate(()=>window.aiAudit.cancelled),1);await frame.evaluate(()=>window.aiAudit.pending.shift().resolve({text:'Late result'}));await page.waitForTimeout(100);assert.equal((await read()).doc,source);
  await setMock({mode:'failure'});await open('edit');await app.locator('#generateAIRewrite').click();await app.locator('#aiRewriteStatus').filter({hasText:'Synthetic service failure'}).waitFor();assert.equal(await app.locator('#aiResultText').inputValue(),'');assert.equal(await app.locator('#replaceWithAIResult').isDisabled(),true);await shot('cancel-02-error');await app.locator('#cancelAIRewrite').click();assert.equal((await read()).doc,source);passed++;console.log('PASS cancel/error/late result');
 }
 if(!process.env.AUDIT_CASE||process.env.AUDIT_CASE==='nested'){
  for(const[kind,block,selector]of [
   ['table','| Head | Other |\n| --- | --- |\n| Alpha | Cell |','td .cm-content'],
   ['code','```text\nAlpha\n```','.cm-live-code .cm-content'],
   ['details','<details open>\n<summary>Title</summary>\n\nAlpha\n\n</details>','.cm-live-prose .cm-content'],
   ['summary','<details open>\n<summary>Alpha</summary>\n\nBody\n\n</details>','.cm-live-details-title .cm-content'],
   ['footnote','Ref[^n]\n\n[^n]: Alpha','.cm-live-prose .cm-content'],
   ['comment','<!-- Alpha -->','.cm-live-comment .cm-content'],
   ['deep-table','Ref[^n]\n\n[^n]: Intro\n    \n    | Head | Other |\n    | --- | --- |\n    | Alpha | Cell |','td .cm-content']
  ]){
   const doc='Before\n\n'+block+'\n\nAfter';await prepare(doc);
   // Select through the rendered inner editor rather than the root source view.
   const inner=editor.locator(selector).filter({hasText:'Alpha'}).last();await inner.locator('.cm-line').filter({hasText:'Alpha'}).dblclick();
   await page.keyboard.press('Home');for(let i=0;i<5;i++)await page.keyboard.press('Shift+ArrowRight');assert.equal((await read()).selected,'Alpha',kind+' mapped selection');
   await open('edit');assert.equal(await app.locator('#aiOriginalText').inputValue(),'Alpha');await shot('nested-'+kind+'-01-original');await app.locator('#generateAIRewrite').click();await app.locator('#replaceWithAIResult:not([disabled])').waitFor();assert.equal((await calls()).at(-1).text,'Alpha');await app.locator('#replaceWithAIResult').click();
   const expected=doc.replace('Alpha','Beta');assert.equal((await read()).doc,expected,kind+' applies only selected text');await history(doc,expected);await shot('nested-'+kind+'-02-applied');passed++;console.log('PASS nested',kind);
  }
 }
 if(!process.env.AUDIT_CASE||process.env.AUDIT_CASE==='diff'){
  const target='Alpha\n\nKeep\n\nGamma',doc='Before\n\n'+target+'\n\nAfter';await prepare(doc,target);await setMock({result:'Beta\n\nKeep\n\nDelta'});await open('edit');await app.locator('#generateAIRewrite').click();await app.locator('#replaceWithAIResult:not([disabled])').waitFor();assert.equal(await app.locator('[data-ai-diff-index]').count(),2);
  await app.locator('#rejectAllAIDiff').click();assert.equal(await app.locator('#replaceWithAIResult').isDisabled(),true);await app.locator('[data-ai-diff-index="0"]').check();await app.locator('#aiDiffFilter').selectOption('pending');assert.equal(await app.locator('[data-ai-diff-index]').count(),1);await app.locator('#aiDiffFilter').selectOption('accepted');await app.locator('[data-ai-diff-locate="0"]').click();assert.equal((await read()).selected.trim(),'Alpha');await shot('diff-01-selected');
  await app.locator('#replaceWithAIResult').click();const expected=doc.replace('Alpha','Beta');assert.equal((await read()).doc,expected);await history(doc,expected);passed++;console.log('PASS partial diff/filter/locate');
 }
 if(!process.env.AUDIT_CASE||process.env.AUDIT_CASE==='privacy'){
  const target='Alpha audit@example.com ![Pixel](data:image/png;base64,aGVsbG8=)',doc='Before\n\n'+target+'\n\nAfter';await prepare(doc,target);await setMock({mode:'echo'});await open('edit');await shot('privacy-01-redaction');await app.locator('#generateAIRewrite').click();await app.locator('#replaceWithAIResult:not([disabled])').waitFor();const req=(await calls()).at(-1);assert.ok(!req.text.includes('audit@example.com'));assert.ok(!req.text.includes('aGVsbG8='));assert.ok(!req.text.includes('data:image'));
  assert.equal(await app.locator('#aiResultText').inputValue(),target.replace('Alpha','Beta'));await app.locator('#replaceWithAIResult').click();const expected=doc.replace('Alpha','Beta');assert.equal((await read()).doc,expected);await history(doc,expected);passed++;console.log('PASS privacy mask and local restoration');
 }
 if(!process.env.AUDIT_CASE||process.env.AUDIT_CASE==='review-guards'){
  await prepare(source);await setMock({suggestions:[{original:'Alpha',replacement:'Beta',reason:'Synthetic correction'}]});await open('proofread');if(await app.locator('#rerunAIReview').isVisible())await app.locator('#rerunAIReview').click();else await app.locator('#runAIReview').click();await app.locator('#applyAIReview:not([disabled])').waitFor();await app.locator('#cancelAIReview').click();
  await prepare(source+' changed');await open('proofread');await app.locator('#applyAIReview').click();assert.equal((await read()).doc,source+' changed');assert.ok((await app.locator('#aiReviewStatus').textContent()).length>0);await shot('review-guards-01-stale');
  await setMock({suggestions:[]});await app.locator('#rerunAIReview').click();await app.locator('#rerunAIReview').waitFor({state:'visible'});assert.equal(await app.locator('#applyAIReview').isVisible(),false);await shot('review-guards-02-no-issues');
  await setMock({mode:'pending'});await app.locator('#rerunAIReview').click();await app.locator('#aiReviewProgress').waitFor({state:'visible'});const before=await frame.evaluate(()=>window.aiAudit.cancelled);await app.locator('#cancelAIReview').click();assert.equal(await frame.evaluate(()=>window.aiAudit.cancelled),before+1);await frame.evaluate(()=>window.aiAudit.pending.shift().resolve({suggestions:[{original:'Alpha',replacement:'LATE'}]}));await page.waitForTimeout(100);assert.equal((await read()).doc,source+' changed');passed++;console.log('PASS review stale/no-issues/cancel/late result');
 }
 assert.deepEqual(errors,[]);console.log(JSON.stringify({PASS:passed,pageErrors:errors,blockedOrigins:[...new Set(blocked)],transport:'synthetic only'}));
}catch(e){if(page&&process.env.AUDIT_OUTPUT)await page.screenshot({path:process.env.AUDIT_OUTPUT+'/failure.png'});throw e;}finally{await browser?.close();await server.close();}
