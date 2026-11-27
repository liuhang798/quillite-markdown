import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import {createServer} from 'vite';
const pw=createRequire(import.meta.url)(process.env.PLAYWRIGHT_MODULE||'playwright');
const server=await createServer({root:fileURLToPath(new URL('..',import.meta.url)),server:{host:'127.0.0.1',port:0,hmr:false,watch:null},logLevel:'error',
  plugins:[{name:'translation-test',enforce:'pre',transform(code,id){if(id.replaceAll('\\','/').endsWith('/src/renderer.js'))return code+'\nwindow.rtTest={displayDocument,state};';}}]});
let browser;
try{
  await server.listen();browser=await pw.chromium.launch({headless:true,...(process.env.BROWSER_EXECUTABLE?{executablePath:process.env.BROWSER_EXECUTABLE}:{})});
  const page=await browser.newPage({viewport:{width:1620,height:860}}),errors=[];
  page.on('pageerror',e=>errors.push(e.message));page.setDefaultTimeout(12000);
  await page.route('**/*',r=>new URL(r.request().url()).hostname==='127.0.0.1'?r.continue():r.abort());
  await page.goto(server.resolvedUrls.local[0]);await page.waitForFunction(()=>window.rtTest && document.querySelector('#fileList').childElementCount);
  await page.evaluate(()=>{
    const content='# Alpha\n\nSample English paragraph with \x60secret command\x60.\n\n## Beta\n\nRead [more](https://example.invalid/private). It costs $10 before $E = mc^2$ today. See [guide][manual] and ![figure][sample]. Compare $alpha$$beta$ afterwards[^memo].\n\n## Final\n\nMore prose.\n\n[manual]: ./manual.md\n[sample]: ./figure.png\n[unused]: ./unrelated.txt\n\n[^memo]: Archive note\n    continuation line.';
    const doc={path:'/sample/Guide.md',directory:'/sample',name:'Guide.md',exists:true,revision:'a'.repeat(64),content};
    rtTest.displayDocument(doc);
    window.calls=[];window.cancels=[];window.sourceBefore=content;window.fail=true;
    Object.defineProperty(navigator,'clipboard',{configurable:true,value:{writeText:async v=>window.copied=v}});
    Object.assign(window.quilliteMarkdown,{
      getAISettings:async()=>({provider:'custom',baseUrl:'https://example.invalid/v1',model:'test-model',hasApiKey:true}),
      translateReadingParts:async req=>{calls.push(req);if(window.hold)return new Promise(r=>window.finish=()=>r(req.parts));if(window.fail && req.parts.includes('Beta'))throw Error('TRANSLATION_RESULT_INVALID');return req.parts.map(s=>'译'+s);},
      cancelReadingTranslation:async id=>cancels.push(id),
      saveReadingTranslation:async(path,text)=>{window.saved={path,text};return '/sample/Guide.zh-CN.md';}
    });
  });
  const header=page.locator('[data-document-action="translate"]:visible').first(),d=page.locator('dialog.rt-dialog'),right=page.locator('#comparisonHost');
  await header.click();await d.locator('button.primary:enabled').waitFor();assert.match(await d.innerText(),/test-model/);assert.equal(await page.evaluate(()=>calls.length),0);
  await page.setViewportSize({width:360,height:600});
  assert.ok(await d.evaluate(el=>el.scrollWidth<=el.clientWidth && el.getBoundingClientRect().width<=innerWidth));
  await page.setViewportSize({width:1620,height:860});
  if(process.env.RT_DIALOG_SCREENSHOT)await d.screenshot({path:process.env.RT_DIALOG_SCREENSHOT});
  assert.equal(await d.locator('input[value="section"]').isChecked(),true);
  await d.locator('input[value="all"]').check();await d.locator('button.primary').click();
  await right.getByRole('button',{name:/仅重试|Retry failed/i}).waitFor();
  assert.equal(await page.evaluate(()=>calls.length),2);await page.evaluate(()=>window.fail=false);
  await right.getByRole('button',{name:/仅重试|Retry failed/i}).click();await right.getByRole('button',{name:/继续未|Continue pending/i}).click();
  await right.getByRole('button',{name:/复制译文|Copy translation/i}).click();
  await right.getByRole('button',{name:/另存译文|Save translation/i}).click();
  const result=await page.evaluate(()=>({saved,original:rtTest.state.currentFile.content,sourceBefore,sent:calls.flatMap(r=>r.parts)}));
  assert.equal(result.sourceBefore,result.original);assert.equal(result.saved.path,'/sample/Guide.md');assert.match(result.saved.text,/\x60secret command\x60/);assert.match(result.saved.text,/https:\/\/example.invalid\/private/);
  assert.doesNotMatch(result.sent.join(' '),/secret command|https:\/\//);assert.equal(result.sent.filter(x=>x==='Alpha').length,1);
  assert.equal(await page.evaluate(()=>window.copied),result.saved.text);
  assert.match(await right.locator('.rt-section').filter({hasText:'译Beta'}).innerText(),/afterwards〔1〕/);
  await page.locator('#comparisonClose').click();
  const second=page.locator('#markdownContent h2').filter({hasText:'Beta'}).first();
  await second.click({button:'right'});await page.locator('#readingMarkMenu').getByRole('button',{name:/翻译当前章节|Translate this section/i}).click();
  await d.locator('button.primary:enabled').waitFor();assert.match(await d.innerText(),/Beta/);
  const before=await page.evaluate(()=>calls.length);assert.equal(before,4);await d.locator('button.primary').click();
  await right.getByRole('button',{name:/复制译文|Copy translation/i}).click();
  assert.equal(await page.evaluate(()=>calls.length),before+1);assert.match(await page.evaluate(()=>window.copied),/译Beta/);assert.doesNotMatch(await page.evaluate(()=>window.copied),/Alpha|Final/);
  await right.getByRole('button',{name:/另存译文|Save translation/i}).click();
  const chapter=await page.evaluate(()=>({out:saved.text,copied,parts:calls.at(-1).parts}));
  assert.equal(chapter.out,chapter.copied);assert.match(chapter.out,/\$E = mc\^2\$/);
  assert.match(chapter.out,/\$alpha\$\$beta\$/);
  assert.match(chapter.out,/\[\^memo\]: Archive note\n    continuation line\./);
  assert.match(await right.locator('ol li').innerText(),/Archive note[\s\S]*continuation line/);
  assert.equal(await right.locator('.rt-section a, .rt-section img').count(),0);
  assert.match(chapter.parts.join(' '),/afterwards/);assert.doesNotMatch(chapter.parts.join(' '),/alpha|beta|Archive note|continuation line/);
  assert.match(chapter.out,/\[manual\]: \.\/manual\.md/);assert.match(chapter.out,/\[sample\]: \.\/figure\.png/);assert.doesNotMatch(chapter.out,/unrelated\.txt/);
  assert.match(chapter.parts.join(' '),/costs \$10 before/);assert.doesNotMatch(chapter.parts.join(' '),/mc\^2|manual\.md|figure\.png/);
  await page.locator('#comparisonClose').click();
  const para=page.locator('#markdownContent p').filter({hasText:'Sample English'}).first();
  const select=async()=>{
    await para.evaluate(p=>{const range=document.createRange();range.setStart(p.firstChild,0);range.setEnd(p.firstChild,6);const sel=getSelection();sel.removeAllRanges();sel.addRange(range);
      p.dispatchEvent(new MouseEvent('contextmenu',{bubbles:true,cancelable:true,clientX:420,clientY:280}));});
    await page.locator('#readingMarkMenu').getByRole('button',{name:/翻译选中|Translate selection/i}).click();
    assert.equal(await page.locator('dialog.rt-dialog[open]').count(),0);
  };
  await select();await right.getByRole('button',{name:/复制译文|Copy translation/i}).click();
  assert.equal(await page.evaluate(()=>window.copied),'译Sample');assert.equal(await page.evaluate(()=>calls.length),before+2);
  await page.evaluate(()=>window.hold=true);await select();
  await page.waitForFunction(()=>window.finish);assert.deepEqual(await page.evaluate(()=>calls.at(-1).parts),['Sample']);
  await page.locator('#comparisonClose').click();await page.evaluate(()=>finish());
  assert.equal(await page.locator('#comparisonPane').isVisible(),false);assert.equal(await page.evaluate(()=>cancels[0]),await page.evaluate(()=>calls.at(-1).requestId));
  const sent=await page.evaluate(()=>calls.length);
  await page.evaluate(()=>{quilliteMarkdown.getAISettings=async()=>({hasApiKey:false});});await select();
  await right.getByRole('button',{name:/配置 AI 服务|Configure AI service/i}).waitFor();
  assert.equal(await page.evaluate(()=>calls.length),sent);
  await page.evaluate(()=>{quilliteMarkdown.getAISettings=()=>new Promise(r=>window.finishSetup=()=>r({provider:'custom',baseUrl:'https://example.invalid/v1',model:'test-model',hasApiKey:true}));});await select();
  await page.waitForFunction(()=>window.finishSetup);await page.locator('#comparisonClose').click();await page.evaluate(()=>finishSetup());
  assert.equal(await page.evaluate(()=>calls.length),sent);assert.equal(await page.locator('#comparisonPane').isVisible(),false);
  assert.deepEqual(errors,[]);console.log('PASS translation: one-click selection, inline missing settings, stale setup cancellation, chapter/full consent, retry, save, immutable original');
}finally{await browser?.close();await server.close();}
