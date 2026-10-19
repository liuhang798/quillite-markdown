// Isolated synthetic document; no real documents or browser profile.
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import {createServer} from 'vite';
const {chromium}=createRequire(import.meta.url)(process.env.PLAYWRIGHT_MODULE||'playwright');
const server=await createServer({root:fileURLToPath(new URL('..',import.meta.url)),server:{host:'127.0.0.1',port:0,watch:null,hmr:false},logLevel:'error'});
let browser,page;
try{
  await server.listen();browser=await chromium.launch({headless:true,executablePath:process.env.BROWSER_EXECUTABLE||undefined});
  page=await browser.newPage({viewport:{width:1500,height:1000}});page.setDefaultTimeout(10000);const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto(server.resolvedUrls.local[0]+'tests/fixtures/app-drag-audit.html');const app=page.frameLocator('iframe');await app.getByRole('button',{name:'新建文档',exact:true}).click();
  const editor=app.locator('#markdownEditor > .cm-editor'),content=editor.locator('> .cm-scroller > .cm-content'),preview=app.locator('#editorPreviewContent');
  const read=()=>editor.evaluate(async el=>{const{EditorView}=await import('/node_modules/@codemirror/view/dist/index.js');const s=EditorView.findFromDOM(el).state;return{doc:s.doc.toString(),from:s.selection.main.from,to:s.selection.main.to};});
  const shot=async name=>{if(process.env.AUDIT_OUTPUT){await page.waitForTimeout(120);await page.screenshot({path:`${process.env.AUDIT_OUTPUT}/${name}.png`});}};
  const img='data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=';
  const cases=[['table','| Head |\n| --- |\n| Cell |','table','table'],['code','```js\nconst value = 1;\n```','.cm-live-code','pre code'],['list','- one\n- two','.cm-live-bullet','ul li'],['formula','$$\nx^2 + y^2\n$$','.katex','.katex'],['image',`![pixel](${img})`,'img','img'],['mermaid','```mermaid\nflowchart LR\nA[Start] --> B[End]\n```','svg','svg']];
  const chart='{"xAxis":{"type":"category","data":["A","B"]},"yAxis":{"type":"value"},"series":[{"type":"bar","data":[2,3]}]}';
  cases.push(['echarts','```echarts\n'+chart+'\n```','svg','svg']);
  for(const[kind,body,liveSelector,previewSelector]of cases){
    const note='Intro\n\n'+body+'\n\nTail';const doc='Before[^n]\n\n[^n]: '+note.replaceAll('\n','\n    ')+'\n\nAfter';
    await app.getByRole('button',{name:'源码',exact:true}).click();await content.focus();await page.keyboard.press('Control+a');await page.keyboard.insertText(doc);
    for(let i=0;i<100&&(await read()).doc!==doc;i++)await page.waitForTimeout(20);assert.equal((await read()).doc,doc);
    await page.keyboard.press('Control+Home');await app.getByRole('button',{name:'即时渲染',exact:true}).click();
    const definition=editor.locator('.cm-live-footnote-definition');await definition.waitFor({state:'visible'});
    await definition.locator(liveSelector).first().waitFor({state:'visible'});await page.waitForTimeout(kind==='mermaid'?1000:150);await shot(kind+'-loaded');
    if(process.env.AUDIT_BASELINE){console.log(kind,JSON.stringify({live:await definition.locator(liveSelector).count(),reading:await preview.locator('.footnotes '+previewSelector).count()}));continue;}
    await preview.locator('.footnotes '+previewSelector).first().waitFor({state:'visible'});
    if(kind==='formula') {
      const formula=definition.locator('.cm-formula-render');await formula.hover();await formula.locator('[data-formula-action="edit"]').click();
      const dialog=app.locator('#formulaDialog');await dialog.waitFor({state:'visible'});
      await dialog.locator('#formulaAdvanced > summary').click();await dialog.locator('#formulaMarkdownSource').fill('$$\nx^3 + y^3\n$$');await dialog.locator('#insertFormula').click();await dialog.waitFor({state:'hidden'});
      assert.equal((await read()).doc,doc.replace('x^2 + y^2','x^3 + y^3'));await page.keyboard.press('Control+z');assert.equal((await read()).doc,doc);
      await formula.hover();await formula.locator('[data-formula-action="source"]').click();await formula.locator('[data-formula-action="source"]').click();assert.equal((await read()).doc,doc);
    }
    if(kind==='image') {
      const image=definition.locator('.cm-embedded-image');await image.hover();await image.locator('[data-image-action="source"]').click();await image.locator('[data-image-action="source"]').click();assert.equal((await read()).doc,doc);
    }
    if(kind==='mermaid'||kind==='echarts') {
      const diagram=definition.locator('.cm-diagram-card');await diagram.hover();await diagram.locator('[data-diagram-action="source"]').click();await diagram.locator('[data-diagram-action="source"]').click();assert.equal((await read()).doc,doc);
      await diagram.locator('[data-diagram-action="edit"]').click();await app.locator('#diagramDialog').waitFor({state:'visible'});
      assert.ok((await app.locator('#diagramSource').inputValue()).includes(kind==='mermaid'?'A[Start] --> B[End]':'"series"'));await app.locator('#cancelDiagram').click();assert.equal((await read()).doc,doc);
      await diagram.hover();await diagram.locator('[data-diagram-action="edit"]').click();await app.locator('#diagramDialog').waitFor({state:'visible'});
      await app.locator('#flowchartSourceMode').click();await app.locator('#diagramSource').fill(kind==='mermaid'?'flowchart LR\nA[Changed] --> B[End]':chart.replace('[2,3]','[4,3]'));await app.locator('#insertDiagram').click();await app.locator('#diagramDialog').waitFor({state:'hidden'});
      assert.equal((await read()).doc,kind==='mermaid'?doc.replace('A[Start]','A[Changed]'):doc.replace('[2,3]','[4,3]'));await shot(kind+'-saved');await page.keyboard.press('Control+z');assert.equal((await read()).doc,doc);
    }
    if(kind==='table'||kind==='code'){
      const inner=definition.locator(kind==='table'?'td .cm-content':'.cm-live-code .cm-content').first();
      await inner.click();await page.keyboard.press('End');await page.keyboard.insertText('X');
      assert.equal((await read()).doc,doc.replace(kind==='table'?'Cell':'const value = 1;',kind==='table'?'CellX':'const value = 1;X'));
      await page.keyboard.press('Control+z');assert.equal((await read()).doc,doc);
      await inner.click();await page.keyboard.press('End');
      await content.locator('> .cm-line').filter({hasText:'After'}).click({modifiers:['Shift']});
      const outside=await read();assert.ok(outside.to>=doc.indexOf('After'));
      await page.keyboard.insertText('Q');await shot(kind+'-outside-replacement');
      const outerResult=(await read()).doc;
      console.log(kind+' outside',JSON.stringify(outerResult));
      if(kind==='table')assert.ok(outerResult.includes('| CellQ |'),'cross-footnote replacement retains partial table');
      else assert.ok(outerResult.includes('const value = 1;Q\n    ```'),'cross-footnote replacement retains code fence');
      await page.keyboard.press('Control+z');assert.equal((await read()).doc,doc);
      // Cross selection from nested content to outer Tail must preserve the
      // incomplete table/code wrapper rather than destroying its closing syntax.
      await inner.click();await page.keyboard.press('End');
      const tail=definition.locator('> .cm-live-block-content > .cm-editor > .cm-scroller > .cm-content > .cm-line').filter({hasText:'Tail'});
      await tail.click({modifiers:['Shift']});
      const range=await read();assert.ok(range.from<range.to);assert.ok(range.to>=doc.indexOf('Tail'));
      await page.keyboard.insertText('Z');await shot(kind+'-cross-replacement');
      const result=(await read()).doc;
      if(kind==='table'){assert.ok(result.includes('| --- |'));assert.ok(result.includes('| CellZ |'));}
      else assert.ok(result.includes('const value = 1;Z\n    ```'));
      await page.keyboard.press('Control+z');assert.equal((await read()).doc,doc);
    }
    console.log(kind+': reading/editing structures and tested interactions passed');
  }
  assert.deepEqual(errors,[]);
}catch(e){if(page&&process.env.AUDIT_OUTPUT)await page.screenshot({path:`${process.env.AUDIT_OUTPUT}/failure.png`});throw e;}
finally{await browser?.close();await server.close();}
