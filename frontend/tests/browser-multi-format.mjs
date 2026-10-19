// User-authorized fresh browser, synthetic documents only.
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import {createServer} from 'vite';
const {chromium}=createRequire(import.meta.url)(process.env.PLAYWRIGHT_MODULE || 'playwright');
const server=await createServer({root:fileURLToPath(new URL('..',import.meta.url)),server:{host:'127.0.0.1',port:0,watch:null,hmr:false},logLevel:'error'});
let browser,page;
try {
  await server.listen();browser=await chromium.launch({headless:true,executablePath:process.env.BROWSER_EXECUTABLE || undefined});
  page=await browser.newPage({viewport:{width:1500,height:1000}});page.setDefaultTimeout(8000);
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.route('**/*',route=>new URL(route.request().url()).hostname==='127.0.0.1'?route.continue():route.abort());await page.goto(server.resolvedUrls.local[0]+'tests/fixtures/app-drag-audit.html');
  const app=page.frameLocator('iframe');await app.locator('#newFileButton').evaluate(async()=>{await import('/src/main.js');});await app.getByRole('button',{name:'新建文档',exact:true}).click();
  const editor=app.locator('#markdownEditor > .cm-editor');
  const read=()=>editor.evaluate(async el=>{const {EditorView}=await import('/node_modules/@codemirror/view/dist/index.js');const s=EditorView.findFromDOM(el).state;return{doc:s.doc.toString(),main:s.selection.mainIndex,ranges:s.selection.ranges.map(r=>({anchor:r.anchor,head:r.head,text:s.sliceDoc(r.from,r.to)}))};});
  const shot=async name=>{if(process.env.AUDIT_OUTPUT){await page.waitForTimeout(150);await page.screenshot({path:`${process.env.AUDIT_OUTPUT}/${name}.png`});}};
  const original='alpha one\n\nalpha two\n\nalpha three';
  const waitDoc=async expected=>{for(let i=0;i<100;i++){if((await read()).doc===expected)return;await page.waitForTimeout(20);}assert.equal((await read()).doc,expected,'source reset');};
  const reset=async(content=original)=>{
    await app.getByRole('button',{name:'源码',exact:true}).click();await app.getByRole('textbox').focus();
    await page.keyboard.press('Control+a');await page.keyboard.insertText(content);await waitDoc(content);
  };
  await reset();await app.getByRole('button',{name:'即时渲染',exact:true}).click();
  await editor.locator('> .cm-scroller > .cm-content').click();await page.keyboard.press('Control+Home');
  for(let i=0;i<3;i++)await page.keyboard.press('Control+d');
  const initial=await read();assert.equal(initial.ranges.length,3);assert.ok(initial.ranges.every(r=>r.text==='alpha'));await shot('01-selected');
  await page.keyboard.press('Control+b');const formatted=await read();console.log(JSON.stringify({initial,formatted}));await shot('02-bold');
  const checkSelectionPaint=async()=>{
    await page.waitForTimeout(60);
    const rects=await editor.locator('> .cm-scroller > .cm-live-selection-layer .cm-selectionBackground').evaluateAll(els=>els.map(el=>({width:el.getBoundingClientRect().width,visibility:getComputedStyle(el).visibility})));
    assert.equal(rects.length,3);assert.ok(rects.every(r=>r.width>10&&r.width<100&&r.visibility==='visible'),JSON.stringify(rects));
  };
  if(!process.env.AUDIT_BASELINE) {
    assert.equal(formatted.doc,original.replaceAll('alpha','**alpha**'));assert.equal(formatted.ranges.length,3);
    await checkSelectionPaint();
    await page.keyboard.press('Control+b');assert.equal((await read()).doc,original);assert.equal((await read()).ranges.length,3);
    await page.keyboard.press('Control+z');assert.equal((await read()).doc,formatted.doc);assert.equal((await read()).ranges.length,3);
    await page.keyboard.press('Control+z');assert.deepEqual(await read(),initial);
    await page.keyboard.press('Control+Shift+Z');assert.equal((await read()).doc,formatted.doc);
    const selectThree=async mode=>{
      await reset();
      if(mode==='live')await app.getByRole('button',{name:'即时渲染',exact:true}).click();
      await editor.locator('> .cm-scroller > .cm-content').click();await page.keyboard.press('Control+Home');
      for(let i=0;i<3;i++)await page.keyboard.press('Control+d');assert.equal((await read()).ranges.length,3,JSON.stringify(await read()));
    };
    const format=async command=>{
      const direct=app.locator(`[data-format="${command}"]:visible`);
      if(await direct.count())await direct.first().click();
      else {await app.locator('#moreFormatButton').click();await app.locator(`#moreFormatMenu [data-format-command="${command}"]:visible`).click();}
    };
    const pairs=[['bold','**','**'],['italic','*','*'],['bold-italic','***','***'],['strikethrough','~~','~~'],['highlight','==','=='],['inline-code','`','`'],['underline','<u>','</u>'],['superscript','<sup>','</sup>'],['subscript','<sub>','</sub>'],['keyboard-key','<kbd>','</kbd>']];
    for(const mode of ['live','source'])for(const [command,open,close]of pairs){
      await selectThree(mode);const before=await read(),expected=original.replaceAll('alpha',open+'alpha'+close);
      await format(command);assert.equal((await read()).doc,expected,mode+' '+command);assert.equal((await read()).ranges.length,3);
      if(mode==='live')await checkSelectionPaint();
      await format(command);assert.equal((await read()).doc,original);assert.equal((await read()).ranges.length,3);
      await page.keyboard.press('Control+z');assert.equal((await read()).doc,expected);
      await page.keyboard.press('Control+z');assert.deepEqual(await read(),before);
      await page.keyboard.press('Control+y');assert.equal((await read()).doc,expected);
      if(mode==='live') {
        // Toolbar-only Enter intent deliberately does not survive undo/redo.
        await page.keyboard.press('Control+z');await format(command);
        console.log('BEFORE ENTER',command,JSON.stringify(await read()));
        await page.keyboard.press('Enter');assert.equal((await read()).doc,original.replaceAll('alpha ',open+'alpha'+close+'\n'),command+' newline');
        await page.keyboard.press('Control+z');assert.equal((await read()).doc,expected);assert.equal((await read()).ranges.length,3);
      }
      console.log(mode+' '+command+': all ranges, toggle, undo/redo, newline where live passed');
    }
    for(const mode of ['live','source']){
      await selectThree(mode);
      for(const color of ['spectrum-3-red','spectrum-5-blue','default']) {
        await app.locator('#textColorButton').click();await app.locator(`#textColorMenu [data-text-color="${color}"]`).click();
        const expected=color==='default'?original:original.replaceAll('alpha',`<span data-md-color="${color}">alpha</span>`);
        assert.equal((await read()).doc,expected);assert.equal((await read()).ranges.length,3);
        if(mode==='live')await checkSelectionPaint();
        await shot(`03-${mode}-${color}`);
        if(mode==='live'&&color!=='default'){
          await page.keyboard.press('Enter');assert.equal((await read()).doc,expected.replaceAll('</span> ','</span>\n'));
          await page.keyboard.press('Control+z');assert.equal((await read()).doc,expected);assert.equal((await read()).ranges.length,3);
        }
      }
      await page.keyboard.press('Control+z');assert.ok((await read()).doc.includes('spectrum-5-blue'));assert.equal((await read()).ranges.length,3);
      await page.keyboard.press('Control+z');assert.ok((await read()).doc.includes('spectrum-3-red'));
      await page.keyboard.press('Control+z');assert.equal((await read()).doc,original);
      console.log(mode+': all-range color replace/reset and isolated undo passed');
    }
    for(const mode of ['live','source']){
      await selectThree(mode);await page.keyboard.press('ArrowRight');
      const cursors=await read();assert.equal(cursors.ranges.length,3);assert.ok(cursors.ranges.every(r=>r.anchor===r.head));
      await format('highlight');const highlighted=await read();
      assert.equal(highlighted.doc,original.replaceAll('alpha','alpha==高亮=='));
      assert.equal(highlighted.ranges.length,3);
      await page.keyboard.type('new');assert.equal((await read()).doc,original.replaceAll('alpha','alpha==new=='));
      await page.keyboard.press('Control+z');assert.equal((await read()).doc,highlighted.doc);
      await page.keyboard.press('Control+z');assert.deepEqual(await read(),cursors);
      console.log(mode+': three empty cursors, placeholders, typing and undo passed');
    }
    for(const [name,line]of [['bidi','שלום 中文 alpha'],['wrapped','alpha 中文 '.repeat(15)]]){
      const content=[line,line,line].join('\n\n');await reset(content);
      await app.getByRole('button',{name:'即时渲染',exact:true}).click();
      await editor.locator('> .cm-scroller > .cm-content').click();await page.keyboard.press('Control+Home');
      // Build selections with keyboard commands in source mode, not state injection.
      await app.getByRole('button',{name:'源码',exact:true}).click();await editor.locator('> .cm-scroller > .cm-content').focus();
      await page.keyboard.press('Control+Home');
      if(name==='wrapped')for(let i=0;i<line.length;i++)await page.keyboard.press('Shift+ArrowRight');
      else await page.keyboard.press('Control+d');
      await page.keyboard.press('Control+d');await page.keyboard.press('Control+d');
      assert.equal((await read()).ranges.length,3);
      await app.getByRole('button',{name:'即时渲染',exact:true}).click();await format('underline');
      assert.equal((await read()).doc,[line,line,line].map(t=>name==='wrapped'?'<u>'+t+'</u>':t.replace('שלום','<u>שלום</u>')).join('\n\n'));
      await shot(`04-${name}`);
      const paint=await editor.locator('> .cm-scroller > .cm-live-selection-layer .cm-selectionBackground').evaluateAll(els=>els.map(el=>({left:el.getBoundingClientRect().left,right:el.getBoundingClientRect().right,width:el.getBoundingClientRect().width})));
      const bounds=await editor.boundingBox();assert.ok(paint.length>=(name==='wrapped'?6:3));
      assert.ok(paint.every(r=>r.width>0&&r.left>=bounds.x&&r.right<=bounds.x+bounds.width));
      await page.keyboard.press('Control+z');assert.equal((await read()).doc,content);
      console.log(name+': multi-range selection paint, format and undo passed');
    }
  }
  assert.deepEqual(errors,[]);
}catch(error){if(page&&process.env.AUDIT_OUTPUT)await page.screenshot({path:`${process.env.AUDIT_OUTPUT}/failure.png`});throw error;}
finally{await browser?.close();await server.close();}
