// Fresh isolated browser; no real documents, profiles or external traffic.
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import {createServer} from 'vite';
const {chromium}=createRequire(import.meta.url)(process.env.PLAYWRIGHT_MODULE||'playwright');
const output=process.env.AUDIT_OUTPUT;if(!output)throw Error('AUDIT_OUTPUT required');
const server=await createServer({root:process.env.AUDIT_APP_ROOT||fileURLToPath(new URL('..',import.meta.url)),server:{host:'127.0.0.1',port:0,watch:null,hmr:false},logLevel:'error'});
const prefix='# 我是标题\n\n**加粗**\n\n';
let browser,page;
try{
 await server.listen();browser=await chromium.launch({headless:true,executablePath:process.env.BROWSER_EXECUTABLE||undefined});
 page=await browser.newPage({viewport:{width:1500,height:950}});page.setDefaultTimeout(10000);const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.addInitScript(()=>{localStorage.setItem('language','zh-CN');localStorage.setItem('editorLayout','editor-left');});
 await page.route('**/*',r=>new URL(r.request().url()).hostname==='127.0.0.1'?r.continue():r.abort());
 await page.goto(server.resolvedUrls.local[0]);
 await page.evaluate(async text=>{await import('/src/main.js');window.quilliteMarkdown.openFile=async()=>({path:'synthetic-input.md',name:'synthetic-input.md',directory:'.',content:text,revision:'a'.repeat(64)});window.quilliteMarkdown.saveFile=async()=>null;},prefix);
 await page.locator('#openFileButton').click();await page.locator('#editButton').click();
 const editor=page.locator('#markdownEditor > .cm-editor'),content=editor.locator('> .cm-scroller > .cm-content');
 const read=()=>editor.evaluate(async el=>{const{EditorView}=await import('/node_modules/@codemirror/view/dist/index.js');const v=EditorView.findFromDOM(el),r=v.state.selection.main;return{text:v.state.doc.toString(),anchor:r.anchor,head:r.head,empty:r.empty};});
 const reset=async mode=>{await page.locator('[data-editor-presentation="source"]').click();await content.fill(prefix);await content.press('Control+End');await page.locator(`[data-editor-presentation="${mode}"]`).click();};
 for(const mode of ['live','source'])for(const [command,open,close] of [['italic','*','*'],['bold','**','**'],['strikethrough','~~','~~'],['highlight','==','=='],['underline','<u>','</u>'],['inline-code','`','`']]){
  await reset(mode);const button=page.locator(`#editorFormatBar [data-format="${command}"]`);
  if(await button.isVisible())await button.click();else{await page.locator('#moreFormatButton').click();await page.locator(`#moreFormatMenu [data-format-command="${command}"]:visible`).click();}
  const placeholder=await read();assert.equal(placeholder.empty,false,'toolbar selects placeholder');
  // No click or focus call after the toolbar. Each keystroke must append.
  let typed='';for(const char of 'abcdef'){
   await page.keyboard.type(char);typed+=char;const current=await read();console.log(mode,command,typed,JSON.stringify(current));
   assert.equal(current.text,prefix+open+typed+close);assert.equal(current.empty,true,'first input collapses placeholder selection');assert.equal(current.head,prefix.length+open.length+typed.length);
  }
  for(const char of ['中','文','测试']){await page.keyboard.insertText(char);typed+=char;assert.equal((await read()).text,prefix+open+typed+close);assert.equal((await read()).empty,true);}
  if(command==='italic')await page.screenshot({path:`${output}/${mode}-italic-continuous.png`});
  await page.keyboard.press('Backspace');typed=typed.slice(0,-1);assert.equal((await read()).text,prefix+open+typed+close);
  await page.keyboard.press('Enter');await page.keyboard.type('next');const changed=(await read()).text;assert.ok(changed.includes('next'));assert.ok(changed.startsWith(prefix));
  // Every edit remains undoable; restore the placeholder and its selection.
  for(let i=0;i<20&&(await read()).text!==placeholder.text;i++)await page.keyboard.press('Control+z');
  const restored=await read();assert.equal(restored.text,placeholder.text);assert.equal(restored.anchor,placeholder.anchor);assert.equal(restored.head,placeholder.head);
  await page.screenshot({path:`${output}/${mode}-${command}.png`});console.log(`PASS ${mode} ${command}: continuous keyboard + Chinese text insertion, deletion, Enter, undo`);
 }
 // Chromium composition events only: this is not a physical Windows IME test.
 await reset('live');await page.locator('#editorFormatBar [data-format="italic"]').click();
 const cdp=await page.context().newCDPSession(page);
 await cdp.send('Input.imeSetComposition',{text:'n',selectionStart:1,selectionEnd:1});
 await cdp.send('Input.imeSetComposition',{text:'ni',selectionStart:2,selectionEnd:2});
 await cdp.send('Input.insertText',{text:'你'});await page.waitForTimeout(100);
 await cdp.send('Input.imeSetComposition',{text:'hao',selectionStart:3,selectionEnd:3});
 await cdp.send('Input.insertText',{text:'好'});await page.waitForTimeout(100);
 assert.equal((await read()).text,prefix+'*你好*');assert.equal((await read()).empty,true);
 await page.keyboard.type('abc');assert.equal((await read()).text,prefix+'*你好abc*');
 await cdp.detach();console.log('PASS Chromium simulated composition commits followed by ordinary typing (not native Windows IME)');
 assert.deepEqual(errors,[]);
}catch(error){await page?.screenshot({path:output+'/failure.png'});throw error;}finally{await browser?.close();await server.close();}
