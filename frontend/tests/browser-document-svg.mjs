import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import {createServer} from 'vite';
const pw = createRequire(import.meta.url)(process.env.PLAYWRIGHT_MODULE || 'playwright');
const engine = process.env.SVG_BROWSER || 'chromium';
const content = readFileSync(new URL('./fixtures/ssh-nfs-svg.md', import.meta.url), 'utf8');
const server = await createServer({root:process.env.AUDIT_DIST || fileURLToPath(new URL('..',import.meta.url)), ...(process.env.AUDIT_DIST ? {configFile:false} : {}), server:{host:'127.0.0.1',port:0,hmr:false,watch:null}, logLevel:'error'});
let browser;
try {
  await server.listen();
  browser = await pw[engine].launch({headless:true,...(engine === 'chromium' && process.env.BROWSER_EXECUTABLE ? {executablePath:process.env.BROWSER_EXECUTABLE} : {})});
  const page = await browser.newPage({viewport:{width:2000,height:1100}});
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.addInitScript(content => {
    localStorage.setItem('editorLayout','editor-only');
    localStorage.setItem('editorPresentation','instant');
    Object.defineProperty(window,'quilliteMarkdown',{configurable:true,set(bridge){
      Object.defineProperty(window,'quilliteMarkdown',{value:bridge});
      bridge.getInitialFile = async () => ({path:'/sample/topology.md', directory:'/sample', name:'topology.md', content,revision:'a'.repeat(64)});
      bridge.canEditFile = async () => true;
    }});
  },content);
  await page.goto(server.resolvedUrls.local[0]);
  async function check(selector, narrow = false) {
    const el = page.locator(selector);
    await el.waitFor({state:'visible',timeout:10000});
    const {width,height} = await el.boundingBox();
    console.log(engine,selector,width,height);
    assert.ok(narrow ? width < 680 && width > 150 : Math.abs(width-680)<1);
    assert.ok(Math.abs(width-2*height)<2);
    const details = await el.evaluate(async el => {
      let svg = el;
      if (el.localName === 'img') {
        await el.decode();
        svg = new DOMParser().parseFromString(decodeURIComponent(el.src.split(',').slice(1).join(',')), 'image/svg+xml').documentElement;
      }
      return [svg.querySelectorAll('rect').length,svg.querySelectorAll('[marker-end="url(#arrow)"]').length,
        svg.querySelector('marker')?.id,svg.querySelector('text:last-child')?.textContent, svg.lastElementChild?.getAttribute('fill')];
    });
    assert.deepEqual(details,[4,3,'arrow','关键：NFS 服务器是桥接 VM 的 ens36，不是 Windows PC。','#993C1D']);
  }
  const reader = '#markdownContent svg[viewBox="0 0 680 340"]';
  await check(reader);
  assert.equal(await page.locator(reader).evaluate(e=>getComputedStyle(e).stroke),'none');
  const icon = await page.locator('#openFileButton svg').boundingBox();
  assert.ok(icon.width>10 && icon.width<=24);
  const narrow = await page.addStyleTag({content:'#markdownContent { width: 320px; max-width: 320px; }'});
  await check(reader,true);
  await narrow.evaluate(el => el.remove());
  await page.locator('#editButton').click();
  await check('#markdownEditor img.cm-document-svg');
  await page.locator('#restoreLivePreviewButton').click();
  const split = '#editorPreviewContent svg[viewBox="0 0 680 340"]';
  await page.addStyleTag({content:'#editorPreviewContent { width: 360px; max-width: 360px; }'});
  await check(split,true);
  assert.deepEqual(errors,[]);
} finally {await browser?.close(); server.httpServer?.closeAllConnections?.(); await server.close();}
