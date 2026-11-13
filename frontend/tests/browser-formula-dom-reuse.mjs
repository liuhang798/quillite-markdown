// Isolated real editor regression: unchanged equations must not rebuild DOM on
// unrelated input, but retained buttons still act on current source ranges.
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';

const pw = createRequire(import.meta.url)(process.env.PLAYWRIGHT_MODULE || 'playwright');
const engine = process.env.FORMULA_REUSE_BROWSER || 'chromium';
const count = 96;
const intro = '# Formula reuse regression';
const equations = Array.from({length:count}, (_, index) => '$x_{' + index + '}=y^2$').join(' ');
const source = intro + '\n\n' + equations + '\n';
const server = await createServer({
  root: fileURLToPath(new URL('..', import.meta.url)),
  server: {host:'127.0.0.1', port:0, watch:null, hmr:false},
  logLevel: 'error',
  plugins: [{
    name:'formula-reuse-test-only', enforce:'pre',
    transform(code, id) {
      if (!id.replaceAll('\\', '/').endsWith('/src/renderer.js')) return;
      return code + `
window.formulaReuseAudit = {
  text:()=>codeEditor.state.doc.toString(),
  insert:position=>{
    const start=performance.now();
    codeEditor.dispatch({changes:{from:position,insert:'x'},selection:{anchor:position+1},userEvent:'input.type'});
    return performance.now()-start;
  },
};`;
    }
  }]
});
let browser;
try {
  await server.listen();
  browser = await pw[engine].launch({headless:true, ...(engine==='chromium' && process.env.BROWSER_EXECUTABLE ? {executablePath:process.env.BROWSER_EXECUTABLE} : {})});
  const page = await browser.newPage({viewport:{width:1440,height:1000}});
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.route('**/*', route => new URL(route.request().url()).hostname === '127.0.0.1' ? route.continue() : route.abort());
  await page.addInitScript(() => {
    localStorage.setItem('language','zh-CN');
    localStorage.setItem('editorPresentation','live');
    localStorage.setItem('editorLayout','editor-only');
  });
  await page.goto(server.resolvedUrls.local[0]);
  await page.waitForFunction(()=>window.formulaReuseAudit && window.quilliteMarkdown && document.querySelector('#fileList')?.childElementCount);
  await page.evaluate(content => Object.assign(window.quilliteMarkdown, {
    openFile: async () => ({path:'/isolated/formula-reuse.md',directory:'/isolated',name:'formula-reuse.md',content,revision:'a'.repeat(64)}),
    canEditFile: async () => true,
    reportErrorLog: async () => {},
  }), source);
  await page.locator('#openFileButton').click();
  await page.locator('#markdownContent .katex').first().waitFor();
  await page.locator('#editButton').click();
  const editor = page.locator('#markdownEditor > .cm-editor');
  await editor.waitFor();
  if (!await editor.evaluate(node=>node.classList.contains('cm-live-preview'))) {
    await page.locator('[data-editor-presentation="live"]').click();
  }
  const widgets = editor.locator('.cm-formula-render');
  await widgets.first().waitFor();
  assert.equal(await widgets.count(), count);
  const metrics = await page.evaluate(({offset,count}) => {
    const nodes = () => [...document.querySelectorAll('#markdownEditor .cm-formula-render')];
    const original = nodes();
    const times = [];
    for (let i=0; i<count; i++) times.push(formulaReuseAudit.insert(offset+i));
    const after = nodes();
    return {preserved:original.filter((node,index)=>node===after[index]).length,
      total:after.length,medianMs:times.slice().sort((a,b)=>a-b)[Math.floor(times.length/2)]};
  }, {offset:intro.length,count:8});
  console.log(JSON.stringify({engine,...metrics}));
  assert.equal(metrics.total,count);
  assert.equal(metrics.preserved,count,'outside typing does not recreate unchanged equation nodes');
  const updated = intro + 'xxxxxxxx\n\n' + equations + '\n';
  assert.equal(await page.evaluate(()=>formulaReuseAudit.text()), updated);

  // Even after shifted offsets and a refresh, the retained first card acts on
  // its own current equation and preserves the authoritative undo history.
  await widgets.first().focus();
  await page.keyboard.press('Delete');
  assert.equal(await page.evaluate(()=>formulaReuseAudit.text()),updated.replace('$x_{0}=y^2$',''));
  await editor.locator(':scope > .cm-scroller > .cm-content').focus();
  await page.keyboard.press(process.platform === 'darwin' ? 'Meta+z' : 'Control+z');
  assert.equal(await page.evaluate(()=>formulaReuseAudit.text()),updated);
  assert.deepEqual(errors,[]);
  console.log(`PASS ${engine}: unchanged formula DOM reused and shifted actions/undo intact`);
} finally {
  await browser?.close();
  server.httpServer.closeAllConnections?.();
  await server.close();
}
