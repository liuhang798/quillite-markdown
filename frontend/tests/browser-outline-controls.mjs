import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import {createServer} from 'vite';
const {chromium} = createRequire(import.meta.url)(process.env.PLAYWRIGHT_MODULE || 'playwright');
const server = await createServer({
  root: fileURLToPath(new URL('..', import.meta.url)),
  server: {host: '127.0.0.1', port: 0, watch: null, hmr: false}, logLevel: 'error',
  plugins: [{name: 'outline-controls-test', enforce: 'pre', transform(code, id) {
    if (id.replaceAll('\\', '/').endsWith('/src/renderer.js')) return code +
      '\nwindow.outlineAudit={open:displayDocument,toggle:toggleEditor,layout:setEditorLayout,color:setColorMode,language:setLanguage,state};';
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
  const frame = page.frames().find(f => f !== page.mainFrame());
  await frame.evaluate(async () => {
    await import('/src/main.js');
    window.quilliteMarkdown.canEditFile = async () => true;
    window.quilliteMarkdown.reportErrorLog = async () => {};
    outlineAudit.open({path: 'outline.md', name: 'outline.md', directory: '.', content: '# Test\n\n## Section\n\nBody'});
    await outlineAudit.toggle(true);
  });
  let cases = 0;
  for (const width of [1450, 1121, 1120, 1000, 800]) {
    await page.setViewportSize({width, height: 700});
    for (const color of ['light', 'dark']) for (const language of ['zh-CN', 'en']) for (const layout of ['editor-only', 'editor-left', 'preview-left']) {
      await frame.evaluate(({layout, language}) => {
        outlineAudit.layout(layout, true); outlineAudit.language(language, true, false);
      }, {layout, language});
      await frame.evaluate(color=>outlineAudit.color(color),color);
      await page.waitForTimeout(250);
      const result = await frame.evaluate(() => {
        const trigger = document.querySelector('#compactTocButton');
        const a = trigger.getBoundingClientRect();
        const hit = el => { const r=el.getBoundingClientRect(); return el.contains(document.elementFromPoint(r.x+r.width/2,r.y+r.height/2)); };
        const controls = [...document.querySelectorAll('.editor-header button, .editor-header [role="tab"], .preview-pane-actions button')]
          .filter(el => el.getBoundingClientRect().width && el.getBoundingClientRect().height);
        return {triggerHit:hit(trigger), covered:controls.filter(el => { const b=el.getBoundingClientRect(); return a.left<b.right && a.right>b.left && a.top<b.bottom && a.bottom>b.top; }).map(el=>el.id),
          historyHit:hit(document.querySelector('#documentHistoryButton')),
          closeHit:outlineAudit.state.editorLayout==='editor-only'||hit(document.querySelector('#hideLivePreviewButton'))};
      });
      assert.deepEqual(result, {triggerHit:true,covered:[],historyHit:true,closeHit:true}, `${width}/${color}/${language}/${layout}: ${JSON.stringify(result)}`);
      const editorWidth = await frame.locator('.editor-workspace').evaluate(el=>el.getBoundingClientRect().width);
      await frame.locator('#compactTocButton').click();
      await page.waitForTimeout(230);
      assert.equal(await frame.locator('#compactTocButton').getAttribute('aria-expanded'), 'true');
      assert.equal(await frame.locator('.editor-workspace').evaluate(el=>el.getBoundingClientRect().width), editorWidth);
      await frame.locator('#compactTocButton').click();
      await page.waitForTimeout(230);
      if (layout !== 'editor-only') {
        await frame.locator('#hideLivePreviewButton').click();
        assert.equal(await frame.evaluate(()=>outlineAudit.state.editorLayout), 'editor-only');
        await frame.locator('#restoreLivePreviewButton').click();
        assert.equal(await frame.evaluate(()=>outlineAudit.state.editorLayout), layout);
      }
      cases++;
    }
  }
  if (process.env.AUDIT_OUTPUT) {
    await page.setViewportSize({width:1450,height:900});
    for (const layout of ['editor-only','editor-left','preview-left']) {
      await frame.evaluate(layout=>{outlineAudit.layout(layout,true);outlineAudit.language('zh-CN',true,false);},layout);
      await page.waitForTimeout(300);
      await page.screenshot({path:`${process.env.AUDIT_OUTPUT}/outline-${layout}.png`});
    }
  }
  assert.deepEqual(errors, []);
  console.log(`PASS ${cases} outline/header layouts: hit targets, drawer stability, preview close/restore`);
} finally {
  await browser?.close(); await server.close();
}
