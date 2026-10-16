// Actual controls on isolated synthetic documents. Product APIs are read-only.
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import {createServer} from 'vite';
const {chromium}=createRequire(import.meta.url)(process.env.PLAYWRIGHT_MODULE||'playwright');
const server=await createServer({root:fileURLToPath(new URL('..',import.meta.url)),server:{host:'127.0.0.1',port:0,watch:null,hmr:false},logLevel:'error'});
const sources={
 sequence:'sequenceDiagram\n participant A as Alpha\n participant B as Beta\n A->>B: First',
 gantt:'gantt\n title Plan\n dateFormat YYYY-MM-DD\n section Phase\n First :t1, 2026-10-01, 2d',
 timeline:'timeline\n title Plan\n 2026 : First\n : Second',
 kanban:'kanban\n  todo[Todo]\n    one[First]\n  done[Done]\n    two[Second]',
 pie:'pie showData\n title Plan\n "Alpha" : 10\n "Beta" : 20',
 sankey:'sankey-beta\nAlpha,Beta,10\nBeta,Gamma,20',
 class:'classDiagram\n class A {\n +int value\n }\n class B {\n }\n A --> B : uses',
 er:'erDiagram\n A {\n int value PK\n }\n B {\n int id PK\n }\n A ||--o{ B : owns',
};
let browser,page;
try{
 await server.listen();browser=await chromium.launch({headless:true,executablePath:process.env.BROWSER_EXECUTABLE||undefined});
 const ids=process.env.AUDIT_CASE?[process.env.AUDIT_CASE]:Object.keys(sources),results=[];
 for(const id of ids){
  assert.ok(sources[id]);console.log('START',id);page=await browser.newPage({viewport:{width:1700,height:1050}});page.setDefaultTimeout(12000);const errors=[];
  page.on('pageerror',e=>errors.push(e.message));await page.route('**/*',r=>new URL(r.request().url()).hostname==='127.0.0.1'?r.continue():r.abort());
  await page.goto(server.resolvedUrls.local[0]);await page.locator('body').evaluate(()=>import('/src/main.js'));
  await page.locator('#newFileButton').click();await page.locator('#hideLivePreviewButton').click();
  if(process.env.AUDIT_THEME==='dark')await page.locator('#colorModeButton').click();
  const editor=page.locator('#markdownEditor > .cm-editor'),source=page.locator('#diagramSource'),rows=page.locator('#structuredDiagramRows tr'),settings=page.locator('#structuredDiagramSettings label');
  const read=()=>editor.evaluate(async el=>{const{EditorView}=await import('/node_modules/@codemirror/view/dist/index.js');return EditorView.findFromDOM(el).state.doc.toString();});
  const shot=async name=>{if(process.env.AUDIT_OUTPUT){await page.waitForTimeout(300);await page.screenshot({path:process.env.AUDIT_OUTPUT+'/'+id+'-'+name+'.png'});}};
  const field=(row,key)=>rows.nth(row).locator(`[data-field="${key}"]`);
  const set=async(row,key,value)=>{const control=field(row,key);if(await control.evaluate(el=>el.tagName)==='SELECT')await control.selectOption(value);else await control.fill(value);};
  const setting=async(index,value)=>{const input=settings.nth(index).locator('input');if(await input.getAttribute('type')==='checkbox')await input.setChecked(value);else await input.fill(value);};
  const values=()=>rows.evaluateAll(rs=>rs.map(r=>Object.fromEntries([...r.querySelectorAll('[data-field]:not(:disabled)')].map(i=>[i.dataset.field,i.value]))));
  const settingsValues=()=>settings.locator('input,select').evaluateAll(cs=>cs.map(i=>i.type==='checkbox'?i.checked:i.value));
  const normalize=values=>['class','er'].includes(id)?values.map(v=>JSON.stringify(v)).sort():values;
  const history=async key=>{await editor.locator('> .cm-scroller > .cm-content').focus();await page.keyboard.press(key);};
  const add=async()=>{const n=await rows.count();await page.locator('#addStructuredDiagramRow').click();assert.equal(await rows.count(),n+1);return n;};
  const remove=async i=>{const n=await rows.count();await rows.nth(i).locator('[data-structured-remove]').click();assert.equal(await rows.count(),n-1);};
  await page.locator('[data-format="diagram-builder"]').click();await page.locator('[data-diagram-category="all"]').click();await page.locator('#diagramSearch').fill(id);await page.locator(`[data-diagram-template="${id}"]`).click();
  await page.locator('#flowchartSourceMode').click();await source.fill(sources[id]);await page.locator('#flowchartVisualMode').click();await page.locator('#structuredDiagramEditor').waitFor({state:'visible'});await shot('01-open');
  let options=0;
  if(id==='sequence'){
   await setting(0,true);assert.match(await source.inputValue(),/\n\s*autonumber\n/);await setting(0,false);assert.doesNotMatch(await source.inputValue(),/autonumber/);await setting(0,true);
   for(const type of ['actor','participant']){await set(0,'type',type);assert.ok((await source.inputValue()).includes(type+' A as Alpha'));options++;}
   await set(0,'label','Audit Actor');await set(2,'from','B');await set(2,'to','A');await set(2,'label','Audit Message');
   for(const type of ['->>','-->>','->','-->','-)']){await set(2,'type',type);assert.ok((await source.inputValue()).includes('B'+type+'A: Audit Message'));options++;}
  }else if(id==='gantt'){
   await setting(0,'Audit Plan');await setting(1,'YYYY/MM/DD');await set(0,'start','2026/10/01');await setting(2,'weekends');await set(0,'section','Audit Phase');await set(0,'task','Audit Task');await set(0,'duration','3d');
   for(const status of ['done','active','crit','milestone','']){await set(0,'status',status);assert.ok((await source.inputValue()).includes('Audit Task :'+(status?status+', ':'')+'t1, 2026/10/01, 3d'));options++;}
   const n=await add();await set(n,'section','Audit Phase');await set(n,'task','Dependent');await set(n,'start','after t1');await set(n,'duration','1d');assert.match(await source.inputValue(),/Dependent :[^\n]*after t1, 1d/);
  }else if(id==='timeline'){
   await setting(0,'Audit Timeline');await set(0,'period','2027');await set(1,'period','2027');await set(0,'event','Audit First');await set(1,'event','Audit Second');const text=await source.inputValue();assert.equal((text.match(/2027\s*:/g)||[]).length,1);assert.match(text,/: Audit First\n\s*: Audit Second/);
  }else if(id==='kanban'){
   await set(0,'column','Done');await set(0,'task','Audit Task');const text=await source.inputValue();assert.equal((text.match(/\[Done\]/g)||[]).length,1);assert.ok(text.includes('[Audit Task]'));assert.ok(!text.includes('[Todo]'));
  }else if(id==='pie'||id==='sankey'){
   if(id==='pie'){await setting(0,'Audit Pie');await setting(1,false);assert.match(await source.inputValue(),/^pie\n/);await setting(1,true);await set(0,'label','审计类别');}
   else {await set(0,'from','审计来源');await set(0,'to','审计目标');}
   await set(0,'value','42');const valid=await source.inputValue();assert.ok(valid.includes('42'));
   for(const invalid of ['-1','']){await set(0,'value',invalid);assert.equal(await page.locator('#insertDiagram').isDisabled(),true);assert.equal(await source.inputValue(),valid);await set(0,'value','42');assert.equal(await page.locator('#insertDiagram').isEnabled(),true);}
  }else{
   const findKind=async kind=>{const data=await values();return data.findIndex(v=>v.kind===kind);};
   const member=await findKind('member'),relation=await findKind('relation');await set(member,'name','auditValue');await set(member,'dataType','string');
   for(const modifier of id==='class'?['','+','-','#','~']:['','PK','FK','UK']){await set(member,'modifier',modifier);assert.ok((await source.inputValue()).includes(id==='class'?modifier+'string auditValue':'string auditValue'+(modifier?' '+modifier:'')));options++;}
   await set(relation,'label','audit_owns');await set(relation,'owner','B');await set(relation,'target','A');
   if(id==='class'){await set(relation,'left','1');await set(relation,'right','*');}
   for(const type of id==='class'?['-->','<|--','*--','o--','..>','..|>','--','..']:['||--o{','||--|{','||--||','}o--o{','|o--o{','||..o{']){await set(relation,'relation',type);assert.ok((await source.inputValue()).includes(id==='class'?'B "1" '+type+' "*" A : audit_owns':'B '+type+' A : audit_owns'));options++;}
   const valid=await source.inputValue();await set(relation,'target','Missing');assert.equal(await page.locator('#insertDiagram').isDisabled(),true);assert.equal(await source.inputValue(),valid);await set(relation,'target','A');
   const n=await add();await set(n,'owner','C');
   for(const kind of ['member','relation','entity']){
    await set(n,'kind',kind);const allowed=kind==='entity'?['kind','owner']:kind==='member'?['kind','owner','name','dataType','modifier']:['kind','owner','target','relation','label','left','right'];
    for(const key of await rows.nth(n).locator('[data-field]').evaluateAll(cs=>cs.map(c=>c.dataset.field)))assert.equal(await field(n,key).isEnabled(),allowed.includes(key),id+' '+kind+' '+key);
   }
   await remove(n);
  }
  // Added rows must serialize, and deleting just that row must restore the draft.
  const before=await source.inputValue(),n=await add();
  const additions={sequence:{type:'->>',from:'A',to:'B',label:'TemporaryAudit'},gantt:{section:'Extra',task:'TemporaryAudit',start:'2026/10/08',duration:'1d'},timeline:{period:'2028',event:'TemporaryAudit'},kanban:{column:'Extra',task:'TemporaryAudit'},pie:{label:'TemporaryAudit',value:'7'},sankey:{from:'TemporaryAudit',to:'ExtraTarget',value:'7'},class:{owner:'TemporaryAudit'},er:{owner:'TemporaryAudit'}};
  for(const[key,value]of Object.entries(additions[id]))await set(n,key,value);assert.ok((await source.inputValue()).includes('TemporaryAudit'));await remove(n);assert.equal(await source.inputValue(),before,id+' removing added row restores exact draft');
  // Exercise the shared paste control with the actual displayed column order.
  const keys=await rows.first().locator('[data-field]').evaluateAll(cs=>cs.map(c=>c.dataset.field));
  const table=await rows.evaluateAll(rs=>rs.map(r=>[...r.querySelectorAll('[data-field]')].map(c=>c.value)));
  // Pasted Gantt rows receive deterministic generated IDs; reference those IDs.
  if(id==='gantt')for(const row of table)row[keys.indexOf('start')]=row[keys.indexOf('start')].replace('after t1','after task1');
  const paste=async(text,header=false)=>{const panel=page.locator('#diagramPastePanel');if(!await panel.evaluate(el=>el.open))await panel.locator('summary').click();await page.locator('#diagramPasteHeader').setChecked(header);await page.locator('#diagramPasteText').fill(text);await page.locator('#applyDiagramPaste').click();};
  const beforePaste=await source.inputValue();await paste('wrong-column-count');assert.equal(await source.inputValue(),beforePaste);assert.equal(await read(),'');assert.ok(await page.locator('#diagramPasteText').inputValue());
  await paste([keys,...table].map(r=>r.join('\t')).join('\n'),true);assert.equal(await page.locator('#diagramPastePanel').evaluate(el=>el.open),false);assert.equal(await read(),'');
  const pasted=await source.inputValue();await paste(table.map(r=>r.map(v=>'"'+v.replaceAll('"','""')+'"').join(',')).join('\n'));assert.equal(await source.inputValue(),pasted,id+' TSV and quoted CSV agree');assert.equal(await read(),'');
  await shot('02-edited');const expectedRows=normalize(await values()),expectedSettings=await settingsValues(),edited=await source.inputValue();
  await page.locator('#insertDiagram').click();await page.locator('#diagramDialog').waitFor({state:'hidden'});const card=editor.locator('.cm-diagram-card');await card.locator('svg').first().waitFor();assert.doesNotMatch(await card.getAttribute('class'),/is-error/);const document=await read();assert.equal(document.trim(),'```mermaid\n'+edited.trim()+'\n```');await shot('03-inserted');
  const labels={sequence:['Audit Message','Audit Actor'],gantt:['Audit Task','Dependent'],timeline:['Audit First','Audit Second'],kanban:['Audit Task','Second'],pie:['审计类别','Beta'],sankey:['审计来源','审计目标','Gamma'],class:['auditValue','audit_owns'],er:['auditValue','audit_owns']}[id];
  for(const text of labels){
   const label=card.locator('svg text').filter({hasText:text}).first();await label.waitFor({state:'visible'});await label.scrollIntoViewIfNeeded();
   const visible=await label.evaluate(el=>{const b=el.getBoundingClientRect();let left=0,top=0,right=innerWidth,bottom=innerHeight;for(let p=el.parentElement;p;p=p.parentElement){const s=getComputedStyle(p),r=p.getBoundingClientRect();if(/auto|scroll|hidden|clip/.test(s.overflowX)){left=Math.max(left,r.left);right=Math.min(right,r.right);}if(/auto|scroll|hidden|clip/.test(s.overflowY)){top=Math.max(top,r.top);bottom=Math.min(bottom,r.bottom);}}return{pass:b.width>0&&b.height>0&&b.left>=left-2&&b.right<=right+2&&b.top>=top-2&&b.bottom<=bottom+2,box:{left:b.left,right:b.right,top:b.top,bottom:b.bottom},clip:{left,right,top,bottom}};});
   assert.equal(visible.pass,true,id+' label '+text+' '+JSON.stringify(visible));
  }
  await shot('03-labels-visible');await card.focus();await page.keyboard.press('Enter');await page.locator('#diagramDialog').waitFor({state:'visible'});await page.locator('#structuredDiagramEditor').waitFor({state:'visible'});assert.equal(await source.inputValue(),edited);assert.deepEqual(normalize(await values()),expectedRows);assert.deepEqual(await settingsValues(),expectedSettings);
  await add();await page.locator('#cancelDiagram').click();assert.equal(await read(),document);await history('Control+z');assert.equal(await read(),'');await history('Control+y');assert.equal(await read(),document);await card.locator('svg').first().waitFor();await shot('04-redone');assert.deepEqual(errors,[]);results.push({id,options,addRemove:true,paste:true,labels:true,source:true,reopen:true,cancel:true,history:true,pageErrors:errors});console.log(JSON.stringify(results.at(-1)));await page.close();
 }
 console.log(JSON.stringify({PASS:results.length,ids:results.map(r=>r.id)}));
}catch(error){if(page&&!page.isClosed()&&process.env.AUDIT_OUTPUT)await page.screenshot({path:process.env.AUDIT_OUTPUT+'/failure.png'});throw error;}finally{await browser?.close();await server.close();}
