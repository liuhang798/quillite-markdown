// All writes are UI actions in a fresh synthetic-document browser context.
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import {createServer} from 'vite';
const {chromium}=createRequire(import.meta.url)(process.env.PLAYWRIGHT_MODULE||'playwright');
const cases=[
 ['context-nested',`C4Context
title Nested context
Enterprise_Boundary(org, "Enterprise") {
 Person(user, "Reader", "Local user")
 System_Boundary(app, "Application") {
  System(editor, "Editor", "Markdown")
  SystemDb(store, "Storage", "Documents")
 }
}
Rel(user, editor, "Writes")
Rel(editor, store, "Saves")`,['Reader','Editor','Storage']],
 ['container',`C4Container
title Container audit
Person(user, "Reader", "Local user")
System_Boundary(app, "Application") {
 Container(web, "Web interface", "JavaScript", "Editing")
 Container(api, "Backend", "Go", "Files")
 ContainerDb(db, "Document store", "Disk", "Markdown")
}
Rel(user, web, "Writes")
Rel(web, api, "Calls")
Rel(api, db, "Saves")`,['Reader','Web interface','Backend','Document store']],
 ['component',`C4Component
title Component audit
Container_Boundary(app, "Editor boundary") {
 Component(input, "Input handler", "JavaScript", "Keyboard")
 Component(parser, "Parser", "JavaScript", "Markdown")
 ComponentDb(cache, "Cache", "Memory", "Tokens")
}
Rel(input, parser, "Parses")
Rel(parser, cache, "Caches")`,['Input handler','Parser','Cache']],
 ['dynamic',`C4Dynamic
title Dynamic audit
Container(web, "Web interface", "JavaScript", "Editing")
Container(api, "Backend", "Go", "Files")
ContainerDb(db, "Document store", "Disk", "Markdown")
Rel(web, api, "Save request")
Rel(api, db, "Write document")
Rel_Back(web, api, "Saved")`,['Web interface','Backend','Document store']],
 ['deployment',`C4Deployment
title Deployment audit
Deployment_Node(machine, "Desktop", "Windows") {
 Deployment_Node(runtime, "WebView", "Runtime") {
  Container(web, "Web interface", "JavaScript", "Editing")
 }
 Deployment_Node(service, "Native process", "Go") {
  Container(api, "Backend", "Go", "Files")
 }
}
Rel(web, api, "Bridge")`,['Web interface','Backend']],
 ['multirow',`C4Context
title Multirow audit
${Array.from({length:8},(_,i)=>`System(s${i}, "Node ${i+1}", "Audit system")`).join('\n')}
${Array.from({length:7},(_,i)=>`Rel(s${i}, s${i+1}, "Next")`).join('\n')}`,Array.from({length:8},(_,i)=>`Node ${i+1}`)]
];
const server=await createServer({root:fileURLToPath(new URL('..',import.meta.url)),server:{host:'127.0.0.1',port:0,watch:null,hmr:false},logLevel:'error'});
let browser,page;
try{
 await server.listen();browser=await chromium.launch({headless:true,executablePath:process.env.BROWSER_EXECUTABLE||undefined});page=await browser.newPage({viewport:{width:1600,height:1000}});page.setDefaultTimeout(20000);
 const errors=[];page.on('pageerror',e=>errors.push(e.message));await page.goto(server.resolvedUrls.local[0]+'tests/fixtures/app-drag-audit.html');const app=page.frameLocator('iframe');
 await app.locator('#newFileButton').click();await app.locator('#hideLivePreviewButton').click();if(process.env.AUDIT_THEME==='dark')await app.locator('#colorModeButton').click();
 const editor=app.locator('#markdownEditor > .cm-editor'),content=editor.locator('> .cm-scroller > .cm-content'),card=editor.locator('.cm-diagram-card'),source=app.locator('#diagramSource');
 const read=()=>editor.evaluate(async el=>{const{EditorView}=await import('/node_modules/@codemirror/view/dist/index.js');return EditorView.findFromDOM(el).state.doc.toString();});
 const shot=async name=>{if(process.env.AUDIT_OUTPUT)await page.screenshot({path:`${process.env.AUDIT_OUTPUT}/${name}.png`});};
 const ready=async()=>{await card.locator('svg').waitFor();assert.doesNotMatch(await card.getAttribute('class'),/is-error/);};
 const inspect=()=>card.evaluate(card=>{const svg=card.querySelector('svg'),vb=svg.viewBox.baseVal,b=svg.getBBox(),port=card.querySelector('.cm-diagram-body').getBoundingClientRect();return{type:card.querySelector('[data-mermaid-type]').dataset.mermaidType,groups:svg.querySelectorAll('[data-c4-compacted]').length,inside:b.x>=vb.x-2&&b.y>=vb.y-2&&b.x+b.width<=vb.x+vb.width+2&&b.y+b.height<=vb.y+vb.height+2,texts:[...svg.querySelectorAll('text')].map(el=>({text:el.textContent,top:el.getBoundingClientRect().top-port.top,bottom:el.getBoundingClientRect().bottom-port.top})),height:svg.getBoundingClientRect().height};});
 const reachable=async label=>{
  const position=()=>card.evaluate((el,label)=>{const node=[...el.querySelectorAll('svg text')].find(t=>t.textContent===label);if(!node)return null;const b=(node.closest('.c4-shape')||node).getBoundingClientRect(),p=el.querySelector('.cm-diagram-body').getBoundingClientRect();return{x:b.x,y:b.y,right:b.right,bottom:b.bottom,px:p.x,py:p.y,pr:p.right,pb:p.bottom};},label);
  for(let i=0;i<4;i++){const p=await position();assert.ok(p,'label exists '+label);if(p.x>=p.px&&p.right<=p.pr&&p.y>=p.py&&p.bottom<=p.pb)return;
   // Use actual wheel input at the visible viewport centre, not DOM scroll mutation.
   const frame=await app.locator('body').boundingBox();
   await page.mouse.move(frame.x+(p.px+p.pr)/2,frame.y+(p.py+p.pb)/2);
   await page.mouse.wheel(p.x<p.px?p.x-p.px-30:p.right>p.pr?p.right-p.pr+30:0,p.y<p.py?p.y-p.py-30:p.bottom>p.pb?p.bottom-p.pb+30:0);await page.waitForTimeout(180);
  }
  assert.fail('label unreachable '+label+' '+JSON.stringify(await position()));
 };
 const selected=process.env.AUDIT_CASE?cases.filter(([id])=>id===process.env.AUDIT_CASE):cases;
 const names={'context-nested':'C4 系统上下文图',container:'C4 容器图',component:'C4 组件图',dynamic:'C4 动态图',deployment:'C4 部署图',multirow:'C4 系统上下文图'};
 for(const[id,code,labels]of selected){
  console.log('START',id);const doc='```mermaid\n'+code+'\n```\n\nAFTER';await app.locator('[data-editor-presentation="source"]').click();await content.focus();await page.keyboard.press('Control+a');await page.keyboard.insertText(doc);await page.keyboard.press('Control+End');await app.locator('[data-editor-presentation="live"]').click();await ready();
  const info=await inspect();console.log(JSON.stringify({id,...info}));assert.equal(info.type,'c4');assert.ok(info.inside,id+' geometry contained');assert.ok(info.groups<=1);await shot(id+'-01-initial');
  assert.equal(await card.locator('.cm-diagram-label').textContent(),names[id]);
  const first=await card.evaluate((el,label)=>{const text=[...el.querySelectorAll('svg text')].find(t=>t.textContent===label),node=text?.closest('.c4-shape');if(!node)return null;const r=node.getBoundingClientRect(),p=el.querySelector('.cm-diagram-body').getBoundingClientRect();return{top:r.top-p.top,bottom:r.bottom-p.top};},labels[0]);assert.ok(first&&first.top>=0&&first.bottom<=420,id+' entire first node in initial viewport '+JSON.stringify(first));
  for(const label of labels)await reachable(label);assert.equal(await read(),doc);await shot(id+'-02-last-node');
  await card.hover();await card.locator('[data-diagram-action="source"]').click();await editor.getByRole('button',{name:'返回渲染',exact:true}).click();await ready();assert.equal(await read(),doc);await shot(id+'-03-returned');
  await card.focus();await page.keyboard.press('Enter');await app.locator('#diagramDialog').waitFor({state:'visible'});if(!await source.isVisible())await app.locator('#flowchartSourceMode').click();assert.equal((await source.inputValue()).trim(),code.trim());
  assert.equal(await app.locator('#diagramTemplateName').textContent(),names[id]);
  const changed=code.replace(labels[labels.length-1],labels[labels.length-1]+' edited');await source.fill(changed);await app.locator('#insertDiagram').click();await app.locator('#diagramDialog').waitFor({state:'hidden'});await ready();const edited=await read();assert.equal(edited,doc.replace(code,changed));await reachable(labels[labels.length-1]+' edited');await shot(id+'-04-edited');
  await content.focus();await page.keyboard.press('Control+z');assert.equal(await read(),doc);await ready();await page.keyboard.press('Control+y');assert.equal(await read(),edited);await ready();
  for(let n=0;n<2;n++){const before=await card.locator('svg').getAttribute('id');await app.locator('#colorModeButton').click();for(let i=0;i<100;i++){if(await card.locator('svg').count()&&await card.locator('svg').getAttribute('id')!==before)break;await page.waitForTimeout(50);}await ready();assert.notEqual(await card.locator('svg').getAttribute('id'),before);assert.equal(await read(),edited);assert.ok((await inspect()).inside);}
  await reachable(labels[labels.length-1]+' edited');await shot(id+'-05-restored');console.log(JSON.stringify({id,allLabelsReachable:true,edit:true,sourceReturn:true,undoRedo:true,themeReturn:true}));
 }
 // Switch language through the application's real menu, never preferences injection.
 await app.locator('#moreButton').click();await app.locator('[data-settings-submenu="language"]').click();await app.locator('[data-language="en"]').click();
 const english={'context-nested':'C4 context',container:'C4 container',component:'C4 component',dynamic:'C4 dynamic',deployment:'C4 deployment',multirow:'C4 context'};
 for(const[id,code]of selected){
  const doc='```mermaid\n'+code+'\n```\n\nAFTER';await app.locator('[data-editor-presentation="source"]').click();await content.focus();await page.keyboard.press('Control+a');await page.keyboard.insertText(doc);await page.keyboard.press('Control+End');await app.locator('[data-editor-presentation="live"]').click();await ready();assert.equal(await card.locator('.cm-diagram-label').textContent(),english[id]);
  await card.focus();await page.keyboard.press('Enter');await app.locator('#diagramDialog').waitFor({state:'visible'});assert.equal(await app.locator('#diagramTemplateName').textContent(),english[id]);await app.locator('#cancelDiagram').click();assert.equal(await read(),doc);await shot(id+'-06-english-name');
 }
 assert.deepEqual(errors,[]);console.log(JSON.stringify({PASS:selected.length,englishNames:selected.length,pageErrors:errors}));
}catch(e){if(page&&process.env.AUDIT_OUTPUT)await page.screenshot({path:`${process.env.AUDIT_OUTPUT}/failure.png`});throw e;}finally{await browser?.close();await server.close();}
