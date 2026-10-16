import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import {createServer} from 'vite';
const {chromium}=createRequire(import.meta.url)(process.env.PLAYWRIGHT_MODULE||'playwright');
const server=await createServer({root:fileURLToPath(new URL('..',import.meta.url)),server:{host:'127.0.0.1',port:0,watch:null,hmr:false},logLevel:'error'});
let browser,page;
try{
 await server.listen();browser=await chromium.launch({headless:true,executablePath:process.env.BROWSER_EXECUTABLE||undefined});page=await browser.newPage({viewport:{width:1500,height:1000}});page.setDefaultTimeout(10000);
 const errors=[];page.on('pageerror',e=>errors.push(e.message));await page.route('**/*',route=>new URL(route.request().url()).hostname==='127.0.0.1'?route.continue():route.abort());await page.goto(server.resolvedUrls.local[0]+'tests/fixtures/cross-format-audit.html');
 const rich=page.getByLabel('隔离富文本',{exact:true});await rich.click();await rich.press('Control+a');await rich.press('Control+c');
 const app=page.frameLocator('iframe');await app.locator('#newFileButton').evaluate(async()=>{await import('/src/main.js');});await app.locator('#newFileButton').click();await app.locator('#hideLivePreviewButton').click();const editor=app.locator('#markdownEditor > .cm-editor'),content=editor.locator('> .cm-scroller > .cm-content');
 const read=()=>editor.evaluate(async el=>{const{EditorView}=await import('/node_modules/@codemirror/view/dist/index.js');const s=EditorView.findFromDOM(el).state;return{doc:s.doc.toString(),ranges:s.selection.ranges.map(r=>[r.anchor,r.head])};});
 const shot=async name=>{if(process.env.AUDIT_OUTPUT)await page.screenshot({path:`${process.env.AUDIT_OUTPUT}/${name}.png`});};
 const reset=async doc=>{await app.locator('[data-editor-presentation="source"]').click();await content.focus();await page.keyboard.press('Control+a');await page.keyboard.insertText(doc);await page.keyboard.press('Control+Home');await app.locator('[data-editor-presentation="live"]').click();await page.waitForTimeout(100);};
 const contexts=[['root',t=>t],['details',t=>'<details open>\n<summary>Title</summary>\n\n'+t+'\n\n</details>'],['table',t=>'| Head |\n| --- |\n| '+t+' |'],['footnote',t=>'Note[^n]\n\n[^n]: '+t]];
 const formats=[['bold-em','**ALPHA** gap *OMEGA*','<strong>AL</strong>','<em>GA</em>',['strong'],['em']],['color-u','<span data-md-color="spectrum-3-red">ALPHA</span> gap <u>OMEGA</u>','<span data-md-color="spectrum-3-red">AL</span>','<u>GA</u>',['color'],['u']],['link-mark','[ALPHA](https://example.com) gap ==OMEGA==','[AL](https://example.com)','<mark>GA</mark>',['link'],['mark']],['nested','**<u>ALPHA</u>** gap *<mark>OMEGA</mark>*','<strong><u>AL</u></strong>','<em><mark>GA</mark></em>',['strong','u'],['em','mark']]];
 const style=word=>editor.evaluate((el,word)=>{const w=document.createTreeWalker(el,NodeFilter.SHOW_TEXT);let n;while(n=w.nextNode())if(n.textContent.includes(word)&&n.parentElement.closest('.cm-line')){let p=n.parentElement,classes=[];while(p&&p!==el){classes.push(...p.classList);p=p.parentElement;}return classes;}throw new Error('Missing visible '+word);},word);
 let passed=0;
 for(const[kind,wrap]of contexts)for(const[name,text,left,right,leftStyles,rightStyles]of formats)for(const reverse of [false,true])for(const action of ['paste','delete','type','whole']){
  const id=`${kind}-${name}-${reverse?'backward':'forward'}-${action}`;if(process.env.AUDIT_CASE&&!id.includes(process.env.AUDIT_CASE))continue;
  const doc='Before\n\n'+wrap(text)+'\n\nAfter';await reset(doc);const field=kind==='root'?editor:editor.locator('.cm-live-inner').last();await field.waitFor();
  const points=await field.evaluate(async(el,whole)=>{const{EditorView}=await import('/node_modules/@codemirror/view/dist/index.js');const v=EditorView.findFromDOM(el),source=v.state.doc.toString();return[source.indexOf('ALPHA')+(whole?0:2),source.indexOf('OMEGA')+(whole?5:3)].map(at=>{const r=v.coordsAtPos(at);return{x:r.left+.2,y:(r.top+r.bottom)/2};});},action==='whole');
  if(reverse)points.reverse();await page.mouse.move(points[0].x,points[0].y);await page.mouse.down();await page.mouse.move(points[1].x,points[1].y,{steps:15});await page.mouse.up();await shot(id+'-01-selected');const before=await read();assert.ok(before.ranges[0][0]!==before.ranges[0][1]);if(action==='type')await page.keyboard.insertText('PLAIN');else await page.keyboard.press(action==='delete'?'Backspace':'Control+v');await page.waitForTimeout(150);await shot(id+'-02-replaced');const after=await read();console.log(id,JSON.stringify({before,after}));
  if(!process.env.AUDIT_BASELINE){
   const insert=action==='delete'?'':action==='type'?'PLAIN':'**RICH** *TEXT*',prefix=action==='whole'?'':left,suffix=action==='whole'?'':right;
   assert.equal(after.doc,'Before\n\n'+wrap(prefix+insert+suffix)+'\n\nAfter');
   if(action!=='whole'){for(const css of leftStyles)assert.ok((await style('AL')).includes('cm-live-'+css));for(const css of rightStyles)assert.ok((await style('GA')).includes('cm-live-'+css));}
   if(action==='paste'||action==='whole'){assert.ok((await style('RICH')).includes('cm-live-strong'));assert.ok((await style('TEXT')).includes('cm-live-em'));}
   await page.waitForTimeout(600);await page.keyboard.insertText('Q');await shot(id+'-03-follow-up');const follow=await read();assert.equal(follow.doc,'Before\n\n'+wrap(prefix+insert+'Q'+suffix)+'\n\nAfter');assert.equal((await style('Q')).some(c=>/^cm-live-(strong|em|color|u|mark|link)$/.test(c)),false);
   await page.keyboard.press('Control+z');assert.equal((await read()).doc,after.doc);await page.keyboard.press('Control+z');assert.equal((await read()).doc,doc);await page.keyboard.press('Control+y');assert.equal((await read()).doc,after.doc);
   if(action==='paste'&&leftStyles.includes('strong')){
    const points=await field.evaluate(async el=>{const{EditorView}=await import('/node_modules/@codemirror/view/dist/index.js');const v=EditorView.findFromDOM(el),at=v.state.doc.toString().indexOf('AL');return[at,at+2].map(p=>{const r=v.coordsAtPos(p);return{x:r.left+.2,y:(r.top+r.bottom)/2};});});
    await page.mouse.click(points[0].x,points[0].y);await page.keyboard.down('Shift');await page.mouse.click(points[1].x,points[1].y);await page.keyboard.up('Shift');await page.keyboard.press('Control+b');await shot(id+'-04-toggle');
    assert.equal((await read()).doc,'Before\n\n'+wrap(prefix.replace('<strong>','').replace('</strong>','')+insert+suffix)+'\n\nAfter');assert.equal((await style('AL')).includes('cm-live-strong'),false);
    const paint=await field.locator('> .cm-scroller > .cm-live-selection-layer .cm-selectionBackground').evaluateAll(els=>els.map(el=>el.getBoundingClientRect().width));assert.ok(paint.length>0&&paint.every(width=>width>0&&width<50),'Two selected letters must not highlight the whole line');
    if(name==='nested')assert.ok((await style('AL')).includes('cm-live-u'));await page.keyboard.press('Control+z');assert.equal((await read()).doc,after.doc);
   }
  }
  passed++;
 }
 assert.deepEqual(errors,[]);console.log(JSON.stringify({passed,pageErrors:errors}));
}catch(error){if(page&&process.env.AUDIT_OUTPUT)await page.screenshot({path:`${process.env.AUDIT_OUTPUT}/failure.png`});throw error;}finally{await browser?.close();await server.close();}
