import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import {createServer} from 'vite';
const {chromium} = createRequire(import.meta.url)(process.env.PLAYWRIGHT_MODULE || 'playwright');
const server = await createServer({
  root: fileURLToPath(new URL('..', import.meta.url)),
  server: {host: '127.0.0.1', port: 0, watch: null, hmr: false}, logLevel: 'error',
  plugins: [{name: 'reading-position-test', enforce: 'pre', transform(code, id) {
    if (id.replaceAll('\\', '/').endsWith('/src/renderer.js'))
      return code + '\nwindow.positionAudit={open:displayDocument,toggle:toggleEditor,presentation:setEditorPresentation,state,heading:scrollReaderToHeading,editor:()=>codeEditor,capture:()=>captureEditorPosition(codeEditor),read:()=>captureReadingPosition(document.querySelector(".reader-pane"),els.content),outline:setCompactTocOpen,color:setColorMode,undo:()=>undo(codeEditor),goto(line){codeEditor.dispatch({effects:EditorView.scrollIntoView(codeEditor.state.doc.line(line).from,{y:"start",yMargin:28})});}};';
  }}]
});
let browser;
try {
  await server.listen();
  browser = await chromium.launch({headless: true, executablePath: process.env.BROWSER_EXECUTABLE || undefined});
  const page = await browser.newPage({viewport: {width: 1450, height: 900}});
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.route('**/*', route => new URL(route.request().url()).hostname === '127.0.0.1' ? route.continue() : route.abort());
  await page.goto(server.resolvedUrls.local[0] + 'tests/fixtures/app-drag-audit.html');
  const frame = page.frames().find(frame => frame !== page.mainFrame());
  await frame.evaluate(async () => {
    await import('/src/main.js');
    window.quilliteMarkdown.canEditFile = async () => true;
    window.quilliteMarkdown.reportErrorLog = async () => {};
    positionAudit.open({path: 'position.md', name: 'position.md', directory: '.', content:
      Array.from({length: 200}, (_, i) => `## Section ${i}\n\nParagraph ${i}. Reading position content.\n\n`).join('')});
  });
  const settle = () => page.waitForTimeout(450);
  const read = section => frame.evaluate(section => {
    const r = document.querySelector('.reader-pane');
    const h = [...document.querySelectorAll('#markdownContent h2')].find(e => e.textContent === `Section ${section}`);
    return {scroll: r.scrollTop, offset: h?.getBoundingClientRect().top - r.getBoundingClientRect().top};
  }, section);
  const gotoReader = section => frame.evaluate(section => positionAudit.heading([...document.querySelectorAll('#markdownContent h2')].find(e => e.textContent === `Section ${section}`), 'instant'), section);
  const editor = () => frame.evaluate(() => {const v=positionAudit.editor(), p=positionAudit.capture(); return {...p,text:v.state.doc.line(p.line).text,selection:v.state.selection.main.head};});
  await settle();
  for (const mode of ['live', 'source', 'live']) {
    await frame.evaluate(mode => positionAudit.presentation(mode), mode);
    await gotoReader(80); await settle();
    const before = await read(80);
    await frame.evaluate(() => positionAudit.toggle(true)); await settle();
    const entered = await editor();
    const targetOffset = await frame.evaluate(() => {const v=positionAudit.editor();return v.documentTop+v.lineBlockAt(v.state.doc.line(321).from).top-v.scrollDOM.getBoundingClientRect().top;});
    assert.ok(entered.line >= 319 && entered.line <= 321, JSON.stringify(entered));
    assert.ok(Math.abs(targetOffset - before.offset) < 4, `entry offset ${targetOffset} versus ${before.offset}`);
    // Move the viewport, not the cursor: exit follows the new viewport.
    await frame.evaluate(() => {
      positionAudit.editor().scrollDOM.dispatchEvent(new WheelEvent('wheel', {bubbles:true}));
      positionAudit.goto(481);
    }); await settle();
    const leaving = await editor();
    assert.ok(leaving.line >= 479 && leaving.line <= 481, JSON.stringify(leaving));
    await frame.evaluate(() => positionAudit.toggle(false)); await settle();
    const returned = await frame.evaluate(() => positionAudit.read());
    assert.equal(returned.line, leaving.line, JSON.stringify({leaving,returned}));
    assert.ok(Math.abs(returned.offset - leaving.offset) < 4, `exit ${JSON.stringify(returned)}`);
  }
  const stable = await read(120);
  await frame.evaluate(() => document.querySelector('#markdownContent').firstElementChild.style.paddingBottom = '320px');
  await settle();
  assert.ok(Math.abs((await read(120)).offset - stable.offset) < 3, 'late resource layout preserves anchor');
  await frame.evaluate(() => {
    const r = document.querySelector('.reader-pane');
    r.dispatchEvent(new WheelEvent('wheel', {bubbles: true, deltaY: 300}));
    r.scrollTo({top: 500, behavior: 'instant'});
    document.querySelector('#markdownContent').firstElementChild.style.paddingBottom = '450px';
  }); await settle();
  assert.ok((await read(120)).scroll < 1000, 'user navigation cancels restoration');
  await gotoReader(80);
  await frame.evaluate(() => positionAudit.toggle(true)); await settle();
  assert.equal(await frame.evaluate(() => positionAudit.state.compactTocOpen), false);
  const width = await frame.locator('#editorView').evaluate(el => el.getBoundingClientRect().width);
  for (const color of ['light', 'dark']) {
    await frame.evaluate(color => {positionAudit.color(color);positionAudit.outline(true);}, color); await settle();
    assert.equal(await frame.locator('#editorView').evaluate(el => el.getBoundingClientRect().width), width);
    if (process.env.AUDIT_OUTPUT) await page.screenshot({path:`${process.env.AUDIT_OUTPUT}/editing-outline-${color}.png`});
    await frame.locator('#tocSearchInput').fill('Section 150');
    await frame.locator('#toc a').filter({hasText: /^Section 150$/}).click(); await settle();
    assert.equal(await frame.evaluate(() => positionAudit.state.compactTocOpen), false);
    assert.equal((await editor()).text, '## Section 150');
    await frame.locator('#tocSearchInput').evaluate(el => {el.value='';el.dispatchEvent(new Event('input',{bubbles:true}));});
  }
  const original = await frame.evaluate(() => positionAudit.editor().state.doc.toString());
  await frame.evaluate(() => {const v=positionAudit.editor();v.dispatch({changes:{from:v.state.doc.length,insert:'\nUncommitted addition'}});});
  await frame.evaluate(() => positionAudit.toggle(false)); await settle();
  await frame.evaluate(() => positionAudit.toggle(true)); await settle();
  assert.equal(await frame.evaluate(() => positionAudit.state.dirty), true);
  await frame.evaluate(() => positionAudit.undo());
  assert.equal(await frame.evaluate(() => positionAudit.editor().state.doc.toString()), original);
  // Headings after differently sized media must map by source, not percentages.
  await frame.evaluate(() => {
    const code = '```text\n' + Array.from({length:60},(_,i)=>`code ${i}`).join('\n') + '\n```';
    const parts = Array.from({length:18},(_,i)=>`## Mixed ${i}\n\n${code}\n\n$$\n\\frac{a}{b}=c\n$$\n\n| A | B |\n|---|---|\n| One | Two |\n\n<img src="missing.png" width="300" height="180">\n\nAfter media ${i}\n\n`);
    positionAudit.open({path:'mixed.md',name:'mixed.md',directory:'.',content:parts.join('')});
  }); await settle();
  for (const mode of ['live','source']) {
    await frame.evaluate(mode => {
      positionAudit.presentation(mode);
      positionAudit.heading([...document.querySelectorAll('#markdownContent h2')].find(el=>el.textContent==='Mixed 12'),'instant');
    },mode); await settle();
    const target = await frame.evaluate(() => positionAudit.read());
    await frame.evaluate(() => positionAudit.toggle(true)); await settle();
    const offset = await frame.evaluate(line => {
      const v=positionAudit.editor();return v.documentTop+v.lineBlockAt(v.state.doc.line(line).from).top-v.scrollDOM.getBoundingClientRect().top;
    },target.line);
    assert.ok(Math.abs(offset-target.offset)<5, `mixed ${mode} offset ${offset} versus ${target.offset}`);
    // Overlay on a narrow screen also must not reflow the editor.
    await page.setViewportSize({width:1000,height:800}); await settle();
    const widthBefore = await frame.locator('#editorView').evaluate(el=>el.clientWidth);
    await frame.evaluate(()=>positionAudit.outline(true)); await settle();
    assert.equal(await frame.locator('#editorView').evaluate(el=>el.clientWidth),widthBefore);
    await frame.locator('#toc a').filter({hasText:/^Mixed 14$/}).click(); await settle();
    assert.ok((await editor()).line>target.line,'narrow outline jumps to the later chapter');
    await frame.evaluate(()=>positionAudit.toggle(false)); await settle();
    await page.setViewportSize({width:1450,height:900}); await settle();
  }
  await frame.evaluate(() => positionAudit.open({path:'other.md',name:'other.md',directory:'.',content:'# Other\n\nShort document.'}));
  await settle();
  assert.equal((await read(120)).scroll, 0, 'new documents still start at top');
  assert.deepEqual(errors, []);
  console.log('PASS bidirectional position: live/source/cache, moved viewport, late layout, cancellation, outline light/dark, undo and document isolation');
} finally { await browser?.close(); await server.close(); }
