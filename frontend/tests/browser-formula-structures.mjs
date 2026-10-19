// Fresh browser context and synthetic document. MathLive APIs are read-only here.
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import {createServer} from 'vite';
const {chromium}=createRequire(import.meta.url)(process.env.PLAYWRIGHT_MODULE||'playwright');
const mode=process.env.AUDIT_FORMULA_MODE||'block';
assert.ok(['inline','block','numbered'].includes(mode),'supported audit output mode');
const server=await createServer({root:fileURLToPath(new URL('..',import.meta.url)),server:{host:'127.0.0.1',port:0,watch:null,hmr:false},logLevel:'error'});
let browser,page;
try{
 await server.listen();browser=await chromium.launch({headless:true,executablePath:process.env.BROWSER_EXECUTABLE||undefined});
 page=await browser.newPage({viewport:{width:1440,height:1000}});page.setDefaultTimeout(10000);const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.route('**/*',r=>new URL(r.request().url()).hostname==='127.0.0.1'?r.continue():r.abort());
 await page.goto(server.resolvedUrls.local[0]+'tests/fixtures/app-drag-audit.html');const frame=page.frames().find(f=>f.parentFrame());await frame.evaluate(async()=>{await import('/src/main.js');});const app=page.frameLocator('iframe');
 await app.locator('#newFileButton').click();await app.locator('#hideLivePreviewButton').click();
 if(process.env.AUDIT_THEME==='dark'){await app.locator('#colorModeButton').click();assert.equal(await app.locator('html').getAttribute('data-color-mode'),'dark');}
 const editor=app.locator('#markdownEditor > .cm-editor'),field=app.locator('#formulaMathfield');
 const read=()=>editor.evaluate(async el=>{const{EditorView}=await import('/node_modules/@codemirror/view/dist/index.js');return EditorView.findFromDOM(el).state.doc.toString();});
 const source=()=>app.locator('#formulaMarkdownSource').inputValue();
 const latex=()=>field.evaluate(el=>el.getValue('latex'));
 const button=name=>app.locator('#formulaStructureToolbar').getByRole('button',{name,exact:true});
 const shot=async name=>{if(process.env.AUDIT_OUTPUT){await page.waitForTimeout(200);await page.screenshot({path:`${process.env.AUDIT_OUTPUT}/${name}.png`});}};
 const history=async key=>{await editor.locator('> .cm-scroller > .cm-content').focus();await page.keyboard.press(key);await page.waitForTimeout(300);};
 const open=async(expression='x')=>{
  await app.locator('[data-format="formula-builder"]').click();
  await app.locator('[data-formula-discipline="all"]').click();await app.locator('#formulaSearch').fill('自定义公式');await app.locator('[data-formula-template="custom"]').click();
  if(!await app.locator('#formulaAdvanced').evaluate(el=>el.open))await app.locator('#formulaAdvanced > summary').click();
  const markdown=mode==='inline'?'$'+expression+'$':'$$\n'+expression+(mode==='numbered'?' \\tag{验-12}':'')+'\n$$';
  await app.locator('#formulaMarkdownSource').fill(markdown);await field.waitFor();
  assert.equal(await field.evaluate(el=>el.readOnly),false);
  await field.focus();await page.keyboard.press('Control+a');
  const selected=field.locator('.ML__selected').first();await selected.waitFor({state:'attached'});
  await shot('00-selected-text');
  assert.equal(await selected.evaluate(el=>getComputedStyle(el).color),await field.evaluate(el=>getComputedStyle(el).color),'selected formula text follows the application theme');
 };
 const cases=[
  ['分数',['2'],/\\frac\{x\}\{2\}/],['根号',[],/\\sqrt\{x\}/],
  ['上标',['2'],/\{x\}\^\{?2/],['下标',['2'],/\{x\}_\{?2/],
  ['积分',['0','1'],/^\\int_0\^1x\\,dx$/],['求和',['0','3'],/^\\sum_\{n=0\}\^3x$/],
  ['括号',[],/^\\left\(x\\right\)$/],['矩阵',['1','2','3','4'],/^\\begin\{pmatrix\}1 & 2\\\\ 3 & 4\\end\{pmatrix\}$/],
  ['π',[],/\\pi/],['θ',[],/\\theta/],['∞',[],/\\infty/],['×',[],/\\times/],['±',[],/\\pm/],
 ];
 for(const [index,[name,slots,expected]] of cases.entries()){
  await open();if(index===0)await shot('01-selected-x');
  const enabledStyle=await app.locator('#insertFormula').evaluate(el=>({background:getComputedStyle(el).backgroundColor,cursor:getComputedStyle(el).cursor}));
  await button(name).click();const inserted=await latex();console.log(name+' inserted '+inserted);
  if(slots.length){
   assert.match(inserted,/\\placeholder/);assert.equal(await app.locator('#insertFormula').isEnabled(),false);
   await app.locator('#insertFormula').hover();
   const disabledStyle=await app.locator('#insertFormula').evaluate(el=>({background:getComputedStyle(el).backgroundColor,cursor:getComputedStyle(el).cursor,filter:getComputedStyle(el).filter}));
   await shot('02-disabled-'+index);
   assert.equal(disabledStyle.cursor,'not-allowed');assert.notEqual(disabledStyle.background,enabledStyle.background);assert.equal(disabledStyle.filter,'none');
  }
  if(index===0)await shot('02-placeholder');
  await button('撤销').click();assert.equal(await latex(),'x',name+' toolbar undo');
  await button('重做').click();assert.equal(await latex(),inserted,name+' toolbar redo');
  // Navigate from the beginning to the next editable placeholder after redo.
  if(slots.length){await field.focus();await page.keyboard.press('Home');await page.keyboard.press('Tab');}
  for(const [slot,value] of slots.entries()){
   await page.keyboard.type(value);if(slot<slots.length-1)await page.keyboard.press('Tab');
  }
  const complete=await latex();console.log(name+' completed '+complete);assert.doesNotMatch(complete,/\\placeholder/);assert.match(complete,expected);
  assert.equal(await app.locator('#insertFormula').isEnabled(),true,name+' enabled');
  assert.deepEqual(await app.locator('#insertFormula').evaluate(el=>({background:getComputedStyle(el).backgroundColor,cursor:getComputedStyle(el).cursor})),enabledStyle,name+' enabled style restored');
  const markdown=await source();if(index===0)await shot('03-complete');
  await app.locator('#insertFormula').click();await app.locator('#formulaDialog').waitFor({state:'hidden'});const widget=editor.locator('.cm-formula-render').first();await widget.waitFor();
  const document=await read();assert.equal(document.trim(),markdown.trim());
  await widget.focus();await page.keyboard.press('Enter');await app.locator('#formulaDialog').waitFor({state:'visible'});assert.equal((await source()).trim(),markdown.trim());
  await field.focus();await page.keyboard.press('End');await page.keyboard.type('+9');const modified=await source();assert.notEqual(modified,markdown,name+' real visual change');
  await app.locator('#insertFormula').click();await app.locator('#formulaDialog').waitFor({state:'hidden'});await widget.waitFor();
  const modifiedDocument=await read();assert.equal(modifiedDocument.trim(),modified.trim(),name+' visual edit saved');
  await widget.focus();await page.keyboard.press('Enter');await app.locator('#formulaDialog').waitFor({state:'visible'});assert.equal((await source()).trim(),modified.trim());
  await field.focus();await page.keyboard.press('End');await page.keyboard.type('+8');assert.notEqual(await source(),modified);
  await app.locator('#cancelFormula').click();assert.equal(await read(),modifiedDocument,name+' cancel');
  await history('Control+z');assert.equal(await read(),document,name+' edit undo');await history('Control+y');assert.equal(await read(),modifiedDocument,name+' edit redo');
  if(index===0)await shot('04-document-redo');
  await history('Control+z');await history('Control+z');assert.equal(await read(),'');await history('Control+y');assert.equal(await read(),document);await history('Control+z');await app.locator('#newFileButton').click();
  console.log('PASS '+name);
 }
 const matrix='\\begin{bmatrix}a&b\\\\c&d\\end{bmatrix}';
 const dimensions=value=>{const rows=value.replace(/^\\begin\{bmatrix\}/,'').replace(/\\end\{bmatrix\}$/,'').split('\\\\');return [rows.length,...rows.map(row=>row.split('&').length)];};
 for(const [name,expected] of [['矩阵加行',[3,2,2,2]],['矩阵加列',[2,3,3]],['矩阵删行',[1,2]],['矩阵删列',[2,1,1]]]){
  await open(matrix);await field.getByText('a',{exact:true}).click();await page.keyboard.press('ArrowRight');
  const before=await latex();console.log(name+' before '+before);
  await button(name).click();const changed=await latex();console.log(name+' after '+changed);
  assert.deepEqual(dimensions(changed),expected,name+' dimensions');assert.notEqual(changed,before);
  await shot('05-'+name);
  await button('撤销').click();assert.equal(await latex(),before,name+' undo');
  await button('重做').click();assert.equal(await latex(),changed,name+' redo');
  await button('撤销').click();assert.equal(await latex(),before,name+' second undo');
  await button('重做').click();
  if(/\\placeholder/.test(changed)){
   assert.equal(await app.locator('#insertFormula').isEnabled(),false);
   await field.focus();await page.keyboard.press('Home');await page.keyboard.press('Tab');await page.keyboard.type('7');await page.keyboard.press('Tab');await page.keyboard.type('8');
   assert.doesNotMatch(await latex(),/\\placeholder/);
  }
  const savedSource=await source();assert.equal(await app.locator('#insertFormula').isEnabled(),true);
  await app.locator('#insertFormula').click();await app.locator('#formulaDialog').waitFor({state:'hidden'});
  const widget=editor.locator('.cm-formula-render').first();await widget.waitFor();const savedDocument=await read();assert.equal(savedDocument.trim(),savedSource.trim());
  await widget.focus();await page.keyboard.press('Enter');await app.locator('#formulaDialog').waitFor({state:'visible'});assert.equal((await source()).trim(),savedSource.trim());await app.locator('#cancelFormula').click();
  await history('Control+z');assert.equal(await read(),'');await history('Control+y');assert.equal(await read(),savedDocument);await history('Control+z');await app.locator('#newFileButton').click();console.log('PASS '+name);
 }
 await open();const outside=await source();await button('矩阵加行').click();assert.equal(await source(),outside);assert.match(await app.locator('#formulaVisualStatus').textContent(),/矩阵/);await app.locator('#cancelFormula').click();assert.equal(await read(),'');
 assert.deepEqual(errors,[]);console.log(`PASS ${mode}: 13 structure buttons and 4 matrix commands; placeholders, visual undo/redo, insertion, reopen, visual edit/save, cancellation and document undo/redo`);
}catch(error){if(page&&process.env.AUDIT_OUTPUT)await page.screenshot({path:`${process.env.AUDIT_OUTPUT}/failure.png`});throw error;}
finally{await browser?.close();await server.close();}
