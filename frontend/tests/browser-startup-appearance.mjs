// Parser-blocking appearance and actual app handoff; synthetic documents only.
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';

const pw = createRequire(import.meta.url)(process.env.PLAYWRIGHT_MODULE || 'playwright');
const engine = process.env.APPEARANCE_BROWSER || 'chromium';
const root = process.env.AUDIT_DIST || fileURLToPath(new URL('..', import.meta.url));
const server = await createServer({ root, ...(process.env.AUDIT_DIST ? {configFile:false} : {}),
  server:{ host:'127.0.0.1', port:0, watch:null, hmr:false }, logLevel:'error' });
const cases = [
  {name:'saved-dark-linux', saved:{colorMode:'dark'}, mode:'dark', platform:'Linux x86_64'},
  {name:'saved-light-linux', saved:{colorMode:'light'}, mode:'light', platform:'Linux x86_64'},
  {name:'legacy-dark-linux', saved:{theme:'classic-dark'}, mode:'dark', platform:'Linux x86_64'},
  {name:'legacy-ocean-linux', saved:{theme:'deep-ocean'}, mode:'dark', platform:'Linux x86_64'},
  {name:'invalid-new-mode', saved:{theme:'classic-dark',colorMode:'invalid'}, mode:'light', platform:'Linux x86_64'},
  {name:'mac-system-dark', saved:{colorMode:'light'}, mode:'dark', platform:'MacIntel', system:'dark'},
  {name:'mac-system-light', saved:{colorMode:'dark'}, mode:'light', platform:'MacIntel', system:'light'},
  {name:'blocked-storage', saved:{}, mode:'light', platform:'Linux x86_64', blocked:true},
];
const background = {dark:'rgb(21, 23, 22)', light:'rgb(247, 247, 246)'};
let browser;
try {
  await server.listen();
  const origin = new URL(server.resolvedUrls.local[0]).origin;
  browser = await pw[engine].launch({headless:true,
    ...(engine === 'chromium' && process.env.BROWSER_EXECUTABLE ? {executablePath:process.env.BROWSER_EXECUTABLE} : {})});
  for (const item of cases.filter(item => !process.env.AUDIT_CASE || item.name === process.env.AUDIT_CASE)) {
    const page = await browser.newPage({viewport:{width:1200,height:800}});
    page.setDefaultTimeout(15000);
    await page.emulateMedia({colorScheme:item.system || 'light'});
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    let release;
    const gate = new Promise(resolve => {release = resolve;});
    try {
      await page.addInitScript(item => {
        Object.defineProperty(navigator, 'platform', {configurable:true,get:() => item.platform});
        for (const [key,value] of Object.entries(item.saved)) localStorage.setItem(key,value);
        if (item.blocked) Object.defineProperty(Storage.prototype, 'getItem', {
          configurable:true,value(){throw new DOMException('Test: storage is blocked','SecurityError');}
        });
        const doc = (name, text) => ({path:'/appearance-test/' + name + '.md', name:name + '.md',
          directory:'/appearance-test', content:'# ' + text, revision:'a'.repeat(64)});
        window.appearanceAudit = {frames:[],themes:[]};
        const sample = () => {
          if (document.body) {
            const root = document.documentElement, style = getComputedStyle(root);
            appearanceAudit.frames.push({mode:root.dataset.colorMode, bg:style.backgroundColor,
              body:getComputedStyle(document.body).backgroundColor, scheme:style.colorScheme,
              appReady:Boolean(window.quilliteMarkdown)});
          }
          requestAnimationFrame(sample);
        };
        requestAnimationFrame(sample);
        Object.defineProperty(window,'quilliteMarkdown',{configurable:true,set(bridge){
          Object.defineProperty(window,'quilliteMarkdown',{value:bridge,configurable:true});
          bridge.getInitialFile = async () => doc('startup','Initial dark document');
          bridge.openFile = async () => doc('opened','Opened without color reset');
          bridge.getStartupMode = async () => 'preview';
          bridge.setTheme = async dark => {appearanceAudit.themes.push(dark);};
          bridge.reportErrorLog = async () => {};
        }});
      },item);
      await page.route('**/*', async route => {
        const url = new URL(route.request().url());
        if (url.origin !== origin) return route.abort();
        // Hold the real entry, including the stylesheet import in development.
        // This reproduces a slow device without replacing the product HTML.
        if (url.pathname === '/src/main.js' || /^\/assets\/index-[^/]+\.js$/.test(url.pathname)) await gate;
        await route.continue();
      });
      await page.goto(origin,{waitUntil:'commit'});
      await page.locator('body').waitFor({state:'attached'});
      await page.waitForFunction(() => appearanceAudit.frames.length >= 6);
      const early = await page.evaluate(() => appearanceAudit.frames);
      for (const frame of early) {
        assert.equal(frame.appReady,false,`${item.name}: test must observe before main entry`);
        assert.equal(frame.mode,item.mode,`${item.name}: wrong pre-main mode`);
        assert.equal(frame.bg,background[item.mode],`${item.name}: wrong pre-main canvas`);
        assert.ok(frame.body === background[item.mode] || frame.body === 'rgba(0, 0, 0, 0)',`${item.name}: contrasting body ${frame.body}`);
        assert.equal(frame.scheme,item.mode,`${item.name}: native controls use wrong scheme`);
      }
      // WebKit waits for document.fonts.ready during screenshots, which cannot
      // settle while the intentionally gated module still blocks page load.
      if (process.env.AUDIT_OUTPUT && engine !== 'webkit') await page.screenshot({path:`${process.env.AUDIT_OUTPUT}/${engine}-${item.name}-before-main.png`});
      if (!item.blocked) {
        release();
        await page.locator('#markdownContent').getByRole('heading',{name:'Initial dark document',exact:true}).waitFor();
        await page.locator('#openFileButton').click();
        await page.locator('#markdownContent').getByRole('heading',{name:'Opened without color reset',exact:true}).waitFor();
        await page.waitForTimeout(120);
        const result = await page.evaluate(() => appearanceAudit);
        for (const frame of result.frames) {
          assert.equal(frame.mode,item.mode,`${item.name}: theme changed during main/document handoff`);
          assert.equal(frame.bg,background[item.mode],`${item.name}: canvas changed during main/document handoff`);
        }
        assert.ok(result.themes.length > 0);
        assert.ok(result.themes.every(dark => dark === (item.mode === 'dark')),`${item.name}: native theme calls disagree`);
        if (process.env.AUDIT_OUTPUT) await page.screenshot({path:`${process.env.AUDIT_OUTPUT}/${engine}-${item.name}-initialized.png`});
      }
      // Blocked storage verifies the prepaint fallback; the existing broader
      // application still depends on localStorage and is not exercised here.
      assert.deepEqual(errors,[],item.name);
      console.log(`PASS ${engine} ${item.name}: pre-main canvas${item.blocked ? ' fallback' : ', app and document handoff'}`);
    } finally {
      await page.close();
      release();
    }
  }
} finally {
  await browser?.close();
  server.httpServer?.closeAllConnections?.();
  await server.close();
}
