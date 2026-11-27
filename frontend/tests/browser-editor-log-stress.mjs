// Synthetic documents only. Exercise the live root/child views behind the
// tile/position/selection cascade found in the November 2026 error export.
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import {createServer} from 'vite';
const {chromium}=createRequire(import.meta.url)(process.env.PLAYWRIGHT_MODULE||'playwright');
const server=await createServer({root:fileURLToPath(new URL('..',import.meta.url)),server:{host:'127.0.0.1',port:0,watch:null,hmr:false},logLevel:'error'});
let browser,page;
try {
  await server.listen();browser=await chromium.launch({headless:true,executablePath:process.env.BROWSER_EXECUTABLE||undefined});
  page=await browser.newPage({viewport:{width:1500,height:1000}});page.setDefaultTimeout(10000);
  const errors=[];page.on('pageerror',error=>errors.push(error.message));
  await page.route('**/*',route=>new URL(route.request().url()).hostname==='127.0.0.1'?route.continue():route.abort());
  await page.goto(server.resolvedUrls.local[0]);
  await page.evaluate(async()=>{
    await import('/src/main.js');window.auditReportedErrors=[];
    window.quilliteMarkdown.reportErrorLog=async text=>window.auditReportedErrors.push(text);
  });
  await page.locator('#newFileButton').click();
  await page.locator('#hideLivePreviewButton').click();
  const editor=page.locator('#markdownEditor > .cm-editor'),content=editor.locator('> .cm-scroller > .cm-content');
  const read=()=>editor.evaluate(async el=>{const {EditorView}=await import('/node_modules/@codemirror/view/dist/index.js');return EditorView.findFromDOM(el).state.doc.toString();});
  const inspect=async stage=>{
    await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
    const result=await editor.evaluate(async el=>{
      const {EditorView}=await import('/node_modules/@codemirror/view/dist/index.js');
      const views=[el,...el.querySelectorAll('.cm-editor')].map(node=>EditorView.findFromDOM(node));
      return views.map(view=>{
        const length=view.state.doc.length,tree=view.docView.tile.length;
        for(const pos of new Set([0,Math.min(1,length),length]))view.coordsAtPos(pos);
        const rect=view.contentDOM.getBoundingClientRect();
        if(rect.width&&rect.height){view.posAtCoords({x:rect.left+5,y:rect.top+5},false);view.posAtCoords({x:rect.left+15,y:Math.min(rect.bottom-1,rect.top+25)},false);}
        return {length,tree,valid:view.state.selection.ranges.every(range=>range.from>=0&&range.to<=length)};
      });
    });
    for(const state of result){assert.equal(state.tree,state.length,stage+': tree extent');assert.equal(state.valid,true,stage+': selection bounds');}
    assert.deepEqual(errors,[],stage+': uncaught errors');
    assert.deepEqual(await page.evaluate(()=>window.auditReportedErrors),[],stage+': captured plugin errors');
  };
  const table=rows=>'| A | B |\n| --- | --- |\n| AB | CD |'+Array.from({length:rows-1},(_,i)=>`\n| row${i} | value${i} |`).join('');
  const cases=[['small-table',table(3)],['large-table',table(65)],['details-table','<details open>\n<summary>Section</summary>\n\n'+table(3)+'\n\n</details>'],['footnote-table','Note[^n]\n\n[^n]: Intro\n    \n    '+table(3).replaceAll('\n','\n    ')]];
  const texts=['ABC','**AB**','`AB`','$x$','![x](assets/missing.png)','[AB](https://example.com)','AB'];
  let changes=0;
  for(const [name,block] of cases){
    const source='Before\n\n'+block+'\n\nAfter';
    await page.locator('[data-editor-presentation="source"]').click();await content.fill(source);await content.press('Control+Home');await page.locator('[data-editor-presentation="live"]').click();
    await inspect(name+' initial');
    const cell=editor.locator('td').filter({hasText:/^AB$/}).first();await cell.click();
    let expected=source;
    for(let repeat=0;repeat<3;repeat++)for(const text of texts){
      const inner=editor.locator('td .cm-content').first();
      await inner.press('Control+a');
      const selected=await inner.evaluate(async node=>{const {EditorView}=await import('/node_modules/@codemirror/view/dist/index.js');const {resolveEditableOwner}=await import('/src/editable-owner.js');const inner=EditorView.findFromDOM(node),owner=resolveEditableOwner(inner);return {from:owner.from,to:owner.to};});
      expected=expected.slice(0,selected.from)+text+expected.slice(selected.to);
      await page.keyboard.insertText(text);changes++;
      const current=await read();
      if(current!==expected)console.log(JSON.stringify({name,repeat,text,selected,actual:current,expected}));
      assert.equal(current,expected,name+': source follows focused child input');
      await inspect(name+' '+repeat+' '+text);
      await page.keyboard.press('End');await page.keyboard.press('Shift+Home');
      await inspect(name+' selected '+text);
      await page.keyboard.press('ArrowRight');
      const cursor=await editor.evaluate(async node=>{const {EditorView}=await import('/node_modules/@codemirror/view/dist/index.js');const {resolveEditableOwner}=await import('/src/editable-owner.js');const focused=node.ownerDocument.activeElement.closest('.cm-editor'),view=EditorView.findFromDOM(focused),owner=resolveEditableOwner(view);return {from:owner.from,to:owner.to};});
      await page.keyboard.insertText('Z');
      const typed=expected.slice(0,cursor.from)+'Z'+expected.slice(cursor.to);
      assert.equal(await read(),typed,name+': subsequent typing');
      await inspect(name+' typed');
      await page.keyboard.press('Control+z');
      assert.equal(await read(),expected,name+': undo exact content');
      await page.keyboard.press('Control+y');assert.equal(await read(),typed,name+': redo exact content');
      await page.keyboard.press('Control+z');assert.equal(await read(),expected);
      await inspect(name+' history');
    }
    console.log(JSON.stringify({PASS:name,changes}));
  }
  const point=(locator,offset)=>locator.evaluate((el,i)=>{const walker=document.createTreeWalker(el,NodeFilter.SHOW_TEXT);let node;while(node=walker.nextNode()){if(i<=node.length){const range=document.createRange();range.setStart(node,i);range.collapse(true);const box=range.getBoundingClientRect();return {x:box.x,y:box.y+box.height/2};}i-=node.length;}throw Error('Missing visible synthetic text offset');},offset);
  const details=body=>'<details open>\n<summary>Section</summary>\n\n'+body+'\n\nTAIL\n\n</details>';
  const footnote=body=>'Before[^n]\n\n[^n]: Intro\n    \n    '+body.replaceAll('\n','\n    ');
  const deep=[['deep-code',footnote(details(details('```text\nALPHA\nBRAVO\n```'))),'.cm-live-code .cm-line'],['deep-table',footnote(details(details('| A | B |\n| --- | --- |\n| BRAVO | CHARLIE |'))),'td .cm-line']];
  let drags=0;
  for(const [name,body,selector]of deep)for(const reverse of [false,true])for(const action of ['type','delete']){
    const source=body+'\n\nAFTER\n\nFINISH';
    await page.locator('[data-editor-presentation="source"]').click();await content.fill(source);await content.press('Control+Home');await page.locator('[data-editor-presentation="live"]').click();
    const inner=editor.locator(selector).filter({hasText:'BRAVO'}),outer=content.locator('> .cm-line').filter({hasText:'AFTER'});
    const a=await point(inner,2),b=await point(outer,3),start=reverse?b:a,end=reverse?a:b;
    await page.mouse.move(start.x,start.y);await page.mouse.down();await page.mouse.move(end.x,end.y,{steps:30});await page.mouse.up();
    const selection=await editor.evaluate(async node=>{const {EditorView}=await import('/node_modules/@codemirror/view/dist/index.js');return EditorView.findFromDOM(node).state.selection.main.toJSON();});
    assert.deepEqual(selection,{anchor:reverse?source.indexOf('AFTER')+3:source.indexOf('BRAVO')+2,head:reverse?source.indexOf('BRAVO')+2:source.indexOf('AFTER')+3},name+': exact cross-block drag endpoints');
    await inspect(name+' selected');
    if(action==='type')await page.keyboard.insertText('X');else await page.keyboard.press('Backspace');
    const changed=await read();assert.ok(changed.includes(action==='type'?'BRX':'BR'));assert.ok(changed.endsWith('ER\n\nFINISH'));assert.ok(!changed.includes('AVO')&&!changed.includes('TAIL')&&!changed.includes('CHARLIE'));
    assert.equal((changed.match(/<details open>/g)||[]).length,2);assert.equal((changed.match(/<\/details>/g)||[]).length,2);
    await inspect(name+' changed');
    await page.keyboard.press('Control+z');assert.equal(await read(),source,name+': undo exact original');
    await page.keyboard.press('Control+y');assert.equal(await read(),changed,name+': redo exact change');
    await inspect(name+' history');drags++;
    console.log(JSON.stringify({PASS:name,reverse,action}));
  }
  console.log(JSON.stringify({PASS:'live table editing / geometry / selection / history',changes,drags,errors}));
} finally {await browser?.close();await server.close();}
